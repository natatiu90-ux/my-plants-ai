export const INITIAL_ADD_FAST_ANALYSIS_MODE = "initial_add_fast";
export const INITIAL_ADD_FAST_MAX_OUTPUT_TOKENS = 1800;
export const INITIAL_ADD_FAST_LLM_FIELDS = [
  "detectedSpecies",
  "commonName",
  "scientificName",
  "confidence",
  "growthHabit",
  "organVocabulary",
  "plantStatus",
  "urgency",
  "primaryActionId",
  "actionTimeframeId",
  "statusReasonCode",
  "condition",
  "visibleObservations",
  "nextAction",
  "nextCheckInDays",
  "clarificationQuestions",
  "visualEvidenceSnapshot"
] as const;

export const INITIAL_ADD_FAST_TEMPLATE_HYDRATED_FIELDS = ["primaryAction", "actionTimeframe", "statusReason", "summary", "recommendations"] as const;

export function isInitialAddFastAnalysisMode(mode: string | undefined | null) {
  return mode === INITIAL_ADD_FAST_ANALYSIS_MODE;
}

export function maxOutputTokensForAnalysisMode(mode: string | undefined | null, configuredMaxOutputTokens: number) {
  const safeConfiguredLimit = Number.isFinite(configuredMaxOutputTokens) && configuredMaxOutputTokens > 0 ? Math.round(configuredMaxOutputTokens) : 6000;
  return isInitialAddFastAnalysisMode(mode) ? Math.min(safeConfiguredLimit, INITIAL_ADD_FAST_MAX_OUTPUT_TOKENS) : safeConfiguredLimit;
}

export function shouldStartRecommendationEnrichment(input: { sourceAnalysisMode?: string | null; hasCurrentRevision: boolean }) {
  return isInitialAddFastAnalysisMode(input.sourceAnalysisMode) && !input.hasCurrentRevision;
}
