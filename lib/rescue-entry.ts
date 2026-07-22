import { cleanPlantName } from "./plant-display";

export type RescueEntryAnalysisSignal = {
  confidence?: number | null;
  detectedSpecies?: string | null;
  condition?: string | null;
  plantStatus?: string | null;
  urgency?: string | null;
  rawResult?: unknown;
};

function nameFromUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const localized = value as { en?: unknown; ru?: unknown };
    if (typeof localized.en === "string") return localized.en;
    if (typeof localized.ru === "string") return localized.ru;
  }
  return "";
}

export function isUnknownPlantName(value: unknown) {
  const normalized = cleanPlantName(nameFromUnknown(value)).toLocaleLowerCase();
  return (
    !normalized ||
    normalized === "unknown plant" ||
    normalized === "unknown" ||
    normalized === "plant i’m learning" ||
    normalized === "plant i'm learning" ||
    normalized === "plant in recovery" ||
    normalized === "неизвестное растение" ||
    normalized === "неизвестно" ||
    normalized === "растение, которое я изучаю" ||
    normalized === "растение на восстановлении"
  );
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
