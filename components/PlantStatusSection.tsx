"use client";

import { StatusBadge } from "./StatusBadge";
import { useI18n } from "@/i18n/I18nProvider";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { DerivedCareActionState } from "@/lib/plant-action-eligibility";
import { plantCommonName } from "@/lib/plant-display";
import type { Plant, PlantAnalysisRecord, PlantStatus } from "@/types/plant";

const badgeStatusByVisualState: Record<DerivedCareActionState["cardVisualState"], PlantStatus> = {
  healthy: "healthy",
  observe: "check_soon",
  action_required: "needs_attention"
};

function observeMessageKey(plant: Plant): TranslationKey {
  if (plant.lastSoilResult === "slightly_damp") {
    return "careAction.observeAfterMoistSoil";
  }

  if (plant.lastSoilResult === "very_wet") {
    return "careAction.observeAfterWetSoil";
  }

  if (plant.lastSoilResult === "dry") {
    return "careAction.observeAfterDrySoil";
  }

  return "careAction.observeNewGrowth";
}

function localized(value: { en?: string | null; ru?: string | null } | undefined) {
  return [value?.en, value?.ru].filter(Boolean).join(" ");
}

function analysisSuggestsObservation(analysis?: PlantAnalysisRecord) {
  if (!analysis) {
    return false;
  }

  if (analysis.condition && analysis.condition !== "healthy") {
    return true;
  }

  const raw = analysis.rawResult;
  const text = [
    localized(analysis.summary),
    ...analysis.recommendations.map((item) => [item.en, item.ru].filter(Boolean).join(" ")),
    ...(raw?.visibleObservations ?? []).map(localized),
    ...(raw?.careRightNow ?? []).map((item) => [localized(item.action), localized(item.reason)].join(" ")),
    localized(raw?.reasoning?.currentSituation),
    localized(raw?.reasoning?.diagnosisLogic),
    localized(raw?.reasoning?.whyThisMatters)
  ]
    .join(" ")
    .toLocaleLowerCase();

  return [
    "watch",
    "observe",
    "monitor",
    "adapt",
    "stress",
    "damage",
    "dry edge",
    "brown edge",
    "sun",
    "наблю",
    "адапт",
    "стресс",
    "повреж",
    "сух",
    "корич",
    "солн"
  ].some((keyword) => text.includes(keyword));
}

export function PlantStatusSection({ plant, careActionState, analysis }: { plant: Plant; careActionState: DerivedCareActionState | null; analysis?: PlantAnalysisRecord }) {
  const { t } = useI18n();
  const commonName = plantCommonName(plant);
  const shouldObserveFromAnalysis =
    careActionState?.cardVisualState !== "action_required" &&
    (careActionState?.cardVisualState === "healthy" || (!careActionState && plant.status === "healthy")) &&
    analysisSuggestsObservation(analysis);
  const badgeKey = shouldObserveFromAnalysis ? "status.observing" : careActionState?.cardBadgeKey ?? plant.statusLabelKey;
  const message =
    careActionState?.actionType === "check_soil" && careActionState.status === "upcoming"
      ? t(observeMessageKey(plant))
      : careActionState
        ? shouldObserveFromAnalysis
          ? t("careAction.observeNewGrowth")
          : t(careActionState.detailMessageKey, careActionState.detailMessageParams)
        : t(plant.messageKey);
  const badgeStatus = shouldObserveFromAnalysis ? badgeStatusByVisualState.observe : careActionState ? badgeStatusByVisualState[careActionState.cardVisualState] : plant.status;

  return (
    <section className="mt-4 min-w-0 rounded-[28px] bg-[#fffaf3] p-5 shadow-soft">
      {commonName ? <p className="text-[13px] italic leading-5 text-[#9a9aa3] [overflow-wrap:anywhere]">{commonName}</p> : null}
      {plant.scientificName ? <p className="mt-0.5 text-[13px] italic leading-5 text-[#b0a89d] [overflow-wrap:anywhere]">{plant.scientificName}</p> : null}
      <div className="mt-3">
        <StatusBadge label={t(badgeKey)} status={badgeStatus} />
      </div>
      <p className="mt-4 text-[15px] leading-6 text-[#4a4a54] [overflow-wrap:anywhere]">{plant.notes || message}</p>
    </section>
  );
}
