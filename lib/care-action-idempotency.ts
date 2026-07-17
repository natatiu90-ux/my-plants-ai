import type { SoilCheckResult } from "@/types/plant";

export function soilCheckActionKey(input: { plantId: string; result: SoilCheckResult; actionSessionId?: string }) {
  return [input.plantId, "soil_checked", input.result, input.actionSessionId ?? "manual"].join(":");
}
