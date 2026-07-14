"use client";

import { RotateCcw, RotateCw, Star, Trash2 } from "lucide-react";
import type { ImageRotationDegrees } from "@/lib/client-image-normalization";
import type { PhotoType } from "@/types/plant";
import { useI18n } from "@/i18n/I18nProvider";
import { PhotoImage } from "./PhotoImage";
import { PhotoTypeSelector } from "./PhotoTypeSelector";

export type PhotoReviewItem = {
  id: string;
  debugId?: string;
  url: string;
  thumbnailUrl?: string;
  source?: "camera" | "gallery";
  orientation?: {
    exifOrientation: number | null;
    physicallyRotated: boolean;
    storedWidth: number | null;
    storedHeight: number | null;
    displayedWidth: number | null;
    displayedHeight: number | null;
  };
  type: PhotoType;
  isCover: boolean;
};

export function PhotoReviewGrid({
  photos,
  onChangeType,
  onRemovePhoto,
  onSelectCover,
  onRotatePhoto,
  rotatingPhotoId
}: {
  photos: PhotoReviewItem[];
  onChangeType: (photoId: string, type: PhotoType) => void;
  onRemovePhoto: (photoId: string) => void;
  onSelectCover: (photoId: string) => void;
  onRotatePhoto?: (photoId: string, degrees: ImageRotationDegrees) => void;
  rotatingPhotoId?: string | null;
}) {
  const { t } = useI18n();
  const isAnyPhotoRotating = rotatingPhotoId != null;

  return (
    <div className="grid grid-cols-2 gap-3">
      {photos.map((photo) => (
        <div key={photo.id} className="rounded-[22px] bg-white/55 p-2 shadow-[0_1px_7px_rgba(0,0,0,0.035)]">
          <div className="relative aspect-square overflow-hidden rounded-[18px] bg-[#dde8dc]">
            <PhotoImage
              src={photo.thumbnailUrl ?? photo.url}
              alt={t("photos.photoAlt")}
              className="h-full w-full object-cover"
              onLoad={() => {
                if (!photo.orientation || process.env.NODE_ENV === "production") return;
                console.info("photo_orientation_stage", {
                  stage: "photo_manager_preview",
                  source: photo.source ?? "unknown",
                  photoId: photo.id,
                  debugId: photo.debugId,
                  width: photo.orientation.storedWidth,
                  height: photo.orientation.storedHeight,
                  exifOrientation: photo.orientation.exifOrientation,
                  physicallyRotated: photo.orientation.physicallyRotated,
                  displayedInUi: `${photo.orientation.displayedWidth ?? "unknown"}x${photo.orientation.displayedHeight ?? "unknown"}`
                });
              }}
            />
            <div className="absolute right-2 top-2 flex gap-1.5">
              {onRotatePhoto ? (
                <>
                  <button
                    type="button"
                    onClick={() => onRotatePhoto(photo.id, -90)}
                    disabled={isAnyPhotoRotating}
                    aria-label={t("photos.rotateLeft")}
                    className={`flex size-8 items-center justify-center rounded-full bg-white/90 text-[#4f6f58] shadow-[0_1px_8px_rgba(0,0,0,0.12)] disabled:opacity-60 ${
                      rotatingPhotoId === photo.id ? "animate-pulse" : ""
                    }`}
                  >
                    <RotateCcw aria-hidden="true" size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRotatePhoto(photo.id, 90)}
                    disabled={isAnyPhotoRotating}
                    aria-label={t("photos.rotateRight")}
                    className={`flex size-8 items-center justify-center rounded-full bg-white/90 text-[#4f6f58] shadow-[0_1px_8px_rgba(0,0,0,0.12)] disabled:opacity-60 ${
                      rotatingPhotoId === photo.id ? "animate-pulse" : ""
                    }`}
                  >
                    <RotateCw aria-hidden="true" size={14} />
                  </button>
                </>
              ) : null}
              <button
                type="button"
                onClick={() => onRemovePhoto(photo.id)}
                disabled={rotatingPhotoId === photo.id}
                aria-label={t("photos.removePhoto")}
                className="flex size-8 items-center justify-center rounded-full bg-white/90 text-[#a13445] shadow-[0_1px_8px_rgba(0,0,0,0.12)] disabled:opacity-60"
              >
                <Trash2 aria-hidden="true" size={14} />
              </button>
            </div>
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
