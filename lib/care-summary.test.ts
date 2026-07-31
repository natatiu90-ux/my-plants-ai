import { strict as assert } from "node:assert";
import { latestWateredAtFromHistory } from "./care-summary";
import type { Plant, PlantCareEvent, PlantMilestone } from "@/types/plant";

const plant = {
  id: "plant-1",
  lastWateredAt: "2026-07-10"
} as Pick<Plant, "id" | "lastWateredAt">;

const milestones = [
  { id: "old-water", plantId: "plant-1", type: "watered", eventDate: "2026-07-12", createdAt: "2026-07-12" },
  { id: "other-plant-water", plantId: "plant-2", type: "watered", eventDate: "2026-07-31", createdAt: "2026-07-31" },
  { id: "soil", plantId: "plant-1", type: "soil_checked", eventDate: "2026-07-30", createdAt: "2026-07-30" }
] as PlantMilestone[];

const careEvents = [
  { id: "fresh-water", plantId: "plant-1", type: "watered", createdAt: "2026-07-31" },
  { id: "other-care", plantId: "plant-1", type: "soil_checked", createdAt: "2026-08-01" }
] as PlantCareEvent[];

assert.equal(
  latestWateredAtFromHistory({ plant, milestones, careEvents }),
  "2026-07-31",
  "fresh watering care event should override stale plant.lastWateredAt"
);

assert.equal(
  latestWateredAtFromHistory({
    plant: { id: "plant-1", lastWateredAt: "2026-07-20" } as Pick<Plant, "id" | "lastWateredAt">,
    milestones,
    careEvents: []
  }),
  "2026-07-20",
  "plant.lastWateredAt should still win when it is the newest concrete watering date"
);

assert.equal(
  latestWateredAtFromHistory({
    plant: { id: "plant-1", lastWateredAt: undefined } as Pick<Plant, "id" | "lastWateredAt">,
    milestones: [{ id: "unknown", plantId: "plant-1", type: "watering_unknown", eventDate: null, createdAt: "2026-07-31" } as PlantMilestone],
    careEvents: []
  }),
  undefined,
  "watering_unknown should not invent a last watering date"
);
