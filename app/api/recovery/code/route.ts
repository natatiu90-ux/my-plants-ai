import { NextResponse } from "next/server";
import { generateRecoveryCode, hashRecoveryCode } from "@/lib/recovery-code";
import { createSupabaseAdminClient, getUserFromRequest } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const code = generateRecoveryCode();
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("account_recovery_codes").upsert(
    {
      user_id: user.id,
      code_hash: hashRecoveryCode(code),
      redeemed_at: null
    },
    { onConflict: "user_id" }
  );

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  console.info("recovery_code_created", { userId: user.id });
  return NextResponse.json({ ok: true, code });
}
