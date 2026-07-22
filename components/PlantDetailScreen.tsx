"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePlantStore } from "@/data/PlantStore";
import { useI18n } from "@/i18n/I18nProvider";
import { addDays, toDateKey } from "@/lib/date-format";
import { recordAddPlantPerformanceStage } from "@/lib/add-plant-performance";
import { buildPlantEnvironmentContext, formatEnvironmentContextForPrompt } from "@/lib/home-room-context";
import { plantDisplayName } from "@/lib/plant-display";
import { deriveCareActionState } from "@/lib/plant-action-eligibility";
import { compareMilestonesNewestFirst } from "@/lib/milestone-dates";
import { logNavigationEvent, startNavigationLog } from "@/lib/navigation-performance";
import { PhotoStorageRepository } from "@/lib/photo-storage";
import { nextPostCreationClarificationStep } from "@/lib/post-creation-clarifications";
import { buildRecommendationContextSnapshot, changedContextSince, impactLabelKey, isRecommendationStale, isVisualEvidenceStale, reasonTypeFromChangedContext, sourceAnalysisAgeDays, type RecommendationChangedContext, type RecommendationContextSnapshot } from "@/lib/recommendation-refresh";
import { recommendationRefreshReducer, type RecommendationRefreshStatus } from "@/lib/recommendation-refresh-state";
import { RECOMMENDATION_PROMPT_VERSION, RECOMMENDATION_VERSION } from "@/lib/recommendation-version";
import { soilCheckResultFromClarificationAnswer } from "@/lib/soil-check-completion";
import { CareHistory } from "./CareHistory";
import { CareDateEditor } from "./CareDateEditor";
import { CareSummary } from "./CareSummary";
import { CheckSoilSheet } from "./CheckSoilSheet";
import { DeletePlantDialog } from "./DeletePlantDialog";
import { MilestoneEditor } from "./MilestoneEditor";
import { AnswerChips } from "./AnswerChips";
import { PhotoGallery } from "./PhotoGallery";
import { PhotoUploadFlow } from "./PhotoUploadFlow";
import { PlantAnalysisSection } from "./PlantAnalysisSection";
import { PlantDetailHeader } from "./PlantDetailHeader";
import { PlantHeroImage } from "./PlantHeroImage";
import { PlantNotificationControls } from "./PlantNotificationControls";
import { PlantStatusSection } from "./PlantStatusSection";
import { PrimaryCareAction } from "./PrimaryCareAction";
import { Toast } from "./Toast";
import type { PlantAnalysisRecord, PlantHypothesis, PlantHypothesisStatus, PlantPhoto, PlantRecommendationRevision, Room, SoilCheckResult } from "@/types/plant";
import type { PendingPhotoUpload } from "./photo-upload-types";

type Sheet = "check_soil" | "add_photo" | "add_event" | null;
const recommendationRefreshTimeoutMs = 45_000;
const sunlightOptions: NonNullable<Room["directSun"]>[] = ["none", "morning", "midday", "evening", "most_of_day", "unsure"];
type PhotoAssessmentState =
  | { status: "idle" }
  | { status: "analyzing" }
  | { status: "complete"; message: string; changes: string[] }
  | { status: "failed"; message: string; retryPhotos: PendingPhotoUpload[]; savedPhotos: PlantPhoto[] };

