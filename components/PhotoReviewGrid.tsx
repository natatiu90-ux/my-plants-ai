"use client";

import { Star, Trash2 } from "lucide-react";
import type { PhotoType } from "@/types/plant";
import { useI18n } from "@/i18n/I18nProvider";
import { PhotoImage } from "./PhotoImage";
import { PhotoTypeSelector } from "./PhotoTypeSelector";

export type PhotoReviewItem = {
  id: string;
  url: string;
  thumbnailUrl?: string;
  type: PhotoType;
  isCover: boolean;
};

export function PhotoReviewGrid({
  photos,
  onChangeType,
  onRemovePhoto,
  onSelectCover
}: {
  photos: PhotoReviewItem[];
  onChangeType: (photoId: string, type: PhotoType) => void;
  onRemovePhoto: (photoId: string) => void;
  onSelectCover: (photoId: string) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="grid grid-cols-2 gap-3">
      {photos.map((photo) => (
        <div key={photo.id} className="rounded-[22px] bg-white/55 p-2 shadow-[0_1px_7px_rgba(0,0,0,0.035)]">
          <div className="relative aspect-square overflow-hidden rounded-[18px] bg-[#dde8dc]">
            <PhotoImage src={photo.thumbnailUrl ?? photo.url} alt={t("photos.photoAlt")} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onRemovePhoto(photo.id)}
              aria-label={t("photos.removePhoto")}
              className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-white/90 text-[#a13445] shadow-[0_1px_8px_rgba(0,0,0,0.12)]"
            >
              <Trash2 aria-hidden="true" size={14} />
            </button>
          </div>
          <div className="mt-2 grid gap-2">
            <PhotoTypeSelector value={photo.type} onChange={(type) => onChangeType(photo.id, type)} />
            <button
              type="button"
              onClick={() => onSelectCover(photo.id)}
              className={`flex min-h-10 items-center justify-center gap-1 rounded-[14px] px-2 text-xs font-extrabold ${
                photo.isCover ? "bg-[#ddf2dc] text-[#2d7a4f]" : "bg-white/80 text-[#7d776b]"
              }`}
            >
              <Star aria-hidden="true" size={14} fill={photo.isCover ? "currentColor" : "none"} />
              {photo.isCover ? t("photos.currentCover") : t("photos.useAsCover")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
