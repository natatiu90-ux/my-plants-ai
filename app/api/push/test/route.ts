import { NextResponse } from "next/server";
import { sendCarePush, pushErrorCode, isPermanentPushError } from "@/lib/push-server";
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

  return NextResponse.json({ ok: true, sent: results.filter((result) => result.status === "fulfilled").length });
}
