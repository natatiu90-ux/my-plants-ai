"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { usePlantStore } from "@/data/PlantStore";
import { normalizeImageBlob } from "@/lib/client-image-normalization";
import { addDays, formatRelativeDate, formatShortDate, toDateKey } from "@/lib/date-format";
import { cleanPlantName, cleanScientificName, commonNameFromScientificName } from "@/lib/plant-display";
import { PhotoStorageRepository } from "@/lib/photo-storage";
import { PhotoImage } from "./PhotoImage";
import { PhotoUploadFlow } from "./PhotoUploadFlow";
import { RoomPicker } from "./RoomPicker";
import type { PendingPhotoUpload } from "./photo-upload-types";

type Step = "pick" | "analysis" | "confirm" | "details";
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
  source: "camera" | "gallery";
  fileName: string;
  detectedFormat: string;
  conversionStatus: string;
  finalFormat: string | null;
  finalSize: number | null;
  includedInOpenAIRequest: boolean;
  errorCode?: string;
  errorMessage?: string;
};
type ClientImagePreparationDiagnostic = {
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
  totalOutgoingRequestSize: number | null;
  includedInRequest: boolean;
  requestDurationMs?: number | null;
  httpStatus?: number | null;
  errorCode?: string;
  errorName?: string;
  errorMessage?: string;
};

const analysisStageCount = 4;
const analysisImageMaxSide = 1600;
const analysisImageTargetBytes = 500 * 1024;
const analysisRequestTargetBytes = 3 * 1024 * 1024;
const analysisJpegQualities = [0.78, 0.75, 0.72, 0.68];
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

async function prepareImageForAnalysis(blob: Blob, fileName: string) {
  const normalized = await normalizeImageBlob(blob, {
    maxSide: analysisImageMaxSide,
    qualities: analysisJpegQualities,
    targetBytes: analysisImageTargetBytes
  });
  const safeName = `${fileName.replace(/\.[^.]+$/, "") || "plant-photo"}-analysis.jpg`;
  return {
    file: new File([normalized.blob], safeName, { type: "image/jpeg" }),
    originalWidth: normalized.originalWidth,
    originalHeight: normalized.originalHeight,
    finalWidth: normalized.normalizedWidth,
    finalHeight: normalized.normalizedHeight,
    exifOrientation: normalized.exifOrientation
  };
}

export function AddPlantWizard({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const { addPlant, plants, rooms } = usePlantStore();
  const [step, setStep] = useState<Step>("pick");
  const [selectedPhotos, setSelectedPhotos] = useState<PendingPhotoUpload[]>([]);
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
  const [analysisStageIndex, setAnalysisStageIndex] = useState(0);
  const [showLongAnalysisHint, setShowLongAnalysisHint] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [analysisAttempt, setAnalysisAttempt] = useState(0);
  const nicknameInputRef = useRef<HTMLInputElement>(null);
  const generatedNicknameRef = useRef<string | null>(null);

  const generateNicknameOnce = useCallback((extraExistingNames: string[] = []) => {
    const existingNames = [...plants.map((plant) => plant.homeName ?? ""), ...extraExistingNames];
    const nickname = suggestedNickname(locale, existingNames);
    generatedNicknameRef.current = nickname;
    return nickname;
  }, [locale, plants]);

  const ensureSuggestedNickname = useCallback(() => generatedNicknameRef.current ?? generateNicknameOnce(), [generateNicknameOnce]);

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
              fileName,
              originalMimeType: blob.type,
              originalSize: blob.size,
              exifOrientation: null,
              compressedSize: null,
              originalWidth: null,
              originalHeight: null,
              finalWidth: null,
              finalHeight: null,
              totalOutgoingRequestSize: null,
              includedInRequest: false
            };
            nextPreparationDiagnostics.push(diagnostic);

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
            diagnostic.includedInRequest = true;
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
          }
        }
        nextPreparationDiagnostics.forEach((diagnostic) => {
          diagnostic.totalOutgoingRequestSize = totalOutgoingRequestSize;
        });
        setClientPreparationDiagnostics(nextPreparationDiagnostics);
        console.info("Plant analysis client images prepared", {
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
        console.info("Plant analysis request completed", {
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

  const analysisStages = [
    t("addPlant.uploadingPhotos"),
    t("addPlant.identifying"),
    t("addPlant.checking"),
    t("addPlant.preparing")
  ];

  if (step === "pick") {
    return (
      <PhotoUploadFlow
        title={t("addPlant.title")}
        hasExistingCover={false}
        onCancel={onClose}
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

  const save = async () => {
    if (isSaving || !selectedPhotos.length || !coverPhoto) {
      return;
    }

    console.info("plant_submit_started", {
      photoCount: selectedPhotos.length,
      hasRoom: Boolean(roomKey),
      hasLastWateredAt: Boolean(lastWateredAt),
      hasAnalysis: Boolean(analysis)
    });
    setIsSaving(true);
    setSubmitError(null);

    try {
      console.info("plant_save_started", {
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
      console.info("plant_save_completed", { plantId });
      router.push(`/plants/${plantId}`);
      router.refresh();
      console.info("modal_close_started", { plantId });
      onClose();
    } catch (error) {
      console.error("plant_save_failed", {
        message: error instanceof Error ? error.message : "Unknown error",
        photoCount: selectedPhotos.length,
        roomKey
      });
      setSubmitError(t("addPlant.submitFailed"));
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
          {coverPhoto ? (
            <div className={step === "confirm" ? "relative mt-1 h-64 overflow-hidden rounded-[24px] bg-[#dde8dc]" : "relative mt-1 h-48 overflow-hidden rounded-[24px] bg-[#dde8dc]"}>
              <PhotoImage src={coverPhoto.url} alt={t("photos.photoAlt")} className="h-full w-full object-cover" />
            </div>
          ) : null}
          {analysisFailed ? (
            <p className="mt-4 rounded-[18px] bg-[#fff1d8] p-3 text-sm font-bold leading-5 text-[#8a6230]">{t("addPlant.analysisFailed")}</p>
          ) : null}
          {submitError ? (
            <p className="mt-4 rounded-[18px] bg-[#fdeaf0] p-3 text-sm font-bold leading-5 text-[#9b2c3e]">{submitError}</p>
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
                      <PhotoImage src={photo.url} alt={t("photos.photoAlt")} className="h-full w-full object-cover" />
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
                      <p>conversion: {diagnostic.conversionStatus}</p>
                      <p>final: {diagnostic.finalFormat ?? "none"} / {diagnostic.finalSize ?? 0} bytes</p>
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
            onClick={step === "confirm" ? () => setStep("details") : onClose}
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
