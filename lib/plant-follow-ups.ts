import { addDays, toDateKey } from "./date-format";
import type { Plant, PlantFollowUp, PlantFollowUpReason, PlantFollowUpResult, PlantFollowUpTaskType, PlantMilestone } from "../types/plant";

export const FOLLOW_UP_REMINDER_TYPE = "follow_up_task";
export const DEFAULT_FOLLOW_UP_TASK_TYPE: PlantFollowUpTaskType = "add_photo";

export function requiredInputsForFollowUp(taskType: PlantFollowUpTaskType = DEFAULT_FOLLOW_UP_TASK_TYPE): PlantFollowUp["requiredInputs"] {
  return [{ type: taskType }];
}

export function followUpIntervalDays(reason: PlantFollowUpReason, result?: PlantFollowUpResult | null) {
  if (result === "worse") return 5;
  if (result === "unclear") return 7;

  switch (reason) {
    case "after_repotting":
      return result === "stable" || result === "improved" ? 14 : 8;
    case "after_pruning":
      return result === "stable" || result === "improved" ? 21 : 12;
    case "recovery_monitoring":
      return result === "stable" || result === "improved" ? 21 : 14;
    case "species_uncertain":
      return 14;
    case "stable":
      return 30;
    default:
      return 14;
  }
}

export function dueAtForFollowUp(reason: PlantFollowUpReason, fromDate: string | Date = new Date()) {
  const base = typeof fromDate === "string" ? new Date(`${fromDate.slice(0, 10)}T12:00:00`) : fromDate;
  return toDateKey(addDays(base, followUpIntervalDays(reason)));
}

export function nextFollowUpDate(reason: PlantFollowUpReason, result: PlantFollowUpResult, fromDate: string | Date = new Date()) {
  const base = typeof fromDate === "string" ? new Date(`${fromDate.slice(0, 10)}T12:00:00`) : fromDate;
  return toDateKey(addDays(base, followUpIntervalDays(reason, result)));
}

export function reasonForMilestone(type: PlantMilestone["type"]): PlantFollowUpReason | null {
  if (type === "repotted") return "after_repotting";
  if (type === "pruned") return "after_pruning";
  return null;
}

export function reasonForAnalysis(plant: Plant, rawResult: unknown): PlantFollowUpReason | null {
  const raw = rawResult && typeof rawResult === "object" ? (rawResult as Record<string, unknown>) : {};
  const plantStatus = typeof raw.plantStatus === "string" ? raw.plantStatus : undefined;
  const speciesIdentification =
    raw.speciesIdentification && typeof raw.speciesIdentification === "object"
      ? (raw.speciesIdentification as { status?: unknown; confidence?: unknown })
      : undefined;
  const confidence = typeof speciesIdentification?.confidence === "number" ? speciesIdentification.confidence : typeof raw.confidence === "number" ? raw.confidence : null;

  if (plantStatus === "needs_attention" || plantStatus === "action_needed" || plant.status === "needs_attention") {
    return "recovery_monitoring";
  }

  if (speciesIdentification?.status === "learning" || speciesIdentification?.status === "probable" || (confidence != null && confidence < 0.6)) {
    return "species_uncertain";
  }

  if (plantStatus === "healthy" || plant.status === "healthy") {
    return "stable";
  }

  return null;
}

export function followUpIsDue(followUp: Pick<PlantFollowUp, "dueAt" | "status">, now: Date = new Date()) {
  if (followUp.status !== "scheduled" && followUp.status !== "due") return false;
  const dueKey = followUp.dueAt.slice(0, 10);
  return dueKey <= toDateKey(now);
}

export function effectiveFollowUpStatus(followUp: PlantFollowUp, now: Date = new Date()): PlantFollowUp["status"] {
  return followUp.status === "scheduled" && followUpIsDue(followUp, now) ? "due" : followUp.status;
}

export function activeFollowUpsForPlant(followUps: PlantFollowUp[], plantId: string, now: Date = new Date()) {
  return followUps
    .filter((followUp) => followUp.plantId === plantId && (followUp.status === "scheduled" || followUp.status === "due"))
    .map((followUp) => ({ ...followUp, status: effectiveFollowUpStatus(followUp, now) }))
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export function latestCompletedFollowUpForPlant(followUps: PlantFollowUp[], plantId: string) {
  return followUps
    .filter((followUp) => followUp.plantId === plantId && followUp.status === "completed")
    .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))[0];
}

export function classifyPlantCheckinResult(rawAnalysis: unknown): PlantFollowUpResult {
  const raw = rawAnalysis && typeof rawAnalysis === "object" ? (rawAnalysis as Record<string, unknown>) : {};
  const comparison = raw.photoComparison && typeof raw.photoComparison === "object" ? (raw.photoComparison as Record<string, unknown>) : {};
  const worsened = Array.isArray(comparison.observationsWorsened) ? comparison.observationsWorsened.length : 0;
  const improved = Array.isArray(comparison.observationsImproved) ? comparison.observationsImproved.length : 0;
  const reliable = comparison.reliableComparison === true;
  const condition = typeof raw.condition === "string" ? raw.condition : undefined;

  if (!reliable) return "unclear";
  if (worsened > 0 || condition === "needs_attention") return "worse";
  if (improved > 0 || condition === "healthy") return "improved";
  return "stable";
}

export function followUpResultLabelKey(result?: PlantFollowUpResult | null) {
  if (result === "improved") return "followUps.result.improved";
  if (result === "worse") return "followUps.result.worse";
  if (result === "unclear") return "followUps.result.unclear";
  return "followUps.result.stable";
}

export function progressReviewMode() {
  return "plant_checkin";
}
