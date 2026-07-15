"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { usePlantStore } from "@/data/PlantStore";
import { appBuildStorageKey, appBuildVersion, isStandalonePwa } from "@/lib/app-version";
import { inspectImageDisplay, readJpegExifOrientation } from "@/lib/client-image-normalization";
import { addDays, formatRelativeDate, formatShortDate, toDateKey } from "@/lib/date-format";
import { cleanPlantName, cleanScientificName, commonNameFromScientificName } from "@/lib/plant-display";
import { plantCreationDiagnosticFromError, type PlantCreationDiagnostic, type PlantCreationStage } from "@/lib/plant-save-diagnostics";
import { PhotoStorageRepository } from "@/lib/photo-storage";
import { MultiPhotoPicker, PhotoPickerDebugPanel, type PhotoPickerDiagnostic } from "./MultiPhotoPicker";
import { PhotoBatchReview } from "./PhotoBatchReview";
import { PhotoImage } from "./PhotoImage";
import { RoomPicker } from "./RoomPicker";
import type { PendingPhotoUpload } from "./photo-upload-types";

type Step = "pick" | "pick_more" | "review" | "analysis" | "confirm" | "details";
type ConfirmationPicker = "room" | "watering" | null;
type AnalysisFailureKind = "technical" | null;
type PlantAnalysis = {
  commonName?: { en?: string | null; ru?: string | null } | string | null;
  detectedSpecies: string | null;
  scientificName: string | null;
  confidence: number;
  condition: "healthy" | "check_soon" | "needs_attention" | "unknown";
  nextAction: "water" | "check_soil" | "take_photo" | "none";
  nextCheckInDays: number | null;
  summary: { en: string; ru: string };
  uncertainties?: { en: string; ru: string }[];
  recommendations: unknown;
  model?: string | null;
  rawResult?: unknown;
};
type ImageAnalysisDiagnostic = {
  debugId?: string | null;
  source: "camera" | "gallery";
  fileName: string;
  detectedFormat: string;
  decodedWidth?: number | null;
  decodedHeight?: number | null;
  exifOrientation?: number | null;
  normalizedWidth?: number | null;
  normalizedHeight?: number | null;
  conversionStatus: string;
  finalMimeType: string | null;
  finalByteSize: number | null;
  includedInOpenAIRequest: boolean;
  client?: {
    width?: number | null;
    height?: number | null;
    exifOrientation?: number | null;
    physicallyRotated?: boolean | null;
    orientationSource?: string | null;
  };
  errorCode?: string;
  errorMessage?: string;
};
type ClientImagePreparationDiagnostic = {
  debugId?: string;
  source: "camera" | "gallery";
  fileName: string;
  originalMimeType: string;
  originalSize: number;
  exifOrientation: number | null;
  compressedSize: number | null;
  originalWidth: number | null;
  originalHeight: number | null;
  finalWidth: number | null;
  finalHeight: number | null;
  orientationSource?: "raw_pixels" | "browser_display" | "unknown";
  physicallyRotated?: boolean;
  displayedWidth?: number | null;
  displayedHeight?: number | null;
  totalOutgoingRequestSize: number | null;
  includedInRequest: boolean;
  requestDurationMs?: number | null;
  httpStatus?: number | null;
  errorCode?: string;
  errorName?: string;
  errorMessage?: string;
};

const analysisStageCount = 4;
const analysisImageTargetBytes = 500 * 1024;
const analysisRequestTargetBytes = 3 * 1024 * 1024;
const maxSelectedPhotos = 5;
const plantSaveDebugStorageKey = "my_plants_debug_plant_save";
const photoPickerDebugStorageKey = "my_plants_debug_photo_picker";
const defaultNicknames = {
  en: ["Sprout", "Pebble", "Mochi", "Button", "Pickle", "Clover", "Poppy", "Bean", "Sunny", "Olive", "Noodle", "Dot", "Minty", "Pumpkin", "Biscuit", "Twiggy"],
  ru: ["Плюша", "Листик", "Кнопка", "Пышка", "Ростик", "Зелёныш", "Фисташка", "Плющинка", "Бублик", "Капля", "Мята", "Печенька", "Пуговка", "Тучка", "Крошка", "Лапка"]
};

function localizedCommonName(analysis: PlantAnalysis, locale: "en" | "ru") {
  if (typeof analysis.commonName === "string") {
    return cleanPlantName(analysis.commonName);
  }

  return (
    cleanPlantName(analysis.commonName?.[locale]) ||
    cleanPlantName(analysis.commonName?.en) ||
    cleanPlantName(analysis.commonName?.ru) ||
    cleanPlantName(analysis.detectedSpecies) ||
    commonNameFromScientificName(analysis.scientificName)
  );
}

function suggestedNickname(locale: "en" | "ru", existingNames: string[]) {
  const names = defaultNicknames[locale];
  const normalizedExisting = new Set(existingNames.map((name) => name.trim().toLocaleLowerCase()).filter(Boolean));
  const startIndex = Math.floor(Math.random() * names.length);

  for (let offset = 0; offset < names.length; offset += 1) {
    const name = names[(startIndex + offset) % names.length];
    if (!normalizedExisting.has(name.toLocaleLowerCase())) {
      return name;
    }
  }

  return names[Math.floor(Math.random() * names.length)];
}

function logAddPlantDebug(message: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "production") {
    console.info(message, payload);
  }
}

async function prepareImageForAnalysis(blob: Blob, fileName: string) {
  const [display, exifOrientation] = await Promise.all([inspectImageDisplay(blob), readJpegExifOrientation(blob)]);
  if (!display.succeeded || !display.width || !display.height) {
    throw new Error("image_preparation_failed");
  }

  const safeName = `${fileName.replace(/\.[^.]+$/, "") || "plant-photo"}-analysis.jpg`;
  return {
    file: new File([blob], safeName, { type: "image/jpeg" }),
    originalWidth: display.width,
    originalHeight: display.height,
    finalWidth: display.width,
    finalHeight: display.height,
    exifOrientation,
    orientationSource: "browser_display" as const,
    physicallyRotated: exifOrientation == null || exifOrientation === 1
  };
}

