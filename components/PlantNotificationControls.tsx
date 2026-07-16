"use client";

import { useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { usePlantStore } from "@/data/PlantStore";
import { formatLongDate } from "@/lib/date-format";
import type { Plant } from "@/types/plant";

export function PlantNotificationControls({ plant }: { plant: Plant }) {
  const { locale, t } = useI18n();
  const { updatePlantNotification } = usePlantStore();
  const [isSaving, setIsSaving] = useState(false);

  const toggleNotifications = async () => {
    setIsSaving(true);
    try {
      await updatePlantNotification(plant.id, !plant.notificationEnabled);
    } finally {
      setIsSaving(false);
    }
  };
  const nextCheckCopy = plant.nextCheckAt
    ? t("careAction.nextCheckOnDate", { date: formatLongDate(plant.nextCheckAt, locale) })
    : t("plantDetail.notYet");

  return (
    <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-rounded text-xl font-extrabold text-ink">{t("notifications.plantTitle")}</h2>
          <p className="mt-1 max-w-full text-sm font-bold leading-5 text-[#8b8173] [overflow-wrap:anywhere]">
            {nextCheckCopy}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void toggleNotifications()}
          disabled={isSaving}
          className="flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-[18px] bg-[#eef5e8] px-3 text-sm font-extrabold text-[#3f7d4f] disabled:opacity-60"
        >
          {plant.notificationEnabled ? <Bell aria-hidden="true" size={17} /> : <BellOff aria-hidden="true" size={17} />}
          {plant.notificationEnabled ? t("notifications.plantOn") : t("notifications.plantOff")}
        </button>
      </div>
    </section>
  );
}
