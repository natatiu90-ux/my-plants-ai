"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, CalendarDays } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { usePlantStore } from "@/data/PlantStore";
import { formatRelativeDate, toDateKey } from "@/lib/date-format";
import type { DerivedCareActionState } from "@/lib/plant-action-eligibility";
import type { Plant } from "@/types/plant";

export function PlantNotificationControls({ plant, careActionState }: { plant: Plant; careActionState: DerivedCareActionState | null }) {
  const { locale, t } = useI18n();
  const { updatePlantNextCheck, updatePlantNotification } = usePlantStore();
  const [nextCheckAt, setNextCheckAt] = useState(plant.nextCheckAt ?? "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setNextCheckAt(plant.nextCheckAt ?? "");
  }, [plant.id, plant.nextCheckAt]);

  const saveNextCheck = async (dateKey: string) => {
    setIsSaving(true);
    try {
      await updatePlantNextCheck(plant.id, dateKey || undefined);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleNotifications = async () => {
    setIsSaving(true);
    try {
      await updatePlantNotification(plant.id, !plant.notificationEnabled);
    } finally {
      setIsSaving(false);
    }
  };
  const nextCheckCopy =
    careActionState?.actionType === "check_soil" && careActionState.status === "upcoming"
      ? t(careActionState.detailMessageKey, careActionState.detailMessageParams)
      : formatRelativeDate(plant.nextCheckAt, locale, t("plantDetail.notYet"));

  return (
    <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-rounded text-xl font-extrabold text-ink">{t("notifications.plantTitle")}</h2>
          <p className="mt-1 text-sm font-bold leading-5 text-[#8b8173]">
            {nextCheckCopy}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void toggleNotifications()}
          disabled={isSaving}
          className="flex min-h-11 items-center gap-2 rounded-[18px] bg-[#eef5e8] px-3 text-sm font-extrabold text-[#3f7d4f] disabled:opacity-60"
        >
          {plant.notificationEnabled ? <Bell aria-hidden="true" size={17} /> : <BellOff aria-hidden="true" size={17} />}
          {plant.notificationEnabled ? t("notifications.plantOn") : t("notifications.plantOff")}
        </button>
      </div>

      <label className="mt-4 block min-w-0 text-sm font-extrabold text-[#4f4940]">
        <span className="flex items-center gap-2">
          <CalendarDays aria-hidden="true" size={16} />
          {t("notifications.nextCheckDate")}
        </span>
        <span className="app-native-input-shell mt-2">
          <input
            type="date"
            value={nextCheckAt}
            onChange={(event) => {
              setNextCheckAt(event.target.value);
              void saveNextCheck(event.target.value);
            }}
            className="app-date-input outline-none focus:ring-2 focus:ring-[#b7d8a8]"
          />
        </span>
      </label>
      {process.env.NODE_ENV !== "production" ? (
        <button
          type="button"
          onClick={() => {
            const today = toDateKey(new Date());
            setNextCheckAt(today);
            void saveNextCheck(today);
          }}
          disabled={isSaving}
          className="mt-3 min-h-11 w-full rounded-[18px] bg-white/75 px-4 text-sm font-extrabold text-[#7d776b] disabled:opacity-60"
        >
          {t("notifications.setDueNow")}
        </button>
      ) : null}
    </section>
  );
}
