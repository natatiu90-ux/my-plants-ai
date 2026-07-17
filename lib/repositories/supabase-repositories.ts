"use client";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { inspectImageDisplay, readJpegExifOrientation } from "@/lib/client-image-normalization";
import { PhotoStorageRepository } from "@/lib/photo-storage";
import { plantCreationError } from "@/lib/plant-save-diagnostics";
import { temporaryPhotoStorageIdFromUrl } from "@/lib/temporary-photo-url";
import type { CareScheduleStatus, HomeContext, PhotoType, Plant, PlantAnalysisRecord, PlantCareEvent, PlantHypothesis, PlantHypothesisStatus, PlantMilestone, PlantPhoto, Room, SoilCheckResult } from "@/types/plant";
import type { RecommendationImpactLevel, RecommendationRevisionReasonType } from "@/types/plant";
import type { RecommendationChangedContext, RecommendationRevisionSaveResult } from "@/lib/recommendation-refresh";
import { mapAnalysis, mapCareEvent, mapHome, mapHypothesisResolution, mapMilestone, mapPhoto, mapPlant, mapRecommendationRevision, mapRoom, type PlantPhotoRow } from "./mappers";

const photoBucket = "plant-photos";
const signedUrlTtlSeconds = 60 * 60;
const signedPhotoUrlCache = new Map<string, { url: string; expiresAt: number }>();
const signedPhotoUrlRequests = new Map<string, Promise<string>>();

function idSuffix(value: string | null | undefined) {
  return value ? value.slice(-6) : null;
}

function safeSupabaseError(error: unknown) {
  const value = (typeof error === "object" && error ? error : {}) as {
    message?: unknown;
    code?: unknown;
    details?: unknown;
    hint?: unknown;
    status?: unknown;
    statusCode?: unknown;
  };

  const numberValue = (input: unknown) => {
    if (typeof input === "number") {
      return input;
    }

    if (typeof input === "string" && input.trim() && Number.isFinite(Number(input))) {
      return Number(input);
    }

    return undefined;
  };

  return {
    message: error instanceof Error ? error.message : typeof value.message === "string" ? value.message : "Unknown error",
    code: typeof value.code === "string" ? value.code : undefined,
    details: typeof value.details === "string" ? value.details : undefined,
    hint: typeof value.hint === "string" ? value.hint : undefined,
    status: numberValue(value.status) ?? numberValue(value.statusCode)
  };
}

function logSupabaseStageError(
  eventName: string,
  stage: string,
  error: unknown,
  context: Record<string, unknown>
) {
  console.error(eventName, {
    stage,
    ...context,
    ...safeSupabaseError(error)
  });
}

