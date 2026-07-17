import type { PlantMilestone } from "@/types/plant";

export type BaselineKind = "watering" | "repotting";

export function baselineMilestoneTypes(kind: BaselineKind): PlantMilestone["type"][] {
  return kind === "watering" ? ["watered", "watering_unknown"] : ["repotted", "repotting_unknown"];
}

export function baselineMilestoneType(kind: BaselineKind, unknown = false): PlantMilestone["type"] {
  if (kind === "watering") {
    return unknown ? "watering_unknown" : "watered";
  }
  return unknown ? "repotting_unknown" : "repotted";
}

export function findExistingBaselineMilestone(milestones: PlantMilestone[], plantId: string, kind: BaselineKind) {
  const types = baselineMilestoneTypes(kind);
  return milestones
    .filter((milestone) => milestone.plantId === plantId && types.includes(milestone.type))
    .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))[0];
}
