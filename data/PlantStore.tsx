"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { mockCareEvents, mockMilestones, mockPhotos, mockPlants } from "@/data/mockPlants";
import { addDays, toDateKey } from "@/lib/date-format";
import { PhotoStorageRepository } from "@/lib/photo-storage";
import type { PhotoType, Plant, PlantCareEvent, PlantMilestone, PlantPhoto, Room } from "@/types/plant";

type PlantState = {
  plants: Plant[];
  photos: PlantPhoto[];
  careEvents: PlantCareEvent[];
  milestones: PlantMilestone[];
  rooms: Room[];
};

type PlantStoreValue = PlantState & {
  getPlant: (id: string) => Plant | undefined;
  getPlantPhotos: (plantId: string) => PlantPhoto[];
  getCoverPhoto: (plantId: string) => PlantPhoto | undefined;
  getPlantCareEvents: (plantId: string) => PlantCareEvent[];
  getPlantMilestones: (plantId: string) => PlantMilestone[];
  addPlant: (input: {
    homeName?: string;
    speciesName: string;
    roomKey?: Plant["roomKey"];
    coverPhotoUrl?: string;
    notes?: string;
    photos?: { url: string; type: PhotoType; isCover?: boolean }[];
  }) => string;
  updatePlant: (plantId: string, input: { homeName?: string; roomKey?: Plant["roomKey"]; notes?: string }) => void;
  addRoom: (name: string) => Room;
  roomExists: (name: string) => boolean;
  addPlantPhoto: (plantId: string, input: { url: string; type: PhotoType; isCover?: boolean }) => PlantPhoto;
  addPlantPhotos: (plantId: string, inputs: { url: string; type: PhotoType; isCover?: boolean }[]) => PlantPhoto[];
  setCoverPhoto: (plantId: string, photoId: string) => void;
  updatePhotoType: (photoId: string, type: PhotoType) => void;
  deletePlantPhoto: (plantId: string, photoId: string) => Promise<"deleted" | "only-photo">;
  addMilestone: (
    plantId: string,
    input: { type: PlantMilestone["type"]; eventDate: string; note?: string; photoId?: string }
  ) => PlantMilestone;
  updateMilestone: (
    milestoneId: string,
    input: { type: PlantMilestone["type"]; eventDate: string; note?: string; photoId?: string }
  ) => void;
  deleteMilestone: (milestoneId: string) => void;
  waterPlant: (plantId: string) => void;
  recordSoilChecked: (plantId: string, result: string) => void;
  deletePlant: (plantId: string) => void;
};

const PlantStoreContext = createContext<PlantStoreValue | null>(null);
const storageKey = "my-plants-store-v4";

function createInitialState(): PlantState {
  return {
    plants: mockPlants,
    photos: mockPhotos,
    careEvents: mockCareEvents,
    milestones: mockMilestones,
    rooms: []
  };
}

function readStoredState(): PlantState {
  if (typeof window === "undefined") {
    return createInitialState();
  }

  try {
    const storedValue = window.localStorage.getItem(storageKey);
    if (!storedValue) {
      return createInitialState();
    }

    const parsed = JSON.parse(storedValue) as PlantState;
    if (
      !Array.isArray(parsed.plants) ||
      !Array.isArray(parsed.photos) ||
      !Array.isArray(parsed.careEvents) ||
      !Array.isArray(parsed.milestones)
    ) {
      return createInitialState();
    }

    return {
      ...parsed,
      rooms: Array.isArray(parsed.rooms) ? parsed.rooms : []
    };
  } catch {
    return createInitialState();
  }
}

