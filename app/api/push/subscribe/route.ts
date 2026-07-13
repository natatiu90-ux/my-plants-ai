import { NextResponse } from "next/server";
import { createSupabaseAdminClient, getUserFromRequest } from "@/lib/supabase/server";

type SubscriptionPayload = {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

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

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      timezone: body?.timezone ?? null,
      locale: body?.locale ?? null,
      disabled_at: null,
      failure_count: 0
    },
    { onConflict: "endpoint" }
  );
  if (error) {
    console.info("push_subscription_failed", { reason: error.message });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await supabase
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

  console.info("push_subscription_created", { userId: user.id });
  return NextResponse.json({ ok: true });
}
