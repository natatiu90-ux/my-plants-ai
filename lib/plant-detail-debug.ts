import type { DerivedCareActionState } from "./plant-action-eligibility";
import type { DerivedPlantHealthStatus } from "./plant-health-status";
import { plantDetailAnalysisMode, type PlantDetailAnalysisContext } from "./plant-analysis-context";
import { evaluateRecommendationUpdate } from "./recommendation-update-decision";
import { changedContextSince, type RecommendationContextSnapshot } from "./recommendation-refresh";
import type { Plant, PlantAnalysisRecord, PlantCareEvent, PlantFollowUp, PlantHypothesisResolution, PlantMilestone, PlantPhoto, PlantRecommendationRevision } from "@/types/plant";
import type { PlantTimelineEvent } from "./plant-timeline";

type SecondaryLoadState = {
  startedAt?: string;
  completedAt?: string;
  authReady: boolean;
  userIdPresent: boolean;
  analyses: { attempted: boolean; loadedCount: number; errorCode?: string; errorMessage?: string };
  milestones: { attempted: boolean; loadedCount: number; errorCode?: string; errorMessage?: string };
  careEvents: { attempted: boolean; loadedCount: number; errorCode?: string; errorMessage?: string };
  followUps: { attempted: boolean; loadedCount: number; errorCode?: string; errorMessage?: string };
  recommendationRevisions: { attempted: boolean; loadedCount: number; errorCode?: string; errorMessage?: string };
  hypothesisResolutions: { attempted: boolean; loadedCount: number; errorCode?: string; errorMessage?: string };
};

type AnalysisDebugRow = {
  id: string;
  createdAt: string;
  analysisMode: string | null;
  condition: string;
  hasRawResult: boolean;
  hasRecommendations: boolean;
  hasRecoveryData: boolean;
  canBuildView: boolean;
};

