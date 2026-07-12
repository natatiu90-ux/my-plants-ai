"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import type { PlantPhoto } from "@/types/plant";
import { useI18n } from "@/i18n/I18nProvider";
import { ImageViewer } from "./ImageViewer";
import { PhotoCard } from "./PhotoCard";

export function PhotoGallery({
  photos,
  onAddPhoto,
  onSetCover,
  canSetCover = false
}: {
  photos: PlantPhoto[];
  onAddPhoto?: () => void;
  onSetCover?: (photoId: string) => void;
  canSetCover?: boolean;
}) {
  const { t } = useI18n();
  const [openPhoto, setOpenPhoto] = useState<PlantPhoto | null>(null);

  return (
    <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <h2 className="font-rounded text-xl font-extrabold text-ink">{t("photos.title")}</h2>
        {onAddPhoto ? (
          <button type="button" onClick={onAddPhoto} className="flex min-h-10 items-center gap-1 rounded-full bg-[#ddf2dc] px-3 text-sm font-extrabold text-[#2d7a4f]">
            <Plus aria-hidden="true" size={16} />
            {t("photos.addPhotos")}
          </button>
        ) : null}
      </div>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {photos.map((photo) => (
          <PhotoCard
            key={photo.id}
            photo={photo}
            onOpen={() => setOpenPhoto(photo)}
            onSetCover={() => onSetCover?.(photo.id)}
            canSetCover={canSetCover}
          />
        ))}
      </div>
      {openPhoto ? <ImageViewer photo={openPhoto} onClose={() => setOpenPhoto(null)} /> : null}
    </section>
  );
}
