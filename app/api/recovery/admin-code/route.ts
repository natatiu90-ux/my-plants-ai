import { NextResponse } from "next/server";
import { generateRecoveryCode, hashRecoveryCode } from "@/lib/recovery-code";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const secret = process.env.RECOVERY_ADMIN_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { userId?: string } | null;
  if (!body?.userId) {
    return NextResponse.json({ ok: false, error: "missing_user_id" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { count, error: countError } = await supabase
    .from("plants")
    .select("id", { count: "exact", head: true })
    .eq("user_id", body.userId);
  if (countError) {
    return NextResponse.json({ ok: false, error: countError.message }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ ok: false, error: "no_plants_for_user" }, { status: 404 });
  }

  const code = generateRecoveryCode();
  const { error } = await supabase.from("account_recovery_codes").upsert(
    {
      user_id: body.userId,
      code_hash: hashRecoveryCode(code),
      redeemed_at: null
    },
    { onConflict: "user_id" }
  );

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, userId: body.userId, plantsCount: count, code });
}
