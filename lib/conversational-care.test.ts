import assert from "node:assert/strict";
import { deriveConversationalCareState } from "./conversational-care";
import type { Plant, PlantAnalysisRecord, PlantMilestone, PlantHypothesisResolution } from "@/types/plant";

const plant: Plant = {
  id: "plant-1",
  speciesName: "Monstera",
  scientificName: "Monstera deliciosa",
  status: "healthy",
  messageKey: "plants.afterWatering.message",
  statusLabelKey: "status.doingGreat",
  careScheduleStatus: "active",
  notificationEnabled: true
};

function analysis(overrides: Partial<PlantAnalysisRecord> = {}, rawOverrides: NonNullable<PlantAnalysisRecord["rawResult"]> = {}): PlantAnalysisRecord {
  return {
    id: "analysis-1",
    plantId: "plant-1",
    condition: "healthy",
    nextAction: null,
    recommendations: [],
    rawResult: {
      detectedSpecies: "Monstera deliciosa",
      confidence: 0.9,
      plantStatus: "healthy",
      urgency: "none",
      visibleObservations: [{ en: "Leaves look healthy", ru: "Листья выглядят здоровыми" }],
      visualEvidenceSnapshot: {
        concerns: [],
        affectedParts: [],
        severity: "none",
        evidenceConfidence: "high",
        imageRolesUsed: ["overview"],
        speciesCandidates: ["Monstera deliciosa"]
      },
      ...rawOverrides
    },
    createdAt: "2026-07-22T08:00:00.000Z",
    ...overrides
  };
}

const noMilestones: PlantMilestone[] = [];
const noResolutions: PlantHypothesisResolution[] = [];

assert.equal(
  deriveConversationalCareState({ analysis: analysis(), plant, milestones: noMilestones, hypothesisResolutions: noResolutions, locale: "en" }).enabled,
  false,
  "healthy plants keep the normal care UI"
);

const severeKnown = deriveConversationalCareState({
  analysis: analysis(
    { condition: "needs_attention" },
    {
      plantStatus: "needs_attention",
      urgency: "soon",
      visibleObservations: [{ en: "Several older leaves are dry and fallen", ru: "Много старых листьев высохло и опало" }],
      visualEvidenceSnapshot: {
        concerns: ["dry fallen leaves", "damaged stems"],
        affectedParts: ["leaves", "stems"],
        severity: "severe",
        evidenceConfidence: "medium",
        imageRolesUsed: ["overview"],
        speciesCandidates: ["Monstera deliciosa"]
      },
      clarificationQuestions: [
        {
          hypothesis: "direct_sun",
          question: { en: "Where did it stand during the last few days?", ru: "Где растение стояло последние дни?" },
          reasonForAsking: { en: "This can separate light stress from other causes.", ru: "Это поможет отделить стресс от света от других причин." },
          options: [
            { label: { en: "Direct sun", ru: "Прямое солнце" }, status: "confirmed", result: "direct_sun" },
            { label: { en: "Shade", ru: "Тень" }, status: "ruled_out", result: "shade" }
          ]
        },
        {
          hypothesis: "pests",
          question: { en: "Do you see pests?", ru: "Видишь вредителей?" },
          reasonForAsking: { en: "This changes the first action.", ru: "Это меняет первый шаг." },
          options: [{ label: { en: "No", ru: "Нет" }, status: "ruled_out", result: "none" }]
        }
      ]
    }
  ),
  plant,
  milestones: noMilestones,
  hypothesisResolutions: noResolutions,
  locale: "en"
});

assert.equal(severeKnown.enabled, true);
assert.equal(severeKnown.question?.hypothesis, "direct_sun", "only the highest-impact relevant question is selected");
assert.ok(severeKnown.concern?.toLowerCase().includes("dry"));

const unknownConcern = deriveConversationalCareState({
  analysis: analysis(
    { condition: "needs_attention" },
    {
      detectedSpecies: null,
      scientificName: null,
      commonName: null,
      confidence: 0.35,
      plantStatus: "watch",
      urgency: "observe",
      visualEvidenceSnapshot: {
        concerns: ["damaged branches"],
        affectedParts: ["branches"],
        severity: "moderate",
        evidenceConfidence: "low",
        imageRolesUsed: ["overview"],
        speciesCandidates: []
      }
    }
  ),
  plant: { ...plant, speciesName: "Неизвестное растение", scientificName: undefined },
  milestones: noMilestones,
  hypothesisResolutions: noResolutions,
  locale: "en"
});
assert.equal(unknownConcern.enabled, true, "unknown species with visible concern still gets help");

const unknownHealthy = deriveConversationalCareState({
  analysis: analysis({}, { detectedSpecies: null, scientificName: null, commonName: null, confidence: 0.35 }),
  plant: { ...plant, speciesName: "Unknown plant", scientificName: undefined },
  milestones: noMilestones,
  hypothesisResolutions: noResolutions,
  locale: "en"
});
assert.equal(unknownHealthy.enabled, false, "unknown but visually healthy plants should not get an alarming plan");

const pruning = deriveConversationalCareState({
  analysis: analysis(
    { recommendations: [{ type: "care", en: "Prune only fully dry branches.", ru: "Обрежь только полностью сухие ветки." }] },
    {
      plantStatus: "needs_attention",
      urgency: "soon",
      visualEvidenceSnapshot: { concerns: ["dry branches"], affectedParts: ["branches"], severity: "moderate", evidenceConfidence: "medium", imageRolesUsed: ["overview"], speciesCandidates: ["unknown"] }
    }
  ),
  plant,
  milestones: noMilestones,
  hypothesisResolutions: noResolutions,
  locale: "en"
});
assert.equal(pruning.guidedAction?.type, "pruning");

const recentRepot: PlantMilestone = {
  id: "repot-1",
  plantId: "plant-1",
  type: "repotted",
  eventDate: "2026-07-21",
  createdAt: "2026-07-21T08:00:00.000Z"
};
const repotBlocked = deriveConversationalCareState({
  analysis: analysis(
    { recommendations: [{ type: "care", en: "Repot if roots are damaged.", ru: "Пересади, если корни повреждены." }] },
    {
      plantStatus: "needs_attention",
      urgency: "soon",
      visualEvidenceSnapshot: { concerns: ["root risk"], affectedParts: ["roots"], severity: "moderate", evidenceConfidence: "medium", imageRolesUsed: ["overview"], speciesCandidates: ["unknown"] }
    }
  ),
  plant,
  milestones: [recentRepot],
  hypothesisResolutions: noResolutions,
  locale: "en"
});
assert.equal(repotBlocked.guidedAction, null, "repotting guide is blocked after recent repotting");
