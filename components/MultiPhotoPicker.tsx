"use client";

import { Camera, ImageIcon, X } from "lucide-react";
import { useRef, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { normalizeImageBlob, readJpegExifOrientation } from "@/lib/client-image-normalization";
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

function logPhotoStage(stage: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.info("photo_orientation_stage", {
    stage,
    ...payload
  });
}

function createPhotoDebugId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `photo-debug-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
    let rejectedCount = selectedFiles.length - validFiles.length;

    try {
      const savedPhotoResults: (PendingPhotoUpload | null)[] = await Promise.all(
        validFiles.map(async (file, index) => {
          const debugId = createPhotoDebugId();
          const [originalDecode, originalExifOrientation] = await Promise.all([inspectImageFile(file), readJpegExifOrientation(file)]);
          logPhotoStage("photos_picker_selected", {
            debugId,
            source,
            fileName: file.name,
            mimeType: file.type,
            byteSize: file.size,
            width: originalDecode.width,
            height: originalDecode.height,
            exifOrientation: originalExifOrientation,
            physicallyRotated: false,
            displayedInUi: originalDecode.succeeded ? `${originalDecode.width}x${originalDecode.height}` : "decode_failed"
          });

          let normalized: Awaited<ReturnType<typeof normalizeImageBlob>>;
          try {
            normalized = await normalizeImageBlob(file, { maxSide: 1600, qualities: [0.82, 0.78, 0.75, 0.7, 0.66, 0.62], targetBytes: 500 * 1024 });
          } catch (error) {
            rejectedCount += 1;
            logPhotoStage("jpeg_normalization_failed", {
              debugId,
              source,
              fileName: file.name,
              message: error instanceof Error ? error.message : "image_preparation_failed"
            });
            return null;
          }

          const fileToStore = new File([normalized.blob], `${file.name.replace(/\.[^.]+$/, "") || "plant-photo"}.jpg`, { type: "image/jpeg" });
          const [storedDecodeBeforeSave, storedExifOrientation] = await Promise.all([inspectImageFile(fileToStore), readJpegExifOrientation(fileToStore)]);
          logPhotoStage("jpeg_saved_for_storage", {
            debugId,
            source,
            fileName: fileToStore.name,
            mimeType: fileToStore.type,
            byteSize: fileToStore.size,
            width: storedDecodeBeforeSave.width,
            height: storedDecodeBeforeSave.height,
            originalExifOrientation,
            exifOrientation: storedExifOrientation,
            orientationSource: normalized.orientationSource,
            physicallyRotated: storedExifOrientation == null || storedExifOrientation === 1,
            displayedInUi: storedDecodeBeforeSave.succeeded ? `${storedDecodeBeforeSave.width}x${storedDecodeBeforeSave.height}` : "decode_failed"
          });

          const storedPhoto = await PhotoStorageRepository.savePhoto(fileToStore);
          const decode = storedDecodeBeforeSave;
          logPhotoStage("indexeddb_saved_photo", {
            debugId,
            source,
            storageId: storedPhoto.id,
            mimeType: fileToStore.type,
            byteSize: fileToStore.size,
            width: decode.width,
            height: decode.height,
            originalExifOrientation,
            exifOrientation: storedExifOrientation,
            physicallyRotated: storedExifOrientation == null || storedExifOrientation === 1,
            displayedInUi: decode.succeeded ? `${decode.width}x${decode.height}` : "decode_failed"
          });

          return {
            id: storedPhoto.id,
            debugId,
            storageId: storedPhoto.id,
            source,
            originalName: file.name,
            originalType: file.type,
            originalSize: file.size,
            originalExtension: getFileExtension(file.name),
            decode,
            orientation: {
              exifOrientation: storedExifOrientation,
              orientationSource: normalized.orientationSource,
              physicallyRotated: storedExifOrientation == null || storedExifOrientation === 1,
              storedWidth: decode.width,
              storedHeight: decode.height,
              displayedWidth: decode.width,
              displayedHeight: decode.height
            },
            url: `photo://${storedPhoto.id}`,
            type: index === 0 ? "overview" : "other",
            isCover: false
          } satisfies PendingPhotoUpload;
        })
      );
      const savedPhotos = savedPhotoResults.filter((photo): photo is PendingPhotoUpload => photo !== null);

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