function localized(value: { en?: string | null; ru?: string | null } | undefined, locale: "en" | "ru") {
  return value?.[locale] || value?.en || value?.ru || "";
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

function photoAssessmentChanges(condition: string | undefined, locale: "en" | "ru") {
  if (condition === "needs_attention") {
    return locale === "ru"
      ? ["На новых фото есть признаки, которые стоит проверить."]
      : ["The new photos show signs worth checking."];
  }

  if (condition === "healthy") {
    return locale === "ru"
      ? ["Срочных проблем на новых фото не видно."]
      : ["No urgent issues are visible in the new photos."];
  }

  return locale === "ru"
    ? ["Фото сохранены. Для уверенного сравнения нужен похожий ракурс."]
    : ["Photos saved. A similar angle would help compare changes with confidence."];
}

function analysisWithRecommendationRevision(analysis: PlantAnalysisRecord | undefined, revision: PlantRecommendationRevision | undefined): PlantAnalysisRecord | undefined {
  if (!analysis || !revision) {
    return analysis;
  }

  const structured = revision.structuredResult ?? {};
  return {
    ...analysis,
    condition: typeof structured.condition === "string" ? (structured.condition as PlantAnalysisRecord["condition"]) : analysis.condition,
    nextAction: typeof structured.nextAction === "string" ? (structured.nextAction === "none" ? null : (structured.nextAction as PlantAnalysisRecord["nextAction"])) : analysis.nextAction,
    summary: structured.summary && typeof structured.summary === "object" ? (structured.summary as PlantAnalysisRecord["summary"]) : analysis.summary,
    recommendations: revision.recommendations.length ? revision.recommendations : analysis.recommendations,
    rawResult: {
      ...structured,
      visibleObservations: analysis.rawResult?.visibleObservations ?? structured.visibleObservations,
      photoComparison: analysis.rawResult?.photoComparison ?? structured.photoComparison,
      recommendationRevision: {
        id: revision.id,
        reasonType: revision.reasonType,
        reasonText: revision.reasonText,
        changedContext: revision.changedContext,
        promptVersion: revision.promptVersion,
        recommendationVersion: revision.recommendationVersion,
        impactLevel: revision.impactLevel,
        changeSummary: revision.changeSummary,
        refreshedAt: revision.createdAt
      }
    }
  };
}

function compactPreviousRecommendation(
  analysis: PlantAnalysisRecord | undefined,
  input: { previousContextSnapshot?: Record<string, unknown>; changedContext?: RecommendationChangedContext; reasonType?: string } = {}
) {
  return {
    status: analysis?.condition ?? null,
    keyConcerns: Array.isArray(analysis?.rawResult?.hypotheses)
      ? analysis.rawResult?.hypotheses?.slice(0, 3).map((item) => ({
          type: item.type,
          status: item.status,
          confidence: item.confidence
        }))
      : [],
    previousActions: analysis?.recommendations.slice(0, 4).map((item) => ({
      type: item.type,
      priority: item.priority,
      en: item.en,
      ru: item.ru
    })) ?? [],
    whatNotToDo: Array.isArray(analysis?.rawResult?.whatNotToDo) ? analysis.rawResult.whatNotToDo : [],
    confidence: typeof analysis?.rawResult?.confidence === "number" ? analysis.rawResult.confidence : null,
    visualEvidenceSnapshot: analysis?.rawResult?.visualEvidenceSnapshot ?? null,
    initialAnalysisMode: typeof analysis?.rawResult?.analysisMode === "string" ? analysis.rawResult.analysisMode : null,
    sourceAnalysis: analysis ? { id: analysis.id, createdAt: analysis.createdAt } : null,
    previousContextSnapshot: input.previousContextSnapshot ?? null,
    changedContext: input.changedContext ?? null,
    reasonType: input.reasonType ?? null
  };
}

function recommendationRefreshReason(
  changedContext: RecommendationChangedContext,
  currentSnapshot: RecommendationContextSnapshot,
  locale: "en" | "ru",
  t: (key: never) => string
) {
  if (changedContext.room.lightLevel && currentSnapshot.room?.lightLevel) {
    const light = t(`homeContext.light.${currentSnapshot.room.lightLevel}` as never);
    return locale === "ru"
      ? `Теперь совет точнее учитывает освещение рядом с растением: ${light}.`
      : `The advice now fits the light around this plant: ${light}.`;
  }

  if (changedContext.room.directSun && currentSnapshot.room?.directSun) {
    const sun = t(`homeContext.sun.${currentSnapshot.room.directSun}` as never);
    return locale === "ru"
      ? `Теперь понятнее, сколько прямого солнца получает растение: ${sun}.`
      : `The advice now reflects how much direct sun reaches this plant: ${sun}.`;
  }

  if (changedContext.home.humidity && currentSnapshot.home?.humidityLevel) {
    const humidity = t(`homeContext.humidity.${currentSnapshot.home.humidityLevel}` as never);
    return locale === "ru"
      ? `Теперь уход лучше подходит к влажности дома: ${humidity}.`
      : `The care guidance now fits the home humidity: ${humidity}.`;
  }

  if (changedContext.room.assignment && currentSnapshot.room?.name) {
    return locale === "ru"
      ? `Теперь совет лучше соответствует месту, где стоит растение: ${currentSnapshot.room.name}.`
      : `The advice now fits where this plant lives: ${currentSnapshot.room.name}.`;
  }

  if (changedContext.care.soilCondition) {
    return locale === "ru" ? "Теперь главный ориентир — текущее состояние почвы." : "The soil condition now guides the next care step.";
  }

  if (changedContext.care.watering || changedContext.care.repotting || changedContext.care.history) {
    return locale === "ru" ? "Совет стал точнее, потому что история ухода теперь яснее." : "The advice is more precise now that the recent care history is clearer.";
  }

  if (changedContext.system.promptVersion || changedContext.system.modelVersion) {
    return locale === "ru" ? "Совет стал мягче и практичнее для текущего состояния растения." : "The guidance is now calmer and more practical for this plant's current state.";
  }

  return locale === "ru"
    ? "Хорошая новость — серьёзных изменений для ухода сейчас нет."
    : "Good news — the care guidance does not need a major change right now.";
}

function RecommendationAutoRefresh({
  shouldRefresh,
  refreshKey,
  status,
  onRefresh,
  onReset
}: {
  shouldRefresh: boolean;
  refreshKey: string;
  status: RecommendationRefreshStatus;
  onRefresh: () => void;
  onReset: () => void;
}) {
  const lastStartedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!shouldRefresh) {
      lastStartedKeyRef.current = null;
      return;
    }

    if (!refreshKey || status === "loading" || lastStartedKeyRef.current === refreshKey) {
      return;
    }

    lastStartedKeyRef.current = refreshKey;
    onReset();
    window.setTimeout(onRefresh, 0);
  }, [onRefresh, onReset, refreshKey, shouldRefresh, status]);

  return null;
}

