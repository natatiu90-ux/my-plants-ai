"use client";

import { useI18n } from "@/i18n/I18nProvider";
import type { PhotoType } from "@/types/plant";

export function PhotoTypeBadge({ type }: { type: PhotoType }) {
  const { t } = useI18n();

  return (
    <span className="rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-extrabold text-[#5f594f] shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      {t(`photoTypes.${type}`)}
    </span>
  );
}
