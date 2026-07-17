import { NextResponse } from "next/server";
import { getPushConfigDiagnostics } from "@/lib/push-server";
import { createSupabaseAdminClient, getUserFromRequest } from "@/lib/supabase/server";

type SubscriptionPayload = {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

function endpointSuffix(endpoint?: string | null) {
  if (!endpoint) return null;
  return endpoint.slice(-12);
}

export async function POST(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  console.info("push_subscription_user_id", { userId: user.id });

  const body = await request.json().catch(() => null) as {
    subscription?: SubscriptionPayload;
    timezone?: string;
    locale?: string;
  } | null;
  const subscription = body?.subscription;
  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys.auth) {
    console.info("push_subscription_failed", { reason: "invalid_subscription" });
    return NextResponse.json({ ok: false, error: "invalid_subscription" }, { status: 400 });
  }

  const config = getPushConfigDiagnostics();
  if (!config.ok) {
    console.info("push_config_missing", { missing: config.missing });
    return NextResponse.json({ ok: false, error: "push_config_missing", missingConfig: config.missing }, { status: 503 });
  }

  const supabase = createSupabaseAdminClient();
  const record = {
    user_id: user.id,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    timezone: body?.timezone ?? null,
    locale: body?.locale ?? null,
    disabled_at: null,
    failure_count: 0
  };

  const { data: existingSubscription, error: existingError } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("user_id", user.id)
    .eq("endpoint", subscription.endpoint)
    .maybeSingle();

  if (existingError) {
    console.info("push_subscription_failed", {
      stage: "load_existing_subscription",
      endpointSuffix: endpointSuffix(subscription.endpoint),
      code: existingError.code,
      message: existingError.message
    });
    return NextResponse.json({ ok: false, error: "subscription_lookup_failed" }, { status: 500 });
  }

  const saveResult = existingSubscription?.id
    ? await supabase
      .from("push_subscriptions")
      .update(record)
      .eq("id", existingSubscription.id)
    : await supabase
      .from("push_subscriptions")
      .insert(record);

  if (saveResult.error?.code === "23505") {
    const retryUpdate = await supabase
      .from("push_subscriptions")
      .update(record)
      .eq("user_id", user.id)
      .eq("endpoint", subscription.endpoint);
    if (retryUpdate.error) {
      console.info("push_subscription_failed", {
        stage: "retry_update_subscription",
        endpointSuffix: endpointSuffix(subscription.endpoint),
        code: retryUpdate.error.code,
        message: retryUpdate.error.message
      });
      return NextResponse.json({ ok: false, error: "subscription_save_failed" }, { status: 500 });
    }
  } else if (saveResult.error) {
    console.info("push_subscription_failed", {
      stage: "save_subscription",
      endpointSuffix: endpointSuffix(subscription.endpoint),
      code: saveResult.error.code,
      message: saveResult.error.message,
      details: saveResult.error.details,
      hint: saveResult.error.hint
    });
    return NextResponse.json({ ok: false, error: "subscription_save_failed" }, { status: 500 });
  }

  const settingsResult = await supabase
    .from("user_settings")
    .upsert(
      {
        user_id: user.id,
        care_notifications_enabled: true,
        timezone: body?.timezone ?? null,
        notification_locale: body?.locale ?? null
      },
      { onConflict: "user_id" }
    );
  if (settingsResult.error) {
    console.info("push_subscription_failed", {
      stage: "save_preferences",
      code: settingsResult.error.code,
      message: settingsResult.error.message
    });
    return NextResponse.json({ ok: false, error: "settings_save_failed" }, { status: 500 });
  }

  console.info("push_subscription_persisted", { userId: user.id, endpointSuffix: endpointSuffix(subscription.endpoint) });
  return NextResponse.json({ ok: true, subscriptionPersisted: true });
}
