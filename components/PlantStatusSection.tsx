"use client";

import { StatusBadge } from "./StatusBadge";
import { useI18n } from "@/i18n/I18nProvider";
import type { DerivedCareActionState } from "@/lib/plant-action-eligibility";
import { plantCommonName } from "@/lib/plant-display";
import type { Plant } from "@/types/plant";

export function PlantStatusSection({ plant, careActionState }: { plant: Plant; careActionState: DerivedCareActionState | null }) {
  const { t } = useI18n();
  const commonName = plantCommonName(plant);
  const badgeKey = careActionState?.cardBadgeKey ?? plant.statusLabelKey;
  const message = careActionState ? t(careActionState.detailMessageKey, careActionState.detailMessageParams) : t(plant.messageKey);
  const badgeStatus = careActionState?.isActionable || badgeKey === "status.needsHelp" ? plant.status : "healthy";

  return (
    <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-5 shadow-soft">
      {commonName ? <p className="text-[13px] italic leading-5 text-[#9a9aa3]">{commonName}</p> : null}
      {plant.scientificName ? <p className="mt-0.5 text-[13px] italic leading-5 text-[#b0a89d]">{plant.scientificName}</p> : null}
      <div className="mt-3">
        <StatusBadge label={t(badgeKey)} status={badgeStatus} />
      </div>
      <p className="mt-4 text-[15px] leading-6 text-[#4a4a54]">{plant.notes || message}</p>
    </section>
  );
}
