"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/I18nProvider";
import { usePlantStore } from "@/data/PlantStore";
import { PhotoStorageRepository } from "@/lib/photo-storage";
import { PhotoImage } from "./PhotoImage";
import { PhotoUploadFlow } from "./PhotoUploadFlow";
import { RoomPicker } from "./RoomPicker";
import { Toast } from "./Toast";
import type { PendingPhotoUpload } from "./photo-upload-types";

type Step = "pick" | "analysis" | "form";
type PlantAnalysis = {
  detectedSpecies: string | null;
  scientificName: string | null;
  confidence: number;
  condition: "healthy" | "check_soon" | "needs_attention" | "unknown";
  nextAction: "water" | "check_soil" | "take_photo" | "none";
  nextCheckInDays: number | null;
  summary: { en: string; ru: string };
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
  const { addPlant } = usePlantStore();
  const [step, setStep] = useState<Step>("pick");
  const [selectedPhotos, setSelectedPhotos] = useState<PendingPhotoUpload[]>([]);
  const [homeName, setHomeName] = useState("");
  const [speciesName, setSpeciesName] = useState("");
  const [scientificName, setScientificName] = useState("");
  const [roomKey, setRoomKey] = useState<string | undefined>();
  const [analysis, setAnalysis] = useState<PlantAnalysis | null>(null);
  const [analysisFailed, setAnalysisFailed] = useState(false);
  const [analysisDiagnostics, setAnalysisDiagnostics] = useState<ImageAnalysisDiagnostic[]>([]);
  const [clientPreparationDiagnostics, setClientPreparationDiagnostics] = useState<ClientImagePreparationDiagnostic[]>([]);
  const [analysisErrorCode, setAnalysisErrorCode] = useState<string | null>(null);
  const [analysisStageIndex, setAnalysisStageIndex] = useState(0);
  const [showLongAnalysisHint, setShowLongAnalysisHint] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showToast, setShowToast] = useState(false);

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
        setStep("form");
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
        setSpeciesName(nextAnalysis.detectedSpecies ?? "");
        setScientificName(nextAnalysis.scientificName ?? "");
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
  }, [locale, selectedPhotos, step]);

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

  const save = async () => {
    if (!selectedPhotos.length || !coverPhoto) {
      return;
    }

    setIsSaving(true);
    const plantId = await addPlant({
      homeName,
      speciesName: speciesName.trim() || t("plants.unknownName"),
      scientificName: scientificName.trim() || undefined,
      roomKey,
      photos: selectedPhotos,
      analysis: analysis
        ? {
            detectedSpecies: analysis.detectedSpecies,
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
    setShowToast(true);
    router.push(`/plants/${plantId}`);
    window.setTimeout(onClose, 1200);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#1c1c1e]/20 px-4 pb-4 backdrop-blur-[2px] sm:items-center sm:pb-0">
      <div role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-[390px] overflow-y-auto rounded-[28px] bg-[#fffaf3] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.16)]">
        <h2 className="font-rounded text-2xl font-extrabold text-ink">{t("addPlant.title")}</h2>
        {coverPhoto ? (
          <div className="relative mt-4 h-56 overflow-hidden rounded-[24px] bg-[#dde8dc]">
            <PhotoImage src={coverPhoto.url} alt={t("photos.photoAlt")} className="h-full w-full object-cover" />
          </div>
        ) : null}
        {selectedPhotos.length > 1 ? (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {selectedPhotos.map((photo) => (
              <div key={photo.id} className="relative size-16 shrink-0 overflow-hidden rounded-[16px] bg-[#dde8dc]">
                <PhotoImage src={photo.url} alt={t("photos.photoAlt")} className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        ) : null}
        {analysisFailed ? (
          <p className="mt-4 rounded-[18px] bg-[#fff1d8] p-3 text-sm font-bold leading-5 text-[#8a6230]">{t("addPlant.analysisFailed")}</p>
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
        <label className="mt-4 block text-sm font-extrabold text-[#4f4940]">
          {t("addPlant.nickname")}
          <input
            value={homeName}
            onChange={(event) => setHomeName(event.target.value)}
            className="mt-2 min-h-12 w-full rounded-[18px] bg-white/80 px-4 text-base outline-none"
          />
        </label>
        <label className="mt-4 block text-sm font-extrabold text-[#4f4940]">
          {t("addPlant.species")}
          <input
            value={speciesName}
            onChange={(event) => setSpeciesName(event.target.value)}
            className="mt-2 min-h-12 w-full rounded-[18px] bg-white/80 px-4 text-base outline-none"
          />
        </label>
        <label className="mt-4 block text-sm font-extrabold text-[#4f4940]">
          {t("addPlant.scientificName")}
          <input
            value={scientificName}
            onChange={(event) => setScientificName(event.target.value)}
            className="mt-2 min-h-12 w-full rounded-[18px] bg-white/80 px-4 text-base outline-none"
          />
        </label>
        <div className="mt-4">
          <p className="mb-2 text-sm font-extrabold text-[#4f4940]">{t("plantDetail.location")}</p>
          <RoomPicker value={roomKey} onChange={setRoomKey} />
        </div>
        <div className="mt-5 grid gap-2">
          <button type="button" onClick={() => void save()} disabled={isSaving} className="min-h-12 rounded-[18px] bg-gradient-to-br from-[#92cc90] to-[#6ba369] px-4 text-sm font-extrabold text-white shadow-fab disabled:opacity-60">
            {t("addPlant.save")}
          </button>
          <button type="button" onClick={onClose} className="min-h-12 rounded-[18px] px-4 text-sm font-extrabold text-[#777167]">
            {t("plantDetail.cancel")}
          </button>
        </div>
      </div>
      {showToast ? <Toast message={t("toast.welcomeHome")} /> : null}
    </div>
  );
}
