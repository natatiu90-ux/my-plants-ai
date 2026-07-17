import type { HomeContext, Plant, Room } from "@/types/plant";

export type LegacyRoomImportGroup = {
  id: string;
  legacyKey: string | null;
  name: string;
  plantIds: string[];
  include: boolean;
};

export const noHomeSelectionId = "__no_home__";

export function normalizeRoomName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function buildLegacyRoomImportGroups(input: {
  plants: Plant[];
  rooms: Room[];
  translateRoomKey: (roomKey: string) => string;
}) {
  const groups = new Map<string, LegacyRoomImportGroup>();
  const plantsWithoutRoom: string[] = [];

  for (const plant of input.plants) {
    if (plant.homeId) {
      continue;
    }

    const roomKey = plant.roomId ?? plant.roomKey;
    if (!roomKey) {
      plantsWithoutRoom.push(plant.id);
      continue;
    }

    const room = input.rooms.find((item) => item.id === roomKey);
    const name = room?.name ?? (roomKey.startsWith("rooms.") ? input.translateRoomKey(roomKey) : roomKey);
    const normalizedName = normalizeRoomName(name);
    const existing = groups.get(normalizedName);
    if (existing) {
      existing.plantIds.push(plant.id);
      continue;
    }

    groups.set(normalizedName, {
      id: normalizedName || `room-${groups.size + 1}`,
      legacyKey: roomKey,
      name,
      plantIds: [plant.id],
      include: true
    });
  }

  return {
    rooms: Array.from(groups.values()),
    plantsWithoutRoom
  };
}

export function dedupeImportGroups(groups: LegacyRoomImportGroup[]) {
  const merged = new Map<string, LegacyRoomImportGroup>();
  for (const group of groups) {
    const normalized = normalizeRoomName(group.name);
    if (!normalized) {
      continue;
    }
    const existing = merged.get(normalized);
    if (existing) {
      existing.plantIds = Array.from(new Set(existing.plantIds.concat(group.plantIds)));
      existing.include = existing.include || group.include;
      continue;
    }
    merged.set(normalized, { ...group, id: normalized });
  }
  return Array.from(merged.values());
}

export function resolveSelectedHomeId(input: {
  storedHomeId: string | null | undefined;
  homes: HomeContext[];
  hasUnassignedPlants: boolean;
  shouldPreferUnassigned?: boolean;
}) {
  if (input.shouldPreferUnassigned && input.hasUnassignedPlants) {
    return noHomeSelectionId;
  }
  if (input.storedHomeId === noHomeSelectionId && input.hasUnassignedPlants) {
    return noHomeSelectionId;
  }
  if (input.storedHomeId && input.homes.some((home) => home.id === input.storedHomeId)) {
    return input.storedHomeId;
  }
  return input.homes[0]?.id ?? null;
}

export function plantsForHomeScope(plants: Plant[], selectedHomeId: string | null) {
  if (!selectedHomeId) {
    return plants;
  }
  if (selectedHomeId === noHomeSelectionId) {
    return plants.filter((plant) => !plant.homeId);
  }
  return plants.filter((plant) => plant.homeId === selectedHomeId);
}

export function shouldOfferExistingHomeImport(input: {
  homes: HomeContext[];
  plants: Plant[];
  homeId: string | undefined;
}) {
  if (!input.homeId || input.homes.length !== 1) {
    return false;
  }
  const unassignedPlantCount = input.plants.filter((plant) => !plant.homeId).length;
  return unassignedPlantCount > 0;
}

export function roomBelongsToHome(room: Room | undefined, homeId: string | undefined) {
  if (!room || !homeId) {
    return false;
  }
  return room.homeId === homeId;
}

export function normalizePlantLocationForHome(input: {
  homeId?: string;
  roomId?: string;
  positionInRoom?: Plant["positionInRoom"];
  rooms: Room[];
}) {
  const room = input.roomId ? input.rooms.find((item) => item.id === input.roomId) : undefined;
  const nextRoomId = roomBelongsToHome(room, input.homeId) ? input.roomId : undefined;
  return {
    homeId: input.homeId,
    roomId: nextRoomId,
    positionInRoom: nextRoomId ? input.positionInRoom : undefined
  };
}

export function applyDeletedRoomToPlant(plant: Plant, roomId: string): Plant {
  if (plant.roomId !== roomId && plant.roomKey !== roomId) {
    return plant;
  }
  return { ...plant, roomId: undefined, roomKey: undefined, positionInRoom: undefined };
}

export function applyDeletedHomeToPlant(plant: Plant, homeId: string): Plant {
  if (plant.homeId !== homeId) {
    return plant;
  }
  return { ...plant, homeId: undefined, roomId: undefined, roomKey: undefined, positionInRoom: undefined };
}

export function buildPlantEnvironmentContext(input: {
  plant?: Plant;
  homes: HomeContext[];
  rooms: Room[];
  legacyRoomName?: string;
}) {
  const plant = input.plant;
  const home = plant?.homeId ? input.homes.find((item) => item.id === plant.homeId) : undefined;
  const roomId = plant?.roomId ?? (plant?.roomKey?.startsWith("rooms.") ? undefined : plant?.roomKey);
  const room = roomId ? input.rooms.find((item) => item.id === roomId) : undefined;
  const hasStructuredContext = Boolean(home || room || plant?.positionInRoom);

  if (!plant && !hasStructuredContext && !input.legacyRoomName) {
    return null;
  }

  return {
    home: home
      ? {
          name: home.name,
          city: home.city ?? null,
          country: home.country ?? null,
          type: home.type ?? null,
          humidityLevel: home.humidityLevel ?? null,
          hasAirConditioning: home.hasAirConditioning ?? null
        }
      : null,
    room: room
      ? {
          name: room.name,
          lightLevel: room.lightLevel ?? null,
          directSun: room.directSun ?? null,
          temperatureRelative: room.temperatureRelative ?? null,
          hasAirConditioning: room.hasAirConditioning ?? null,
          notes: room.notes ?? null
        }
      : null,
    plantPosition: plant?.positionInRoom ?? null,
    legacyLocation: !room ? input.legacyRoomName ?? plant?.homeName ?? null : null
  };
}

export function formatEnvironmentContextForPrompt(context: ReturnType<typeof buildPlantEnvironmentContext>) {
  if (!context) {
    return "No structured home or room context was provided.";
  }
  return JSON.stringify(context);
}
