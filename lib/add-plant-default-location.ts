import type { HomeContext, Plant, Room } from "@/types/plant";

export const lastUsedAddPlantHomeStorageKey = "my_plants_last_add_plant_home_id";
export const lastUsedAddPlantRoomStorageKey = "my_plants_last_add_plant_room_id";
export const selectedHomeStoragePrefix = "my_plants_selected_home_";

export type AddPlantDefaultLocation = {
  homeId?: string;
  roomId?: string;
  requiresHomeChoice: boolean;
};

export function deriveAddPlantDefaultLocation(input: {
  homes: HomeContext[];
  rooms: Room[];
  plants: Pick<Plant, "homeId" | "roomId" | "updatedAt">[];
  lastUsedHomeId?: string | null;
  lastUsedRoomId?: string | null;
  activeHomeId?: string | null;
}): AddPlantDefaultLocation {
  const existingHomeIds = new Set(input.homes.map((home) => home.id));
  const existingRoomIds = new Set(input.rooms.map((room) => room.id));
  const roomById = new Map(input.rooms.map((room) => [room.id, room]));

  const mostRecentPlantHomeId = [...input.plants]
    .filter((plant) => plant.homeId && existingHomeIds.has(plant.homeId))
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0]?.homeId;

  const homeId =
    (input.lastUsedHomeId && existingHomeIds.has(input.lastUsedHomeId) ? input.lastUsedHomeId : undefined) ??
    mostRecentPlantHomeId ??
    (input.activeHomeId && existingHomeIds.has(input.activeHomeId) ? input.activeHomeId : undefined) ??
    (input.homes.length === 1 ? input.homes[0]?.id : undefined);

  if (!homeId) {
    return { homeId: undefined, roomId: undefined, requiresHomeChoice: input.homes.length > 1 };
  }

  const roomsInHome = input.rooms.filter((room) => room.homeId === homeId);
  const lastRoom = input.lastUsedRoomId && existingRoomIds.has(input.lastUsedRoomId) ? roomById.get(input.lastUsedRoomId) : undefined;
  const mostRecentPlantRoomId = [...input.plants]
    .filter((plant) => plant.homeId === homeId && plant.roomId && existingRoomIds.has(plant.roomId))
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0]?.roomId;
  const roomId =
    (lastRoom?.homeId === homeId ? lastRoom.id : undefined) ??
    mostRecentPlantRoomId ??
    (roomsInHome.length === 1 ? roomsInHome[0]?.id : undefined);

  return { homeId, roomId, requiresHomeChoice: false };
}

export function rememberAddPlantLocation(input: { homeId?: string; roomId?: string }) {
  if (typeof window === "undefined") return;
  if (input.homeId) {
    window.localStorage.setItem(lastUsedAddPlantHomeStorageKey, input.homeId);
  }
  if (input.roomId) {
    window.localStorage.setItem(lastUsedAddPlantRoomStorageKey, input.roomId);
  }
}
