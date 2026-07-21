import assert from "node:assert/strict";
import { calculateSoilCheckCareResolution, deriveNextPlantAction } from "./soil-care";
import type { Plant, PlantMilestone } from "@/types/plant";

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
