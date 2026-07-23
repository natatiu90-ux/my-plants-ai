import assert from "node:assert/strict";
import { completedFactLabel, recommendationSpeciesContextFromPlant, speciesDetailLabel, speciesLearningCardPresentation, userProvidedSpeciesFromPlant } from "./plant-detail-recovery-presentation";
import type { PlantAnalysisRecord, PlantHypothesisResolution } from "@/types/plant";
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

const manualSpeciesAnalysis: Pick<PlantAnalysisRecord, "rawResult"> = {
  rawResult: {
    speciesIdentification: {
      ...learningState,
      userConfirmation: {
        commonName: "Сирень",
        scientificName: null,
        confirmedAt: "2026-07-23T10:00:00.000Z",
        source: "manual"
      },
      source: "combined"
    }
  }
};

assert.deepEqual(
  speciesDetailLabel({ fallbackName: "Unknown plant", speciesLearningState: learningState }),
  { labelKey: "addPlant.speciesLearningShortTitle", labelText: null },
  "unknown species should show a friendly learning label instead of raw currentLabel"
);

assert.equal(
  userProvidedSpeciesFromPlant({ speciesName: "Elephant bush / Dwarf jade", scientificName: "Portulacaria afra" }),
  null,
  "AI-identified species without a manual confirmation must not be treated as user-provided"
);

const userSpecies = userProvidedSpeciesFromPlant({ speciesName: "Сирень", scientificName: "" }, manualSpeciesAnalysis);
assert.deepEqual(userSpecies, { commonName: "Сирень", scientificName: null, displayName: "Сирень" }, "manual species should be read from persisted plant state");

assert.deepEqual(
  speciesDetailLabel({ fallbackName: "Unknown plant", speciesLearningState: learningState, userProvidedSpecies: userSpecies }),
  { labelKey: null, labelText: "Сирень" },
  "persisted user species should replace the generic learning label after reload"
);

assert.deepEqual(
  speciesLearningCardPresentation({ speciesLearningState: learningState, userProvidedSpecies: userSpecies }),
  {
    shouldRender: true,
    isCompleted: true,
    showKnowNameAction: false,
    showChangeAction: true,
    displayName: "Сирень"
  },
  "saved user species hides the active know-name CTA and shows a completed state"
);

assert.deepEqual(
  speciesLearningCardPresentation({
    speciesLearningState: learningState,
    userProvidedSpecies: userProvidedSpeciesFromPlant(
      { speciesName: "Syringa", scientificName: "" },
      {
        rawResult: {
          speciesIdentification: {
            ...learningState,
            userConfirmation: {
              commonName: "Syringa",
              scientificName: null,
              confirmedAt: "2026-07-23T10:05:00.000Z",
              source: "manual"
            },
            source: "combined"
          }
        }
      }
    )
  }).displayName,
  "Syringa",
  "editing the saved species updates the displayed completed value"
);

assert.equal(
  speciesLearningCardPresentation({ speciesLearningState: learningState, userProvidedSpecies: userProvidedSpeciesFromPlant({ speciesName: "Растение, которое я изучаю", scientificName: "" }) }).showKnowNameAction,
  true,
  "placeholder learning names should not hide the know-name CTA after a failed or missing save"
);

assert.deepEqual(
  recommendationSpeciesContextFromPlant({ speciesName: "Сирень", scientificName: "" }, manualSpeciesAnalysis),
  {
    source: "user_provided",
    commonName: "Сирень",
    scientificName: null,
    displayName: "Сирень",
    note: "User-provided plant name; use as a helpful identification signal, but keep checking it against photo evidence."
  },
  "user species should be included in recommendation refresh context as a signal"
);

assert.equal(
  recommendationSpeciesContextFromPlant({ speciesName: "Elephant bush / Dwarf jade", scientificName: "Portulacaria afra" }),
  null,
  "known AI species on Plant B should not inherit Plant A manual-name refresh context"
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
