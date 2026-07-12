"use client";

import { Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { PhotoImage } from "./PhotoImage";
import { PhotoTypeSelector } from "./PhotoTypeSelector";
import type { PendingPhotoUpload } from "./photo-upload-types";

export function PhotoBatchReview({
  initialPhotos,
  hasExistingCover,
  rejectedCount = 0,
  onCancel,
  onSave
}: {
  initialPhotos: PendingPhotoUpload[];
  hasExistingCover: boolean;
  rejectedCount?: number;
  onCancel: () => void;
  onSave: (photos: PendingPhotoUpload[]) => void;
}) {
  const { t } = useI18n();
  const [photos, setPhotos] = useState<PendingPhotoUpload[]>(() =>
    initialPhotos.map((photo, index) => ({
      ...photo,
      isCover: !hasExistingCover && index === 0
    }))
  );

  const updatePhoto = (photoId: string, nextPhoto: Partial<PendingPhotoUpload>) => {
    setPhotos((current) => current.map((photo) => (photo.id === photoId ? { ...photo, ...nextPhoto } : photo)));
  };

  const selectCover = (photoId: string) => {
    setPhotos((current) => current.map((photo) => ({ ...photo, isCover: photo.id === photoId })));
  };

  const removePhoto = (photoId: string) => {
    setPhotos((current) => {
      const nextPhotos = current.filter((photo) => photo.id !== photoId);
      if (!nextPhotos.length || nextPhotos.some((photo) => photo.isCover) || hasExistingCover) {
        return nextPhotos;
      }

      return nextPhotos.map((photo, index) => ({ ...photo, isCover: index === 0 }));
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#1c1c1e]/20 px-4 pb-4 backdrop-blur-[2px] sm:items-center sm:pb-0">
      <div role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-[390px] overflow-y-auto rounded-[28px] bg-[#fffaf3] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.16)]">
        <h2 className="font-rounded text-2xl font-extrabold text-ink">{t("photos.review")}</h2>
        {rejectedCount > 0 ? (
          <p className="mt-3 rounded-[18px] bg-[#fff1d8] p-3 text-sm font-bold leading-5 text-[#8a6230]">
            {t("photos.partialAdded", { added: initialPhotos.length, rejected: rejectedCount })}
          </p>
        ) : null}
        <div className="mt-4 grid grid-cols-2 gap-3">
          {photos.map((photo) => (
            <div key={photo.id} className="rounded-[22px] bg-white/55 p-2 shadow-[0_1px_7px_rgba(0,0,0,0.035)]">
              <div className="relative aspect-square overflow-hidden rounded-[18px] bg-[#dde8dc]">
                <PhotoImage src={photo.url} alt={t("photos.photoAlt")} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(photo.id)}
                  aria-label={t("photos.removePhoto")}
                  className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-white/90 text-[#a13445] shadow-[0_1px_8px_rgba(0,0,0,0.12)]"
                >
                  <Trash2 aria-hidden="true" size={14} />
                </button>
              </div>
              <div className="mt-2 grid gap-2">
                <PhotoTypeSelector value={photo.type} onChange={(type) => updatePhoto(photo.id, { type })} />
                <button
                  type="button"
                  onClick={() => selectCover(photo.id)}
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
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className="min-h-12 rounded-[18px] bg-white px-4 text-sm font-extrabold text-[#5f594f]">
            {t("plantDetail.cancel")}
          </button>
          <button
            type="button"
            disabled={!photos.length}
            onClick={() => onSave(photos)}
            className="min-h-12 rounded-[18px] bg-gradient-to-br from-[#92cc90] to-[#6ba369] px-4 text-sm font-extrabold text-white shadow-fab disabled:opacity-50"
          >
            {t("photos.savePhotos")}
          </button>
        </div>
      </div>
    </div>
  );
}
