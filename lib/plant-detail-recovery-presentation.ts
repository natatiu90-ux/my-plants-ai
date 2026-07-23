import type { TranslationKey } from "@/i18n/dictionaries";
import type { Plant, PlantAnalysisRecord, PlantHypothesis, PlantHypothesisResolution } from "@/types/plant";
import { cleanPlantName, cleanScientificName, commonNameFromScientificName } from "./plant-display";
import { isUnknownPlantName } from "./rescue-entry";
import type { SpeciesLearningState } from "./species-learning";
import { isStillLearningSpecies } from "./species-learning";

type UserProvidedSpecies = {
  commonName: string | null;
  scientificName: string | null;
  displayName: string;
};

type SpeciesConfirmation = NonNullable<NonNullable<NonNullable<PlantAnalysisRecord["rawResult"]>["speciesIdentification"]>["userConfirmation"]>;

function manualSpeciesConfirmationFromAnalysis(analysis: Pick<PlantAnalysisRecord, "rawResult"> | undefined | null): SpeciesConfirmation | null {
  const confirmation = analysis?.rawResult?.speciesIdentification?.userConfirmation;
  return confirmation?.source === "manual" ? confirmation : null;
}

export function userProvidedSpeciesFromPlant(
  plant: Pick<Plant, "speciesName" | "scientificName">,
  analysis?: Pick<PlantAnalysisRecord, "rawResult"> | null
): UserProvidedSpecies | null {
  const confirmation = manualSpeciesConfirmationFromAnalysis(analysis);
  if (!confirmation) {
    return null;
  }

  const commonName = cleanPlantName(confirmation.commonName) || cleanPlantName(plant.speciesName);
  const scientificName = cleanScientificName(confirmation.scientificName) || cleanScientificName(plant.scientificName);
  const displayName = commonName || commonNameFromScientificName(scientificName);

  if (!displayName || isUnknownPlantName(displayName)) {
    return null;
  }

  return {
    commonName: commonName || null,
    scientificName: scientificName || null,
    displayName
  };
}

export function speciesLearningCardPresentation(input: {
  speciesLearningState?: SpeciesLearningState | null;
  userProvidedSpecies?: ReturnType<typeof userProvidedSpeciesFromPlant>;
}) {
  if (input.userProvidedSpecies) {
    return {
      shouldRender: true,
      isCompleted: true,
      showKnowNameAction: false,
      showChangeAction: true,
      displayName: input.userProvidedSpecies.displayName
    };
  }

  return {
    shouldRender: isStillLearningSpecies(input.speciesLearningState),
    isCompleted: false,
    showKnowNameAction: isStillLearningSpecies(input.speciesLearningState),
    showChangeAction: false,
    displayName: null
  };
}

export function recommendationSpeciesContextFromPlant(
  plant: Pick<Plant, "speciesName" | "scientificName">,
  analysis?: Pick<PlantAnalysisRecord, "rawResult"> | null
) {
  const userProvidedSpecies = userProvidedSpeciesFromPlant(plant, analysis);
  if (!userProvidedSpecies) return null;

  return {
    source: "user_provided",
    commonName: userProvidedSpecies.commonName,
    scientificName: userProvidedSpecies.scientificName,
    displayName: userProvidedSpecies.displayName,
    note: "User-provided plant name; use as a helpful identification signal, but keep checking it against photo evidence."
  };
}

export function speciesDetailLabel(input: { fallbackName: string; speciesLearningState?: SpeciesLearningState | null; userProvidedSpecies?: ReturnType<typeof userProvidedSpeciesFromPlant> }) {
  if (input.userProvidedSpecies) {
    return { labelKey: null, labelText: input.userProvidedSpecies.displayName };
  }

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
