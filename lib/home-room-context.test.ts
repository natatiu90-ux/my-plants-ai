import assert from "node:assert/strict";
import {
  applyDeletedHomeToPlant,
  applyDeletedRoomToPlant,
  buildPlantEnvironmentContext,
  normalizePlantLocationForHome,
  roomBelongsToHome
} from "./home-room-context";
import type { HomeContext, Plant, Room } from "@/types/plant";

const home: HomeContext = {
  id: "home-1",
  name: "Main home",
  city: "Limassol",
  country: "Cyprus",
  humidityLevel: "dry",
  hasAirConditioning: true,
  createdAt: "2026-07-16"
};

const otherHome: HomeContext = {
  id: "home-2",
  name: "Other home",
  createdAt: "2026-07-16"
};

const room: Room = {
  id: "room-1",
  homeId: home.id,
  name: "Bright room",
  isCustom: true,
  lightLevel: "bright_indirect",
  directSun: "morning",
  temperatureRelative: "warm",
  hasAirConditioning: "inherit",
  createdAt: "2026-07-16"
};

const plant: Plant = {
  id: "plant-1",
  homeId: home.id,
  roomId: room.id,
  roomKey: room.id,
  positionInRoom: "near_window",
  speciesName: "Monstera",
  status: "healthy",
  messageKey: "plants.afterWatering.message",
  statusLabelKey: "status.doingGreat",
  careScheduleStatus: "active",
  notificationEnabled: true
};

assert.equal(roomBelongsToHome(room, home.id), true);
assert.equal(roomBelongsToHome(room, otherHome.id), false);

assert.deepEqual(
  normalizePlantLocationForHome({ homeId: otherHome.id, roomId: room.id, positionInRoom: "near_window", rooms: [room] }),
  { homeId: otherHome.id, roomId: undefined, positionInRoom: undefined }
);

assert.equal(applyDeletedRoomToPlant(plant, room.id).roomId, undefined);
assert.equal(applyDeletedHomeToPlant(plant, home.id).homeId, undefined);

const context = buildPlantEnvironmentContext({ plant, homes: [home], rooms: [room] });
assert.equal(context?.home?.city, "Limassol");
assert.equal(context?.room?.lightLevel, "bright_indirect");
assert.equal(context?.plantPosition, "near_window");

const legacyContext = buildPlantEnvironmentContext({
  plant: { ...plant, homeId: undefined, roomId: undefined, roomKey: "rooms.kitchen" },
  homes: [],
  rooms: [],
  legacyRoomName: "Kitchen"
});
assert.equal(legacyContext?.legacyLocation, "Kitchen");

console.log("home-room-context tests passed");
