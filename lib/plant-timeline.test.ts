import { buildPlantTimeline } from "./plant-timeline";
import type { PlantAnalysisRecord, PlantCareEvent, PlantFollowUp, PlantMilestone, PlantPhoto } from "@/types/plant";

const plantId = "plant-a";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert.equal = (actual: unknown, expected: unknown, message: string) => {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
};

assert.deepEqual = (actual: unknown, expected: unknown, message: string) => {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
};

function milestone(input: Partial<PlantMilestone> = {}): PlantMilestone {
  return {
    id: input.id ?? "milestone-1",
    plantId: input.plantId ?? plantId,
    type: input.type ?? "repotted",
    eventDate: input.eventDate ?? "2026-07-10",
    createdAt: input.createdAt ?? "2026-07-10T10:00:00.000Z",
    updatedAt: input.updatedAt,
    note: input.note,
    isManual: input.isManual ?? true
  };
}

function careEvent(input: Partial<PlantCareEvent> = {}): PlantCareEvent {
  return {
    id: input.id ?? "care-1",
    plantId: input.plantId ?? plantId,
    type: input.type ?? "soil_checked",
    createdAt: input.createdAt ?? "2026-07-12T12:00:00.000Z",
    metadata: input.metadata
  };
}

function analysis(input: Partial<PlantAnalysisRecord> = {}): PlantAnalysisRecord {
  return {
    id: input.id ?? "analysis-1",
    plantId: input.plantId ?? plantId,
    condition: input.condition ?? "check_soon",
    nextAction: input.nextAction ?? null,
    summary: input.summary ?? { en: "Stable", ru: "Стабильно" },
    recommendations: input.recommendations ?? [],
    rawResult: input.rawResult ?? {
      analysisMode: "plant_checkin",
      photoComparison: {
        message: { en: "The plant is stable.", ru: "Растение стабильно." }
      }
    },
    createdAt: input.createdAt ?? "2026-07-14T12:00:00.000Z"
  };
}

function followUp(input: Partial<PlantFollowUp> = {}): PlantFollowUp {
  return {
    id: input.id ?? "follow-up-1",
    plantId: input.plantId ?? plantId,
    reason: input.reason ?? "recovery_monitoring",
    taskType: input.taskType ?? "add_photo",
    dueAt: input.dueAt ?? "2026-07-13T09:00:00.000Z",
    status: input.status ?? "completed",
    completedPhotoIds: input.completedPhotoIds ?? ["photo-1"],
    result: input.result ?? "stable",
    summary: input.summary ?? { en: "No visible worsening.", ru: "Без заметного ухудшения." },
    createdAt: input.createdAt ?? "2026-07-11T09:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-07-13T12:00:00.000Z"
  };
}

function photo(input: Partial<PlantPhoto> = {}): PlantPhoto {
  return {
    id: input.id ?? "photo-1",
    plantId: input.plantId ?? plantId,
    url: input.url ?? "",
    thumbnailUrl: input.thumbnailUrl,
    type: input.type ?? "overview",
    createdAt: input.createdAt ?? "2026-07-14T11:00:00.000Z",
    isCover: input.isCover ?? false
  };
}

const originalMilestones = [milestone({ id: "repot", type: "repotted" })];
const originalCareEvents = [careEvent({ id: "soil", type: "soil_checked" })];
const originalAnalyses = [analysis()];
const originalFollowUps = [followUp()];
const originalPhotos = [photo()];
const before = JSON.stringify({ originalMilestones, originalCareEvents, originalAnalyses, originalFollowUps, originalPhotos });

const fullTimeline = buildPlantTimeline({
  plantId,
  milestones: originalMilestones,
  careEvents: originalCareEvents,
  analyses: originalAnalyses,
  followUps: originalFollowUps,
  photos: originalPhotos
});

assert(fullTimeline.some((event) => event.origin === "plant_milestones" && event.kind === "repotting"), "old milestones should appear");
assert(fullTimeline.some((event) => event.origin === "care_events" && event.kind === "soil_check"), "care_events should appear");
assert(fullTimeline.some((event) => event.origin === "plant_analyses" && event.kind === "checkin_completed"), "plant check-in analyses should appear");
assert(fullTimeline.some((event) => event.origin === "plant_follow_ups" && event.kind === "followup_completed"), "completed follow-ups should appear");
assert(fullTimeline.some((event) => event.origin === "plant_photos" && event.kind === "photo_added"), "photos should appear");

const withoutOtherPlant = buildPlantTimeline({
  plantId,
  milestones: [milestone(), milestone({ id: "other-milestone", plantId: "plant-b" })],
  careEvents: [careEvent({ plantId: "plant-b" })],
  analyses: [analysis({ plantId: "plant-b" })],
  followUps: [followUp({ plantId: "plant-b" })],
  photos: [photo({ plantId: "plant-b" })]
});
assert.equal(withoutOtherPlant.length, 1, "events from another plant should be excluded");
assert.equal(withoutOtherPlant[0].plantId, plantId, "remaining event should belong to the requested plant");

