import type { SoilCheckResult } from "@/types/plant";

export function soilCheckResultFromClarificationAnswer(result: string): SoilCheckResult {
  const normalized = result.trim().toLocaleLowerCase().replace(/[\s-]+/g, "_");

  if (normalized === "dry" || normalized === "slightly_damp" || normalized === "very_wet" || normalized === "not_sure") {
    return normalized;
  }

  if (normalized === "unsure" || normalized === "unknown" || normalized === "not_checked" || normalized.includes("не_увер")) {
    return "not_sure";
  }

  if (
    normalized === "moist_below" ||
    normalized === "bottom_moist" ||
    normalized === "wet_below" ||
    normalized === "damp_below" ||
    normalized === "surface_dry_bottom_moist" ||
    normalized.includes("slightly_moist") ||
    normalized.includes("slightly_wet") ||
    normalized.includes("damp") ||
    normalized.includes("moist") ||
    normalized.includes("влаж")
  ) {
    if (normalized.includes("very") || normalized.includes("soggy") || normalized.includes("очень")) {
      return "very_wet";
    }
    return "slightly_damp";
  }

  if (normalized.includes("сух")) {
    return "dry";
  }

  throw new Error(`Unsupported soil check answer: ${result}`);
}
