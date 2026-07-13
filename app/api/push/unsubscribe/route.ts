import { NextResponse } from "next/server";
import { createSupabaseAdminClient, getUserFromRequest } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { endpoint?: string } | null;
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("push_subscriptions")
    .update({ disabled_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("disabled_at", null);
  if (body?.endpoint) {
    query = query.eq("endpoint", body.endpoint);
  }

  const { error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await supabase.from("user_settings").update({ care_notifications_enabled: false }).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
