"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { usePlantStore } from "@/data/PlantStore";
import { addDays, formatRelativeDate, formatShortDate, toDateKey } from "@/lib/date-format";
import { cleanPlantName, cleanScientificName, commonNameFromScientificName } from "@/lib/plant-display";
import { PhotoStorageRepository } from "@/lib/photo-storage";
import { PhotoImage } from "./PhotoImage";
import { PhotoUploadFlow } from "./PhotoUploadFlow";
import { RoomPicker } from "./RoomPicker";
import type { PendingPhotoUpload } from "./photo-upload-types";

type Step = "pick" | "analysis" | "confirm" | "details";
type ConfirmationPicker = "room" | "watering" | null;
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
  originalSize: number;
  compressedSize: number | null;
  originalWidth: number | null;
  originalHeight: number | null;
  finalWidth: number | null;
  finalHeight: number | null;
  totalOutgoingRequestSize: number | null;
  includedInRequest: boolean;
  errorCode?: string;
};

const analysisStageCount = 4;
const analysisImageMaxSide = 1600;
const analysisImageTargetBytes = 500 * 1024;
const analysisRequestTargetBytes = 3 * 1024 * 1024;
const analysisJpegQualities = [0.78, 0.75, 0.72, 0.68];
const defaultNicknames = {
  en: ["Sprout", "Leafy", "Bud", "Green Buddy", "Mister Leaf", "Professor Chlorophyll", "Sunny", "Little Green"],
  ru: ["Кустик", "Листик", "Ростик", "Зелёныш", "Плюш", "Листун", "Зелёный друг", "Мистер Лист", "Профессор Хлорофилл"]
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
  return names.find((name) => !normalizedExisting.has(name.toLocaleLowerCase())) ?? names[0];
}

function loadImageFromBlob(blob: Blob): Promise<{ image: HTMLImageElement; objectUrl: string }> {
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();

  return new Promise((resolve, reject) => {
    image.onload = () => resolve({ image, objectUrl });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("image_preparation_failed"));
    };
    image.src = objectUrl;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("image_preparation_failed"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality
    );
  });
}

