"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { usePlantStore } from "@/data/PlantStore";
import { clearAddPlantDraft, createAddPlantDraftId, createAnalysisRequestId, loadAddPlantDraft, saveAddPlantDraft, type AddPlantDraft } from "@/lib/add-plant-draft";
import { deriveAddPlantConfirmationPresentation } from "@/lib/add-plant-confirmation-presentation";
import { deriveAddPlantDefaultLocation, lastUsedAddPlantHomeStorageKey, lastUsedAddPlantRoomStorageKey, rememberAddPlantLocation, selectedHomeStoragePrefix } from "@/lib/add-plant-default-location";
import {
  addPlantPerformanceSummaryEvent,
  endAddPlantPerformanceStage,
  getLastAddPlantPerformanceSummary,
  logAddPlantPerformanceSummary,
  recordAddPlantPerformanceStage,
  startAddPlantPerformanceStage,
  type AddPlantPerformanceSummary
} from "@/lib/add-plant-performance";
import { appBuildStorageKey, appBuildVersion, isStandalonePwa } from "@/lib/app-version";
import { inspectImageDisplay, normalizeImageBlob, readJpegExifOrientation } from "@/lib/client-image-normalization";
import { buildPlantEnvironmentContext, formatEnvironmentContextForPrompt } from "@/lib/home-room-context";
import { INITIAL_ADD_FAST_ANALYSIS_MODE } from "@/lib/plant-analysis-pipeline";
import { cleanPlantName, cleanScientificName, commonNameFromScientificName } from "@/lib/plant-display";
import { plantCreationDiagnosticFromError, type PlantCreationDiagnostic, type PlantCreationStage } from "@/lib/plant-save-diagnostics";
import { PhotoStorageRepository } from "@/lib/photo-storage";
import { shouldShowRescueEntry } from "@/lib/rescue-entry";
import { isStillLearningSpecies, speciesLearningStateFromAnalysis } from "@/lib/species-learning";
import { useScreenWakeLock } from "@/lib/use-screen-wake-lock";
import { MultiPhotoPicker, PhotoPickerDebugPanel, type PhotoPickerDiagnostic } from "./MultiPhotoPicker";
import { PhotoBatchReview } from "./PhotoBatchReview";
import { PhotoImage } from "./PhotoImage";
import { LocationPicker } from "./LocationPicker";
import { RoomPicker } from "./RoomPicker";
import type { PendingPhotoUpload } from "./photo-upload-types";
import type { Plant } from "@/types/plant";

type Step = "pick" | "pick_more" | "review" | "analysis" | "confirm" | "details";
type ConfirmationPicker = "room" | null;
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

type RestoredDraftResult =
  | { status: "none" }
  | { status: "restored"; draft: AddPlantDraft; photos: PendingPhotoUpload[] }
  | { status: "failed"; message: string; photos: PendingPhotoUpload[] };

const isAnalysisPerformancePanelEnabled = process.env.NEXT_PUBLIC_DEBUG_ANALYSIS === "true";
const performanceRows: { label: string; reportLabel: string; key: keyof AddPlantPerformanceSummary["stages"] }[] = [
  { label: "Image loading", reportLabel: "Decode", key: "image_loading" },
  { label: "EXIF", reportLabel: "EXIF", key: "exif_reading" },
  { label: "Rotation", reportLabel: "Rotation", key: "rotation_correction" },
  { label: "Normalization", reportLabel: "Normalize", key: "image_normalization" },
  { label: "Canvas resize", reportLabel: "Canvas", key: "canvas_resize" },
  { label: "JPEG compression", reportLabel: "Compress", key: "jpeg_encoding" },
  { label: "IndexedDB", reportLabel: "IndexedDB", key: "indexeddb_write" },
  { label: "Payload creation", reportLabel: "Payload", key: "request_payload_creation" },
  { label: "Network upload", reportLabel: "Upload", key: "network_upload" },
  { label: "AI response", reportLabel: "AI", key: "ai_response_latency" },
  { label: "Response parsing", reportLabel: "Parse", key: "response_parsing" },
  { label: "UI render", reportLabel: "Render", key: "ui_render_after_response" },
  { label: "Plant persistence", reportLabel: "Persist", key: "plant_persistence" },
  { label: "Detail opened", reportLabel: "Detail", key: "time_until_detail_open" },
  { label: "Recommendation enrichment", reportLabel: "Enrich", key: "recommendation_enrichment_latency" },
  { label: "Enrichment persistence", reportLabel: "EnrichPersist", key: "recommendation_enrichment_persistence" }
];

const analysisStageCount = 4;
const analysisRequestTargetBytes = 3 * 1024 * 1024;
const analysisCompressionQualities = [0.82, 0.78, 0.75, 0.7, 0.66, 0.62];
const maxSelectedPhotos = 3;
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

async function restoreAddPlantDraft(): Promise<RestoredDraftResult> {
  const draft = loadAddPlantDraft();
  if (!draft) {
    return { status: "none" };
  }

  const restoredPhotos: PendingPhotoUpload[] = [];
  for (const photo of draft.selectedPhotos) {
    const blob = await PhotoStorageRepository.getPhoto(photo.storageId).catch(() => null);
    if (!blob) {
      continue;
    }

    restoredPhotos.push({
      ...photo,
      url: URL.createObjectURL(blob)
    });
  }

  if (!restoredPhotos.length) {
    return {
      status: "failed",
      message: "temporary_photos_missing",
      photos: []
    };
  }

  return {
    status: "restored",
    draft,
    photos: restoredPhotos
  };
}

