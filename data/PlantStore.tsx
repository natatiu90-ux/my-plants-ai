"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { addDays, toDateKey } from "@/lib/date-format";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { createRepositories } from "@/lib/repositories/supabase-repositories";
import { commonNameFromScientificName } from "@/lib/plant-display";
import type { PhotoType, Plant, PlantCareEvent, PlantMilestone, PlantPhoto, Room } from "@/types/plant";

type PlantState = {
  plants: Plant[];
  photos: PlantPhoto[];
  careEvents: PlantCareEvent[];
  milestones: PlantMilestone[];
  rooms: Room[];
};

type StoreStatus = "loading" | "ready" | "error";

type AddPlantInput = {
  homeName?: string;
  speciesName: string;
  scientificName?: string;
  roomKey?: Plant["roomKey"];
  coverPhotoUrl?: string;
  notes?: string;
  lastWateredAt?: string;
  photos?: { url: string; type: PhotoType; isCover?: boolean }[];
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
  retry: () => Promise<void>;
  getPlant: (id: string) => Plant | undefined;
  getPlantPhotos: (plantId: string) => PlantPhoto[];
  getCoverPhoto: (plantId: string) => PlantPhoto | undefined;
  getPlantCareEvents: (plantId: string) => PlantCareEvent[];
  getPlantMilestones: (plantId: string) => PlantMilestone[];
  addPlant: (input: AddPlantInput) => Promise<string>;
  updatePlant: (plantId: string, input: { homeName?: string; speciesName?: string; scientificName?: string; roomKey?: Plant["roomKey"]; notes?: string }) => Promise<void>;
  addRoom: (name: string) => Promise<Room>;
  deleteRoom: (roomId: string, replacementRoomKey?: Plant["roomKey"]) => Promise<void>;
  roomExists: (name: string) => boolean;
  addPlantPhoto: (plantId: string, input: { url: string; type: PhotoType; isCover?: boolean }) => Promise<PlantPhoto | undefined>;
  addPlantPhotos: (plantId: string, inputs: { url: string; type: PhotoType; isCover?: boolean }[]) => Promise<PlantPhoto[]>;
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
  recordSoilChecked: (plantId: string, result: string) => Promise<void>;
  deletePlant: (plantId: string) => Promise<void>;
};

type Repositories = Awaited<ReturnType<typeof createRepositories>>;

const PlantStoreContext = createContext<PlantStoreValue | null>(null);