async function prepareImageForAnalysis(blob: Blob, fileName: string) {
  const { image, objectUrl } = await loadImageFromBlob(blob);

  try {
    const originalWidth = image.naturalWidth;
    const originalHeight = image.naturalHeight;
    if (!originalWidth || !originalHeight) {
      throw new Error("image_preparation_failed");
    }

    const scale = Math.min(1, analysisImageMaxSide / Math.max(originalWidth, originalHeight));
    const finalWidth = Math.max(1, Math.round(originalWidth * scale));
    const finalHeight = Math.max(1, Math.round(originalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = finalWidth;
    canvas.height = finalHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("image_preparation_failed");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, finalWidth, finalHeight);
    context.drawImage(image, 0, 0, finalWidth, finalHeight);

    let bestBlob: Blob | null = null;
    for (const quality of analysisJpegQualities) {
      const candidate = await canvasToJpeg(canvas, quality);
      bestBlob = candidate;
      if (candidate.size <= analysisImageTargetBytes) {
        break;
      }
    }

    if (!bestBlob) {
      throw new Error("image_preparation_failed");
    }

    const safeName = `${fileName.replace(/\.[^.]+$/, "") || "plant-photo"}-analysis.jpg`;
    return {
      file: new File([bestBlob], safeName, { type: "image/jpeg" }),
      originalWidth,
      originalHeight,
      finalWidth,
      finalHeight
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function AddPlantWizard({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const { addPlant, plants, rooms } = usePlantStore();
  const [step, setStep] = useState<Step>("pick");
  const [selectedPhotos, setSelectedPhotos] = useState<PendingPhotoUpload[]>([]);
  const [homeName, setHomeName] = useState("");
  const [speciesName, setSpeciesName] = useState("");
  const [scientificName, setScientificName] = useState("");
  const [notes, setNotes] = useState("");
  const [roomKey, setRoomKey] = useState<string | undefined>();
  const [lastWateredAt, setLastWateredAt] = useState<string | undefined>();
  const [activePicker, setActivePicker] = useState<ConfirmationPicker>(null);
  const [isChoosingWaterDate, setIsChoosingWaterDate] = useState(false);
  const [customWaterDate, setCustomWaterDate] = useState(toDateKey(new Date()));
  const [analysis, setAnalysis] = useState<PlantAnalysis | null>(null);
  const [analysisFailed, setAnalysisFailed] = useState(false);
  const [analysisDiagnostics, setAnalysisDiagnostics] = useState<ImageAnalysisDiagnostic[]>([]);
  const [clientPreparationDiagnostics, setClientPreparationDiagnostics] = useState<ClientImagePreparationDiagnostic[]>([]);
  const [analysisErrorCode, setAnalysisErrorCode] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [analysisStageIndex, setAnalysisStageIndex] = useState(0);
  const [showLongAnalysisHint, setShowLongAnalysisHint] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    if (step !== "analysis") {
      return;
    }

    let isMounted = true;
    setAnalysisStageIndex(0);
    setShowLongAnalysisHint(false);
    setAnalysisErrorCode(null);
    setClientPreparationDiagnostics([]);
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
      setAnalysisFailed(false);

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
              originalSize: blob.size,
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
              diagnostic.totalOutgoingRequestSize = totalOutgoingRequestSize;
              diagnostic.errorCode = "image_preparation_failed";
              setClientPreparationDiagnostics(nextPreparationDiagnostics);
              throw new Error("image_preparation_failed");
            }

            diagnostic.compressedSize = preparedImage.file.size;
            diagnostic.originalWidth = preparedImage.originalWidth;
            diagnostic.originalHeight = preparedImage.originalHeight;
            diagnostic.finalWidth = preparedImage.finalWidth;
            diagnostic.finalHeight = preparedImage.finalHeight;
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
        const response = await fetch("/api/analyze-plant", {
          method: "POST",
          body: formData
        });
        const payload = await response.json();

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
        setHomeName((current) => current || suggestedNickname(locale, plants.map((plant) => plant.homeName ?? "")));
      } catch (error) {
        if (isMounted) {
          setAnalysisFailed(true);
          setAnalysisErrorCode(error instanceof Error ? error.message : "analysis_failed");
        }
      } finally {
        await finishAnalysisSheet();
      }
    }

    void analyzePhotos();

    return () => {
      isMounted = false;
      stageTimers.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(longAnalysisTimer);
    };
  }, [locale, plants, selectedPhotos, step]);

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
  const uncertaintyMessage = analysis?.uncertainties?.[0]?.[locale];
  const todayDateKey = toDateKey(new Date());

  const openPicker = (picker: ConfirmationPicker) => {
    setIsChoosingWaterDate(false);
    setActivePicker(picker);
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
      const savedNickname = cleanPlantName(homeName) || suggestedNickname(locale, plants.map((plant) => plant.homeName ?? ""));
      const savedCommonName = cleanPlantName(speciesName) || commonNameFromScientificName(displayScientificName);
      const plantId = await addPlant({
        homeName: savedNickname,
        speciesName: savedCommonName,
        scientificName: displayScientificName || undefined,
        roomKey,
        lastWateredAt,
        notes: notes.trim() || undefined,
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
          {step === "confirm" ? (
            <div className="pt-5">
              <h3 className="font-rounded text-[30px] font-black leading-tight text-ink">{displayCommonName}</h3>
              {displayScientificName ? <p className="mt-1 text-sm italic leading-5 text-[#8e867b]">{displayScientificName}</p> : null}
              {uncertaintyMessage ? <p className="mt-4 rounded-[18px] bg-white/70 p-3 text-sm font-bold leading-5 text-[#7a6f61]">{uncertaintyMessage}</p> : null}
              <div className="mt-5 grid gap-2">
                <div className="rounded-[20px] bg-white/70 p-3">
                  <p className="text-xs font-bold uppercase text-[#a09a90]">{t("addPlant.nickname")}</p>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <p className="font-rounded text-xl font-extrabold text-[#3f3b35]">{homeName}</p>
                    <button type="button" onClick={() => setStep("details")} className="shrink-0 text-sm font-extrabold text-[#2d7a4f]">
                      {t("addPlant.rename")}
                    </button>
                  </div>
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
                      <p>original: {diagnostic.originalSize} bytes / {diagnostic.originalWidth ?? "unknown"}x{diagnostic.originalHeight ?? "unknown"}</p>
                      <p>compressed: {diagnostic.compressedSize ?? 0} bytes / {diagnostic.finalWidth ?? "unknown"}x{diagnostic.finalHeight ?? "unknown"}</p>
                      <p>total request images: {diagnostic.totalOutgoingRequestSize ?? 0} bytes</p>
                      <p>included: {String(diagnostic.includedInRequest)}</p>
                      {diagnostic.errorCode ? <p>error: {diagnostic.errorCode}</p> : null}
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
              {analysis?.summary ? <p className="mt-4 text-sm font-bold leading-6 text-[#5f594f]">{analysis.summary[locale]}</p> : null}
              {uncertaintyMessage ? <p className="mt-3 rounded-[18px] bg-white/70 p-3 text-sm font-bold leading-5 text-[#7a6f61]">{uncertaintyMessage}</p> : null}
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
              <label className="mt-4 block text-sm font-extrabold text-[#4f4940]">
                {t("edit.notes")}
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t("edit.notesPlaceholder")} className="mt-2 min-h-28 w-full rounded-[18px] bg-white/80 p-4 text-sm leading-6 outline-none" />
              </label>
            </>
          )}
        </div>
        <div className="shrink-0 border-t border-[#efe6d8] bg-[#fffaf3] px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={isSaving}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-gradient-to-br from-[#92cc90] to-[#6ba369] px-4 text-sm font-extrabold text-white shadow-fab disabled:opacity-60"
          >
            {isSaving ? <Loader2 aria-hidden="true" size={16} className="animate-spin" /> : null}
            {isSaving ? t("addPlant.saving") : t("addPlant.save")}
          </button>
          <button
            type="button"
            onClick={step === "confirm" ? () => setStep("details") : onClose}
            disabled={isSaving}
            className="mt-2 min-h-12 w-full rounded-[18px] px-4 text-sm font-extrabold text-[#777167] disabled:opacity-50"
          >
            {step === "confirm" ? t("addPlant.refineDetails") : t("plantDetail.cancel")}
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