function revokePhotoObjectUrls(photos: PendingPhotoUpload[]) {
  photos.forEach((photo) => {
    if (photo.url.startsWith("blob:")) {
      URL.revokeObjectURL(photo.url);
    }
  });
}

function durationFromTrace(trace: unknown, startStage: string, endStage: string) {
  if (!Array.isArray(trace)) return null;
  const start = trace.find((event) => event && typeof event === "object" && (event as { stage?: unknown }).stage === startStage) as { at?: unknown } | undefined;
  const end = trace.find((event) => event && typeof event === "object" && (event as { stage?: unknown }).stage === endStage) as { at?: unknown } | undefined;
  if (typeof start?.at !== "string" || typeof end?.at !== "string") return null;
  const startedAt = new Date(start.at).getTime();
  const endedAt = new Date(end.at).getTime();
  return Number.isFinite(startedAt) && Number.isFinite(endedAt) && endedAt >= startedAt ? endedAt - startedAt : null;
}

function stageValue(summary: AddPlantPerformanceSummary, key: keyof AddPlantPerformanceSummary["stages"]) {
  return typeof summary.stages[key] === "number" ? `${summary.stages[key]} ms` : "—";
}

function readableStageName(stage: string) {
  return performanceRows.find((row) => row.key === stage)?.label ?? stage;
}

function buildPerformanceReport(summary: AddPlantPerformanceSummary) {
  return [
    "Add Plant Performance",
    "",
    `Photos: ${summary.photos}`,
    "",
    ...performanceRows.map((row) => `${row.reportLabel}: ${summary.stages[row.key] ?? "—"}`),
    "",
    `TOTAL: ${summary.totalMs}`,
    "",
    "Bottleneck:",
    `${readableStageName(summary.bottleneckStage)} (${summary.bottleneckPercent}%)`
  ].join("\n");
}

function AnalysisPerformancePanel({ summary }: { summary: AddPlantPerformanceSummary | null }) {
  if (!isAnalysisPerformancePanelEnabled || !summary) {
    return null;
  }

  const copyReport = () => {
    void navigator.clipboard?.writeText(buildPerformanceReport(summary));
  };

  return (
    <details className="mt-5 rounded-[20px] bg-white/80 p-3 text-left shadow-soft">
      <summary className="cursor-pointer select-none font-rounded text-base font-extrabold text-[#3f3b35]">⚙️ Analysis Performance</summary>
      <div className="mt-3 grid gap-2 text-sm font-bold leading-5 text-[#5f594f]">
        <div className="flex items-center justify-between gap-3">
          <span>Photos</span>
          <span className="text-[#3f3b35]">{summary.photos}</span>
        </div>
        {performanceRows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-3 border-t border-[#eee7dc] pt-2">
            <span>{row.label}</span>
            <span className="text-[#3f3b35]">{stageValue(summary, row.key)}</span>
          </div>
        ))}
        <div className="mt-2 border-t border-[#d8cfc1] pt-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-extrabold text-[#3f3b35]">TOTAL</span>
            <span className="font-extrabold text-[#3f3b35]">{summary.totalMs} ms</span>
          </div>
          <div className="mt-3 grid gap-1 rounded-[16px] bg-[#fff8e8] p-3">
            <p className="text-xs font-black uppercase tracking-[0.08em] text-[#a0783e]">Slowest stage</p>
            <p className="font-extrabold text-[#3f3b35]">{readableStageName(summary.bottleneckStage)}</p>
            <p>Time: {summary.bottleneckMs} ms</p>
            <p>Share: {summary.bottleneckPercent}%</p>
          </div>
        </div>
        <button type="button" onClick={copyReport} className="mt-2 min-h-10 rounded-[16px] bg-[#ddf2dc] px-3 text-sm font-extrabold text-[#2d7a4f]">
          Copy report
        </button>
      </div>
    </details>
  );
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

type PreparedAnalysisImage = Awaited<ReturnType<typeof prepareImageForAnalysis>>;

async function prepareCompressedImageForAnalysis(blob: Blob, fileName: string, quality: number) {
  const normalized = await normalizeImageBlob(blob, { maxSide: 1600, qualities: [quality] });
  return prepareImageForAnalysis(normalized.blob, fileName);
}

