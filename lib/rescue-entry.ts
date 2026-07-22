import { cleanPlantName } from "./plant-display";

export type RescueEntryAnalysisSignal = {
  confidence?: number | null;
  detectedSpecies?: string | null;
};

export function isUnknownPlantName(value: string | null | undefined) {
  const normalized = cleanPlantName(value).toLocaleLowerCase();
  return !normalized || normalized === "unknown plant" || normalized === "unknown" || normalized === "неизвестное растение" || normalized === "неизвестно";
}

export function shouldShowRescueEntry(input: {
  analysis: RescueEntryAnalysisSignal | null | undefined;
  commonName?: string | null;
  scientificName?: string | null;
}) {
  if (!input.analysis) {
    return false;
  }

  return (
    (typeof input.analysis.confidence === "number" && input.analysis.confidence < 0.55) ||
    (isUnknownPlantName(input.commonName) && isUnknownPlantName(input.scientificName) && isUnknownPlantName(input.analysis.detectedSpecies))
  );
}
