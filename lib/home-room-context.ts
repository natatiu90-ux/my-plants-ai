import type { HomeContext, Plant, Room } from "@/types/plant";

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
