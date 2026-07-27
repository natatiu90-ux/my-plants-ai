"use client";

import { milestoneDateLabel } from "@/lib/milestone-dates";
import { useI18n } from "@/i18n/I18nProvider";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { PlantTimelineEvent, PlantTimelineEventKind } from "@/lib/plant-timeline";
import type { PlantMilestone, PlantMilestoneType } from "@/types/plant";

const timelineIcons: Record<PlantTimelineEventKind, string> = {
  plant_added: "🏡",
  watering: "💧",
  soil_check: "🌱",
  repotting: "🌱",
  repotting_unknown: "🌱",
  pruning: "✂️",
  photo_added: "📷",
  checkin_completed: "📷",
  followup_scheduled: "🌿",
  followup_completed: "📷",
  diagnosis_updated: "🌿"
};

const milestoneIcons: Record<PlantMilestoneType, string> = {
  plant_added: timelineIcons.plant_added,
  watered: timelineIcons.watering,
  watering_unknown: timelineIcons.watering,
  soil_checked: timelineIcons.soil_check,
  moved_home: "🪟",
  repotted: timelineIcons.repotting,
  repotting_unknown: timelineIcons.repotting_unknown,
  fertilized: "🧴",
  new_leaf: "✨",
  bloomed: "🌸",
  pruned: timelineIcons.pruning,
  damaged: "🍃",
  recovered: "💚",
  treatment_started: "🧴",
  treatment_completed: "🌿",
  follow_up_completed: timelineIcons.followup_completed,
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
  follow_up_completed: "milestones.follow_up_completed.title",
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
  follow_up_completed: "milestones.follow_up_completed.description",
  custom_note: "milestones.custom_note.description"
};

function MilestoneHistoryItem({ milestone }: { milestone: PlantMilestone }) {
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

function isTranslationKey(value: string): value is TranslationKey {
  return value.includes(".");
}

function eventDateLabel(event: PlantTimelineEvent, locale: "en" | "ru", unknownDate: string) {
  const milestone = event.payload?.milestone as PlantMilestone | undefined;
  if (milestone) {
    return milestoneDateLabel(milestone, locale, unknownDate);
  }
  return milestoneDateLabel(
    {
      id: event.id,
      plantId: event.plantId,
      type: event.kind === "watering" ? "watered" : event.kind === "soil_check" ? "soil_checked" : event.kind === "repotting" ? "repotted" : event.kind === "repotting_unknown" ? "repotting_unknown" : event.kind === "pruning" ? "pruned" : event.kind === "plant_added" ? "plant_added" : "follow_up_completed",
      createdAt: event.sortAt,
      eventDate: event.occurredAt
    },
    locale,
    unknownDate
  );
}

export function CareHistoryItem({ event }: { event: PlantTimelineEvent }) {
  const { locale, t } = useI18n();
  const milestone = event.payload?.milestone as PlantMilestone | undefined;
  if (milestone) {
    return <MilestoneHistoryItem milestone={milestone} />;
  }

  const title = isTranslationKey(event.title) ? t(event.title) : event.title;
  const description = event.body ? (isTranslationKey(event.body) ? t(event.body) : event.body) : undefined;

  return (
    <li className="flex min-w-0 gap-3 rounded-[22px] bg-white/55 px-3.5 py-4 shadow-[0_1px_7px_rgba(0,0,0,0.025)]">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#f1eadf] text-xl">
        {timelineIcons[event.kind]}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-rounded text-[16px] font-extrabold leading-5 text-[#332f2a] [overflow-wrap:anywhere]">{title}</h3>
        {description ? <p className="mt-1 text-sm leading-5 text-[#676157] [overflow-wrap:anywhere]">{description}</p> : null}
        <p className="mt-2 text-xs font-bold text-[#a29a8f]">{eventDateLabel(event, locale, t("milestones.dateUnknown"))}</p>
      </div>
    </li>
  );
}
