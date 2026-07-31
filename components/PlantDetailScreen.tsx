"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePlantStore } from "@/data/PlantStore";
import { useI18n } from "@/i18n/I18nProvider";
import { addDays, toDateKey } from "@/lib/date-format";
import { recordAddPlantPerformanceStage } from "@/lib/add-plant-performance";
import { deriveConversationalCareState } from "@/lib/conversational-care";
import { buildPlantEnvironmentContext, formatEnvironmentContextForPrompt } from "@/lib/home-room-context";
import { findExistingBaselineMilestone } from "@/lib/care-baseline";
import { plantDetailAnalysisMode, selectPlantDetailAnalysisContext } from "@/lib/plant-analysis-context";
import { buildPlantDetailDebugData, type PlantDetailDebugData } from "@/lib/plant-detail-debug";
import { buildPlantTimeline } from "@/lib/plant-timeline";
import { plantDisplayName } from "@/lib/plant-display";
import { deriveCareActionState } from "@/lib/plant-action-eligibility";
import { derivePlantHealthStatus } from "@/lib/plant-health-status";
import { evaluateRecommendationUpdate } from "@/lib/recommendation-update-decision";
import { compareMilestonesNewestFirst } from "@/lib/milestone-dates";
import { logNavigationEvent, startNavigationLog } from "@/lib/navigation-performance";
import { PhotoStorageRepository } from "@/lib/photo-storage";
import { recommendationSpeciesContextFromPlant } from "@/lib/plant-detail-recovery-presentation";
import { classifyPlantCheckinResult, followUpIsDue, followUpResultLabelKey, progressReviewMode } from "@/lib/plant-follow-ups";
import { nextPostCreationClarificationStep } from "@/lib/post-creation-clarifications";
import { buildRecommendationContextSnapshot, changedContextSince, impactLabelKey, isRecommendationStale, isVisualEvidenceStale, reasonTypeFromChangedContext, sourceAnalysisAgeDays, type RecommendationChangedContext, type RecommendationContextSnapshot } from "@/lib/recommendation-refresh";
import { recommendationRefreshReducer, recommendationRefreshStateForPlant, type RecommendationRefreshStatus } from "@/lib/recommendation-refresh-state";
import { RECOMMENDATION_PROMPT_VERSION, RECOMMENDATION_VERSION } from "@/lib/recommendation-version";
import { soilCheckResultFromClarificationAnswer } from "@/lib/soil-check-completion";
import { loadHomeWeatherContext, type HomeWeatherContext } from "@/lib/weather-context";
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
import type { PlantAnalysisRecord, PlantFollowUp, PlantHypothesis, PlantHypothesisStatus, PlantPhoto, PlantRecommendationRevision, Room, SoilCheckResult } from "@/types/plant";
import type { PendingPhotoUpload } from "./photo-upload-types";

type Sheet = "check_soil" | "add_photo" | "add_event" | null;
const recommendationRefreshTimeoutMs = 45_000;
const sunlightOptions: NonNullable<Room["directSun"]>[] = ["none", "morning", "midday", "evening", "most_of_day", "unsure"];
type PhotoAssessmentState =
  | { status: "idle" }
  | { status: "uploading_photos" | "analyzing_photos" | "saving_checkin" | "evaluating_update" | "updating_recommendations"; message?: string }
  | { status: "completed_updated" | "completed_no_change"; message: string; changes: string[] }
  | { status: "failed"; message: string; retryPhotos: PendingPhotoUpload[]; savedPhotos: PlantPhoto[]; changes?: string[] };

type PhotoComparisonResult = NonNullable<PlantAnalysisRecord["rawResult"]>["photoComparison"];
type LocalRecommendationPhoto = {
  id: string;
  type: PlantPhoto["type"];
  file: File;
  source: string;
};

function PlantDetailDebugPanel({ data }: { data: PlantDetailDebugData }) {
  return (
    <details className="mt-4 rounded-[20px] bg-[#1f2937] p-4 text-xs text-white/90 shadow-soft">
      <summary className="cursor-pointer font-bold text-white">Plant debug</summary>
      <div className="mt-3 grid gap-3">
        <div className="grid grid-cols-2 gap-2">
          <span>plantId</span>
          <span className="break-all font-mono">{data.plantId}</span>
          <span>plant.status</span>
          <span className="font-mono">{data.plantStatus}</span>
          <span>secondaryDataReady</span>
          <span className="font-mono">{String(data.secondaryDataReady)}</span>
          <span>derivedHealthStatus</span>
          <span className="font-mono">{data.derivedHealthStatus ?? "null"}</span>
          <span>shouldRenderAnalysis</span>
          <span className="font-mono">{String(data.shouldRenderAnalysis)}</span>
          <span>hiddenReason</span>
          <span className="font-mono">{data.hiddenReason}</span>
          <span>recoveryContext</span>
          <span className="font-mono">{String(data.recoveryContext)}</span>
        </div>
        <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-[16px] bg-black/30 p-3 font-mono leading-5">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </details>
  );
}

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

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function looksLikeWrongLocale(text: string, locale: "en" | "ru") {
  if (locale !== "ru") {
    return false;
  }

  return /[A-Za-z]{3,}/.test(text) && !/[А-Яа-яЁё]/.test(text);
}

function buildCheckinPhotoComparison(input: {
  analysis: PlantAnalysisRecord["rawResult"];
  savedPhotoIds: string[];
  comparisonTargetPhotoIds: string[];
  previousConfidence: number | null;
  fallbackChanges: string[];
  fallbackMessage: string;
  locale: "en" | "ru";
}): PhotoComparisonResult {
  const source = input.analysis?.photoComparison;
  const sourceMessage = source?.message && typeof source.message === "object" ? source.message : undefined;
  const unchanged = stringList(source?.observationsUnchanged);

  return {
    analyzedPhotoIds: input.savedPhotoIds,
    analysisTimestamp: new Date().toISOString(),
    comparisonTargetPhotoIds: input.comparisonTargetPhotoIds,
    observationsAdded: stringList(source?.observationsAdded),
    observationsUnchanged: unchanged.length
      ? unchanged
      : (input.analysis?.visibleObservations ?? []).map((item) => localized(item, input.locale)).filter(Boolean),
    observationsImproved: stringList(source?.observationsImproved),
    observationsWorsened: stringList(source?.observationsWorsened),
    hypothesesChanged: stringList(source?.hypothesesChanged),
    recommendationChanges: stringList(source?.recommendationChanges).length ? stringList(source?.recommendationChanges) : input.fallbackChanges,
    confidenceChanges: source?.confidenceChanges ?? {
      previous: Number.isFinite(input.previousConfidence) ? input.previousConfidence : null,
      current: typeof input.analysis?.confidence === "number" ? input.analysis.confidence : null
    },
    reliableComparison: typeof source?.reliableComparison === "boolean" ? source.reliableComparison : false,
    message: sourceMessage ?? { en: input.fallbackMessage, ru: input.fallbackMessage }
  };
}

