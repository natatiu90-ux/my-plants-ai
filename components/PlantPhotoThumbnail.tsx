"use client";

import { MoreHorizontal, Star } from "lucide-react";
import type { PlantPhoto } from "@/types/plant";
import { useI18n } from "@/i18n/I18nProvider";
import { PhotoImage } from "./PhotoImage";
import { PhotoTypeBadge } from "./PhotoTypeBadge";

export function PlantPhotoThumbnail({
  photo,
  isMenuOpen,
  onOpen,
  onToggleMenu,
  onSetCover,
  onChangeType,
  onDelete
}: {
  photo: PlantPhoto;
  isMenuOpen: boolean;
  onOpen: () => void;
  onToggleMenu: () => void;
  onSetCover: () => void;
  onChangeType: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="relative w-[128px] shrink-0 rounded-[24px] bg-white/55 p-2 shadow-[0_1px_7px_rgba(0,0,0,0.035)]">
      <button
        type="button"
        onClick={onOpen}
        className="relative aspect-square w-full overflow-hidden rounded-[18px] bg-[#dde8dc]"
      >
        <PhotoImage src={photo.thumbnailUrl ?? photo.url} alt={t("photos.photoAlt")} className="h-full w-full object-contain" />
        <span className="absolute bottom-2 left-2">
          <PhotoTypeBadge type={photo.type} />
        </span>
        {photo.isCover ? (
          <span className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-[#ddf2dc] text-[#2d7a4f]">
            <Star aria-hidden="true" size={14} fill="currentColor" />
          </span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={onToggleMenu}
        aria-label={t("photos.photoActions")}
        className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-white/90 text-[#5f594f] shadow-[0_1px_8px_rgba(0,0,0,0.12)]"
      >
        <MoreHorizontal aria-hidden="true" size={17} />
      </button>
      {photo.isCover ? (
        <p className="mt-2 flex min-h-8 items-center gap-1 rounded-[14px] bg-[#ddf2dc] px-2 text-[11px] font-extrabold text-[#2d7a4f]">
          <Star aria-hidden="true" size={13} fill="currentColor" />
          {t("photos.currentCover")}
        </p>
      ) : null}
      {isMenuOpen ? (
        <div className="absolute right-2 top-12 z-10 grid w-40 gap-1 rounded-[18px] bg-[#fffaf3] p-2 text-left shadow-[0_12px_34px_rgba(0,0,0,0.16)]">
          <button
            type="button"
            disabled={photo.isCover}
            onClick={onSetCover}
            className="rounded-[12px] px-3 py-2 text-left text-xs font-extrabold text-[#5f594f] disabled:text-[#a29a8f]"
          >
            {photo.isCover ? t("photos.currentCover") : t("photos.setAsCover")}
          </button>
          <button type="button" onClick={onChangeType} className="rounded-[12px] px-3 py-2 text-left text-xs font-extrabold text-[#5f594f]">
            {t("photos.changeType")}
          </button>
          <button type="button" onClick={onDelete} className="rounded-[12px] px-3 py-2 text-left text-xs font-extrabold text-[#a13445]">
            {t("photos.deletePhoto")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
