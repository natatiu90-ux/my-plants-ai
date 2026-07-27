import type { Plant, PlantAnalysisRecord, PlantFollowUp, PlantHypothesisResolution, PlantMilestone } from "@/types/plant";

type AnalysisMode = "initial" | "plant_checkin" | string | null;

export type PlantDetailAnalysisContext = {
  latestAnalysis?: PlantAnalysisRecord;
  meaningfulAnalysis?: PlantAnalysisRecord;
  recoveryContext: boolean;
  hiddenReason: "not_hidden" | "secondary_data_loading" | "no_analysis" | "no_meaningful_context";
};

function localized(value: { en?: string | null; ru?: string | null } | string | null | undefined) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return [value.en, value.ru].filter(Boolean).join(" ");
}

function analysisMode(analysis?: PlantAnalysisRecord): AnalysisMode {
  const value = analysis?.rawResult?.analysisMode;
  return typeof value === "string" ? value : null;
}

function analysisText(analysis?: PlantAnalysisRecord) {
  if (!analysis) return "";
  const raw = analysis.rawResult;
  return [
    localized(analysis.summary),
    ...analysis.recommendations.map((item) => [item.en, item.ru].filter(Boolean).join(" ")),
    ...(raw?.visibleObservations ?? []).map(localized),
    ...(raw?.uncertainties ?? []).map(localized),
    ...(raw?.careRightNow ?? []).map((item) => [localized(item.action), localized(item.reason)].join(" ")),
    localized(raw?.primaryAction),
    localized(raw?.actionTimeframe),
    localized(raw?.statusReason),
    localized(raw?.reasoning?.currentSituation),
    raw?.photoComparison?.observationsWorsened?.join(" "),
    raw?.photoComparison?.hypothesesChanged?.join(" ")
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function includesAny(value: string, patterns: string[]) {
  return patterns.some((pattern) => value.includes(pattern));
}

function hasConcernText(analysis?: PlantAnalysisRecord) {
  const text = analysisText(analysis);
  return includesAny(text, [
    "yellow",
    "curl",
    "wilt",
    "pest",
    "disease",
    "rot",
    "damage",
    "decline",
    "dry",
    "brown",
    "prun",
    "recover",
    "stress",
    "желт",
    "скруч",
    "вян",
    "вредител",
    "болез",
    "гнил",
    "повреж",
    "ухудш",
    "сух",
    "корич",
    "обрез",
    "восстанов",
    "стресс"
  ]);
}

function hasMeaningfulRecommendation(analysis?: PlantAnalysisRecord) {
  if (!analysis) return false;
  if (analysis.recommendations.length > 0) return true;
  return Boolean(analysis.rawResult?.careRightNow?.length || localized(analysis.rawResult?.primaryAction) || localized(analysis.rawResult?.reasoning?.currentSituation));
}

function isRecoveryAnalysis(analysis?: PlantAnalysisRecord) {
  if (!analysis) return false;
  const rawStatus = analysis.rawResult?.plantStatus;
  const urgency = analysis.rawResult?.urgency;
  return (
    analysis.condition === "needs_attention" ||
    analysis.condition === "check_soon" ||
    rawStatus === "adapting" ||
    rawStatus === "watch" ||
    rawStatus === "needs_attention" ||
    rawStatus === "action_needed" ||
    urgency === "observe" ||
    urgency === "soon" ||
    urgency === "today" ||
    hasConcernText(analysis) ||
    hasMeaningfulRecommendation(analysis)
  );
}

function isGenericPositiveCheckin(analysis?: PlantAnalysisRecord) {
  if (!analysis) return false;
  const raw = analysis.rawResult;
  const positiveStatus = analysis.condition === "healthy" || raw?.plantStatus === "healthy";
  return analysisMode(analysis) === "plant_checkin" && positiveStatus && !hasMeaningfulRecommendation(analysis) && !hasConcernText(analysis);
}

function hasRecoveryMilestone(milestones: PlantMilestone[]) {
  return milestones.some((milestone) => milestone.type === "repotted" || milestone.type === "pruned" || milestone.type === "damaged" || milestone.type === "treatment_started" || milestone.type === "follow_up_completed");
}

function hasRecoveryFollowUp(followUps: PlantFollowUp[]) {
  return followUps.some((followUp) => followUp.reason === "after_repotting" || followUp.reason === "after_pruning" || followUp.reason === "recovery_monitoring");
}

function hasUnresolvedRecoverySignal(resolutions: PlantHypothesisResolution[]) {
  return resolutions.some((resolution) => resolution.status === "confirmed" || resolution.status === "unknown");
}

function byNewest(a: PlantAnalysisRecord, b: PlantAnalysisRecord) {
  return b.createdAt.localeCompare(a.createdAt);
}

export function selectPlantDetailAnalysisContext(input: {
  plant: Plant;
  analyses: PlantAnalysisRecord[];
  milestones?: PlantMilestone[];
  followUps?: PlantFollowUp[];
  hypothesisResolutions?: PlantHypothesisResolution[];
  secondaryDataReady?: boolean;
}): PlantDetailAnalysisContext {
  const analyses = [...input.analyses].filter((analysis) => analysis.plantId === input.plant.id).sort(byNewest);
  const latestAnalysis = analyses.find((analysis) => !analysis.resolvedAt) ?? analyses[0];
  const meaningfulAnalysis = analyses.find((analysis) => !isGenericPositiveCheckin(analysis) && isRecoveryAnalysis(analysis)) ?? latestAnalysis;
  const recoveryContext =
    input.plant.status === "needs_attention" ||
    input.plant.status === "check_soon" ||
    hasRecoveryMilestone(input.milestones ?? []) ||
    hasRecoveryFollowUp(input.followUps ?? []) ||
    hasUnresolvedRecoverySignal(input.hypothesisResolutions ?? []) ||
    analyses.some((analysis) => isRecoveryAnalysis(analysis) && !isGenericPositiveCheckin(analysis));

  const selected =
    latestAnalysis && isGenericPositiveCheckin(latestAnalysis) && recoveryContext && meaningfulAnalysis && meaningfulAnalysis.id !== latestAnalysis.id
      ? meaningfulAnalysis
      : latestAnalysis ?? meaningfulAnalysis;

  const shouldRender = Boolean(selected);
  const hiddenReason: PlantDetailAnalysisContext["hiddenReason"] = shouldRender
    ? "not_hidden"
    : !input.secondaryDataReady
      ? "secondary_data_loading"
      : analyses.length === 0
        ? "no_analysis"
        : "no_meaningful_context";

  return {
    latestAnalysis,
    meaningfulAnalysis: selected,
    recoveryContext,
    hiddenReason
  };
}

export function plantDetailAnalysisMode(analysis?: PlantAnalysisRecord) {
  return analysisMode(analysis);
}
