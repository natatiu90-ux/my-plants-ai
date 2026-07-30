import type { PlantAnalysisRecord, PlantFollowUp, PlantHypothesisResolution, PlantMilestone, PlantRecommendationRevision } from "@/types/plant";

export type RecommendationUpdateDecision = "refresh_required" | "no_meaningful_change" | "insufficient_data" | "refresh_failed";

export type RecommendationUpdateEvaluation = {
  decision: RecommendationUpdateDecision;
  meaningfulChangeReasons: string[];
};

function localized(value: { en?: string | null; ru?: string | null } | string | null | undefined) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return [value.en, value.ru].filter(Boolean).join(" ");
}

function analysisMode(analysis?: PlantAnalysisRecord) {
  const mode = analysis?.rawResult?.analysisMode;
  return typeof mode === "string" ? mode : null;
}

function textFromAnalysis(analysis?: PlantAnalysisRecord) {
  if (!analysis) return "";
  return [
    localized(analysis.summary),
    ...analysis.recommendations.map((item) => [item.type, item.priority, item.en, item.ru].filter(Boolean).join(" ")),
    localized(analysis.rawResult?.primaryAction),
    localized(analysis.rawResult?.actionTimeframe),
    localized(analysis.rawResult?.statusReason),
    localized(analysis.rawResult?.reasoning?.currentSituation)
  ]
    .join(" ")
    .toLowerCase();
}

function hasItems(value: unknown) {
  return Array.isArray(value) && value.some((item) => String(item ?? "").trim().length > 0);
}

function normalizedAction(action: unknown) {
  return action === "none" ? null : action ?? null;
}

function rawString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function previousCondition(input: {
  previousMeaningfulAnalysis?: PlantAnalysisRecord;
  currentRevision?: PlantRecommendationRevision;
}) {
  const structured = input.currentRevision?.structuredResult;
  if (typeof structured?.condition === "string") return structured.condition;
  return input.previousMeaningfulAnalysis?.condition ?? null;
}

function previousNextAction(input: {
  previousMeaningfulAnalysis?: PlantAnalysisRecord;
  currentRevision?: PlantRecommendationRevision;
}) {
  const structured = input.currentRevision?.structuredResult;
  if ("nextAction" in (structured ?? {})) return normalizedAction(structured?.nextAction);
  return normalizedAction(input.previousMeaningfulAnalysis?.nextAction);
}

export function checkinHasMeaningfulChange(input: {
  checkin?: PlantAnalysisRecord;
  previousMeaningfulAnalysis?: PlantAnalysisRecord;
  currentRevision?: PlantRecommendationRevision;
  followUps?: PlantFollowUp[];
  milestones?: PlantMilestone[];
  hypothesisResolutions?: PlantHypothesisResolution[];
}) {
  return evaluateRecommendationUpdate(input).decision === "refresh_required";
}

export function evaluateRecommendationUpdate(input: {
  checkin?: PlantAnalysisRecord;
  previousMeaningfulAnalysis?: PlantAnalysisRecord;
  currentRevision?: PlantRecommendationRevision;
  followUps?: PlantFollowUp[];
  milestones?: PlantMilestone[];
  hypothesisResolutions?: PlantHypothesisResolution[];
}): RecommendationUpdateEvaluation {
  const checkin = input.checkin;
  if (!checkin || analysisMode(checkin) !== "plant_checkin") {
    return { decision: "insufficient_data", meaningfulChangeReasons: ["missing_checkin"] };
  }

  const raw = checkin.rawResult;
  const comparison = raw?.photoComparison;
  const reasons: string[] = [];
  const previousStatus = previousCondition(input);
  const previousAction = previousNextAction(input);
  const checkinStatus = rawString(raw?.plantStatus) ?? checkin.condition;
  const checkinUrgency = rawString(raw?.urgency);
  const checkinAction = normalizedAction(checkin.nextAction ?? raw?.nextAction);
  const checkinResult = rawString(raw?.checkinResult);

  if (previousStatus && checkin.condition && previousStatus !== checkin.condition) {
    reasons.push("condition_changed");
  }
  if (previousAction !== checkinAction) {
    reasons.push("next_action_changed");
  }
  if (checkinResult === "improved" || checkinResult === "worse") {
    reasons.push(`checkin_${checkinResult}`);
  }
  if (checkinStatus === "needs_attention" || checkinStatus === "action_needed") {
    reasons.push("status_requires_attention");
  }
  if (checkinUrgency === "soon" || checkinUrgency === "today") {
    reasons.push("urgency_changed");
  }
  if (hasItems(comparison?.observationsAdded)) reasons.push("observations_added");
  if (hasItems(comparison?.observationsImproved)) reasons.push("observations_improved");
  if (hasItems(comparison?.observationsWorsened)) reasons.push("observations_worsened");
  if (hasItems(comparison?.hypothesesChanged)) reasons.push("hypotheses_changed");
  if (hasItems(comparison?.recommendationChanges)) reasons.push("recommendation_changes");
  if ((input.followUps ?? []).some((followUp) => followUp.status === "due" || followUp.status === "scheduled") && (checkinResult === "improved" || checkinResult === "worse")) {
    reasons.push("followup_result_changed");
  }
  if ((input.hypothesisResolutions ?? []).some((resolution) => resolution.status === "confirmed" || resolution.status === "unknown") && hasItems(comparison?.hypothesesChanged)) {
    reasons.push("hypothesis_resolution_context_changed");
  }

  const uniqueReasons = Array.from(new Set(reasons));
  if (uniqueReasons.length > 0) {
    return { decision: "refresh_required", meaningfulChangeReasons: uniqueReasons };
  }

  const reliableComparison = comparison?.reliableComparison;
  const checkinText = textFromAnalysis(checkin);
  if (reliableComparison === false && !checkinText) {
    return { decision: "insufficient_data", meaningfulChangeReasons: ["comparison_unclear"] };
  }

  return { decision: "no_meaningful_change", meaningfulChangeReasons: [] };
}
