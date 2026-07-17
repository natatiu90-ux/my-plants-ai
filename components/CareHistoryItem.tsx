"use client";

import { milestoneDateLabel } from "@/lib/milestone-dates";
import { useI18n } from "@/i18n/I18nProvider";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { PlantMilestone, PlantMilestoneType } from "@/types/plant";

const milestoneIcons: Record<PlantMilestoneType, string> = {
  plant_added: "🏡",
  watered: "💧",
  watering_unknown: "💧",
  soil_checked: "🌱",
  moved_home: "🪟",
  repotted: "🌱",
  repotting_unknown: "🌱",
  fertilized: "🧴",
  new_leaf: "✨",
  bloomed: "🌸",
  pruned: "✂️",
  damaged: "🍃",
  recovered: "💚",
  treatment_started: "🧴",
  treatment_completed: "🌿",
  custom_note: "✍️"
};

const fallbackTitleKeys: Record<PlantMilestoneType, TranslationKey> = {
  plant_added: "milestones.plant_added.title",
  watered: "milestones.watered.title",
  watering_unknown: "milestones.watering_unknown.title",
  soil_checked: "milestones.soil_checked.title",
  moved_home: "milestones.moved_home.title",
  repotted: "milestones.repotted.title",
  repotting_unknown: "milestones.repotting_unknown.title",
  fertilized: "milestones.fertilized.title",
  new_leaf: "milestones.new_leaf.title",
  bloomed: "milestones.bloomed.title",
  pruned: "milestones.pruned.title",
  damaged: "milestones.damaged.title",
  recovered: "milestones.recovered.title",
  treatment_started: "milestones.treatment_started.title",
  treatment_completed: "milestones.treatment_completed.title",
  custom_note: "milestones.custom_note.title"
};

const fallbackDescriptionKeys: Record<PlantMilestoneType, TranslationKey> = {
  plant_added: "milestones.custom_note.description",
  watered: "milestones.watered.description",
  watering_unknown: "milestones.watering_unknown.description",
  soil_checked: "milestones.soil_checked.description",
  moved_home: "milestones.moved_home.description",
  repotted: "milestones.repotted.description",
  repotting_unknown: "milestones.repotting_unknown.description",
  fertilized: "milestones.fertilized.description",
  new_leaf: "milestones.new_leaf.description",
  bloomed: "milestones.bloomed.description",
  pruned: "milestones.pruned.description",
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

  return (
    <li className="flex min-w-0 gap-3 rounded-[22px] bg-white/55 px-3.5 py-4 shadow-[0_1px_7px_rgba(0,0,0,0.025)]">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#f1eadf] text-xl">
        {milestoneIcons[milestone.type]}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-rounded text-[16px] font-extrabold leading-5 text-[#332f2a] [overflow-wrap:anywhere]">{title}</h3>
        {description ? <p className="mt-1 text-sm leading-5 text-[#676157] [overflow-wrap:anywhere]">{description}</p> : null}
        <p className="mt-2 text-xs font-bold text-[#a29a8f]">{milestoneDateLabel(milestone, locale, t("milestones.dateUnknown"))}</p>
      </div>
    </li>
  );
}