export function PlantDetailScreen({ plantId }: { plantId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const { addMilestone, addPlantPhotos, completeSoilCheck, deletePlant, ensureFullPhotoUrl, getCoverPhoto, getCurrentRecommendationRevision, getPlant, getPlantAnalysis, getPlantCareEvents, getPlantHypothesisResolutions, getPlantMilestones, getPlantPhotos, homes, recordSoilChecked, resolvePlantHypothesis, rooms, saveBaselineHistory, savePlantAnalysis, saveRecommendationRevision, secondaryDataReady, updateRoom, waterPlant } =
    usePlantStore();
  const { locale } = useI18n();
  const plant = getPlant(plantId);
  const analysis = getPlantAnalysis(plantId);
  const currentRecommendationRevision = getCurrentRecommendationRevision(plantId);
  const displayAnalysis = analysisWithRecommendationRevision(analysis, currentRecommendationRevision);
  const coverPhoto = getCoverPhoto(plantId);
  const photos = getPlantPhotos(plantId);
  const milestones = useMemo(
    () => getPlantMilestones(plantId).sort(compareMilestonesNewestFirst),
    [getPlantMilestones, plantId]
  );
  const hypothesisResolutions = getPlantHypothesisResolutions(plantId);
  const careEvents = getPlantCareEvents(plantId);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isCompletingAction, setIsCompletingAction] = useState(false);
  const [fullCoverUrl, setFullCoverUrl] = useState<string | undefined>();
  const [baselineSaving, setBaselineSaving] = useState(false);
  const [sunlightSavingKey, setSunlightSavingKey] = useState<string | null>(null);
  const [photoAssessment, setPhotoAssessment] = useState<PhotoAssessmentState>({ status: "idle" });
  const [recommendationRefreshState, dispatchRecommendationRefresh] = useReducer(recommendationRefreshReducer, { status: "idle" });
  const loggedEvents = useRef(new Set<string>());
  const openedActionRef = useRef<string | null>(null);
  const recommendationRefreshAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    logNavigationEvent("detail", plantId, "detail_shell_rendered");
  }, [plantId]);

  useEffect(() => {
    return () => {
      recommendationRefreshAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (recommendationRefreshState.status !== "success" && recommendationRefreshState.status !== "unchanged") {
      return;
    }

    const timeout = window.setTimeout(() => {
      dispatchRecommendationRefresh({ type: "reset" });
    }, 3200);
    return () => window.clearTimeout(timeout);
  }, [recommendationRefreshState.status]);

  const careActionState = useMemo(
    () => (plant ? deriveCareActionState(plant, hypothesisResolutions, new Date(), { isCareDataReady: secondaryDataReady }) : null),
    [hypothesisResolutions, plant, secondaryDataReady]
  );
  const primaryCareAction = careActionState?.isActionable
    ? careActionState.actionType === "observe" || careActionState.actionType === "none"
      ? null
      : careActionState.actionType
    : null;

  useEffect(() => {
    const action = searchParams.get("action");
    if (action !== "check_soil" || openedActionRef.current === `${plantId}:${action}`) {
      return;
    }
    if (careActionState?.actionType !== "check_soil" || !careActionState.isActionable) {
      return;
    }
    openedActionRef.current = `${plantId}:${action}`;
    setSheet("check_soil");
  }, [careActionState, plantId, searchParams]);

  useEffect(() => {
    if (!plant || loggedEvents.current.has("plant_data_ready")) {
      return;
    }
    loggedEvents.current.add("plant_data_ready");
    logNavigationEvent("detail", plant.id, "plant_data_ready");
    logNavigationEvent("detail", plant.id, "recommendations_ready");
  }, [plant]);

  useEffect(() => {
    if (!plant || !secondaryDataReady || loggedEvents.current.has("history_ready")) {
      return;
    }
    loggedEvents.current.add("history_ready");
    logNavigationEvent("detail", plant.id, "history_ready");
  }, [plant, milestones.length, secondaryDataReady]);

  useEffect(() => {
    let isMounted = true;
    setFullCoverUrl(undefined);
    if (!plant || !coverPhoto?.id) {
      return;
    }

    void ensureFullPhotoUrl(coverPhoto.id).then((url) => {
      if (isMounted && url) {
        setFullCoverUrl(url);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [coverPhoto?.id, ensureFullPhotoUrl, plant]);

  if (!plant) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-[430px] bg-cream px-5 pb-10 pt-12">
        <section className="rounded-[28px] bg-[#fffaf3] p-5 shadow-soft">
          <h1 className="font-rounded text-2xl font-extrabold text-ink">{t("plantDetail.notFound")}</h1>
        </section>
      </main>
    );
  }

  const plantName = plantDisplayName(plant, t("plants.unknownName"));
  const hasWateringBaseline = milestones.some((milestone) => milestone.type === "watered" || milestone.type === "watering_unknown") || Boolean(plant.lastWateredAt);
  const hasRepottingBaseline = milestones.some((milestone) => milestone.type === "repotted" || milestone.type === "repotting_unknown");
  const assignedRoom = plant.roomId ? rooms.find((room) => room.id === plant.roomId) : undefined;
  const baselineQuestion = nextPostCreationClarificationStep({
    hasWateringBaseline,
    hasRepottingBaseline,
    hasAssignedRoom: Boolean(assignedRoom),
    roomDirectSun: assignedRoom?.directSun,
    analysis: displayAnalysis?.rawResult
  });
  const recommendationContextSnapshot = buildRecommendationContextSnapshot({
    plant,
    homes,
    rooms,
    milestones,
    careEvents,
    hypothesisResolutions
  });
  const currentChangedContext = changedContextSince(currentRecommendationRevision?.contextSnapshot, recommendationContextSnapshot, {
    previousPromptVersion: currentRecommendationRevision?.promptVersion,
    currentPromptVersion: RECOMMENDATION_PROMPT_VERSION,
    previousModelVersion: currentRecommendationRevision?.modelVersion
  });
  const recommendationsAreStale = analysis
    ? !currentRecommendationRevision ||
      isRecommendationStale({
          plant,
          analysis,
          currentRevision: currentRecommendationRevision,
          homes,
          rooms,
          milestones,
          careEvents,
          hypothesisResolutions
        })
    : false;
  const recommendationRefreshKey = JSON.stringify({
    plantId: plant.id,
    analysisId: analysis?.id ?? null,
    revisionId: currentRecommendationRevision?.id ?? null,
    changedContext: currentChangedContext,
    promptVersion: RECOMMENDATION_PROMPT_VERSION,
    recommendationVersion: RECOMMENDATION_VERSION
  });
  const visualEvidenceAge = sourceAnalysisAgeDays(analysis);
  const visualEvidenceIsStale = isVisualEvidenceStale(analysis);

  const completeWatering = async () => {
    if (isCompletingAction) {
      return;
    }

    setIsCompletingAction(true);
    try {
      await waterPlant(plant.id);
      setSheet(null);
      setToast(t("toast.wateringSaved"));
    } finally {
      setIsCompletingAction(false);
    }
  };

  const openPrimaryAction = () => {
    if (isCompletingAction) {
      return;
    }

    if (primaryCareAction === "water") {
      void completeWatering();
    } else if (primaryCareAction === "check_soil") {
      setSheet("check_soil");
    } else if (primaryCareAction === "take_photo") {
      setSheet("add_photo");
    }
  };

  const confirmDelete = () => {
    deletePlant(plant.id);
    router.push("/");
  };

  const saveBaselineAnswer = async (kind: "watering" | "repotting", eventDate?: string, unknown = false) => {
    if (baselineSaving) {
      return;
    }

    setBaselineSaving(true);
    try {
      await saveBaselineHistory(plant.id, { kind, eventDate, unknown });
      setToast(t("edit.saved"));
    } finally {
      setBaselineSaving(false);
    }
  };

  const saveSunlightAnswer = async (directSun: NonNullable<Room["directSun"]>) => {
    if (!assignedRoom || sunlightSavingKey) {
      return;
    }

    setSunlightSavingKey(directSun);
    try {
      await updateRoom(assignedRoom.id, { directSun });
      setToast(t("edit.saved"));
    } finally {
      setSunlightSavingKey(null);
    }
  };

  const completeClarificationAnswer = async (hypothesis: PlantHypothesis, status: PlantHypothesisStatus, result: string) => {
    if (hypothesis === "soil_condition") {
      const soilResult = soilCheckResultFromClarificationAnswer(result);
      await completeSoilCheck(plant.id, soilResult, undefined, `analysis-${displayAnalysis?.id ?? "current"}-soil`);
      return;
    }

    await resolvePlantHypothesis(plant.id, hypothesis, status, result);
  };

  const analyzeNewPhotos = async (selectedPhotos: PendingPhotoUpload[], savedPhotos: PlantPhoto[]) => {
    if (!selectedPhotos.length || !savedPhotos.length) {
      return;
    }

    setPhotoAssessment({ status: "analyzing" });
    const startedAt = Date.now();
    try {
      const formData = new FormData();
      for (const photo of selectedPhotos) {
        const blob = await PhotoStorageRepository.getPhoto(photo.storageId);
        if (!blob) {
          throw new Error("temporary_photo_missing");
        }
        formData.append("photos", new File([blob], `${photo.originalName.replace(/\.[^.]+$/, "") || "plant-photo"}.jpg`, { type: blob.type || "image/jpeg" }));
        formData.append("photoTypes", photo.type);
        formData.append("photoSources", photo.source);
        formData.append("clientFileNames", photo.originalName);
        formData.append("clientMimeTypes", photo.originalType);
        formData.append("clientExtensions", photo.originalExtension ?? "");
        formData.append("clientByteSizes", String(photo.originalSize));
        formData.append("clientDecodeSucceeded", String(photo.decode.succeeded));
        formData.append("clientWidths", String(photo.decode.width ?? ""));
        formData.append("clientHeights", String(photo.decode.height ?? ""));
        formData.append("clientExifOrientations", String(photo.orientation.exifOrientation ?? ""));
        formData.append("clientPhysicallyRotated", String(photo.orientation.physicallyRotated));
        formData.append("clientOrientationSources", photo.orientation.orientationSource);
        formData.append("clientDebugIds", photo.debugId ?? photo.id);
      }
      formData.append("locale", locale);
      formData.append("currentCommonName", plant.speciesName ?? "");
      formData.append("currentScientificName", plant.scientificName ?? "");
      formData.append("currentDetectedSpecies", [plant.speciesName, plant.scientificName].filter(Boolean).join(" "));
      formData.append("currentLightCondition", plant.lightConditionKey ? t(plant.lightConditionKey) : "");
      formData.append("environmentContext", formatEnvironmentContextForPrompt(buildPlantEnvironmentContext({ plant, homes, rooms })));

      const response = await fetch("/api/analyze-plant", { method: "POST", body: formData });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.analysis) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "photo_assessment_failed");
      }

      const previousConfidence = analysis?.rawResult && typeof analysis.rawResult === "object" && "confidence" in analysis.rawResult ? Number(analysis.rawResult.confidence) : null;
      const comparisonTargetPhotoIds = [coverPhoto?.id, ...photos.slice(0, 2).map((photo) => photo.id)].filter(Boolean) as string[];
      const message =
        payload.analysis.condition === "needs_attention"
          ? t("photoAssessment.newSigns")
          : payload.analysis.condition === "healthy"
            ? t("photoAssessment.stable")
            : t("photoAssessment.reviewed");
      const changes = photoAssessmentChanges(payload.analysis.condition, locale);
      await savePlantAnalysis(plant.id, {
        sourcePhotoIds: savedPhotos.map((photo) => photo.id),
        detectedSpecies: payload.analysis.detectedSpecies,
        confidence: payload.analysis.confidence,
        condition: payload.analysis.condition,
        nextAction: payload.analysis.nextAction === "none" ? null : payload.analysis.nextAction,
        nextCheckInDays: payload.analysis.nextCheckInDays,
        summary: payload.analysis.summary,
        recommendations: payload.analysis.recommendations,
        rawResult: {
          ...payload.analysis,
          photoComparison: {
            analyzedPhotoIds: savedPhotos.map((photo) => photo.id),
            analysisTimestamp: new Date().toISOString(),
            comparisonTargetPhotoIds,
            observationsAdded: [],
            observationsUnchanged: (payload.analysis.visibleObservations ?? []).map((item: { en?: string; ru?: string }) => localized(item, locale)),
            observationsImproved: [],
            observationsWorsened: [],
            hypothesesChanged: [],
            recommendationChanges: changes,
            confidenceChanges: { previous: Number.isFinite(previousConfidence) ? previousConfidence : null, current: payload.analysis.confidence ?? null },
            reliableComparison: false,
            message: { en: payload.analysis.condition === "needs_attention" ? "I found new signs, so the care plan should adjust." : "I reviewed the new photos. The plant looks stable.", ru: message }
          }
        },
        model: payload.model
      });
      console.info("photo_assessment_completed", { plantId: plant.id, photoCount: savedPhotos.length, durationMs: Date.now() - startedAt });
      setPhotoAssessment({ status: "complete", message, changes });
    } catch (error) {
      console.warn("photo_assessment_failed", {
        plantId: plant.id,
        photoCount: selectedPhotos.length,
        message: error instanceof Error ? error.message : "Unknown error",
        durationMs: Date.now() - startedAt
      });
      setPhotoAssessment({ status: "failed", message: t("photoAssessment.failed"), retryPhotos: selectedPhotos, savedPhotos });
    }
  };

  const updateRecommendations = async () => {
    if (recommendationRefreshState.status === "loading" || !photos.length || !analysis) {
      return;
    }

    dispatchRecommendationRefresh({ type: "start" });
    const abortController = new AbortController();
    recommendationRefreshAbortRef.current?.abort();
    recommendationRefreshAbortRef.current = abortController;
    let didTimeout = false;
    const timeoutId = window.setTimeout(() => {
      didTimeout = true;
      abortController.abort();
      dispatchRecommendationRefresh({ type: "error", error: t("plantAnalysis.refreshFailedInline") });
    }, recommendationRefreshTimeoutMs);
    const startedAt = Date.now();
    try {
      const photosForAnalysis = [coverPhoto, ...photos.filter((photo) => photo.id !== coverPhoto?.id)].filter(Boolean).slice(0, 5) as PlantPhoto[];
      const formData = new FormData();
      for (const photo of photosForAnalysis) {
        const url = (await ensureFullPhotoUrl(photo.id)) ?? photo.url ?? photo.thumbnailUrl;
        if (!url) {
          continue;
        }
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error("saved_photo_fetch_failed");
        }
        const blob = await response.blob();
        formData.append("photos", new File([blob], `${photo.id}.jpg`, { type: blob.type || "image/jpeg" }));
        formData.append("photoTypes", photo.type);
        formData.append("photoSources", "saved");
        formData.append("clientFileNames", `${photo.id}.jpg`);
        formData.append("clientMimeTypes", blob.type || "image/jpeg");
        formData.append("clientExtensions", "jpg");
        formData.append("clientByteSizes", String(blob.size));
        formData.append("clientDecodeSucceeded", "true");
        formData.append("clientWidths", "");
        formData.append("clientHeights", "");
        formData.append("clientExifOrientations", "");
        formData.append("clientPhysicallyRotated", "true");
        formData.append("clientOrientationSources", "saved_normalized_photo");
        formData.append("clientDebugIds", photo.id);
      }

      formData.append("locale", locale);
      formData.append("analysisMode", "recommendation_refresh");
      formData.append("currentCommonName", plant.speciesName ?? "");
      formData.append("currentScientificName", plant.scientificName ?? "");
      formData.append("currentDetectedSpecies", [plant.speciesName, plant.scientificName].filter(Boolean).join(" "));
      formData.append("currentLightCondition", plant.lightConditionKey ? t(plant.lightConditionKey) : "");
      formData.append("environmentContext", formatEnvironmentContextForPrompt(buildPlantEnvironmentContext({ plant, homes, rooms })));
      const changedContext = changedContextSince(currentRecommendationRevision?.contextSnapshot, recommendationContextSnapshot, {
        previousPromptVersion: currentRecommendationRevision?.promptVersion,
        currentPromptVersion: RECOMMENDATION_PROMPT_VERSION,
        previousModelVersion: currentRecommendationRevision?.modelVersion
      });
      const reasonType = reasonTypeFromChangedContext(changedContext);
      const refreshReason = recommendationRefreshReason(changedContext, recommendationContextSnapshot, locale, t);
      formData.append(
        "previousAnalysis",
        JSON.stringify({
          ...compactPreviousRecommendation(displayAnalysis, {
            previousContextSnapshot: currentRecommendationRevision?.contextSnapshot,
            changedContext,
            reasonType
          })
        })
      );

      const response = await fetch("/api/analyze-plant", { method: "POST", body: formData, signal: abortController.signal });
      const payload = await response.json().catch(() => {
        throw new Error("recommendation_refresh_invalid_json");
      });
      const enrichmentLatencyMs = durationFromTrace(payload?.trace, "openai_request_started", "openai_response_received");
      if (enrichmentLatencyMs != null) {
        recordAddPlantPerformanceStage("recommendation_enrichment_latency", enrichmentLatencyMs, {
          plantId: plant.id,
          analysisId: analysis.id,
          model: payload?.model ?? "unknown"
        });
      }
      if (!response.ok || !payload?.ok || !payload.analysis) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "recommendation_refresh_failed");
      }

      const persistenceStartedAt = performance.now();
      const revisionResult = await saveRecommendationRevision(plant.id, {
        analysisId: analysis.id,
        recommendations: Array.isArray(payload.analysis.recommendations) ? payload.analysis.recommendations : [],
        structuredResult: {
          ...payload.analysis,
          recommendationRefresh: {
            refreshedAt: new Date().toISOString(),
            reason: refreshReason,
            sourceAnalysisId: analysis.id,
            sourcePhotoIds: photosForAnalysis.map((photo) => photo.id),
            changedContext
          }
        },
        reasonType,
        reasonText: refreshReason,
        changedContext,
        contextSnapshot: recommendationContextSnapshot,
        promptVersion: RECOMMENDATION_PROMPT_VERSION,
        recommendationVersion: RECOMMENDATION_VERSION,
        modelVersion: typeof payload.model === "string" ? payload.model : undefined,
        impactLevel: payload.analysis.recommendationImpact?.impactLevel,
        changeSummary: payload.analysis.recommendationImpact?.changeSummary
      });
      recordAddPlantPerformanceStage("recommendation_enrichment_persistence", performance.now() - persistenceStartedAt, {
        plantId: plant.id,
        analysisId: analysis.id,
        unchanged: Boolean(revisionResult.unchanged)
      });
      console.info("recommendation_refresh_completed", { plantId: plant.id, photoCount: photosForAnalysis.length, durationMs: Date.now() - startedAt });
      if (!didTimeout) {
        dispatchRecommendationRefresh({ type: revisionResult.unchanged ? "unchanged" : "success" });
      }
    } catch (error) {
      const wasAborted = error instanceof DOMException && error.name === "AbortError";
      console.warn("recommendation_refresh_failed", {
        plantId: plant.id,
        message: wasAborted ? "recommendation_refresh_timeout_or_abort" : error instanceof Error ? error.message : "Unknown error",
        durationMs: Date.now() - startedAt
      });
      if (!didTimeout) {
        dispatchRecommendationRefresh({ type: "error", error: t("plantAnalysis.refreshFailedInline") });
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (recommendationRefreshAbortRef.current === abortController) {
        recommendationRefreshAbortRef.current = null;
      }
    }
  };

  return (
    <main className={`mx-auto min-h-screen w-full max-w-[430px] bg-cream px-5 ${careActionState?.isActionable ? "pb-[calc(9rem+env(safe-area-inset-bottom))]" : "pb-10"}`}>
      <RecommendationAutoRefresh
        shouldRefresh={recommendationsAreStale}
        refreshKey={recommendationRefreshKey}
        status={recommendationRefreshState.status}
        onRefresh={() => void updateRecommendations()}
        onReset={() => dispatchRecommendationRefresh({ type: "reset" })}
      />
      <PlantDetailHeader
        title={plantName}
        isMenuOpen={isMenuOpen}
        onToggleMenu={() => setIsMenuOpen((value) => !value)}
        onEdit={() => {
          setIsMenuOpen(false);
          startNavigationLog("edit", plant.id, "edit_navigation_started");
          router.push(`/plants/${plant.id}/edit`);
        }}
        onDelete={() => {
          setIsMenuOpen(false);
          setIsDeleteOpen(true);
        }}
      />
      <PlantHeroImage
        plant={plant}
        coverPhotoUrl={fullCoverUrl ?? coverPhoto?.thumbnailUrl ?? coverPhoto?.url ?? "/plants/martha.png"}
        onLoad={() => {
          logNavigationEvent("detail", plant.id, fullCoverUrl ? "cover_full_image_ready" : "cover_thumbnail_ready");
        }}
      />
      <PlantStatusSection plant={plant} careActionState={careActionState} analysis={displayAnalysis} milestones={milestones} />
      {baselineQuestion ? (
        <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
          <p className="text-xs font-bold uppercase text-[#a09a90]">{baselineQuestion === "watering" ? t("baseline.welcome") : t("baseline.thanks")}</p>
          <h2 className="mt-1 font-rounded text-xl font-extrabold text-ink">
            {baselineQuestion === "watering"
              ? t("baseline.lastWateringQuestion")
              : baselineQuestion === "repotting"
                ? t("baseline.lastRepottingQuestion")
                : t("baseline.sunlightQuestion")}
          </h2>
          <p className="mt-1 text-sm font-bold leading-5 text-[#7a7166]">
            {baselineQuestion === "watering"
              ? t("baseline.wateringHelper")
              : baselineQuestion === "repotting"
                ? t("baseline.repottingHelper")
                : t("baseline.sunlightHelper")}
          </p>
          {baselineQuestion === "sunlight" ? (
            <AnswerChips
              options={sunlightOptions}
              getKey={(option) => option}
              labelFor={(option) => t(`homeContext.sun.${option}` as never)}
              onSelect={(option) => void saveSunlightAnswer(option)}
              loadingKey={sunlightSavingKey}
              disabled={Boolean(sunlightSavingKey)}
              variant="neutral"
            />
          ) : (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" disabled={baselineSaving} onClick={() => void saveBaselineAnswer(baselineQuestion, toDateKey(new Date()))} className="min-h-11 rounded-[16px] bg-white px-3 text-sm font-extrabold text-[#5f594f] disabled:opacity-60">
                  {t("addPlant.waterToday")}
                </button>
                <button type="button" disabled={baselineSaving} onClick={() => void saveBaselineAnswer(baselineQuestion, toDateKey(addDays(new Date(), -1)))} className="min-h-11 rounded-[16px] bg-white px-3 text-sm font-extrabold text-[#5f594f] disabled:opacity-60">
                  {t("addPlant.waterYesterday")}
                </button>
                <button type="button" disabled={baselineSaving} onClick={() => void saveBaselineAnswer(baselineQuestion, toDateKey(addDays(new Date(), -4)))} className="min-h-11 rounded-[16px] bg-white px-3 text-sm font-extrabold text-[#5f594f] disabled:opacity-60">
                  {t("addPlant.waterFewDaysAgo")}
                </button>
                <button type="button" disabled={baselineSaving} onClick={() => void saveBaselineAnswer(baselineQuestion, undefined, true)} className="min-h-11 rounded-[16px] bg-white px-3 text-sm font-extrabold text-[#5f594f] disabled:opacity-60">
                  {t("addPlant.waterUnknown")}
                </button>
              </div>
              <div className="mt-3">
                <CareDateEditor
                  label={t("baseline.dateLabel")}
                  disabled={baselineSaving}
                  onSaveDate={(date) => void saveBaselineAnswer(baselineQuestion, date)}
                  onSaveUnknown={() => void saveBaselineAnswer(baselineQuestion, undefined, true)}
                />
              </div>
            </>
          )}
        </section>
      ) : null}
      {photoAssessment.status !== "idle" ? (
        <section className="mt-4 rounded-[24px] bg-[#eef5e8] p-4 shadow-soft">
          <p className="text-xs font-bold uppercase text-[#6f8c62]">{t("photoAssessment.title")}</p>
          <p className="mt-1 text-sm font-extrabold leading-5 text-[#355f3d]">
            {photoAssessment.status === "analyzing" ? t("photoAssessment.analyzing") : photoAssessment.message}
          </p>
          {photoAssessment.status === "complete" ? (
            <ul className="mt-3 grid gap-2 text-sm font-bold leading-5 text-[#4f6946]">
              {photoAssessment.changes.map((change) => (
                <li key={change} className="flex gap-2">
                  <span aria-hidden="true">✓</span>
                  <span>{change}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {photoAssessment.status === "failed" ? (
            <button type="button" onClick={() => void analyzeNewPhotos(photoAssessment.retryPhotos, photoAssessment.savedPhotos)} className="mt-3 min-h-10 rounded-[16px] bg-white px-3 text-sm font-extrabold text-[#2d7a4f]">
              {t("common.tryAgain")}
            </button>
          ) : null}
        </section>
      ) : null}
      <PlantAnalysisSection
        analysis={displayAnalysis}
        plant={plant}
        milestones={milestones}
        hypothesisResolutions={hypothesisResolutions}
        onResolveHypothesis={completeClarificationAnswer}
        recommendationRefreshState={recommendationRefreshState}
        hasPendingBaselineQuestions={Boolean(baselineQuestion)}
        careActionState={careActionState}
        onKnowSpecies={() => router.push(`/plants/${plant.id}/edit`)}
        onAddPhoto={() => setSheet("add_photo")}
      />
      {currentRecommendationRevision?.reasonText && !recommendationsAreStale && recommendationRefreshState.status === "success" && currentRecommendationRevision.impactLevel && currentRecommendationRevision.impactLevel !== "none" ? (
        <section className="mt-4 rounded-[24px] bg-[#eef5e8] p-4 shadow-soft">
          <p className="text-xs font-bold uppercase text-[#6f8c62]">{t("plantAnalysis.revisionNoteTitle")}</p>
          <p className="mt-1 text-sm font-extrabold leading-5 text-[#355f3d]">{currentRecommendationRevision.reasonText}</p>
          {currentRecommendationRevision.impactLevel ? (
            <p className="mt-3 inline-flex rounded-full bg-white/75 px-3 py-1 text-xs font-extrabold text-[#355f3d]">
              {t(impactLabelKey(currentRecommendationRevision.impactLevel) as never)}
            </p>
          ) : null}
          {localized(currentRecommendationRevision.changeSummary, locale) ? (
            <p className="mt-2 text-sm font-bold leading-5 text-[#4f6946]">{localized(currentRecommendationRevision.changeSummary, locale)}</p>
          ) : null}
        </section>
      ) : null}
      {visualEvidenceIsStale && visualEvidenceAge != null ? (
        <section className="mt-4 rounded-[24px] bg-white/75 p-4 shadow-soft">
          <p className="text-sm font-extrabold leading-5 text-ink">{t("plantAnalysis.visualEvidenceOldTitle")}</p>
          <p className="mt-1 text-sm font-bold leading-5 text-[#7a7166]">{t("plantAnalysis.visualEvidenceOldBody").replace("{days}", String(visualEvidenceAge))}</p>
        </section>
      ) : null}
      <button
        type="button"
        onClick={() => setSheet("add_photo")}
        className="mt-4 min-h-12 w-full rounded-[20px] bg-[#ddf2dc] px-4 text-sm font-extrabold text-[#2d7a4f]"
      >
        {t("photos.addNewPhotos")}
      </button>
      <CareSummary plant={plant} />
      <PlantNotificationControls plant={plant} />
      <PhotoGallery photos={photos} onAddPhoto={() => setSheet("add_photo")} />
      <CareHistory milestones={milestones} onAddEvent={() => setSheet("add_event")} />

      {careActionState?.isActionable ? <PrimaryCareAction plant={plant} actionState={careActionState} onAction={openPrimaryAction} disabled={isCompletingAction} /> : null}
      {sheet === "check_soil" ? (
        <CheckSoilSheet
          onClose={() => setSheet(null)}
          onWatered={() => void completeWatering()}
          isSaving={isCompletingAction}
          plant={plant}
          milestones={milestones}
          hypothesisResolutions={hypothesisResolutions}
          onSoilChecked={async (result: SoilCheckResult, note, actionSessionId) => {
            if (isCompletingAction) {
              return;
            }

            const startedAt = Date.now();
            setIsCompletingAction(true);
            try {
              await recordSoilChecked(plant.id, result, note, actionSessionId);
              console.info("care_action_saved", {
                plantId: plant.id,
                action: "soil_checked",
                result,
                durationMs: Date.now() - startedAt
              });
              setSheet(null);
              setToast(t("checkSoil.saved"));
            } catch (error) {
              console.warn("care_action_save_failed", {
                plantId: plant.id,
                action: "soil_checked",
                result,
                message: error instanceof Error ? error.message : "Unknown error",
                durationMs: Date.now() - startedAt
              });
              setToast(t("checkSoil.saveFailed"));
              throw error;
            } finally {
              setIsCompletingAction(false);
            }
          }}
        />
      ) : null}
      {sheet === "add_photo" ? (
        <PhotoUploadFlow
          title={t("photos.addPhotos")}
          hasExistingCover={photos.some((photo) => photo.isCover)}
          onCancel={() => setSheet(null)}
          onSave={async (selectedPhotos) => {
            setIsCompletingAction(true);
            try {
              const savedPhotos = await addPlantPhotos(plant.id, selectedPhotos);
              setSheet(null);
              setToast(t("toast.photoSaved"));
              void analyzeNewPhotos(selectedPhotos, savedPhotos);
            } finally {
              setIsCompletingAction(false);
            }
          }}
        />
      ) : null}
      {sheet === "add_event" ? (
        <MilestoneEditor
          onCancel={() => setSheet(null)}
          onSave={async (input) => {
            await addMilestone(plant.id, input);
            setSheet(null);
            setToast(t("edit.saved"));
          }}
        />
      ) : null}
      {isDeleteOpen ? <DeletePlantDialog plantName={plantName} onCancel={() => setIsDeleteOpen(false)} onConfirm={confirmDelete} /> : null}
      {toast ? <Toast message={toast} /> : null}
    </main>
  );
}