function photoAssessmentChangesFromComparison(comparison: PhotoComparisonResult, fallback: string[], locale: "en" | "ru") {
  const localizedMessage = localized(comparison?.message, locale);
  const filterLocale = (items: string[]) => items.filter((item) => !looksLikeWrongLocale(item, locale)).slice(0, 2);

  const worsened = stringList(comparison?.observationsWorsened);
  if (worsened.length) {
    const visible = filterLocale(worsened);
    if (visible.length) return visible;
    if (localizedMessage && !looksLikeWrongLocale(localizedMessage, locale)) return [localizedMessage];
    return locale === "ru" ? ["На новых фото есть признаки ухудшения."] : ["The new photos show signs of worsening."];
  }

  const improved = stringList(comparison?.observationsImproved);
  if (improved.length) {
    const visible = filterLocale(improved);
    if (visible.length) return visible;
    if (localizedMessage && !looksLikeWrongLocale(localizedMessage, locale)) return [localizedMessage];
    return locale === "ru" ? ["На новых фото есть признаки улучшения."] : ["The new photos show signs of improvement."];
  }

  const added = stringList(comparison?.observationsAdded);
  if (added.length) {
    const visible = filterLocale(added);
    if (visible.length) return visible;
    if (localizedMessage && !looksLikeWrongLocale(localizedMessage, locale)) return [localizedMessage];
    return fallback;
  }

  if (comparison?.reliableComparison === false) {
    return locale === "ru"
      ? ["Фото сохранены. Для уверенного сравнения нужен похожий ракурс."]
      : ["Photos saved. A similar angle would help compare changes with confidence."];
  }

  return fallback;
}

function photoAssessmentMessage(status: PhotoAssessmentState["status"], locale: "en" | "ru", fallback?: string) {
  if (fallback) return fallback;
  if (status === "uploading_photos") return locale === "ru" ? "Сохраняю фото..." : "Saving photos...";
  if (status === "analyzing_photos") return locale === "ru" ? "Изучаю новые фото..." : "Reviewing the new photos...";
  if (status === "saving_checkin") return locale === "ru" ? "Сохраняю проверку состояния..." : "Saving the check-in...";
  if (status === "evaluating_update") return locale === "ru" ? "Проверяю, нужно ли менять план..." : "Checking whether the care plan should change...";
  if (status === "updating_recommendations") return locale === "ru" ? "Обновляю план ухода..." : "Updating the care plan...";
  return "";
}

function photoAssessmentUpdatedMessage(locale: "en" | "ru") {
  return locale === "ru" ? "Фото изучены — план ухода обновлён." : "Photos reviewed — the care plan was updated.";
}

function photoAssessmentNoChangeMessage(locale: "en" | "ru") {
  return locale === "ru" ? "Фото проверены. Текущий план остаётся актуальным." : "Photos checked. The current care plan is still relevant.";
}

function photoAssessmentSavedButRefreshFailedMessage(locale: "en" | "ru") {
  return locale === "ru" ? "Фото сохранены, но обновить рекомендации не удалось." : "Photos were saved, but I could not update the recommendations.";
}

function mergePhotosForRecommendationRefresh(input: {
  coverPhoto?: PlantPhoto | null;
  currentPhotos: PlantPhoto[];
  savedPhotos?: PlantPhoto[];
}) {
  const ordered = [
    input.coverPhoto,
    ...(input.savedPhotos ?? []),
    ...input.currentPhotos.filter((photo) => photo.id !== input.coverPhoto?.id)
  ].filter(Boolean) as PlantPhoto[];
  const seen = new Set<string>();
  return ordered.filter((photo) => {
    if (seen.has(photo.id)) {
      return false;
    }
    seen.add(photo.id);
    return true;
  }).slice(0, 5);
}

