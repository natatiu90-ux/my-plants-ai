"use client";

import { Plus } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";

export function FloatingAddButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("addPlant.open")}
      className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-[max(1.25rem,calc((100vw-430px)/2+1.25rem))] z-20 flex size-[62px] items-center justify-center rounded-full border-[2.5px] border-white/30 bg-gradient-to-br from-[#92cc90] to-[#6ba369] text-white shadow-fab transition hover:-translate-y-1 active:translate-y-0"
    >
      <Plus aria-hidden="true" size={28} strokeWidth={2.7} />
    </button>
  );
}
