import { NextResponse } from "next/server";
import { getPushConfigDiagnostics, sendCarePush, pushErrorCode, isPermanentPushError } from "@/lib/push-server";
import { createSupabaseAdminClient, getUserFromRequest } from "@/lib/supabase/server";

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function POST(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const config = getPushConfigDiagnostics();
  if (!config.ok) {
    console.info("push_config_missing", { missing: config.missing });
    return NextResponse.json({ ok: false, error: "push_config_missing", missingConfig: config.missing }, { status: 503 });
  }

  const body = await request.json().catch(() => null) as { locale?: string } | null;
  const supabase = createSupabaseAdminClient();
  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", user.id)
    .is("disabled_at", null);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!subscriptions?.length) {
    console.info("push_test_rejected", { userId: user.id, reason: "no_active_subscription" });
    return NextResponse.json({ ok: false, error: "no_active_subscription" }, { status: 409 });
  }

  const locale = body?.locale?.startsWith("ru") ? "ru" : "en";
  const payload = {
    title: locale === "ru" ? "Тестовое напоминание" : "Test reminder",
    body: locale === "ru" ? "Уведомления для ухода готовы." : "Care reminders are ready.",
    url: "/settings",
    tag: "plant-care-test"
  };

  const results = await Promise.allSettled(
    (subscriptions as PushSubscriptionRow[] | null ?? []).map(async (subscription) => {
      try {
        await sendCarePush(subscription, payload);
        await supabase.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq("id", subscription.id);
        console.info("notification_sent", { userId: user.id, type: "test" });
      } catch (sendError) {
        await supabase
          .from("push_subscriptions")
          .update({
            last_failure_at: new Date().toISOString(),
            failure_count: 1,
            disabled_at: isPermanentPushError(sendError) ? new Date().toISOString() : undefined
          })
          .eq("id", subscription.id);
        console.info("notification_delivery_failed", { userId: user.id, type: "test", errorCode: pushErrorCode(sendError) });
        throw sendError;
      }
    })
  );

  const sent = results.filter((result) => result.status === "fulfilled").length;
  const failed = results.length - sent;
  if (sent === 0) {
    console.info("push_test_rejected", { userId: user.id, reason: "delivery_failed", failed });
    return NextResponse.json({ ok: false, error: "delivery_failed", sent, failed }, { status: 502 });
  }

  return NextResponse.json({ ok: true, sent, failed });
}
