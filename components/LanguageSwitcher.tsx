"use client";

import { Check } from "lucide-react";
import { locales, type Locale } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/I18nProvider";

const localeLabels: Record<Locale, "settings.english" | "settings.russian"> = {
  en: "settings.english",
  ru: "settings.russian"
};

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="grid grid-cols-2 gap-2 rounded-[20px] bg-white/70 p-1.5">
      {locales.map((option) => {
        const isSelected = option === locale;

        return (
          <button
            key={option}
            type="button"
            onClick={() => setLocale(option)}
            aria-pressed={isSelected}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-bold transition ${
              isSelected ? "bg-[#ddf2dc] text-[#2d7a4f] shadow-[0_1px_5px_rgba(0,0,0,0.06)]" : "text-[#777167]"
            }`}
          >
            {isSelected ? <Check aria-hidden="true" size={16} /> : null}
            {t(localeLabels[option])}
          </button>
        );
      })}
    </div>
  );
}
