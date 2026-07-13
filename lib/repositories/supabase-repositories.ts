"use client";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { PhotoStorageRepository } from "@/lib/photo-storage";
import type { PhotoType, Plant, PlantCareEvent, PlantMilestone, PlantPhoto, Room } from "@/types/plant";
import { mapCareEvent, mapMilestone, mapPhoto, mapPlant, mapRoom, type PlantPhotoRow } from "./mappers";

const photoBucket = "plant-photos";
const signedUrlTtlSeconds = 60 * 60;
const signedPhotoUrlCache = new Map<string, { url: string; expiresAt: number }>();
const signedPhotoUrlRequests = new Map<string, Promise<string>>();

function assertNoError(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
}

function extensionForBlob(blob: Blob) {
  if (blob.type === "image/png") return "png";
  if (blob.type === "image/heic") return "heic";
  if (blob.type === "image/heif") return "heif";
  if (blob.type === "image/webp") return "webp";
  return "jpg";
}

function normalizeAction(action: Plant["nextAction"]) {
  return action ?? "none";
}

function isBuiltInRoomKey(roomKey: string | undefined) {
  return Boolean(roomKey?.startsWith("rooms."));
}

async function signedPhotoUrl(supabase: SupabaseClient, storagePath: string, variant: "thumbnail" | "full") {
  const cacheKey = `${variant}:${storagePath}`;
  const cached = signedPhotoUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  const inFlight = signedPhotoUrlRequests.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    const options =
      variant === "thumbnail"
        ? {
            transform: {
              width: 320,
              height: 320,
              resize: "cover" as const
            }
          }
        : undefined;
    const { data } = await supabase.storage.from(photoBucket).createSignedUrl(storagePath, signedUrlTtlSeconds, options);
    const url = data?.signedUrl ?? "";
    if (url) {
      signedPhotoUrlCache.set(cacheKey, { url, expiresAt: Date.now() + (signedUrlTtlSeconds - 60) * 1000 });
    }
    signedPhotoUrlRequests.delete(cacheKey);
    return url;
  })();

  signedPhotoUrlRequests.set(cacheKey, request);
  return request;
}

async function withThumbnailPhotoUrls(supabase: SupabaseClient, rows: PlantPhotoRow[]) {
  return Promise.all(
    rows.map(async (row) => {
      const thumbnailUrl = await signedPhotoUrl(supabase, row.storage_path, "thumbnail");
      return {
        ...row,
        signed_url: thumbnailUrl || null,
        thumbnail_url: thumbnailUrl || null
      };
    })
  );
}

export class PlantRepository {
  constructor(private supabase: SupabaseClient, private user: User) {}

  async listPlants() {
    const { data, error } = await this.supabase
      .from("plants")
      .select("*")
      .eq("user_id", this.user.id)
      .order("created_at", { ascending: false });

    assertNoError(error);
    return (data ?? []).map(mapPlant);
  }

  async createPlant(input: {
    homeName?: string;
    speciesName: string;
    scientificName?: string;
    roomKey?: string;
    notes?: string;
    status?: Plant["status"];
    nextAction?: Plant["nextAction"];
    lastWateredAt?: string;
    nextCheckAt?: string;
  }) {
    const { data, error } = await this.supabase
      .from("plants")
      .insert({
        user_id: this.user.id,
        room_id: input.roomKey && !isBuiltInRoomKey(input.roomKey) ? input.roomKey : null,
        room_key: isBuiltInRoomKey(input.roomKey) ? input.roomKey : null,
        home_name: input.homeName || null,
        species_name: input.speciesName || null,
        scientific_name: input.scientificName || null,
        notes: input.notes || null,
        status: input.status ?? "unknown",
        next_action: normalizeAction(input.nextAction),
        last_watered_at: input.lastWateredAt ? `${input.lastWateredAt}T12:00:00.000Z` : null,
        next_check_at: input.nextCheckAt ? `${input.nextCheckAt}T12:00:00.000Z` : null
      })
      .select("*")
      .single();

    assertNoError(error);
    return mapPlant(data);
  }