export type PlantDetailDebugData = {
  plantId: string;
  plantStatus: string;
  secondaryDataReady: boolean;
  secondaryDataStatus: string;
  secondaryLoadState: SecondaryLoadState;
  analysesCount: number;
  analyses: AnalysisDebugRow[];
  latestAnalysisId: string | null;
  meaningfulAnalysisId: string | null;
  meaningfulAnalysisCondition: string | null;
  meaningfulAnalysisCanBuildView: boolean;
  recommendationRevisionAnalysisId: string | null;
  milestonesCount: number;
  milestoneTypes: string[];
  careEventsCount: number;
  careEventTypes: string[];
  activeFollowUpsCount: number;
  completedFollowUpsCount: number;
  photosCount: number;
  timelineCount: number;
  timelineKinds: string[];
  derivedHealthStatus: string | null;
  careActionState: {
    actionType: string;
    status: string;
    isActionable: boolean;
    dueAt: string | null;
    reason: string;
  } | null;
  recoveryContext: boolean;
  shouldRenderAnalysis: boolean;
  hiddenReason:
    | "not_hidden"
    | "secondary_data_not_ready"
    | "no_analyses_loaded"
    | "no_meaningful_analysis"
    | "legacy_analysis_not_mapped"
    | "view_builder_returned_null"
    | "recommendation_mismatch"
    | "no_presentable_content"
    | "unknown";
  recommendationUpdate: {
    persistedAnalysisId: string | null;
    analysisSaveStatus: "saved" | "missing";
    latestCheckinCreatedAt: string | null;
    currentRevisionId: string | null;
    currentRevisionAnalysisId: string | null;
    currentRevisionCreatedAt: string | null;
    decision: string;
    meaningfulChangeReasons: string[];
    staleReason: string | null;
    refreshStarted: boolean;
    refreshCompleted: boolean;
    refreshError: string | null;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function localizedExists(value: unknown) {
  if (typeof value === "string") return value.trim().length > 0;
  if (!isRecord(value)) return false;
  return typeof value.en === "string" || typeof value.ru === "string";
}

function hasArrayOrMissing(raw: Record<string, unknown> | undefined, key: string) {
  return raw?.[key] == null || Array.isArray(raw[key]);
}

function hasRecoveryData(analysis: PlantAnalysisRecord) {
  const raw = isRecord(analysis.rawResult) ? analysis.rawResult : undefined;
  const status = raw?.plantStatus;
  const urgency = raw?.urgency;
  const comparison = isRecord(raw?.photoComparison) ? raw.photoComparison : undefined;
  const recommendations = Array.isArray(analysis.recommendations) ? analysis.recommendations : [];
  return (
    analysis.condition === "needs_attention" ||
    analysis.condition === "check_soon" ||
    status === "adapting" ||
    status === "watch" ||
    status === "needs_attention" ||
    status === "action_needed" ||
    urgency === "observe" ||
    urgency === "soon" ||
    urgency === "today" ||
    Boolean(recommendations.length) ||
    Boolean(Array.isArray(raw?.careRightNow) && raw.careRightNow.length) ||
    Boolean(Array.isArray(raw?.hypotheses) && raw.hypotheses.length) ||
    Boolean(Array.isArray(comparison?.observationsWorsened) && comparison.observationsWorsened.length) ||
    Boolean(localizedExists(raw?.statusReason))
  );
}

export function canBuildPlantAnalysisView(analysis?: PlantAnalysisRecord) {
  if (!analysis) return false;
  const raw = isRecord(analysis.rawResult) ? analysis.rawResult : undefined;
  return (
    Array.isArray(analysis.recommendations) &&
    hasArrayOrMissing(raw, "visibleObservations") &&
    hasArrayOrMissing(raw, "uncertainties") &&
    hasArrayOrMissing(raw, "careRightNow") &&
    hasArrayOrMissing(raw, "hypotheses") &&
    hasArrayOrMissing(raw, "clarificationQuestions")
  );
}

function hiddenReason(input: {
  secondaryDataReady: boolean;
  secondaryDataStatus: string;
  secondaryLoadState: SecondaryLoadState;
  analysesCount: number;
  meaningfulAnalysis?: PlantAnalysisRecord;
  meaningfulAnalysisCanBuildView: boolean;
  revision?: PlantRecommendationRevision;
}): PlantDetailDebugData["hiddenReason"] {
  if (!input.secondaryDataReady) return "secondary_data_not_ready";
  if (input.analysesCount === 0) return "no_analyses_loaded";
  if (!input.meaningfulAnalysis) return "no_meaningful_analysis";
  if (input.revision && input.revision.analysisId !== input.meaningfulAnalysis.id) return "recommendation_mismatch";
  if (!input.meaningfulAnalysisCanBuildView) return "legacy_analysis_not_mapped";
  return "not_hidden";
}

export function buildPlantDetailDebugData(input: {
  plant: Plant;
  secondaryDataReady: boolean;
  secondaryDataStatus: string;
  secondaryLoadState: SecondaryLoadState;
  analyses: PlantAnalysisRecord[];
  analysisContext: PlantDetailAnalysisContext;
  recommendationRevision?: PlantRecommendationRevision;
  milestones: PlantMilestone[];
  careEvents: PlantCareEvent[];
  followUps: PlantFollowUp[];
  photos: PlantPhoto[];
  timeline: PlantTimelineEvent[];
  derivedHealthStatus?: DerivedPlantHealthStatus | null;
  careActionState?: DerivedCareActionState | null;
  hypothesisResolutions?: PlantHypothesisResolution[];
  recommendationContextSnapshot?: RecommendationContextSnapshot;
  recommendationRefreshStatus?: string;
  recommendationRefreshError?: string;
}): PlantDetailDebugData {
  const meaningfulAnalysisCanBuildView = canBuildPlantAnalysisView(input.analysisContext.meaningfulAnalysis);
  const shouldRenderAnalysis = Boolean(input.analysisContext.meaningfulAnalysis && meaningfulAnalysisCanBuildView);
  const activeFollowUps = input.followUps.filter((followUp) => followUp.status === "scheduled" || followUp.status === "due");
  const completedFollowUps = input.followUps.filter((followUp) => followUp.status === "completed");
  const latestCheckin = input.analyses.find((analysis) => analysis.plantId === input.plant.id && plantDetailAnalysisMode(analysis) === "plant_checkin");
  const updateEvaluation = evaluateRecommendationUpdate({
    checkin: latestCheckin,
    previousMeaningfulAnalysis: input.analysisContext.meaningfulAnalysis?.id === latestCheckin?.id ? input.analysisContext.latestAnalysis : input.analysisContext.meaningfulAnalysis,
    currentRevision: input.recommendationRevision,
    followUps: input.followUps,
    milestones: input.milestones,
    hypothesisResolutions: input.hypothesisResolutions
  });
  const staleReason =
    input.recommendationContextSnapshot && input.recommendationRevision
      ? Object.entries(
          changedContextSince(input.recommendationRevision.contextSnapshot, input.recommendationContextSnapshot, {
            previousPromptVersion: input.recommendationRevision.promptVersion,
            currentPromptVersion: input.recommendationRevision.promptVersion
          })
        )
          .flatMap(([section, values]) =>
            Object.entries(values).filter(([, changed]) => changed).map(([key]) => `${section}.${key}`)
          )
          .join(", ") || null
      : latestCheckin && !input.recommendationRevision
        ? "no_current_revision"
        : null;

  return {
    plantId: input.plant.id,
    plantStatus: input.plant.status,
    secondaryDataReady: input.secondaryDataReady,
    secondaryDataStatus: input.secondaryDataStatus,
    secondaryLoadState: input.secondaryLoadState,
    analysesCount: input.analyses.length,
    analyses: input.analyses.map((analysis) => ({
      id: analysis.id,
      createdAt: analysis.createdAt,
      analysisMode: plantDetailAnalysisMode(analysis),
      condition: analysis.condition,
      hasRawResult: Boolean(analysis.rawResult),
      hasRecommendations: Boolean(Array.isArray(analysis.recommendations) && analysis.recommendations.length),
      hasRecoveryData: hasRecoveryData(analysis),
      canBuildView: canBuildPlantAnalysisView(analysis)
    })),
    latestAnalysisId: input.analysisContext.latestAnalysis?.id ?? null,
    meaningfulAnalysisId: input.analysisContext.meaningfulAnalysis?.id ?? null,
    meaningfulAnalysisCondition: input.analysisContext.meaningfulAnalysis?.condition ?? null,
    meaningfulAnalysisCanBuildView,
    recommendationRevisionAnalysisId: input.recommendationRevision?.analysisId ?? null,
    milestonesCount: input.milestones.length,
    milestoneTypes: input.milestones.map((milestone) => milestone.type),
    careEventsCount: input.careEvents.length,
    careEventTypes: input.careEvents.map((event) => event.type),
    activeFollowUpsCount: activeFollowUps.length,
    completedFollowUpsCount: completedFollowUps.length,
    photosCount: input.photos.length,
    timelineCount: input.timeline.length,
    timelineKinds: input.timeline.map((event) => event.kind),
    derivedHealthStatus: input.derivedHealthStatus?.status ?? null,
    careActionState: input.careActionState
      ? {
          actionType: input.careActionState.actionType,
          status: input.careActionState.status,
          isActionable: input.careActionState.isActionable,
          dueAt: input.careActionState.dueAt ?? null,
          reason: input.careActionState.reason
        }
      : null,
    recoveryContext: input.analysisContext.recoveryContext,
    shouldRenderAnalysis,
    hiddenReason: shouldRenderAnalysis
      ? "not_hidden"
      : hiddenReason({
          secondaryDataReady: input.secondaryDataReady,
          secondaryDataStatus: input.secondaryDataStatus,
          secondaryLoadState: input.secondaryLoadState,
          analysesCount: input.analyses.length,
          meaningfulAnalysis: input.analysisContext.meaningfulAnalysis,
          meaningfulAnalysisCanBuildView,
          revision: input.recommendationRevision
        }),
    recommendationUpdate: {
      persistedAnalysisId: latestCheckin?.id ?? null,
      analysisSaveStatus: latestCheckin ? "saved" : "missing",
      latestCheckinCreatedAt: latestCheckin?.createdAt ?? null,
      currentRevisionId: input.recommendationRevision?.id ?? null,
      currentRevisionAnalysisId: input.recommendationRevision?.analysisId ?? null,
      currentRevisionCreatedAt: input.recommendationRevision?.createdAt ?? null,
      decision: updateEvaluation.decision,
      meaningfulChangeReasons: updateEvaluation.meaningfulChangeReasons,
      staleReason,
      refreshStarted: input.recommendationRefreshStatus === "loading",
      refreshCompleted: input.recommendationRefreshStatus === "success" || input.recommendationRefreshStatus === "unchanged",
      refreshError: input.recommendationRefreshError ?? null
    }
  };
}
