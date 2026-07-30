import assert from "node:assert/strict";
import { evaluateRecommendationUpdate } from "./recommendation-update-decision";
import type { PlantAnalysisRecord, PlantRecommendationRevision } from "@/types/plant";

const baseCheckin: PlantAnalysisRecord = {
  id: "analysis-checkin",
  plantId: "plant-1",
  condition: "check_soon",
  nextAction: null,
  summary: { en: "Checked", ru: "Проверено" },
  recommendations: [],
  rawResult: {
    analysisMode: "plant_checkin",
    plantStatus: "watch",
    urgency: "observe",
    photoComparison: {
      analyzedPhotoIds: ["photo-new"],
      comparisonTargetPhotoIds: ["photo-old"],
      analysisTimestamp: "2026-07-30T10:00:00.000Z",
      observationsAdded: [],
      observationsUnchanged: ["No clear visual change"],
      observationsImproved: [],
      observationsWorsened: [],
      hypothesesChanged: [],
      recommendationChanges: [],
      reliableComparison: true
    },
    checkinResult: "stable"
  },
  createdAt: "2026-07-30"
};

const previousAnalysis: PlantAnalysisRecord = {
  id: "analysis-old",
  plantId: "plant-1",
  condition: "check_soon",
  nextAction: null,
  summary: { en: "Recovery continues", ru: "Восстановление продолжается" },
  recommendations: [{ type: "observe", en: "Watch new growth", ru: "Наблюдай за новым ростом" }],
  rawResult: {
    analysisMode: "initial",
    plantStatus: "watch",
    urgency: "observe"
  },
  createdAt: "2026-07-20"
};

const revision: PlantRecommendationRevision = {
  id: "revision-current",
  plantId: "plant-1",
  analysisId: "analysis-old",
  recommendations: previousAnalysis.recommendations,
  structuredResult: previousAnalysis.rawResult,
  contextSnapshot: {},
  isCurrent: true,
  createdAt: "2026-07-20T10:00:00.000Z"
};

assert.deepEqual(
  evaluateRecommendationUpdate({
    checkin: baseCheckin,
    previousMeaningfulAnalysis: previousAnalysis,
    currentRevision: revision
  }),
  { decision: "no_meaningful_change", meaningfulChangeReasons: [] },
  "stable check-in with only unchanged observations should not create a new recommendation revision"
);

const worseCheckin: PlantAnalysisRecord = {
  ...baseCheckin,
  id: "analysis-worse",
  condition: "needs_attention",
  rawResult: {
    ...baseCheckin.rawResult,
    plantStatus: "needs_attention",
    urgency: "soon",
    checkinResult: "worse",
    photoComparison: {
      ...baseCheckin.rawResult?.photoComparison,
      observationsWorsened: ["More yellowing is visible"],
      recommendationChanges: ["Check the plant sooner"]
    }
  }
};

const worseEvaluation = evaluateRecommendationUpdate({
  checkin: worseCheckin,
  previousMeaningfulAnalysis: previousAnalysis,
  currentRevision: revision
});
assert.equal(worseEvaluation.decision, "refresh_required", "worse check-in should trigger recommendation refresh");
assert(worseEvaluation.meaningfulChangeReasons.includes("checkin_worse"), "worse check-in should include an explicit reason");
assert(worseEvaluation.meaningfulChangeReasons.includes("observations_worsened"), "worsened observations should be meaningful");

const missingCheckin = evaluateRecommendationUpdate({ previousMeaningfulAnalysis: previousAnalysis, currentRevision: revision });
assert.equal(missingCheckin.decision, "insufficient_data", "missing check-in should not attempt a refresh decision");
