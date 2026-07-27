import { selectPlantDetailAnalysisContext } from "./plant-analysis-context";
import type { Plant, PlantAnalysisRecord, PlantMilestone } from "@/types/plant";

const assert = {
  equal(actual: unknown, expected: unknown, message?: string) {
    if (actual !== expected) {
      throw new Error(`${message ?? "assert.equal failed"}: expected ${String(expected)}, got ${String(actual)}`);
    }
  }
};

const plant: Plant = {
  id: "plant-1",
  speciesName: "Syringa",
  scientificName: "Syringa vulgaris",
  status: "healthy",
  statusLabelKey: "status.healthy",
  messageKey: "plantHealth.healthy",
  nextAction: null,
  careScheduleStatus: "active",
  notificationEnabled: true
};

const recoveryAnalysis: PlantAnalysisRecord = {
  id: "old-recovery-analysis",
  plantId: plant.id,
  condition: "needs_attention",
  nextAction: "check_soil",
  summary: { en: "The plant needs recovery support.", ru: "Растению нужна помощь в восстановлении." },
  recommendations: [{ type: "care", priority: "high", en: "Check soil and prune fully dry branches.", ru: "Проверь почву и убери полностью сухие ветки." }],
  rawResult: {
    plantStatus: "needs_attention",
    urgency: "soon",
    visibleObservations: [{ en: "Many leaves are brown and curled.", ru: "Много листьев коричневые и свернутые." }],
    careRightNow: [{ action: { en: "Check soil moisture.", ru: "Проверь влажность почвы." } }]
  },
  createdAt: "2026-07-20T10:00:00.000Z"
};

const genericHealthyCheckin: PlantAnalysisRecord = {
  id: "latest-generic-checkin",
  plantId: plant.id,
  condition: "healthy",
  nextAction: null,
  summary: { en: "The plant looks healthy.", ru: "Растение выглядит хорошо." },
  recommendations: [],
  rawResult: {
    analysisMode: "plant_checkin",
    plantStatus: "healthy",
    urgency: "none",
    visibleObservations: [],
    photoComparison: {
      reliableComparison: true,
      message: { en: "No new damage is visible.", ru: "Новых повреждений не видно." }
    }
  },
  createdAt: "2026-07-24T10:00:00.000Z"
};

const recentPruning: PlantMilestone = {
  id: "pruning-1",
  plantId: plant.id,
  type: "pruned",
  eventDate: "2026-07-21",
  createdAt: "2026-07-21T10:00:00.000Z",
  isManual: true
};

const context = selectPlantDetailAnalysisContext({
  plant,
  analyses: [genericHealthyCheckin, recoveryAnalysis],
  milestones: [recentPruning],
  followUps: [],
  hypothesisResolutions: [],
  secondaryDataReady: true
});

assert.equal(context.latestAnalysis?.id, "latest-generic-checkin", "latest analysis should still be detected");
assert.equal(context.meaningfulAnalysis?.id, "old-recovery-analysis", "presentation should keep the last meaningful recovery analysis");
assert.equal(context.recoveryContext, true, "previous recovery data should create recovery context even if plant.status is healthy");
assert.equal(context.hiddenReason, "not_hidden", "AI section should remain renderable");

const healthyOnly = selectPlantDetailAnalysisContext({
  plant,
  analyses: [{ ...genericHealthyCheckin, id: "only-healthy" }],
  milestones: [],
  followUps: [],
  hypothesisResolutions: [],
  secondaryDataReady: true
});

assert.equal(healthyOnly.meaningfulAnalysis?.id, "only-healthy", "truly healthy plant can still use healthy analysis");
assert.equal(healthyOnly.recoveryContext, false, "healthy-only data should not invent recovery context");

console.log("plant-analysis-context tests passed");
