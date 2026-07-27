import assert from "node:assert/strict";
import {
  activeFollowUpsForPlant,
  classifyPlantCheckinResult,
  dueAtForFollowUp,
  followUpIntervalDays,
  nextFollowUpDate,
  reasonForMilestone
} from "./plant-follow-ups";
import type { PlantFollowUp, PlantMilestone } from "@/types/plant";

const baseFollowUp: PlantFollowUp = {
  id: "follow-up-1",
  plantId: "plant-1",
  reason: "after_repotting",
  dueAt: "2026-07-24T12:00:00.000Z",
  status: "scheduled",
  sourceEventId: null,
  sourceMilestoneId: "milestone-1",
  taskType: "add_photo",
  requiredInputs: [{ type: "add_photo" }],
  completedPhotoIds: [],
  completedInputIds: {},
  result: null,
  summary: {},
  timelineEntry: {},
  createdAt: "2026-07-16T12:00:00.000Z"
};

assert.equal(followUpIntervalDays("after_repotting"), 8);
assert.equal(followUpIntervalDays("after_pruning"), 12);
assert.equal(followUpIntervalDays("recovery_monitoring"), 14);
assert.equal(followUpIntervalDays("stable"), 30);
assert.equal(followUpIntervalDays("recovery_monitoring", "worse"), 5);

assert.equal(dueAtForFollowUp("after_repotting", "2026-07-16"), "2026-07-24");
assert.equal(nextFollowUpDate("after_pruning", "stable", "2026-07-24"), "2026-08-14");

assert.equal(reasonForMilestone("repotted" as PlantMilestone["type"]), "after_repotting");
assert.equal(reasonForMilestone("pruned" as PlantMilestone["type"]), "after_pruning");
assert.equal(reasonForMilestone("watered" as PlantMilestone["type"]), null);

assert.deepEqual(activeFollowUpsForPlant([baseFollowUp], "plant-1", new Date("2026-07-23T10:00:00.000Z"))[0]?.status, "scheduled");
assert.deepEqual(activeFollowUpsForPlant([baseFollowUp], "plant-1", new Date("2026-07-24T10:00:00.000Z"))[0]?.status, "due");
assert.equal(activeFollowUpsForPlant([{ ...baseFollowUp, status: "completed" }], "plant-1").length, 0);

assert.equal(classifyPlantCheckinResult({ photoComparison: { reliableComparison: false } }), "unclear");
assert.equal(classifyPlantCheckinResult({ condition: "needs_attention", photoComparison: { reliableComparison: true, observationsWorsened: ["more yellowing"] } }), "worse");
assert.equal(classifyPlantCheckinResult({ condition: "healthy", photoComparison: { reliableComparison: true, observationsImproved: ["new growth"] } }), "improved");
assert.equal(classifyPlantCheckinResult({ condition: "check_soon", photoComparison: { reliableComparison: true, observationsUnchanged: ["same leaves"] } }), "stable");