  async updatePlant(plantId: string, input: { homeName?: string; speciesName?: string; scientificName?: string; roomKey?: string; notes?: string }) {
    const { error } = await this.supabase
      .from("plants")
      .update({
        home_name: input.homeName || null,
        species_name: input.speciesName || null,
        scientific_name: input.scientificName || null,
        room_id: input.roomKey && !isBuiltInRoomKey(input.roomKey) ? input.roomKey : null,
        room_key: isBuiltInRoomKey(input.roomKey) ? input.roomKey : null,
        notes: input.notes || null
      })
      .eq("id", plantId)
      .eq("user_id", this.user.id);

    assertNoError(error);
  }

  async deletePlant(plantId: string, storagePaths: string[]) {
    if (storagePaths.length) {
      await this.supabase.storage.from(photoBucket).remove(storagePaths);
    }

    const { error } = await this.supabase.from("plants").delete().eq("id", plantId).eq("user_id", this.user.id);
    assertNoError(error);
  }

  async markWatered(plantId: string, nextCheckAt: string) {
    const { error } = await this.supabase
      .from("plants")
      .update({
        status: "healthy",
        next_action: "none",
        last_watered_at: new Date().toISOString(),
        next_check_at: `${nextCheckAt}T12:00:00.000Z`
      })
      .eq("id", plantId)
      .eq("user_id", this.user.id);

    assertNoError(error);
  }

  async updateRecommendationState(
    plantId: string,
    input: {
      status: Plant["status"];
      nextAction: Plant["nextAction"];
      nextCheckAt?: string | null;
      lastWateredAt?: string | null;
    }
  ) {
    const update: {
      status: Plant["status"];
      next_action: Plant["nextAction"] | "none";
      next_check_at: string | null;
      last_watered_at?: string;
    } = {
      status: input.status,
      next_action: normalizeAction(input.nextAction),
      next_check_at: input.nextCheckAt ? `${input.nextCheckAt}T12:00:00.000Z` : null
    };

    if (input.lastWateredAt) {
      update.last_watered_at = `${input.lastWateredAt}T12:00:00.000Z`;
    }

    const { error } = await this.supabase
      .from("plants")
      .update(update)
      .eq("id", plantId)
      .eq("user_id", this.user.id);

    assertNoError(error);
  }
}

export class PhotoRepository {
  constructor(private supabase: SupabaseClient, private user: User) {}

  async listPhotos() {
    const { data, error } = await this.supabase
      .from("plant_photos")
      .select("*")
      .eq("user_id", this.user.id)
      .order("created_at", { ascending: false });

    assertNoError(error);
    const rows = await withThumbnailPhotoUrls(this.supabase, data ?? []);
    return rows.map(mapPhoto);
  }

  async getFullPhotoUrl(storagePath: string) {
    return signedPhotoUrl(this.supabase, storagePath, "full");
  }

  async addPhotos(plantId: string, inputs: { url: string; type: PhotoType; isCover?: boolean }[], hasExistingPhotos: boolean) {
    const createdRows: PlantPhotoRow[] = [];
    const selectedCoverIndex = inputs.findIndex((photo) => photo.isCover);
    const shouldAssignCover = selectedCoverIndex >= 0 || !hasExistingPhotos;
    const coverIndex = selectedCoverIndex >= 0 ? selectedCoverIndex : 0;

    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index];
      const storageId = input.url.startsWith("photo://") ? input.url.replace("photo://", "") : undefined;
      if (!storageId) {
        continue;
      }

      const blob = await PhotoStorageRepository.getPhoto(storageId);
      if (!blob) {
        continue;
      }

      const photoId = crypto.randomUUID();
      const storagePath = `${this.user.id}/${plantId}/${photoId}.${extensionForBlob(blob)}`;
      const { error: uploadError } = await this.supabase.storage.from(photoBucket).upload(storagePath, blob, {
        contentType: blob.type || "image/jpeg",
        upsert: false
      });
      assertNoError(uploadError);

      const { data, error } = await this.supabase
        .from("plant_photos")
        .insert({
          id: photoId,
          user_id: this.user.id,
          plant_id: plantId,
          storage_path: storagePath,
          photo_type: input.type,
          is_cover: shouldAssignCover && index === coverIndex
        })
        .select("*")
        .single();

