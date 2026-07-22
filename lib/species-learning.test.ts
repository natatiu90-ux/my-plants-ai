import assert from "node:assert/strict";
import { buildSpeciesLearningState, isStillLearningSpecies, speciesLearningStateFromAnalysis } from "./species-learning";
import type { PlantAnalysisRecord } from "@/types/plant";

const learning = buildSpeciesLearningState({
  detectedSpecies: null,
  commonName: null,
  scientificName: null,
  confidence: 0.34,
  growthHabit: "foliage",
  organVocabulary: ["stems", "new growth"],
  visualEvidenceSnapshot: {
    speciesCandidates: ["Woody flowering shrub", "Lilac", "Mock orange"]
  }
});

assert.equal(learning.status, "learning");
assert.equal(learning.currentLabel, "Woody flowering shrub");
assert.equal(learning.confidence, 0.34);
assert.deepEqual(
  learning.candidates.map((candidate) => candidate.label),
  ["Woody flowering shrub", "Lilac", "Mock orange", "Foliage houseplant"]
);
assert.equal(isStillLearningSpecies(learning), true);

const confident = buildSpeciesLearningState({
  detectedSpecies: "Common lilac",
  commonName: { en: "Common lilac", ru: "Сирень обыкновенная" },
  scientificName: "Syringa vulgaris",
  confidence: 0.95,
  growthHabit: "foliage",
  visualEvidenceSnapshot: { speciesCandidates: ["Syringa vulgaris"] }
});

assert.equal(confident.status, "confident");
assert.equal(confident.currentLabel, "Syringa vulgaris");
assert.equal(isStillLearningSpecies(confident), false);

const analysis: PlantAnalysisRecord = {
  id: "analysis-1",
  plantId: "plant-1",
  condition: "needs_attention",
  recommendations: [],
  rawResult: {
    detectedSpecies: null,
    confidence: 0.4,
    growthHabit: "vine",
    visualEvidenceSnapshot: { speciesCandidates: ["Vining plant"] }
  },
  createdAt: "2026-07-22T08:00:00.000Z"
};

assert.equal(speciesLearningStateFromAnalysis(analysis)?.currentLabel, "Vining plant");

const existing = speciesLearningStateFromAnalysis({
  ...analysis,
  rawResult: {
    speciesIdentification: {
      status: "probable",
      currentLabel: "Possibly lilac",
      confidence: 0.7,
      candidates: [{ label: "Lilac", confidence: 0.7, source: "ai_visual" }],
      userConfirmation: null,
      evidence: [{ type: "visual", label: "opposite leaves" }],
      source: "analysis"
    }
  }
});

assert.equal(existing?.currentLabel, "Possibly lilac");
