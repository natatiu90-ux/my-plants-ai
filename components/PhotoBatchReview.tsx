"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { PhotoReviewGrid } from "./PhotoReviewGrid";
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
        <div className="mt-4">
          <PhotoReviewGrid
            photos={photos}
            onChangeType={(photoId, type) => updatePhoto(photoId, { type })}
            onRemovePhoto={removePhoto}
            onSelectCover={selectCover}
          />
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
