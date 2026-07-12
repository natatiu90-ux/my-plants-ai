"use client";

import { StatusBadge } from "./StatusBadge";
import { useI18n } from "@/i18n/I18nProvider";
import type { Plant } from "@/types/plant";

export function PlantStatusSection({ plant }: { plant: Plant }) {
  const { t } = useI18n();

  return (
    <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-5 shadow-soft">
      <p className="text-[13px] italic leading-5 text-[#9a9aa3]">{plant.speciesName}</p>
      <div className="mt-3">
        <StatusBadge label={t(plant.statusLabelKey)} status={plant.status} />
      </div>
      <p className="mt-4 text-[15px] leading-6 text-[#4a4a54]">{t(plant.messageKey)}</p>
    </section>
  );
}
