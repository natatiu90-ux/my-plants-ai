"use client";

import { Camera, ImageIcon, X } from "lucide-react";
import { useRef, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { normalizeImageBlob } from "@/lib/client-image-normalization";
import { PhotoStorageRepository, validateImageFile } from "@/lib/photo-storage";
import type { PendingPhotoUpload } from "./photo-upload-types";

function getFileExtension(fileName: string) {
  return fileName.includes(".") ? fileName.split(".").pop()?.toLocaleLowerCase() ?? null : null;
}

async function inspectImageFile(file: File): Promise<PendingPhotoUpload["decode"]> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = new Image();
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("decode_failed"));
      image.src = objectUrl;
    });

    return {
      succeeded: true,
      width: dimensions.width,
      height: dimensions.height
    };
  } catch {
    return {
      succeeded: false,
      width: null,
      height: null
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function MultiPhotoPicker({
  title,
  onCancel,
  onSelect
}: {
  title: string;
  onCancel: () => void;
  onSelect: (photos: PendingPhotoUpload[], rejectedCount: number) => void;
}) {
  const { t } = useI18n();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleFiles = async (files: FileList | null | undefined, source: PendingPhotoUpload["source"]) => {
    setError(null);

    const selectedFiles = Array.from(files ?? []);
    if (!selectedFiles.length) {
      return;
    }

    setIsSaving(true);
    const validFiles = selectedFiles.filter(validateImageFile);
    const rejectedCount = selectedFiles.length - validFiles.length;

    try {
      const savedPhotos = await Promise.all(
        validFiles.map(async (file, index) => {
          let fileToStore: File = file;
          try {
            const normalized = await normalizeImageBlob(file, { maxSide: 2400, qualities: [0.9, 0.86] });
            fileToStore = new File([normalized.blob], `${file.name.replace(/\.[^.]+$/, "") || "plant-photo"}.jpg`, { type: "image/jpeg" });
          } catch {
            fileToStore = file;
          }
          const storedPhoto = await PhotoStorageRepository.savePhoto(fileToStore);
          const decode = await inspectImageFile(fileToStore);
          return {
            id: storedPhoto.id,
            storageId: storedPhoto.id,
            source,
            originalName: file.name,
            originalType: file.type,
            originalSize: file.size,
            originalExtension: getFileExtension(file.name),
            decode,
            url: `photo://${storedPhoto.id}`,
            type: index === 0 ? "overview" : "other",
            isCover: false
          } satisfies PendingPhotoUpload;
        })
      );

      if (!savedPhotos.length) {
        setError(t("photos.fileError"));
        return;
      }

      onSelect(savedPhotos, rejectedCount);
    } finally {
      setIsSaving(false);
      if (cameraInputRef.current) {
        cameraInputRef.current.value = "";
      }
      if (galleryInputRef.current) {
        galleryInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#1c1c1e]/20 px-4 pb-4 backdrop-blur-[2px] sm:items-center sm:pb-0">
      <div role="dialog" aria-modal="true" className="w-full max-w-[390px] rounded-[28px] bg-[#fffaf3] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.16)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-rounded text-2xl font-extrabold text-ink">{title}</h2>
          <button type="button" onClick={onCancel} aria-label={t("settings.close")} className="flex size-11 items-center justify-center rounded-2xl bg-white text-[#7d776b]">
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <div className="grid gap-2">
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => handleFiles(event.target.files, "camera")}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => handleFiles(event.target.files, "gallery")}
          />
          <button
            type="button"
            disabled={isSaving}
            onClick={() => cameraInputRef.current?.click()}
            className="flex min-h-14 items-center gap-3 rounded-[20px] bg-white/75 px-4 text-left font-extrabold text-[#4f4940] disabled:opacity-60"
          >
            <Camera aria-hidden="true" size={19} />
            {t("addPlant.takePhoto")}
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => galleryInputRef.current?.click()}
            className="flex min-h-14 items-center gap-3 rounded-[20px] bg-white/75 px-4 text-left font-extrabold text-[#4f4940] disabled:opacity-60"
          >
            <ImageIcon aria-hidden="true" size={19} />
            {t("addPlant.chooseGallery")}
          </button>
          {error ? <p className="whitespace-pre-line rounded-[18px] bg-[#fdeaf0] p-3 text-sm font-bold leading-5 text-[#9b2c3e]">{error}</p> : null}
          <button type="button" onClick={onCancel} className="min-h-12 rounded-[18px] px-4 text-sm font-extrabold text-[#777167]">
            {t("plantDetail.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