function daysUntilDate(date: string) {
  const today = new Date(`${toDateKey(new Date())}T12:00:00`);
  const target = new Date(`${date.slice(0, 10)}T12:00:00`);
  return Math.ceil((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
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
      speciesIdentification: analysis.rawResult?.speciesIdentification ?? structured.speciesIdentification,
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
  input: { previousContextSnapshot?: Record<string, unknown>; changedContext?: RecommendationChangedContext; reasonType?: string; userProvidedSpecies?: ReturnType<typeof recommendationSpeciesContextFromPlant> } = {}
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
    userProvidedSpecies: input.userProvidedSpecies ?? null,
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

  if (changedContext.home.weather) {
    return locale === "ru"
      ? "Теперь совет учитывает жару и то, что почва может высыхать быстрее."
      : "The advice now accounts for heat and faster soil drying.";
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

    if (!refreshKey || status === "loading" || status === "error" || lastStartedKeyRef.current === refreshKey) {
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
  const { addMilestone, addPlantPhotos, completePhotoFollowUp, completeSoilCheck, deletePlant, ensureFullPhotoUrl, getAllPlantFollowUps, getCoverPhoto, getCurrentRecommendationRevision, getLatestCompletedFollowUp, getPlant, getPlantAnalysis, getPlantAnalyses, getPlantCareEvents, getPlantFollowUps, getPlantHypothesisResolutions, getPlantMilestones, getPlantPhotos, homes, recordSoilChecked, resolvePlantHypothesis, rooms, saveBaselineHistory, savePlantAnalysis, saveRecommendationRevision, secondaryDataReady, secondaryDataStatus, secondaryLoadState, updateRoom, waterPlant } =
    usePlantStore();
  const { locale } = useI18n();
  const plant = getPlant(plantId);
  const analysis = getPlantAnalysis(plantId);
  const analyses = useMemo(() => getPlantAnalyses(plantId), [getPlantAnalyses, plantId]);
  const currentRecommendationRevision = getCurrentRecommendationRevision(plantId);
  const coverPhoto = getCoverPhoto(plantId);
  const photos = getPlantPhotos(plantId);
  const milestones = useMemo(
    () => getPlantMilestones(plantId).sort(compareMilestonesNewestFirst),
    [getPlantMilestones, plantId]
  );
  const followUps = getPlantFollowUps(plantId);
  const allFollowUps = useMemo(() => getAllPlantFollowUps(plantId), [getAllPlantFollowUps, plantId]);
  const activePhotoFollowUp = followUps[0];
  const completedPhotoFollowUp = getLatestCompletedFollowUp(plantId);
  const hypothesisResolutions = getPlantHypothesisResolutions(plantId);
  const careEvents = getPlantCareEvents(plantId);
  const analysisContext = useMemo(
    () =>
      plant
        ? selectPlantDetailAnalysisContext({
            plant,
            analyses,
            milestones,
            followUps: allFollowUps,
            hypothesisResolutions,
            secondaryDataReady
          })
        : { latestAnalysis: analysis, meaningfulAnalysis: analysis, recoveryContext: false, hiddenReason: "no_analysis" as const },
    [allFollowUps, analyses, analysis, hypothesisResolutions, milestones, plant, secondaryDataReady]
  );
  const displayAnalysis = analysisWithRecommendationRevision(analysisContext.meaningfulAnalysis, currentRecommendationRevision);
  const plantDebugEnabled = searchParams.get("plantDebug") === "1";
  const historyTimeline = useMemo(
    () =>
      buildPlantTimeline({
        plantId,
        milestones,
        careEvents,
        followUps: allFollowUps,
        analyses,
        photos
      }),
    [allFollowUps, analyses, careEvents, milestones, photos, plantId]
  );
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isCompletingAction, setIsCompletingAction] = useState(false);
  const [fullCoverUrl, setFullCoverUrl] = useState<string | undefined>();
  const [baselineSaving, setBaselineSaving] = useState(false);
  const [sunlightSavingKey, setSunlightSavingKey] = useState<string | null>(null);
  const [photoAssessment, setPhotoAssessment] = useState<PhotoAssessmentState>({ status: "idle" });
  const [weatherContext, setWeatherContext] = useState<HomeWeatherContext | null>(null);
  const [recommendationRefreshState, dispatchRecommendationRefresh] = useReducer(recommendationRefreshReducer, { status: "idle" });
  const visibleRecommendationRefreshState = recommendationRefreshStateForPlant(recommendationRefreshState, plantId);
  const loggedEvents = useRef(new Set<string>());
  const openedActionRef = useRef<string | null>(null);
  const recommendationRefreshAbortRef = useRef<AbortController | null>(null);
  const recommendationRefreshRunIdRef = useRef(0);
  const activePlantIdRef = useRef(plantId);

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
      recommendationRefreshRunIdRef.current += 1;
      recommendationRefreshAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    activePlantIdRef.current = plantId;
    recommendationRefreshRunIdRef.current += 1;
    recommendationRefreshAbortRef.current?.abort();
    recommendationRefreshAbortRef.current = null;
    setPhotoAssessment({ status: "idle" });
    setSheet(null);
    setToast(null);
    dispatchRecommendationRefresh({ type: "reset", plantId });
  }, [plantId]);

  useEffect(() => {
    if (!plant?.homeId) {
      setWeatherContext(null);
      return;
    }

    const home = homes.find((item) => item.id === plant.homeId);
    if (!home?.city) {
      setWeatherContext(null);
      return;
    }

    const controller = new AbortController();
    loadHomeWeatherContext(home, controller.signal)
      .then((context) => {
        if (!controller.signal.aborted && activePlantIdRef.current === plant.id) {
          setWeatherContext(context);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && activePlantIdRef.current === plant.id) {
          setWeatherContext(null);
        }
      });
    return () => controller.abort();
  }, [homes, plant?.homeId, plant?.id]);

  useEffect(() => {
    if (visibleRecommendationRefreshState.status !== "success" && visibleRecommendationRefreshState.status !== "unchanged") {
      return;
    }

    const timeout = window.setTimeout(() => {
      dispatchRecommendationRefresh({ type: "reset", plantId });
    }, 3200);
    return () => window.clearTimeout(timeout);
  }, [plantId, visibleRecommendationRefreshState.status]);

  const careActionState = useMemo(
    () => (plant ? deriveCareActionState(plant, hypothesisResolutions, new Date(), { isCareDataReady: secondaryDataReady }) : null),
    [hypothesisResolutions, plant, secondaryDataReady]
  );
  const derivedHealthStatus = useMemo(
    () => (plant ? derivePlantHealthStatus({ plant, analysis: displayAnalysis, milestones, followUps: allFollowUps, careActionState }) : null),
    [allFollowUps, careActionState, displayAnalysis, milestones, plant]
  );
  const recommendationContextSnapshot = plant
    ? buildRecommendationContextSnapshot({
        plant,
        homes,
        rooms,
        milestones,
        careEvents,
        hypothesisResolutions,
        weather: weatherContext,
        analyses,
        currentRevision: currentRecommendationRevision
      })
    : null;
  const plantDebugData = useMemo(
    () =>
      plant && plantDebugEnabled
        ? buildPlantDetailDebugData({
            plant,
            secondaryDataReady,
            secondaryDataStatus,
            secondaryLoadState,
            analyses,
            analysisContext,
            recommendationRevision: currentRecommendationRevision,
            milestones,
            careEvents,
            followUps: allFollowUps,
            photos,
            timeline: historyTimeline,
            derivedHealthStatus,
            careActionState,
            hypothesisResolutions,
            recommendationContextSnapshot: recommendationContextSnapshot ?? undefined,
            recommendationRefreshStatus: visibleRecommendationRefreshState.status,
            recommendationRefreshError: visibleRecommendationRefreshState.error
          })
        : null,
    [
      allFollowUps,
      analyses,
      analysisContext,
      careActionState,
      careEvents,
      currentRecommendationRevision,
      derivedHealthStatus,
      historyTimeline,
      hypothesisResolutions,
      milestones,
      photos,
      plant,
      plantDebugEnabled,
      recommendationContextSnapshot,
      secondaryDataReady,
      secondaryDataStatus,
      secondaryLoadState,
      visibleRecommendationRefreshState.error,
      visibleRecommendationRefreshState.status
    ]
  );

  useEffect(() => {
    if (!plant || process.env.NODE_ENV === "production") {
      return;
    }

    const activeFollowUpsCount = allFollowUps.filter((followUp) => followUp.status === "scheduled" || followUp.status === "due").length;
    const completedFollowUpsCount = allFollowUps.filter((followUp) => followUp.status === "completed").length;
    console.info("plant_detail_ai_diagnostics", {
      plantId,
      plantStatus: plant.status,
      analysesCount: analyses.length,
      latestAnalysisId: analysisContext.latestAnalysis?.id ?? null,
      latestAnalysisMode: plantDetailAnalysisMode(analysisContext.latestAnalysis),
      latestCondition: analysisContext.latestAnalysis?.condition ?? null,
      meaningfulAnalysisId: analysisContext.meaningfulAnalysis?.id ?? null,
      milestonesCount: milestones.length,
      activeFollowUpsCount,
      completedFollowUpsCount,
      derivedHealthStatus: derivedHealthStatus?.status ?? null,
      careActionState: careActionState
        ? {
            actionType: careActionState.actionType,
            status: careActionState.status,
            isActionable: careActionState.isActionable,
            dueAt: careActionState.dueAt ?? null,
            reason: careActionState.reason
          }
        : null,
      recoveryContext: analysisContext.recoveryContext,
      shouldRenderAnalysis: Boolean(displayAnalysis),
      hiddenReason: displayAnalysis ? "not_hidden" : analysisContext.hiddenReason
    });
  }, [allFollowUps, analyses.length, analysisContext, careActionState, derivedHealthStatus?.status, displayAnalysis, milestones.length, plant, plantId]);
  const primaryCareAction = careActionState?.isActionable
    ? careActionState.actionType === "observe" || careActionState.actionType === "none"
      ? null
      : careActionState.actionType
    : null;

  useEffect(() => {
    const action = searchParams.get("action");
    if ((action !== "check_soil" && action !== "add_photo") || openedActionRef.current === `${plantId}:${action}`) {
      return;
    }
    if (action === "add_photo") {
      openedActionRef.current = `${plantId}:${action}`;
      setSheet("add_photo");
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
  const hasWateringBaseline = Boolean(findExistingBaselineMilestone(milestones, plant.id, "watering")) || Boolean(plant.lastWateredAt);
  const hasRepottingBaseline = Boolean(findExistingBaselineMilestone(milestones, plant.id, "repotting"));
  const assignedRoom = plant.roomId ? rooms.find((room) => room.id === plant.roomId) : undefined;
  const baselineQuestion = secondaryDataReady
    ? nextPostCreationClarificationStep({
        hasWateringBaseline,
        hasRepottingBaseline,
        hasAssignedRoom: Boolean(assignedRoom),
        roomDirectSun: assignedRoom?.directSun,
        analysis: displayAnalysis?.rawResult
      })
    : null;
  const conversationalState = deriveConversationalCareState({
    analysis: displayAnalysis,
    plant,
    milestones,
    hypothesisResolutions,
    locale
  });
  const activeRecommendationContextSnapshot = recommendationContextSnapshot!;
  const currentChangedContext = changedContextSince(currentRecommendationRevision?.contextSnapshot, activeRecommendationContextSnapshot, {
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
          hypothesisResolutions,
          weather: weatherContext,
          analyses
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
  const photoAssessmentBlocksAutoRefresh =
    photoAssessment.status === "uploading_photos" ||
    photoAssessment.status === "analyzing_photos" ||
    photoAssessment.status === "saving_checkin" ||
    photoAssessment.status === "evaluating_update" ||
    photoAssessment.status === "updating_recommendations";
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

    setPhotoAssessment({ status: "analyzing_photos" });
    const startedAt = Date.now();
    const freshRecommendationPhotos: LocalRecommendationPhoto[] = [];
    const followUp = activePhotoFollowUp;
    const isFollowUpAssessment = Boolean(followUp);
    const comparisonTargetPhotoIds = [coverPhoto?.id, ...photos.slice(0, 3).map((photo) => photo.id)].filter(Boolean) as string[];
    const userProvidedSpeciesContext = recommendationSpeciesContextFromPlant(plant, analysis);
    const previousVisualSnapshot =
      analysis?.rawResult?.visualEvidenceSnapshot && typeof analysis.rawResult.visualEvidenceSnapshot === "object"
        ? (analysis.rawResult.visualEvidenceSnapshot as Record<string, unknown>)
        : {};
    try {
      const formData = new FormData();
      for (let index = 0; index < selectedPhotos.length; index += 1) {
        const photo = selectedPhotos[index];
        const blob = await PhotoStorageRepository.getPhoto(photo.storageId);
        if (!blob) {
          throw new Error("temporary_photo_missing");
        }
        const file = new File([blob], `${photo.originalName.replace(/\.[^.]+$/, "") || "plant-photo"}.jpg`, { type: blob.type || "image/jpeg" });
        freshRecommendationPhotos.push({
          id: savedPhotos[index]?.id ?? photo.id,
          type: savedPhotos[index]?.type ?? photo.type,
          file,
          source: "new_checkin"
        });
        formData.append("photos", file);
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
      const comparisonPhotos = photos
        .filter((photo) => !savedPhotos.some((savedPhoto) => savedPhoto.id === photo.id))
        .slice(0, Math.max(0, 5 - selectedPhotos.length));
      for (const previousPhoto of comparisonPhotos) {
        const previousUrl = await ensureFullPhotoUrl(previousPhoto.id);
        if (!previousUrl) {
          continue;
        }
        const previousResponse = await fetch(previousUrl);
        if (!previousResponse.ok) {
          continue;
        }
        const blob = await previousResponse.blob();
        formData.append("photos", new File([blob], `previous-${previousPhoto.id}.jpg`, { type: blob.type || "image/jpeg" }));
        formData.append("photoTypes", previousPhoto.type);
        formData.append("photoSources", "comparison_baseline");
        formData.append("clientFileNames", `previous-${previousPhoto.id}.jpg`);
        formData.append("clientMimeTypes", blob.type || "image/jpeg");
        formData.append("clientExtensions", "jpg");
        formData.append("clientByteSizes", String(blob.size));
        formData.append("clientDecodeSucceeded", "");
        formData.append("clientWidths", "");
        formData.append("clientHeights", "");
        formData.append("clientExifOrientations", "");
        formData.append("clientPhysicallyRotated", "");
        formData.append("clientOrientationSources", "stored_baseline");
        formData.append("clientDebugIds", `comparison-${previousPhoto.id}`);
      }
      formData.append("locale", locale);
      formData.append("currentCommonName", plant.speciesName ?? "");
      formData.append("currentScientificName", plant.scientificName ?? "");
      formData.append("currentDetectedSpecies", [plant.speciesName, plant.scientificName].filter(Boolean).join(" "));
      formData.append("userProvidedSpecies", JSON.stringify(userProvidedSpeciesContext));
      formData.append("currentLightCondition", plant.lightConditionKey ? t(plant.lightConditionKey) : "");
      formData.append("environmentContext", formatEnvironmentContextForPrompt(buildPlantEnvironmentContext({ plant, homes, rooms, weather: weatherContext })));
      formData.append("analysisMode", progressReviewMode());
      formData.append("followUpReason", followUp?.reason ?? "new_photo_checkin");
      formData.append("followUpDueAt", followUp?.dueAt ?? "");
      formData.append("comparisonTargetPhotoIds", JSON.stringify(comparisonTargetPhotoIds));
      formData.append(
        "previousAnalysis",
        JSON.stringify({
          condition: analysis?.condition ?? plant.status,
          plantStatus: analysis?.rawResult?.plantStatus ?? null,
          summary: analysis?.summary ?? null,
          visibleObservations: analysis?.rawResult?.visibleObservations ?? [],
          concerns: previousVisualSnapshot.concerns ?? [],
          careRightNow: analysis?.rawResult?.careRightNow ?? [],
          recommendations: analysis?.recommendations ?? [],
          createdAt: analysis?.createdAt ?? null
        })
      );
      formData.append("recentCareEvents", JSON.stringify([...milestones.slice(0, 6), ...careEvents.slice(0, 6)].map((item) => ({
        type: item.type,
        date: "eventDate" in item ? item.eventDate : item.createdAt
      }))));

      const response = await fetch("/api/analyze-plant", { method: "POST", body: formData });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.analysis) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "photo_assessment_failed");
      }

      const previousConfidence = analysis?.rawResult && typeof analysis.rawResult === "object" && "confidence" in analysis.rawResult ? Number(analysis.rawResult.confidence) : null;
      const message =
        isFollowUpAssessment && payload.analysis.photoComparison?.message
          ? localized(payload.analysis.photoComparison.message, locale)
          : payload.analysis.condition === "needs_attention"
          ? t("photoAssessment.newSigns")
          : payload.analysis.condition === "healthy"
            ? t("photoAssessment.stable")
            : t("photoAssessment.reviewed");
      const changes = photoAssessmentChanges(payload.analysis.condition, locale);
      const photoComparison = buildCheckinPhotoComparison({
        analysis: payload.analysis,
        savedPhotoIds: savedPhotos.map((photo) => photo.id),
        comparisonTargetPhotoIds,
        previousConfidence: Number.isFinite(previousConfidence) ? previousConfidence : null,
        fallbackChanges: changes,
        fallbackMessage: message,
        locale
      });
      const comparisonChanges = photoAssessmentChangesFromComparison(photoComparison, changes, locale);
      const checkinResult = classifyPlantCheckinResult({
        ...payload.analysis,
        photoComparison
      });
      if (followUp) {
        const checkinRawResult = {
          ...payload.analysis,
          analysisMode: progressReviewMode(),
          checkinResult,
          photoComparison
        };
        setPhotoAssessment({ status: "saving_checkin" });
        const persistedAnalysis = await savePlantAnalysis(plant.id, {
          sourcePhotoIds: savedPhotos.map((photo) => photo.id),
          detectedSpecies: payload.analysis.detectedSpecies,
          confidence: payload.analysis.confidence,
          condition: payload.analysis.condition,
          nextAction: payload.analysis.nextAction === "none" ? null : payload.analysis.nextAction,
          nextCheckInDays: payload.analysis.nextCheckInDays,
          summary: payload.analysis.summary,
          recommendations: payload.analysis.recommendations,
          rawResult: checkinRawResult,
          model: payload.model,
          analysisMode: progressReviewMode()
        });
        const completed = await completePhotoFollowUp(plant.id, followUp.id, savedPhotos, {
          ...checkinRawResult
        });
        console.info("photo_follow_up_completed", { plantId: plant.id, followUpId: followUp.id, result: completed.result, photoCount: savedPhotos.length, durationMs: Date.now() - startedAt });
        setPhotoAssessment({ status: "evaluating_update" });
        const evaluation = evaluateRecommendationUpdate({
          checkin: persistedAnalysis,
          previousMeaningfulAnalysis: analysisContext.meaningfulAnalysis,
          currentRevision: currentRecommendationRevision,
          followUps: allFollowUps,
          milestones,
          hypothesisResolutions
        });
        console.info("recommendation_update_evaluated", {
          plantId: plant.id,
          persistedAnalysisId: persistedAnalysis.id,
          decision: evaluation.decision,
          meaningfulChangeReasons: evaluation.meaningfulChangeReasons
        });
        if (evaluation.decision === "refresh_required") {
          setPhotoAssessment({ status: "updating_recommendations" });
          const refreshResult = await updateRecommendations({
            sourceAnalysis: persistedAnalysis,
            photosForAnalysis: mergePhotosForRecommendationRefresh({ coverPhoto, currentPhotos: photos, savedPhotos }),
            localPhotoFiles: freshRecommendationPhotos,
            restartIfLoading: true,
            contextSnapshot: buildRecommendationContextSnapshot({
              plant,
              homes,
              rooms,
              milestones,
              careEvents,
              hypothesisResolutions,
              weather: weatherContext,
              analyses: [persistedAnalysis, ...analyses.filter((item) => item.id !== persistedAnalysis.id)],
              currentRevision: currentRecommendationRevision
            })
          });
          if (refreshResult === "failed" || refreshResult === "skipped") {
            setPhotoAssessment({ status: "failed", message: photoAssessmentSavedButRefreshFailedMessage(locale), retryPhotos: selectedPhotos, savedPhotos, changes: comparisonChanges });
            return;
          }
          setPhotoAssessment({ status: refreshResult === "unchanged" ? "completed_no_change" : "completed_updated", message: refreshResult === "unchanged" ? photoAssessmentNoChangeMessage(locale) : photoAssessmentUpdatedMessage(locale), changes: comparisonChanges.length ? comparisonChanges : [t(followUpResultLabelKey(completed.result) as never)] });
          return;
        }
        setPhotoAssessment({ status: "completed_no_change", message: localized(completed.summary, locale) || photoAssessmentNoChangeMessage(locale), changes: comparisonChanges.length ? comparisonChanges : [t(followUpResultLabelKey(completed.result) as never)] });
        return;
      }
      setPhotoAssessment({ status: "saving_checkin" });
      const checkinRawResult = {
        ...payload.analysis,
        analysisMode: progressReviewMode(),
        checkinResult,
        photoComparison
      };
      const persistedAnalysis = await savePlantAnalysis(plant.id, {
        sourcePhotoIds: savedPhotos.map((photo) => photo.id),
        detectedSpecies: payload.analysis.detectedSpecies,
        confidence: payload.analysis.confidence,
        condition: payload.analysis.condition,
        nextAction: payload.analysis.nextAction === "none" ? null : payload.analysis.nextAction,
        nextCheckInDays: payload.analysis.nextCheckInDays,
        summary: payload.analysis.summary,
        recommendations: payload.analysis.recommendations,
        rawResult: checkinRawResult,
        model: payload.model,
        analysisMode: progressReviewMode()
      });
      setPhotoAssessment({ status: "evaluating_update" });
      const evaluation = evaluateRecommendationUpdate({
        checkin: persistedAnalysis,
        previousMeaningfulAnalysis: analysisContext.meaningfulAnalysis,
        currentRevision: currentRecommendationRevision,
        followUps: allFollowUps,
        milestones,
        hypothesisResolutions
      });
      console.info("recommendation_update_evaluated", {
        plantId: plant.id,
        persistedAnalysisId: persistedAnalysis.id,
        decision: evaluation.decision,
        meaningfulChangeReasons: evaluation.meaningfulChangeReasons
      });
      if (evaluation.decision === "refresh_required") {
        setPhotoAssessment({ status: "updating_recommendations" });
        const refreshResult = await updateRecommendations({
          sourceAnalysis: persistedAnalysis,
          photosForAnalysis: mergePhotosForRecommendationRefresh({ coverPhoto, currentPhotos: photos, savedPhotos }),
          localPhotoFiles: freshRecommendationPhotos,
          restartIfLoading: true,
          contextSnapshot: buildRecommendationContextSnapshot({
            plant,
            homes,
            rooms,
            milestones,
            careEvents,
            hypothesisResolutions,
            weather: weatherContext,
            analyses: [persistedAnalysis, ...analyses.filter((item) => item.id !== persistedAnalysis.id)],
            currentRevision: currentRecommendationRevision
          })
        });
        if (refreshResult === "failed" || refreshResult === "skipped") {
          setPhotoAssessment({ status: "failed", message: photoAssessmentSavedButRefreshFailedMessage(locale), retryPhotos: selectedPhotos, savedPhotos, changes: comparisonChanges });
          return;
        }
        console.info("photo_assessment_completed", { plantId: plant.id, photoCount: savedPhotos.length, durationMs: Date.now() - startedAt, recommendationUpdate: refreshResult });
        setPhotoAssessment({ status: refreshResult === "unchanged" ? "completed_no_change" : "completed_updated", message: refreshResult === "unchanged" ? photoAssessmentNoChangeMessage(locale) : photoAssessmentUpdatedMessage(locale), changes: comparisonChanges });
        return;
      }
      console.info("photo_assessment_completed", { plantId: plant.id, photoCount: savedPhotos.length, durationMs: Date.now() - startedAt, recommendationUpdate: evaluation.decision });
      setPhotoAssessment({ status: "completed_no_change", message: photoAssessmentNoChangeMessage(locale), changes: comparisonChanges.length ? comparisonChanges : [message] });
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

  const updateRecommendations = async (
    input: {
      sourceAnalysis?: PlantAnalysisRecord;
      contextSnapshot?: RecommendationContextSnapshot;
      changedContext?: RecommendationChangedContext;
      photosForAnalysis?: PlantPhoto[];
      localPhotoFiles?: LocalRecommendationPhoto[];
      restartIfLoading?: boolean;
      successStatus?: "success" | "unchanged";
    } = {}
  ): Promise<"success" | "unchanged" | "failed" | "skipped"> => {
    const sourceAnalysis = input.sourceAnalysis ?? analysis;
    const sourceContextSnapshot = input.contextSnapshot ?? activeRecommendationContextSnapshot;
    const photosForAnalysis = input.photosForAnalysis ?? mergePhotosForRecommendationRefresh({ coverPhoto, currentPhotos: photos });
    if ((visibleRecommendationRefreshState.status === "loading" && !input.restartIfLoading) || !photosForAnalysis.length || !sourceAnalysis) {
      return "skipped";
    }

    const runId = recommendationRefreshRunIdRef.current + 1;
    recommendationRefreshRunIdRef.current = runId;
    dispatchRecommendationRefresh({ type: "start", plantId: plant.id });
    const abortController = new AbortController();
    recommendationRefreshAbortRef.current?.abort();
    recommendationRefreshAbortRef.current = abortController;
    let didTimeout = false;
    const timeoutId = window.setTimeout(() => {
      didTimeout = true;
      abortController.abort();
      if (activePlantIdRef.current === plant.id && recommendationRefreshRunIdRef.current === runId) {
        dispatchRecommendationRefresh({ type: "error", plantId: plant.id, error: t("plantAnalysis.refreshFailedInline") });
      }
    }, recommendationRefreshTimeoutMs);
    const startedAt = Date.now();
    const userProvidedSpeciesContext = recommendationSpeciesContextFromPlant(plant, sourceAnalysis);
    console.info("recommendation_refresh_started", {
      plantId: plant.id,
      revisionIdBefore: currentRecommendationRevision?.id ?? null,
      hasUserProvidedSpecies: Boolean(userProvidedSpeciesContext?.displayName)
    });
    try {
      const formData = new FormData();
      let includedPhotoCount = 0;
      const localPhotoIds = new Set(input.localPhotoFiles?.map((photo) => photo.id) ?? []);
      for (const localPhoto of input.localPhotoFiles ?? []) {
        const blob = localPhoto.file;
        formData.append("photos", blob);
        formData.append("photoTypes", localPhoto.type);
        formData.append("photoSources", localPhoto.source);
        formData.append("clientFileNames", blob.name || `${localPhoto.id}.jpg`);
        formData.append("clientMimeTypes", blob.type || "image/jpeg");
        formData.append("clientExtensions", "jpg");
        formData.append("clientByteSizes", String(blob.size));
        formData.append("clientDecodeSucceeded", "true");
        formData.append("clientWidths", "");
        formData.append("clientHeights", "");
        formData.append("clientExifOrientations", "");
        formData.append("clientPhysicallyRotated", "true");
        formData.append("clientOrientationSources", "saved_normalized_photo");
        formData.append("clientDebugIds", localPhoto.id);
        includedPhotoCount += 1;
      }

      for (const photo of photosForAnalysis.filter((item) => !localPhotoIds.has(item.id))) {
        const url = (await ensureFullPhotoUrl(photo.id)) ?? photo.url ?? photo.thumbnailUrl;
        if (!url) {
          continue;
        }
        const response = await fetch(url);
        if (!response.ok) {
          console.warn("recommendation_refresh_photo_fetch_skipped", {
            plantId: plant.id,
            photoId: photo.id,
            status: response.status
          });
          continue;
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
        includedPhotoCount += 1;
      }

      if (includedPhotoCount === 0) {
        throw new Error("saved_photo_fetch_failed");
      }

      formData.append("locale", locale);
      formData.append("analysisMode", "recommendation_refresh");
      formData.append("currentCommonName", plant.speciesName ?? "");
      formData.append("currentScientificName", plant.scientificName ?? "");
      formData.append("currentDetectedSpecies", [plant.speciesName, plant.scientificName].filter(Boolean).join(" "));
      formData.append("userProvidedSpecies", JSON.stringify(userProvidedSpeciesContext));
      formData.append("currentLightCondition", plant.lightConditionKey ? t(plant.lightConditionKey) : "");
      formData.append("environmentContext", formatEnvironmentContextForPrompt(buildPlantEnvironmentContext({ plant, homes, rooms, weather: weatherContext })));
      const changedContext = changedContextSince(currentRecommendationRevision?.contextSnapshot, sourceContextSnapshot, {
        previousPromptVersion: currentRecommendationRevision?.promptVersion,
        currentPromptVersion: RECOMMENDATION_PROMPT_VERSION,
        previousModelVersion: currentRecommendationRevision?.modelVersion
      });
      const effectiveChangedContext = input.changedContext ?? changedContext;
      const reasonType = reasonTypeFromChangedContext(effectiveChangedContext);
      const refreshReason = recommendationRefreshReason(effectiveChangedContext, sourceContextSnapshot, locale, t);
      formData.append(
        "previousAnalysis",
        JSON.stringify({
          ...compactPreviousRecommendation(displayAnalysis, {
            previousContextSnapshot: currentRecommendationRevision?.contextSnapshot,
            changedContext: effectiveChangedContext,
            reasonType,
            userProvidedSpecies: userProvidedSpeciesContext
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
          analysisId: sourceAnalysis.id,
          model: payload?.model ?? "unknown"
        });
      }
      if (!response.ok || !payload?.ok || !payload.analysis) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "recommendation_refresh_failed");
      }

      const persistenceStartedAt = performance.now();
      const revisionResult = await saveRecommendationRevision(plant.id, {
        analysisId: sourceAnalysis.id,
        recommendations: Array.isArray(payload.analysis.recommendations) ? payload.analysis.recommendations : [],
        structuredResult: {
          ...payload.analysis,
          recommendationRefresh: {
            refreshedAt: new Date().toISOString(),
            reason: refreshReason,
            sourceAnalysisId: sourceAnalysis.id,
            sourcePhotoIds: photosForAnalysis.map((photo) => photo.id),
            changedContext: effectiveChangedContext
          }
        },
        reasonType,
        reasonText: refreshReason,
        changedContext: effectiveChangedContext,
        contextSnapshot: sourceContextSnapshot,
        promptVersion: RECOMMENDATION_PROMPT_VERSION,
        recommendationVersion: RECOMMENDATION_VERSION,
        modelVersion: typeof payload.model === "string" ? payload.model : undefined,
        impactLevel: payload.analysis.recommendationImpact?.impactLevel,
        changeSummary: payload.analysis.recommendationImpact?.changeSummary
      });
      recordAddPlantPerformanceStage("recommendation_enrichment_persistence", performance.now() - persistenceStartedAt, {
        plantId: plant.id,
        analysisId: sourceAnalysis.id,
        unchanged: Boolean(revisionResult.unchanged)
      });
      console.info("recommendation_refresh_completed", {
        plantId: plant.id,
        photoCount: photosForAnalysis.length,
        durationMs: Date.now() - startedAt,
        revisionIdBefore: currentRecommendationRevision?.id ?? null,
        revisionIdAfter: revisionResult.revisionId,
        hasUserProvidedSpecies: Boolean(userProvidedSpeciesContext?.displayName)
      });
      if (!didTimeout && activePlantIdRef.current === plant.id && recommendationRefreshRunIdRef.current === runId) {
        dispatchRecommendationRefresh({ type: revisionResult.unchanged ? "unchanged" : input.successStatus ?? "success", plantId: plant.id });
      }
      return revisionResult.unchanged ? "unchanged" : "success";
    } catch (error) {
      const wasAborted = error instanceof DOMException && error.name === "AbortError";
      console.warn("recommendation_refresh_failed", {
        plantId: plant.id,
        revisionIdBefore: currentRecommendationRevision?.id ?? null,
        hasUserProvidedSpecies: Boolean(userProvidedSpeciesContext?.displayName),
        message: wasAborted ? "recommendation_refresh_timeout_or_abort" : error instanceof Error ? error.message : "Unknown error",
        durationMs: Date.now() - startedAt
      });
      if (!didTimeout && activePlantIdRef.current === plant.id && recommendationRefreshRunIdRef.current === runId) {
        dispatchRecommendationRefresh({ type: "error", plantId: plant.id, error: userProvidedSpeciesContext ? t("plantAnalysis.userSpeciesRefreshFailed") : t("plantAnalysis.refreshFailedInline") });
      }
      return "failed";
    } finally {
      window.clearTimeout(timeoutId);
      if (recommendationRefreshAbortRef.current === abortController && recommendationRefreshRunIdRef.current === runId) {
        recommendationRefreshAbortRef.current = null;
      }
    }
  };

  return (
    <main className={`mx-auto min-h-screen w-full max-w-[430px] bg-cream px-5 ${careActionState?.isActionable ? "pb-[calc(9rem+env(safe-area-inset-bottom))]" : "pb-10"}`}>
      <RecommendationAutoRefresh
        shouldRefresh={recommendationsAreStale && !photoAssessmentBlocksAutoRefresh}
        refreshKey={recommendationRefreshKey}
        status={visibleRecommendationRefreshState.status}
        onRefresh={() => void updateRecommendations()}
        onReset={() => dispatchRecommendationRefresh({ type: "reset", plantId: plant.id })}
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
      <PlantStatusSection plant={plant} careActionState={careActionState} analysis={displayAnalysis} milestones={milestones} followUps={allFollowUps} hasActiveQuestion={Boolean(conversationalState.question)} />
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
            {photoAssessmentMessage(photoAssessment.status, locale, "message" in photoAssessment ? photoAssessment.message : undefined)}
          </p>
          {"changes" in photoAssessment && photoAssessment.changes?.length ? (
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
      {activePhotoFollowUp || completedPhotoFollowUp ? (
        <section className="mt-4 rounded-[24px] bg-white/80 p-4 shadow-soft">
          <p className="text-xs font-bold uppercase text-[#78906c]">{t("followUps.title")}</p>
          {activePhotoFollowUp ? (
            <>
              <p className="mt-1 text-sm font-extrabold leading-5 text-[#3f5f37]">
                {followUpIsDue(activePhotoFollowUp)
                  ? t("followUps.dueTitle")
                  : t("followUps.scheduledTitle").replace("{days}", String(Math.max(1, daysUntilDate(activePhotoFollowUp.dueAt))))}
              </p>
              <p className="mt-1 text-sm font-bold leading-5 text-[#6f665d]">{t(`followUps.reason.${activePhotoFollowUp.reason}` as never)}</p>
              <button
                type="button"
                onClick={() => setSheet("add_photo")}
                className="mt-3 min-h-11 rounded-[18px] bg-[#ddf2dc] px-4 text-sm font-extrabold text-[#2d7a4f]"
              >
                {t("followUps.addPhoto")}
              </button>
            </>
          ) : completedPhotoFollowUp ? (
            <>
              <p className="mt-1 text-sm font-extrabold leading-5 text-[#3f5f37]">
                {t(followUpResultLabelKey(completedPhotoFollowUp.result) as never)}
              </p>
              {localized(completedPhotoFollowUp.summary, locale) ? (
                <p className="mt-1 text-sm font-bold leading-5 text-[#6f665d]">{localized(completedPhotoFollowUp.summary, locale)}</p>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}
      <PlantAnalysisSection
        key={plant.id}
        analysis={displayAnalysis}
        plant={plant}
        milestones={milestones}
        hypothesisResolutions={hypothesisResolutions}
        onResolveHypothesis={completeClarificationAnswer}
        recommendationRefreshState={visibleRecommendationRefreshState}
        hasPendingBaselineQuestions={Boolean(baselineQuestion)}
        careActionState={careActionState}
        onKnowSpecies={() => router.push(`/plants/${plant.id}/edit`)}
        onAddPhoto={() => setSheet("add_photo")}
        onRetryRecommendationRefresh={() => void updateRecommendations()}
      />
      {currentRecommendationRevision?.reasonText && !recommendationsAreStale && visibleRecommendationRefreshState.status === "success" && currentRecommendationRevision.impactLevel && currentRecommendationRevision.impactLevel !== "none" ? (
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
      <CareHistory events={historyTimeline} onAddEvent={() => setSheet("add_event")} />
      {plantDebugData ? <PlantDetailDebugPanel data={plantDebugData} /> : null}

      {careActionState?.isActionable ? <PrimaryCareAction plant={plant} actionState={careActionState} onAction={openPrimaryAction} disabled={isCompletingAction} /> : null}
      {sheet === "check_soil" ? (
        <CheckSoilSheet
          onClose={() => setSheet(null)}
          onWatered={() => void completeWatering()}
          isSaving={isCompletingAction}
          plant={plant}
          milestones={milestones}
          hypothesisResolutions={hypothesisResolutions}
          room={assignedRoom}
          weather={weatherContext}
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
            setPhotoAssessment({ status: "uploading_photos" });
            try {
              const savedPhotos = await addPlantPhotos(plant.id, selectedPhotos);
              setSheet(null);
              void analyzeNewPhotos(selectedPhotos, savedPhotos);
            } catch (error) {
              setPhotoAssessment({ status: "idle" });
              throw error;
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
