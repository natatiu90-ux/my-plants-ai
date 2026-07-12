"use client";

import { formatRelativeDate } from "@/lib/date-format";
import { useI18n } from "@/i18n/I18nProvider";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { PlantMilestone, PlantMilestoneType } from "@/types/plant";

const milestoneIcons: Record<PlantMilestoneType, string> = {
  plant_added: "🏡",
  moved_home: "🪟",
  repotted: "🌱",
  new_leaf: "✨",
  bloomed: "🌸",
  damaged: "🍃",
  recovered: "💚",
  treatment_started: "🧴",
  treatment_completed: "🌿",
  custom_note: "✍️"
};

const fallbackTitleKeys: Record<PlantMilestoneType, TranslationKey> = {
  plant_added: "milestones.plant_added.title",
  moved_home: "milestones.moved_home.title",
  repotted: "milestones.repotted.title",
  new_leaf: "milestones.new_leaf.title",
  bloomed: "milestones.bloomed.title",
  damaged: "milestones.damaged.title",
  recovered: "milestones.recovered.title",
  treatment_started: "milestones.treatment_started.title",
  treatment_completed: "milestones.treatment_completed.title",
  custom_note: "milestones.custom_note.title"
};

const fallbackDescriptionKeys: Record<PlantMilestoneType, TranslationKey> = {
  plant_added: "milestones.custom_note.description",
  moved_home: "milestones.moved_home.description",
  repotted: "milestones.repotted.description",
  new_leaf: "milestones.new_leaf.description",
  bloomed: "milestones.bloomed.description",
  damaged: "milestones.damaged.description",
  recovered: "milestones.recovered.description",
  treatment_started: "milestones.treatment_started.description",
  treatment_completed: "milestones.treatment_completed.description",
  custom_note: "milestones.custom_note.description"
};

export function CareHistoryItem({ milestone }: { milestone: PlantMilestone }) {
  const { locale, t } = useI18n();
  const title = milestone.customTitle ?? t(milestone.titleKey ?? fallbackTitleKeys[milestone.type]);
  const description = milestone.note || milestone.customDescription || t(milestone.descriptionKey ?? fallbackDescriptionKeys[milestone.type]);
  const eventDate = milestone.eventDate ?? milestone.createdAt;

  return (
    <li className="flex gap-3 rounded-[22px] bg-white/55 px-3.5 py-4 shadow-[0_1px_7px_rgba(0,0,0,0.025)]">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#f1eadf] text-xl">
        {milestoneIcons[milestone.type]}
      </span>
      <div className="min-w-0">
        <h3 className="font-rounded text-[16px] font-extrabold leading-5 text-[#332f2a]">{title}</h3>
        {description ? <p className="mt-1 text-sm leading-5 text-[#676157]">{description}</p> : null}
        <p className="mt-2 text-xs font-bold text-[#a29a8f]">{formatRelativeDate(eventDate, locale, "")}</p>
      </div>
    </li>
  );
}