const emptyState: PlantState = {
  plants: [],
  photos: [],
  careEvents: [],
  milestones: [],
  rooms: []
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

  const loadData = useCallback(async (nextRepositories: Repositories) => {
    const [plants, photos, rooms, milestones, careEvents] = await Promise.all([
      nextRepositories.plants.listPlants(),
      nextRepositories.photos.listPhotos(),
      nextRepositories.rooms.listRooms(),
      nextRepositories.milestones.listMilestones(),
      nextRepositories.careEvents.listCareEvents()
    ]);

    setState({ plants, photos, rooms, milestones, careEvents });
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

      let nextUser = sessionData.session?.user ?? null;
      if (!nextUser) {
        const { data, error: signInError } = await supabase.auth.signInAnonymously();
        if (signInError) {
          throw signInError;
        }
        nextUser = data.user;
      }

      if (!nextUser) {
        throw new Error("Anonymous session was not created.");
      }

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
  }, [loadData]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

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

  const roomExists = useCallback(
    (name: string) => builtInRoomExists(name) || state.rooms.some((room) => room.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase()),
    [state.rooms]
  );

  const addRoom = useCallback(
    async (name: string) => {
      if (!repositories) {
        throw new Error("Plant collection is not ready.");
      }

      const trimmedName = name.trim();
      const existingRoom = state.rooms.find((room) => room.name.trim().toLocaleLowerCase() === trimmedName.toLocaleLowerCase());
      if (existingRoom) {
        return existingRoom;
      }

      const room = await repositories.rooms.addRoom(trimmedName);
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

  const deleteRoom = useCallback(
    async (roomId: string, replacementRoomKey?: Plant["roomKey"]) => {
      if (!repositories) {
        throw new Error("Plant collection is not ready.");
      }

      await repositories.rooms.deleteRoom(roomId, replacementRoomKey);
      setState((current) => ({
        ...current,
        rooms: current.rooms.filter((room) => room.id !== roomId),
        plants: current.plants.map((plant) => (plant.roomKey === roomId ? { ...plant, roomKey: replacementRoomKey } : plant))
      }));
    },
    [repositories]
  );

  const addPlantPhotos = useCallback(
    async (plantId: string, inputs: { url: string; type: PhotoType; isCover?: boolean }[]) => {
      if (!repositories || !inputs.length) {
        return [];
      }

      const hasExistingPhotos = state.photos.some((photo) => photo.plantId === plantId);
      const photos = await repositories.photos.addPhotos(plantId, inputs, hasExistingPhotos);
      const shouldAssignCover = photos.some((photo) => photo.isCover);

      setState((current) => ({
        ...current,
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
    [repositories, state.photos]
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
      const plant = await repositories.plants.createPlant({
        homeName: input.homeName,
        speciesName: input.speciesName,
        scientificName: input.scientificName,
        roomKey: input.roomKey,
        notes: input.notes,
        status: input.analysis?.condition ?? "unknown",
        nextAction: input.analysis?.nextAction ?? null,
        lastWateredAt: input.lastWateredAt,
        nextCheckAt
      });

      const photos = await repositories.photos.addPhotos(plant.id, input.photos ?? [], false);
      const milestone = await repositories.milestones.addMilestone(plant.id, {
        type: "plant_added",
        eventDate: toDateKey(new Date())
      });
      const wateringMilestone = input.lastWateredAt
        ? await repositories.milestones.addMilestone(plant.id, {
            type: "watered",
            eventDate: input.lastWateredAt
          })
        : null;
      if (input.lastWateredAt) {
        await repositories.careEvents.addCareEvent(plant.id, { type: "watered", eventDate: input.lastWateredAt });
      }

      if (input.analysis) {
        await repositories.analyses.addAnalysis({
          plantId: plant.id,
          sourcePhotoIds: photos.map((photo) => photo.id),
          detectedSpecies: input.analysis.detectedSpecies,
          confidence: input.analysis.confidence,
          condition: input.analysis.condition,
          nextAction: input.analysis.nextAction,
          summaryEn: input.analysis.summary?.en,
          summaryRu: input.analysis.summary?.ru,
          recommendations: input.analysis.recommendations,
          rawResult: input.analysis.rawResult,
          model: input.analysis.model
        });
      }

      setState((current) => ({
        ...current,
        plants: [plant, ...current.plants],
        photos: [...photos, ...current.photos],
        milestones: [milestone, ...(wateringMilestone ? [wateringMilestone] : []), ...current.milestones],
        careEvents: [
          ...(input.lastWateredAt
            ? [{ id: `${plant.id}-watered-${Date.now()}`, plantId: plant.id, type: "watered" as const, createdAt: input.lastWateredAt }]
            : []),
          ...current.careEvents
        ]
      }));

      return plant.id;
    },
    [repositories]
  );

  const updatePlant = useCallback(
    async (plantId: string, input: { homeName?: string; speciesName?: string; scientificName?: string; roomKey?: Plant["roomKey"]; notes?: string }) => {
      await repositories?.plants.updatePlant(plantId, input);
      setState((current) => ({
        ...current,
        plants: current.plants.map((plant) =>
          plant.id === plantId
            ? {
                ...plant,
                homeName: input.homeName || undefined,
                speciesName: input.speciesName || commonNameFromScientificName(input.scientificName),
                scientificName: input.scientificName || undefined,
                roomKey: input.roomKey,
                notes: input.notes
              }
            : plant
        )
      }));
    },
    [repositories]
  );

  const addPlantPhoto = useCallback(
    async (plantId: string, input: { url: string; type: PhotoType; isCover?: boolean }) => {
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
                nextCheckAt
              }
            : plant
        ),
        careEvents: [{ id: `${plantId}-watered-${Date.now()}`, plantId, type: "watered", createdAt: toDateKey(new Date()) }, ...current.careEvents]
      }));
    },
    [repositories]
  );

  const recordSoilChecked = useCallback(
    async (plantId: string, result: string) => {
      await repositories?.careEvents.addCareEvent(plantId, { type: "soil_checked", metadata: { result } });
      setState((current) => ({
        ...current,
        careEvents: [
          { id: `${plantId}-soil-${Date.now()}`, plantId, type: "soil_checked", createdAt: toDateKey(new Date()), metadata: { result } },
          ...current.careEvents
        ]
      }));
    },
    [repositories]
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
        rooms: current.rooms
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
      retry: bootstrap,
      getPlant,
      getPlantPhotos,
      getCoverPhoto,
      getPlantCareEvents,
      getPlantMilestones,
      addPlant,
      updatePlant,
      addRoom,
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
      deletePlant
    }),
    [
      addMilestone,
      addPlant,
      addPlantPhoto,
      addPlantPhotos,
      addRoom,
      bootstrap,
      deleteMilestone,
      deleteRoom,
      deletePlant,
      deletePlantPhoto,
      error,
      getCoverPhoto,
      getPlant,
      getPlantCareEvents,
      getPlantMilestones,
      getPlantPhotos,
      recordSoilChecked,
      roomExists,
      setCoverPhoto,
      state,
      status,
      updateMilestone,
      updatePhotoType,
      updatePlant,
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
