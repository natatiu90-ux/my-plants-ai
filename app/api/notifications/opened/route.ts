import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { deliveryId?: string } | null;
  if (!body?.deliveryId) {
    return NextResponse.json({ ok: false, error: "missing_delivery" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  await supabase
    .from("notification_deliveries")
    .update({ opened_at: new Date().toISOString() })
    .eq("id", body.deliveryId);

  return NextResponse.json({ ok: true });
}
