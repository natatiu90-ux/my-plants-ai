import assert from "node:assert/strict";
import {
  applyDeletedHomeToPlant,
  applyDeletedRoomToPlant,
  buildLegacyRoomImportGroups,
  buildPlantEnvironmentContext,
  dedupeImportGroups,
  normalizePlantLocationForHome,
  plantsForHomeScope,
  resolveSelectedHomeId,
  roomBelongsToHome,
  shouldOfferExistingHomeImport
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

const strovolosHome: HomeContext = { ...home, id: "home-strovolos", name: "Home", city: "Strovolos", country: "Cyprus", humidityLevel: "dry" };
const lowLightRoom: Room = { ...room, id: "room-low", homeId: strovolosHome.id, name: "Kids room", lightLevel: "low", directSun: "morning" };
const portulacaria: Plant = { ...plant, id: "portulacaria", homeId: strovolosHome.id, roomId: lowLightRoom.id, scientificName: "Portulacaria afra" };
const strovolosContext = buildPlantEnvironmentContext({ plant: portulacaria, homes: [strovolosHome], rooms: [lowLightRoom] });
assert.equal(strovolosContext?.home?.city, "Strovolos");
assert.equal(strovolosContext?.home?.country, "Cyprus");
assert.equal(strovolosContext?.room?.lightLevel, "low");
assert.equal(strovolosContext?.room?.directSun, "morning");

const eveningSunRoom: Room = {
  ...room,
  id: "room-evening",
  name: "Warm evening room",
  lightLevel: "bright_indirect",
  directSun: "evening",
  temperatureRelative: "warm",
  hasAirConditioning: "no"
};
const eveningContext = buildPlantEnvironmentContext({ plant: { ...plant, roomId: eveningSunRoom.id }, homes: [home], rooms: [eveningSunRoom] });
assert.equal(eveningContext?.room?.lightLevel, "bright_indirect");
assert.equal(eveningContext?.room?.directSun, "evening");
assert.equal(eveningContext?.room?.temperatureRelative, "warm");
assert.equal(eveningContext?.room?.hasAirConditioning, "no");

const legacyContext = buildPlantEnvironmentContext({
  plant: { ...plant, homeId: undefined, roomId: undefined, roomKey: "rooms.kitchen" },
  homes: [],
  rooms: [],
  legacyRoomName: "Kitchen"
});
assert.equal(legacyContext?.legacyLocation, "Kitchen");

const legacyPlants: Plant[] = [
  { ...plant, id: "legacy-1", homeId: undefined, roomId: undefined, roomKey: "rooms.kitchen" },
  { ...plant, id: "legacy-2", homeId: undefined, roomId: undefined, roomKey: "rooms.kitchen" },
  { ...plant, id: "legacy-3", homeId: undefined, roomId: undefined, roomKey: undefined }
];
const importPlan = buildLegacyRoomImportGroups({
  plants: legacyPlants,
  rooms: [],
  translateRoomKey: () => "Kitchen"
});
assert.equal(importPlan.rooms.length, 1);
assert.equal(importPlan.rooms[0].plantIds.length, 2);
assert.equal(importPlan.plantsWithoutRoom.length, 1);

const deduped = dedupeImportGroups([
  { id: "a", legacyKey: "a", name: "Kitchen", plantIds: ["1"], include: true },
  { id: "b", legacyKey: "b", name: " kitchen ", plantIds: ["2"], include: true }
]);
assert.equal(deduped.length, 1);
assert.deepEqual(deduped[0].plantIds.sort(), ["1", "2"]);

assert.deepEqual(plantsForHomeScope([plant, { ...plant, id: "free", homeId: undefined }], home.id).map((item) => item.id), ["plant-1"]);
assert.deepEqual(plantsForHomeScope([plant, { ...plant, id: "free", homeId: undefined }], "__no_home__").map((item) => item.id), ["free"]);
assert.equal(resolveSelectedHomeId({ storedHomeId: "missing", homes: [home], hasUnassignedPlants: false }), home.id);
assert.equal(resolveSelectedHomeId({ storedHomeId: "__no_home__", homes: [home], hasUnassignedPlants: true }), "__no_home__");
assert.equal(resolveSelectedHomeId({ storedHomeId: null, homes: [home], hasUnassignedPlants: true, shouldPreferUnassigned: true }), "__no_home__");
assert.equal(resolveSelectedHomeId({ storedHomeId: home.id, homes: [home], hasUnassignedPlants: true, shouldPreferUnassigned: true }), "__no_home__");
assert.equal(shouldOfferExistingHomeImport({ homes: [home], plants: legacyPlants, homeId: home.id }), true);
assert.equal(shouldOfferExistingHomeImport({ homes: [home, otherHome], plants: legacyPlants, homeId: home.id }), false);
assert.equal(shouldOfferExistingHomeImport({ homes: [home], plants: [{ ...plant, homeId: home.id }], homeId: home.id }), false);

console.log("home-room-context tests passed");
