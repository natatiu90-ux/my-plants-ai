import { selectPlantDetailAnalysisContext } from "./plant-analysis-context";
import { buildPlantDetailDebugData } from "./plant-detail-debug";
import { buildPlantTimeline } from "./plant-timeline";
import type { Plant, PlantAnalysisRecord, PlantMilestone, PlantPhoto } from "@/types/plant";

const assert = {
  equal(actual: unknown, expected: unknown, message?: string) {
    if (actual !== expected) {
      throw new Error(`${message ?? "assert.equal failed"}: expected ${String(expected)}, got ${String(actual)}`);
    }
  }
};

const plant: Plant = {
  id: "plant-debug",
  speciesName: "Syringa",
  scientificName: "Syringa vulgaris",
  status: "healthy",
  statusLabelKey: "status.healthy",
  messageKey: "plantHealth.healthy",
  nextAction: null,
  careScheduleStatus: "active",
  notificationEnabled: true
};

const oldRecoveryAnalysis: PlantAnalysisRecord = {
  id: "old-recovery",
  plantId: plant.id,
  condition: "needs_attention",
  nextAction: "check_soil",
  summary: { en: "Recovery is still in progress.", ru: "Восстановление продолжается." },
  recommendations: [{ type: "care", priority: "high", en: "Check soil.", ru: "Проверь почву." }],
  rawResult: {
    plantStatus: "needs_attention",
    urgency: "soon",
    visibleObservations: [{ en: "Dry damaged leaves.", ru: "Сухие повреждённые листья." }]
  },
  createdAt: "2026-07-20T10:00:00.000Z"
};

const latestHealthyCheckin: PlantAnalysisRecord = {
  id: "latest-healthy-checkin",
  plantId: plant.id,
  condition: "healthy",
  nextAction: null,
  summary: { en: "Looks okay.", ru: "Выглядит нормально." },
  recommendations: [],
  rawResult: {
    analysisMode: "plant_checkin",
    plantStatus: "healthy",
    urgency: "none",
    visibleObservations: []
  },
  createdAt: "2026-07-24T10:00:00.000Z"
};

const milestone: PlantMilestone = {
  id: "repotting",
  plantId: plant.id,
  type: "repotted",
  eventDate: "2026-07-19",
  createdAt: "2026-07-19T10:00:00.000Z"
};

const photo: PlantPhoto = {
  id: "photo-1",
  plantId: plant.id,
  url: "",
  type: "overview",
  createdAt: "2026-07-24T09:00:00.000Z",
  isCover: true
};

const analyses = [latestHealthyCheckin, oldRecoveryAnalysis];
const analysisContext = selectPlantDetailAnalysisContext({
  plant,
  analyses,
  milestones: [milestone],
  followUps: [],
  hypothesisResolutions: [],
  secondaryDataReady: true
});
const timeline = buildPlantTimeline({
  plantId: plant.id,
  analyses,
  milestones: [milestone],
  careEvents: [],
  followUps: [],
  photos: [photo]
});
const debugData = buildPlantDetailDebugData({
  plant,
  secondaryDataReady: true,
  analyses,
  analysisContext,
  milestones: [milestone],
  careEvents: [],
  followUps: [],
  photos: [photo],
  timeline,
  derivedHealthStatus: { status: "watch", labelKey: "status.watch", messageKey: "plantHealth.watch", reason: "test" },
  careActionState: null,
  hypothesisResolutions: []
});

assert.equal(debugData.analysesCount, 2, "debug data should include all analyses");
assert.equal(debugData.latestAnalysisId, "latest-healthy-checkin", "latest analysis should remain visible in diagnostics");
assert.equal(debugData.meaningfulAnalysisId, "old-recovery", "meaningful recovery analysis should be selected");
assert.equal(debugData.shouldRenderAnalysis, true, "PlantAnalysisSection should be renderable");
assert.equal(debugData.hiddenReason, "not_hidden", "renderable analysis should not have a hidden reason");
assert.equal(debugData.milestonesCount, 1, "milestones should be counted");
assert.equal(debugData.timelineKinds.includes("photo_added"), true, "grouped photo events should appear in debug timeline");

console.log("plant-detail-debug tests passed");
