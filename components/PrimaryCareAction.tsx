"use client";

import { Camera, Droplets, Sprout } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import type { Plant, PlantAction } from "@/types/plant";

const actionIcons: Exclude<PlantAction, null>[] = ["water", "check_soil", "take_photo"];

export function PrimaryCareAction({ plant, onAction, disabled }: { plant: Plant; onAction: () => void; disabled?: boolean }) {
  const { t } = useI18n();
  const action = plant.nextAction;

  if (!action) {
    return null;
  }

  const Icon = action === "water" ? Droplets : action === "check_soil" ? Sprout : Camera;
  const labelKey = action === "water" ? "actions.water" : action === "check_soil" ? "actions.check_soil" : "actions.take_photo";
  const tone =
    plant.status === "needs_attention"
      ? "from-[#e7899b] to-[#b94a61]"
      : plant.status === "check_soon"
        ? "from-[#f0b96d] to-[#c9852e]"
        : "from-[#92cc90] to-[#6ba369]";

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 mx-auto w-full max-w-[430px] bg-gradient-to-t from-cream via-cream/96 to-cream/0 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-8">
      <button
        type="button"
        onClick={onAction}
        disabled={disabled}
        className={`flex min-h-[58px] w-full items-center justify-center gap-2 rounded-[22px] bg-gradient-to-br ${tone} px-5 text-base font-extrabold text-white shadow-fab transition hover:-translate-y-0.5 active:translate-y-0 disabled:translate-y-0 disabled:opacity-60`}
      >
        <Icon aria-hidden="true" size={20} />
        {t(labelKey)}
      </button>
    </div>
  );
}
