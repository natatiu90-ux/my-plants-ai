import { NextResponse } from "next/server";
import { createSupabaseAdminClient, getUserFromRequest } from "@/lib/supabase/server";

function normalizeTime(value: unknown) {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value) ? value : null;
}

export async function POST(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as {
    preferredTime?: string;
    quietHoursStart?: string | null;
    quietHoursEnd?: string | null;
    timezone?: string;
    locale?: string;
  } | null;
  const preferredTime = normalizeTime(body?.preferredTime) ?? "09:00";

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("user_settings").upsert(
    {
      user_id: user.id,
      preferred_notification_time: preferredTime,
      quiet_hours_start: normalizeTime(body?.quietHoursStart),
      quiet_hours_end: normalizeTime(body?.quietHoursEnd),
      timezone: body?.timezone ?? null,
      notification_locale: body?.locale ?? null
    },
    { onConflict: "user_id" }
  );

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
