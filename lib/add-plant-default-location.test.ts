import assert from "node:assert/strict";
import { deriveAddPlantDefaultLocation } from "./add-plant-default-location";
import type { HomeContext, Plant, Room } from "@/types/plant";

const home = (id: string, name = id): HomeContext => ({ id, name, createdAt: "2026-07-22T00:00:00.000Z" });
const room = (id: string, homeId: string): Room => ({ id, homeId, name: id, isCustom: true, createdAt: "2026-07-22T00:00:00.000Z" });
const plant = (input: Partial<Plant>): Pick<Plant, "homeId" | "roomId" | "updatedAt"> => ({
  homeId: input.homeId,
  roomId: input.roomId,
  updatedAt: input.updatedAt
});

assert.deepEqual(
  deriveAddPlantDefaultLocation({ homes: [home("home-1")], rooms: [], plants: [] }),
  { homeId: "home-1", roomId: undefined, requiresHomeChoice: false },
  "one existing home becomes default"
);

assert.deepEqual(
  deriveAddPlantDefaultLocation({ homes: [home("home-1"), home("home-2")], rooms: [], plants: [], lastUsedHomeId: "home-2" }).homeId,
  "home-2",
  "last used home is reused"
);

assert.deepEqual(
  deriveAddPlantDefaultLocation({ homes: [home("home-1")], rooms: [room("room-1", "home-1"), room("room-2", "home-1")], plants: [], lastUsedHomeId: "home-1", lastUsedRoomId: "room-2" }).roomId,
  "room-2",
  "last used room is reused"
);

assert.equal(
  deriveAddPlantDefaultLocation({ homes: [home("home-1")], rooms: [room("room-1", "home-1")], plants: [], lastUsedHomeId: "home-1", lastUsedRoomId: "deleted-room" }).roomId,
  "room-1",
  "deleted room is not reused and single available room is selected"
);

assert.deepEqual(
  deriveAddPlantDefaultLocation({ homes: [home("home-1"), home("home-2")], rooms: [], plants: [] }),
  { homeId: undefined, roomId: undefined, requiresHomeChoice: true },
  "multiple homes without history require choice"
);

assert.deepEqual(
  deriveAddPlantDefaultLocation({ homes: [], rooms: [], plants: [] }),
  { homeId: undefined, roomId: undefined, requiresHomeChoice: false },
  "first plant can still be added without home"
);
