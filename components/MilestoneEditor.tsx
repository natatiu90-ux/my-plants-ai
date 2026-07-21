"use client";

import { useState } from "react";
import { formatLongDate, toDateKey } from "@/lib/date-format";
import { canSaveMilestoneDraft, dateFieldIsVisible, initialMilestoneEditorDraft, selectMilestoneType } from "@/lib/milestone-editor-state";
import { useI18n } from "@/i18n/I18nProvider";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { PlantMilestone, PlantMilestoneType } from "@/types/plant";

const milestoneTypes: PlantMilestoneType[] = [
  "watered",
  "repotted",
  "soil_checked",
  "fertilized",
  "moved_home",
  "new_leaf",
  "bloomed",
  "pruned",
  "damaged",
  "recovered",
  "custom_note"
];

const milestoneTitleKeys: Record<PlantMilestoneType, TranslationKey> = {
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

export function MilestoneEditor({
  milestone,
  onCancel,
  onSave
}: {
  milestone?: PlantMilestone;
  onCancel: () => void;
  onSave: (input: { type: PlantMilestoneType; eventDate: string; note?: string }) => Promise<void> | void;
}) {
  const { locale, t } = useI18n();
  const today = toDateKey(new Date());
  const initialDraft = initialMilestoneEditorDraft(milestone, today);
  const [type, setType] = useState<PlantMilestoneType | null>(initialDraft.type);
  const [eventDate, setEventDate] = useState(initialDraft.eventDate);
  const [note, setNote] = useState(initialDraft.note);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const selectType = (nextType: PlantMilestoneType) => {
    setType(nextType);
    setEventDate((current) => selectMilestoneType(current, today));
    setError(null);
  };

  const save = async () => {
    if (!type || !eventDate || isSaving) {
      return;
    }

    if (eventDate > today) {
      setError(t("story.noFutureDate"));
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSave({ type, eventDate, note: note.trim() || undefined });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("story.saveFailed"));
      setIsSaving(false);
    }
  };

  const canSave = canSaveMilestoneDraft({ type, eventDate, isSaving });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1c1c1e]/20 px-4 pb-4 backdrop-blur-[2px] sm:items-center sm:pb-0">
      <div role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-[390px] overflow-y-auto rounded-[28px] bg-[#fffaf3] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.16)]">
        <h2 className="font-rounded text-2xl font-extrabold text-ink">{milestone ? t("story.editEvent") : t("story.addEvent")}</h2>
        <p className="mt-4 text-sm font-extrabold text-[#4f4940]">{t("story.eventType")}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {milestoneTypes.map((milestoneType) => (
            <button
              key={milestoneType}
              type="button"
              onClick={() => selectType(milestoneType)}
              className={`min-h-12 rounded-[18px] px-3 text-sm font-extrabold ${
                type === milestoneType ? "bg-[#ddf2dc] text-[#2d7a4f]" : "bg-white/75 text-[#5f594f]"
              }`}
            >
              {t(milestoneTitleKeys[milestoneType])}
            </button>
          ))}
        </div>
        {dateFieldIsVisible(type) ? (
          <label className="mt-4 block min-w-0 text-sm font-extrabold text-[#4f4940]">
            {t("story.eventDate")}
            <span className="relative mt-2 flex min-h-12 w-full max-w-full min-w-0 items-center justify-between gap-3 overflow-hidden rounded-[18px] bg-white/80 px-4 text-base font-extrabold text-[#3f3b35]">
              <span className="min-w-0 flex-1 truncate">{eventDate ? formatLongDate(eventDate, locale) : t("baseline.chooseDate")}</span>
              <span className="shrink-0 text-sm text-[#2d7a4f]">{eventDate ? t("baseline.changeDate") : t("baseline.chooseDate")}</span>
              <input
                type="date"
                max={today}
                value={eventDate}
                onChange={(event) => {
                  setEventDate(event.target.value);
                  setError(null);
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </span>
          </label>
        ) : null}
        <label className="mt-4 block text-sm font-extrabold text-[#4f4940]">
          {t("story.eventNote")}
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("story.eventNotePlaceholder")}
            className="mt-2 min-h-28 w-full rounded-[20px] bg-white/80 p-4 text-sm leading-6 outline-none"
          />
        </label>
        {error ? <p className="mt-3 rounded-[18px] bg-[#fdeaf0] p-3 text-sm font-bold text-[#9b2c3e]">{error}</p> : null}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} disabled={isSaving} className="min-h-12 rounded-[18px] bg-white px-4 text-sm font-extrabold text-[#5f594f] disabled:opacity-60">
            {t("plantDetail.cancel")}
          </button>
          <button type="button" onClick={() => void save()} disabled={!canSave} className="min-h-12 rounded-[18px] bg-[#ddf2dc] px-4 text-sm font-extrabold text-[#2d7a4f] disabled:opacity-60">
            {isSaving ? t("homeContext.saving") : t("story.saveEvent")}
          </button>
        </div>
      </div>
    </div>
  );
}
