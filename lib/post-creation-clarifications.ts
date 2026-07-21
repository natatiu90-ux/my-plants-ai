export type PostCreationClarificationStep = "watering" | "repotting" | "sunlight";

type LocalizedText = { en?: string | null; ru?: string | null };

export type DirectSunClarificationAnalysisSignals = {
  primaryActionId?: string | null;
  statusReasonCode?: string | null;
  visibleObservations?: LocalizedText[];
  recommendations?: { en?: string | null; ru?: string | null; type?: string | null }[];
  clarificationQuestions?: { hypothesis?: string | null }[];
  visualEvidenceSnapshot?: {
    concerns?: unknown;
    affectedParts?: unknown;
    speciesCandidates?: unknown;
  } | null;
};

function localized(value: LocalizedText | undefined | null) {
  return [value?.en, value?.ru].filter(Boolean).join(" ");
}

function stringifyList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join(" ") : "";
}

function includesAny(text: string, words: string[]) {
  const value = text.toLocaleLowerCase();
  return words.some((word) => value.includes(word));
}

export function shouldAskDirectSunClarification(input: {
  hasAssignedRoom: boolean;
  roomDirectSun?: string | null;
  analysis?: DirectSunClarificationAnalysisSignals | null;
}) {
  if (!input.hasAssignedRoom || input.roomDirectSun) {
    return false;
  }

  const analysis = input.analysis;
  if (!analysis) {
    return false;
  }

  if (analysis.statusReasonCode === "possible_light_stress") {
    return true;
  }

  if (analysis.primaryActionId === "move_to_indirect_light" || analysis.primaryActionId === "keep_current_light") {
    return true;
  }

  if (analysis.clarificationQuestions?.some((question) => question.hypothesis === "direct_sun")) {
    return true;
  }

  const text = [
    ...(analysis.visibleObservations ?? []).map(localized),
    ...(analysis.recommendations ?? []).map((item) => [item.en, item.ru, item.type].filter(Boolean).join(" ")),
    stringifyList(analysis.visualEvidenceSnapshot?.concerns),
    stringifyList(analysis.visualEvidenceSnapshot?.affectedParts)
  ].join(" ");

  return includesAny(text, [
    "sun",
    "direct light",
    "scorch",
    "burn",
    "bleach",
    "dry edge",
    "light stress",
    "солн",
    "прям",
    "ожог",
    "выгор",
    "сухие края",
    "стресс от освещения"
  ]);
}

export function nextPostCreationClarificationStep(input: {
  hasWateringBaseline: boolean;
  hasRepottingBaseline: boolean;
  hasAssignedRoom: boolean;
  roomDirectSun?: string | null;
  analysis?: DirectSunClarificationAnalysisSignals | null;
}): PostCreationClarificationStep | null {
  if (!input.hasWateringBaseline) {
    return "watering";
  }

  if (!input.hasRepottingBaseline) {
    return "repotting";
  }

  if (
    shouldAskDirectSunClarification({
      hasAssignedRoom: input.hasAssignedRoom,
      roomDirectSun: input.roomDirectSun,
      analysis: input.analysis
    })
  ) {
    return "sunlight";
  }

  return null;
}
