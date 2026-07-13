import { toDateKey } from "@/lib/date-format";
import type { Plant, PlantAction, PlantHypothesisResolution } from "@/types/plant";

function latestSoilResolution(resolutions: PlantHypothesisResolution[]) {
  return resolutions
    .filter((resolution) => resolution.hypothesis === "soil_condition")
    .sort((a, b) => (b.resolvedAt ?? b.createdAt).localeCompare(a.resolvedAt ?? a.createdAt))[0];
}

export function shouldShowSoilCheckAction(plant: Plant, hypothesisResolutions: PlantHypothesisResolution[], today = new Date()) {
  if (plant.nextAction !== "check_soil") {
    return false;
  }

  const soilResolution = latestSoilResolution(hypothesisResolutions);
  if (!soilResolution) {
    return true;
  }

  if (!plant.nextCheckAt) {
    return false;
  }

  return plant.nextCheckAt <= toDateKey(today);
}

export function eligiblePrimaryCareAction(plant: Plant, hypothesisResolutions: PlantHypothesisResolution[]): PlantAction {
  if (plant.nextAction === "check_soil") {
    return shouldShowSoilCheckAction(plant, hypothesisResolutions) ? "check_soil" : null;
  }

  return plant.nextAction ?? null;
}