      assertNoError(error);
      createdRows.push(data);
    }

    if (shouldAssignCover && createdRows.length) {
      const coverPhoto = createdRows[Math.min(coverIndex, createdRows.length - 1)];
      await this.setCoverPhoto(plantId, coverPhoto.id);
      createdRows.forEach((row) => {
        row.is_cover = row.id === coverPhoto.id;
      });
    }

    const signedRows = await withThumbnailPhotoUrls(this.supabase, createdRows);
    return signedRows.map(mapPhoto);
  }

  async setCoverPhoto(plantId: string, photoId: string) {
    const { error: clearError } = await this.supabase
      .from("plant_photos")
      .update({ is_cover: false })
      .eq("plant_id", plantId)
      .eq("user_id", this.user.id);
    assertNoError(clearError);

    const { error } = await this.supabase
      .from("plant_photos")
      .update({ is_cover: true })
      .eq("id", photoId)
      .eq("plant_id", plantId)
      .eq("user_id", this.user.id);
    assertNoError(error);
  }

  async updatePhotoType(photoId: string, type: PhotoType) {
    const { error } = await this.supabase
      .from("plant_photos")
      .update({ photo_type: type })
      .eq("id", photoId)
      .eq("user_id", this.user.id);
    assertNoError(error);
  }

  async deletePhoto(plantId: string, photoId: string, plantPhotos: PlantPhoto[]) {
    if (plantPhotos.length <= 1) {
      return "only-photo" as const;
    }

    const deletedPhoto = plantPhotos.find((photo) => photo.id === photoId);
    if (!deletedPhoto) {
      return "deleted" as const;
    }

    const { error } = await this.supabase.from("plant_photos").delete().eq("id", photoId).eq("user_id", this.user.id);
    assertNoError(error);

    if (deletedPhoto.storagePath) {
      await this.supabase.storage.from(photoBucket).remove([deletedPhoto.storagePath]);
    }

    if (deletedPhoto.isCover) {
      const remaining = plantPhotos.filter((photo) => photo.id !== photoId);
      const promoted = remaining.find((photo) => photo.type === "overview") ?? remaining[0];
      if (promoted) {
        await this.setCoverPhoto(plantId, promoted.id);
      }
    }

    return "deleted" as const;
  }
}

export class RoomRepository {
  constructor(private supabase: SupabaseClient, private user: User) {}

  async listRooms() {
    const { data, error } = await this.supabase
      .from("rooms")
      .select("*")
      .eq("user_id", this.user.id)
      .order("created_at", { ascending: true });

    assertNoError(error);
    return (data ?? []).map(mapRoom);
  }

  async addRoom(name: string) {
    const trimmedName = name.trim();
    const { data, error } = await this.supabase
      .from("rooms")
      .insert({
        user_id: this.user.id,
        name: trimmedName,
        is_custom: true
      })
      .select("*")
      .single();

    if (error && "code" in error && error.code === "23505") {
      const existing = await this.findRoomByName(trimmedName);
      if (existing) {
        return existing;
      }
    }

    assertNoError(error);
    return mapRoom(data);
  }

  async findRoomByName(name: string) {
    const { data, error } = await this.supabase
      .from("rooms")
      .select("*")
      .eq("user_id", this.user.id)
      .ilike("name", name.trim())
      .limit(1)
      .maybeSingle();

    assertNoError(error);
    return data ? mapRoom(data) : null;
  }

  async deleteRoom(roomId: string, replacementRoomKey?: string) {
    const nextRoomId = replacementRoomKey && !isBuiltInRoomKey(replacementRoomKey) ? replacementRoomKey : null;
    const nextRoomKey = isBuiltInRoomKey(replacementRoomKey) ? replacementRoomKey : null;

    const { error: updateError } = await this.supabase
      .from("plants")
      .update({
        room_id: nextRoomId,
        room_key: nextRoomKey
      })
      .eq("user_id", this.user.id)
      .eq("room_id", roomId);
    assertNoError(updateError);

    const { error } = await this.supabase.from("rooms").delete().eq("id", roomId).eq("user_id", this.user.id);
    assertNoError(error);
  }
}

export class MilestoneRepository {
  constructor(private supabase: SupabaseClient, private user: User) {}

  async listMilestones() {
    const { data, error } = await this.supabase
      .from("plant_milestones")
      .select("*")
      .eq("user_id", this.user.id)
      .order("event_date", { ascending: false });

    assertNoError(error);
    return (data ?? []).map(mapMilestone);
  }

