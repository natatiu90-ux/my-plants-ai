"use client";

import { X } from "lucide-react";
import type { PlantPhoto } from "@/types/plant";
import { useI18n } from "@/i18n/I18nProvider";
import { PhotoImage } from "./PhotoImage";
import { PhotoTypeBadge } from "./PhotoTypeBadge";

export function ImageViewer({ photo, onClose }: { photo: PlantPhoto; onClose: () => void }) {
  const { t } = useI18n();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1c1c1e]/80 p-4">
      <div className="relative h-[72vh] w-full max-w-[430px] overflow-hidden rounded-[28px] bg-black">
        <PhotoImage src={photo.url} alt={t("photos.photoAlt")} className="h-full w-full object-contain" />
        <div className="absolute left-4 top-4">
          <PhotoTypeBadge type={photo.type} />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("settings.close")}
          className="absolute right-4 top-4 flex size-11 items-center justify-center rounded-2xl bg-white/90 text-[#4f4940]"
        >
          <X aria-hidden="true" size={18} />
        </button>
      </div>
    </div>
  );
}
