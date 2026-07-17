import assert from "node:assert/strict";
import { formatRelativeDate } from "./date-format";
import { compareMilestonesNewestFirst, milestoneDateLabel } from "./milestone-dates";
import type { PlantMilestone } from "@/types/plant";

const knownNewer: PlantMilestone = {
  id: "known-newer",
  plantId: "plant-1",
  type: "repotted",
  eventDate: "2026-07-10",
  createdAt: "2026-07-10T08:00:00.000Z"
};

const knownOlder: PlantMilestone = {
  id: "known-older",
  plantId: "plant-1",
  type: "watered",
  eventDate: "2026-07-01",
  createdAt: "2026-07-01T08:00:00.000Z"
};

const unknown: PlantMilestone = {
  id: "unknown",
  plantId: "plant-1",
  type: "repotting_unknown",
  eventDate: null,
  createdAt: "2026-07-12T08:00:00.000Z"
};

assert.equal(formatRelativeDate(null, "en", "Date unknown"), "Date unknown");
assert.equal(formatRelativeDate(undefined, "ru", "Дата не указана"), "Дата не указана");
assert.equal(milestoneDateLabel(unknown, "en", "Date unknown"), "Date unknown");

const sorted = [unknown, knownOlder, knownNewer].sort(compareMilestonesNewestFirst);
assert.deepEqual(sorted.map((item) => item.id), ["known-newer", "known-older", "unknown"]);

console.log("milestone-dates tests passed");