function homeImportPayloadShape(roomImports: { legacyKey: string | null; name: string; include: boolean; plantIds: string[] }[]) {
  return {
    roomImportCount: roomImports.length,
    includedRoomCount: roomImports.filter((room) => room.include).length,
    excludedRoomCount: roomImports.filter((room) => !room.include).length,
    selectedPlantCount: roomImports.reduce((count, room) => count + room.plantIds.length, 0),
    emptyRoomCount: roomImports.filter((room) => room.plantIds.length === 0).length,
    usesPlantIds: roomImports.some((room) => room.plantIds.length > 0)
  };
}

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

  private async assertCurrentAuthenticatedUser(stage: string) {
    const { data, error } = await this.supabase.auth.getUser();
    if (error) {
      logSupabaseStageError("plant_creation_auth_check_failed", stage, error, {
        repositoryUserIdSuffix: idSuffix(this.user.id)
      });
      throw plantCreationError(error, {
        stage: "create_plant",
        authenticatedUserIdSuffix: null,
        insertedOwnerIdSuffix: idSuffix(this.user.id)
      });
    }

    if (data.user?.id !== this.user.id) {
      const message = "Authenticated Supabase user changed before plant creation.";
      console.error("plant_creation_auth_user_mismatch", {
        stage,
        authenticatedUserIdSuffix: idSuffix(data.user?.id),
        insertedOwnerIdSuffix: idSuffix(this.user.id)
      });
      throw plantCreationError(new Error(message), {
        stage: "create_plant",
        message,
        authenticatedUserIdSuffix: idSuffix(data.user?.id),
        insertedOwnerIdSuffix: idSuffix(this.user.id)
      });
    }
  }

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
    homeId?: string;
    homeName?: string;
    speciesName: string;
    scientificName?: string;
    roomKey?: string;
    roomId?: string;
    positionInRoom?: Plant["positionInRoom"];
    notes?: string;
    status?: Plant["status"];
    nextAction?: Plant["nextAction"];
    lastWateredAt?: string;
    nextCheckAt?: string;
    careScheduleStatus?: CareScheduleStatus;
    notificationEnabled?: boolean;
  }) {
    await this.assertCurrentAuthenticatedUser("create_plant");
    const { data, error } = await this.supabase
      .from("plants")
      .insert({
        user_id: this.user.id,
        home_id: input.homeId ?? null,
        room_id: input.roomId ?? (input.roomKey && !isBuiltInRoomKey(input.roomKey) ? input.roomKey : null),
        position_in_room: input.positionInRoom ?? null,
        room_key: isBuiltInRoomKey(input.roomKey) ? input.roomKey : null,
        home_name: input.homeName || null,
        species_name: input.speciesName || null,
        scientific_name: input.scientificName || null,
        notes: input.notes || null,
        status: input.status ?? "unknown",
        next_action: normalizeAction(input.nextAction),
        last_watered_at: input.lastWateredAt ? `${input.lastWateredAt}T12:00:00.000Z` : null,
        next_check_at: input.nextCheckAt ? `${input.nextCheckAt}T12:00:00.000Z` : null,
        care_schedule_status: input.careScheduleStatus ?? "active",
        notification_enabled: input.notificationEnabled ?? false
      })
      .select("*")
      .single();

    if (error) {
      logSupabaseStageError("plant_creation_supabase_error", "create_plant", error, {
        authenticatedUserIdSuffix: idSuffix(this.user.id),
        insertedOwnerIdSuffix: idSuffix(this.user.id)
      });
      throw plantCreationError(error, {
        stage: "create_plant",
        authenticatedUserIdSuffix: idSuffix(this.user.id),
        insertedOwnerIdSuffix: idSuffix(this.user.id)
      });
    }
    return mapPlant(data);
  }

  async updatePlant(plantId: string, input: { homeId?: string; homeName?: string; speciesName?: string; scientificName?: string; roomKey?: string; roomId?: string; positionInRoom?: Plant["positionInRoom"]; notes?: string }) {
    let nextRoomId = input.roomId ?? (input.roomKey && !isBuiltInRoomKey(input.roomKey) ? input.roomKey : null);
    if (input.homeId && nextRoomId) {
      const { data: room, error: roomError } = await this.supabase
        .from("rooms")
        .select("id, home_id")
        .eq("id", nextRoomId)
        .eq("user_id", this.user.id)
        .maybeSingle();
      assertNoError(roomError);
      if (!room || room.home_id !== input.homeId) {
        nextRoomId = null;
      }
    }

    const { error } = await this.supabase
      .from("plants")
      .update({
        home_id: input.homeId || null,
        home_name: input.homeName || null,
        species_name: input.speciesName || null,
        scientific_name: input.scientificName || null,
        room_id: nextRoomId,
        position_in_room: input.positionInRoom || null,
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
        next_check_at: `${nextCheckAt}T12:00:00.000Z`,
        care_schedule_status: "active",
        notification_due_cycle_key: null
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
      lastSoilCheckedAt?: string | null;
      lastSoilResult?: SoilCheckResult | null;
      careScheduleStatus?: CareScheduleStatus;
      notificationEnabled?: boolean;
      lastNotificationSentAt?: string | null;
      notificationDueCycleKey?: string | null;
    }
  ) {
    const update: {
      status: Plant["status"];
      next_action: Plant["nextAction"] | "none";
      next_check_at: string | null;
      last_watered_at?: string;
      last_soil_checked_at?: string;
      last_soil_result?: SoilCheckResult | null;
      care_schedule_status?: CareScheduleStatus;
      notification_enabled?: boolean;
      last_notification_sent_at?: string | null;
      notification_due_cycle_key?: string | null;
    } = {
      status: input.status,
      next_action: normalizeAction(input.nextAction),
      next_check_at: input.nextCheckAt ? `${input.nextCheckAt}T12:00:00.000Z` : null
    };

    if (input.lastWateredAt) {
      update.last_watered_at = `${input.lastWateredAt}T12:00:00.000Z`;
    }
    if (input.lastSoilCheckedAt) {
      update.last_soil_checked_at = `${input.lastSoilCheckedAt}T12:00:00.000Z`;
    }
    if (input.lastSoilResult !== undefined) {
      update.last_soil_result = input.lastSoilResult;
    }
    if (input.careScheduleStatus) {
      update.care_schedule_status = input.careScheduleStatus;
    }
    if (input.notificationEnabled !== undefined) {
      update.notification_enabled = input.notificationEnabled;
    }
    if (input.lastNotificationSentAt !== undefined) {
      update.last_notification_sent_at = input.lastNotificationSentAt ? `${input.lastNotificationSentAt}T12:00:00.000Z` : null;
    }
    if (input.notificationDueCycleKey !== undefined) {
      update.notification_due_cycle_key = input.notificationDueCycleKey;
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

  private async assertCurrentAuthenticatedUser() {
    const { data, error } = await this.supabase.auth.getUser();
    if (error) {
      logSupabaseStageError("photo_upload_auth_check_failed", "upload_storage", error, {
        authenticatedUserIdSuffix: null,
        insertedOwnerIdSuffix: idSuffix(this.user.id)
      });
      throw plantCreationError(error, {
        stage: "upload_storage",
        authenticatedUserIdSuffix: null,
        insertedOwnerIdSuffix: idSuffix(this.user.id)
      });
    }

    if (data.user?.id !== this.user.id) {
      const message = "Authenticated Supabase user changed before photo upload.";
      console.error("photo_upload_auth_user_mismatch", {
        stage: "upload_storage",
        authenticatedUserIdSuffix: idSuffix(data.user?.id),
        insertedOwnerIdSuffix: idSuffix(this.user.id)
      });
      throw plantCreationError(new Error(message), {
        stage: "upload_storage",
        message,
        authenticatedUserIdSuffix: idSuffix(data.user?.id),
        insertedOwnerIdSuffix: idSuffix(this.user.id)
      });
    }
  }

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

  async addPhotos(plantId: string, inputs: { url: string; storageId?: string; type: PhotoType; isCover?: boolean; debugId?: string }[], hasExistingPhotos: boolean) {
    await this.assertCurrentAuthenticatedUser();
    const createdRows: PlantPhotoRow[] = [];
    const uploadedStoragePaths: string[] = [];
    const selectedCoverIndex = inputs.findIndex((photo) => photo.isCover);
    const shouldAssignCover = selectedCoverIndex >= 0 || !hasExistingPhotos;
    const coverIndex = selectedCoverIndex >= 0 ? selectedCoverIndex : 0;

    try {
      for (let index = 0; index < inputs.length; index += 1) {
        const input = inputs[index];
        const storageId = input.storageId ?? temporaryPhotoStorageIdFromUrl(input.url);
        if (!storageId) {
          continue;
        }

        const blob = await PhotoStorageRepository.getPhoto(storageId);
        console.info("photo_blob_read", {
          stage: "indexeddb_blob_read",
          plantId,
          storageId: input.url,
          parsedTemporaryPhotoId: storageId,
          blobFound: Boolean(blob),
          blobMimeType: blob?.type ?? null,
          blobSize: blob?.size ?? null,
          debugId: input.debugId
        });
        if (!blob) {
          console.warn("photo_upload_failed", {
            stage: "indexeddb_blob_missing",
            plantId,
            storageId: input.url,
            parsedTemporaryPhotoId: storageId,
            debugId: input.debugId
          });
          throw plantCreationError(new Error("Temporary photo blob was not found."), {
            stage: "read_temporary_blob",
            plantId,
            photoStorageId: input.url,
            parsedTemporaryStorageId: storageId,
            photoIndex: index,
            blobFound: false,
            authenticatedUserIdSuffix: idSuffix(this.user.id),
            insertedOwnerIdSuffix: idSuffix(this.user.id)
          });
        }

        const [display, exifOrientation] = await Promise.all([inspectImageDisplay(blob), readJpegExifOrientation(blob)]);
        const photoId = crypto.randomUUID();
        const storagePath = `${this.user.id}/${plantId}/${photoId}.${extensionForBlob(blob)}`;
        const storagePathPrefix = `${this.user.id}/${plantId}`;
        if (process.env.NODE_ENV !== "production") {
          console.info("photo_orientation_stage", {
            stage: "supabase_storage_upload",
            plantId,
            photoId,
            temporaryStorageId: storageId,
            debugId: input.debugId,
            mimeType: blob.type,
            byteSize: blob.size,
            uploadPath: storagePath,
            width: display.width,
            height: display.height,
            exifOrientation,
            physicallyRotated: exifOrientation == null || exifOrientation === 1,
            displayedInUi: display.succeeded ? `${display.width}x${display.height}` : "decode_failed"
          });
        }
        const { error: uploadError } = await this.supabase.storage.from(photoBucket).upload(storagePath, blob, {
          contentType: blob.type || "image/jpeg",
          upsert: false
        });
        if (uploadError) {
          logSupabaseStageError("photo_upload_failed", "upload_storage", uploadError, {
            plantId,
            storageId: input.url,
            parsedTemporaryPhotoId: storageId,
            uploadPath: storagePath,
            storagePathPrefix,
            authenticatedUserIdSuffix: idSuffix(this.user.id),
            insertedOwnerIdSuffix: idSuffix(this.user.id),
            blobMimeType: blob.type,
            blobSize: blob.size,
            debugId: input.debugId,
          });
          throw plantCreationError(uploadError, {
            stage: "upload_storage",
            plantId,
            photoStorageId: input.url,
            parsedTemporaryStorageId: storageId,
            photoIndex: index,
            blobFound: true,
            blobMimeType: blob.type,
            blobSize: blob.size,
            authenticatedUserIdSuffix: idSuffix(this.user.id),
            insertedOwnerIdSuffix: idSuffix(this.user.id),
            storagePathPrefix
          });
        }
        uploadedStoragePaths.push(storagePath);
        if (process.env.NODE_ENV !== "production") {
          console.info("photo_upload_succeeded", {
            stage: "storage_upload",
            plantId,
            temporaryStorageId: storageId,
            photoId,
            storagePath
          });
        }

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

        if (error) {
          logSupabaseStageError("photo_upload_failed", "insert_photo_row", error, {
            plantId,
            storageId: input.url,
            parsedTemporaryPhotoId: storageId,
            uploadPath: storagePath,
            storagePathPrefix,
            authenticatedUserIdSuffix: idSuffix(this.user.id),
            insertedOwnerIdSuffix: idSuffix(this.user.id),
            debugId: input.debugId,
            photoId,
          });
          throw plantCreationError(error, {
            stage: "insert_photo_row",
            plantId,
            photoStorageId: input.url,
            parsedTemporaryStorageId: storageId,
            photoIndex: index,
            blobFound: true,
            blobMimeType: blob.type,
            blobSize: blob.size,
            authenticatedUserIdSuffix: idSuffix(this.user.id),
            insertedOwnerIdSuffix: idSuffix(this.user.id),
            storagePathPrefix
          });
        }
        if (process.env.NODE_ENV !== "production") {
          console.info("photo_row_created", {
            plantId,
            temporaryStorageId: storageId,
            photoId: data.id,
            isCover: data.is_cover
          });
        }
        createdRows.push(data);
      }

      const expectedTemporaryPhotos = inputs.filter((input) => input.storageId ?? temporaryPhotoStorageIdFromUrl(input.url)).length;
      if (createdRows.length !== expectedTemporaryPhotos) {
        console.warn("photo_upload_failed", {
          stage: "photo_count_mismatch",
          plantId,
          expected: expectedTemporaryPhotos,
          created: createdRows.length
        });
        throw plantCreationError(new Error("Not every temporary photo produced a saved photo row."), {
          stage: "insert_photo_row",
          plantId
        });
      }

      if (shouldAssignCover && createdRows.length) {
        const coverPhoto = createdRows[Math.min(coverIndex, createdRows.length - 1)];
        const { error: clearError } = await this.supabase
          .from("plant_photos")
          .update({ is_cover: false })
          .eq("plant_id", plantId)
          .eq("user_id", this.user.id);
        if (clearError) {
          logSupabaseStageError("photo_upload_failed", "assign_cover", clearError, {
            plantId,
            selectedCoverId: coverPhoto.id,
            authenticatedUserIdSuffix: idSuffix(this.user.id),
            insertedOwnerIdSuffix: idSuffix(this.user.id)
          });
          throw plantCreationError(clearError, {
            stage: "assign_cover",
            plantId,
            authenticatedUserIdSuffix: idSuffix(this.user.id),
            insertedOwnerIdSuffix: idSuffix(this.user.id)
          });
        }

        const { error } = await this.supabase
          .from("plant_photos")
          .update({ is_cover: true })
          .eq("id", coverPhoto.id)
          .eq("plant_id", plantId)
          .eq("user_id", this.user.id);
        if (error) {
          logSupabaseStageError("photo_upload_failed", "assign_cover", error, {
            plantId,
            selectedCoverId: coverPhoto.id,
            authenticatedUserIdSuffix: idSuffix(this.user.id),
            insertedOwnerIdSuffix: idSuffix(this.user.id)
          });
          throw plantCreationError(error, {
            stage: "assign_cover",
            plantId,
            authenticatedUserIdSuffix: idSuffix(this.user.id),
            insertedOwnerIdSuffix: idSuffix(this.user.id)
          });
        }
        createdRows.forEach((row) => {
          row.is_cover = row.id === coverPhoto.id;
        });
      }

      const signedRows = await withThumbnailPhotoUrls(this.supabase, createdRows);
      if (process.env.NODE_ENV !== "production") {
        const coverPhoto = signedRows.find((row) => row.is_cover);
        console.info("photos_saved_for_plant", {
          plantId,
          selectedCoverId: coverPhoto?.id ?? null,
          finalSavedCoverUrl: coverPhoto?.thumbnail_url ?? coverPhoto?.signed_url ?? null,
          returnedPhotoCount: signedRows.length
        });
      }
      return signedRows.map(mapPhoto);
    } catch (error) {
      if (uploadedStoragePaths.length) {
        const { error: cleanupError } = await this.supabase.storage.from(photoBucket).remove(uploadedStoragePaths);
        console.warn("photo_upload_rollback", {
          stage: "storage_cleanup_after_failure",
          plantId,
          uploadedStoragePathCount: uploadedStoragePaths.length,
          cleanupSucceeded: !cleanupError,
          cleanupError: cleanupError?.message ?? null
        });
      }
      throw error;
    }
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

export class HomeRepository {
  constructor(private supabase: SupabaseClient, private user: User) {}

  async listHomes() {
    const { data, error } = await this.supabase
      .from("homes")
      .select("*")
      .eq("user_id", this.user.id)
      .order("created_at", { ascending: true });

    assertNoError(error);
    return (data ?? []).map(mapHome);
  }

  async createHome(input: Omit<HomeContext, "id" | "createdAt">) {
    const { data, error } = await this.supabase
      .from("homes")
      .insert({
        user_id: this.user.id,
        name: input.name.trim() || "Home",
        city: input.city?.trim() || null,
        country: input.country?.trim() || null,
        home_type: input.type ?? null,
        humidity_level: input.humidityLevel ?? null,
        has_air_conditioning: input.hasAirConditioning ?? null,
        notes: input.notes?.trim() || null
      })
      .select("*")
      .single();

    assertNoError(error);
    return mapHome(data);
  }

  async createFirstHomeWithLegacyImport(input: Omit<HomeContext, "id" | "createdAt">, roomImports: { legacyKey: string | null; name: string; include: boolean; plantIds: string[] }[]) {
    const { data, error } = await this.supabase.rpc("create_first_home_with_legacy_import", {
      home_input: {
        name: input.name,
        city: input.city ?? null,
        country: input.country ?? null,
        type: input.type ?? null,
        humidityLevel: input.humidityLevel ?? null,
        hasAirConditioning: input.hasAirConditioning ?? null,
        notes: input.notes ?? null
      },
      room_imports: roomImports
    });

    if (error) {
      logSupabaseStageError("home_import_rpc_failed", "create_first_home_with_legacy_import", error, {
        authenticatedUserIdSuffix: idSuffix(this.user.id),
        rpcName: "create_first_home_with_legacy_import",
        payloadShape: homeImportPayloadShape(roomImports)
      });
      throw error;
    }
    return String(data);
  }

  async importLegacyPlantsToHome(homeId: string, roomImports: { legacyKey: string | null; name: string; include: boolean; plantIds: string[] }[]) {
    const { data, error } = await this.supabase.rpc("import_legacy_plants_to_home", {
      target_home_id: homeId,
      home_input: {},
      room_imports: roomImports
    });

    if (error) {
      logSupabaseStageError("home_import_rpc_failed", "import_legacy_plants_to_home", error, {
        authenticatedUserIdSuffix: idSuffix(this.user.id),
        targetHomeIdSuffix: idSuffix(homeId),
        rpcName: "import_legacy_plants_to_home",
        payloadShape: homeImportPayloadShape(roomImports)
      });
      throw error;
    }
    return String(data);
  }

  async updateHome(homeId: string, input: Partial<Omit<HomeContext, "id" | "createdAt">>) {
    const { data, error } = await this.supabase
      .from("homes")
      .update({
        ...(input.name !== undefined ? { name: input.name.trim() || "Home" } : {}),
        ...(input.city !== undefined ? { city: input.city.trim() || null } : {}),
        ...(input.country !== undefined ? { country: input.country.trim() || null } : {}),
        ...(input.type !== undefined ? { home_type: input.type ?? null } : {}),
        ...(input.humidityLevel !== undefined ? { humidity_level: input.humidityLevel ?? null } : {}),
        ...(input.hasAirConditioning !== undefined ? { has_air_conditioning: input.hasAirConditioning ?? null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes.trim() || null } : {})
      })
      .eq("id", homeId)
      .eq("user_id", this.user.id)
      .select("*")
      .single();

    assertNoError(error);
    return mapHome(data);
  }

  async deleteHome(homeId: string) {
    const { error: clearPlantsError } = await this.supabase
      .from("plants")
      .update({ home_id: null, room_id: null, position_in_room: null })
      .eq("user_id", this.user.id)
      .eq("home_id", homeId);
    assertNoError(clearPlantsError);

    const { error: deleteRoomsError } = await this.supabase.from("rooms").delete().eq("user_id", this.user.id).eq("home_id", homeId);
    assertNoError(deleteRoomsError);

    const { error } = await this.supabase.from("homes").delete().eq("id", homeId).eq("user_id", this.user.id);
    assertNoError(error);
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

  async addRoom(name: string, input?: Partial<Omit<Room, "id" | "name" | "isCustom" | "createdAt">>) {
    const trimmedName = name.trim();
    const { data, error } = await this.supabase
      .from("rooms")
      .insert({
        user_id: this.user.id,
        home_id: input?.homeId ?? null,
        name: trimmedName,
        is_custom: true,
        light_level: input?.lightLevel ?? null,
        direct_sun: input?.directSun ?? null,
        temperature_relative: input?.temperatureRelative ?? null,
        has_air_conditioning: input?.hasAirConditioning ?? null,
        notes: input?.notes ?? null
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

  async updateRoom(roomId: string, input: Partial<Omit<Room, "id" | "isCustom" | "createdAt">>) {
    const { data, error } = await this.supabase
      .from("rooms")
      .update({
        ...(input.homeId !== undefined ? { home_id: input.homeId ?? null } : {}),
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.lightLevel !== undefined ? { light_level: input.lightLevel ?? null } : {}),
        ...(input.directSun !== undefined ? { direct_sun: input.directSun ?? null } : {}),
        ...(input.temperatureRelative !== undefined ? { temperature_relative: input.temperatureRelative ?? null } : {}),
        ...(input.hasAirConditioning !== undefined ? { has_air_conditioning: input.hasAirConditioning ?? null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {})
      })
      .eq("id", roomId)
      .eq("user_id", this.user.id)
      .select("*")
      .single();

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
        position_in_room: null,
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

  async addMilestone(plantId: string, input: { type: PlantMilestone["type"]; eventDate?: string | null; note?: string; photoId?: string }) {
    const { data, error } = await this.supabase
      .from("plant_milestones")
      .insert({
        user_id: this.user.id,
        plant_id: plantId,
        type: input.type,
        event_date: input.eventDate ?? null,
        note: input.note || null,
        photo_id: input.photoId ?? null
      })
      .select("*")
      .single();

    if (error) {
      logSupabaseStageError("plant_creation_supabase_error", "create_milestone", error, {
        plantId,
        authenticatedUserIdSuffix: idSuffix(this.user.id),
        insertedOwnerIdSuffix: idSuffix(this.user.id)
      });
      throw error;
    }
    return mapMilestone(data);
  }

  async updateMilestone(milestoneId: string, input: { type: PlantMilestone["type"]; eventDate?: string | null; note?: string; photoId?: string }) {
    const { error } = await this.supabase
      .from("plant_milestones")
      .update({
        type: input.type,
        event_date: input.eventDate ?? null,
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

    if (error) {
      logSupabaseStageError("plant_creation_supabase_error", "create_watering_event", error, {
        plantId,
        authenticatedUserIdSuffix: idSuffix(this.user.id),
        insertedOwnerIdSuffix: idSuffix(this.user.id)
      });
      throw error;
    }
  }
}

export class AnalysisRepository {
  constructor(private supabase: SupabaseClient, private user: User) {}

  async listAnalyses() {
    const { data, error } = await this.supabase
      .from("plant_analyses")
      .select("*")
      .eq("user_id", this.user.id)
      .order("created_at", { ascending: false });

    assertNoError(error);
    return (data ?? []).map(mapAnalysis);
  }

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

    if (error) {
      logSupabaseStageError("plant_creation_supabase_error", "save_analysis", error, {
        plantId: input.plantId,
        authenticatedUserIdSuffix: idSuffix(this.user.id),
        insertedOwnerIdSuffix: idSuffix(this.user.id)
      });
      throw error;
    }
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

export class RecommendationRevisionRepository {
  constructor(private supabase: SupabaseClient, private user: User) {}

  async listRevisions() {
    const { data, error } = await this.supabase
      .from("plant_recommendation_revisions")
      .select("*")
      .eq("user_id", this.user.id)
      .order("created_at", { ascending: false });

    assertNoError(error);
    return (data ?? []).map(mapRecommendationRevision);
  }

  async createRevision(input: {
    plantId: string;
    analysisId: string;
    recommendations: PlantAnalysisRecord["recommendations"];
    structuredResult?: PlantAnalysisRecord["rawResult"];
    reasonType: RecommendationRevisionReasonType;
    reasonText?: string;
    changedContext?: RecommendationChangedContext;
    contextSnapshot?: Record<string, unknown>;
    promptVersion: string;
    recommendationVersion: number;
    modelVersion?: string;
    impactLevel?: RecommendationImpactLevel;
    changeSummary?: { en?: string | null; ru?: string | null };
  }): Promise<RecommendationRevisionSaveResult> {
    const { data, error } = await this.supabase.rpc("create_plant_recommendation_revision", {
      target_plant_id: input.plantId,
      source_analysis_id: input.analysisId,
      recommendations_input: input.recommendations,
      structured_result_input: input.structuredResult ?? {},
      reason_type_input: input.reasonType,
      reason_text_input: input.reasonText ?? null,
      changed_context_input: input.changedContext ?? {},
      context_snapshot_input: input.contextSnapshot ?? {},
      prompt_version_input: input.promptVersion,
      recommendation_version_input: input.recommendationVersion,
      model_version_input: input.modelVersion ?? null,
      impact_level_input: input.impactLevel ?? "none",
      change_summary_input: input.changeSummary ?? {}
    });

    if (error) {
      logSupabaseStageError("recommendation_revision_supabase_error", "save_analysis", error, {
        plantId: input.plantId,
        authenticatedUserIdSuffix: idSuffix(this.user.id),
        insertedOwnerIdSuffix: idSuffix(this.user.id)
      });
      throw error;
    }

    if (!data || typeof data !== "object") {
      throw new Error("recommendation_revision_id_missing");
    }

    const result = data as { created?: unknown; unchanged?: unknown; revision_id?: unknown };
    if (typeof result.revision_id !== "string") {
      throw new Error("recommendation_revision_id_missing");
    }

    return {
      created: result.created === true,
      unchanged: result.unchanged === true,
      revisionId: result.revision_id
    };
  }
}

export class HypothesisResolutionRepository {
  constructor(private supabase: SupabaseClient, private user: User) {}

  async listResolutions() {
    const { data, error } = await this.supabase
      .from("plant_hypothesis_resolutions")
      .select("*")
      .eq("user_id", this.user.id)
      .order("resolved_at", { ascending: false });

    assertNoError(error);
    return (data ?? []).map(mapHypothesisResolution);
  }

  async saveResolution(
    plantId: string,
    input: { hypothesis: PlantHypothesis; status: PlantHypothesisStatus; userResult: string; evidenceSource?: string }
  ) {
    const saveWithHypothesis = async (hypothesis: string) => {
      const payload = {
        user_id: this.user.id,
        plant_id: plantId,
        hypothesis,
        status: input.status,
        user_result: input.userResult,
        evidence_source: input.evidenceSource ?? "user_confirmation",
        resolved_at: new Date().toISOString()
      };

      return this.supabase
        .from("plant_hypothesis_resolutions")
        .upsert(payload, { onConflict: "user_id,plant_id,hypothesis" })
        .select("*")
        .single();
    };

    const { data, error } = await saveWithHypothesis(input.hypothesis);

    if (!error) {
      return mapHypothesisResolution(data);
    }

    const legacyHypothesis = legacyHypothesisFor(input.hypothesis);
    if (legacyHypothesis && isHypothesisConstraintError(error)) {
      const fallback = await saveWithHypothesis(legacyHypothesis);
      if (!fallback.error) {
        console.warn("plant_hypothesis_resolution_saved_with_legacy_value", {
          hypothesis: input.hypothesis,
          legacyHypothesis,
          result: input.userResult
        });
        return mapHypothesisResolution(fallback.data);
      }

      logHypothesisSaveError(input.hypothesis, input.userResult, fallback.error);
      assertNoError(fallback.error);
    }

    logHypothesisSaveError(input.hypothesis, input.userResult, error);
    assertNoError(error);
    throw new Error("Plant hypothesis resolution failed.");
  }
}

function legacyHypothesisFor(hypothesis: PlantHypothesis) {
  if (hypothesis === "soil_condition") return "watering";
  if (hypothesis === "repotting") return "old_compacted_soil";
  if (hypothesis === "direct_sun") return "sun_stress";
  return null;
}

function isHypothesisConstraintError(error: unknown) {
  const safeError = error as { code?: string; message?: string; details?: string };
  return (
    safeError.code === "23514" ||
    safeError.message?.includes("plant_hypothesis_resolutions_hypothesis_check") ||
    safeError.details?.includes("plant_hypothesis_resolutions_hypothesis_check")
  );
}

function logHypothesisSaveError(hypothesis: PlantHypothesis, userResult: string, error: unknown) {
  const safeError = error as { code?: string; message?: string; details?: string; hint?: string };
  console.warn("plant_hypothesis_resolution_save_failed", {
    hypothesis,
    result: userResult,
    code: safeError.code,
    message: safeError.message,
    details: safeError.details,
    hint: safeError.hint
  });
}

export async function createRepositories(supabase: SupabaseClient, user: User) {
  return {
    userId: user.id,
    plants: new PlantRepository(supabase, user),
    photos: new PhotoRepository(supabase, user),
    homes: new HomeRepository(supabase, user),
    rooms: new RoomRepository(supabase, user),
    milestones: new MilestoneRepository(supabase, user),
    careEvents: new CareEventRepository(supabase, user),
    analyses: new AnalysisRepository(supabase, user),
    recommendationRevisions: new RecommendationRevisionRepository(supabase, user),
    hypothesisResolutions: new HypothesisResolutionRepository(supabase, user)
  };
}
