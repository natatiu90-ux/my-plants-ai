import { NextResponse } from "next/server";
import { addDays, toDateKey } from "@/lib/date-format";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { isPermanentPushError, pushErrorCode, sendCarePush } from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DuePlantRow = {
  id: string;
  user_id: string;
  home_name?: string | null;
  species_name?: string | null;
  next_check_at?: string | null;
  last_watered_at?: string | null;
  notification_due_cycle_key?: string | null;
};

type UserSettingsRow = {
  user_id: string;
  care_notifications_enabled?: boolean | null;
  preferred_notification_time?: string | null;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  timezone?: string | null;
  notification_locale?: string | null;
};

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  timezone?: string | null;
  locale?: string | null;
  failure_count?: number | null;
};

function minutesFromTime(value?: string | null) {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function localMinutes(timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone
  });
  const [hours, minutes] = formatter.format(new Date()).split(":").map(Number);
  return hours * 60 + minutes;
}

function isInQuietHours(nowMinutes: number, start?: string | null, end?: string | null) {
  const startMinutes = minutesFromTime(start);
  const endMinutes = minutesFromTime(end);
  if (startMinutes == null || endMinutes == null || startMinutes === endMinutes) return false;
  return startMinutes < endMinutes
    ? nowMinutes >= startMinutes && nowMinutes < endMinutes
    : nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

function shouldSendNow(settings: UserSettingsRow | undefined, subscription: PushSubscriptionRow) {
  const timezone = settings?.timezone ?? subscription.timezone ?? "UTC";
  const nowMinutes = localMinutes(timezone);
  const preferredMinutes = minutesFromTime(settings?.preferred_notification_time) ?? 9 * 60;
  return nowMinutes >= preferredMinutes && !isInQuietHours(nowMinutes, settings?.quiet_hours_start, settings?.quiet_hours_end);
}

function relativeWateringText(dateKey: string | null | undefined, locale: "ru" | "en") {
  if (!dateKey) {
    return locale === "ru" ? "полив не указан" : "watering is not set";
  }
  const then = new Date(`${dateKey}T12:00:00`);
  const today = new Date(`${toDateKey(new Date())}T12:00:00`);
  const days = Math.max(0, Math.round((today.getTime() - then.getTime()) / (24 * 60 * 60 * 1000)));
  if (days === 0) return locale === "ru" ? "сегодня" : "today";
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  return formatter.format(-days, "day");
}

function notificationCopy(plant: DuePlantRow, locale: "ru" | "en") {
  const name = plant.home_name || plant.species_name || (locale === "ru" ? "растения" : "your plant");
  if (locale === "ru") {
    return {
      title: `Пора проверить почву у ${name}`,
      body: `Последний полив: ${relativeWateringText(plant.last_watered_at, locale)}. Загляни к растению.`
    };
  }

  return {
    title: `Time to check ${name}`,
    body: `Last watering: ${relativeWateringText(plant.last_watered_at, locale)}. Take a quick look.`
  };
}

async function updateSubscriptionFailure(supabase: ReturnType<typeof createSupabaseAdminClient>, subscription: PushSubscriptionRow, error: unknown) {
  await supabase
    .from("push_subscriptions")
    .update({
      last_failure_at: new Date().toISOString(),
      failure_count: (subscription.failure_count ?? 0) + 1,
      disabled_at: isPermanentPushError(error) ? new Date().toISOString() : undefined
    })
    .eq("id", subscription.id);
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  console.info("notification_job_started");
  const supabase = createSupabaseAdminClient();
  const today = toDateKey(new Date());

  const { data: plants, error: plantError } = await supabase
    .from("plants")
    .select("id, user_id, home_name, species_name, next_check_at, last_watered_at, notification_due_cycle_key")
    .eq("notification_enabled", true)
    .neq("care_schedule_status", "paused")
    .lte("next_check_at", `${today}T23:59:59.999Z`);

  if (plantError) {
    return NextResponse.json({ ok: false, error: plantError.message }, { status: 500 });
  }

  const duePlants = (plants as DuePlantRow[] | null ?? []).filter((plant) => plant.next_check_at);
  const userIds = Array.from(new Set(duePlants.map((plant) => plant.user_id)));
  const [{ data: settingsRows }, { data: subscriptionRows }] = await Promise.all([
    supabase.from("user_settings").select("*").in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]),
    supabase.from("push_subscriptions").select("*").in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]).is("disabled_at", null)
  ]);

  const settingsByUser = new Map((settingsRows as UserSettingsRow[] | null ?? []).map((settings) => [settings.user_id, settings]));
  const subscriptionsByUser = (subscriptionRows as PushSubscriptionRow[] | null ?? []).reduce((map, subscription) => {
    map.set(subscription.user_id, [...(map.get(subscription.user_id) ?? []), subscription]);
    return map;
  }, new Map<string, PushSubscriptionRow[]>());

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const plant of duePlants) {
    const settings = settingsByUser.get(plant.user_id);
    if (!settings?.care_notifications_enabled) {
      skipped += 1;
      continue;
    }

    const subscriptions = subscriptionsByUser.get(plant.user_id) ?? [];
    const dueCycleKey = `${plant.id}:${plant.next_check_at?.slice(0, 10) ?? today}`;
    console.info("notification_candidate_found", { plantId: plant.id, userId: plant.user_id, dueCycleKey });

    for (const subscription of subscriptions) {
      if (!shouldSendNow(settings, subscription)) {
        skipped += 1;
        continue;
      }

      const { data: delivery, error: deliveryError } = await supabase
        .from("notification_deliveries")
        .insert({
          user_id: plant.user_id,
          plant_id: plant.id,
          subscription_id: subscription.id,
          notification_type: "soil_check_due",
          due_cycle_key: dueCycleKey,
          scheduled_for: plant.next_check_at,
          status: "pending"
        })
        .select("id")
        .single();

      if (deliveryError) {
        console.info("notification_skipped_duplicate", { plantId: plant.id, subscriptionId: subscription.id, dueCycleKey });
        skipped += 1;
        continue;
      }

      const locale = (settings.notification_locale ?? subscription.locale ?? "en").startsWith("ru") ? "ru" : "en";
      const copy = notificationCopy(plant, locale);
      const payload = {
        ...copy,
        plantId: plant.id,
        deliveryId: delivery.id,
        url: `/plants/${plant.id}?action=check_soil`,
        tag: `plant-care-${plant.id}`
      };

      try {
        await sendCarePush(subscription, payload);
        await Promise.all([
          supabase.from("notification_deliveries").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", delivery.id),
          supabase.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq("id", subscription.id),
          supabase.from("plants").update({ last_notification_sent_at: new Date().toISOString(), notification_due_cycle_key: dueCycleKey }).eq("id", plant.id)
        ]);
        console.info("notification_sent", { plantId: plant.id, subscriptionId: subscription.id, dueCycleKey });
        sent += 1;
      } catch (sendError) {
        await Promise.all([
          supabase
            .from("notification_deliveries")
            .update({ status: "failed", error_code: pushErrorCode(sendError) })
            .eq("id", delivery.id),
          updateSubscriptionFailure(supabase, subscription, sendError)
        ]);
        console.info("notification_delivery_failed", { plantId: plant.id, subscriptionId: subscription.id, errorCode: pushErrorCode(sendError) });
        failed += 1;
      }
    }

    if ((plant.notification_due_cycle_key ?? "") !== dueCycleKey && subscriptions.length === 0) {
      await supabase.from("plants").update({ next_check_at: toDateKey(addDays(new Date(), 1)) }).eq("id", plant.id);
    }
  }

  return NextResponse.json({ ok: true, candidates: duePlants.length, sent, skipped, failed });
}
