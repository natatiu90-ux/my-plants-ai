import { NextResponse } from "next/server";
import { addDays, toDateKey } from "@/lib/date-format";
import { reminderDueCycleKey } from "@/lib/care-reminders";
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

type CareReminderRow = {
  id: string;
  user_id: string;
  plant_id: string;
  reminder_type: "soil_check";
  action_key: string;
  due_at: string;
  due_cycle_key: string;
  failure_count?: number | null;
};

type NotificationCandidate = {
  source: "care_reminders" | "plant_schedule";
  reminderId?: string;
  plant: DuePlantRow;
  scheduledFor: string;
  dueCycleKey: string;
  disabled?: boolean;
};

type CronStage =
  | "verify_schema"
  | "load_due_plants"
  | "load_due_reminders"
  | "load_notification_preferences"
  | "load_push_subscriptions"
  | "check_existing_delivery"
  | "record_delivery"
  | "update_delivery"
  | "update_push_subscription"
  | "update_care_reminder"
  | "update_plant_notification";

type SupabaseSafeError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function safeSupabaseError(error: unknown): SupabaseSafeError {
  if (!error || typeof error !== "object") {
    return { message: "Unknown Supabase error" };
  }

  const value = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  return {
    code: typeof value.code === "string" ? value.code : undefined,
    message: typeof value.message === "string" ? value.message : "Unknown Supabase error",
    details: typeof value.details === "string" ? value.details : undefined,
    hint: typeof value.hint === "string" ? value.hint : undefined
  };
}

function logSupabaseError(stage: CronStage, error: unknown) {
  const safeError = safeSupabaseError(error);
  console.error("notification_supabase_query_failed", { stage, ...safeError });
  return safeError;
}

function failureResponse(stage: CronStage, error: unknown) {
  const safeError = logSupabaseError(stage, error);
  return NextResponse.json(
    {
      ok: false,
      stage,
      error: safeError.message ?? "Supabase query failed"
    },
    { status: 500 }
  );
}

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
  const { error: updateError } = await supabase
    .from("push_subscriptions")
    .update({
      last_failure_at: new Date().toISOString(),
      failure_count: (subscription.failure_count ?? 0) + 1,
      disabled_at: isPermanentPushError(error) ? new Date().toISOString() : undefined
    })
    .eq("id", subscription.id);
  if (updateError) {
    logSupabaseError("update_push_subscription", updateError);
  }
}

async function verifySchema(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  console.info("notification_supabase_query_started", { stage: "verify_schema" });
  const [plantsCheck, settingsCheck, subscriptionsCheck, deliveriesCheck, remindersCheck] = await Promise.all([
    supabase
      .from("plants")
      .select("id, next_check_at, notification_enabled, notification_due_cycle_key, last_notification_sent_at, care_schedule_status")
      .limit(1),
    supabase
      .from("user_settings")
      .select("user_id, care_notifications_enabled, preferred_notification_time, quiet_hours_start, quiet_hours_end, timezone, notification_locale")
      .limit(1),
    supabase
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth, timezone, locale, disabled_at, failure_count, last_success_at, last_failure_at")
      .limit(1),
    supabase
      .from("notification_deliveries")
      .select("id, user_id, plant_id, subscription_id, notification_type, due_cycle_key, scheduled_for, status, sent_at, opened_at, error_code")
      .limit(1),
    supabase
      .from("care_reminders")
      .select("id, user_id, plant_id, reminder_type, due_at, due_cycle_key, status")
      .limit(1)
  ]);

  const failed = [plantsCheck.error, settingsCheck.error, subscriptionsCheck.error, deliveriesCheck.error].find(Boolean);
  if (failed) {
    return failed;
  }

  console.info("notification_supabase_query_completed", {
    stage: "verify_schema",
    careRemindersAvailable: !remindersCheck.error,
    careRemindersErrorCode: remindersCheck.error?.code
  });
  return null;
}

