import { NextResponse } from "next/server";
import { transferAnonymousAccount } from "@/lib/account-recovery-server";
import { hashRecoveryCode, normalizeRecoveryCode } from "@/lib/recovery-code";
import { createSupabaseAdminClient, getUserFromRequest } from "@/lib/supabase/server";

type RecoveryCodeRow = {
  id: string;
  user_id: string;
};

export async function POST(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { code?: string } | null;
  const normalizedCode = normalizeRecoveryCode(body?.code ?? "");
  if (normalizedCode.length < 8) {
    console.info("recovery_required", { reason: "invalid_code_shape", userId: user.id });
    return NextResponse.json({ ok: false, error: "invalid_recovery_code" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: recoveryCode, error } = await supabase
    .from("account_recovery_codes")
    .select("id, user_id")
    .eq("code_hash", hashRecoveryCode(normalizedCode))
    .is("redeemed_at", null)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!recoveryCode) {
    console.info("recovery_required", { reason: "code_not_found", userId: user.id });
    return NextResponse.json({ ok: false, error: "invalid_recovery_code" }, { status: 404 });
  }

  try {
    const transfer = await transferAnonymousAccount(supabase, (recoveryCode as RecoveryCodeRow).user_id, user.id);
    await supabase.from("account_recovery_codes").delete().eq("user_id", user.id).neq("id", (recoveryCode as RecoveryCodeRow).id);
    await supabase
      .from("account_recovery_codes")
      .update({ redeemed_at: new Date().toISOString(), user_id: user.id })
      .eq("id", (recoveryCode as RecoveryCodeRow).id);

    console.info("account_recovery_completed", {
      previousUserId: transfer.oldUserId,
      currentUserId: transfer.newUserId,
      plantsCount: transfer.plantsCount,
      photosMoved: transfer.photosMoved
    });
    return NextResponse.json({ ok: true, plantsCount: transfer.plantsCount });
  } catch (transferError) {
    const message = transferError instanceof Error ? transferError.message : "recovery_failed";
    console.info("recovery_required", { reason: message, userId: user.id });
    return NextResponse.json({ ok: false, error: message }, { status: 409 });
  }
}
