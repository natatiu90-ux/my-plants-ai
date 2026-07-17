import assert from "node:assert/strict";
import { baselineMilestoneType, findExistingBaselineMilestone } from "./care-baseline";
import type { PlantMilestone } from "@/types/plant";

const milestones: PlantMilestone[] = [
  { id: "old", plantId: "plant-1", type: "repotted", eventDate: "2026-07-01", createdAt: "2026-07-01T08:00:00.000Z" },
  { id: "new", plantId: "plant-1", type: "repotting_unknown", createdAt: "2026-07-04T08:00:00.000Z", updatedAt: "2026-07-05T08:00:00.000Z" },
  { id: "other", plantId: "plant-2", type: "repotted", eventDate: "2026-07-03", createdAt: "2026-07-03T08:00:00.000Z" }
];

assert.equal(baselineMilestoneType("repotting", false), "repotted");
assert.equal(baselineMilestoneType("repotting", true), "repotting_unknown");
assert.equal(baselineMilestoneType("watering", false), "watered");
assert.equal(baselineMilestoneType("watering", true), "watering_unknown");

assert.equal(findExistingBaselineMilestone(milestones, "plant-1", "repotting")?.id, "new");
assert.equal(findExistingBaselineMilestone(milestones, "plant-2", "repotting")?.id, "other");
assert.equal(findExistingBaselineMilestone(milestones, "plant-1", "watering"), undefined);

console.log("care-baseline tests passed");
