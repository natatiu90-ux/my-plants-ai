"use client";

import { Camera, ImageIcon, X } from "lucide-react";
import type { ChangeEvent } from "react";
import { useRef, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { normalizeImageBlob, readJpegExifOrientation } from "@/lib/client-image-normalization";
import { PhotoStorageRepository, validateImageFile } from "@/lib/photo-storage";
import type { PendingPhotoUpload } from "./photo-upload-types";

export type PhotoPickerDiagnostic = {
  eventFired: boolean;
  source: PendingPhotoUpload["source"] | null;
  filesReceived: number;
  accepted: number;
  rejected: number;
  selectedPhotosBefore: number;
  selectedPhotosAfter?: number;
  wizardStepBefore?: string;
  wizardStepAfter?: string;
  indexedDbResult?: string;
  failureStage?: string;
  failureMessage?: string;
  files: {
    name: string;
    mimeType: string;
    size: number;
    status: "received" | "invalid" | "normalizing" | "normalized" | "stored" | "failed";
    storageId?: string;
    failureStage?: string;
    failureMessage?: string;
  }[];
};

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
  onSelect,
  debugEnabled = false,
  selectedPhotosCount = 0,
  wizardStep,
  onDiagnostic
}: {
  title: string;
  onCancel: () => void;
  onSelect: (photos: PendingPhotoUpload[], rejectedCount: number) => void;
  debugEnabled?: boolean;
  selectedPhotosCount?: number;
  wizardStep?: string;
  onDiagnostic?: (diagnostic: PhotoPickerDiagnostic) => void;
}) {
  const { t } = useI18n();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [diagnostic, setDiagnostic] = useState<PhotoPickerDiagnostic | null>(null);

  const publishDiagnostic = (nextDiagnostic: PhotoPickerDiagnostic) => {
    setDiagnostic(nextDiagnostic);
    onDiagnostic?.(nextDiagnostic);
    console.info("photo_picker_diagnostic", nextDiagnostic);
  };

  const copyDiagnostic = () => {
    if (!diagnostic) {
      return;
    }

    void navigator.clipboard?.writeText(JSON.stringify(diagnostic, null, 2));
  };

  const handleFiles = async (selectedFiles: File[], source: PendingPhotoUpload["source"]) => {
    setError(null);

    const baseDiagnostic: PhotoPickerDiagnostic = {
      eventFired: true,
      source,
      filesReceived: selectedFiles.length,
      accepted: 0,
      rejected: 0,
      selectedPhotosBefore: selectedPhotosCount,
      wizardStepBefore: wizardStep,
      indexedDbResult: "not_started",
      files: selectedFiles.map((file) => ({
        name: file.name,
        mimeType: file.type,
        size: file.size,
        status: "received"
      }))
    };
    publishDiagnostic(baseDiagnostic);

    if (!selectedFiles.length) {
      publishDiagnostic({
        ...baseDiagnostic,
        failureStage: "file_input_change",
        failureMessage: "File input change fired with zero files."
      });
      return;
    }

    setIsSaving(true);
    const validFiles = selectedFiles.filter(validateImageFile);
    let rejectedCount = selectedFiles.length - validFiles.length;
    let currentDiagnostic: PhotoPickerDiagnostic = {
      ...baseDiagnostic,
      rejected: rejectedCount,
      files: baseDiagnostic.files.map((fileDiagnostic, index) => (validateImageFile(selectedFiles[index]) ? fileDiagnostic : { ...fileDiagnostic, status: "invalid" }))
    };
    publishDiagnostic(currentDiagnostic);

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
            currentDiagnostic = {
              ...currentDiagnostic,
              files: currentDiagnostic.files.map((item) => (item.name === file.name && item.size === file.size ? { ...item, status: "normalizing" } : item))
            };
            publishDiagnostic(currentDiagnostic);
            normalized = await normalizeImageBlob(file, { maxSide: 1600, qualities: [0.82, 0.78, 0.75, 0.7, 0.66, 0.62], targetBytes: 500 * 1024 });
            currentDiagnostic = {
              ...currentDiagnostic,
              files: currentDiagnostic.files.map((item) => (item.name === file.name && item.size === file.size ? { ...item, status: "normalized" } : item))
            };
            publishDiagnostic(currentDiagnostic);
          } catch (error) {
            rejectedCount += 1;
            const message = error instanceof Error ? error.message : "image_preparation_failed";
            currentDiagnostic = {
              ...currentDiagnostic,
              rejected: rejectedCount,
              failureStage: "normalization",
              failureMessage: message,
              files: currentDiagnostic.files.map((item) =>
                item.name === file.name && item.size === file.size ? { ...item, status: "failed", failureStage: "normalization", failureMessage: message } : item
              )
            };
            publishDiagnostic(currentDiagnostic);
            logPhotoStage("jpeg_normalization_failed", {
              debugId,
              source,
              fileName: file.name,
              message
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

          let storedPhoto: Awaited<ReturnType<typeof PhotoStorageRepository.savePhoto>>;
          try {
            storedPhoto = await PhotoStorageRepository.savePhoto(fileToStore);
          } catch (error) {
            rejectedCount += 1;
            const message = error instanceof Error ? error.message : "indexeddb_write_failed";
            currentDiagnostic = {
              ...currentDiagnostic,
              rejected: rejectedCount,
              indexedDbResult: "failed",
              failureStage: "indexeddb_write",
              failureMessage: message,
              files: currentDiagnostic.files.map((item) =>
                item.name === file.name && item.size === file.size ? { ...item, status: "failed", failureStage: "indexeddb_write", failureMessage: message } : item
              )
            };
            publishDiagnostic(currentDiagnostic);
            return null;
          }
          const decode = storedDecodeBeforeSave;
          currentDiagnostic = {
            ...currentDiagnostic,
            indexedDbResult: "success",
            files: currentDiagnostic.files.map((item) =>
              item.name === file.name && item.size === file.size ? { ...item, status: "stored", storageId: storedPhoto.id } : item
            )
          };
          publishDiagnostic(currentDiagnostic);
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
      publishDiagnostic({
        ...currentDiagnostic,
        accepted: savedPhotos.length,
        rejected: rejectedCount,
        selectedPhotosAfter: selectedPhotosCount + savedPhotos.length,
        wizardStepAfter: savedPhotos.length ? "review" : wizardStep,
        failureStage: savedPhotos.length ? currentDiagnostic.failureStage : currentDiagnostic.failureStage ?? "all_files_failed",
        failureMessage: savedPhotos.length ? currentDiagnostic.failureMessage : currentDiagnostic.failureMessage ?? "No selected photos could be prepared."
      });

      if (!savedPhotos.length) {
        setError(currentDiagnostic.failureMessage ? `${t("photos.fileError")}\n${currentDiagnostic.failureMessage}` : t("photos.fileError"));
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

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>, source: PendingPhotoUpload["source"]) => {
    const files = Array.from(event.currentTarget.files ?? []);
    publishDiagnostic({
      eventFired: true,
      source,
      filesReceived: files.length,
      accepted: 0,
      rejected: 0,
      selectedPhotosBefore: selectedPhotosCount,
      wizardStepBefore: wizardStep,
      indexedDbResult: "not_started",
      files: files.map((file) => ({
        name: file.name,
        mimeType: file.type,
        size: file.size,
        status: "received"
      }))
    });
    event.currentTarget.value = "";
    void handleFiles(files, source);
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
            onChange={(event) => handleInputChange(event, "camera")}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => handleInputChange(event, "gallery")}
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
          {debugEnabled ? (
            <div className="rounded-[18px] bg-[#1f2937] p-3 text-left text-[11px] font-bold leading-5 text-white">
              <p className="font-black">PHOTO PICKER DEBUG ON</p>
              <p>event fired: {diagnostic ? "yes" : "no"}</p>
              <p>source: {diagnostic?.source ?? "none"}</p>
              <p>files received: {diagnostic?.filesReceived ?? 0}</p>
              <p>accepted: {diagnostic?.accepted ?? 0}</p>
              <p>rejected: {diagnostic?.rejected ?? 0}</p>
              <p>failure stage: {diagnostic?.failureStage ?? "none"}</p>
              <p>message: {diagnostic?.failureMessage ?? "none"}</p>
              <p>selectedPhotos before: {diagnostic?.selectedPhotosBefore ?? selectedPhotosCount}</p>
              <p>selectedPhotos after: {diagnostic?.selectedPhotosAfter ?? "unknown"}</p>
              <p>IndexedDB: {diagnostic?.indexedDbResult ?? "not_started"}</p>
              <button type="button" onClick={copyDiagnostic} className="mt-2 min-h-9 rounded-[12px] bg-white px-3 text-xs font-black text-[#1f2937]">
                Copy diagnostic
              </button>
            </div>
          ) : null}
          <button type="button" onClick={onCancel} className="min-h-12 rounded-[18px] px-4 text-sm font-extrabold text-[#777167]">
            {t("plantDetail.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
