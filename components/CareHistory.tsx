"use client";

import { useI18n } from "@/i18n/I18nProvider";
import type { PlantMilestone } from "@/types/plant";
import { CareHistoryItem } from "./CareHistoryItem";

export function CareHistory({ milestones, onAddEvent }: { milestones: PlantMilestone[]; onAddEvent?: () => void }) {
  const { t } = useI18n();

  return (
    <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <h2 className="font-rounded text-xl font-extrabold text-ink">{t("plantDetail.story")}</h2>
        {onAddEvent ? (
          <button
            type="button"
            onClick={onAddEvent}
            className="flex min-h-10 items-center gap-1 rounded-[16px] bg-[#ddf2dc] px-3 text-xs font-extrabold text-[#2d7a4f]"
          >
            {t("story.addEvent")}
          </button>
        ) : null}
      </div>
      {milestones.length > 0 ? (
        <ol className="grid gap-3">
          {milestones.map((milestone) => (
            <CareHistoryItem key={milestone.id} milestone={milestone} />
          ))}
        </ol>
      ) : (
        <div className="rounded-[22px] bg-white/65 px-4 py-5">
          <p className="font-rounded text-lg font-extrabold text-[#4f4940]">{t("plantDetail.storyEmpty")}</p>
          <p className="mt-1 text-sm leading-5 text-[#776f64]">{t("plantDetail.storyEmptyDescription")}</p>
        </div>
      )}
    </section>
  );
}
