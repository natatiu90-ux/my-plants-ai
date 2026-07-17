"use client";

import { useEffect, useId, useState } from "react";
import { formatLongDate, toDateKey } from "@/lib/date-format";
import { useI18n } from "@/i18n/I18nProvider";

export function CareDateEditor({
  label,
  value,
  isUnknown = false,
  disabled = false,
  onSaveDate,
  onSaveUnknown
}: {
  label: string;
  value?: string;
  isUnknown?: boolean;
  disabled?: boolean;
  onSaveDate: (date: string) => void;
  onSaveUnknown: () => void;
}) {
  const { locale, t } = useI18n();
  const inputId = useId();
  const today = toDateKey(new Date());
  const [isEditing, setIsEditing] = useState(false);
  const [draftDate, setDraftDate] = useState(value ?? "");

  useEffect(() => {
    if (!isEditing) {
      setDraftDate(value ?? "");
    }
  }, [isEditing, value]);

  const displayValue = value ? formatLongDate(value, locale) : isUnknown ? t("baseline.dontRemember") : t("baseline.chooseDate");
  const canSave = Boolean(draftDate) && draftDate <= today && draftDate !== (value ?? "");

  return (
    <div className="rounded-[18px] bg-white/70 p-3">
      <label htmlFor={inputId} className="flex min-h-12 cursor-pointer items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-xs font-bold uppercase text-[#a09a90]">{label}</span>
          <span className="mt-1 block text-sm font-extrabold leading-5 text-ink">{isEditing && draftDate ? formatLongDate(draftDate, locale) : displayValue}</span>
        </span>
        <span className="shrink-0 text-sm font-extrabold text-[#2d7a4f]">{value ? t("baseline.changeDate") : t("baseline.chooseDate")}</span>
      </label>
      <input
        id={inputId}
        type="date"
        max={today}
        value={draftDate}
        disabled={disabled}
        onFocus={() => setIsEditing(true)}
        onChange={(event) => {
          setIsEditing(true);
          setDraftDate(event.currentTarget.value);
        }}
        className="mt-2 block min-h-11 w-full min-w-0 max-w-full rounded-[16px] bg-[#fffaf3] px-3 text-base font-bold outline-none focus:bg-white focus:ring-2 focus:ring-[#b8dfb6] disabled:opacity-60"
      />
      {isEditing ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" disabled={disabled} onClick={() => { setDraftDate(value ?? ""); setIsEditing(false); }} className="min-h-10 rounded-[15px] bg-white px-3 text-sm font-extrabold text-[#5f594f] disabled:opacity-60">
            {t("plantDetail.cancel")}
          </button>
          <button type="button" disabled={disabled || !canSave} onClick={() => { if (canSave) { onSaveDate(draftDate); setIsEditing(false); } }} className="min-h-10 rounded-[15px] bg-[#ddf2dc] px-3 text-sm font-extrabold text-[#2d7a4f] disabled:opacity-50">
            {t("baseline.saveDate")}
          </button>
        </div>
      ) : null}
      <button type="button" disabled={disabled} onClick={onSaveUnknown} className="mt-2 min-h-10 w-full rounded-[15px] bg-white/80 px-3 text-sm font-extrabold text-[#6f675c] disabled:opacity-60">
        {t("baseline.dontRemember")}
      </button>
    </div>
  );
}
