"use client";

import { StatusBadge } from "./StatusBadge";
import { useI18n } from "@/i18n/I18nProvider";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { DerivedCareActionState } from "@/lib/plant-action-eligibility";
import { plantCommonName } from "@/lib/plant-display";
import type { Plant, PlantStatus } from "@/types/plant";

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

export function PlantStatusSection({ plant, careActionState }: { plant: Plant; careActionState: DerivedCareActionState | null }) {
  const { t } = useI18n();
  const commonName = plantCommonName(plant);
  const badgeKey = careActionState?.cardBadgeKey ?? plant.statusLabelKey;
  const message =
    careActionState?.actionType === "check_soil" && careActionState.status === "upcoming"
      ? t(observeMessageKey(plant))
      : careActionState
        ? t(careActionState.detailMessageKey, careActionState.detailMessageParams)
        : t(plant.messageKey);
  const badgeStatus = careActionState ? badgeStatusByVisualState[careActionState.cardVisualState] : plant.status;

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
