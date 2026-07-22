import type { TranslationKey } from "@/i18n/dictionaries";
import type { PlantHypothesis, PlantHypothesisResolution } from "@/types/plant";
import type { SpeciesLearningState } from "./species-learning";
import { isStillLearningSpecies } from "./species-learning";

export function speciesDetailLabel(input: { fallbackName: string; speciesLearningState?: SpeciesLearningState | null }) {
  if (isStillLearningSpecies(input.speciesLearningState)) {
    return { labelKey: "addPlant.speciesLearningShortTitle" as TranslationKey, labelText: null };
  }

  return { labelKey: null, labelText: input.fallbackName };
}

export function completedFactLabel(input: {
  resolution?: PlantHypothesisResolution;
  translate: (key: TranslationKey) => string;
  conclusionFor: (resolution: PlantHypothesisResolution) => string;
}) {
  const resolution = input.resolution;
  if (!resolution) return null;
  const conclusion = input.conclusionFor(resolution);
  if (!conclusion) return null;

  const labels: Record<PlantHypothesis, TranslationKey> = {
    soil_condition: "plantAnalysis.factSoil",
    repotting: "plantAnalysis.factRepotting",
    root_condition: "plantAnalysis.factRoots",
    drainage: "plantAnalysis.factDrainage",
    direct_sun: "plantAnalysis.factSun",
    pests: "plantAnalysis.factPests"
  };
  const valueKey = `plantAnalysis.answerResult.${resolution.userResult}` as TranslationKey;
  const value = input.translate(valueKey);

  return {
    label: input.translate(labels[resolution.hypothesis]),
    value: value === valueKey ? resolution.userResult : value,
    conclusion
  };
}