export function AddPlantWizard({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale, t } = useI18n();
  const { addPlant, homes, plants, rooms, status, userId } = usePlantStore();
  const [draftId, setDraftId] = useState(() => createAddPlantDraftId());
  const [analysisRequestId, setAnalysisRequestId] = useState<string | null>(null);
  const [isDraftRestored, setIsDraftRestored] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
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
  const [homeId, setHomeId] = useState<string | undefined>();
  const [roomId, setRoomId] = useState<string | undefined>();
  const [positionInRoom, setPositionInRoom] = useState<Plant["positionInRoom"]>();
  const [roomKey, setRoomKey] = useState<string | undefined>();
  const [activePicker, setActivePicker] = useState<ConfirmationPicker>(null);
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
  const [performanceSummary, setPerformanceSummary] = useState<AddPlantPerformanceSummary | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [analysisAttempt, setAnalysisAttempt] = useState(0);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const nicknameInputRef = useRef<HTMLInputElement>(null);
  const generatedNicknameRef = useRef<string | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const latestDraftRef = useRef<AddPlantDraft | null>(null);
  const activeAnalysisRequestIdRef = useRef<string | null>(null);
  const discardedDraftRef = useRef(false);
  const didApplyDefaultLocationRef = useRef(false);
  const frozenAnalysisContextRef = useRef({ homes, rooms, speciesName });
  const ensureSuggestedNicknameRef = useRef<() => string>(() => "");
  const wakeLockDiagnostic = useScreenWakeLock(step === "analysis");

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

  useEffect(() => {
    if (!isAnalysisPerformancePanelEnabled) {
      return;
    }

    setPerformanceSummary(getLastAddPlantPerformanceSummary());
    const handleSummary = (event: Event) => {
      setPerformanceSummary((event as CustomEvent<AddPlantPerformanceSummary>).detail ?? getLastAddPlantPerformanceSummary());
    };
    window.addEventListener(addPlantPerformanceSummaryEvent, handleSummary);

    return () => {
      window.removeEventListener(addPlantPerformanceSummaryEvent, handleSummary);
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    async function restoreDraft() {
      const result = await restoreAddPlantDraft();
      if (disposed) {
        return;
      }

      if (result.status === "none") {
        setIsDraftRestored(true);
        return;
      }

      if (result.status === "failed") {
        setRestoreMessage(result.message);
        setStep("pick");
        clearAddPlantDraft();
        setIsDraftRestored(true);
        return;
      }

      const { draft, photos } = result;
      setDraftId(draft.draftId);
      setSelectedPhotos(photos);
      setHomeName(draft.identifiedPlantDraft.homeName);
      generatedNicknameRef.current = draft.identifiedPlantDraft.homeName || generatedNicknameRef.current;
      setHomeId(draft.identifiedPlantDraft.homeId);
      setSpeciesName(draft.identifiedPlantDraft.speciesName);
      setScientificName(draft.identifiedPlantDraft.scientificName);
      setRoomId(draft.identifiedPlantDraft.roomId);
      setRoomKey(draft.identifiedPlantDraft.roomKey);

      if (draft.analysisResult) {
        const restoredAnalysis = {
          ...(draft.analysisResult as PlantAnalysis),
          rawResult: (draft.analysisResult as PlantAnalysis).rawResult ?? draft.analysisResult
        };
        setAnalysis(restoredAnalysis);
        setAnalysisFailed(false);
        setAnalysisFailureKind(null);
        setStep("confirm");
      } else if (draft.step === "analysis" || draft.analysisStatus === "preparing" || draft.analysisStatus === "requesting") {
        setAnalysisFailed(true);
        setAnalysisFailureKind("technical");
        setAnalysisErrorCode("analysis_interrupted");
        setRestoreMessage("analysis_interrupted");
        setStep("confirm");
      } else {
        setStep(draft.step === "pick" || draft.step === "pick_more" ? "review" : draft.step);
      }

      setAnalysisRequestId(null);
      activeAnalysisRequestIdRef.current = null;
      setIsDraftRestored(true);
      logAddPlantDebug("add_plant_draft_restored", {
        draftId: draft.draftId,
        restoredPhotoCount: photos.length,
        restoredStep: draft.step,
        analysisStatus: draft.analysisStatus,
        hasAnalysisResult: Boolean(draft.analysisResult)
      });
    }

    void restoreDraft();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!isDraftRestored || didApplyDefaultLocationRef.current || homeId || roomId || roomKey) {
      return;
    }

    didApplyDefaultLocationRef.current = true;
    const defaultLocation = deriveAddPlantDefaultLocation({
      homes,
      rooms,
      plants,
      lastUsedHomeId: window.localStorage.getItem(lastUsedAddPlantHomeStorageKey),
      lastUsedRoomId: window.localStorage.getItem(lastUsedAddPlantRoomStorageKey),
      activeHomeId: userId ? window.localStorage.getItem(`${selectedHomeStoragePrefix}${userId}`) : null
    });
    setHomeId(defaultLocation.homeId);
    setRoomId(defaultLocation.roomId);
    setRoomKey(defaultLocation.roomId);
  }, [homeId, homes, isDraftRestored, plants, roomId, roomKey, rooms, userId]);

  useEffect(() => {
    if (!isDraftRestored || discardedDraftRef.current) {
      return;
    }

    if (!selectedPhotos.length && step === "pick") {
      return;
    }

    const analysisStatus =
      step === "analysis"
        ? analysisRequestId
          ? "requesting"
          : "preparing"
        : analysis
          ? "completed"
          : analysisFailed
            ? "failed"
            : "idle";
    const draft: AddPlantDraft = {
      draftId,
      step,
      selectedPhotos,
      analysisStatus,
      analysisRequestId,
      analysisStartedAt: step === "analysis" ? new Date().toISOString() : null,
      analysisResult: analysis,
      analysisError: analysisErrorCode,
      identifiedPlantDraft: {
        homeName,
        homeId,
        speciesName,
        scientificName,
        roomKey,
        roomId
      },
      updatedAt: new Date().toISOString()
    };

    latestDraftRef.current = draft;
    saveAddPlantDraft(draft);
  }, [analysis, analysisErrorCode, analysisFailed, analysisRequestId, draftId, homeId, homeName, isDraftRestored, roomId, roomKey, scientificName, selectedPhotos, speciesName, step]);

  useEffect(() => {
    const persistLatestDraft = () => {
      if (latestDraftRef.current && !discardedDraftRef.current) {
        saveAddPlantDraft(latestDraftRef.current);
      }
    };
    window.addEventListener("pagehide", persistLatestDraft);
    window.addEventListener("pageshow", persistLatestDraft);
    window.addEventListener("freeze", persistLatestDraft);
    window.addEventListener("resume", persistLatestDraft);
    document.addEventListener("visibilitychange", persistLatestDraft);

    return () => {
      window.removeEventListener("pagehide", persistLatestDraft);
      window.removeEventListener("pageshow", persistLatestDraft);
      window.removeEventListener("freeze", persistLatestDraft);
      window.removeEventListener("resume", persistLatestDraft);
      document.removeEventListener("visibilitychange", persistLatestDraft);
    };
  }, []);

  const generateNicknameOnce = useCallback((extraExistingNames: string[] = []) => {
    const existingNames = [...plants.map((plant) => plant.homeName ?? ""), ...extraExistingNames];
    const nickname = suggestedNickname(locale, existingNames);
    generatedNicknameRef.current = nickname;
    return nickname;
  }, [locale, plants]);

  const ensureSuggestedNickname = useCallback(() => generatedNicknameRef.current ?? generateNicknameOnce(), [generateNicknameOnce]);

  useEffect(() => {
    ensureSuggestedNicknameRef.current = ensureSuggestedNickname;
  }, [ensureSuggestedNickname]);

  useEffect(() => {
    if (step !== "analysis") {
      frozenAnalysisContextRef.current = { homes, rooms, speciesName };
    }
  }, [homes, rooms, speciesName, step]);

  const cleanupTemporaryPhotos = useCallback(async (photos: PendingPhotoUpload[]) => {
    await Promise.allSettled(photos.map((photo) => PhotoStorageRepository.deletePhoto(photo.storageId)));
  }, []);

  const discardAddPlant = useCallback(() => {
    discardedDraftRef.current = true;
    analysisAbortRef.current?.abort();
    clearAddPlantDraft();
    revokePhotoObjectUrls(selectedPhotos);
    void cleanupTemporaryPhotos(selectedPhotos);
    setSelectedPhotos([]);
    setIsCancelConfirmOpen(false);
    onClose();
  }, [cleanupTemporaryPhotos, onClose, selectedPhotos]);

  const cancelAddPlant = useCallback(() => {
    if (selectedPhotos.length) {
      setIsCancelConfirmOpen(true);
      return;
    }

    onClose();
  }, [onClose, selectedPhotos.length]);

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
    const abortController = new AbortController();
    const requestId = createAnalysisRequestId();
    const analysisContext = frozenAnalysisContextRef.current;
    activeAnalysisRequestIdRef.current = requestId;
    setAnalysisRequestId(requestId);
    analysisAbortRef.current = abortController;
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
      let finalRequestPayloadSize = 0;
      const preparationStartedAt = Date.now();
      let uploadToken: ReturnType<typeof startAddPlantPerformanceStage> | null = null;
      try {
        const formData = new FormData();
        const nextPreparationDiagnostics: ClientImagePreparationDiagnostic[] = [];
        const preparedItems: {
          photo: PendingPhotoUpload;
          blob: Blob;
          fileName: string;
          diagnostic: ClientImagePreparationDiagnostic;
          preparedImage: PreparedAnalysisImage;
        }[] = [];
        let totalOutgoingRequestSize = 0;

        for (const photo of selectedPhotos.slice(0, maxSelectedPhotos)) {
          if (abortController.signal.aborted) {
            throw new DOMException("Analysis cancelled", "AbortError");
          }

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
              if (abortController.signal.aborted) {
                throw new DOMException("Analysis cancelled", "AbortError");
              }
              preparedImage = await prepareImageForAnalysis(blob, fileName);
              if (abortController.signal.aborted) {
                throw new DOMException("Analysis cancelled", "AbortError");
              }
            } catch {
              if (abortController.signal.aborted) {
                throw new DOMException("Analysis cancelled", "AbortError");
              }
              diagnostic.errorCode = "image_preparation_failed";
              diagnostic.errorName = "Error";
              diagnostic.errorMessage = "image_preparation_failed";
              setClientPreparationDiagnostics(nextPreparationDiagnostics);
              throw new Error("image_preparation_failed");
            }

            totalOutgoingRequestSize += preparedImage.file.size;
            diagnostic.compressedSize = preparedImage.file.size;
            diagnostic.originalWidth = preparedImage.originalWidth;
            diagnostic.originalHeight = preparedImage.originalHeight;
            diagnostic.finalWidth = preparedImage.finalWidth;
            diagnostic.finalHeight = preparedImage.finalHeight;
            diagnostic.exifOrientation = preparedImage.exifOrientation;
            diagnostic.orientationSource = preparedImage.orientationSource;
            diagnostic.physicallyRotated = preparedImage.physicallyRotated;
            preparedItems.push({ photo, blob, fileName, diagnostic, preparedImage });
          }
        }

        if (totalOutgoingRequestSize > analysisRequestTargetBytes) {
          let adaptiveItems = preparedItems;
          let adaptiveTotalSize = totalOutgoingRequestSize;

          for (const quality of analysisCompressionQualities.slice(1)) {
            if (abortController.signal.aborted) {
              throw new DOMException("Analysis cancelled", "AbortError");
            }

            const nextItems: typeof preparedItems = [];
            let nextTotalSize = 0;
            for (const item of preparedItems) {
              if (abortController.signal.aborted) {
                throw new DOMException("Analysis cancelled", "AbortError");
              }

              const preparedImage = await prepareCompressedImageForAnalysis(item.blob, item.fileName, quality);
              nextTotalSize += preparedImage.file.size;
              nextItems.push({ ...item, preparedImage });
            }

            adaptiveItems = nextItems;
            adaptiveTotalSize = nextTotalSize;
            if (nextTotalSize <= analysisRequestTargetBytes) {
              break;
            }
          }

          preparedItems.splice(0, preparedItems.length, ...adaptiveItems);
          totalOutgoingRequestSize = adaptiveTotalSize;
        }
        finalRequestPayloadSize = totalOutgoingRequestSize;

        if (totalOutgoingRequestSize > analysisRequestTargetBytes) {
          nextPreparationDiagnostics.forEach((diagnostic) => {
            diagnostic.totalOutgoingRequestSize = totalOutgoingRequestSize;
            diagnostic.errorCode = "image_preparation_failed";
            diagnostic.errorName = "Error";
            diagnostic.errorMessage = "analysis_request_too_large";
          });
          setClientPreparationDiagnostics(nextPreparationDiagnostics);
          throw new Error("image_preparation_failed");
        }

        const payloadToken = startAddPlantPerformanceStage("request_payload_creation", {
          selectedPhotos: selectedPhotos.length,
          maxSelectedPhotos,
          finalRequestPayloadSize: totalOutgoingRequestSize
        });
        for (const item of preparedItems) {
          const { photo, diagnostic, preparedImage } = item;
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
        endAddPlantPerformanceStage(payloadToken, {
          finalRequestPayloadSize: totalOutgoingRequestSize,
          selectedPhotos: selectedPhotos.length,
          includedPhotos: preparedItems.length
        });

        nextPreparationDiagnostics.forEach((diagnostic) => {
          diagnostic.totalOutgoingRequestSize = totalOutgoingRequestSize;
        });
        setClientPreparationDiagnostics(nextPreparationDiagnostics);
        logAddPlantDebug("Plant analysis client images prepared", {
          requestId,
          preparationDurationMs: Date.now() - preparationStartedAt,
          totalOutgoingRequestSize,
          images: nextPreparationDiagnostics
        });

        formData.append("locale", locale);
        formData.append("analysisMode", INITIAL_ADD_FAST_ANALYSIS_MODE);
        const selectedRoom = roomKey && !roomKey.startsWith("rooms.") ? analysisContext.rooms.find((room) => room.id === roomKey) : undefined;
        const environmentContext = buildPlantEnvironmentContext({
          plant: selectedRoom
            ? {
                id: "new-plant",
                homeId: selectedRoom.homeId,
                roomId: selectedRoom.id,
                speciesName: analysisContext.speciesName,
                status: "unknown",
                messageKey: "plants.new.message",
                statusLabelKey: "status.doingGreat",
                careScheduleStatus: "active",
                notificationEnabled: true
              }
            : undefined,
          homes: analysisContext.homes,
          rooms: analysisContext.rooms,
          legacyRoomName: selectedRoom ? selectedRoom.name : undefined
        });
        formData.append("environmentContext", formatEnvironmentContextForPrompt(environmentContext));
        requestStartedAt = Date.now();
        uploadToken = startAddPlantPerformanceStage("network_upload", {
          finalRequestPayloadSize: totalOutgoingRequestSize,
          selectedPhotos: selectedPhotos.length,
          note: "fetch duration includes upload, server analysis wait, and response headers"
        });
        const response = await fetch("/api/analyze-plant", {
          method: "POST",
          body: formData,
          signal: abortController.signal
        });
        endAddPlantPerformanceStage(uploadToken, {
          httpStatus: response.status
        });
        uploadToken = null;
        httpStatus = response.status;
        const parseToken = startAddPlantPerformanceStage("response_parsing", {
          httpStatus
        });
        const payload = await response.json();
        endAddPlantPerformanceStage(parseToken, {
          ok: Boolean(payload?.ok),
          hasAnalysis: Boolean(payload?.analysis)
        });
        const aiDurationMs = durationFromTrace(payload?.trace, "openai_request_started", "openai_response_received");
        if (aiDurationMs != null) {
          recordAddPlantPerformanceStage("ai_response_latency", aiDurationMs, {
            model: payload?.model ?? "unknown",
            imageCount: preparedItems.length
          });
        }
        const requestDurationMs = Date.now() - requestStartedAt;
        if (activeAnalysisRequestIdRef.current !== requestId || discardedDraftRef.current) {
          logAddPlantDebug("Plant analysis stale response ignored", {
            requestId,
            activeRequestId: activeAnalysisRequestIdRef.current,
            discarded: discardedDraftRef.current
          });
          return;
        }
        nextPreparationDiagnostics.forEach((diagnostic) => {
          diagnostic.requestDurationMs = requestDurationMs;
          diagnostic.httpStatus = httpStatus;
        });
        setClientPreparationDiagnostics(nextPreparationDiagnostics);
        logAddPlantDebug("Plant analysis request completed", {
          requestId,
          status: httpStatus,
          durationMs: requestDurationMs,
          totalDurationMs: Date.now() - preparationStartedAt,
          totalOutgoingRequestSize,
          images: nextPreparationDiagnostics
        });

        if (payload.diagnostics && process.env.NODE_ENV !== "production") {
          setAnalysisDiagnostics(payload.diagnostics);
        }

        if (!response.ok || !payload.ok) {
          console.warn("Plant analysis API failure", {
            status: httpStatus,
            stage: payload.stage ?? null,
            error: payload.error ?? null,
            originalError: payload.originalError ?? null,
            trace: payload.trace ?? null
          });
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
        const renderToken = startAddPlantPerformanceStage("ui_render_after_response", {
          condition: nextAnalysis.condition,
          confidence: nextAnalysis.confidence
        });
        window.requestAnimationFrame(() => {
          endAddPlantPerformanceStage(renderToken, {
            step: "analysis",
            nextStep: "confirm"
          });
        });
        const nextScientificName = cleanScientificName(nextAnalysis.scientificName);
        const nextSpeciesName = localizedCommonName(nextAnalysis, locale) || commonNameFromScientificName(nextScientificName);
        setSpeciesName(nextSpeciesName);
        setScientificName(nextScientificName);
        setHomeName((current) => current || ensureSuggestedNicknameRef.current());
      } catch (error) {
        if (uploadToken) {
          endAddPlantPerformanceStage(uploadToken, {
            ok: false,
            error: error instanceof Error ? error.message : "network_or_analysis_failed"
          });
          uploadToken = null;
        }
        if (activeAnalysisRequestIdRef.current !== requestId || discardedDraftRef.current) {
          return;
        }

        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

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
        const isCurrentRequest = activeAnalysisRequestIdRef.current === requestId && !discardedDraftRef.current;
        if (isMounted && isCurrentRequest) {
          setHomeName((current) => current || ensureSuggestedNicknameRef.current());
          if (!abortController.signal.aborted) {
            await finishAnalysisSheet();
          }
          logAddPlantPerformanceSummary({
            selectedPhotos: selectedPhotos.length,
            finalRequestPayloadSize,
            stage: "analysis_complete"
          });
        }
        if (activeAnalysisRequestIdRef.current === requestId) {
          activeAnalysisRequestIdRef.current = null;
          setAnalysisRequestId(null);
        }
      }
    }

    void analyzePhotos();

    return () => {
      isMounted = false;
      abortController.abort();
      stageTimers.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(longAnalysisTimer);
      if (analysisAbortRef.current === abortController) {
        analysisAbortRef.current = null;
      }
      if (activeAnalysisRequestIdRef.current === requestId) {
        activeAnalysisRequestIdRef.current = null;
      }
    };
  }, [analysisAttempt, locale, roomKey, selectedPhotos, step]);

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
    t("addPlant.preparingPhotos"),
    t("addPlant.identifying"),
    t("addPlant.checking"),
    t("addPlant.preparing")
  ];

  if (!isDraftRestored) {
    return (
      <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#1c1c1e]/20 px-4 pb-4 backdrop-blur-[2px] sm:items-center sm:pb-0">
        <div role="status" aria-live="polite" className="w-full max-w-[390px] rounded-[28px] bg-[#fffaf3] p-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.16)]">
          <Loader2 aria-hidden="true" size={22} className="mx-auto animate-spin text-[#6ba369]" />
          <p className="mt-3 font-rounded text-xl font-extrabold text-ink">{t("addPlant.restoring")}</p>
        </div>
      </div>
    );
  }

  if (step === "pick") {
    return (
      <MultiPhotoPicker
        title={t("addPlant.title")}
        onCancel={cancelAddPlant}
        onSelect={appendSelectedPhotos}
        debugEnabled={isPhotoPickerDebugEnabled}
        selectedPhotosCount={selectedPhotos.length}
        maxPhotos={maxSelectedPhotos}
        limitMessage={t("addPlant.initialPhotoLimitMessage")}
        helperMessage={restoreMessage === "temporary_photos_missing" ? t("addPlant.restorePhotosMissing") : null}
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
        maxPhotos={maxSelectedPhotos}
        limitMessage={t("addPlant.initialPhotoLimitMessage")}
        helperMessage={null}
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
          <p className="mt-2 text-sm font-bold leading-5 text-[#7a6f61]">{t("addPlant.photoCounter", { count: selectedPhotos.length, max: maxSelectedPhotos })}</p>
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
          {showLongAnalysisHint ? <p className="mt-5 text-sm font-bold leading-5 text-[#7a6f61]">{t("addPlant.analysisLongCalm")}</p> : null}
          {process.env.NODE_ENV !== "production" ? (
            <p className="mt-3 rounded-[14px] bg-white/70 p-3 text-left text-[11px] font-bold leading-5 text-[#5f594f]">
              wakeLock: supported {String(wakeLockDiagnostic.wakeLockSupported)}, requested {String(wakeLockDiagnostic.wakeLockRequested)}, acquired {String(wakeLockDiagnostic.wakeLockAcquired)}, released {String(wakeLockDiagnostic.wakeLockReleased)}, reason {wakeLockDiagnostic.wakeLockReleaseReason ?? "none"}, reacquire {String(wakeLockDiagnostic.wakeLockReacquireAttempted)}, visibility {wakeLockDiagnostic.visibilityState}, mode {wakeLockDiagnostic.mode}
              {wakeLockDiagnostic.wakeLockError ? `, error ${wakeLockDiagnostic.wakeLockError.name}: ${wakeLockDiagnostic.wakeLockError.message}` : ""}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              analysisAbortRef.current?.abort();
              setStep("review");
            }}
            className="mt-5 min-h-12 w-full rounded-[18px] bg-white px-4 text-sm font-extrabold text-[#5f594f]"
          >
            {t("addPlant.cancelAnalysis")}
          </button>
        </div>
      </div>
    );
  }

  const coverPhoto = selectedPhotos.find((photo) => photo.isCover) ?? selectedPhotos[0];
  const selectedHomeName = homeId ? homes.find((home) => home.id === homeId)?.name ?? t("homeContext.noHome") : t("homeContext.noHome");
  const selectedRoomName = roomId
    ? rooms.find((room) => room.id === roomId)?.name ?? t("addPlant.noRoomSelected")
    : roomKey
      ? roomKey.startsWith("rooms.")
        ? t(roomKey as never)
        : rooms.find((room) => room.id === roomKey)?.name ?? t("addPlant.noRoomSelected")
      : t("addPlant.noRoomSelected");
  const shouldExplainFirstHome = homes.length === 0;
  const displayCommonName = cleanPlantName(speciesName) || commonNameFromScientificName(scientificName) || t("plants.unknownName");
  const displayScientificName = cleanScientificName(scientificName);
  const speciesLearningState = speciesLearningStateFromAnalysis(
    analysis
      ? {
          id: "pending-analysis",
          plantId: "pending-plant",
          condition: analysis.condition,
          nextAction: analysis.nextAction === "none" ? null : analysis.nextAction,
          recommendations: Array.isArray(analysis.recommendations) ? analysis.recommendations : [],
          rawResult: analysis.rawResult as never,
          createdAt: new Date().toISOString()
        }
      : null
  );
  const speciesStillLearning = isStillLearningSpecies(speciesLearningState);
  const rescueEntryActive = shouldShowRescueEntry({ analysis, commonName: speciesName, scientificName });
  const isTechnicalAnalysisFailure = analysisFailed && analysisFailureKind === "technical";
  const isLowConfidenceAnalysis = Boolean(analysis && analysis.confidence < 0.55);
  const confirmationPresentation = deriveAddPlantConfirmationPresentation({
    displayCommonName,
    hasAnalysis: Boolean(analysis),
    isTechnicalFailure: isTechnicalAnalysisFailure,
    isRecoveryEligible: rescueEntryActive,
    speciesLearningState
  });
  const confirmationTitle = confirmationPresentation.titleKey ? t(confirmationPresentation.titleKey) : confirmationPresentation.titleText ?? displayCommonName;
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

  const openPicker = (picker: ConfirmationPicker) => {
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
    let persistenceToken: ReturnType<typeof startAddPlantPerformanceStage> | null = null;
    logAddPlantDebug("plant_submit_started", {
      photoCount: selectedPhotos.length,
      hasRoom: Boolean(roomKey),
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
        homeId,
        roomId,
        roomKey,
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
      const savedCommonName = cleanPlantName(speciesName) || commonNameFromScientificName(displayScientificName) || (speciesStillLearning ? t("addPlant.learningPlantName") : "");
      if (!savedCommonName && !displayScientificName && (analysisFailed || rescueEntryActive)) {
        const shouldSaveManualPlant = window.confirm(t("addPlant.manualEmptyConfirm"));
        if (!shouldSaveManualPlant) {
          setSubmitError(t("addPlant.manualNameRequired"));
          setIsSaving(false);
          return;
        }
      }
      activeSaveStage = "create_plant";
      persistenceToken = startAddPlantPerformanceStage("plant_persistence", {
        selectedPhotos: selectedPhotos.length,
        hasAnalysis: Boolean(analysis)
      });
      const plantId = await addPlant({
        homeName: savedNickname,
        homeId,
        speciesName: savedCommonName,
        scientificName: displayScientificName || undefined,
        roomKey: roomId ?? roomKey,
        roomId,
        positionInRoom,
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
      endAddPlantPerformanceStage(persistenceToken, {
        plantId,
        ok: true
      });
      persistenceToken = null;
      savedPlantId = plantId;
      rememberAddPlantLocation({ homeId, roomId });
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
      clearAddPlantDraft();
      discardedDraftRef.current = true;
      revokePhotoObjectUrls(selectedPhotos);
      recordAddPlantPerformanceStage("time_until_detail_open", 0, { plantId });
      router.push(`/plants/${plantId}`);
      router.refresh();
      logAddPlantDebug("modal_close_started", { plantId });
      onClose();
    } catch (error) {
      if (persistenceToken) {
        endAddPlantPerformanceStage(persistenceToken, {
          ok: false,
          stage: activeSaveStage,
          message: error instanceof Error ? error.message : "plant_save_failed"
        });
      }
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
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-[calc(env(safe-area-inset-top)+20px)] sm:pt-5">
          <h2 className="font-rounded text-2xl font-extrabold text-ink">{t("addPlant.title")}</h2>
          {step === "confirm" || step === "details" ? (
            <button type="button" onClick={cancelAddPlant} aria-label={t("settings.close")} className="flex size-11 items-center justify-center rounded-2xl bg-white text-[#7d776b]">
              <X aria-hidden="true" size={18} />
            </button>
          ) : null}
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
          {step === "confirm" && isTechnicalAnalysisFailure ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setStep("review")} className="min-h-10 rounded-[16px] bg-white/75 px-2 text-xs font-extrabold text-[#5f594f]">
                {t("addPlant.backToPhotos")}
              </button>
              <button type="button" onClick={retryAnalysis} className="min-h-10 rounded-[16px] bg-[#ddf2dc] px-2 text-xs font-extrabold text-[#2d7a4f]">
                {t("addPlant.retryAnalysis")}
              </button>
            </div>
          ) : null}
          {analysisFailed ? (
            <p className="mt-4 rounded-[18px] bg-[#fff1d8] p-3 text-sm font-bold leading-5 text-[#8a6230]">
              {restoreMessage === "analysis_interrupted" ? t("addPlant.analysisInterrupted") : t("addPlant.analysisFailed")}
            </p>
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
              <h3 className="font-rounded text-[30px] font-black leading-tight text-ink">{confirmationTitle}</h3>
              {displayScientificName ? <p className="mt-1 text-sm italic leading-5 text-[#8e867b]">{displayScientificName}</p> : null}
              {confirmationPresentation.speciesDescriptionKey ? (
                <p className="mt-2 text-sm font-bold leading-5 text-[#7a7166]">{t(confirmationPresentation.speciesDescriptionKey)}</p>
              ) : null}
              {rescueEntryActive ? (
                <div className="mt-4 rounded-[22px] bg-[#fff8e8] p-4">
                  <p className="font-rounded text-lg font-extrabold text-[#8a6230]">{t("addPlant.rescueEntryTitle")}</p>
                  <p className="mt-2 text-sm font-bold leading-5 text-[#7a623d]">{t("addPlant.rescueEntryText")}</p>
                  {confirmationPresentation.speciesDescriptionKey ? <p className="mt-2 text-sm font-bold leading-5 text-[#7a623d]">{t("addPlant.recoverySpeciesStillLearning")}</p> : null}
                </div>
              ) : isLowConfidenceAnalysis && !speciesStillLearning ? (
                <div className="mt-4 rounded-[20px] bg-[#fff8e8] p-3">
                  <p className="font-rounded text-lg font-extrabold text-[#8a6230]">{t("addPlant.lowConfidenceTitle")}</p>
                  <p className="mt-1 text-sm font-bold leading-5 text-[#7a623d]">{t("addPlant.lowConfidenceText")}</p>
                </div>
              ) : null}
              {confirmationPresentation.showConditionSummary ? <div className="mt-4 rounded-[20px] bg-[#edf8ed] p-3">
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
                {shouldExplainFirstHome ? (
                  <p className="rounded-[18px] bg-white/70 p-3 text-sm font-bold leading-5 text-[#6f675d]">{t("addPlant.firstHomeHint")}</p>
                ) : null}
                <button type="button" onClick={() => openPicker("room")} className="rounded-[28px] bg-white/80 p-4 text-left">
                  <p className="text-xs font-bold uppercase text-[#a09a90]">{t("homeContext.home")}</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-[18px] font-extrabold leading-6 text-[#3f3b35]">{selectedHomeName}</p>
                    <span className="shrink-0 text-sm font-extrabold text-[#2d7a4f]">
                      {homeId ? t("addPlant.change") : t("addPlant.select")}
                    </span>
                  </div>
                </button>
                <button type="button" onClick={() => openPicker("room")} className="rounded-[28px] bg-white/80 p-4 text-left">
                  <p className="text-xs font-bold uppercase text-[#a09a90]">{t("homeContext.room")}</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-[18px] font-extrabold leading-6 text-[#3f3b35]">{selectedRoomName}</p>
                    <span className="shrink-0 text-sm font-extrabold text-[#2d7a4f]">
                      {roomId || roomKey ? t("addPlant.change") : t("addPlant.select")}
                    </span>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <>
              <button type="button" onClick={() => setStep("review")} className="mt-2 min-h-10 rounded-[16px] bg-white/75 px-3 text-sm font-extrabold text-[#5f594f]">
                {t("addPlant.backToPhotos")}
              </button>
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
          {(step === "confirm" || analysisFailed) ? <AnalysisPerformancePanel summary={performanceSummary} /> : null}
        </div>
        <div className="shrink-0 border-t border-[#efe6d8] bg-[#fffaf3] px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
          <button
            type="button"
            onClick={
              isTechnicalAnalysisFailure && step === "confirm"
                ? retryAnalysis
                : () => void save()
            }
            disabled={isSaving}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-gradient-to-br from-[#92cc90] to-[#6ba369] px-4 text-sm font-extrabold text-white shadow-fab disabled:opacity-60"
          >
            {isSaving ? <Loader2 aria-hidden="true" size={16} className="animate-spin" /> : null}
            {isSaving
              ? t("addPlant.saving")
              : isTechnicalAnalysisFailure && step === "confirm"
                ? t("addPlant.retryAnalysis")
                : t(confirmationPresentation.primaryActionKey)}
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
      {isCancelConfirmOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#1c1c1e]/25 px-4 pb-4 backdrop-blur-[2px] sm:items-center sm:pb-0">
          <div role="dialog" aria-modal="true" className="w-full max-w-[390px] rounded-[28px] bg-[#fffaf3] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.16)]">
            <h2 className="font-rounded text-2xl font-extrabold text-ink">{t("addPlant.cancelAddTitle")}</h2>
            <p className="mt-2 text-sm font-bold leading-5 text-[#6f675d]">{t("addPlant.cancelAddBody")}</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setIsCancelConfirmOpen(false)} className="min-h-12 rounded-[18px] bg-white px-4 text-sm font-extrabold text-[#5f594f]">
                {t("addPlant.continueAdding")}
              </button>
              <button type="button" onClick={discardAddPlant} className="min-h-12 rounded-[18px] bg-[#fdeaf0] px-4 text-sm font-extrabold text-[#9b2c3e]">
                {t("addPlant.cancelAdding")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {activePicker === "room" ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1c1c1e]/20 px-4 pb-4 backdrop-blur-[2px] sm:items-center sm:pb-0">
          <div role="dialog" aria-modal="true" className="w-full max-w-[390px] rounded-[28px] bg-[#fffaf3] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.16)]">
            <h2 className="font-rounded text-2xl font-extrabold text-ink">{t("addPlant.locationLabel")}</h2>
            {shouldExplainFirstHome ? <p className="mt-2 text-sm font-bold leading-5 text-[#6f675d]">{t("addPlant.firstHomeHint")}</p> : null}
            <div className="mt-5">
              <LocationPicker
                homeId={homeId}
                roomId={roomId}
                positionInRoom={positionInRoom}
                onChange={(value) => {
                  setHomeId(value.homeId);
                  setRoomId(value.roomId);
                  setRoomKey(value.roomId);
                  setPositionInRoom(value.positionInRoom);
                }}
              />
            </div>
            {homes.length === 0 ? (
              <div className="mt-4">
                <RoomPicker
                  value={roomKey}
                  onChange={(value) => {
                    setRoomKey(value);
                    setRoomId(undefined);
                    setActivePicker(null);
                  }}
                />
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setActivePicker(null)}
              className="mt-4 min-h-12 w-full rounded-[18px] bg-[#ddf2dc] px-4 text-sm font-extrabold text-[#2d7a4f]"
            >
              {t("common.done")}
            </button>
            <button
              type="button"
              onClick={() => {
                setHomeId(undefined);
                setRoomId(undefined);
                setPositionInRoom(undefined);
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
    </div>
  );
}
