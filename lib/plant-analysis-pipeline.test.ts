import {
  INITIAL_ADD_FAST_ANALYSIS_MODE,
  INITIAL_ADD_FAST_LLM_FIELDS,
  INITIAL_ADD_FAST_MAX_OUTPUT_TOKENS,
  INITIAL_ADD_FAST_TEMPLATE_HYDRATED_FIELDS,
  isInitialAddFastAnalysisMode,
  maxOutputTokensForAnalysisMode,
  shouldStartRecommendationEnrichment
} from "./plant-analysis-pipeline";

if (!isInitialAddFastAnalysisMode(INITIAL_ADD_FAST_ANALYSIS_MODE)) {
  throw new Error("Expected initial_add_fast to be recognized as the fast initial analysis mode.");
}

if (maxOutputTokensForAnalysisMode(INITIAL_ADD_FAST_ANALYSIS_MODE, 6000) !== INITIAL_ADD_FAST_MAX_OUTPUT_TOKENS) {
  throw new Error("Expected initial add fast output tokens to be capped below the full recommendation limit.");
}

if (maxOutputTokensForAnalysisMode("recommendation_refresh", 6000) !== 6000) {
  throw new Error("Expected recommendation refresh to keep the configured full output token limit.");
}

if (!shouldStartRecommendationEnrichment({ sourceAnalysisMode: INITIAL_ADD_FAST_ANALYSIS_MODE, hasCurrentRevision: false })) {
  throw new Error("Expected a fast initial analysis without a current revision to start enrichment.");
}

if (shouldStartRecommendationEnrichment({ sourceAnalysisMode: INITIAL_ADD_FAST_ANALYSIS_MODE, hasCurrentRevision: true })) {
  throw new Error("Expected enrichment to be skipped when a current revision already exists.");
}

if (shouldStartRecommendationEnrichment({ sourceAnalysisMode: "recommendation_refresh", hasCurrentRevision: false })) {
  throw new Error("Expected non-fast analyses not to force recommendation enrichment.");
}

const forbiddenStage1Fields = ["summary", "recommendations", "primaryAction", "actionTimeframe", "statusReason", "aboutSpecies", "reasoning", "alternativeCauses", "hypotheses", "recommendationImpact"];
for (const field of forbiddenStage1Fields) {
  if ((INITIAL_ADD_FAST_LLM_FIELDS as readonly string[]).includes(field)) {
    throw new Error(`Expected initial add fast LLM schema not to require generated ${field}.`);
  }
}

for (const field of ["primaryAction", "actionTimeframe", "statusReason", "summary", "recommendations"]) {
  if (!(INITIAL_ADD_FAST_TEMPLATE_HYDRATED_FIELDS as readonly string[]).includes(field)) {
    throw new Error(`Expected ${field} to be template-hydrated outside the LLM response.`);
  }
}
