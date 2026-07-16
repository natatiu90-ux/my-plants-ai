"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { addDays, toDateKey } from "@/lib/date-format";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { createRepositories } from "@/lib/repositories/supabase-repositories";
import { commonNameFromScientificName } from "@/lib/plant-display";
import { PlantCreationError, plantCreationDiagnosticFromError, plantCreationError, type PlantCreationStage } from "@/lib/plant-save-diagnostics";
import { calculateSoilCheckCareResolution } from "@/lib/soil-care";
import type { HomeContext, PhotoType, Plant, PlantAnalysisRecord, PlantCareEvent, PlantHypothesis, PlantHypothesisResolution, PlantHypothesisStatus, PlantMilestone, PlantPhoto, Room, SoilCheckResult } from "@/types/plant";

type PlantState = {
  plants: Plant[];
  photos: PlantPhoto[];
  careEvents: PlantCareEvent[];
  milestones: PlantMilestone[];
  analyses: PlantAnalysisRecord[];
  hypothesisResolutions: PlantHypothesisResolution[];
  homes: HomeContext[];
  rooms: Room[];
  secondaryDataReady: boolean;
};

type StoreStatus = "loading" | "ready" | "error" | "unauthenticated";

type AddPlantInput = {
  homeName?: string;
  homeId?: string;
  speciesName: string;
  scientificName?: string;
  roomKey?: Plant["roomKey"];
  roomId?: string;
  positionInRoom?: Plant["positionInRoom"];
  coverPhotoUrl?: string;
  notes?: string;
  lastWateredAt?: string;
  photos?: { url: string; storageId?: string; type: PhotoType; isCover?: boolean; debugId?: string }[];
  analysis?: {
    detectedSpecies?: string | null;
    confidence?: number | null;
    condition?: Plant["status"];
    nextAction?: Plant["nextAction"];
    nextCheckInDays?: number | null;
    summary?: { en?: string | null; ru?: string | null };
    recommendations?: unknown;
    rawResult?: unknown;
    model?: string | null;
  };
};

type PlantStoreValue = PlantState & {
  status: StoreStatus;
  error: string | null;
  userId: string | null;
  userEmail: string | null;
  retry: () => Promise<void>;
  signOut: () => Promise<void>;
  getPlant: (id: string) => Plant | undefined;
  getPlantPhotos: (plantId: string) => PlantPhoto[];
  getCoverPhoto: (plantId: string) => PlantPhoto | undefined;
  getPlantCareEvents: (plantId: string) => PlantCareEvent[];
  getPlantMilestones: (plantId: string) => PlantMilestone[];
  getPlantAnalysis: (plantId: string) => PlantAnalysisRecord | undefined;
  getPlantHypothesisResolutions: (plantId: string) => PlantHypothesisResolution[];
  ensureFullPhotoUrl: (photoId: string) => Promise<string | undefined>;
  addPlant: (input: AddPlantInput) => Promise<string>;
  updatePlant: (plantId: string, input: { homeId?: string; homeName?: string; speciesName?: string; scientificName?: string; roomKey?: Plant["roomKey"]; roomId?: Plant["roomId"]; positionInRoom?: Plant["positionInRoom"]; notes?: string }) => Promise<void>;
  addHome: (input: Omit<HomeContext, "id" | "createdAt">) => Promise<HomeContext>;
  updateHome: (homeId: string, input: Partial<Omit<HomeContext, "id" | "createdAt">>) => Promise<HomeContext>;
  deleteHome: (homeId: string) => Promise<void>;
  addRoom: (name: string, input?: Partial<Omit<Room, "id" | "name" | "isCustom" | "createdAt">>) => Promise<Room>;
  updateRoom: (roomId: string, input: Partial<Omit<Room, "id" | "isCustom" | "createdAt">>) => Promise<Room>;
  deleteRoom: (roomId: string, replacementRoomKey?: Plant["roomKey"]) => Promise<void>;
  roomExists: (name: string) => boolean;
  addPlantPhoto: (plantId: string, input: { url: string; storageId?: string; type: PhotoType; isCover?: boolean; debugId?: string }) => Promise<PlantPhoto | undefined>;
  addPlantPhotos: (plantId: string, inputs: { url: string; storageId?: string; type: PhotoType; isCover?: boolean; debugId?: string }[]) => Promise<PlantPhoto[]>;
  setCoverPhoto: (plantId: string, photoId: string) => Promise<void>;
  updatePhotoType: (photoId: string, type: PhotoType) => Promise<void>;
  deletePlantPhoto: (plantId: string, photoId: string) => Promise<"deleted" | "only-photo">;
  addMilestone: (
    plantId: string,
    input: { type: PlantMilestone["type"]; eventDate: string; note?: string; photoId?: string }
  ) => Promise<PlantMilestone>;
  updateMilestone: (
    milestoneId: string,
    input: { type: PlantMilestone["type"]; eventDate: string; note?: string; photoId?: string }
  ) => Promise<void>;
  deleteMilestone: (milestoneId: string) => Promise<void>;
  waterPlant: (plantId: string) => Promise<void>;
  recordSoilChecked: (plantId: string, result: SoilCheckResult, note?: string) => Promise<void>;
  saveBaselineHistory: (plantId: string, input: { kind: "watering" | "repotting"; eventDate?: string; unknown?: boolean }) => Promise<void>;
  savePlantAnalysis: (
    plantId: string,
    input: {
      sourcePhotoIds: string[];
      detectedSpecies?: string | null;
      confidence?: number | null;
      condition?: Plant["status"];
      nextAction?: Plant["nextAction"];
      nextCheckInDays?: number | null;
      summary?: { en?: string | null; ru?: string | null };
      recommendations?: unknown;
      rawResult?: unknown;
      model?: string | null;
    }
  ) => Promise<void>;
  resolvePlantHypothesis: (plantId: string, hypothesis: PlantHypothesis, status: PlantHypothesisStatus, userResult: string) => Promise<void>;
  updatePlantNotification: (plantId: string, enabled: boolean) => Promise<void>;
  updatePlantNextCheck: (plantId: string, nextCheckAt?: string) => Promise<void>;
  deletePlant: (plantId: string) => Promise<void>;
};

