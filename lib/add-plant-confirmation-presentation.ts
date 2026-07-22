import type { TranslationKey } from "@/i18n/dictionaries";
import type { SpeciesLearningState } from "./species-learning";
import { isStillLearningSpecies } from "./species-learning";
import { isUnknownPlantName } from "./rescue-entry";

export type AddPlantConfirmationPresentation = {
  titleKey?: TranslationKey;
  titleText?: string;
  speciesDescriptionKey?: TranslationKey;
  showRecoveryInfo: boolean;
  showConditionSummary: boolean;
  primaryActionKey: TranslationKey;
};

export function deriveAddPlantConfirmationPresentation(input: {
  displayCommonName: string;
  hasAnalysis: boolean;
  isTechnicalFailure: boolean;
  isRecoveryEligible: boolean;
  speciesLearningState?: SpeciesLearningState | null;
}): AddPlantConfirmationPresentation {
  const speciesStillLearning = isStillLearningSpecies(input.speciesLearningState);
  const speciesUnknown = speciesStillLearning && isUnknownPlantName(input.displayCommonName);

  return {
    titleKey: speciesUnknown ? "addPlant.speciesLearningShortTitle" : undefined,
    titleText: speciesUnknown ? undefined : input.displayCommonName,
    speciesDescriptionKey: speciesStillLearning ? "addPlant.speciesLearningShortText" : undefined,
    showRecoveryInfo: input.isRecoveryEligible && !input.isTechnicalFailure,
    showConditionSummary: input.hasAnalysis && !input.isRecoveryEligible && !input.isTechnicalFailure,
    primaryActionKey: input.isTechnicalFailure ? "addPlant.retryAnalysis" : "addPlant.save"
  };
}
