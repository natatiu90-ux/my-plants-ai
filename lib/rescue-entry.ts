import { cleanPlantName } from "./plant-display";

export type RescueEntryAnalysisSignal = {
  confidence?: number | null;
  detectedSpecies?: string | null;
  condition?: string | null;
  plantStatus?: string | null;
  urgency?: string | null;
  rawResult?: unknown;
};

export function isUnknownPlantName(value: string | null | undefined) {
  const normalized = cleanPlantName(value).toLocaleLowerCase();
  return !normalized || normalized === "unknown plant" || normalized === "unknown" || normalized === "неизвестное растение" || normalized === "неизвестно";
}

export function shouldShowRescueEntry(input: {
  analysis: RescueEntryAnalysisSignal | null | undefined;
  commonName?: string | null;
  scientificName?: string | null;
}) {
  if (!input.analysis) {
    return false;
  }

  const raw = input.analysis.rawResult && typeof input.analysis.rawResult === "object" ? (input.analysis.rawResult as Record<string, unknown>) : {};
  const snapshot = raw.visualEvidenceSnapshot && typeof raw.visualEvidenceSnapshot === "object" ? (raw.visualEvidenceSnapshot as Record<string, unknown>) : {};
  const severity = snapshot.severity;
  const concerns = snapshot.concerns;
  const hasVisibleConcern = Array.isArray(concerns) && concerns.length > 0;
  const problemStatus =
    input.analysis.condition === "needs_attention" ||
    input.analysis.plantStatus === "needs_attention" ||
    input.analysis.plantStatus === "action_needed" ||
    raw.plantStatus === "needs_attention" ||
    raw.plantStatus === "action_needed" ||
    input.analysis.urgency === "soon" ||
    input.analysis.urgency === "today" ||
    raw.urgency === "soon" ||
    raw.urgency === "today" ||
    severity === "moderate" ||
    severity === "severe" ||
    hasVisibleConcern;

  return problemStatus;
}
