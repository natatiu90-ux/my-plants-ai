import type { PlantAnalysisRecord, SpeciesIdentificationStatus } from "@/types/plant";
import { cleanPlantName, cleanScientificName } from "./plant-display";
import { isUnknownPlantName } from "./rescue-entry";

type LocalizedName = { en?: string | null; ru?: string | null };

export type SpeciesLearningInput = {
  detectedSpecies?: unknown;
  commonName?: unknown;
  scientificName?: unknown;
  confidence?: unknown;
  growthHabit?: unknown;
  organVocabulary?: unknown;
  visualEvidenceSnapshot?: unknown;
};

export type SpeciesLearningState = NonNullable<NonNullable<PlantAnalysisRecord["rawResult"]>["speciesIdentification"]>;

function localizedName(value: unknown) {
  if (typeof value === "string") return cleanPlantName(value);
  if (value && typeof value === "object") {
    const name = value as LocalizedName;
    return cleanPlantName(name.en) || cleanPlantName(name.ru);
  }
  return "";
}

function confidenceValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
}

function snapshotCandidates(value: unknown) {
  if (!value || typeof value !== "object") return [];
  const candidates = (value as { speciesCandidates?: unknown }).speciesCandidates;
  return Array.isArray(candidates) ? candidates.map((candidate) => cleanPlantName(String(candidate))).filter((candidate) => candidate && !isUnknownPlantName(candidate)) : [];
}

function broadLabelFromGrowthHabit(value: unknown) {
  if (typeof value !== "string" || value === "unknown") return "";
  const labels: Record<string, string> = {
    foliage: "Foliage houseplant",
    cactus: "Cactus or desert succulent",
    succulent: "Succulent",
    orchid: "Orchid",
    vine: "Vining plant",
    palm: "Palm-like plant"
  };
  return labels[value] ?? "";
}

function unique(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

export function buildSpeciesLearningState(input: SpeciesLearningInput, now = new Date()): SpeciesLearningState {
  const confidence = confidenceValue(input.confidence);
  const scientificName = cleanScientificName(typeof input.scientificName === "string" ? input.scientificName : "");
  const commonName = localizedName(input.commonName);
  const detectedSpecies = cleanPlantName(typeof input.detectedSpecies === "string" ? input.detectedSpecies : "");
  const broadLabel = broadLabelFromGrowthHabit(input.growthHabit);
  const candidates = unique([
    ...snapshotCandidates(input.visualEvidenceSnapshot),
    scientificName,
    commonName,
    detectedSpecies,
    broadLabel
  ]).filter((candidate) => !isUnknownPlantName(candidate));

  const bestSpeciesLabel = scientificName || commonName || detectedSpecies;
  const currentLabel = !isUnknownPlantName(bestSpeciesLabel) && confidence != null && confidence >= 0.62 ? bestSpeciesLabel : candidates[0] || broadLabel || null;
  const status: SpeciesIdentificationStatus =
    confidence != null && confidence >= 0.88 && bestSpeciesLabel
      ? "confident"
      : confidence != null && confidence >= 0.62 && currentLabel
        ? "probable"
        : "learning";

  const organVocabulary = Array.isArray(input.organVocabulary) ? input.organVocabulary.map(String).filter(Boolean).slice(0, 5) : [];
  const evidence = [
    broadLabel ? { type: "growth_habit" as const, label: broadLabel } : null,
    ...organVocabulary.map((organ) => ({ type: "visual" as const, label: organ })),
    candidates[0] ? { type: "visual" as const, label: candidates[0] } : null
  ].filter((item): item is { type: "growth_habit" | "visual"; label: string } => Boolean(item));

  return {
    status,
    currentLabel,
    confidence,
    candidates: candidates.slice(0, 4).map((candidate, index) => ({
      label: candidate,
      confidence: index === 0 ? confidence : null,
      source: index === 0 && candidate === bestSpeciesLabel ? "ai_visual" : "derived"
    })),
    userConfirmation: null,
    evidence: unique(evidence.map((item) => `${item.type}:${item.label}`)).map((item) => {
      const [type, ...labelParts] = item.split(":");
      return { type: type as "growth_habit" | "visual", label: labelParts.join(":") };
    }),
    updatedAt: now.toISOString(),
    source: "analysis"
  };
}

export function speciesLearningStateFromAnalysis(analysis: PlantAnalysisRecord | undefined | null): SpeciesLearningState | null {
  if (!analysis?.rawResult) return null;
  const existing = analysis.rawResult.speciesIdentification;
  if (existing?.status && Array.isArray(existing.candidates) && Array.isArray(existing.evidence)) {
    return existing;
  }
  return buildSpeciesLearningState(analysis.rawResult);
}

export function isStillLearningSpecies(state: SpeciesLearningState | null | undefined) {
  return Boolean(state && (state.status === "learning" || state.status === "probable" || (typeof state.confidence === "number" && state.confidence < 0.7)));
}
