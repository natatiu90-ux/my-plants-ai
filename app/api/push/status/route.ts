import { NextResponse } from "next/server";
import { getPushConfigDiagnostics } from "@/lib/push-server";
import { createSupabaseAdminClient, getUserFromRequest } from "@/lib/supabase/server";

function endpointSuffix(endpoint?: string | null) {
  if (!endpoint) return null;
  return endpoint.slice(-12);
}

export async function POST(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { endpoint?: string | null } | null;
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : null;
  const config = getPushConfigDiagnostics();
  if (!config.ok) {
    console.info("push_config_missing", { missing: config.missing });
  }
  if (
    config.missing.includes("NEXT_PUBLIC_SUPABASE_URL") ||
    config.missing.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
    config.missing.includes("SUPABASE_SERVICE_ROLE_KEY")
  ) {
    return NextResponse.json({ ok: false, error: "push_config_missing", missingConfig: config.missing }, { status: 503 });
  }

  const supabase = createSupabaseAdminClient();
  const settingsQuery = supabase
    .from("user_settings")
    .select("care_notifications_enabled")
    .eq("user_id", user.id)
    .maybeSingle();

  const subscriptionQuery = endpoint
    ? supabase
      .from("push_subscriptions")
      .select("id, updated_at")
      .eq("user_id", user.id)
      .eq("endpoint", endpoint)
      .is("disabled_at", null)
      .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [settingsResult, subscriptionResult] = await Promise.all([settingsQuery, subscriptionQuery]);
  if (settingsResult.error) {
    console.info("push_status_failed", { stage: "load_settings", message: settingsResult.error.message });
    return NextResponse.json({ ok: false, error: "settings_load_failed" }, { status: 500 });
  }
  if (subscriptionResult.error) {
    console.info("push_status_failed", {
      stage: "load_subscription",
      endpointSuffix: endpointSuffix(endpoint),
      message: subscriptionResult.error.message
    });
    return NextResponse.json({ ok: false, error: "subscription_load_failed" }, { status: 500 });
  }

  const subscriptionPersisted = Boolean(subscriptionResult.data?.id);
  const careNotificationsEnabled = Boolean(settingsResult.data?.care_notifications_enabled);
  console.info("push_status_checked", {
    userId: user.id,
    endpointSuffix: endpointSuffix(endpoint),
    subscriptionPersisted,
    careNotificationsEnabled,
    missingConfig: config.missing
  });

  return NextResponse.json({
    ok: true,
    subscriptionPersisted,
    careNotificationsEnabled,
    missingConfig: config.missing
  });
}
