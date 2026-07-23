import { NextResponse } from "next/server";
import { normalizeReminderDueAt, reminderDueCycleKey } from "@/lib/care-reminders";
import { createSupabaseAdminClient, getUserFromRequest } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function boundedMinutes(value: unknown) {
  const minutes = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 2;
  if (!Number.isFinite(minutes)) return 2;
  return Math.min(60, Math.max(1, Math.round(minutes)));
}

function safeError(error: unknown) {
  const value = (typeof error === "object" && error ? error : {}) as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  return {
    code: typeof value.code === "string" ? value.code : undefined,
    message: error instanceof Error ? error.message : typeof value.message === "string" ? value.message : "Unknown error",
    details: typeof value.details === "string" ? value.details : undefined,
    hint: typeof value.hint === "string" ? value.hint : undefined
  };
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("debugPush") !== "1" && process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "debug_disabled" }, { status: 404 });
  }

  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { plantId?: string; minutes?: number | string } | null;
  if (!body?.plantId) {
    return NextResponse.json({ ok: false, error: "plant_id_required" }, { status: 400 });
  }

  const minutes = boundedMinutes(body.minutes);
  const dueAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  const dueCycleKey = reminderDueCycleKey(body.plantId, "soil_check", dueAt);
  const supabase = createSupabaseAdminClient();

  const { data: plant, error: plantError } = await supabase
    .from("plants")
    .select("id, user_id")
    .eq("id", body.plantId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (plantError || !plant) {
    console.info("debug_care_reminder_failed", {
      stage: "load_plant",
      plantId: body.plantId,
      ...safeError(plantError ?? new Error("plant_not_found"))
    });
    return NextResponse.json({ ok: false, error: "plant_not_found" }, { status: 404 });
  }

  const plantUpdate = await supabase
    .from("plants")
    .update({
      next_action: "check_soil",
      next_check_at: dueAt,
      care_schedule_status: "active",
      notification_enabled: true,
      notification_due_cycle_key: null
    })
    .eq("id", body.plantId)
    .eq("user_id", user.id);

  if (plantUpdate.error) {
    console.info("debug_care_reminder_failed", { stage: "update_plant", plantId: body.plantId, ...safeError(plantUpdate.error) });
    return NextResponse.json({ ok: false, error: "plant_update_failed" }, { status: 500 });
  }

  const staleUpdate = await supabase
    .from("care_reminders")
    .update({ status: "cancelled" })
    .eq("plant_id", body.plantId)
    .eq("reminder_type", "soil_check")
    .eq("status", "scheduled");

  if (staleUpdate.error) {
    console.info("debug_care_reminder_failed", { stage: "cancel_existing", plantId: body.plantId, ...safeError(staleUpdate.error) });
    return NextResponse.json({ ok: false, error: "cancel_existing_failed" }, { status: 500 });
  }

  const reminderInsert = await supabase.from("care_reminders").insert({
    user_id: user.id,
    plant_id: body.plantId,
    reminder_type: "soil_check",
    action_key: "check_soil",
    due_at: normalizeReminderDueAt(dueAt),
    due_cycle_key: dueCycleKey,
    status: "scheduled"
  }).select("id, due_at, due_cycle_key").single();

  if (reminderInsert.error) {
    console.info("debug_care_reminder_failed", { stage: "insert_reminder", plantId: body.plantId, dueCycleKey, ...safeError(reminderInsert.error) });
    return NextResponse.json({ ok: false, error: "insert_reminder_failed" }, { status: 500 });
  }

  console.info("debug_care_reminder_created", {
    plantId: body.plantId,
    reminderId: reminderInsert.data.id,
    dueCycleKey,
    minutes
  });
  return NextResponse.json({
    ok: true,
    plantId: body.plantId,
    reminderId: reminderInsert.data.id,
    dueAt: reminderInsert.data.due_at,
    dueCycleKey,
    minutes
  });
}
