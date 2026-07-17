import type { TranslationKey } from "@/i18n/dictionaries";
import type { DerivedCareActionState } from "@/lib/plant-action-eligibility";
import type { Plant, PlantAnalysisRecord, PlantMilestone } from "@/types/plant";

export type PlantHealthStatus = "healthy" | "adapting" | "watch" | "needs_attention" | "action_needed";

export type DerivedPlantHealthStatus = {
  status: PlantHealthStatus;
  labelKey: TranslationKey;
  messageKey: TranslationKey;
  reason: string;
};

function localized(value: { en?: string | null; ru?: string | null } | undefined) {
  return [value?.en, value?.ru].filter(Boolean).join(" ");
}

function includesAny(text: string, words: string[]) {
  const value = text.toLocaleLowerCase();
  return words.some((word) => value.includes(word));
}

function daysSince(dateKey?: string | null) {
  if (!dateKey) return null;
  const date = new Date(`${dateKey.slice(0, 10)}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - date.getTime()) / (24 * 60 * 60 * 1000)));
}

function recentMilestone(milestones: PlantMilestone[], types: PlantMilestone["type"][], maxDays: number) {
  return milestones.some((milestone) => types.includes(milestone.type) && milestone.eventDate && (daysSince(milestone.eventDate) ?? Number.POSITIVE_INFINITY) <= maxDays);
}

function rawPlantStatus(analysis?: PlantAnalysisRecord): PlantHealthStatus | null {
  const value = analysis?.rawResult?.plantStatus;
  if (value === "healthy" || value === "adapting" || value === "watch" || value === "needs_attention" || value === "action_needed") {
    return value;
  }
  return null;
}

function analysisText(analysis?: PlantAnalysisRecord) {
  if (!analysis) return "";
  const raw = analysis.rawResult;
  return [
    localized(analysis.summary),
    ...analysis.recommendations.map((item) => [item.en, item.ru].filter(Boolean).join(" ")),
    ...(raw?.visibleObservations ?? []).map(localized),
    ...(raw?.careRightNow ?? []).map((item) => [localized(item.action), localized(item.reason)].join(" ")),
    localized(raw?.reasoning?.currentSituation),
    localized(raw?.reasoning?.diagnosisLogic),
    localized(raw?.reasoning?.whyThisMatters)
  ].join(" ");
}

function meaningfulConcern(analysis?: PlantAnalysisRecord) {
  const text = analysisText(analysis);
  return includesAny(text, [
    "yellow",
    "curl",
    "wilting",
    "pest",
    "disease",
    "rot",
    "very wet",
    "damage",
    "spreading",
    "decline",
    "желт",
    "скруч",
    "вян",
    "вредител",
    "болез",
    "гнил",
    "очень влаж",
    "повреж",
    "распростран",
    "ухудш"
  ]);
}

function minorObservation(analysis?: PlantAnalysisRecord) {
  const text = analysisText(analysis);
  return includesAny(text, [
    "watch",
    "monitor",
    "old mark",
    "dry edge",
    "brown edge",
    "minor",
    "slight",
    "new growth",
    "наблю",
    "стар",
    "сух",
    "корич",
    "небольш",
    "лёгк",
    "легк",
    "нов"
  ]);
}

function healthMeta(status: PlantHealthStatus, reason: string): DerivedPlantHealthStatus {
  if (status === "action_needed") {
    return { status, labelKey: "status.actionNeeded", messageKey: "plantHealth.actionNeeded", reason };
  }
  if (status === "needs_attention") {
    return { status, labelKey: "status.needsAttention", messageKey: "plantHealth.needsAttention", reason };
  }
  if (status === "watch") {
    return { status, labelKey: "status.watch", messageKey: "plantHealth.watch", reason };
  }
  if (status === "adapting") {
    return { status, labelKey: "status.adapting", messageKey: "plantHealth.adapting", reason };
  }
  return { status: "healthy", labelKey: "status.healthy", messageKey: "plantHealth.healthy", reason };
}

export function derivePlantHealthStatus(input: {
  plant: Plant;
  analysis?: PlantAnalysisRecord;
  careActionState?: DerivedCareActionState | null;
  milestones?: PlantMilestone[];
}): DerivedPlantHealthStatus {
  const { plant, analysis, careActionState, milestones = [] } = input;
  const aiStatus = rawPlantStatus(analysis);

  if (careActionState?.isActionable && careActionState.status === "due") {
    if (careActionState.actionType === "water") {
      return healthMeta("action_needed", "due_watering");
    }
    return healthMeta("needs_attention", `due_${careActionState.actionType}`);
  }

  if (aiStatus) {
    return healthMeta(aiStatus, "analysis_plant_status");
  }

  if (analysis?.condition === "needs_attention") {
    return healthMeta(meaningfulConcern(analysis) ? "action_needed" : "needs_attention", "legacy_needs_attention");
  }

  if (recentMilestone(milestones, ["repotted", "moved_home"], 21) || recentMilestone(milestones, ["watered"], 2)) {
    return healthMeta("adapting", "recent_care_change");
  }

  if (analysis?.condition === "check_soon" || (meaningfulConcern(analysis) && minorObservation(analysis))) {
    return healthMeta("watch", "minor_observation");
  }

  if (plant.status === "check_soon" && meaningfulConcern(analysis)) {
    return healthMeta("watch", "legacy_check_soon_with_concern");
  }

  return healthMeta("healthy", "default_healthy");
}
