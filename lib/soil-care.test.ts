import assert from "node:assert/strict";
import { calculateSoilCheckCareResolution, deriveNextPlantAction, nextSoilCheckAfterWatering } from "./soil-care";
import type { HomeWeatherContext } from "./weather-context";
import type { Plant, PlantMilestone, Room } from "@/types/plant";

function plant(overrides: Partial<Plant> = {}): Plant {
  return {
    id: "plant-1",
    speciesName: "Monstera deliciosa",
    status: "check_soon",
    messageKey: "plants.checkSoon.message",
    statusLabelKey: "status.checkSoilToday",
    nextAction: "check_soil",
    careScheduleStatus: "active",
    notificationEnabled: true,
    ...overrides
  };
}

const recentRepotting: PlantMilestone = {
  id: "repot-1",
  plantId: "plant-1",
  type: "repotted",
  titleKey: "milestones.repotted.title",
  descriptionKey: "milestones.repotted.description",
  eventDate: new Date().toISOString().slice(0, 10),
  createdAt: new Date().toISOString()
};

assert.equal(
  deriveNextPlantAction({ plant: plant(), soilResult: "dry" }).nextAction,
  "water",
  "balanced plants can move from a due soil check to watering when soil is dry"
);

assert.equal(
  deriveNextPlantAction({ plant: plant({ lastWateredAt: new Date().toISOString().slice(0, 10) }), soilResult: "dry" }).nextAction,
  null,
  "recent watering prevents a dry-surface answer from immediately becoming water"
);

assert.equal(
  deriveNextPlantAction({ plant: plant({ speciesName: "Portulacaria afra", scientificName: "Portulacaria afra" }), soilResult: "dry" }).nextAction,
  "water",
  "drought-tolerant plants can be watered after a due check when fully dry and no recent risk is known"
);

assert.equal(
  deriveNextPlantAction({
    plant: plant({ speciesName: "Portulacaria afra", scientificName: "Portulacaria afra" }),
    soilResult: "dry",
    milestones: [recentRepotting]
  }).nextAction,
  null,
  "recent repotting keeps drought-tolerant plants in a wait state"
);

assert.equal(deriveNextPlantAction({ plant: plant(), soilResult: "slightly_damp" }).nextAction, null);
assert.equal(deriveNextPlantAction({ plant: plant(), soilResult: "very_wet" }).nextAction, null);
assert.equal(deriveNextPlantAction({ plant: plant(), soilResult: "not_sure" }).nextAction, "check_soil");

const resolution = calculateSoilCheckCareResolution(plant(), "dry", [], []);
assert.equal(resolution.nextAction, "water");
assert.equal(resolution.nextCheckAt, null);

const hotWeather: HomeWeatherContext = {
  status: "available",
  source: "open_meteo",
  fetchedAt: "2026-07-23T10:00:00.000Z",
  heatLevel: "hot",
  forecastMaxTemperatureC: 36,
  humidityPercent: 28,
  hotDays: 3
};
const coolWeather: HomeWeatherContext = {
  status: "available",
  source: "open_meteo",
  fetchedAt: "2026-07-23T10:00:00.000Z",
  heatLevel: "none",
  forecastMaxTemperatureC: 24,
  humidityPercent: 55,
  hotDays: 0
};
const balconyLikeRoom: Room = {
  id: "room-hot",
  homeId: "home-1",
  name: "Bright balcony corner",
  isCustom: true,
  lightLevel: "bright_indirect",
  directSun: "midday",
  temperatureRelative: "warm",
  hasAirConditioning: "no",
  createdAt: "2026-07-01"
};
const coolRoom: Room = {
  ...balconyLikeRoom,
  id: "room-cool",
  name: "Cool room",
  lightLevel: "low",
  directSun: "none",
  temperatureRelative: "cool",
  hasAirConditioning: "yes"
};

assert.equal(
  calculateSoilCheckCareResolution(plant({ positionInRoom: "near_window" }), "slightly_damp", [], [], {
    room: balconyLikeRoom,
    weather: hotWeather
  }).checkInDays,
  1,
  "hot weather near bright/direct light should pull the next soil check earlier"
);

assert.equal(
  calculateSoilCheckCareResolution(plant(), "slightly_damp", [], [], {
    room: coolRoom,
    weather: hotWeather
  }).checkInDays,
  2,
  "a cool shaded room should soften hot-weather drying risk"
);

assert.equal(
  calculateSoilCheckCareResolution(plant(), "slightly_damp", [], [], {
    room: coolRoom,
    weather: coolWeather
  }).checkInDays,
  3,
  "cool weather keeps the normal balanced-plant soil check interval"
);

assert.match(
  calculateSoilCheckCareResolution(plant({ positionInRoom: "near_window" }), "dry", [], [], {
    room: balconyLikeRoom,
    weather: hotWeather
  }).message.ru,
  /жара/,
  "dry soil messages should explain heat only after the user reports dry soil"
);

assert.equal(
  nextSoilCheckAfterWatering({ plant: plant({ positionInRoom: "near_window" }), room: balconyLikeRoom, weather: hotWeather }),
  2,
  "after watering, heat should schedule the next soil check earlier without changing the watering action itself"
);