  async addMilestone(plantId: string, input: { type: PlantMilestone["type"]; eventDate: string; note?: string; photoId?: string }) {
    const { data, error } = await this.supabase
      .from("plant_milestones")
      .insert({
        user_id: this.user.id,
        plant_id: plantId,
        type: input.type,
        event_date: input.eventDate,
        note: input.note || null,
        photo_id: input.photoId ?? null
      })
      .select("*")
      .single();

    assertNoError(error);
    return mapMilestone(data);
  }

  async updateMilestone(milestoneId: string, input: { type: PlantMilestone["type"]; eventDate: string; note?: string; photoId?: string }) {
    const { error } = await this.supabase
      .from("plant_milestones")
      .update({
        type: input.type,
        event_date: input.eventDate,
        note: input.note || null,
        photo_id: input.photoId ?? null
      })
      .eq("id", milestoneId)
      .eq("user_id", this.user.id);

    assertNoError(error);
  }

  async deleteMilestone(milestoneId: string) {
    const { error } = await this.supabase.from("plant_milestones").delete().eq("id", milestoneId).eq("user_id", this.user.id);
    assertNoError(error);
  }
}

export class CareEventRepository {
  constructor(private supabase: SupabaseClient, private user: User) {}

  async listCareEvents() {
    const { data, error } = await this.supabase
      .from("care_events")
      .select("*")
      .eq("user_id", this.user.id)
      .order("event_date", { ascending: false });

    assertNoError(error);
    return (data ?? []).map(mapCareEvent);
  }

  async addCareEvent(plantId: string, input: { type: PlantCareEvent["type"]; eventDate?: string; metadata?: Record<string, string> }) {
    const { error } = await this.supabase.from("care_events").insert({
      user_id: this.user.id,
      plant_id: plantId,
      type: input.type,
      event_date: input.eventDate ? `${input.eventDate}T12:00:00.000Z` : new Date().toISOString(),
      metadata: input.metadata ?? {}
    });

    assertNoError(error);
  }
}

export class AnalysisRepository {
  constructor(private supabase: SupabaseClient, private user: User) {}

  async addAnalysis(input: {
    plantId: string;
    sourcePhotoIds: string[];
    detectedSpecies?: string | null;
    confidence?: number | null;
    condition?: string;
    nextAction?: string | null;
    summaryEn?: string | null;
    summaryRu?: string | null;
    recommendations?: unknown;
    rawResult?: unknown;
    model?: string | null;
  }) {
    const { error } = await this.supabase.from("plant_analyses").insert({
      user_id: this.user.id,
      plant_id: input.plantId,
      source_photo_ids: input.sourcePhotoIds,
      detected_species: input.detectedSpecies ?? null,
      confidence: input.confidence ?? null,
      condition: input.condition ?? "unknown",
      status: "complete",
      next_action: input.nextAction ?? null,
      summary_en: input.summaryEn ?? null,
      summary_ru: input.summaryRu ?? null,
      recommendations: input.recommendations ?? [],
      raw_result: input.rawResult ?? null,
      model: input.model ?? null
    });

    assertNoError(error);
  }

  async resolveLatestActiveRecommendation(
    plantId: string,
    input: { action: string; result: string; replacementRecommendationId?: string | null }
  ) {
    const { data: latest, error: selectError } = await this.supabase
      .from("plant_analyses")
      .select("id")
      .eq("user_id", this.user.id)
      .eq("plant_id", plantId)
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    assertNoError(selectError);
    if (!latest?.id) {
      return null;
    }

    const { error } = await this.supabase
      .from("plant_analyses")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolution_action: input.action,
        resolution_result: input.result,
        replacement_recommendation_id: input.replacementRecommendationId ?? null
      })
      .eq("id", latest.id)
      .eq("user_id", this.user.id)
      .is("resolved_at", null);

    assertNoError(error);
    return latest.id as string;
  }
}

export async function createRepositories(supabase: SupabaseClient, user: User) {
  return {
    plants: new PlantRepository(supabase, user),
    photos: new PhotoRepository(supabase, user),
    rooms: new RoomRepository(supabase, user),
    milestones: new MilestoneRepository(supabase, user),
    careEvents: new CareEventRepository(supabase, user),
    analyses: new AnalysisRepository(supabase, user)
  };
}
