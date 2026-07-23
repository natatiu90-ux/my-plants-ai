import type { Locale } from "@/i18n/dictionaries";
import type { Plant, PlantAnalysisRecord, PlantHypothesis, PlantHypothesisResolution, PlantHypothesisStatus, PlantMilestone } from "@/types/plant";
import { isUnknownPlantName } from "./rescue-entry";
import { soilCheckResultFromClarificationAnswer } from "./soil-check-completion";

type LocalizedText = { en?: string | null; ru?: string | null };
type RawClarificationQuestion = {
  hypothesis?: PlantHypothesis;
  question?: LocalizedText;
  options?: { label?: LocalizedText; status?: PlantHypothesisStatus; result?: string }[];
  reasonForAsking?: LocalizedText;
};
type RawHypothesis = {
  type?: PlantHypothesis;
  status?: "supported" | "possible" | "unlikely" | "resolved";
  canUserAnswerChangeRecommendation?: boolean;
  clarificationQuestion?: {
    question?: LocalizedText;
    options?: { label?: LocalizedText; status?: PlantHypothesisStatus; result?: string }[];
    reasonForAsking?: LocalizedText;
  };
};
type VisualEvidenceSnapshot = {
  concerns?: unknown;
  severity?: unknown;
};

export type ConversationalCareQuestion = {
  hypothesis: PlantHypothesis;
  question: string;
  reason: string;
  options: { label: string; status: PlantHypothesisStatus; result: string }[];
};

export type ConversationalGuidedAction = {
  type: "pruning" | "repotting";
};

export type ConversationalCareState = {
  enabled: boolean;
  reason: "normal_care" | "known_problem" | "unknown_with_concern" | "clarification_needed";
  goodNews: string | null;
  concern: string | null;
  caution: string | null;
  question: ConversationalCareQuestion | null;
  todayActions: string[];
  guidedAction: ConversationalGuidedAction | null;
};

function localized(value: LocalizedText | undefined | null, locale: Locale) {
  return value?.[locale] || value?.en || value?.ru || "";
}

function includesAny(value: string, words: string[]) {
  const normalized = value.toLocaleLowerCase();
  return words.some((word) => normalized.includes(word));
}

