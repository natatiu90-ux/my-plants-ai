"use client";

import type { PhotoType } from "@/types/plant";
import { useI18n } from "@/i18n/I18nProvider";

const photoTypes: PhotoType[] = ["overview", "leaf", "pot", "roots", "problem", "other"];

export function PhotoTypeSelector({ value, onChange }: { value: PhotoType; onChange: (value: PhotoType) => void }) {
  const { t } = useI18n();

  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as PhotoType)}
      className="min-h-10 w-full rounded-[14px] bg-white/85 px-3 text-xs font-extrabold text-[#5f594f] outline-none"
    >
      {photoTypes.map((photoType) => (
        <option key={photoType} value={photoType}>
          {t(`photoTypes.${photoType}`)}
        </option>
      ))}
    </select>
  );
}