async function loadPlantScheduleCandidates(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  today: string,
  excludedPlantIds: Set<string>
) {
  console.info("notification_supabase_query_started", { stage: "load_due_plants" });
  const { data: plants, error: plantError } = await supabase
    .from("plants")
    .select("id, user_id, home_name, species_name, next_check_at, last_watered_at, notification_due_cycle_key")
    .eq("notification_enabled", true)
    .neq("care_schedule_status", "paused")
    .lte("next_check_at", `${today}T23:59:59.999Z`);

  if (plantError) {
    return { candidates: [] as NotificationCandidate[], error: plantError };
  }

  const candidates: NotificationCandidate[] = (plants as DuePlantRow[] | null ?? [])
    .filter((plant) => plant.next_check_at && !excludedPlantIds.has(plant.id))
    .map((plant) => ({
      source: "plant_schedule" as const,
      plant,
      scheduledFor: plant.next_check_at as string,
      dueCycleKey: reminderDueCycleKey(plant.id, "soil_check", plant.next_check_at as string)
    }));
  console.info("notification_supabase_query_completed", { stage: "load_due_plants", count: candidates.length });
  return { candidates, error: null };
}

async function loadExplicitReminderCandidates(supabase: ReturnType<typeof createSupabaseAdminClient>, now: string) {
  console.info("notification_supabase_query_started", { stage: "load_due_reminders" });
  const { data: reminders, error: reminderError } = await supabase
    .from("care_reminders")
    .select("id, user_id, plant_id, reminder_type, action_key, due_at, due_cycle_key, failure_count")
    .eq("status", "scheduled")
    .lte("due_at", now);

  if (reminderError) {
    if (reminderError.code === "42P01") {
      console.info("notification_supabase_query_skipped", { stage: "load_due_reminders", reason: "care_reminders_missing" });
      return { candidates: [] as NotificationCandidate[], missingTable: true, error: null };
    }
    return { candidates: [] as NotificationCandidate[], missingTable: false, error: reminderError };
  }

  const dueReminders = reminders as CareReminderRow[] | null ?? [];
  if (!dueReminders.length) {
    console.info("notification_supabase_query_completed", { stage: "load_due_reminders", count: 0 });
    return { candidates: [] as NotificationCandidate[], missingTable: false, error: null };
  }

  const plantIds = Array.from(new Set(dueReminders.map((reminder) => reminder.plant_id)));
  const { data: plants, error: plantError } = await supabase
    .from("plants")
    .select("id, user_id, home_name, species_name, next_check_at, last_watered_at, notification_due_cycle_key, notification_enabled, care_schedule_status")
    .in("id", plantIds);

  if (plantError) {
    return { candidates: [] as NotificationCandidate[], missingTable: false, error: plantError };
  }

  const plantsById = new Map((plants as (DuePlantRow & { notification_enabled?: boolean | null; care_schedule_status?: string | null })[] | null ?? []).map((plant) => [plant.id, plant]));
  const candidates = dueReminders.flatMap((reminder) => {
    const plant = plantsById.get(reminder.plant_id);
    if (!plant || plant.user_id !== reminder.user_id) {
      return [];
    }
    if (!plant.notification_enabled || plant.care_schedule_status === "paused") {
      return [{
        source: "care_reminders" as const,
        reminderId: reminder.id,
        plant,
        scheduledFor: reminder.due_at,
        dueCycleKey: reminder.due_cycle_key,
        disabled: true
      }];
    }
    return [{
      source: "care_reminders" as const,
      reminderId: reminder.id,
      plant,
      scheduledFor: reminder.due_at,
      dueCycleKey: reminder.due_cycle_key
    }];
  }) as (NotificationCandidate & { disabled?: boolean })[];

  console.info("notification_supabase_query_completed", {
    stage: "load_due_reminders",
    count: candidates.length,
    disabled: candidates.filter((candidate) => candidate.disabled).length
  });
  return { candidates, missingTable: false, error: null };
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  console.info("notification_job_started");
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const today = toDateKey(new Date());

  const schemaError = await verifySchema(supabase);
  if (schemaError) {
    return failureResponse("verify_schema", schemaError);
  }

  const explicitReminderResult = await loadExplicitReminderCandidates(supabase, now);
  if (explicitReminderResult.error) {
    return failureResponse("load_due_reminders", explicitReminderResult.error);
  }
  const explicitPlantIds = new Set(explicitReminderResult.candidates.map((candidate) => candidate.plant.id));
  const plantScheduleResult = await loadPlantScheduleCandidates(supabase, today, explicitPlantIds);
  if (plantScheduleResult.error) {
    return failureResponse("load_due_plants", plantScheduleResult.error);
  }

  const candidates = [...explicitReminderResult.candidates, ...plantScheduleResult.candidates];
  if (!candidates.length) {
    console.info("notification_job_completed", {
      candidates: 0,
      due: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      skippedReasons: {}
    });
    return NextResponse.json({ ok: true, candidates: 0, due: 0, sent: 0, skipped: 0, failed: 0, skippedReasons: {} });
  }

  const userIds = Array.from(new Set(candidates.map((candidate) => candidate.plant.user_id)));

  console.info("notification_supabase_query_started", { stage: "load_notification_preferences", userCount: userIds.length });
  const { data: settingsRows, error: settingsError } = await supabase
    .from("user_settings")
    .select("user_id, care_notifications_enabled, preferred_notification_time, quiet_hours_start, quiet_hours_end, timezone, notification_locale")
    .in("user_id", userIds);
  if (settingsError) {
    return failureResponse("load_notification_preferences", settingsError);
  }
  console.info("notification_supabase_query_completed", { stage: "load_notification_preferences", count: settingsRows?.length ?? 0 });

  console.info("notification_supabase_query_started", { stage: "load_push_subscriptions", userCount: userIds.length });
  const { data: subscriptionRows, error: subscriptionsError } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth, timezone, locale, failure_count")
    .in("user_id", userIds)
    .is("disabled_at", null);
  if (subscriptionsError) {
    return failureResponse("load_push_subscriptions", subscriptionsError);
  }
  console.info("notification_supabase_query_completed", { stage: "load_push_subscriptions", count: subscriptionRows?.length ?? 0 });

  const settingsByUser = new Map((settingsRows as UserSettingsRow[] | null ?? []).map((settings) => [settings.user_id, settings]));
  const subscriptionsByUser = (subscriptionRows as PushSubscriptionRow[] | null ?? []).reduce((map, subscription) => {
    map.set(subscription.user_id, [...(map.get(subscription.user_id) ?? []), subscription]);
    return map;
  }, new Map<string, PushSubscriptionRow[]>());

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const skippedReasons: Record<string, number> = {};
  const skip = (reason: string) => {
    skipped += 1;
    skippedReasons[reason] = (skippedReasons[reason] ?? 0) + 1;
  };

  for (const candidate of candidates) {
    const plant = candidate.plant;
    if (candidate.disabled) {
      if (candidate.reminderId) {
        const { error: cancelError } = await supabase
          .from("care_reminders")
          .update({ status: "cancelled" })
          .eq("id", candidate.reminderId);
        if (cancelError) return failureResponse("update_care_reminder", cancelError);
      }
      skip("plant_notifications_disabled_or_paused");
      continue;
    }

    const settings = settingsByUser.get(plant.user_id);
    if (!settings?.care_notifications_enabled) {
      skip("global_notifications_disabled");
      continue;
    }

    const subscriptions = subscriptionsByUser.get(plant.user_id) ?? [];
    if (!subscriptions.length) {
      skip("no_active_subscription");
      continue;
    }

    const dueCycleKey = candidate.dueCycleKey;
    console.info("notification_candidate_found", { plantId: plant.id, userId: plant.user_id, dueCycleKey });
    let candidateSent = 0;
    let candidateFailed = 0;

    for (const subscription of subscriptions) {
      if (!shouldSendNow(settings, subscription)) {
        skip("outside_preferred_time_or_quiet_hours");
        continue;
      }

      console.info("notification_supabase_query_started", { stage: "check_existing_delivery", plantId: plant.id, subscriptionId: subscription.id, dueCycleKey });
      const { data: existingDelivery, error: existingDeliveryError } = await supabase
        .from("notification_deliveries")
        .select("id, status")
        .eq("plant_id", plant.id)
        .eq("subscription_id", subscription.id)
        .eq("notification_type", "soil_check_due")
        .eq("due_cycle_key", dueCycleKey)
        .maybeSingle();
      if (existingDeliveryError) {
        return failureResponse("check_existing_delivery", existingDeliveryError);
      }
      console.info("notification_supabase_query_completed", { stage: "check_existing_delivery", exists: Boolean(existingDelivery?.id) });
      if (existingDelivery?.id && existingDelivery.status === "sent") {
        console.info("notification_skipped_duplicate", { plantId: plant.id, subscriptionId: subscription.id, dueCycleKey });
        skip("already_sent");
        continue;
      }

      const deliveryResult = existingDelivery?.id
        ? await supabase
          .from("notification_deliveries")
          .update({ status: "pending", error_code: null })
          .eq("id", existingDelivery.id)
          .select("id")
          .single()
        : await supabase
          .from("notification_deliveries")
          .insert({
            user_id: plant.user_id,
            plant_id: plant.id,
            subscription_id: subscription.id,
            notification_type: "soil_check_due",
            due_cycle_key: dueCycleKey,
            scheduled_for: candidate.scheduledFor,
            status: "pending"
          })
          .select("id")
          .single();
      const { data: delivery, error: deliveryError } = deliveryResult;

      if (deliveryError) {
        return failureResponse("record_delivery", deliveryError);
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
        const [deliveryUpdate, subscriptionUpdate, plantUpdate] = await Promise.all([
          supabase.from("notification_deliveries").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", delivery.id),
          supabase.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq("id", subscription.id),
          supabase.from("plants").update({ last_notification_sent_at: new Date().toISOString(), notification_due_cycle_key: dueCycleKey }).eq("id", plant.id)
        ]);
        if (deliveryUpdate.error) return failureResponse("update_delivery", deliveryUpdate.error);
        if (subscriptionUpdate.error) return failureResponse("update_push_subscription", subscriptionUpdate.error);
        if (plantUpdate.error) return failureResponse("update_plant_notification", plantUpdate.error);
        console.info("notification_sent", { plantId: plant.id, subscriptionId: subscription.id, dueCycleKey });
        sent += 1;
        candidateSent += 1;
      } catch (sendError) {
        const [deliveryUpdate] = await Promise.all([
          supabase
            .from("notification_deliveries")
            .update({ status: "failed", error_code: pushErrorCode(sendError) })
            .eq("id", delivery.id),
          updateSubscriptionFailure(supabase, subscription, sendError)
        ]);
        if (deliveryUpdate.error) {
          logSupabaseError("update_delivery", deliveryUpdate.error);
        }
        console.info("notification_delivery_failed", { plantId: plant.id, subscriptionId: subscription.id, errorCode: pushErrorCode(sendError) });
        failed += 1;
        candidateFailed += 1;
      }
    }

    if (candidate.reminderId) {
      if (candidateSent > 0) {
        const { error: reminderUpdateError } = await supabase
          .from("care_reminders")
          .update({ status: "sent", sent_at: new Date().toISOString(), last_error_code: null, last_error_message: null })
          .eq("id", candidate.reminderId);
        if (reminderUpdateError) return failureResponse("update_care_reminder", reminderUpdateError);
      } else if (candidateFailed > 0) {
        const { error: reminderUpdateError } = await supabase
          .from("care_reminders")
          .update({
            failed_at: new Date().toISOString(),
            failure_count: 1,
            last_error_code: "delivery_failed",
            last_error_message: "Push delivery failed."
          })
          .eq("id", candidate.reminderId);
        if (reminderUpdateError) return failureResponse("update_care_reminder", reminderUpdateError);
      }
    }
  }

  console.info("notification_job_completed", {
    candidates: candidates.length,
    due: candidates.length,
    sent,
    skipped,
    failed,
    skippedReasons
  });
  return NextResponse.json({ ok: true, candidates: candidates.length, due: candidates.length, sent, skipped, failed, skippedReasons });
}
