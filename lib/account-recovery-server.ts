import type { SupabaseClient } from "@supabase/supabase-js";

const photoBucket = "plant-photos";

type RecoveryTransferResult = {
  oldUserId: string;
  newUserId: string;
  plantsCount: number;
  photosMoved: number;
};

type PlantPhotoRecoveryRow = {
  id: string;
  storage_path: string;
};

async function countRows(supabase: SupabaseClient, table: string, userId: string) {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (error) {
    throw new Error(error.message);
  }
  return count ?? 0;
}

async function movePhotoStorage(supabase: SupabaseClient, oldUserId: string, newUserId: string) {
  const { data, error } = await supabase
    .from("plant_photos")
    .select("id, storage_path")
    .eq("user_id", oldUserId);
  if (error) {
    throw new Error(error.message);
  }

  let moved = 0;
  for (const photo of (data ?? []) as PlantPhotoRecoveryRow[]) {
    if (!photo.storage_path.startsWith(`${oldUserId}/`)) {
      continue;
    }

    const nextPath = photo.storage_path.replace(`${oldUserId}/`, `${newUserId}/`);
    const { data: file, error: downloadError } = await supabase.storage.from(photoBucket).download(photo.storage_path);
    if (downloadError) {
      throw new Error(downloadError.message);
    }

    const { error: uploadError } = await supabase.storage.from(photoBucket).upload(nextPath, file, {
      upsert: true,
      contentType: file.type || "image/jpeg"
    });
    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { error: updateError } = await supabase.from("plant_photos").update({ storage_path: nextPath }).eq("id", photo.id);
    if (updateError) {
      throw new Error(updateError.message);
    }

    await supabase.storage.from(photoBucket).remove([photo.storage_path]);
    moved += 1;
  }

  return moved;
}

async function updateUserId(supabase: SupabaseClient, table: string, oldUserId: string, newUserId: string) {
  const { error } = await supabase.from(table).update({ user_id: newUserId }).eq("user_id", oldUserId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function transferAnonymousAccount(
  supabase: SupabaseClient,
  oldUserId: string,
  newUserId: string
): Promise<RecoveryTransferResult> {
  if (oldUserId === newUserId) {
    const plantsCount = await countRows(supabase, "plants", oldUserId);
    return { oldUserId, newUserId, plantsCount, photosMoved: 0 };
  }

  const [oldPlantsCount, currentPlantsCount] = await Promise.all([
    countRows(supabase, "plants", oldUserId),
    countRows(supabase, "plants", newUserId)
  ]);
  if (oldPlantsCount === 0) {
    throw new Error("recovery_source_empty");
  }
  if (currentPlantsCount > 0) {
    throw new Error("target_account_not_empty");
  }

  const photosMoved = await movePhotoStorage(supabase, oldUserId, newUserId);
  const now = new Date().toISOString();

  await supabase.from("push_subscriptions").update({ disabled_at: now }).eq("user_id", oldUserId).is("disabled_at", null);

  const { error: deleteCurrentSettingsError } = await supabase.from("user_settings").delete().eq("user_id", newUserId);
  if (deleteCurrentSettingsError) throw new Error(deleteCurrentSettingsError.message);
  const { error: deleteCurrentProfileError } = await supabase.from("profiles").delete().eq("id", newUserId);
  if (deleteCurrentProfileError) throw new Error(deleteCurrentProfileError.message);

  const { error: profileError } = await supabase.from("profiles").update({ id: newUserId }).eq("id", oldUserId);
  if (profileError) throw new Error(profileError.message);

  for (const table of [
    "homes",
    "rooms",
    "plants",
    "plant_photos",
    "plant_milestones",
    "care_events",
    "plant_analyses",
    "plant_hypothesis_resolutions",
    "notification_deliveries",
    "push_subscriptions",
    "user_settings"
  ]) {
    await updateUserId(supabase, table, oldUserId, newUserId);
  }

  await Promise.all([
    supabase.from("profiles").upsert({ id: newUserId }, { onConflict: "id" }),
    supabase.from("user_settings").upsert({ user_id: newUserId }, { onConflict: "user_id" })
  ]);

  return { oldUserId, newUserId, plantsCount: oldPlantsCount, photosMoved };
}