type Repositories = Awaited<ReturnType<typeof createRepositories>>;

const PlantStoreContext = createContext<PlantStoreValue | null>(null);

const emptyState: PlantState = {
  plants: [],
  photos: [],
  careEvents: [],
  milestones: [],
  analyses: [],
  hypothesisResolutions: [],
  homes: [],
  rooms: [],
  secondaryDataReady: false
};

function builtInRoomExists(name: string) {
  const normalized = name.trim().toLocaleLowerCase();
  return ["living room", "bedroom", "kitchen", "bathroom", "office", "balcony", "гостиная", "спальня", "кухня", "ванная", "кабинет", "балкон"].includes(
    normalized
  );
}

export function PlantStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlantState>(emptyState);
  const [status, setStatus] = useState<StoreStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [repositories, setRepositories] = useState<Repositories | null>(null);
  const attemptedLegacyClaimForUser = useRef<string | null>(null);

  const resetToUnauthenticated = useCallback(() => {
    setState(emptyState);
    setUser(null);
    setRepositories(null);
    setStatus("unauthenticated");
    setError(null);
  }, []);

  const loadData = useCallback(async (nextRepositories: Repositories) => {
    console.info("ownership_query_user_id", { userId: nextRepositories.userId });
    const [plants, photos, homes, rooms] = await Promise.all([
      nextRepositories.plants.listPlants(),
      nextRepositories.photos.listPhotos(),
      nextRepositories.homes.listHomes(),
      nextRepositories.rooms.listRooms()
    ]);
    console.info("plants_loaded_count", { count: plants.length, userId: nextRepositories.userId });
    if (!plants.length) {
      console.info("recovery_required", { reason: "no_plants_for_current_identity", userId: nextRepositories.userId });
      if (attemptedLegacyClaimForUser.current !== nextRepositories.userId && supabase) {
        attemptedLegacyClaimForUser.current = nextRepositories.userId;
        void supabase.auth.getSession().then(async ({ data }) => {
          const token = data.session?.access_token;
          if (!token) return;
          const response = await fetch("/api/recovery/claim-legacy", {
            method: "POST",
            headers: { authorization: `Bearer ${token}` }
          });
          if (response.ok) {
            console.info("legacy_account_claim_completed", { userId: nextRepositories.userId });
            await loadData(nextRepositories);
          }
        }).catch((claimError) => {
          console.info("legacy_account_claim_skipped", {
            userId: nextRepositories.userId,
            message: claimError instanceof Error ? claimError.message : "Unknown error"
          });
        });
      }
    }

    setState((current) => ({ ...current, plants, photos, homes, rooms, secondaryDataReady: false }));

    void Promise.all([
      nextRepositories.milestones.listMilestones(),
      nextRepositories.careEvents.listCareEvents(),
      nextRepositories.analyses.listAnalyses(),
      nextRepositories.hypothesisResolutions.listResolutions()
    ])
      .then(([milestones, careEvents, analyses, hypothesisResolutions]) => {
        setState((current) => ({ ...current, milestones, careEvents, analyses, hypothesisResolutions, secondaryDataReady: true }));
      })
      .catch((nextError) => {
        console.error("secondary_plant_data_load_failed", {
          message: nextError instanceof Error ? nextError.message : "Unknown error"
        });
      });
  }, []);

  const bootstrap = useCallback(async () => {
    setStatus("loading");
    setError(null);

    try {
      if (!isSupabaseConfigured || !supabase) {
        throw new Error("Supabase is not configured.");
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        throw sessionError;
      }

      const nextUser = sessionData.session?.user ?? null;
      console.info("existing_session_found", { found: Boolean(nextUser) });
      if (!nextUser) {
        resetToUnauthenticated();
        return;
      }

      if ((nextUser as User & { is_anonymous?: boolean }).is_anonymous) {
        window.localStorage.setItem("my-plants-legacy-anonymous-user-id", nextUser.id);
        await supabase.auth.signOut();
        console.info("identity_source", { source: "legacy_anonymous_session_blocked", userId: nextUser.id });
        resetToUnauthenticated();
        return;
      }
      console.info("identity_source", { source: "email_supabase_session", userId: nextUser.id });

      await Promise.all([
        supabase.from("profiles").upsert({ id: nextUser.id }, { onConflict: "id" }),
        supabase.from("user_settings").upsert({ user_id: nextUser.id }, { onConflict: "user_id" })
      ]);

      const nextRepositories = await createRepositories(supabase, nextUser);
      setUser(nextUser);
      setRepositories(nextRepositories);
      await loadData(nextRepositories);
      setStatus("ready");
    } catch (nextError) {
      setState(emptyState);
      setStatus("error");
      setError(nextError instanceof Error ? nextError.message : "Unknown error");
    }
  }, [loadData, resetToUnauthenticated]);

  useEffect(() => {
    void bootstrap();
    if (!supabase) {
      return;
    }

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUser = session?.user ?? null;
      const isAnonymous = Boolean(nextUser && (nextUser as User & { is_anonymous?: boolean }).is_anonymous);
      console.info("auth_state_changed", {
        event,
        signedIn: Boolean(nextUser && !isAnonymous),
        userIdSuffix: nextUser?.id.slice(-6) ?? null
      });

      if (nextUser && !isAnonymous) {
        void bootstrap();
      } else if (event === "SIGNED_OUT" || isAnonymous) {
        resetToUnauthenticated();
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [bootstrap, resetToUnauthenticated]);

  const signOut = useCallback(async () => {
    if (!supabase) {
      resetToUnauthenticated();
      return;
    }

    await supabase.auth.signOut();
    resetToUnauthenticated();
  }, [resetToUnauthenticated]);

  const getPlant = useCallback((id: string) => state.plants.find((plant) => plant.id === id), [state.plants]);

  const getPlantPhotos = useCallback(
    (plantId: string) =>
      state.photos
        .filter((photo) => photo.plantId === plantId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.photos]
  );

  const getCoverPhoto = useCallback(
    (plantId: string) => state.photos.find((photo) => photo.plantId === plantId && photo.isCover) ?? getPlantPhotos(plantId)[0],
    [getPlantPhotos, state.photos]
  );

  const getPlantCareEvents = useCallback(
    (plantId: string) =>
      state.careEvents
        .filter((event) => event.plantId === plantId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.careEvents]
  );

  const getPlantMilestones = useCallback(
    (plantId: string) =>
      state.milestones
        .filter((milestone) => milestone.plantId === plantId)
        .sort((a, b) => (b.eventDate ?? b.createdAt).localeCompare(a.eventDate ?? a.createdAt)),
    [state.milestones]
  );

  const getPlantAnalysis = useCallback(
    (plantId: string) => state.analyses.find((analysis) => analysis.plantId === plantId && !analysis.resolvedAt) ?? state.analyses.find((analysis) => analysis.plantId === plantId),
    [state.analyses]
  );

  const getPlantHypothesisResolutions = useCallback(
    (plantId: string) => state.hypothesisResolutions.filter((resolution) => resolution.plantId === plantId),
    [state.hypothesisResolutions]
  );

  const ensureFullPhotoUrl = useCallback(
    async (photoId: string) => {
      const photo = state.photos.find((item) => item.id === photoId);
      if (!repositories || !photo?.storagePath) {
        return photo?.url;
      }

      const fullUrl = await repositories.photos.getFullPhotoUrl(photo.storagePath);
      if (!fullUrl) {
        return photo.url;
      }

      setState((current) => ({
        ...current,
        photos: current.photos.map((item) => (item.id === photoId ? { ...item, url: fullUrl } : item))
      }));
      return fullUrl;
    },
    [repositories, state.photos]
  );

  const roomExists = useCallback(
    (name: string) => builtInRoomExists(name) || state.rooms.some((room) => room.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase()),
    [state.rooms]
  );

  const addHome = useCallback(
    async (input: Omit<HomeContext, "id" | "createdAt">) => {
      if (!repositories) {
        throw new Error("Plant collection is not ready.");
      }

      const home = await repositories.homes.createHome(input);
      setState((current) => ({ ...current, homes: [...current.homes, home] }));
      return home;
    },
    [repositories]
  );

  const updateHome = useCallback(
    async (homeId: string, input: Partial<Omit<HomeContext, "id" | "createdAt">>) => {
      if (!repositories) {
        throw new Error("Plant collection is not ready.");
      }

      const home = await repositories.homes.updateHome(homeId, input);
      setState((current) => ({ ...current, homes: current.homes.map((item) => (item.id === home.id ? home : item)) }));
      return home;
    },
    [repositories]
  );

  const deleteHome = useCallback(
    async (homeId: string) => {
      if (!repositories) {
        throw new Error("Plant collection is not ready.");
      }

      await repositories.homes.deleteHome(homeId);
      setState((current) => ({
        ...current,
        homes: current.homes.filter((home) => home.id !== homeId),
        rooms: current.rooms.filter((room) => room.homeId !== homeId),
        plants: current.plants.map((plant) =>
          plant.homeId === homeId ? { ...plant, homeId: undefined, roomId: undefined, roomKey: undefined, positionInRoom: undefined } : plant
        )
      }));
    },
    [repositories]
  );

  const addRoom = useCallback(
    async (name: string, input?: Partial<Omit<Room, "id" | "name" | "isCustom" | "createdAt">>) => {
      if (!repositories) {
        throw new Error("Plant collection is not ready.");
      }

      const trimmedName = name.trim();
      const existingRoom = state.rooms.find(
        (room) =>
          room.name.trim().toLocaleLowerCase() === trimmedName.toLocaleLowerCase() &&
          (input?.homeId ? room.homeId === input.homeId : true)
      );
      if (existingRoom) {
        return existingRoom;
      }

      const room = await repositories.rooms.addRoom(trimmedName, input);
      setState((current) => {
        const currentRoom = current.rooms.find((item) => item.id === room.id || item.name.trim().toLocaleLowerCase() === room.name.trim().toLocaleLowerCase());
        if (currentRoom) {
          return current;
        }
        return { ...current, rooms: [...current.rooms, room] };
      });
      return room;
    },
    [repositories, state.rooms]
  );

  const updateRoom = useCallback(
    async (roomId: string, input: Partial<Omit<Room, "id" | "isCustom" | "createdAt">>) => {
      if (!repositories) {
        throw new Error("Plant collection is not ready.");
      }

      const room = await repositories.rooms.updateRoom(roomId, input);
      setState((current) => ({
        ...current,
        rooms: current.rooms.map((item) => (item.id === room.id ? room : item)),
        plants: current.plants.map((plant) => {
          if (plant.roomId !== room.id && plant.roomKey !== room.id) {
            return plant;
          }
          if (room.homeId && plant.homeId && room.homeId !== plant.homeId) {
            return { ...plant, roomId: undefined, roomKey: undefined, positionInRoom: undefined };
          }
          return plant;
        })
      }));
      return room;
    },
    [repositories]
  );

  const deleteRoom = useCallback(
    async (roomId: string, replacementRoomKey?: Plant["roomKey"]) => {
      if (!repositories) {
        throw new Error("Plant collection is not ready.");
      }

      await repositories.rooms.deleteRoom(roomId, replacementRoomKey);
      setState((current) => ({
        ...current,
        rooms: current.rooms.filter((room) => room.id !== roomId),
        plants: current.plants.map((plant) =>
          plant.roomKey === roomId || plant.roomId === roomId
            ? { ...plant, roomId: replacementRoomKey?.startsWith("rooms.") ? undefined : replacementRoomKey, roomKey: replacementRoomKey, positionInRoom: undefined }
            : plant
        )
      }));
    },
    [repositories]
  );

  const addPlantPhotos = useCallback(
    async (plantId: string, inputs: { url: string; storageId?: string; type: PhotoType; isCover?: boolean; debugId?: string }[]) => {
      if (!repositories || !inputs.length) {
        return [];
      }

      const hasExistingPhotos = state.photos.some((photo) => photo.plantId === plantId);
      const photos = await repositories.photos.addPhotos(plantId, inputs, hasExistingPhotos);
      const shouldAssignCover = photos.some((photo) => photo.isCover);
      const shouldResolvePhotoRecommendation = photos.length > 0 && state.plants.some((plant) => plant.id === plantId && plant.nextAction === "take_photo");
      if (shouldResolvePhotoRecommendation) {
        await repositories.analyses.resolveLatestActiveRecommendation(plantId, { action: "photo_added", result: "photo_added" });
        await repositories.plants.updateRecommendationState(plantId, {
          status: "healthy",
          nextAction: null,
          nextCheckAt: toDateKey(addDays(new Date(), 4))
        });
      }

      setState((current) => ({
        ...current,
        plants: current.plants.map((plant) =>
          shouldResolvePhotoRecommendation && plant.id === plantId
            ? {
                ...plant,
                status: "healthy",
                statusLabelKey: "status.doingGreat",
                messageKey: "plants.afterWatering.message",
                nextAction: null,
                nextCheckAt: toDateKey(addDays(new Date(), 4))
              }
            : plant
        ),
        photos: [
          ...photos,
          ...current.photos.map((photo) => (shouldAssignCover && photo.plantId === plantId ? { ...photo, isCover: false } : photo))
        ],
        careEvents: [
          ...photos.map((photo) => ({
            id: `${photo.id}-event`,
            plantId,
            type: "photo_added" as const,
            createdAt: photo.createdAt,
            metadata: { photoType: photo.type }
          })),
          ...current.careEvents
        ]
      }));

      return photos;
    },
    [repositories, state.photos, state.plants]
  );

  const addPlant = useCallback(
    async (input: AddPlantInput) => {
      if (!repositories) {
        throw new Error("Plant collection is not ready.");
      }

      const reminderStartDate = input.lastWateredAt ? new Date(`${input.lastWateredAt}T12:00:00`) : new Date();
      const nextCheckAt =
        input.analysis?.nextCheckInDays != null
          ? toDateKey(addDays(reminderStartDate, input.analysis.nextCheckInDays))
          : input.lastWateredAt
            ? toDateKey(addDays(reminderStartDate, 4))
            : undefined;
      let plant: Plant;
      try {
        plant = await repositories.plants.createPlant({
          homeId: input.homeId,
          homeName: input.homeName,
          speciesName: input.speciesName,
          scientificName: input.scientificName,
          roomKey: input.roomKey,
          roomId: input.roomId,
          positionInRoom: input.positionInRoom,
          notes: input.notes,
          status: input.analysis?.condition ?? "unknown",
          nextAction: input.analysis?.nextAction ?? null,
          lastWateredAt: input.lastWateredAt,
          nextCheckAt,
          careScheduleStatus: input.lastWateredAt ? "active" : "needs_first_check"
        });
      } catch (error) {
        throw plantCreationError(error, { stage: "create_plant" });
      }

      const runPostCreateStage = async <T,>(stage: PlantCreationStage, task: () => Promise<T>) => {
        try {
          return await task();
        } catch (error) {
          throw plantCreationError(error, { stage, plantId: plant.id });
        }
      };

      let photos: PlantPhoto[] = [];
      let postCreateStage: PlantCreationStage = "read_temporary_blob";
      try {
        photos = await repositories.photos.addPhotos(plant.id, input.photos ?? [], false);
        if (process.env.NODE_ENV !== "production") {
          const coverPhoto = photos.find((photo) => photo.isCover);
          console.info("plant_photos_attached", {
            plantId: plant.id,
            returnedPhotoCount: photos.length,
            selectedCoverId: coverPhoto?.id ?? null,
            finalSavedCoverUrl: coverPhoto?.thumbnailUrl ?? coverPhoto?.url ?? null
          });
        }
        postCreateStage = "create_milestone";
        const milestone = await runPostCreateStage("create_milestone", () => repositories.milestones.addMilestone(plant.id, {
          type: "plant_added",
          eventDate: toDateKey(new Date())
        }));
        postCreateStage = "create_watering_event";
        const lastWateredAt = input.lastWateredAt;
        const wateringMilestone = lastWateredAt
          ? await runPostCreateStage("create_watering_event", () => repositories.milestones.addMilestone(plant.id, {
              type: "watered",
              eventDate: lastWateredAt
            }))
          : null;
        if (lastWateredAt) {
          postCreateStage = "create_watering_event";
          await runPostCreateStage("create_watering_event", () => repositories.careEvents.addCareEvent(plant.id, { type: "watered", eventDate: lastWateredAt }));
        }

        const analysis = input.analysis;
        if (analysis) {
          postCreateStage = "save_analysis";
          await runPostCreateStage("save_analysis", () => repositories.analyses.addAnalysis({
            plantId: plant.id,
            sourcePhotoIds: photos.map((photo) => photo.id),
            detectedSpecies: analysis.detectedSpecies,
            confidence: analysis.confidence,
            condition: analysis.condition,
            nextAction: analysis.nextAction,
            summaryEn: analysis.summary?.en,
            summaryRu: analysis.summary?.ru,
            recommendations: analysis.recommendations,
            rawResult: analysis.rawResult,
            model: analysis.model
          }));
        }

        const analysisRecord: PlantAnalysisRecord | null = input.analysis
          ? {
              id: `${plant.id}-analysis-${Date.now()}`,
              plantId: plant.id,
              condition: input.analysis.condition ?? "unknown",
              nextAction: input.analysis.nextAction ?? null,
              summary: input.analysis.summary,
              recommendations: Array.isArray(input.analysis.recommendations)
                ? (input.analysis.recommendations as PlantAnalysisRecord["recommendations"])
                : [],
              rawResult: input.analysis.rawResult as PlantAnalysisRecord["rawResult"],
              model: input.analysis.model ?? undefined,
              createdAt: toDateKey(new Date())
            }
          : null;

        setState((current) => ({
          ...current,
          plants: [plant, ...current.plants],
          photos: [...photos, ...current.photos],
          milestones: [milestone, ...(wateringMilestone ? [wateringMilestone] : []), ...current.milestones],
          analyses: [...(analysisRecord ? [analysisRecord] : []), ...current.analyses],
          hypothesisResolutions: current.hypothesisResolutions,
          careEvents: [
            ...(input.lastWateredAt
              ? [{ id: `${plant.id}-watered-${Date.now()}`, plantId: plant.id, type: "watered" as const, createdAt: input.lastWateredAt }]
              : []),
            ...current.careEvents
          ]
        }));

        return plant.id;
      } catch (error) {
        let diagnostic = plantCreationDiagnosticFromError(error, {
          stage: postCreateStage,
          plantId: plant.id
        });
        const storagePaths = photos.map((photo) => photo.storagePath).filter(Boolean) as string[];
        try {
          await repositories.plants.deletePlant(plant.id, storagePaths);
          diagnostic = {
            ...diagnostic,
            rollbackResult: `plant_deleted storage_paths=${storagePaths.length}`
          };
          console.warn("plant_creation_rollback_completed", {
            stage: "plant_create_rollback",
            failedStage: postCreateStage,
            plantId: plant.id,
            storagePathCount: storagePaths.length
          });
        } catch (rollbackError) {
          diagnostic = {
            ...diagnostic,
            rollbackResult: rollbackError instanceof Error ? `rollback_failed: ${rollbackError.message}` : "rollback_failed"
          };
          console.error("plant_creation_rollback_failed", {
            stage: "plant_create_rollback",
            failedStage: postCreateStage,
            plantId: plant.id,
            message: rollbackError instanceof Error ? rollbackError.message : "Unknown rollback error"
          });
        }
        console.error("plant_creation_failed_after_plant_row", {
          ...diagnostic,
          plantId: plant.id,
          selectedPhotoCount: input.photos?.length ?? 0
        });
        throw new PlantCreationError(diagnostic, error);
      }
    },
    [repositories]
  );

  const updatePlant = useCallback(
    async (plantId: string, input: { homeId?: string; homeName?: string; speciesName?: string; scientificName?: string; roomKey?: Plant["roomKey"]; roomId?: Plant["roomId"]; positionInRoom?: Plant["positionInRoom"]; notes?: string }) => {
      await repositories?.plants.updatePlant(plantId, input);
      setState((current) => ({
        ...current,
        plants: current.plants.map((plant) =>
          plant.id === plantId
            ? {
                ...plant,
                homeId: input.homeId || undefined,
                homeName: input.homeName || undefined,
                speciesName: input.speciesName || commonNameFromScientificName(input.scientificName),
                scientificName: input.scientificName || undefined,
                roomId: input.roomId || (input.roomKey && !input.roomKey.startsWith("rooms.") ? input.roomKey : undefined),
                roomKey: input.roomKey,
                positionInRoom: input.positionInRoom,
                notes: input.notes
              }
            : plant
        )
      }));
    },
    [repositories]
  );

  const addPlantPhoto = useCallback(
    async (plantId: string, input: { url: string; storageId?: string; type: PhotoType; isCover?: boolean }) => {
      const photos = await addPlantPhotos(plantId, [input]);
      return photos[0];
    },
    [addPlantPhotos]
  );

  const setCoverPhoto = useCallback(
    async (plantId: string, photoId: string) => {
      await repositories?.photos.setCoverPhoto(plantId, photoId);
      setState((current) => ({
        ...current,
        photos: current.photos.map((photo) => (photo.plantId === plantId ? { ...photo, isCover: photo.id === photoId } : photo))
      }));
    },
    [repositories]
  );

  const updatePhotoType = useCallback(
    async (photoId: string, type: PhotoType) => {
      await repositories?.photos.updatePhotoType(photoId, type);
      setState((current) => ({ ...current, photos: current.photos.map((photo) => (photo.id === photoId ? { ...photo, type } : photo)) }));
    },
    [repositories]
  );

  const deletePlantPhoto = useCallback(
    async (plantId: string, photoId: string) => {
      if (!repositories) return "only-photo";

      const plantPhotos = getPlantPhotos(plantId);
      const result = await repositories.photos.deletePhoto(plantId, photoId, plantPhotos);
      if (result === "only-photo") {
        return result;
      }

      const deletedPhoto = plantPhotos.find((photo) => photo.id === photoId);
      const remaining = plantPhotos.filter((photo) => photo.id !== photoId);
      const promoted = deletedPhoto?.isCover ? remaining.find((photo) => photo.type === "overview") ?? remaining[0] : remaining.find((photo) => photo.isCover);

      setState((current) => ({
        ...current,
        photos: current.photos
          .filter((photo) => photo.id !== photoId)
          .map((photo) => (photo.plantId === plantId && promoted ? { ...photo, isCover: photo.id === promoted.id } : photo))
      }));

      return result;
    },
    [getPlantPhotos, repositories]
  );

  const addMilestone = useCallback(
    async (plantId: string, input: { type: PlantMilestone["type"]; eventDate: string; note?: string; photoId?: string }) => {
      if (!repositories) throw new Error("Plant collection is not ready.");
      const milestone = await repositories.milestones.addMilestone(plantId, input);
      setState((current) => ({ ...current, milestones: [milestone, ...current.milestones] }));
      return milestone;
    },
    [repositories]
  );

  const updateMilestone = useCallback(
    async (milestoneId: string, input: { type: PlantMilestone["type"]; eventDate: string; note?: string; photoId?: string }) => {
      await repositories?.milestones.updateMilestone(milestoneId, input);
      setState((current) => ({
        ...current,
        milestones: current.milestones.map((milestone) =>
          milestone.id === milestoneId && milestone.isManual
            ? { ...milestone, type: input.type, eventDate: input.eventDate, note: input.note?.trim() || undefined, photoId: input.photoId }
            : milestone
        )
      }));
    },
    [repositories]
  );

  const deleteMilestone = useCallback(
    async (milestoneId: string) => {
      await repositories?.milestones.deleteMilestone(milestoneId);
      setState((current) => ({ ...current, milestones: current.milestones.filter((milestone) => milestone.id !== milestoneId || !milestone.isManual) }));
    },
    [repositories]
  );

  const waterPlant = useCallback(
    async (plantId: string) => {
      const nextCheckAt = toDateKey(addDays(new Date(), 4));
      await repositories?.plants.markWatered(plantId, nextCheckAt);
      await repositories?.analyses.resolveLatestActiveRecommendation(plantId, { action: "watered", result: "watered" });
      await repositories?.careEvents.addCareEvent(plantId, { type: "watered" });
      setState((current) => ({
        ...current,
        plants: current.plants.map((plant) =>
          plant.id === plantId
            ? {
                ...plant,
                status: "healthy",
                statusLabelKey: "status.doingGreat",
                messageKey: "plants.afterWatering.message",
                nextAction: null,
                lastWateredAt: toDateKey(new Date()),
                nextCheckAt,
                careScheduleStatus: "active",
                notificationDueCycleKey: undefined
              }
            : plant
        ),
        careEvents: [{ id: `${plantId}-watered-${Date.now()}`, plantId, type: "watered", createdAt: toDateKey(new Date()) }, ...current.careEvents]
      }));
    },
    [repositories]
  );

  const recordSoilChecked = useCallback(
    async (plantId: string, result: SoilCheckResult, note?: string) => {
      if (!repositories) {
        return;
      }

      const currentPlant = state.plants.find((plant) => plant.id === plantId);
      if (!currentPlant) {
        throw new Error("Plant not found.");
      }

      const plantMilestones = state.milestones.filter((milestone) => milestone.plantId === plantId);
      const plantHypothesisResolutions = state.hypothesisResolutions.filter((resolution) => resolution.plantId === plantId);
      const resolution = calculateSoilCheckCareResolution(currentPlant, result, plantMilestones, plantHypothesisResolutions);
      const savedSoilResolution =
        result === "not_sure"
          ? null
          : await repositories.hypothesisResolutions.saveResolution(plantId, {
              hypothesis: "soil_condition",
              status: result === "slightly_damp" ? "ruled_out" : "confirmed",
              userResult: result,
              evidenceSource: "soil_check"
            });
      await repositories.analyses.resolveLatestActiveRecommendation(plantId, {
        action: "soil_checked",
        result,
        replacementRecommendationId: resolution.replacementRecommendationId
      });
      await repositories.plants.updateRecommendationState(plantId, {
        status: resolution.status,
        nextAction: resolution.nextAction,
        nextCheckAt: resolution.nextCheckAt,
        lastSoilCheckedAt: toDateKey(new Date()),
        lastSoilResult: result,
        careScheduleStatus: resolution.careScheduleStatus,
        notificationDueCycleKey: null
      });
      await repositories.careEvents.addCareEvent(plantId, { type: "soil_checked", metadata: { result, followUp: resolution.replacementRecommendationId ?? "next_check_scheduled" } });
      console.info("care_schedule_recalculated", { result, profile: resolution.profile, nextCheckAt: resolution.nextCheckAt, checkInDays: resolution.checkInDays });
      const milestone = await repositories.milestones.addMilestone(plantId, {
        type: "soil_checked",
        eventDate: toDateKey(new Date()),
        note
      });
      setState((current) => ({
        ...current,
        plants: current.plants.map((plant) =>
          plant.id === plantId
            ? {
                ...plant,
                status: resolution.status,
                statusLabelKey:
                  resolution.nextAction === "water"
                    ? "status.looksThirsty"
                    : resolution.nextAction === "check_soil"
                      ? "status.checkSoilToday"
                      : "status.doingGreat",
                messageKey:
                  resolution.status === "check_soon"
                    ? "plants.checkSoon.message"
                    : "plants.afterWatering.message",
                nextAction: resolution.nextAction,
                nextCheckAt: resolution.nextCheckAt ?? undefined,
                lastSoilCheckedAt: toDateKey(new Date()),
                lastSoilResult: result,
                careScheduleStatus: resolution.careScheduleStatus,
                notificationDueCycleKey: undefined
              }
            : plant
        ),
        careEvents: [
          { id: `${plantId}-soil-${Date.now()}`, plantId, type: "soil_checked", createdAt: toDateKey(new Date()), metadata: { result } },
          ...current.careEvents
        ],
        milestones: [milestone, ...current.milestones],
        hypothesisResolutions: savedSoilResolution
          ? [
              savedSoilResolution,
              ...current.hypothesisResolutions.filter((item) => item.plantId !== plantId || item.hypothesis !== "soil_condition")
            ]
          : current.hypothesisResolutions
      }));
    },
    [repositories, state.hypothesisResolutions, state.milestones, state.plants]
  );

  const saveBaselineHistory = useCallback(
    async (plantId: string, input: { kind: "watering" | "repotting"; eventDate?: string; unknown?: boolean }) => {
      if (!repositories) {
        throw new Error("Plant collection is not ready.");
      }

      const today = toDateKey(new Date());
      const eventDate = input.eventDate ?? today;
      if (input.kind === "watering" && !input.unknown) {
        const nextCheckAt = toDateKey(addDays(new Date(`${eventDate}T12:00:00`), 4));
        const milestone = await repositories.milestones.addMilestone(plantId, { type: "watered", eventDate });
        await repositories.careEvents.addCareEvent(plantId, { type: "watered", eventDate, metadata: { source: "baseline_history" } });
        await repositories.plants.updateRecommendationState(plantId, {
          status: state.plants.find((plant) => plant.id === plantId)?.status ?? "unknown",
          nextAction: state.plants.find((plant) => plant.id === plantId)?.nextAction ?? null,
          nextCheckAt,
          lastWateredAt: eventDate,
          careScheduleStatus: "active",
          notificationDueCycleKey: null
        });
        setState((current) => ({
          ...current,
          plants: current.plants.map((plant) =>
            plant.id === plantId
              ? { ...plant, lastWateredAt: eventDate, nextCheckAt, careScheduleStatus: "active", notificationDueCycleKey: undefined }
              : plant
          ),
          milestones: [milestone, ...current.milestones],
          careEvents: [{ id: `${plantId}-baseline-watered-${Date.now()}`, plantId, type: "watered", createdAt: eventDate, metadata: { source: "baseline_history" } }, ...current.careEvents]
        }));
        return;
      }

      const milestoneType: PlantMilestone["type"] =
        input.kind === "watering" ? (input.unknown ? "watering_unknown" : "watered") : input.unknown ? "repotting_unknown" : "repotted";
      const milestone = await repositories.milestones.addMilestone(plantId, { type: milestoneType, eventDate });
      setState((current) => ({ ...current, milestones: [milestone, ...current.milestones] }));
    },
    [repositories, state.plants]
  );

  const savePlantAnalysis = useCallback(
    async (
      plantId: string,
      input: {
        sourcePhotoIds: string[];
        detectedSpecies?: string | null;
        confidence?: number | null;
        condition?: Plant["status"];
        nextAction?: Plant["nextAction"];
        nextCheckInDays?: number | null;
        summary?: { en?: string | null; ru?: string | null };
        recommendations?: unknown;
        rawResult?: unknown;
        model?: string | null;
      }
    ) => {
      if (!repositories) {
        throw new Error("Plant collection is not ready.");
      }

      await repositories.analyses.addAnalysis({
        plantId,
        sourcePhotoIds: input.sourcePhotoIds,
        detectedSpecies: input.detectedSpecies,
        confidence: input.confidence,
        condition: input.condition,
        nextAction: input.nextAction,
        summaryEn: input.summary?.en,
        summaryRu: input.summary?.ru,
        recommendations: input.recommendations,
        rawResult: input.rawResult,
        model: input.model
      });

      const nextCheckAt = input.nextCheckInDays != null ? toDateKey(addDays(new Date(), input.nextCheckInDays)) : undefined;
      if (input.condition || input.nextAction !== undefined || nextCheckAt) {
        await repositories.plants.updateRecommendationState(plantId, {
          status: input.condition ?? state.plants.find((plant) => plant.id === plantId)?.status ?? "unknown",
          nextAction: input.nextAction ?? null,
          nextCheckAt: nextCheckAt ?? state.plants.find((plant) => plant.id === plantId)?.nextCheckAt ?? null,
          careScheduleStatus: nextCheckAt ? "active" : state.plants.find((plant) => plant.id === plantId)?.careScheduleStatus,
          notificationDueCycleKey: null
        });
      }

      const analysisRecord: PlantAnalysisRecord = {
        id: `${plantId}-analysis-${Date.now()}`,
        plantId,
        condition: input.condition ?? "unknown",
        nextAction: input.nextAction ?? null,
        summary: input.summary,
        recommendations: Array.isArray(input.recommendations) ? (input.recommendations as PlantAnalysisRecord["recommendations"]) : [],
        rawResult: input.rawResult as PlantAnalysisRecord["rawResult"],
        model: input.model ?? undefined,
        createdAt: toDateKey(new Date())
      };

      setState((current) => ({
        ...current,
        plants: current.plants.map((plant) =>
          plant.id === plantId
            ? {
                ...plant,
                status: input.condition ?? plant.status,
                nextAction: input.nextAction ?? null,
                nextCheckAt: nextCheckAt ?? plant.nextCheckAt,
                careScheduleStatus: nextCheckAt ? "active" : plant.careScheduleStatus,
                notificationDueCycleKey: undefined
              }
            : plant
        ),
        analyses: [analysisRecord, ...current.analyses]
      }));
    },
    [repositories, state.plants]
  );

  const resolvePlantHypothesis = useCallback(
    async (plantId: string, hypothesis: PlantHypothesis, status: PlantHypothesisStatus, userResult: string) => {
      if (!repositories) {
        throw new Error("Plant collection is not ready.");
      }

      const resolution = await repositories.hypothesisResolutions.saveResolution(plantId, {
        hypothesis,
        status,
        userResult,
        evidenceSource: "user_confirmation"
      });

      setState((current) => ({
        ...current,
        hypothesisResolutions: [
          resolution,
          ...current.hypothesisResolutions.filter((item) => item.plantId !== plantId || item.hypothesis !== hypothesis)
        ]
      }));
    },
    [repositories]
  );

  const updatePlantNotification = useCallback(
    async (plantId: string, enabled: boolean) => {
      await repositories?.plants.updateRecommendationState(plantId, {
        status: state.plants.find((plant) => plant.id === plantId)?.status ?? "unknown",
        nextAction: state.plants.find((plant) => plant.id === plantId)?.nextAction ?? null,
        nextCheckAt: state.plants.find((plant) => plant.id === plantId)?.nextCheckAt ?? null,
        notificationEnabled: enabled
      });
      setState((current) => ({
        ...current,
        plants: current.plants.map((plant) => (plant.id === plantId ? { ...plant, notificationEnabled: enabled } : plant))
      }));
    },
    [repositories, state.plants]
  );

  const updatePlantNextCheck = useCallback(
    async (plantId: string, nextCheckAt?: string) => {
      const plant = state.plants.find((item) => item.id === plantId);
      await repositories?.plants.updateRecommendationState(plantId, {
        status: plant?.status ?? "unknown",
        nextAction: plant?.nextAction ?? null,
        nextCheckAt: nextCheckAt ?? null,
        careScheduleStatus: nextCheckAt ? "active" : "needs_first_check",
        notificationDueCycleKey: null
      });
      setState((current) => ({
        ...current,
        plants: current.plants.map((item) =>
          item.id === plantId
            ? {
                ...item,
                nextCheckAt,
                careScheduleStatus: nextCheckAt ? "active" : "needs_first_check",
                notificationDueCycleKey: undefined
              }
            : item
        )
      }));
      console.info("care_schedule_recalculated", { plantId, nextCheckAt });
    },
    [repositories, state.plants]
  );

  const deletePlant = useCallback(
    async (plantId: string) => {
      if (!repositories) return;
      const storagePaths = state.photos.filter((photo) => photo.plantId === plantId).map((photo) => photo.storagePath).filter(Boolean) as string[];
      await repositories.plants.deletePlant(plantId, storagePaths);
      setState((current) => ({
        plants: current.plants.filter((plant) => plant.id !== plantId),
        photos: current.photos.filter((photo) => photo.plantId !== plantId),
        careEvents: current.careEvents.filter((event) => event.plantId !== plantId),
        milestones: current.milestones.filter((milestone) => milestone.plantId !== plantId),
        analyses: current.analyses.filter((analysis) => analysis.plantId !== plantId),
        hypothesisResolutions: current.hypothesisResolutions.filter((resolution) => resolution.plantId !== plantId),
        homes: current.homes,
        rooms: current.rooms,
        secondaryDataReady: current.secondaryDataReady
      }));
    },
    [repositories, state.photos]
  );

  const value = useMemo(
    () => ({
      ...state,
      status,
      error,
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
      retry: bootstrap,
      signOut,
      getPlant,
      getPlantPhotos,
      getCoverPhoto,
      getPlantCareEvents,
      getPlantMilestones,
      getPlantAnalysis,
      getPlantHypothesisResolutions,
      ensureFullPhotoUrl,
      addPlant,
      updatePlant,
      addHome,
      updateHome,
      deleteHome,
      addRoom,
      updateRoom,
      deleteRoom,
      roomExists,
      addPlantPhoto,
      addPlantPhotos,
      setCoverPhoto,
      updatePhotoType,
      deletePlantPhoto,
      addMilestone,
      updateMilestone,
      deleteMilestone,
      waterPlant,
      recordSoilChecked,
      saveBaselineHistory,
      savePlantAnalysis,
      resolvePlantHypothesis,
      updatePlantNotification,
      updatePlantNextCheck,
      deletePlant
    }),
    [
      addMilestone,
      addPlant,
      addPlantPhoto,
      addPlantPhotos,
      addHome,
      addRoom,
      bootstrap,
      deleteHome,
      deleteMilestone,
      deleteRoom,
      deletePlant,
      deletePlantPhoto,
      error,
      ensureFullPhotoUrl,
      getCoverPhoto,
      getPlant,
      getPlantAnalysis,
      getPlantHypothesisResolutions,
      getPlantCareEvents,
      getPlantMilestones,
      getPlantPhotos,
      recordSoilChecked,
      saveBaselineHistory,
      savePlantAnalysis,
      resolvePlantHypothesis,
      roomExists,
      setCoverPhoto,
      signOut,
      state,
      status,
      updateMilestone,
      updateHome,
      updatePhotoType,
      updatePlant,
      updatePlantNextCheck,
      updatePlantNotification,
      updateRoom,
      user?.email,
      user?.id,
      waterPlant
    ]
  );

  return <PlantStoreContext.Provider value={value}>{children}</PlantStoreContext.Provider>;
}

export function usePlantStore() {
  const context = useContext(PlantStoreContext);

  if (!context) {
    throw new Error("usePlantStore must be used inside PlantStoreProvider");
  }

  return context;
}
