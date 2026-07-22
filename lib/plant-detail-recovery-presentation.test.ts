import assert from "node:assert/strict";
import { completedFactLabel, speciesDetailLabel } from "./plant-detail-recovery-presentation";
import type { PlantHypothesisResolution } from "@/types/plant";
import type { SpeciesLearningState } from "./species-learning";

const learningState: SpeciesLearningState = {
  status: "learning",
  currentLabel: "woody deciduous indoor shrub or vine (unknown)",
  confidence: 0.42,
  candidates: [{ label: "ficus", confidence: 0.42, source: "ai_visual" }],
  userConfirmation: null,
  evidence: [{ type: "visual", label: "stems, leaves" }],
  source: "analysis"
};

assert.deepEqual(
  speciesDetailLabel({ fallbackName: "Unknown plant", speciesLearningState: learningState }),
  { labelKey: "addPlant.speciesLearningShortTitle", labelText: null },
  "unknown species should show a friendly learning label instead of raw currentLabel"
);

assert.deepEqual(
  speciesDetailLabel({ fallbackName: "Monstera", speciesLearningState: { ...learningState, status: "confident", confidence: 0.95 } }),
  { labelKey: null, labelText: "Monstera" },
  "confident known plants keep their normal species label"
);

const soilResolution: PlantHypothesisResolution = {
  id: "soil-1",
  plantId: "plant-1",
  hypothesis: "soil_condition",
  status: "confirmed",
  userResult: "dry",
  evidenceSource: "ai_clarification",
  resolvedAt: "2026-07-22T08:00:00.000Z",
  createdAt: "2026-07-22T08:00:00.000Z"
};

const translated = completedFactLabel({
  resolution: soilResolution,
  translate: (key) => {
    const values: Record<string, string> = {
      "plantAnalysis.factSoil": "Почва",
      "plantAnalysis.answerResult.dry": "сухая"
    };
    return values[key] ?? key;
  },
  conclusionFor: () => "Почва сухая — можно полить."
});

assert.deepEqual(translated, {
  label: "Почва",
  value: "сухая",
  conclusion: "Почва сухая — можно полить."
});

const fallback = completedFactLabel({
  resolution: { ...soilResolution, userResult: "custom_result" },
  translate: (key) => key,
  conclusionFor: () => "Saved."
});

assert.equal(fallback?.value, "custom_result", "unknown result values should not expose translation keys");
