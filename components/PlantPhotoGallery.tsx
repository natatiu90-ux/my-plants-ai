"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import type { PhotoType, PlantPhoto } from "@/types/plant";
import { useI18n } from "@/i18n/I18nProvider";
import { DeletePhotoDialog } from "./DeletePhotoDialog";
import { ImageViewer } from "./ImageViewer";
import { PhotoTypeSelector } from "./PhotoTypeSelector";
import { PlantPhotoThumbnail } from "./PlantPhotoThumbnail";

export function PlantPhotoGallery({
  photos,
  onAddPhoto,
  onSetCover,
  onChangeType,
  onDeletePhoto,
  onOnlyPhotoBlocked
}: {
  photos: PlantPhoto[];
  onAddPhoto?: () => void;
  onSetCover?: (photoId: string) => void;
  onChangeType?: (photoId: string, type: PhotoType) => void;
  onDeletePhoto?: (photoId: string) => Promise<"deleted" | "only-photo">;
  onOnlyPhotoBlocked?: () => void;
}) {
  const { t } = useI18n();
  const [openPhoto, setOpenPhoto] = useState<PlantPhoto | null>(null);
  const [openMenuPhotoId, setOpenMenuPhotoId] = useState<string | null>(null);
  const [editingTypePhoto, setEditingTypePhoto] = useState<PlantPhoto | null>(null);
  const [deletingPhoto, setDeletingPhoto] = useState<PlantPhoto | null>(null);

  const confirmDelete = async () => {
    if (!deletingPhoto || !onDeletePhoto) {
      return;
    }

    const result = await onDeletePhoto(deletingPhoto.id);
    setDeletingPhoto(null);
    setOpenMenuPhotoId(null);

    if (result === "only-photo") {
      onOnlyPhotoBlocked?.();
    }
  };

  return (
    <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <h2 className="font-rounded text-xl font-extrabold text-ink">{t("photos.plantPhotos")}</h2>
        {onAddPhoto ? (
          <button type="button" onClick={onAddPhoto} className="flex min-h-10 items-center gap-1 rounded-full bg-[#ddf2dc] px-3 text-sm font-extrabold text-[#2d7a4f]">
            <Plus aria-hidden="true" size={16} />
            {t("photos.addPhotos")}
          </button>
        ) : null}
      </div>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
        {photos.map((photo) => (
          <PlantPhotoThumbnail
            key={photo.id}
            photo={photo}
            isMenuOpen={openMenuPhotoId === photo.id}
            onOpen={() => setOpenPhoto(photo)}
            onToggleMenu={() => setOpenMenuPhotoId((current) => (current === photo.id ? null : photo.id))}
            onSetCover={() => {
              onSetCover?.(photo.id);
              setOpenMenuPhotoId(null);
            }}
            onChangeType={() => {
              setEditingTypePhoto(photo);
              setOpenMenuPhotoId(null);
            }}
            onDelete={() => {
              setDeletingPhoto(photo);
              setOpenMenuPhotoId(null);
            }}
          />
        ))}
      </div>
      {editingTypePhoto ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1c1c1e]/20 px-4 pb-4 backdrop-blur-[2px] sm:items-center sm:pb-0">
          <div role="dialog" aria-modal="true" className="w-full max-w-[360px] rounded-[28px] bg-[#fffaf3] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.16)]">
            <h2 className="font-rounded text-2xl font-extrabold text-ink">{t("photos.changeType")}</h2>
            <div className="mt-4">
              <PhotoTypeSelector
                value={editingTypePhoto.type}
                onChange={(type) => {
                  onChangeType?.(editingTypePhoto.id, type);
                  setEditingTypePhoto(null);
                }}
              />
            </div>
            <button type="button" onClick={() => setEditingTypePhoto(null)} className="mt-4 min-h-12 w-full rounded-[18px] bg-white px-4 text-sm font-extrabold text-[#5f594f]">
              {t("plantDetail.cancel")}
            </button>
          </div>
        </div>
      ) : null}
      {deletingPhoto ? <DeletePhotoDialog onCancel={() => setDeletingPhoto(null)} onConfirm={confirmDelete} /> : null}
      {openPhoto ? <ImageViewer photo={openPhoto} onClose={() => setOpenPhoto(null)} /> : null}
    </section>
  );
}