function unique(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function resolutionFor(resolutions: PlantHypothesisResolution[], hypothesis: PlantHypothesis) {
  return resolutions.find((resolution) => resolution.hypothesis === hypothesis);
}

function severity(raw: PlantAnalysisRecord["rawResult"]) {
  const snapshot = raw?.visualEvidenceSnapshot as VisualEvidenceSnapshot | undefined;
  const value = snapshot?.severity;
  return value === "moderate" || value === "severe" || value === "minor" || value === "none" ? value : "unknown";
}

function concerns(raw: PlantAnalysisRecord["rawResult"]) {
  const snapshot = raw?.visualEvidenceSnapshot as VisualEvidenceSnapshot | undefined;
  return Array.isArray(snapshot?.concerns) ? snapshot.concerns.map(String).filter(Boolean) : [];
}

function hasMeaningfulConcern(raw: PlantAnalysisRecord["rawResult"]) {
  return concerns(raw).length > 0 || severity(raw) === "moderate" || severity(raw) === "severe";
}

function speciesIsUnknown(analysis: PlantAnalysisRecord) {
  const raw = analysis.rawResult;
  return isUnknownPlantName(raw?.detectedSpecies as string | undefined) && isUnknownPlantName(raw?.scientificName as string | undefined) && isUnknownPlantName(raw?.commonName as string | undefined);
}

function questionPriority(hypothesis: PlantHypothesis) {
  const priorities: Record<PlantHypothesis, number> = {
    soil_condition: 10,
    direct_sun: 9,
    pests: 8,
    repotting: 7,
    root_condition: 6,
    drainage: 5
  };
  return priorities[hypothesis] ?? 0;
}

function canonicalClarificationOption(
  hypothesis: PlantHypothesis,
  option: { label?: LocalizedText; status?: PlantHypothesisStatus; result?: string },
  locale: Locale
) {
  const label = localized(option.label, locale);
  if (hypothesis === "soil_condition") {
    try {
      const result = soilCheckResultFromClarificationAnswer(option.result ?? label);
      return {
        label,
        status: result === "not_sure" ? "unknown" : result === "slightly_damp" ? "ruled_out" : "confirmed",
        result
      };
    } catch {
      return null;
    }
  }

  return {
    label,
    status: option.status,
    result: option.result
  };
}

function questionFromRawQuestion(
  item: RawClarificationQuestion | undefined,
  locale: Locale
): ConversationalCareQuestion | null {
  if (!item?.hypothesis || !item.question) return null;
  const question = localized(item.question, locale);
  const reason = localized(item.reasonForAsking, locale);
  const options =
    item.options
      ?.map((option) => canonicalClarificationOption(item.hypothesis!, option, locale))
      .filter((option): option is { label: string; status: PlantHypothesisStatus; result: string } => Boolean(option?.label && option.status && option.result)) ?? [];

  return question && options.length ? { hypothesis: item.hypothesis, question, reason, options } : null;
}

function questionFromHypothesis(
  item: RawHypothesis | undefined,
  locale: Locale
): ConversationalCareQuestion | null {
  if (!item?.type || !item.canUserAnswerChangeRecommendation || item.status === "resolved" || item.status === "unlikely") return null;
  const question = localized(item.clarificationQuestion?.question, locale);
  const reason = localized(item.clarificationQuestion?.reasonForAsking, locale);
  const options =
    item.clarificationQuestion?.options
      ?.map((option) => canonicalClarificationOption(item.type!, option, locale))
      .filter((option): option is { label: string; status: PlantHypothesisStatus; result: string } => Boolean(option?.label && option.status && option.result)) ?? [];

  return question && options.length ? { hypothesis: item.type, question, reason, options } : null;
}

function selectQuestion(analysis: PlantAnalysisRecord, resolutions: PlantHypothesisResolution[], locale: Locale) {
  const raw = analysis.rawResult;
  const rawQuestions = ((raw?.clarificationQuestions ?? []) as RawClarificationQuestion[]).map((item) => questionFromRawQuestion(item, locale)).filter((item): item is ConversationalCareQuestion => Boolean(item));
  const hypothesisQuestions = ((raw?.hypotheses ?? []) as RawHypothesis[]).map((item) => questionFromHypothesis(item, locale)).filter((item): item is ConversationalCareQuestion => Boolean(item));

  return [...rawQuestions, ...hypothesisQuestions]
    .filter((question) => !resolutionFor(resolutions, question.hypothesis))
    .sort((a, b) => questionPriority(b.hypothesis) - questionPriority(a.hypothesis))[0] ?? null;
}

function lifeSignal(observations: string[], concernsText: string, locale: Locale) {
  const text = [...observations, concernsText].join(" ");
  if (!includesAny(text, ["new growth", "new leaf", "fresh growth", "green growth", "живой", "новый рост", "новые листья", "зелёный рост"])) {
    return null;
  }

  return locale === "ru" ? "Я вижу живой новый рост — это хороший знак." : "I can see living new growth — that is a good sign.";
}

function visibleConcern(observations: string[], rawConcerns: string[], locale: Locale) {
  const text = unique([...observations, ...rawConcerns]).find((item) =>
    includesAny(item, ["dry", "fallen", "damaged", "yellow", "brown", "wilt", "сух", "опал", "повреж", "желт", "корич", "вян"])
  );
  if (text) return text;
  if (rawConcerns.length) return rawConcerns[0];
  return locale === "ru" ? "Видны признаки стресса, но причина пока не ясна." : "There are visible signs of stress, but the cause is not clear yet.";
}

function safeCaution(raw: PlantAnalysisRecord["rawResult"], locale: Locale) {
  const actions = raw?.careRightNow?.map((item) => localized(item.action, locale)).filter(Boolean) ?? [];
  const joined = actions.join(" ");
  const avoidWater = includesAny(joined, ["do not water", "don't water", "не поливай", "не спеши с полив"]);
  const avoidRepot = includesAny(joined, ["do not repot", "don't repot", "не пересаж"]);
  if (avoidWater && avoidRepot) return locale === "ru" ? "Пока не поливай и не пересаживай. Сначала уточним одну вещь." : "Do not water or repot yet. Let’s check one thing first.";
  if (avoidWater) return locale === "ru" ? "Не спеши поливать. Сначала уточним одну вещь." : "Do not rush to water. Let’s check one thing first.";
  if (avoidRepot) return locale === "ru" ? "Пока не пересаживай — растению лучше не добавлять стресс." : "Do not repot yet — it is better not to add stress.";
  return null;
}

function todayActions(analysis: PlantAnalysisRecord, question: ConversationalCareQuestion | null, locale: Locale) {
  const raw = analysis.rawResult;
  const actions = raw?.careRightNow?.map((item) => localized(item.action, locale)).filter(Boolean) ?? [];
  const fallback =
    question?.hypothesis === "soil_condition"
      ? [locale === "ru" ? "Проверь почву перед поливом." : "Check the soil before watering."]
      : question?.hypothesis === "direct_sun"
        ? [locale === "ru" ? "Проверь, попадало ли на растение прямое солнце." : "Check whether direct sun reached the plant."]
        : [];
  const safeActions = unique([...actions, ...fallback]).filter((action) => {
    const text = action.toLocaleLowerCase();
    const saysWater = includesAny(text, ["water now", "полей", "полить"]);
    const saysDoNotWater = includesAny(text, ["do not water", "don't water", "не поливай"]);
    return !(saysWater && saysDoNotWater);
  });
  return safeActions.slice(0, 3);
}

function guidedAction(analysis: PlantAnalysisRecord, milestones: PlantMilestone[]) {
  const raw = analysis.rawResult;
  const text = [
    ...(raw?.careRightNow?.map((item) => `${item.type ?? ""} ${item.priority ?? ""} ${item.action?.en ?? ""} ${item.action?.ru ?? ""} ${item.reason?.en ?? ""} ${item.reason?.ru ?? ""}`) ?? []),
    ...(analysis.recommendations.map((item) => `${item.type ?? ""} ${item.en ?? ""} ${item.ru ?? ""}`) ?? [])
  ].join(" ");
  const recentlyRepotted = milestones.some((milestone) => milestone.type === "repotted" && milestone.eventDate);
  if (includesAny(text, ["prune", "cut dry", "обрез", "срезать сух"])) return { type: "pruning" as const };
  if (!recentlyRepotted && includesAny(text, ["repot", "пересад"])) return { type: "repotting" as const };
  return null;
}

export function deriveConversationalCareState(input: {
  analysis?: PlantAnalysisRecord;
  plant: Plant;
  milestones: PlantMilestone[];
  hypothesisResolutions: PlantHypothesisResolution[];
  locale: Locale;
}): ConversationalCareState {
  const { analysis, locale } = input;
  if (!analysis) {
    return { enabled: false, reason: "normal_care", goodNews: null, concern: null, caution: null, question: null, todayActions: [], guidedAction: null };
  }

  const raw = analysis.rawResult;
  const rawSeverity = severity(raw);
  const visualConcern = hasMeaningfulConcern(raw);
  const status = raw?.plantStatus;
  const urgency = raw?.urgency;
  const question = selectQuestion(analysis, input.hypothesisResolutions, locale);
  const unknownWithConcern = speciesIsUnknown(analysis) && visualConcern;
  const enabled =
    status === "needs_attention" ||
    status === "action_needed" ||
    urgency === "soon" ||
    urgency === "today" ||
    rawSeverity === "moderate" ||
    rawSeverity === "severe" ||
    unknownWithConcern ||
    Boolean(question && visualConcern);

  if (!enabled) {
    return { enabled: false, reason: "normal_care", goodNews: null, concern: null, caution: null, question: null, todayActions: [], guidedAction: null };
  }

  const observations = raw?.visibleObservations?.map((item) => localized(item, locale)).filter(Boolean) ?? [];
  const rawConcerns = concerns(raw);
  return {
    enabled: true,
    reason: unknownWithConcern ? "unknown_with_concern" : question ? "clarification_needed" : "known_problem",
    goodNews: lifeSignal(observations, rawConcerns.join(" "), locale),
    concern: visibleConcern(observations, rawConcerns, locale),
    caution: safeCaution(raw, locale),
    question,
    todayActions: todayActions(analysis, question, locale),
    guidedAction: guidedAction(analysis, input.milestones)
  };
}
