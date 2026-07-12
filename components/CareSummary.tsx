"use client";

import { CalendarCheck, Droplets, MapPin, SunMedium } from "lucide-react";
import { formatRelativeDate } from "@/lib/date-format";
import { usePlantStore } from "@/data/PlantStore";
import { useI18n } from "@/i18n/I18nProvider";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { Plant } from "@/types/plant";
import { CareInfoRow } from "./CareInfoRow";
import { roomOptions } from "./RoomPicker";

export function CareSummary({ plant }: { plant: Plant }) {
  const { locale, t } = useI18n();
  const { rooms } = usePlantStore();
  const builtInRoomKeys = roomOptions as readonly string[];
  const roomValue = plant.roomKey
    ? builtInRoomKeys.includes(plant.roomKey)
      ? t(plant.roomKey as TranslationKey)
      : rooms.find((room) => room.id === plant.roomKey)?.name ?? t("plantDetail.notYet")
    : t("plantDetail.notYet");

  const rows = [
    {
      label: t("plantDetail.lastWatered"),
      value: formatRelativeDate(plant.lastWateredAt, locale, t("plantDetail.notYet")),
      icon: <Droplets aria-hidden="true" size={18} />
    },
    {
      label: t("plantDetail.nextCheck"),
      value: formatRelativeDate(plant.nextCheckAt, locale, t("plantDetail.notYet")),
      icon: <CalendarCheck aria-hidden="true" size={18} />
    },
    {
      label: t("plantDetail.location"),
      value: roomValue,
      icon: <MapPin aria-hidden="true" size={18} />
    },
    {
      label: t("plantDetail.light"),
      value: plant.lightConditionKey ? t(plant.lightConditionKey) : t("plantDetail.notYet"),
      icon: <SunMedium aria-hidden="true" size={18} />
    }
  ];

  return (
    <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
      <h2 className="mb-3 px-1 font-rounded text-xl font-extrabold text-ink">{t("plantDetail.careNow")}</h2>
      <div className="grid gap-2">
        {rows.map((row) => (
          <CareInfoRow key={row.label} {...row} />
        ))}
      </div>
    </section>
  );
}
