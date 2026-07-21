import type { SoilCheckResult } from "@/types/plant";

export function soilCheckResultFromClarificationAnswer(result: string): SoilCheckResult {
  if (result === "dry" || result === "slightly_damp" || result === "very_wet" || result === "not_sure") {
    return result;
  }

  if (result === "unsure") {
    return "not_sure";
  }

  throw new Error(`Unsupported soil check answer: ${result}`);
}