export function PlantStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlantState>(createInitialState);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    setState(readStoredState());
    setHasLoaded(true);
  }, []);

  useEffect(() => {
    if (hasLoaded) {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    }
  }, [hasLoaded, state]);

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
    (name: string) => {
      const normalized = name.trim().toLocaleLowerCase();
      const builtInRooms = [
        "living room",
        "bedroom",
        "kitchen",
        "bathroom",
        "office",
        "balcony",
        "гостиная",
        "спальня",
        "кухня",
        "ванная",
        "кабинет",
        "балкон"
      ];
      return builtInRooms.includes(normalized) || state.rooms.some((room) => room.name.trim().toLocaleLowerCase() === normalized);
    },
    [state.rooms]
  );

  const addRoom = useCallback((name: string) => {
    const room: Room = {
      id: `room-${Date.now()}`,
      name: name.trim(),
      isCustom: true,
      createdAt: toDateKey(new Date())
    };

    setState((current) => ({
      ...current,
      rooms: [...current.rooms, room]
    }));

    return room;
  }, []);

  const addPlant = useCallback((input: {
    homeName?: string;
    speciesName: string;
    roomKey?: Plant["roomKey"];
    coverPhotoUrl?: string;
    notes?: string;
    photos?: { url: string; type: PhotoType; isCover?: boolean }[];
  }) => {
    const plantId = `plant-${Date.now()}`;
    const todayKey = toDateKey(new Date());
    const photoInputs = input.photos?.length ? input.photos : [{ url: input.coverPhotoUrl ?? "/plants/martha.png", type: "overview" as PhotoType, isCover: true }];
    const selectedCoverIndex = Math.max(0, photoInputs.findIndex((photo) => photo.isCover));
    const plantPhotos = photoInputs.map((photo, index) => ({
      id: `${plantId}-photo-${Date.now()}-${index}`,
      plantId,
      url: photo.url,
      storageId: photo.url.startsWith("photo://") ? photo.url.replace("photo://", "") : undefined,
      type: photo.type,
      createdAt: todayKey,
      isCover: index === selectedCoverIndex,
      analysis: { status: "pending" as const }
    }));

    setState((current) => ({
      ...current,
      plants: [
        {
          id: plantId,
          homeName: input.homeName || undefined,
          speciesName: input.speciesName,
          status: "healthy",
          messageKey: "plants.new.message",
          statusLabelKey: "status.doingGreat",
          nextAction: null,
          nextCheckAt: toDateKey(addDays(new Date(), 4)),
          roomKey: input.roomKey,
          lightConditionKey: "light.mediumIndirect",
          notes: input.notes
        },
        ...current.plants
      ],
      photos: [...plantPhotos, ...current.photos],
      milestones: [
        {
          id: `${plantId}-added-${Date.now()}`,
          plantId,
          type: "plant_added",
          createdAt: todayKey,
          titleKey: "milestones.plant_added.title",
          descriptionKey: "milestones.new.plant_added.description"
        },
        ...current.milestones
      ]
    }));
    return plantId;
  }, []);

  const updatePlant = useCallback((plantId: string, input: { homeName?: string; roomKey?: Plant["roomKey"]; notes?: string }) => {
    setState((current) => ({
      ...current,
      plants: current.plants.map((plant) =>
        plant.id === plantId
          ? {
              ...plant,
              homeName: input.homeName || undefined,
              roomKey: input.roomKey,
              notes: input.notes
            }
          : plant
      )
    }));
  }, []);

  const addPlantPhoto = useCallback((plantId: string, input: { url: string; type: PhotoType; isCover?: boolean }) => {
    let createdPhoto: PlantPhoto;

    setState((current) => {
      const shouldBeCover = Boolean(input.isCover) || !current.photos.some((photo) => photo.plantId === plantId);
      createdPhoto = {
        id: `${plantId}-photo-${Date.now()}`,
        plantId,
        url: input.url,
        storageId: input.url.startsWith("photo://") ? input.url.replace("photo://", "") : undefined,
        type: input.type,
        createdAt: toDateKey(new Date()),
        isCover: shouldBeCover,
        analysis: { status: "pending" }
      };

      return {
        ...current,
        photos: [
          createdPhoto,
          ...current.photos.map((existingPhoto) =>
            shouldBeCover && existingPhoto.plantId === plantId ? { ...existingPhoto, isCover: false } : existingPhoto
          )
        ],
        careEvents: [
          {
            id: `${plantId}-photo-event-${Date.now()}`,
            plantId,
            type: "photo_added",
            createdAt: createdPhoto.createdAt,
            metadata: { photoType: input.type }
          },
          ...current.careEvents
        ]
      };
    });

    return createdPhoto!;
  }, []);

  const addPlantPhotos = useCallback((plantId: string, inputs: { url: string; type: PhotoType; isCover?: boolean }[]) => {
    if (!inputs.length) {
      return [];
    }

    let createdPhotos: PlantPhoto[] = [];

    setState((current) => {
      const hasExistingPhotos = current.photos.some((photo) => photo.plantId === plantId);
      const selectedCoverIndex = inputs.findIndex((photo) => photo.isCover);
      const shouldAssignCover = selectedCoverIndex >= 0 || !hasExistingPhotos;
      const coverIndex = selectedCoverIndex >= 0 ? selectedCoverIndex : 0;
      const todayKey = toDateKey(new Date());

      createdPhotos = inputs.map((input, index) => ({
        id: `${plantId}-photo-${Date.now()}-${index}`,
        plantId,
        url: input.url,
        storageId: input.url.startsWith("photo://") ? input.url.replace("photo://", "") : undefined,
        type: input.type,
        createdAt: todayKey,
        isCover: shouldAssignCover && index === coverIndex,
        analysis: { status: "pending" as const }
      }));

      return {
        ...current,
        photos: [
          ...createdPhotos,
          ...current.photos.map((existingPhoto) =>
            shouldAssignCover && existingPhoto.plantId === plantId ? { ...existingPhoto, isCover: false } : existingPhoto
          )
        ],
        careEvents: [
          ...createdPhotos.map((photo) => ({
            id: `${photo.id}-event`,
            plantId,
            type: "photo_added" as const,
            createdAt: photo.createdAt,
            metadata: { photoType: photo.type }
          })),
          ...current.careEvents
        ]
      };
    });

    return createdPhotos;
  }, []);

  const setCoverPhoto = useCallback((plantId: string, photoId: string) => {
    setState((current) => ({
      ...current,
      photos: current.photos.map((photo) =>
        photo.plantId === plantId ? { ...photo, isCover: photo.id === photoId } : photo
      )
    }));
  }, []);

  const updatePhotoType = useCallback((photoId: string, type: PhotoType) => {
    setState((current) => ({
      ...current,
      photos: current.photos.map((photo) => (photo.id === photoId ? { ...photo, type } : photo))
    }));
  }, []);

  const deletePlantPhoto = useCallback(async (plantId: string, photoId: string) => {
    let storageIdToDelete: string | undefined;
    let deleted = false;

    setState((current) => {
      const plantPhotos = current.photos
        .filter((photo) => photo.plantId === plantId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      if (plantPhotos.length <= 1) {
        return current;
      }

      const deletedPhoto = plantPhotos.find((photo) => photo.id === photoId);
      if (!deletedPhoto) {
        return current;
      }

      storageIdToDelete = deletedPhoto.storageId ?? (deletedPhoto.url.startsWith("photo://") ? deletedPhoto.url.replace("photo://", "") : undefined);
      deleted = true;

      const remainingPlantPhotos = plantPhotos.filter((photo) => photo.id !== photoId);
      const promotedCover =
        deletedPhoto.isCover
          ? remainingPlantPhotos.find((photo) => photo.type === "overview") ?? remainingPlantPhotos[0]
          : remainingPlantPhotos.find((photo) => photo.isCover);

      return {
        ...current,
        photos: current.photos
          .filter((photo) => photo.id !== photoId)
          .map((photo) =>
            photo.plantId === plantId && promotedCover ? { ...photo, isCover: photo.id === promotedCover.id } : photo
          )
      };
    });

    if (!deleted) {
      return "only-photo";
    }

    if (storageIdToDelete) {
      await PhotoStorageRepository.deletePhoto(storageIdToDelete);
    }

    return "deleted";
  }, []);

  const addMilestone = useCallback(
    (plantId: string, input: { type: PlantMilestone["type"]; eventDate: string; note?: string; photoId?: string }) => {
      const milestone: PlantMilestone = {
        id: `${plantId}-milestone-${Date.now()}`,
        plantId,
        type: input.type,
        createdAt: toDateKey(new Date()),
        eventDate: input.eventDate,
        note: input.note?.trim() || undefined,
        photoId: input.photoId,
        isManual: true
      };

      setState((current) => ({
        ...current,
        milestones: [milestone, ...current.milestones]
      }));

      return milestone;
    },
    []
  );

  const updateMilestone = useCallback(
    (milestoneId: string, input: { type: PlantMilestone["type"]; eventDate: string; note?: string; photoId?: string }) => {
      setState((current) => ({
        ...current,
        milestones: current.milestones.map((milestone) =>
          milestone.id === milestoneId && milestone.isManual
            ? {
                ...milestone,
                type: input.type,
                eventDate: input.eventDate,
                note: input.note?.trim() || undefined,
                photoId: input.photoId
              }
            : milestone
        )
      }));
    },
    []
  );

  const deleteMilestone = useCallback((milestoneId: string) => {
    setState((current) => ({
      ...current,
      milestones: current.milestones.filter((milestone) => milestone.id !== milestoneId || !milestone.isManual)
    }));
  }, []);

  const waterPlant = useCallback((plantId: string) => {
    setState((current) => {
      const today = new Date();
      const todayKey = toDateKey(today);
      const nextCheckAt = toDateKey(addDays(today, 4));

      return {
        plants: current.plants.map((plant) =>
          plant.id === plantId
            ? {
                ...plant,
                status: "healthy",
                statusLabelKey: "status.doingGreat",
                messageKey: "plants.afterWatering.message",
                nextAction: null,
                lastWateredAt: todayKey,
                nextCheckAt
              }
            : plant
        ),
        careEvents: [
          {
            id: `${plantId}-watered-${Date.now()}`,
            plantId,
            type: "watered",
            createdAt: todayKey
          },
          ...current.careEvents
        ],
        photos: current.photos,
        milestones: current.milestones,
        rooms: current.rooms
      };
    });
  }, []);

  const recordSoilChecked = useCallback((plantId: string, result: string) => {
    setState((current) => ({
      ...current,
      careEvents: [
        {
          id: `${plantId}-soil-${Date.now()}`,
          plantId,
          type: "soil_checked",
          createdAt: toDateKey(new Date()),
          metadata: { result }
        },
        ...current.careEvents
      ]
    }));
  }, []);

  const deletePlant = useCallback((plantId: string) => {
    setState((current) => ({
      plants: current.plants.filter((plant) => plant.id !== plantId),
      photos: current.photos.filter((photo) => photo.plantId !== plantId),
      careEvents: current.careEvents.filter((event) => event.plantId !== plantId),
      milestones: current.milestones.filter((milestone) => milestone.plantId !== plantId),
      rooms: current.rooms
    }));
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      getPlant,
      getPlantPhotos,
      getCoverPhoto,
      getPlantCareEvents,
      getPlantMilestones,
      addPlant,
      updatePlant,
      addRoom,
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
      addPlant,
      addPlantPhoto,
      addPlantPhotos,
      addMilestone,
      deletePlant,
      deletePlantPhoto,
      deleteMilestone,
      getCoverPhoto,
      getPlant,
      getPlantCareEvents,
      getPlantMilestones,
      getPlantPhotos,
      recordSoilChecked,
      addRoom,
      roomExists,
      setCoverPhoto,
      state,
      updatePlant,
      updateMilestone,
      updatePhotoType,
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