const sortedTimeline = buildPlantTimeline({
  plantId,
  milestones: [
    milestone({ id: "old", eventDate: "2026-07-01", createdAt: "2026-07-01T10:00:00.000Z" }),
    milestone({ id: "new", eventDate: "2026-07-20", createdAt: "2026-07-20T10:00:00.000Z" })
  ]
});
assert.deepEqual(sortedTimeline.map((event) => event.payload && (event.payload.milestone as PlantMilestone).id), ["new", "old"], "timeline should sort newest first");

const wateringDeduped = buildPlantTimeline({
  plantId,
  milestones: [milestone({ id: "water-milestone", type: "watered", eventDate: "2026-07-12" })],
  careEvents: [careEvent({ id: "water-event", type: "watered", createdAt: "2026-07-12T12:00:00.000Z" })]
});
assert.equal(wateringDeduped.filter((event) => event.kind === "watering").length, 1, "watering milestone + care_event on the same date should render once");
assert.equal(wateringDeduped[0].origin, "plant_milestones", "milestone should win watering duplicate display");

const photoAndCheckin = buildPlantTimeline({
  plantId,
  photos: [photo({ id: "new-photo", createdAt: "2026-07-14T11:00:00.000Z" })],
  analyses: [analysis({ id: "new-checkin", createdAt: "2026-07-14T12:00:00.000Z" })]
});
assert.equal(photoAndCheckin.filter((event) => event.kind === "photo_added").length, 1, "photo_added should remain visible");
assert.equal(photoAndCheckin.filter((event) => event.kind === "checkin_completed").length, 1, "check-in should remain separate from photo");

const photoFromPersistedPhotosOnly = buildPlantTimeline({
  plantId,
  careEvents: [careEvent({ id: "synthetic-photo-event", type: "photo_added", createdAt: "2026-07-14T11:00:00.000Z" })],
  photos: [photo({ id: "persisted-photo", createdAt: "2026-07-14T11:00:00.000Z" })]
});
assert.equal(photoFromPersistedPhotosOnly.filter((event) => event.kind === "photo_added").length, 1, "one persisted photo should create exactly one photo_added event");
assert.equal(photoFromPersistedPhotosOnly.find((event) => event.kind === "photo_added")?.origin, "plant_photos", "photo_added should use plant_photos as the only source");

const timelineBeforeReload = buildPlantTimeline({
  plantId,
  careEvents: [careEvent({ id: "local-photo-event", type: "photo_added", createdAt: "2026-07-15T11:00:00.000Z" })],
  photos: [photo({ id: "reload-photo", createdAt: "2026-07-15T11:00:00.000Z" })]
});
const timelineAfterReload = buildPlantTimeline({
  plantId,
  photos: [photo({ id: "reload-photo", createdAt: "2026-07-15T11:00:00.000Z" })]
});
assert.equal(
  timelineBeforeReload.filter((event) => event.kind === "photo_added").length,
  timelineAfterReload.filter((event) => event.kind === "photo_added").length,
  "photo_added count should match before and after reload"
);

const multiplePhotosTimeline = buildPlantTimeline({
  plantId,
  photos: [
    photo({ id: "photo-a", createdAt: "2026-07-15T11:00:00.000Z" }),
    photo({ id: "photo-b", createdAt: "2026-07-15T11:01:00.000Z" }),
    photo({ id: "photo-c", createdAt: "2026-07-15T11:02:00.000Z" })
  ]
});
assert.equal(multiplePhotosTimeline.filter((event) => event.kind === "photo_added").length, 3, "each persisted photo should create one photo_added event");

const failedPhotoUploadTimeline = buildPlantTimeline({
  plantId,
  careEvents: [careEvent({ id: "failed-local-photo-event", type: "photo_added", createdAt: "2026-07-16T11:00:00.000Z" })],
  photos: []
});
assert.equal(failedPhotoUploadTimeline.filter((event) => event.kind === "photo_added").length, 0, "failed upload without persisted photo should not create a history event");

const repeatedUnknownRepotting = buildPlantTimeline({
  plantId,
  milestones: [
    milestone({ id: "unknown-1", type: "repotting_unknown", eventDate: null, createdAt: "2026-07-10T10:00:00.000Z" }),
    milestone({ id: "unknown-2", type: "repotting_unknown", eventDate: null, createdAt: "2026-07-11T10:00:00.000Z" })
  ]
});
assert.equal(repeatedUnknownRepotting.filter((event) => event.kind === "repotting_unknown").length, 1, "identical unknown repotting baseline should not multiply");

assert.equal(JSON.stringify({ originalMilestones, originalCareEvents, originalAnalyses, originalFollowUps, originalPhotos }), before, "builder should not mutate source arrays");

console.info("plant_timeline_tests_passed", {
  fullTimeline: fullTimeline.map((event) => `${event.origin}:${event.kind}`)
});
