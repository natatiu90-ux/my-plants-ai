import { deriveRepeatedPhotoStatus, shouldSuppressHealthyCheckinStatus } from "./plant-status-transition";
import type { Plant, PlantAnalysisRecord, PlantMilestone } from "@/types/plant";

const assert = {
  equal(actual: unknown, expected: unknown, message?: string) {
    if (actual !== expected) {
      throw new Error(`${message ?? "assert.equal failed"}: expected ${String(expected)}, got ${String(actual)}`);
    }
  }
};

const plant = (input: Partial<Plant> = {}): Plant => ({
  id: "plant-1",
  speciesName: "Plant",
  status: "healthy",
  messageKey: "plants.martha.message",
  statusLabelKey: "status.growingBeautifully",
  careScheduleStatus: "active",
  notificationEnabled: false,
  ...input
});

const analysis = (input: Partial<PlantAnalysisRecord> = {}): PlantAnalysisRecord => ({
  id: "analysis-1",
  plantId: "plant-1",
  condition: "healthy",
  nextAction: null,
  recommendations: [],
  rawResult: {},
  createdAt: "2026-07-24T10:00:00.000Z",
  ...input
});

const repottingMilestone: PlantMilestone = {
  id: "milestone-1",
  plantId: "plant-1",
  type: "repotted",
  eventDate: "2026-07-20",
  createdAt: "2026-07-20T10:00:00.000Z",
  isManual: true
};

assert.equal(
  deriveRepeatedPhotoStatus({
    previousPlant: plant({ status: "needs_attention" }),
    previousAnalysis: analysis({ condition: "needs_attention", rawResult: { plantStatus: "needs_attention" } }),
    incomingCondition: "healthy",
    incomingRawResult: {
      plantStatus: "healthy",
      checkinResult: "improved",
      photoComparison: { reliableComparison: true, observationsImproved: ["new growth"] }
    }
  }),
  "check_soon",
  "previous needs_attention plus one improved check-in should not jump straight to healthy"
);

assert.equal(
  deriveRepeatedPhotoStatus({
    previousPlant: plant({ status: "needs_attention" }),
    incomingCondition: "healthy",
    incomingRawResult: {
      plantStatus: "healthy",
      checkinResult: "unclear",
      photoComparison: { reliableComparison: false }
    }
  }),
  "needs_attention",
  "unclear comparison should preserve previous recovery status"
);

assert.equal(
  deriveRepeatedPhotoStatus({
    previousPlant: plant({ status: "healthy" }),
    incomingCondition: "healthy",
    incomingRawResult: {
      plantStatus: "healthy",
      checkinResult: "improved",
      photoComparison: { reliableComparison: true }
    }
  }),
  "healthy",
  "healthy plant without recovery context may remain healthy"
);

assert.equal(
  deriveRepeatedPhotoStatus({
    previousPlant: plant({ status: "healthy" }),
    incomingCondition: "healthy",
    incomingRawResult: {
      plantStatus: "healthy",
      checkinResult: "improved",
      photoComparison: { reliableComparison: true }
    },
    milestones: [repottingMilestone]
  }),
  "check_soon",
  "recent repotting should keep a positive check-in in observing/adapting state"
);

assert.equal(
  deriveRepeatedPhotoStatus({
    previousPlant: plant({ status: "check_soon" }),
    incomingCondition: "needs_attention",
    incomingRawResult: {
      plantStatus: "needs_attention",
      checkinResult: "worse",
      photoComparison: { reliableComparison: true, observationsWorsened: ["new yellowing"] }
    }
  }),
  "needs_attention",
  "worse check-in should remain actionable"
);

assert.equal(
  shouldSuppressHealthyCheckinStatus({
    plant: plant({ status: "check_soon" }),
    analysis: analysis({ rawResult: { analysisMode: "plant_checkin", plantStatus: "healthy" } })
  }),
  true,
  "UI should not show generic healthy status for a positive check-in while the plant remains in recovery"
);
