"use client";

import { Star } from "lucide-react";
import type { PlantPhoto } from "@/types/plant";
import { useI18n } from "@/i18n/I18nProvider";
import { PhotoImage } from "./PhotoImage";
import { PhotoTypeBadge } from "./PhotoTypeBadge";

export function PhotoCard({
  photo,
  onOpen,
  onSetCover,
  canSetCover = false
}: {
  photo: PlantPhoto;
  onOpen: () => void;
  onSetCover?: () => void;
  canSetCover?: boolean;
}) {
  const { t } = useI18n();

  return (
    <div className="w-[104px] shrink-0">
      <button
        type="button"
        onClick={onOpen}
        className="relative h-[104px] w-full overflow-hidden rounded-[22px] bg-[#dde8dc] shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
      >
        <PhotoImage src={photo.url} alt={t("photos.photoAlt")} className="h-full w-full object-cover" />
        <span className="absolute bottom-2 left-2">
          <PhotoTypeBadge type={photo.type} />
        </span>
        {photo.isCover ? (
          <span className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-[#ddf2dc] text-[#2d7a4f]">
            <Star aria-hidden="true" size={14} fill="currentColor" />
          </span>
        ) : null}
      </button>
      {canSetCover && !photo.isCover ? (
        <button type="button" onClick={onSetCover} className="mt-2 w-full text-xs font-extrabold text-[#6b8f68]">
          {t("photos.setAsCover")}
        </button>
      ) : null}
    </div>
  );
}
