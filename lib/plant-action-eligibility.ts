import { toDateKey } from "@/lib/date-format";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { Plant, PlantAction, PlantHypothesisResolution } from "@/types/plant";

type CareActionType = "water" | "check_soil" | "take_photo" | "observe" | "none";
type CareActionStatus = "due" | "upcoming" | "completed" | "blocked" | "none";
export type CareCardVisualState = "healthy" | "observe" | "action_required";

export type DerivedCareActionState = {
  actionType: CareActionType;
  status: CareActionStatus;
  cardVisualState: CareCardVisualState;
  isActionable: boolean;
  dueAt: string | null;
  labelKey: TranslationKey | null;
  cardBadgeKey: TranslationKey | null;
  cardMessageKey: TranslationKey;
  cardMessageParams?: Record<string, string | number>;
  detailMessageKey: TranslationKey;
  detailMessageParams?: Record<string, string | number>;
  reason: string;
};

export function latestSoilResolution(resolutions: PlantHypothesisResolution[]) {
  return resolutions
    .filter((resolution) => resolution.hypothesis === "soil_condition")
    .sort((a, b) => (b.resolvedAt ?? b.createdAt).localeCompare(a.resolvedAt ?? a.createdAt))[0];
}

function daysUntil(dateKey: string, today = new Date()) {
  const target = new Date(`${dateKey.slice(0, 10)}T12:00:00`);
  const current = new Date(today);
  current.setHours(12, 0, 0, 0);
  return Math.ceil((target.getTime() - current.getTime()) / (24 * 60 * 60 * 1000));
}

function timingMessage(dateKey: string, today = new Date()) {
  const days = daysUntil(dateKey, today);
  if (days <= 1) {
    return {
      key: "careAction.nextCheckTomorrow" as TranslationKey,
      params: undefined,
      reason: "next_check_tomorrow"
    };
  }

  return {
    key: "careAction.nextCheckInDays" as TranslationKey,
    params: { count: days },
    reason: "next_check_in_days"
  };
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

export function deriveCareActionState(
  plant: Plant,
  hypothesisResolutions: PlantHypothesisResolution[],
  today = new Date(),
  options: { isCareDataReady?: boolean } = {}
): DerivedCareActionState {
  if (plant.nextAction === "check_soil" && options.isCareDataReady === false) {
    return {
      actionType: "check_soil",
      status: "blocked",
      cardVisualState: "observe",
      isActionable: false,
      dueAt: plant.nextCheckAt ?? null,
      labelKey: null,
      cardBadgeKey: "status.observing",
      cardMessageKey: "careAction.noAction",
      detailMessageKey: "careAction.noAction",
      reason: "care_context_loading"
    };
  }

  const eligibleAction = eligiblePrimaryCareAction(plant, hypothesisResolutions);
  const soilResolution = latestSoilResolution(hypothesisResolutions);
  const nextCheckAt = plant.nextCheckAt ?? null;

  if (eligibleAction === "water") {
    return {
      actionType: "water",
      status: "due",
      cardVisualState: "action_required",
      isActionable: true,
      dueAt: nextCheckAt,
      labelKey: "actions.water",
      cardBadgeKey: "status.looksThirsty",
      cardMessageKey: "careAction.waterDue",
      detailMessageKey: "careAction.waterDue",
      reason: "primary_action_water"
    };
  }

  if (eligibleAction === "check_soil") {
    return {
      actionType: "check_soil",
      status: "due",
      cardVisualState: "action_required",
      isActionable: true,
      dueAt: nextCheckAt,
      labelKey: "actions.check_soil",
      cardBadgeKey: "status.checkSoilToday",
      cardMessageKey: "careAction.checkSoilDue",
      detailMessageKey: "careAction.checkSoilDue",
      reason: soilResolution ? "soil_check_due_after_previous_answer" : "soil_check_due"
    };
  }

  if (eligibleAction === "take_photo") {
    return {
      actionType: "take_photo",
      status: "due",
      cardVisualState: "action_required",
      isActionable: true,
      dueAt: nextCheckAt,
      labelKey: "actions.take_photo",
      cardBadgeKey: "status.takePhoto",
      cardMessageKey: "careAction.photoDue",
      detailMessageKey: "careAction.photoDue",
      reason: "primary_action_take_photo"
    };
  }

  if (plant.nextAction === "check_soil" && nextCheckAt && nextCheckAt > toDateKey(today)) {
    const message = timingMessage(nextCheckAt, today);
    return {
      actionType: "check_soil",
      status: "upcoming",
      cardVisualState: "observe",
      isActionable: false,
      dueAt: nextCheckAt,
      labelKey: null,
      cardBadgeKey: "status.observing",
      cardMessageKey: message.key,
      cardMessageParams: message.params,
      detailMessageKey: message.key,
      detailMessageParams: message.params,
      reason: message.reason
    };
  }

  if (plant.nextAction === "check_soil" && soilResolution) {
    return {
      actionType: "check_soil",
      status: "completed",
      cardVisualState: "observe",
      isActionable: false,
      dueAt: nextCheckAt,
      labelKey: null,
      cardBadgeKey: "status.observing",
      cardMessageKey: "careAction.soilAnswered",
      detailMessageKey: "careAction.soilAnswered",
      reason: "fresh_soil_answer_resolved_action"
    };
  }

  return {
    actionType: "none",
    status: "none",
    cardVisualState: plant.status === "healthy" ? "healthy" : "observe",
    isActionable: false,
    dueAt: nextCheckAt,
    labelKey: null,
    cardBadgeKey: plant.status === "healthy" ? "status.doingGreat" : "status.observing",
    cardMessageKey: plant.status === "healthy" ? "careAction.noAction" : "careAction.observe",
    detailMessageKey: plant.status === "healthy" ? "careAction.noAction" : "careAction.observe",
    reason: "no_actionable_primary_care_action"
  };
}

export function isDueCareActionState(careAction: DerivedCareActionState) {
  if (careAction.status === "blocked") {
    return false;
  }

  return careAction.isActionable && careAction.status === "due" && careAction.actionType !== "none";
}
