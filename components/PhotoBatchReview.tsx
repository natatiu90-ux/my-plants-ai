"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { PhotoReviewGrid } from "./PhotoReviewGrid";
import type { PendingPhotoUpload } from "./photo-upload-types";

export function PhotoBatchReview({
  initialPhotos,
  hasExistingCover,
  rejectedCount = 0,
  photos: controlledPhotos,
  primaryLabel,
  addMoreLabel,
  emptyTitle,
  emptyText,
  limitReachedText,
  maxPhotos,
  onPhotosChange,
  onAddMore,
  onDiscardPhoto,
  onCancel,
  onSave
}: {
  initialPhotos: PendingPhotoUpload[];
  hasExistingCover: boolean;
  rejectedCount?: number;
  photos?: PendingPhotoUpload[];
  primaryLabel?: string;
  addMoreLabel?: string;
  emptyTitle?: string;
  emptyText?: string;
  limitReachedText?: string;
  maxPhotos?: number;
  onPhotosChange?: (photos: PendingPhotoUpload[]) => void;
  onAddMore?: () => void;
  onDiscardPhoto?: (photo: PendingPhotoUpload) => void;
  onCancel: () => void;
  onSave: (photos: PendingPhotoUpload[]) => void;
}) {
  const { t } = useI18n();
  const [internalPhotos, setInternalPhotos] = useState<PendingPhotoUpload[]>(() =>
    initialPhotos.map((photo, index) => ({
      ...photo,
      isCover: !hasExistingCover && index === 0
    }))
  );
  const photos = controlledPhotos ?? internalPhotos;
  const isAtLimit = typeof maxPhotos === "number" && photos.length >= maxPhotos;

  useEffect(() => {
    if (controlledPhotos) {
      return;
    }

    setInternalPhotos(
      initialPhotos.map((photo, index) => ({
        ...photo,
        isCover: !hasExistingCover && index === 0
      }))
    );
  }, [controlledPhotos, hasExistingCover, initialPhotos]);

  const applyPhotos = (updater: (current: PendingPhotoUpload[]) => PendingPhotoUpload[]) => {
    const nextPhotos = updater(photos);
    if (controlledPhotos) {
      onPhotosChange?.(nextPhotos);
    } else {
      setInternalPhotos(nextPhotos);
    }
  };

  const updatePhoto = (photoId: string, nextPhoto: Partial<PendingPhotoUpload>) => {
    applyPhotos((current) => current.map((photo) => (photo.id === photoId ? { ...photo, ...nextPhoto } : photo)));
  };

  const selectCover = (photoId: string) => {
    applyPhotos((current) => current.map((photo) => ({ ...photo, isCover: photo.id === photoId })));
  };

  const removePhoto = (photoId: string) => {
    if (photos.length === 1) {
      const shouldRemoveLast = window.confirm(t("photos.removeLastConfirm"));
      if (!shouldRemoveLast) {
        return;
      }
    }

    const removedPhoto = photos.find((photo) => photo.id === photoId);
    if (removedPhoto) {
      onDiscardPhoto?.(removedPhoto);
    }

    applyPhotos((current) => {
      const nextPhotos = current.filter((photo) => photo.id !== photoId);
      if (!nextPhotos.length || nextPhotos.some((photo) => photo.isCover) || hasExistingCover) {
        return nextPhotos;
      }

      const preferredCover = nextPhotos.find((photo) => photo.type === "overview") ?? nextPhotos[0];
      return nextPhotos.map((photo) => ({ ...photo, isCover: photo.id === preferredCover.id }));
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
          {photos.length ? (
            <PhotoReviewGrid
              photos={photos}
              onChangeType={(photoId, type) => updatePhoto(photoId, { type })}
              onRemovePhoto={removePhoto}
              onSelectCover={selectCover}
            />
          ) : (
            <div className="rounded-[22px] bg-white/60 p-5 text-center">
              <p className="font-rounded text-xl font-extrabold text-ink">{emptyTitle ?? t("photos.review")}</p>
              {emptyText ? <p className="mt-2 text-sm font-bold leading-5 text-[#7a7166]">{emptyText}</p> : null}
            </div>
          )}
        </div>
        {onAddMore ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={onAddMore}
              disabled={isAtLimit}
              className="min-h-12 w-full rounded-[18px] bg-[#ddf2dc] px-4 text-sm font-extrabold text-[#2d7a4f] disabled:opacity-50"
            >
              {addMoreLabel ?? t("photos.addPhotos")}
            </button>
            {isAtLimit && limitReachedText ? <p className="mt-2 text-center text-xs font-bold leading-4 text-[#8a6230]">{limitReachedText}</p> : null}
          </div>
        ) : null}
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
            {primaryLabel ?? t("photos.savePhotos")}
          </button>
        </div>
      </div>
    </div>
  );
}
