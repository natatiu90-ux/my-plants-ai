import { NextResponse } from "next/server";
import { transferAnonymousAccount } from "@/lib/account-recovery-server";
import { createSupabaseAdminClient, getUserFromRequest } from "@/lib/supabase/server";

async function countPlants(supabase: ReturnType<typeof createSupabaseAdminClient>, userId: string) {
  const { count, error } = await supabase
    .from("plants")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) {
    throw new Error(error.message);
  }
  return count ?? 0;
}

export async function POST(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user || (user as typeof user & { is_anonymous?: boolean }).is_anonymous) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const legacyOwnerId = process.env.LEGACY_OWNER_ID;
  const allowedEmail = process.env.LEGACY_CLAIM_EMAIL;
  if (!legacyOwnerId || !allowedEmail || user.email?.toLowerCase() !== allowedEmail.toLowerCase()) {
    return NextResponse.json({ ok: false, error: "claim_not_configured" }, { status: 404 });
  }

  const supabase = createSupabaseAdminClient();
  const currentPlantCount = await countPlants(supabase, user.id);
  if (currentPlantCount > 0) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "target_account_not_empty",
      plantsCount: currentPlantCount
    });
  }

  const { data: existingClaim, error: claimReadError } = await supabase
    .from("legacy_account_claims")
    .select("id, claimed_by, plants_count, photos_moved")
    .eq("legacy_user_id", legacyOwnerId)
    .maybeSingle();
  if (claimReadError) {
    return NextResponse.json({ ok: false, error: claimReadError.message }, { status: 500 });
  }
  if (existingClaim) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: existingClaim.claimed_by === user.id ? "legacy_data_already_claimed_by_current_user" : "legacy_data_already_claimed",
      plantsCount: existingClaim.plants_count,
      photosMoved: existingClaim.photos_moved
    });
  }

  try {
    const transfer = await transferAnonymousAccount(supabase, legacyOwnerId, user.id);
    await supabase.from("legacy_account_claims").upsert(
      {
        legacy_user_id: legacyOwnerId,
        claimed_by: user.id,
        claimed_email: user.email,
        plants_count: transfer.plantsCount,
        photos_moved: transfer.photosMoved
      },
      { onConflict: "legacy_user_id" }
    );
    return NextResponse.json({ ok: true, ...transfer });
  } catch (error) {
    const message = error instanceof Error ? error.message : "legacy_claim_failed";
    console.info("legacy_account_claim_failed", {
      userId: user.id,
      legacyOwnerId,
      message
    });
    return NextResponse.json({ ok: false, error: message }, { status: 409 });
  }
}
