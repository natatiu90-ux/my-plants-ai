import assert from "node:assert/strict";
import { canSaveMilestoneDraft, dateFieldIsVisible, initialMilestoneEditorDraft, selectMilestoneType } from "./milestone-editor-state";
import type { PlantMilestone } from "@/types/plant";

const today = "2026-07-21";
const newDraft = initialMilestoneEditorDraft(undefined, today);

assert.equal(newDraft.type, null);
assert.equal(newDraft.eventDate, "");
assert.equal(dateFieldIsVisible(newDraft.type), false);
assert.equal(canSaveMilestoneDraft({ type: newDraft.type, eventDate: newDraft.eventDate }), false);

assert.equal(selectMilestoneType("", today), today);
assert.equal(selectMilestoneType("2026-07-10", today), "2026-07-10");
assert.equal(dateFieldIsVisible("repotted"), true);
assert.equal(canSaveMilestoneDraft({ type: "repotted", eventDate: today }), true);

const existing: PlantMilestone = {
  id: "milestone-1",
  plantId: "plant-1",
  type: "watered",
  eventDate: "2026-07-18",
  note: "After soil check",
  createdAt: "2026-07-18T10:00:00.000Z"
};
const existingDraft = initialMilestoneEditorDraft(existing, today);
assert.equal(existingDraft.type, "watered");
assert.equal(existingDraft.eventDate, "2026-07-18");
assert.equal(existingDraft.note, "After soil check");