export function AddPlantWizard({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale, t } = useI18n();
  const { addPlant, plants, rooms, status, userId } = usePlantStore();
  const [isPlantSaveDebugEnabled, setIsPlantSaveDebugEnabled] = useState(false);
  const [isPhotoPickerDebugEnabled, setIsPhotoPickerDebugEnabled] = useState(false);
  const [photoPickerDiagnostic, setPhotoPickerDiagnostic] = useState<PhotoPickerDiagnostic | null>(null);
  const [step, setStep] = useState<Step>("pick");
  const [selectedPhotos, setSelectedPhotos] = useState<PendingPhotoUpload[]>([]);
  const [rejectedPhotoCount, setRejectedPhotoCount] = useState(0);
  const [homeName, setHomeName] = useState("");
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [isConfirmingNicknameRegeneration, setIsConfirmingNicknameRegeneration] = useState(false);
  const [speciesName, setSpeciesName] = useState("");
  const [scientificName, setScientificName] = useState("");
  const [roomKey, setRoomKey] = useState<string | undefined>();
  const [lastWateredAt, setLastWateredAt] = useState<string | undefined>();
  const [activePicker, setActivePicker] = useState<ConfirmationPicker>(null);
  const [isChoosingWaterDate, setIsChoosingWaterDate] = useState(false);
  const [customWaterDate, setCustomWaterDate] = useState(toDateKey(new Date()));
  const [analysis, setAnalysis] = useState<PlantAnalysis | null>(null);
  const [analysisFailed, setAnalysisFailed] = useState(false);
  const [analysisFailureKind, setAnalysisFailureKind] = useState<AnalysisFailureKind>(null);
  const [analysisDiagnostics, setAnalysisDiagnostics] = useState<ImageAnalysisDiagnostic[]>([]);
  const [clientPreparationDiagnostics, setClientPreparationDiagnostics] = useState<ClientImagePreparationDiagnostic[]>([]);
  const [analysisErrorCode, setAnalysisErrorCode] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saveDiagnostic, setSaveDiagnostic] = useState<PlantCreationDiagnostic | null>(null);
  const [analysisStageIndex, setAnalysisStageIndex] = useState(0);
  const [showLongAnalysisHint, setShowLongAnalysisHint] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [analysisAttempt, setAnalysisAttempt] = useState(0);
  const nicknameInputRef = useRef<HTMLInputElement>(null);
  const generatedNicknameRef = useRef<string | null>(null);

  useEffect(() => {
    const debugParam = searchParams.get("debugPlantSave");
    if (debugParam === "1") {
      window.localStorage.setItem(plantSaveDebugStorageKey, "1");
      setIsPlantSaveDebugEnabled(true);
      return;
    }

    if (debugParam === "0") {
      window.localStorage.removeItem(plantSaveDebugStorageKey);
      setIsPlantSaveDebugEnabled(false);
      return;
    }

    setIsPlantSaveDebugEnabled(window.localStorage.getItem(plantSaveDebugStorageKey) === "1");
  }, [searchParams]);

  useEffect(() => {
    const debugParam = searchParams.get("debugPhotoPicker");
    if (debugParam === "1") {
      window.localStorage.setItem(photoPickerDebugStorageKey, "1");
      setIsPhotoPickerDebugEnabled(true);
      return;
    }

    if (debugParam === "0") {
      window.localStorage.removeItem(photoPickerDebugStorageKey);
      setIsPhotoPickerDebugEnabled(false);
      return;
    }

    setIsPhotoPickerDebugEnabled(window.localStorage.getItem(photoPickerDebugStorageKey) === "1");
  }, [searchParams]);

  const generateNicknameOnce = useCallback((extraExistingNames: string[] = []) => {
    const existingNames = [...plants.map((plant) => plant.homeName ?? ""), ...extraExistingNames];
    const nickname = suggestedNickname(locale, existingNames);
    generatedNicknameRef.current = nickname;
    return nickname;
  }, [locale, plants]);

  const ensureSuggestedNickname = useCallback(() => generatedNicknameRef.current ?? generateNicknameOnce(), [generateNicknameOnce]);

  const cleanupTemporaryPhotos = useCallback(async (photos: PendingPhotoUpload[]) => {
    await Promise.allSettled(photos.map((photo) => PhotoStorageRepository.deletePhoto(photo.storageId)));
  }, []);

  const cancelAddPlant = useCallback(() => {
    if (selectedPhotos.length) {
      const shouldDiscard = window.confirm(t("addPlant.discardPhotosConfirm"));
      if (!shouldDiscard) {
        return;
      }
    }

    void cleanupTemporaryPhotos(selectedPhotos);
    setSelectedPhotos([]);
    onClose();
  }, [cleanupTemporaryPhotos, onClose, selectedPhotos, t]);

  const photoDuplicateKey = (photo: PendingPhotoUpload) => `${photo.originalName.trim().toLocaleLowerCase()}::${photo.originalType}::${photo.originalSize}`;

  const appendSelectedPhotos = useCallback(
    (photos: PendingPhotoUpload[], rejectedFiles: number) => {
      setSelectedPhotos((current) => {
        const selectedPhotosBefore = current.length;
        const existingKeys = new Set(current.map(photoDuplicateKey));
        const nextPhotos = [...current];
        let rejectedNext = rejectedFiles;

        for (const photo of photos) {
          const duplicate = existingKeys.has(photoDuplicateKey(photo));
          const overLimit = nextPhotos.length >= maxSelectedPhotos;
          if (duplicate || overLimit) {
            rejectedNext += 1;
            void PhotoStorageRepository.deletePhoto(photo.storageId);
            continue;
          }

          existingKeys.add(photoDuplicateKey(photo));
          nextPhotos.push({
            ...photo,
            isCover: current.some((item) => item.isCover) || nextPhotos.some((item) => item.isCover) ? photo.isCover : nextPhotos.length === 0
          });
        }

        setRejectedPhotoCount(rejectedNext);
        const finalize = (finalPhotos: PendingPhotoUpload[]) => {
          setPhotoPickerDiagnostic((currentDiagnostic) => {
            if (!currentDiagnostic) {
              return currentDiagnostic;
            }

            const nextDiagnostic = {
              ...currentDiagnostic,
              accepted: Math.max(0, finalPhotos.length - selectedPhotosBefore),
              rejected: rejectedNext,
              selectedPhotosBefore,
              selectedPhotosAfter: finalPhotos.length,
              wizardStepAfter: finalPhotos.length ? "review" : currentDiagnostic.wizardStepBefore
            };
            console.info("photo_picker_diagnostic", nextDiagnostic);
            return nextDiagnostic;
          });
          return finalPhotos;
        };

        if (nextPhotos.length && !nextPhotos.some((photo) => photo.isCover)) {
          const preferredCover = nextPhotos.find((photo) => photo.type === "overview") ?? nextPhotos[0];
          return finalize(nextPhotos.map((photo) => ({ ...photo, isCover: photo.id === preferredCover.id })));
        }

        return finalize(nextPhotos);
      });
      setStep("review");
    },
    []
  );

  const updateSelectedPhotos = useCallback((photos: PendingPhotoUpload[]) => {
    setSelectedPhotos(photos);
  }, []);

  const discardSelectedPhoto = useCallback((photo: PendingPhotoUpload) => {
    void PhotoStorageRepository.deletePhoto(photo.storageId);
  }, []);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    if (!isEditingNickname) {
      return;
    }

    window.setTimeout(() => {
      nicknameInputRef.current?.focus();
      nicknameInputRef.current?.select();
    }, 0);
  }, [isEditingNickname]);

  useEffect(() => {
    if (step !== "analysis") {
      return;
    }

    let isMounted = true;
    setAnalysisStageIndex(0);
    setShowLongAnalysisHint(false);
    setAnalysisErrorCode(null);
    setAnalysisFailed(false);
    setAnalysisFailureKind(null);
    setAnalysis(null);
    setClientPreparationDiagnostics([]);
    setAnalysisDiagnostics([]);
    const stageTimers = [
      window.setTimeout(() => {
        if (isMounted) setAnalysisStageIndex(1);
      }, 1200),
      window.setTimeout(() => {
        if (isMounted) setAnalysisStageIndex(2);
      }, 4500),
      window.setTimeout(() => {
        if (isMounted) setAnalysisStageIndex(3);
      }, 9000)
    ];
    const longAnalysisTimer = window.setTimeout(() => {
      if (isMounted) setShowLongAnalysisHint(true);
    }, 15000);

    async function finishAnalysisSheet() {
      if (!isMounted) {
        return;
      }

      setAnalysisStageIndex(analysisStageCount);
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      if (isMounted) {
        setStep("confirm");
      }
    }

    async function analyzePhotos() {
      let requestStartedAt: number | null = null;
      let httpStatus: number | null = null;
      try {
        const formData = new FormData();
        const nextPreparationDiagnostics: ClientImagePreparationDiagnostic[] = [];
        let totalOutgoingRequestSize = 0;

        for (const photo of selectedPhotos.slice(0, 5)) {
          const blob = await PhotoStorageRepository.getPhoto(photo.storageId);
          if (blob) {
            const fileName = photo.originalName || `${photo.id}.${photo.originalExtension ?? "jpg"}`;
            const diagnostic: ClientImagePreparationDiagnostic = {
              source: photo.source,
              debugId: photo.debugId,
              fileName,
              originalMimeType: blob.type,
              originalSize: blob.size,
              exifOrientation: photo.orientation.exifOrientation,
              compressedSize: null,
              originalWidth: photo.orientation.storedWidth,
              originalHeight: photo.orientation.storedHeight,
              finalWidth: null,
              finalHeight: null,
              orientationSource: photo.orientation.orientationSource,
              physicallyRotated: photo.orientation.physicallyRotated,
              displayedWidth: photo.orientation.displayedWidth,
              displayedHeight: photo.orientation.displayedHeight,
              totalOutgoingRequestSize: null,
              includedInRequest: false
            };
            nextPreparationDiagnostics.push(diagnostic);
            logAddPlantDebug("photo_orientation_stage", {
              stage: "analysis_indexeddb_read",
              debugId: photo.debugId,
              source: photo.source,
              fileName,
              mimeType: blob.type,
              byteSize: blob.size,
              width: photo.orientation.storedWidth,
              height: photo.orientation.storedHeight,
              exifOrientation: photo.orientation.exifOrientation,
              physicallyRotated: photo.orientation.physicallyRotated,
              displayedInUi: `${photo.orientation.displayedWidth ?? "unknown"}x${photo.orientation.displayedHeight ?? "unknown"}`
            });

            let preparedImage: Awaited<ReturnType<typeof prepareImageForAnalysis>>;
            try {
              preparedImage = await prepareImageForAnalysis(blob, fileName);
            } catch {
              diagnostic.errorCode = "image_preparation_failed";
              diagnostic.errorName = "Error";
              diagnostic.errorMessage = "image_preparation_failed";
              setClientPreparationDiagnostics(nextPreparationDiagnostics);
              throw new Error("image_preparation_failed");
            }

            totalOutgoingRequestSize += preparedImage.file.size;
            if (preparedImage.file.size > analysisImageTargetBytes || totalOutgoingRequestSize > analysisRequestTargetBytes) {
              diagnostic.compressedSize = preparedImage.file.size;
              diagnostic.originalWidth = preparedImage.originalWidth;
              diagnostic.originalHeight = preparedImage.originalHeight;
              diagnostic.finalWidth = preparedImage.finalWidth;
              diagnostic.finalHeight = preparedImage.finalHeight;
              diagnostic.exifOrientation = preparedImage.exifOrientation;
              diagnostic.totalOutgoingRequestSize = totalOutgoingRequestSize;
              diagnostic.errorCode = "image_preparation_failed";
              diagnostic.errorName = "Error";
              diagnostic.errorMessage = "image_preparation_failed";
              setClientPreparationDiagnostics(nextPreparationDiagnostics);
              throw new Error("image_preparation_failed");
            }

            diagnostic.compressedSize = preparedImage.file.size;
            diagnostic.originalWidth = preparedImage.originalWidth;
            diagnostic.originalHeight = preparedImage.originalHeight;
            diagnostic.finalWidth = preparedImage.finalWidth;
            diagnostic.finalHeight = preparedImage.finalHeight;
            diagnostic.exifOrientation = preparedImage.exifOrientation;
            diagnostic.orientationSource = preparedImage.orientationSource;
            diagnostic.physicallyRotated = preparedImage.physicallyRotated;
            diagnostic.includedInRequest = true;
            logAddPlantDebug("photo_orientation_stage", {
              stage: "formdata_openai_upload",
              debugId: photo.debugId,
              source: photo.source,
              fileName: preparedImage.file.name,
              mimeType: preparedImage.file.type,
              byteSize: preparedImage.file.size,
              width: preparedImage.finalWidth,
              height: preparedImage.finalHeight,
              exifOrientation: preparedImage.exifOrientation,
              orientationSource: preparedImage.orientationSource,
              physicallyRotated: preparedImage.physicallyRotated,
              displayedInUi: `${preparedImage.finalWidth}x${preparedImage.finalHeight}`
            });
            formData.append("photos", preparedImage.file, preparedImage.file.name);
            formData.append("photoTypes", photo.type);
            formData.append("photoSources", photo.source);
            formData.append("clientFileNames", photo.originalName);
            formData.append("clientMimeTypes", preparedImage.file.type);
            formData.append("clientExtensions", "jpg");
            formData.append("clientByteSizes", String(preparedImage.file.size));
            formData.append("clientDecodeSucceeded", "true");
            formData.append("clientWidths", String(preparedImage.finalWidth));
            formData.append("clientHeights", String(preparedImage.finalHeight));
            formData.append("clientExifOrientations", String(preparedImage.exifOrientation ?? ""));
            formData.append("clientPhysicallyRotated", String(preparedImage.physicallyRotated));
            formData.append("clientOrientationSources", preparedImage.orientationSource);
            if (photo.debugId) {
              formData.append("clientDebugIds", photo.debugId);
            }
          }
        }
        nextPreparationDiagnostics.forEach((diagnostic) => {
          diagnostic.totalOutgoingRequestSize = totalOutgoingRequestSize;
        });
        setClientPreparationDiagnostics(nextPreparationDiagnostics);
        logAddPlantDebug("Plant analysis client images prepared", {
          totalOutgoingRequestSize,
          images: nextPreparationDiagnostics
        });

        formData.append("locale", locale);
        requestStartedAt = Date.now();
        const response = await fetch("/api/analyze-plant", {
          method: "POST",
          body: formData
        });
        httpStatus = response.status;
        const payload = await response.json();
        const requestDurationMs = Date.now() - requestStartedAt;
        nextPreparationDiagnostics.forEach((diagnostic) => {
          diagnostic.requestDurationMs = requestDurationMs;
          diagnostic.httpStatus = httpStatus;
        });
        setClientPreparationDiagnostics(nextPreparationDiagnostics);
        logAddPlantDebug("Plant analysis request completed", {
          status: httpStatus,
          durationMs: requestDurationMs,
          totalOutgoingRequestSize,
          images: nextPreparationDiagnostics
        });

        if (payload.diagnostics && process.env.NODE_ENV !== "production") {
          setAnalysisDiagnostics(payload.diagnostics);
        }

        if (!response.ok || !payload.ok) {
          throw new Error(typeof payload.error === "string" ? payload.error : "analysis_failed");
        }

        if (!isMounted) {
          return;
        }

        const nextAnalysis = {
          ...payload.analysis,
          model: payload.model,
          rawResult: payload.analysis
        } as PlantAnalysis;
        setAnalysis(nextAnalysis);
        const nextScientificName = cleanScientificName(nextAnalysis.scientificName);
        const nextSpeciesName = localizedCommonName(nextAnalysis, locale) || commonNameFromScientificName(nextScientificName);
        setSpeciesName(nextSpeciesName);
        setScientificName(nextScientificName);
        setHomeName((current) => current || ensureSuggestedNickname());
      } catch (error) {
        if (isMounted) {
          setAnalysisFailed(true);
          setAnalysisFailureKind("technical");
          setAnalysisErrorCode(error instanceof Error ? error.message : "analysis_failed");
          setClientPreparationDiagnostics((current) =>
            current.map((diagnostic) => ({
              ...diagnostic,
              requestDurationMs: requestStartedAt ? Date.now() - requestStartedAt : diagnostic.requestDurationMs ?? null,
              httpStatus,
              errorCode: diagnostic.errorCode ?? (error instanceof Error ? error.message : "analysis_failed"),
              errorName: error instanceof Error ? error.name : "UnknownError",
              errorMessage: error instanceof Error ? error.message : "analysis_failed"
            }))
          );
          console.warn("Plant analysis technical failure", {
            name: error instanceof Error ? error.name : "UnknownError",
            message: error instanceof Error ? error.message : "analysis_failed",
            status: httpStatus,
            durationMs: requestStartedAt ? Date.now() - requestStartedAt : null
          });
        }
      } finally {
        if (isMounted) {
          setHomeName((current) => current || ensureSuggestedNickname());
        }
        await finishAnalysisSheet();
      }
    }

    void analyzePhotos();

    return () => {
      isMounted = false;
      stageTimers.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(longAnalysisTimer);
    };
  }, [analysisAttempt, ensureSuggestedNickname, locale, selectedPhotos, step]);

  const copyPhotoPickerDiagnostic = () => {
    if (!photoPickerDiagnostic) {
      return;
    }

    void navigator.clipboard?.writeText(JSON.stringify(photoPickerDiagnostic, null, 2));
  };

  const photoPickerDebugPanel = isPhotoPickerDebugEnabled ? (
    <PhotoPickerDebugPanel diagnostic={photoPickerDiagnostic} selectedPhotosCount={selectedPhotos.length} onCopy={copyPhotoPickerDiagnostic} />
  ) : null;

  const analysisStages = [
    t("addPlant.uploadingPhotos"),
    t("addPlant.identifying"),
    t("addPlant.checking"),
    t("addPlant.preparing")
  ];

  if (step === "pick") {
    return (
      <MultiPhotoPicker
        title={t("addPlant.title")}
        onCancel={cancelAddPlant}
        onSelect={appendSelectedPhotos}
        debugEnabled={isPhotoPickerDebugEnabled}
        selectedPhotosCount={selectedPhotos.length}
        wizardStep={step}
        onDiagnostic={setPhotoPickerDiagnostic}
      />
    );
  }

  if (step === "pick_more") {
    return (
      <MultiPhotoPicker
        title={t("photos.addPhotos")}
        onCancel={() => setStep("review")}
        onSelect={appendSelectedPhotos}
        debugEnabled={isPhotoPickerDebugEnabled}
        selectedPhotosCount={selectedPhotos.length}
        wizardStep={step}
        onDiagnostic={setPhotoPickerDiagnostic}
      />
    );
  }

  if (step === "review") {
    return (
      <PhotoBatchReview
        initialPhotos={selectedPhotos}
        photos={selectedPhotos}
        hasExistingCover={false}
        rejectedCount={rejectedPhotoCount}
        maxPhotos={maxSelectedPhotos}
        primaryLabel={t("addPlant.analyzePhotos")}
        addMoreLabel={selectedPhotos.length ? t("addPlant.addMorePhotos") : t("photos.addPhotos")}
        emptyTitle={t("addPlant.noPhotosSelected")}
        emptyText={t("addPlant.noPhotosSelectedText")}
        limitReachedText={t("addPlant.photoLimitReached")}
        debugPanel={photoPickerDebugPanel}
        onPhotosChange={updateSelectedPhotos}
        onDiscardPhoto={discardSelectedPhoto}
        onAddMore={() => setStep("pick_more")}
        onCancel={cancelAddPlant}
        onSave={(photos) => {
          setSelectedPhotos(photos);
          setStep("analysis");
        }}
      />
    );
  }

  if (step === "analysis") {
    return (
      <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#1c1c1e]/20 px-4 pb-4 backdrop-blur-[2px] sm:items-center sm:pb-0">
        <div role="status" aria-live="polite" className="w-full max-w-[390px] rounded-[28px] bg-[#fffaf3] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.16)]">
          <h2 className="font-rounded text-2xl font-extrabold text-ink">{t("addPlant.analysisTitle")}</h2>
          <div className="mt-5 h-1 overflow-hidden rounded-full bg-[#e8ddce]" aria-hidden="true">
            <div className="analysis-progress-bar h-full w-1/2 rounded-full bg-[#7cab73]" />
          </div>
          <div className="mt-5 grid gap-3 text-[15px]">
            {analysisStages.map((stage, index) => {
              const isCompleted = index < analysisStageIndex;
              const isActive = index === analysisStageIndex && analysisStageIndex < analysisStages.length;
              return (
                <p
                  key={stage}
                  className={[
                    "flex items-center gap-3 font-bold leading-5 transition-colors",
                    isCompleted ? "text-[#4f7f48]" : isActive ? "text-ink" : "text-[#9b9387]"
                  ].join(" ")}
                >
                  <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
                    {isCompleted ? (
                      <span className="text-sm">✓</span>
                    ) : isActive ? (
                      <span className="analysis-spinner size-4 rounded-full border-2 border-[#d7cdbf] border-t-[#6b8f5f]" />
                    ) : (
                      <span className="size-1.5 rounded-full bg-[#c7bcae]" />
                    )}
                  </span>
                  <span className={isActive ? "font-extrabold" : undefined}>
                    {stage}
                    {isActive ? <span className="motion-safe:animate-pulse">...</span> : null}
                  </span>
                </p>
              );
            })}
          </div>
          {showLongAnalysisHint ? <p className="mt-5 text-sm font-bold leading-5 text-[#7a6f61]">{t("addPlant.analysisLong")}</p> : null}
        </div>
      </div>
    );
  }

  const coverPhoto = selectedPhotos.find((photo) => photo.isCover) ?? selectedPhotos[0];
  const selectedRoomName = roomKey
    ? roomKey.startsWith("rooms.")
      ? t(roomKey as never)
      : rooms.find((room) => room.id === roomKey)?.name ?? t("addPlant.noRoomSelected")
    : t("addPlant.noRoomSelected");
  const lastWateredValue = lastWateredAt
    ? `${formatRelativeDate(lastWateredAt, locale, t("addPlant.lastWateringEmpty"))} · ${formatShortDate(lastWateredAt, locale)}`
    : t("addPlant.lastWateringEmpty");
  const displayCommonName = cleanPlantName(speciesName) || commonNameFromScientificName(scientificName) || t("plants.unknownName");
  const displayScientificName = cleanScientificName(scientificName);
  const todayDateKey = toDateKey(new Date());
  const conditionSummary =
    analysis?.condition === "needs_attention"
      ? {
          title: t("addPlant.conditionHighTitle"),
          text: t("addPlant.conditionHighText")
        }
      : analysis?.condition === "check_soon"
        ? {
            title: t("addPlant.conditionCheckTitle"),
            text: t("addPlant.conditionCheckText")
          }
        : {
            title: t("addPlant.conditionHealthyTitle"),
            text: t("addPlant.conditionHealthyText")
          };
  const isTechnicalAnalysisFailure = analysisFailed && analysisFailureKind === "technical";
  const isLowConfidenceAnalysis = Boolean(analysis && analysis.confidence < 0.55);

  const openPicker = (picker: ConfirmationPicker) => {
    setIsChoosingWaterDate(false);
    setActivePicker(picker);
  };

  const retryAnalysis = () => {
    setAnalysisAttempt((current) => current + 1);
    setStep("analysis");
  };

  const startNicknameEdit = () => {
    setNicknameDraft(homeName);
    setIsConfirmingNicknameRegeneration(false);
    setIsEditingNickname(true);
  };

  const saveNicknameEdit = () => {
    const nextNickname = cleanPlantName(nicknameDraft);
    if (!nextNickname) {
      setIsConfirmingNicknameRegeneration(true);
      return;
    }
    setHomeName(nextNickname);
    setNicknameDraft(nextNickname);
    setIsConfirmingNicknameRegeneration(false);
    setIsEditingNickname(false);
  };

  const generateReplacementNickname = () => {
    const previousNickname = cleanPlantName(homeName);
    const nextNickname = generateNicknameOnce(previousNickname ? [previousNickname] : []);
    setHomeName(nextNickname);
    setNicknameDraft(nextNickname);
    setIsConfirmingNicknameRegeneration(false);
    setIsEditingNickname(false);
  };

  const cancelNicknameEdit = () => {
    setNicknameDraft(homeName);
    setIsConfirmingNicknameRegeneration(false);
    setIsEditingNickname(false);
  };

  const selectLastWateredDate = (dateKey: string | undefined) => {
    setLastWateredAt(dateKey);
    setIsChoosingWaterDate(false);
    setActivePicker(null);
  };

  const addRuntimeDiagnosticContext = (diagnostic: PlantCreationDiagnostic): PlantCreationDiagnostic => ({
    ...diagnostic,
    standaloneMode: isStandalonePwa() ? "standalone" : "browser",
    appBuildVersion,
    previousAppBuildVersion: window.localStorage.getItem(appBuildStorageKey),
    authStatus: status === "ready" && userId ? "authenticated" : status === "unauthenticated" ? "unauthenticated" : "unknown",
    userIdSuffix: userId?.slice(-6) ?? null,
    authenticatedUserIdSuffix: diagnostic.authenticatedUserIdSuffix ?? userId?.slice(-6) ?? null
  });

  const copySaveDiagnostic = () => {
    if (!saveDiagnostic) {
      return;
    }

    void navigator.clipboard?.writeText(JSON.stringify(saveDiagnostic, null, 2));
  };

  const save = async () => {
    if (isSaving || !selectedPhotos.length || !coverPhoto) {
      return;
    }

    let activeSaveStage: PlantCreationStage = "unknown";
    let savedPlantId: string | undefined;
    logAddPlantDebug("plant_submit_started", {
      photoCount: selectedPhotos.length,
      hasRoom: Boolean(roomKey),
      hasLastWateredAt: Boolean(lastWateredAt),
      hasAnalysis: Boolean(analysis)
    });
    setIsSaving(true);
    setSubmitError(null);
    setSaveDiagnostic(null);

    try {
      const temporaryPhotoChecks = await Promise.all(selectedPhotos.map((photo) => PhotoStorageRepository.getPhoto(photo.storageId)));
      const missingPhotoIndex = temporaryPhotoChecks.findIndex((blob) => !blob);
      if (missingPhotoIndex >= 0) {
        const missingPhoto = selectedPhotos[missingPhotoIndex];
        const diagnostic = addRuntimeDiagnosticContext({
          stage: "read_temporary_blob",
          message: "Temporary photo is missing or incompatible with the current app version.",
          photoStorageId: missingPhoto.url,
          parsedTemporaryStorageId: missingPhoto.storageId,
          photoIndex: missingPhotoIndex,
          blobFound: false
        });
        console.error("plant_save_failed", {
          ...diagnostic,
          photoCount: selectedPhotos.length,
          roomKey
        });
        setSaveDiagnostic(diagnostic);
        setSubmitError(t("addPlant.temporaryPhotosExpired"));
        setIsSaving(false);
        return;
      }

      logAddPlantDebug("plant_save_started", {
        photoCount: selectedPhotos.length,
        roomKey,
        lastWateredAt,
        speciesName: displayCommonName,
        hasScientificName: Boolean(displayScientificName)
      });
      let savedNickname = cleanPlantName(homeName);
      if (!savedNickname) {
        const shouldGenerateNickname = window.confirm(t("addPlant.generateNicknameConfirm"));
        if (!shouldGenerateNickname) {
          setSubmitError(t("addPlant.nicknameEmpty"));
          setIsSaving(false);
          return;
        }
        savedNickname = generateNicknameOnce();
        setHomeName(savedNickname);
      }
      const savedCommonName = cleanPlantName(speciesName) || commonNameFromScientificName(displayScientificName);
      if (!savedCommonName && !displayScientificName && analysisFailed) {
        const shouldSaveManualPlant = window.confirm(t("addPlant.manualEmptyConfirm"));
        if (!shouldSaveManualPlant) {
          setSubmitError(t("addPlant.manualNameRequired"));
          setIsSaving(false);
          return;
        }
      }
      activeSaveStage = "create_plant";
      const plantId = await addPlant({
        homeName: savedNickname,
        speciesName: savedCommonName,
        scientificName: displayScientificName || undefined,
        roomKey,
        lastWateredAt,
        photos: selectedPhotos,
        analysis: analysis
          ? {
              detectedSpecies: savedCommonName || analysis.detectedSpecies,
              confidence: analysis.confidence,
              condition: analysis.condition,
              nextAction: analysis.nextAction === "none" ? null : analysis.nextAction,
              nextCheckInDays: analysis.nextCheckInDays,
              summary: analysis.summary,
              recommendations: analysis.recommendations,
              rawResult: analysis.rawResult,
              model: analysis.model
            }
          : undefined
      });
      savedPlantId = plantId;
      logAddPlantDebug("plant_save_completed", { plantId });
      logAddPlantDebug("temporary_photo_cleanup_started", {
        plantId,
        photoCount: selectedPhotos.length,
        temporaryStorageIds: selectedPhotos.map((photo) => photo.storageId)
      });
      activeSaveStage = "cleanup";
      await cleanupTemporaryPhotos(selectedPhotos);
      logAddPlantDebug("temporary_photo_cleanup_completed", {
        plantId,
        photoCount: selectedPhotos.length
      });
      router.push(`/plants/${plantId}`);
      router.refresh();
      logAddPlantDebug("modal_close_started", { plantId });
      onClose();
    } catch (error) {
      const diagnostic = plantCreationDiagnosticFromError(error, {
        stage: activeSaveStage,
        plantId: savedPlantId
      });
      const diagnosticWithRuntime = addRuntimeDiagnosticContext(diagnostic);
      console.error("plant_save_failed", {
        ...diagnosticWithRuntime,
        photoCount: selectedPhotos.length,
        roomKey
      });
      setSaveDiagnostic(diagnosticWithRuntime);
      const authMessage = `${diagnosticWithRuntime.code ?? ""} ${diagnosticWithRuntime.message}`.toLowerCase();
      setSubmitError(authMessage.includes("jwt") || authMessage.includes("auth") || authMessage.includes("session") || authMessage.includes("unauthorized") ? t("auth.reauthenticate") : t("addPlant.submitFailed"));
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#1c1c1e]/20 px-0 backdrop-blur-[2px] sm:items-center sm:px-4">
      <div
        role="dialog"
        aria-modal="true"
        className="flex h-[100dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-[#fffaf3] shadow-[0_20px_60px_rgba(0,0,0,0.16)] sm:h-auto sm:max-h-[90dvh] sm:max-w-[390px] sm:rounded-[28px]"
      >
        <div className="shrink-0 px-5 pb-3 pt-[calc(env(safe-area-inset-top)+20px)] sm:pt-5">
          <h2 className="font-rounded text-2xl font-extrabold text-ink">{t("addPlant.title")}</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          {isPlantSaveDebugEnabled && step === "confirm" ? (
            <p className="mb-3 inline-flex rounded-full bg-[#1f2937] px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-white">
              PLANT SAVE DEBUG ON
            </p>
          ) : null}
          {coverPhoto ? (
            <div className={step === "confirm" ? "relative mt-1 h-64 overflow-hidden rounded-[24px] bg-[#dde8dc]" : "relative mt-1 h-48 overflow-hidden rounded-[24px] bg-[#dde8dc]"}>
              <PhotoImage src={coverPhoto.url} alt={t("photos.photoAlt")} className="h-full w-full object-cover" />
            </div>
          ) : null}
          {analysisFailed ? (
            <p className="mt-4 rounded-[18px] bg-[#fff1d8] p-3 text-sm font-bold leading-5 text-[#8a6230]">{t("addPlant.analysisFailed")}</p>
          ) : null}
          {submitError ? (
            <div className="mt-4 rounded-[18px] bg-[#fdeaf0] p-3 text-sm font-bold leading-5 text-[#9b2c3e]">
              <p>{submitError}</p>
              {isPlantSaveDebugEnabled && saveDiagnostic ? (
                <div className="mt-3 rounded-[14px] bg-white/70 p-3 text-left text-[11px] leading-5 text-[#5f594f]">
                  <p className="font-extrabold text-[#3f3b35]">Plant save diagnostic</p>
                  <p>Failed stage: {saveDiagnostic.stage}</p>
                  <p>Error code: {saveDiagnostic.code ?? "none"}</p>
                  <p>HTTP status: {saveDiagnostic.status ?? "unknown"}</p>
                  <p>Sanitized message: {saveDiagnostic.message}</p>
                  <p>Details: {saveDiagnostic.details ?? "none"}</p>
                  <p>Hint: {saveDiagnostic.hint ?? "none"}</p>
                  <p>Photo index: {saveDiagnostic.photoIndex ?? "n/a"}</p>
                  <p>Parsed temporary storage id: {saveDiagnostic.parsedTemporaryStorageId ?? saveDiagnostic.photoStorageId ?? "n/a"}</p>
                  <p>IndexedDB blob found: {saveDiagnostic.blobFound == null ? "unknown" : String(saveDiagnostic.blobFound)}</p>
                  <p>Blob MIME type: {saveDiagnostic.blobMimeType ?? "unknown"}</p>
                  <p>Blob byte size: {saveDiagnostic.blobSize ?? "unknown"}</p>
                  <p>Authenticated user suffix: {saveDiagnostic.authenticatedUserIdSuffix ?? saveDiagnostic.userIdSuffix ?? "none"}</p>
                  <p>Inserted owner suffix: {saveDiagnostic.insertedOwnerIdSuffix ?? "unknown"}</p>
                  <p>Storage path prefix: {saveDiagnostic.storagePathPrefix ?? "n/a"}</p>
                  <p>Rollback result: {saveDiagnostic.rollbackResult ?? "unknown"}</p>
                  <p>Mode: {saveDiagnostic.standaloneMode ?? "unknown"}</p>
                  <p>Build version: {saveDiagnostic.appBuildVersion ?? "unknown"}</p>
                  <p>Previous build version: {saveDiagnostic.previousAppBuildVersion ?? "unknown"}</p>
                  <p>Auth status: {saveDiagnostic.authStatus ?? "unknown"}</p>
                  <p>User id suffix: {saveDiagnostic.userIdSuffix ?? "none"}</p>
                  <button
                    type="button"
                    onClick={copySaveDiagnostic}
                    className="mt-3 min-h-10 rounded-[14px] bg-[#ddf2dc] px-3 text-xs font-extrabold text-[#2d7a4f]"
                  >
                    Copy diagnostic
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          {step === "confirm" && isTechnicalAnalysisFailure ? (
            <div className="pt-5">
              <div className="rounded-[22px] bg-[#fff1d8] p-4">
                <h3 className="font-rounded text-2xl font-black leading-tight text-ink">{t("addPlant.technicalFailureTitle")}</h3>
                <p className="mt-2 text-sm font-bold leading-5 text-[#7a623d]">{t("addPlant.technicalFailureText")}</p>
                {process.env.NODE_ENV !== "production" && analysisErrorCode ? (
                  <p className="mt-3 rounded-[14px] bg-white/65 p-3 text-left text-[11px] font-bold leading-5 text-[#5f594f]">analysis error: {analysisErrorCode}</p>
                ) : null}
              </div>
              <div className="mt-5 grid gap-2">
                <div className="rounded-[20px] bg-white/70 p-3">
                  <p className="text-xs font-bold uppercase text-[#a09a90]">{t("addPlant.nickname")}</p>
                  {isEditingNickname ? (
                    <div className="mt-2">
                      <input
                        ref={nicknameInputRef}
                        value={nicknameDraft}
                        onChange={(event) => setNicknameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            saveNicknameEdit();
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            cancelNicknameEdit();
                          }
                        }}
                        className="min-h-12 w-full rounded-[18px] bg-[#fffaf3] px-4 text-base font-extrabold text-[#3f3b35] outline-none ring-2 ring-[#ddf2dc]"
                      />
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button type="button" onClick={saveNicknameEdit} className="min-h-10 rounded-[16px] bg-[#ddf2dc] px-3 text-sm font-extrabold text-[#2d7a4f]">
                          {t("addPlant.saveNickname")}
                        </button>
                        <button type="button" onClick={cancelNicknameEdit} className="min-h-10 rounded-[16px] bg-white/80 px-3 text-sm font-extrabold text-[#777167]">
                          {t("plantDetail.cancel")}
                        </button>
                      </div>
                      {isConfirmingNicknameRegeneration ? (
                        <div className="mt-3 rounded-[16px] bg-[#fff8e8] p-3">
                          <p className="text-sm font-bold leading-5 text-[#7a623d]">{t("addPlant.nicknameEmptyPrompt")}</p>
                          <button type="button" onClick={generateReplacementNickname} className="mt-2 min-h-10 rounded-[16px] bg-[#ddf2dc] px-3 text-sm font-extrabold text-[#2d7a4f]">
                            {t("addPlant.generateNickname")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="font-rounded text-xl font-extrabold text-[#3f3b35]">{homeName || ensureSuggestedNickname()}</p>
                      <button type="button" onClick={startNicknameEdit} className="shrink-0 text-sm font-extrabold text-[#2d7a4f]">
                        {t("addPlant.rename")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : step === "confirm" ? (
            <div className="pt-5">
              <h3 className="font-rounded text-[30px] font-black leading-tight text-ink">{displayCommonName}</h3>
              {displayScientificName ? <p className="mt-1 text-sm italic leading-5 text-[#8e867b]">{displayScientificName}</p> : null}
              {isLowConfidenceAnalysis ? (
                <div className="mt-4 rounded-[20px] bg-[#fff8e8] p-3">
                  <p className="font-rounded text-lg font-extrabold text-[#8a6230]">{t("addPlant.lowConfidenceTitle")}</p>
                  <p className="mt-1 text-sm font-bold leading-5 text-[#7a623d]">{t("addPlant.lowConfidenceText")}</p>
                </div>
              ) : null}
              {analysis ? <div className="mt-4 rounded-[20px] bg-[#edf8ed] p-3">
                <p className="font-rounded text-lg font-extrabold text-[#2d7a4f]">{conditionSummary.title}</p>
                <p className="mt-1 text-sm font-bold leading-5 text-[#5f594f]">{conditionSummary.text}</p>
              </div> : null}
              <div className="mt-5 grid gap-2">
                <div className="rounded-[20px] bg-white/70 p-3">
                  <p className="text-xs font-bold uppercase text-[#a09a90]">{t("addPlant.nickname")}</p>
                  {isEditingNickname ? (
                    <div className="mt-2">
                      <input
                        ref={nicknameInputRef}
                        value={nicknameDraft}
                        onChange={(event) => setNicknameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            saveNicknameEdit();
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            cancelNicknameEdit();
                          }
                        }}
                        className="min-h-12 w-full rounded-[18px] bg-[#fffaf3] px-4 text-base font-extrabold text-[#3f3b35] outline-none ring-2 ring-[#ddf2dc]"
                      />
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button type="button" onClick={saveNicknameEdit} className="min-h-10 rounded-[16px] bg-[#ddf2dc] px-3 text-sm font-extrabold text-[#2d7a4f]">
                          {t("addPlant.saveNickname")}
                        </button>
                        <button type="button" onClick={cancelNicknameEdit} className="min-h-10 rounded-[16px] bg-white/80 px-3 text-sm font-extrabold text-[#777167]">
                          {t("plantDetail.cancel")}
                        </button>
                      </div>
                      {isConfirmingNicknameRegeneration ? (
                        <div className="mt-3 rounded-[16px] bg-[#fff8e8] p-3">
                          <p className="text-sm font-bold leading-5 text-[#7a623d]">{t("addPlant.nicknameEmptyPrompt")}</p>
                          <button type="button" onClick={generateReplacementNickname} className="mt-2 min-h-10 rounded-[16px] bg-[#ddf2dc] px-3 text-sm font-extrabold text-[#2d7a4f]">
                            {t("addPlant.generateNickname")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="font-rounded text-xl font-extrabold text-[#3f3b35]">{homeName}</p>
                      <button type="button" onClick={startNicknameEdit} className="shrink-0 text-sm font-extrabold text-[#2d7a4f]">
                        {t("addPlant.rename")}
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => openPicker("room")}
                  className="rounded-[20px] bg-white/70 p-3 text-left"
                >
                  <p className="text-xs font-bold uppercase text-[#a09a90]">{t("addPlant.locationLabel")}</p>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <p className="font-extrabold text-[#3f3b35]">{selectedRoomName}</p>
                    <span className="shrink-0 text-sm font-extrabold text-[#2d7a4f]">
                      {roomKey ? t("addPlant.change") : t("addPlant.select")}
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => openPicker("watering")}
                  className="rounded-[20px] bg-white/70 p-3 text-left"
                >
                  <p className="text-xs font-bold uppercase text-[#a09a90]">{t("addPlant.lastWateringLabel")}</p>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <p className="font-extrabold text-[#3f3b35]">{lastWateredValue}</p>
                    <span className="shrink-0 text-sm font-extrabold text-[#2d7a4f]">
                      {lastWateredAt ? t("addPlant.change") : t("addPlant.add")}
                    </span>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <>
              {selectedPhotos.length > 1 ? (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {selectedPhotos.map((photo) => (
                    <div key={photo.id} className="relative size-16 shrink-0 overflow-hidden rounded-[16px] bg-[#dde8dc]">
                      <PhotoImage
                        src={photo.url}
                        alt={t("photos.photoAlt")}
                        className="h-full w-full object-cover"
                        onLoad={() => {
                          if (process.env.NODE_ENV === "production") return;
                          logAddPlantDebug("photo_orientation_stage", {
                            stage: "add_plant_preview",
                            source: photo.source,
                            photoId: photo.id,
                            width: photo.orientation.storedWidth,
                            height: photo.orientation.storedHeight,
                            exifOrientation: photo.orientation.exifOrientation,
                            physicallyRotated: photo.orientation.physicallyRotated,
                            displayedInUi: `${photo.orientation.displayedWidth ?? "unknown"}x${photo.orientation.displayedHeight ?? "unknown"}`
                          });
                        }}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
              {process.env.NODE_ENV !== "production" && analysisErrorCode ? (
                <p className="mt-3 rounded-[18px] bg-white/75 p-3 text-left text-[11px] font-bold leading-5 text-[#5f594f]">analysis error: {analysisErrorCode}</p>
              ) : null}
              {process.env.NODE_ENV !== "production" && clientPreparationDiagnostics.length ? (
                <div className="mt-4 rounded-[18px] bg-white/75 p-3 text-left text-[11px] font-bold leading-5 text-[#5f594f]">
                  <p className="mb-2 text-xs font-extrabold text-ink">Development client image preparation</p>
                  {clientPreparationDiagnostics.map((diagnostic, index) => (
                    <div key={`${diagnostic.fileName}-${index}`} className="border-t border-[#eee7dc] py-2 first:border-t-0 first:pt-0">
	                      <p>source: {diagnostic.source}</p>
	                      <p>mime: {diagnostic.originalMimeType || "unknown"}</p>
	                      <p>original: {diagnostic.originalSize} bytes / {diagnostic.originalWidth ?? "unknown"}x{diagnostic.originalHeight ?? "unknown"}</p>
	                      <p>exif orientation: {diagnostic.exifOrientation ?? "none"}</p>
	                      <p>orientation source: {diagnostic.orientationSource ?? "unknown"}</p>
	                      <p>physically rotated: {String(Boolean(diagnostic.physicallyRotated))}</p>
	                      <p>displayed: {diagnostic.displayedWidth ?? "unknown"}x{diagnostic.displayedHeight ?? "unknown"}</p>
	                      <p>normalized: {diagnostic.compressedSize ?? 0} bytes / {diagnostic.finalWidth ?? "unknown"}x{diagnostic.finalHeight ?? "unknown"}</p>
	                      <p>total request images: {diagnostic.totalOutgoingRequestSize ?? 0} bytes</p>
	                      <p>request: {diagnostic.httpStatus ?? "none"} / {diagnostic.requestDurationMs ?? 0} ms</p>
	                      <p>included: {String(diagnostic.includedInRequest)}</p>
	                      {diagnostic.errorCode ? <p>error: {diagnostic.errorCode} / {diagnostic.errorName ?? "Error"} / {diagnostic.errorMessage ?? ""}</p> : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {process.env.NODE_ENV !== "production" && analysisDiagnostics.length ? (
                <div className="mt-4 rounded-[18px] bg-white/75 p-3 text-left text-[11px] font-bold leading-5 text-[#5f594f]">
                  <p className="mb-2 text-xs font-extrabold text-ink">Development image diagnostics</p>
                  {analysisDiagnostics.map((diagnostic, index) => (
                    <div key={`${diagnostic.fileName}-${index}`} className="border-t border-[#eee7dc] py-2 first:border-t-0 first:pt-0">
                      <p>source: {diagnostic.source}</p>
                      <p>format: {diagnostic.detectedFormat}</p>
                      <p>client: {diagnostic.client?.width ?? "unknown"}x{diagnostic.client?.height ?? "unknown"} / exif {diagnostic.client?.exifOrientation ?? "none"} / rotated {String(Boolean(diagnostic.client?.physicallyRotated))}</p>
                      <p>server decode: {diagnostic.decodedWidth ?? "unknown"}x{diagnostic.decodedHeight ?? "unknown"} / exif {diagnostic.exifOrientation ?? "none"}</p>
                      <p>server normalized: {diagnostic.normalizedWidth ?? "unknown"}x{diagnostic.normalizedHeight ?? "unknown"}</p>
                      <p>conversion: {diagnostic.conversionStatus}</p>
                      <p>final: {diagnostic.finalMimeType ?? "none"} / {diagnostic.finalByteSize ?? 0} bytes</p>
                      <p>included: {String(diagnostic.includedInOpenAIRequest)}</p>
                      {diagnostic.errorCode ? <p>error: {diagnostic.errorCode}</p> : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {analysis ? <div className="mt-4 rounded-[20px] bg-[#edf8ed] p-3">
                <p className="font-rounded text-lg font-extrabold text-[#2d7a4f]">{conditionSummary.title}</p>
                <p className="mt-1 text-sm font-bold leading-5 text-[#5f594f]">{conditionSummary.text}</p>
              </div> : null}
              <label className="mt-4 block text-sm font-extrabold text-[#4f4940]">
                {t("addPlant.nickname")}
                <input value={homeName} onChange={(event) => setHomeName(event.target.value)} className="mt-2 min-h-12 w-full rounded-[18px] bg-white/80 px-4 text-base outline-none" />
              </label>
              <label className="mt-4 block text-sm font-extrabold text-[#4f4940]">
                {t("addPlant.commonName")}
                <input value={speciesName} onChange={(event) => setSpeciesName(event.target.value)} className="mt-2 min-h-12 w-full rounded-[18px] bg-white/80 px-4 text-base outline-none" />
              </label>
              <label className="mt-4 block text-sm font-extrabold text-[#4f4940]">
                {t("addPlant.scientificName")}
                <input value={scientificName} onChange={(event) => setScientificName(cleanScientificName(event.target.value))} className="mt-2 min-h-12 w-full rounded-[18px] bg-white/80 px-4 text-base outline-none" />
              </label>
              <div className="mt-4">
                <p className="mb-2 text-sm font-extrabold text-[#4f4940]">{t("plantDetail.location")}</p>
                <RoomPicker value={roomKey} onChange={setRoomKey} />
              </div>
            </>
          )}
        </div>
        <div className="shrink-0 border-t border-[#efe6d8] bg-[#fffaf3] px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
          <button
            type="button"
            onClick={isTechnicalAnalysisFailure && step === "confirm" ? retryAnalysis : () => void save()}
            disabled={isSaving}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-gradient-to-br from-[#92cc90] to-[#6ba369] px-4 text-sm font-extrabold text-white shadow-fab disabled:opacity-60"
          >
            {isSaving ? <Loader2 aria-hidden="true" size={16} className="animate-spin" /> : null}
            {isSaving ? t("addPlant.saving") : isTechnicalAnalysisFailure && step === "confirm" ? t("addPlant.retryAnalysis") : t("addPlant.save")}
          </button>
          <button
            type="button"
            onClick={step === "confirm" ? () => setStep("details") : cancelAddPlant}
            disabled={isSaving}
            className="mt-2 min-h-12 w-full rounded-[18px] px-4 text-sm font-extrabold text-[#777167] disabled:opacity-50"
          >
            {step === "confirm" ? isTechnicalAnalysisFailure ? t("addPlant.manualEntry") : t("addPlant.refineDetails") : t("plantDetail.cancel")}
          </button>
        </div>
      </div>
      {activePicker === "room" ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1c1c1e]/20 px-4 pb-4 backdrop-blur-[2px] sm:items-center sm:pb-0">
          <div role="dialog" aria-modal="true" className="w-full max-w-[390px] rounded-[28px] bg-[#fffaf3] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.16)]">
            <h2 className="font-rounded text-2xl font-extrabold text-ink">{t("addPlant.locationLabel")}</h2>
            <div className="mt-4">
              <RoomPicker
                value={roomKey}
                onChange={(value) => {
                  setRoomKey(value);
                  setActivePicker(null);
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setRoomKey(undefined);
                setActivePicker(null);
              }}
              className="mt-3 min-h-12 w-full rounded-[18px] bg-white/75 px-4 text-sm font-extrabold text-[#5f594f]"
            >
              {t("addPlant.noRoomSelected")}
            </button>
            <button
              type="button"
              onClick={() => setActivePicker(null)}
              className="mt-2 min-h-12 w-full rounded-[18px] px-4 text-sm font-extrabold text-[#777167]"
            >
              {t("plantDetail.cancel")}
            </button>
          </div>
        </div>
      ) : null}
      {activePicker === "watering" ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1c1c1e]/20 px-4 pb-4 backdrop-blur-[2px] sm:items-center sm:pb-0">
          <div role="dialog" aria-modal="true" className="w-full max-w-[390px] rounded-[28px] bg-[#fffaf3] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.16)]">
            <h2 className="font-rounded text-2xl font-extrabold text-ink">{t("addPlant.lastWateringLabel")}</h2>
            <div className="mt-4 grid gap-2">
              <button type="button" onClick={() => selectLastWateredDate(todayDateKey)} className="min-h-12 rounded-[18px] bg-white/75 px-4 text-left text-sm font-extrabold text-[#3f3b35]">
                {t("addPlant.waterToday")}
              </button>
              <button type="button" onClick={() => selectLastWateredDate(toDateKey(addDays(new Date(), -1)))} className="min-h-12 rounded-[18px] bg-white/75 px-4 text-left text-sm font-extrabold text-[#3f3b35]">
                {t("addPlant.waterYesterday")}
              </button>
              <button type="button" onClick={() => selectLastWateredDate(toDateKey(addDays(new Date(), -3)))} className="min-h-12 rounded-[18px] bg-white/75 px-4 text-left text-sm font-extrabold text-[#3f3b35]">
                {t("addPlant.waterFewDaysAgo")}
              </button>
              <button type="button" onClick={() => setIsChoosingWaterDate(true)} className="min-h-12 rounded-[18px] bg-white/75 px-4 text-left text-sm font-extrabold text-[#3f3b35]">
                {t("addPlant.waterChooseDate")}
              </button>
              {isChoosingWaterDate ? (
                <div className="rounded-[18px] bg-white/75 p-3">
                  <input
                    type="date"
                    value={customWaterDate}
                    max={todayDateKey}
                    onChange={(event) => setCustomWaterDate(event.target.value)}
                    className="min-h-12 w-full rounded-[16px] bg-[#fffaf3] px-3 text-base font-bold text-[#3f3b35] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => selectLastWateredDate(customWaterDate)}
                    className="mt-2 min-h-11 w-full rounded-[16px] bg-[#ddf2dc] px-4 text-sm font-extrabold text-[#2d7a4f]"
                  >
                    {t("story.saveEvent")}
                  </button>
                </div>
              ) : null}
              <button type="button" onClick={() => selectLastWateredDate(undefined)} className="min-h-12 rounded-[18px] bg-white/75 px-4 text-left text-sm font-extrabold text-[#777167]">
                {t("addPlant.waterUnknown")}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setActivePicker(null)}
              className="mt-3 min-h-12 w-full rounded-[18px] px-4 text-sm font-extrabold text-[#777167]"
            >
              {t("plantDetail.cancel")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
