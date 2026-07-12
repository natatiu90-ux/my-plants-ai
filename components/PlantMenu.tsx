"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";

export function PlantMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const { t } = useI18n();

  return (
    <div className="absolute right-0 top-[96px] z-20 w-56 rounded-[22px] bg-[#fffaf3] p-2 shadow-[0_14px_44px_rgba(0,0,0,0.14)]">
      <button
        type="button"
        onClick={onEdit}
        className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 text-left text-sm font-bold text-[#565149] hover:bg-[#f4efe6]"
      >
        <Pencil aria-hidden="true" size={17} />
        {t("plantDetail.editPlant")}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 text-left text-sm font-bold text-[#a13445] hover:bg-[#fdeaf0]"
      >
        <Trash2 aria-hidden="true" size={17} />
        {t("plantDetail.deletePlant")}
      </button>
    </div>
  );
}
