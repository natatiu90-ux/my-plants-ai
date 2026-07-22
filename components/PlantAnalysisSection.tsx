"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { formatRelativeDate } from "@/lib/date-format";
import { deriveConversationalCareState } from "@/lib/conversational-care";
import { isStillLearningSpecies, speciesLearningStateFromAnalysis } from "@/lib/species-learning";
import { useI18n } from "@/i18n/I18nProvider";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { DerivedCareActionState } from "@/lib/plant-action-eligibility";
import { completedFactLabel } from "@/lib/plant-detail-recovery-presentation";
import type { Plant, PlantAnalysisRecord, PlantHypothesis, PlantHypothesisResolution, PlantHypothesisStatus, PlantMilestone } from "@/types/plant";
import { AnswerChips } from "./AnswerChips";
import type { RecommendationRefreshState } from "@/lib/recommendation-refresh-state";

type HypothesisView = {
  id: PlantHypothesis | "recent_repotting_context";
  confidence: number;
  text: string;
  status: "active" | "confirmed" | "ruled_out";
};

type FollowUpView = {
  hypothesis: PlantHypothesis;
  question: string;
  reason: string;
  options: { label: string; status: PlantHypothesisStatus; result: string }[];
};

type StructuredHypothesis = {
  type?: PlantHypothesis;
  status?: "supported" | "possible" | "unlikely" | "resolved";
  confidence?: number;
  canUserAnswerChangeRecommendation?: boolean;
  clarificationQuestion?: {
    question?: { en?: string | null; ru?: string | null };
    options?: { label?: { en?: string | null; ru?: string | null }; status?: PlantHypothesisStatus; result?: string }[];
    reasonForAsking?: { en?: string | null; ru?: string | null };
  } | null;
};

type RecommendationDensity = "healthy" | "minor" | "serious";

function localized(value: { en?: string | null; ru?: string | null } | undefined, locale: "en" | "ru") {
  return value?.[locale] || value?.en || value?.ru || "";
}

function daysSince(dateKey?: string) {
  if (!dateKey) return null;
  const date = new Date(`${dateKey.slice(0, 10)}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - date.getTime()) / (24 * 60 * 60 * 1000)));
}

function includesAny(text: string, words: string[]) {
  const value = text.toLocaleLowerCase();
  return words.some((word) => value.includes(word));
}

function isPortulacariaAfra(plant: Plant) {
  const value = `${plant.scientificName ?? ""} ${plant.speciesName ?? ""}`.toLocaleLowerCase();
  return value.includes("portulacaria afra") || value.includes("портулакар") || value.includes("слонов");
}

function observationHasConditionValue(text: string) {
  return includesAny(text, [
    "dry",
    "brown",
    "yellow",
    "edge",
    "patch",
    "scorch",
    "bleach",
    "firm",
    "healthy",
    "new leaf",
    "сух",
    "корич",
    "желт",
    "кра",
    "пятн",
    "ожог",
    "упруг",
    "здоров",
    "нов"
  ]);
}

function resolutionFor(resolutions: PlantHypothesisResolution[], hypothesis: PlantHypothesis) {
  return resolutions.find((resolution) => resolution.hypothesis === hypothesis);
}

function statusFromResolution(resolution: PlantHypothesisResolution | undefined): HypothesisView["status"] {
  if (resolution?.status === "confirmed") return "confirmed";
  if (resolution?.status === "ruled_out") return "ruled_out";
  return "active";
}

function unique(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function firstNonEmpty(items: string[]) {
  return items.find((item) => item.trim()) ?? "";
}

function cleanObservationText(item: string, t: (key: TranslationKey) => string) {
  return item
    .replace(`${t("plantAnalysis.observationNormalPrefix")} `, "")
    .replace(`${t("plantAnalysis.observationNeutralPrefix")} `, "")
    .replace(`${t("plantAnalysis.observationPossibleConcernPrefix")} `, "")
    .replace(/\.$/, "")
    .trim();
}

function classifyObservation(item: string, t: (key: TranslationKey) => string) {
  if (includesAny(item, ["healthy", "firm", "new leaf", "здоров", "упруг", "нов"])) {
    return cleanObservationText(item, t);
  }
  if (includesAny(item, ["dry", "brown", "yellow", "edge", "patch", "scorch", "bleach", "сух", "корич", "желт", "кра", "пятн", "ожог"])) {
    return cleanObservationText(item, t);
  }
  return cleanObservationText(item, t);
}

function conclusionForSoilResult(result: string | undefined, t: (key: TranslationKey) => string) {
  if (result === "dry") return t("plantAnalysis.conclusionSoilDry");
  if (result === "slightly_damp") return t("plantAnalysis.conclusionSoilMoist");
  if (result === "very_wet") return t("plantAnalysis.conclusionSoilWet");
  if (result === "not_sure" || result === "unsure") return t("plantAnalysis.conclusionSoilUnsure");
  return "";
}

function conclusionForResolution(resolution: PlantHypothesisResolution | undefined, t: (key: TranslationKey) => string) {
  if (!resolution) return "";

  if (resolution.hypothesis === "pests") {
    if (resolution.status === "ruled_out") return t("plantAnalysis.conclusionNoPests");
    if (resolution.status === "confirmed") return t("plantAnalysis.conclusionPestsFound");
    return t("plantAnalysis.conclusionPestsUnsure");
  }

  if (resolution.hypothesis === "soil_condition") {
    return conclusionForSoilResult(resolution.userResult, t);
  }

  if (resolution.hypothesis === "repotting") {
    if (resolution.userResult === "recently") return t("plantAnalysis.conclusionRecentRepot");
    if (resolution.userResult === "long_ago") return t("plantAnalysis.conclusionOldRepot");
    return t("plantAnalysis.conclusionRepotUnsure");
  }

  if (resolution.hypothesis === "root_condition") {
    if (resolution.status === "ruled_out") return t("plantAnalysis.conclusionRootsNormal");
    if (resolution.status === "confirmed") return t("plantAnalysis.conclusionRootsConcern");
    return t("plantAnalysis.conclusionRootsUnsure");
  }

  if (resolution.hypothesis === "direct_sun") {
    if (resolution.userResult === "yes" || resolution.userResult === "sometimes") return t("plantAnalysis.conclusionDirectSun");
    if (resolution.userResult === "no") return t("plantAnalysis.conclusionNoDirectSun");
    return t("plantAnalysis.conclusionSunUnsure");
  }

  if (resolution.hypothesis === "drainage") {
    if (resolution.userResult === "yes") return t("plantAnalysis.conclusionDrainageYes");
    if (resolution.userResult === "no") return t("plantAnalysis.conclusionDrainageNo");
    return t("plantAnalysis.conclusionDrainageUnsure");
  }

  return "";
}

function mentionsHarshDirectSunAction(action: string) {
  const value = action.toLocaleLowerCase();
  const mentionsDirectSun = value.includes("direct sun") || value.includes("прям") || value.includes("солнц");
  const explicitlySafeLight = value.includes("indirect") || value.includes("diffused") || value.includes("рассеян");
  return mentionsDirectSun && !explicitlySafeLight;
}

function validateCurrentActions(actions: string[], context: { sunStressActive: boolean; sunRuledOut: boolean }) {
  return actions.filter((action) => {
    if (mentionsHarshDirectSunAction(action)) {
      return false;
    }

    if (context.sunRuledOut && action.toLocaleLowerCase().includes("sun")) {
      return false;
    }

    return true;
  });
}

function structuredHypothesesFrom(rawResult: PlantAnalysisRecord["rawResult"] | undefined) {
  return Array.isArray(rawResult?.hypotheses) ? (rawResult.hypotheses as StructuredHypothesis[]) : [];
}

function structuredFor(hypotheses: StructuredHypothesis[], type: PlantHypothesis) {
  return hypotheses.find((hypothesis) => hypothesis.type === type);
}

function structuredConfidence(hypothesis: StructuredHypothesis | undefined, fallback: number) {
  return typeof hypothesis?.confidence === "number" ? hypothesis.confidence : fallback;
}

function structuredStatus(hypothesis: StructuredHypothesis | undefined, fallback: HypothesisView["status"]) {
  if (!hypothesis) return fallback;
  if (hypothesis.status === "resolved") return "confirmed";
  if (hypothesis.status === "unlikely") return "ruled_out";
  return "active";
}

function canAskStructuredQuestion(hypothesis: StructuredHypothesis | undefined, threshold: number) {
  return Boolean(
    hypothesis?.canUserAnswerChangeRecommendation &&
      typeof hypothesis.confidence === "number" &&
      hypothesis.confidence >= threshold &&
      hypothesis.clarificationQuestion?.question &&
      hypothesis.clarificationQuestion.options?.length
  );
}

function structuredFollowUp(hypothesis: StructuredHypothesis | undefined, locale: "en" | "ru"): FollowUpView | null {
  if (!hypothesis?.type || !hypothesis.clarificationQuestion) return null;
  const question = localized(hypothesis.clarificationQuestion.question, locale);
  const reason = localized(hypothesis.clarificationQuestion.reasonForAsking, locale);
  const options =
    hypothesis.clarificationQuestion.options
      ?.map((option) => ({
        label: localized(option.label, locale),
        status: option.status,
        result: option.result
      }))
      .filter((option): option is { label: string; status: PlantHypothesisStatus; result: string } => Boolean(option.label && option.status && option.result)) ?? [];

  if (!question || !options.length) return null;
  return {
    hypothesis: hypothesis.type,
    question,
    reason,
    options
  };
}

function recommendationDensity(analysis: PlantAnalysisRecord, activeHypotheses: HypothesisView[], followUpNeeded: boolean): RecommendationDensity {
  if (analysis.condition === "needs_attention" || activeHypotheses.some((hypothesis) => hypothesis.confidence >= 0.75) || followUpNeeded) {
    return "serious";
  }

  if (analysis.condition === "check_soon" || activeHypotheses.length > 0) {
    return "minor";
  }

  return "healthy";
}

function SpeciesLearningCard({ analysis, onKnowSpecies, onAddPhoto }: { analysis?: PlantAnalysisRecord; onKnowSpecies?: () => void; onAddPhoto?: () => void }) {
  const { t } = useI18n();
  const state = speciesLearningStateFromAnalysis(analysis);
  if (!isStillLearningSpecies(state)) return null;

  return (
    <div className="min-w-0 rounded-[20px] bg-white/50 p-3">
      <p className="text-xs font-bold uppercase text-[#6f8c62]">{t("plantAnalysis.learningTitle")}</p>
      <p className="mt-1 text-sm font-bold leading-5 text-[#5f594f]">{t("plantAnalysis.learningIntro")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {onKnowSpecies ? (
          <button type="button" onClick={onKnowSpecies} className="min-h-10 rounded-[16px] bg-[#ddf2dc] px-3 text-sm font-extrabold text-[#2d7a4f]">
            {t("plantAnalysis.learningKnowName")}
          </button>
        ) : null}
        {onAddPhoto ? (
          <button type="button" onClick={onAddPhoto} className="min-h-10 rounded-[16px] bg-white/80 px-3 text-sm font-extrabold text-[#5f594f]">
            {t("plantAnalysis.learningAddPhoto")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function latestResolution(resolutions: PlantHypothesisResolution[]) {
  return [...resolutions].sort((a, b) => (b.resolvedAt ?? b.createdAt).localeCompare(a.resolvedAt ?? a.createdAt))[0];
}

export function PlantAnalysisSection({
  analysis,
  plant,
  milestones,
  hypothesisResolutions,
  onResolveHypothesis,
  recommendationRefreshState,
  hasPendingBaselineQuestions = false,
  careActionState,
  onKnowSpecies,
  onAddPhoto
}: {
  analysis?: PlantAnalysisRecord;
  plant: Plant;
  milestones: PlantMilestone[];
  hypothesisResolutions: PlantHypothesisResolution[];
  onResolveHypothesis: (hypothesis: PlantHypothesis, status: PlantHypothesisStatus, result: string) => Promise<void>;
  recommendationRefreshState?: RecommendationRefreshState;
  hasPendingBaselineQuestions?: boolean;
  careActionState?: DerivedCareActionState | null;
  onKnowSpecies?: () => void;
  onAddPhoto?: () => void;
}) {
  const { locale, t } = useI18n();
  const [savingAnswerKey, setSavingAnswerKey] = useState<string | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [showOtherCauses, setShowOtherCauses] = useState(false);
  const [openGuide, setOpenGuide] = useState<"pruning" | "repotting" | null>(null);

  const conversationalState = useMemo(
    () => deriveConversationalCareState({ analysis, plant, milestones, hypothesisResolutions, locale }),
    [analysis, hypothesisResolutions, locale, milestones, plant]
  );
  const completedFact = completedFactLabel({
    resolution: latestResolution(hypothesisResolutions),
    translate: t,
    conclusionFor: (resolution) => conclusionForResolution(resolution, t)
  });
  const canonicalActionText = careActionState ? t(careActionState.detailMessageKey, careActionState.detailMessageParams) : "";

  const view = useMemo(() => {
    if (!analysis) return null;

    const observations = analysis.rawResult?.visibleObservations?.map((item) => localized(item, locale)).filter(Boolean) ?? [];
    const uncertainties = analysis.rawResult?.uncertainties?.map((item) => localized(item, locale)).filter(Boolean) ?? [];
    const recommendationTexts = analysis.recommendations.map((item) => item[locale] || item.en || item.ru || "").filter(Boolean);
    const combinedTextWithoutUncertainty = [localized(analysis.summary, locale), ...observations, ...recommendationTexts].join(" ");
    const combinedText = [combinedTextWithoutUncertainty, ...uncertainties].join(" ");
    const recentRepot = milestones
      .filter((milestone) => milestone.type === "repotted" && milestone.eventDate)
      .sort((a, b) => (b.eventDate ?? "").localeCompare(a.eventDate ?? ""))[0];
    const repotDate = recentRepot?.eventDate;
    const repottedDaysAgo = daysSince(repotDate ?? undefined);
    const wasRepottedRecently = repottedDaysAgo != null && repottedDaysAgo <= 21;
    const pestsResolution = resolutionFor(hypothesisResolutions, "pests");
    const noPests = pestsResolution?.status === "ruled_out";
    const pestsConfirmed = pestsResolution?.status === "confirmed";
    const sunResolution = resolutionFor(hypothesisResolutions, "direct_sun");
    const oldSoilResolution = resolutionFor(hypothesisResolutions, "repotting");
    const wateringResolution = resolutionFor(hypothesisResolutions, "soil_condition");
    const drainageResolution = resolutionFor(hypothesisResolutions, "drainage");
    const rootResolution = resolutionFor(hypothesisResolutions, "root_condition");
    const rootsReportedNormal = rootResolution?.status === "ruled_out";
    const rootsConcernConfirmed = rootResolution?.status === "confirmed";
    const portulacaria = isPortulacariaAfra(plant);
    const normalLeafMorphology = includesAny(combinedText, ["small rounded", "rounded leaves", "paired", "мелк", "округл", "парами"]);
    const normalPortulacariaLeaves = portulacaria && normalLeafMorphology;
    const visibleSunDamage = includesAny(combinedText, [
      "scorch",
      "bleach",
      "dry patch",
      "dry edge",
      "brown edge",
      "damaged edge",
      "ожог",
      "выгор",
      "сухие участ",
      "сухие края",
      "коричневые края",
      "поврежден"
    ]);
    const sunMentioned =
      includesAny(combinedText, ["sun", "direct light", "bright window", "сол", "прям"]) &&
      (visibleSunDamage || sunResolution?.status === "confirmed");
    const wateringMentioned = includesAny(combinedText, ["water", "soil", "dry", "полив", "почв", "сух"]);
    const pestMentioned = includesAny(combinedText, ["pest", "mite", "insect", "вредител", "клещ", "насеком"]);
    const oldSoilMentioned = includesAny(combinedText, ["compacted", "old soil", "salt buildup", "пересад", "стар", "уплотнен", "сол"]);
    const drainageMentioned = includesAny(combinedText, ["drainage", "drain", "дренаж", "отверст"]);
    const rootMentioned = includesAny(combinedTextWithoutUncertainty, ["root", "roots", "корн"]);
    const soilCheckedToday = plant.lastSoilCheckedAt ? daysSince(plant.lastSoilCheckedAt) === 0 : false;
    const structuredHypotheses = structuredHypothesesFrom(analysis.rawResult);
    const structuredSoil = structuredFor(structuredHypotheses, "soil_condition");
    const structuredRepotting = structuredFor(structuredHypotheses, "repotting");
    const structuredRoots = structuredFor(structuredHypotheses, "root_condition");
    const structuredDrainage = structuredFor(structuredHypotheses, "drainage");
    const structuredSun = structuredFor(structuredHypotheses, "direct_sun");
    const structuredPests = structuredFor(structuredHypotheses, "pests");
    const structuredQuestionsEnabled = structuredHypotheses.length > 0;

    const hypotheses: HypothesisView[] = [
      {
        id: "direct_sun",
        confidence: sunResolution?.status === "confirmed" ? 0.9 : structuredConfidence(structuredSun, sunMentioned ? 0.72 : 0.2),
        text: t("plantAnalysis.causeSunStress"),
        status: statusFromResolution(sunResolution) !== "active" ? statusFromResolution(sunResolution) : structuredStatus(structuredSun, "active")
      },
      {
        id: "recent_repotting_context",
        confidence: wasRepottedRecently ? 0.68 : 0.18,
        text: t("plantAnalysis.causeRepotAdaptation"),
        status: wasRepottedRecently ? "confirmed" : "active"
      },
      {
        id: "soil_condition",
        confidence: structuredConfidence(structuredSoil, plant.nextAction === "water" || plant.nextAction === "check_soil" ? 0.7 : wateringMentioned ? 0.58 : 0.25),
        text: t("plantAnalysis.causeWatering"),
        status: statusFromResolution(wateringResolution) !== "active" ? statusFromResolution(wateringResolution) : structuredStatus(structuredSoil, "active")
      },
      {
        id: "pests",
        confidence: pestsConfirmed ? 0.82 : structuredConfidence(structuredPests, pestMentioned ? 0.45 : 0.15),
        text: t("plantAnalysis.causePests"),
        status: noPests ? "ruled_out" : pestsConfirmed ? "confirmed" : structuredStatus(structuredPests, "active")
      },
      {
        id: "root_condition",
        confidence: rootsConcernConfirmed ? 0.82 : structuredConfidence(structuredRoots, rootMentioned && wasRepottedRecently && !rootsReportedNormal ? 0.45 : 0.12),
        text: t("plantAnalysis.causeRoots"),
        status: rootsConcernConfirmed ? "confirmed" : rootsReportedNormal ? "ruled_out" : structuredStatus(structuredRoots, "active")
      },
      {
        id: "repotting",
        confidence: oldSoilResolution?.status === "confirmed" ? 0.72 : wasRepottedRecently ? 0.05 : structuredConfidence(structuredRepotting, oldSoilMentioned ? 0.48 : 0.15),
        text: t("plantAnalysis.causeOldSoil"),
        status: wasRepottedRecently ? "ruled_out" : statusFromResolution(oldSoilResolution) !== "active" ? statusFromResolution(oldSoilResolution) : structuredStatus(structuredRepotting, "active")
      },
      {
        id: "drainage",
        confidence: drainageResolution?.status === "confirmed" ? 0.66 : structuredConfidence(structuredDrainage, drainageMentioned ? 0.5 : 0.15),
        text: t("plantAnalysis.causeDrainage"),
        status: statusFromResolution(drainageResolution) !== "active" ? statusFromResolution(drainageResolution) : structuredStatus(structuredDrainage, "active")
      }
    ];

    const activeHypotheses = hypotheses
      .filter((hypothesis) => hypothesis.status !== "ruled_out" && hypothesis.confidence >= 0.55)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 1);
    const lowConfidenceHypotheses = hypotheses.filter((hypothesis) => hypothesis.status === "active" && hypothesis.confidence >= 0.35 && hypothesis.confidence < 0.55);
    const allMeaningfulObservations = unique([
      normalPortulacariaLeaves ? t("plantAnalysis.observationPortulacariaNormal") : "",
      visibleSunDamage ? t("plantAnalysis.observationOldDryDamage") : "",
      ...observations
        .filter((item) => observationHasConditionValue(item) && !(normalPortulacariaLeaves && includesAny(item, ["small rounded", "rounded leaves", "paired", "мелк", "округл", "парами"])))
        .map((item) => classifyObservation(item, t))
    ]).map((item) => cleanObservationText(item, t));
    const keyTakeaway =
      analysis.condition === "healthy" && activeHypotheses.length === 0
        ? t("plantAnalysis.statusLooksOkay")
        : wasRepottedRecently
          ? t("plantAnalysis.statusRecovering")
          : activeHypotheses.length === 0
            ? t("plantAnalysis.statusOldDamage")
            : plant.nextAction
              ? t("plantAnalysis.statusWatch")
              : t("plantAnalysis.statusStableWatch");
    const needsSoilQuestion = !wateringResolution && !soilCheckedToday && (structuredQuestionsEnabled ? canAskStructuredQuestion(structuredSoil, 0.45) : plant.nextAction === "check_soil" || plant.nextAction === "water" || wateringMentioned);
    const needsDrainageQuestion = !drainageResolution && (structuredQuestionsEnabled ? canAskStructuredQuestion(structuredDrainage, 0.45) : drainageMentioned && (wateringMentioned || plant.nextAction === "check_soil" || plant.nextAction === "water"));
    const followUp: FollowUpView | null = !pestsResolution && (structuredQuestionsEnabled ? canAskStructuredQuestion(structuredPests, 0.55) : pestMentioned)
      ? structuredFollowUp(structuredPests, locale) ?? { hypothesis: "pests" as const, question: t("plantAnalysis.questionPests"), reason: t("plantAnalysis.questionReasonPests"), options: [
          { label: t("plantAnalysis.answerYes"), status: "confirmed" as const, result: "yes" },
          { label: t("plantAnalysis.answerNo"), status: "ruled_out" as const, result: "no" },
          { label: t("plantAnalysis.answerUnsure"), status: "unknown" as const, result: "unsure" }
        ] }
      : !sunResolution && (structuredQuestionsEnabled ? canAskStructuredQuestion(structuredSun, 0.55) : sunMentioned)
        ? structuredFollowUp(structuredSun, locale) ?? { hypothesis: "direct_sun" as const, question: t("plantAnalysis.questionSun"), reason: t("plantAnalysis.questionReasonSun"), options: [
            { label: t("plantAnalysis.answerYes"), status: "confirmed" as const, result: "yes" },
            { label: t("plantAnalysis.answerNo"), status: "ruled_out" as const, result: "no" },
            { label: t("plantAnalysis.answerSometimes"), status: "confirmed" as const, result: "sometimes" },
            { label: t("plantAnalysis.answerUnsure"), status: "unknown" as const, result: "unsure" }
          ] }
        : needsSoilQuestion
          ? structuredFollowUp(structuredSoil, locale) ?? { hypothesis: "soil_condition" as const, question: t("plantAnalysis.questionSoil"), reason: t("plantAnalysis.questionReasonSoil"), options: [
              { label: t("plantAnalysis.answerSoilDry"), status: "confirmed" as const, result: "dry" },
              { label: t("plantAnalysis.answerSoilSlightlyDamp"), status: "ruled_out" as const, result: "slightly_damp" },
              { label: t("plantAnalysis.answerSoilVeryWet"), status: "confirmed" as const, result: "very_wet" },
              { label: t("plantAnalysis.answerUnsure"), status: "unknown" as const, result: "unsure" }
            ] }
          : wasRepottedRecently && !rootResolution && (structuredQuestionsEnabled ? canAskStructuredQuestion(structuredRoots, 0.55) : rootMentioned)
            ? structuredFollowUp(structuredRoots, locale) ?? { hypothesis: "root_condition" as const, question: t("plantAnalysis.questionRoots"), reason: t("plantAnalysis.questionReasonRoots"), options: [
                { label: t("plantAnalysis.answerRootsHealthy"), status: "ruled_out" as const, result: "healthy" },
                { label: t("plantAnalysis.answerRootsProblem"), status: "confirmed" as const, result: "dark_or_soft" },
                { label: t("plantAnalysis.answerRootsNotChecked"), status: "unknown" as const, result: "not_checked" },
                { label: t("plantAnalysis.answerUnsure"), status: "unknown" as const, result: "unsure" }
              ] }
            : !wasRepottedRecently && !oldSoilResolution && (structuredQuestionsEnabled ? canAskStructuredQuestion(structuredRepotting, 0.55) : oldSoilMentioned)
              ? structuredFollowUp(structuredRepotting, locale) ?? { hypothesis: "repotting" as const, question: t("plantAnalysis.questionRepot"), reason: t("plantAnalysis.questionReasonRepot"), options: [
                  { label: t("plantAnalysis.answerRecently"), status: "ruled_out" as const, result: "recently" },
                  { label: t("plantAnalysis.answerLongAgo"), status: "confirmed" as const, result: "long_ago" },
                  { label: t("plantAnalysis.answerUnsure"), status: "unknown" as const, result: "unsure" }
                ] }
              : needsDrainageQuestion
                ? structuredFollowUp(structuredDrainage, locale) ?? { hypothesis: "drainage" as const, question: t("plantAnalysis.questionDrainage"), reason: t("plantAnalysis.questionReasonDrainage"), options: [
                    { label: t("plantAnalysis.answerYes"), status: "ruled_out" as const, result: "yes" },
                    { label: t("plantAnalysis.answerNo"), status: "confirmed" as const, result: "no" },
                    { label: t("plantAnalysis.answerUnsure"), status: "unknown" as const, result: "unsure" }
                  ] }
                : null;
    const density = recommendationDensity(analysis, activeHypotheses, Boolean(followUp));
    const meaningfulObservations = density === "healthy" ? [] : allMeaningfulObservations.slice(0, density === "minor" ? 1 : 3);
    const repeatRepottingRelevant =
      wasRepottedRecently &&
      (activeHypotheses.some((hypothesis) => hypothesis.id === "recent_repotting_context" || hypothesis.id === "repotting" || hypothesis.id === "root_condition") ||
        includesAny(combinedText, ["repot", "transplant", "пересад", "адапт"]));
    const whatNotToDo = unique([repeatRepottingRelevant ? t("plantAnalysis.actionDoNotRepot") : ""]);
    const canonicalActions = unique([
      activeHypotheses.some((hypothesis) => hypothesis.id === "direct_sun") && sunResolution?.status !== "ruled_out" ? t("plantAnalysis.actionBrightIndirect") : "",
      !soilCheckedToday && !wateringResolution && (activeHypotheses.some((hypothesis) => hypothesis.id === "soil_condition") || plant.nextAction === "check_soil") ? t("plantAnalysis.actionCheckSoil") : "",
      activeHypotheses.some((hypothesis) => hypothesis.id === "pests") ? t("plantAnalysis.actionPests") : "",
      activeHypotheses.some((hypothesis) => hypothesis.id === "root_condition") ? t("plantAnalysis.actionRoots") : "",
      activeHypotheses.length || wasRepottedRecently ? t("plantAnalysis.actionWatchNewGrowth") : ""
    ]);
    const actions = validateCurrentActions(canonicalActions, {
      sunStressActive: activeHypotheses.some((hypothesis) => hypothesis.id === "direct_sun"),
      sunRuledOut: sunResolution?.status === "ruled_out"
    }).slice(0, density === "serious" ? 4 : 3);
    const activeActions = actions.length ? actions : [t("plantAnalysis.actionNothingNow")];
    const answerConclusions = unique([
      conclusionForResolution(pestsResolution, t),
      conclusionForResolution(rootResolution, t),
      wasRepottedRecently && repotDate ? t("plantAnalysis.conclusionRepottedDate").replace("{date}", formatRelativeDate(repotDate, locale, "")) : "",
      conclusionForSoilResult(plant.lastSoilResult, t),
      conclusionForResolution(sunResolution, t),
      conclusionForResolution(oldSoilResolution, t),
      conclusionForResolution(wateringResolution, t),
      conclusionForResolution(drainageResolution, t)
    ]);
    const likelyExplanation =
      density !== "healthy" && activeHypotheses.length > 0
        ? firstNonEmpty([
            activeHypotheses[0]?.text ?? "",
            noPests ? t("plantAnalysis.meaningPestsRuledOut") : "",
            rootsReportedNormal ? t("plantAnalysis.meaningRootsNormal") : "",
            sunResolution?.status === "ruled_out" ? t("plantAnalysis.meaningSunRuledOut") : ""
          ])
        : "";
    return { meaningfulObservations, keyTakeaway, likelyExplanation, lowConfidenceHypotheses, activeActions, whatNotToDo, answerConclusions, followUp, density };
  }, [analysis, hypothesisResolutions, locale, milestones, plant, t]);

  if (!analysis || !view) {
    return null;
  }

  const saveFollowUp = async (hypothesis: PlantHypothesis, status: PlantHypothesisStatus, result: string) => {
    if (savingAnswerKey) return;
    const answerKey = `${hypothesis}:${result}`;
    setSavingAnswerKey(answerKey);
    setAnswerError(null);
    try {
      await onResolveHypothesis(hypothesis, status, result);
    } catch (error) {
      setAnswerError(t("plantAnalysis.answerSaveFailed"));
      console.warn("plant_hypothesis_answer_failed", {
        hypothesis,
        result,
        message: error instanceof Error ? error.message : "Unknown error"
      });
    } finally {
      setSavingAnswerKey(null);
    }
  };

  if (conversationalState.enabled) {
    const todayActions =
      careActionState?.isActionable && careActionState.actionType !== "check_soil" && canonicalActionText
        ? [canonicalActionText]
        : conversationalState.todayActions.filter((action) => {
            if (careActionState?.actionType === "water") {
              return !includesAny(action, ["check soil", "soil before watering", "проверь почву", "почву перед поливом"]);
            }
            return true;
          });
    const primaryConversationText = conversationalState.question ? t("plantAnalysis.firstAnswerQuestion") : canonicalActionText || todayActions[0] || t("careAction.noAction");
    const planActions = conversationalState.question || completedFact ? todayActions : todayActions.filter((action) => action !== primaryConversationText);

    return (
      <section className="mt-4 min-w-0 rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="font-rounded text-xl font-extrabold text-ink [overflow-wrap:anywhere]">{t("plantAnalysis.title")}</h2>
          {recommendationRefreshState?.status === "loading" ? (
            <span className="rounded-full bg-[#eef5e8] px-3 py-1 text-xs font-extrabold text-[#4f6946]">{t("plantAnalysis.refreshingInline")}</span>
          ) : null}
          {recommendationRefreshState?.status === "success" ? (
            <span className="rounded-full bg-[#eef5e8] px-3 py-1 text-xs font-extrabold text-[#355f3d]">{t("plantAnalysis.refreshSuccessBadge")}</span>
          ) : null}
          {recommendationRefreshState?.status === "unchanged" ? (
            <span className="rounded-full bg-[#eef5e8] px-3 py-1 text-xs font-extrabold text-[#355f3d]">{t("plantAnalysis.refreshUnchangedBadge")}</span>
          ) : null}
        </div>
        {recommendationRefreshState?.status === "error" ? (
          <p className="mx-1 mt-2 rounded-[16px] bg-[#fff0e6] p-3 text-sm font-bold leading-5 text-[#8a5b24]">{recommendationRefreshState.error ?? t("plantAnalysis.refreshFailedInline")}</p>
        ) : null}
        {hasPendingBaselineQuestions ? (
          <p className="mx-1 mt-2 rounded-[16px] bg-[#eef5e8] p-3 text-sm font-bold leading-5 text-[#4f6946]">{t("plantAnalysis.pendingBaselineQuestions")}</p>
        ) : null}

        <div className="mt-3 grid gap-2">
          {conversationalState.question ? (
            <div className="min-w-0 rounded-[22px] bg-[#eef5e8] p-3">
              <p className="text-xs font-bold uppercase text-[#6f8c62]">{t("plantAnalysis.conversationQuestion")}</p>
              <p className="mt-2 text-sm font-extrabold leading-5 text-[#4f4940] [overflow-wrap:anywhere]">{conversationalState.question.question}</p>
              <p className="mt-1 text-xs font-bold leading-4 text-[#5f7a54] [overflow-wrap:anywhere]">{conversationalState.question.reason}</p>
              <AnswerChips
                options={conversationalState.question.options}
                getKey={(option) => `${conversationalState.question!.hypothesis}:${option.result}`}
                labelFor={(option) => option.label}
                loadingKey={savingAnswerKey}
                disabled={Boolean(savingAnswerKey)}
                onSelect={(option) => void saveFollowUp(conversationalState.question!.hypothesis, option.status, option.result)}
              />
              {savingAnswerKey ? <p className="mt-3 text-xs font-bold text-[#8a8378]">{t("plantAnalysis.updatingRecommendations")}</p> : null}
              {answerError ? <p className="mt-3 rounded-[16px] bg-[#fdeaf0] p-3 text-sm font-bold leading-5 text-[#9b2c3e]">{answerError}</p> : null}
            </div>
          ) : completedFact ? (
            <div className="min-w-0 rounded-[22px] bg-[#eef5e8] p-3">
              <p className="text-sm font-extrabold leading-5 text-[#355f3d]">✓ {completedFact.label}: {completedFact.value}</p>
              <p className="mt-1 text-sm font-bold leading-5 text-[#4f4940] [overflow-wrap:anywhere]">{completedFact.conclusion}</p>
            </div>
          ) : (
            <div className="min-w-0 rounded-[22px] bg-[#eef5e8] p-3">
              <p className="text-xs font-bold uppercase text-[#6f8c62]">{t("plantAnalysis.conversationNow")}</p>
              <p className="mt-1 text-sm font-extrabold leading-5 text-[#355f3d] [overflow-wrap:anywhere]">
                {primaryConversationText}
              </p>
            </div>
          )}

          {planActions.length ? (
            <div className="min-w-0 rounded-[20px] bg-white/65 p-3">
              <p className="text-xs font-bold uppercase text-[#a09a90]">{t("plantAnalysis.conversationToday")}</p>
              <ul className="mt-2 grid gap-1.5 text-sm font-bold leading-5 text-[#5f594f] [overflow-wrap:anywhere]">
                {planActions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {conversationalState.concern ? (
            <div className="min-w-0 rounded-[20px] bg-white/50 p-3">
              <p className="text-xs font-bold uppercase text-[#a09a90]">{t("plantAnalysis.conversationConcern")}</p>
              <p className="mt-1 text-sm font-bold leading-5 text-[#4f4940] [overflow-wrap:anywhere]">{conversationalState.concern}</p>
            </div>
          ) : null}

          {conversationalState.caution ? (
            <div className="min-w-0 rounded-[20px] bg-[#fff8e8] p-3">
              <p className="text-sm font-extrabold leading-5 text-[#8a6230] [overflow-wrap:anywhere]">{conversationalState.caution}</p>
            </div>
          ) : null}

          <SpeciesLearningCard analysis={analysis} onKnowSpecies={onKnowSpecies} onAddPhoto={onAddPhoto} />

          {conversationalState.guidedAction ? (
            <div className="min-w-0 rounded-[20px] bg-white/65 p-3">
              <p className="text-sm font-extrabold leading-5 text-[#4f4940]">
                {conversationalState.guidedAction.type === "pruning" ? t("plantAnalysis.guidedPruningIntro") : t("plantAnalysis.guidedRepottingIntro")}
              </p>
              <button
                type="button"
                onClick={() => setOpenGuide((current) => (current === conversationalState.guidedAction?.type ? null : conversationalState.guidedAction?.type ?? null))}
                className="mt-3 min-h-11 rounded-[18px] bg-[#ddf2dc] px-4 text-sm font-extrabold text-[#2d7a4f]"
              >
                {conversationalState.guidedAction.type === "pruning" ? t("plantAnalysis.guidedPruningCta") : t("plantAnalysis.guidedRepottingCta")}
              </button>
              {openGuide === conversationalState.guidedAction.type ? (
                <ol className="mt-3 grid list-decimal gap-1.5 pl-5 text-sm font-bold leading-5 text-[#5f594f]">
                  {(conversationalState.guidedAction.type === "pruning"
                    ? [
                        t("plantAnalysis.guidedPruningStep1"),
                        t("plantAnalysis.guidedPruningStep2"),
                        t("plantAnalysis.guidedPruningStep3"),
                        t("plantAnalysis.guidedPruningStep4"),
                        t("plantAnalysis.guidedPruningStep5")
                      ]
                    : [
                        t("plantAnalysis.guidedRepottingStep1"),
                        t("plantAnalysis.guidedRepottingStep2"),
                        t("plantAnalysis.guidedRepottingStep3"),
                        t("plantAnalysis.guidedRepottingStep4"),
                        t("plantAnalysis.guidedRepottingStep5")
                      ]).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              ) : null}
            </div>
          ) : null}

          <details className="min-w-0 rounded-[20px] bg-white/45 p-3">
            <summary className="cursor-pointer text-xs font-bold uppercase text-[#6f8c62]">{t("plantAnalysis.whyThisConclusion")}</summary>
            <div className="mt-3 grid gap-2">
              <p className="rounded-[18px] bg-[#eef5e8] p-3 text-sm font-extrabold leading-5 text-[#355f3d] [overflow-wrap:anywhere]">{view.keyTakeaway}</p>
              {view.meaningfulObservations.length ? (
                <ul className="grid gap-1.5 text-sm font-bold leading-5 text-[#5f594f] [overflow-wrap:anywhere]">
                  {view.meaningfulObservations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              {view.likelyExplanation ? <p className="text-sm font-bold leading-5 text-[#4f4940] [overflow-wrap:anywhere]">{view.likelyExplanation}</p> : null}
            </div>
          </details>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-4 min-w-0 rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-1">
        <h2 className="font-rounded text-xl font-extrabold text-ink [overflow-wrap:anywhere]">{t("plantAnalysis.title")}</h2>
        {recommendationRefreshState?.status === "loading" ? (
          <span className="rounded-full bg-[#eef5e8] px-3 py-1 text-xs font-extrabold text-[#4f6946]">{t("plantAnalysis.refreshingInline")}</span>
        ) : null}
        {recommendationRefreshState?.status === "success" ? (
          <span className="rounded-full bg-[#eef5e8] px-3 py-1 text-xs font-extrabold text-[#355f3d]">{t("plantAnalysis.refreshSuccessBadge")}</span>
        ) : null}
        {recommendationRefreshState?.status === "unchanged" ? (
          <span className="rounded-full bg-[#eef5e8] px-3 py-1 text-xs font-extrabold text-[#355f3d]">{t("plantAnalysis.refreshUnchangedBadge")}</span>
        ) : null}
      </div>
      {recommendationRefreshState?.status === "error" ? (
        <p className="mx-1 mt-2 rounded-[16px] bg-[#fff0e6] p-3 text-sm font-bold leading-5 text-[#8a5b24]">{recommendationRefreshState.error ?? t("plantAnalysis.refreshFailedInline")}</p>
      ) : null}
      {hasPendingBaselineQuestions ? (
        <p className="mx-1 mt-2 rounded-[16px] bg-[#eef5e8] p-3 text-sm font-bold leading-5 text-[#4f6946]">{t("plantAnalysis.pendingBaselineQuestions")}</p>
      ) : null}
      <div className="mt-3 grid gap-2">
        <div className="min-w-0 rounded-[22px] bg-[#eef5e8] p-3">
          <p className="text-sm font-extrabold leading-5 text-[#355f3d] [overflow-wrap:anywhere]">{view.keyTakeaway}</p>
        </div>

        {view.meaningfulObservations.length ? (
          <div className="min-w-0 rounded-[20px] bg-white/65 p-3">
            <p className="text-xs font-bold uppercase text-[#a09a90]">{t("plantAnalysis.observations")}</p>
            <ul className="mt-2 grid gap-1.5 text-sm font-bold leading-5 text-[#5f594f] [overflow-wrap:anywhere]">
              {view.meaningfulObservations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {view.likelyExplanation ? (
          <div className="min-w-0 rounded-[20px] bg-white/65 p-3">
            <p className="text-xs font-bold uppercase text-[#a09a90]">{t("plantAnalysis.mostLikelyCause")}</p>
            <p className="mt-2 text-sm font-bold leading-5 text-[#4f4940] [overflow-wrap:anywhere]">{view.likelyExplanation}</p>
          </div>
        ) : null}

        <div className="min-w-0 rounded-[20px] bg-white/65 p-3">
          <p className="text-xs font-bold uppercase text-[#a09a90]">{t("plantAnalysis.currentAction")}</p>
          <ul className="mt-2 grid gap-1.5 text-sm font-bold leading-5 text-[#5f594f] [overflow-wrap:anywhere]">
            {view.activeActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </div>

        {view.whatNotToDo.length ? (
          <div className="min-w-0 rounded-[20px] bg-white/65 p-3">
            <p className="text-xs font-bold uppercase text-[#a09a90]">{t("plantAnalysis.whatNotToDo")}</p>
            <ul className="mt-2 grid gap-1.5 text-sm font-bold leading-5 text-[#5f594f] [overflow-wrap:anywhere]">
              {view.whatNotToDo.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {view.followUp ? (
          <div className="min-w-0 rounded-[20px] bg-white/65 p-3">
            <p className="text-sm font-extrabold leading-5 text-[#4f4940] [overflow-wrap:anywhere]">{view.followUp.question}</p>
            <p className="mt-1 text-xs font-bold leading-4 text-[#8a8378] [overflow-wrap:anywhere]">{view.followUp.reason}</p>
            <AnswerChips
              options={view.followUp.options}
              getKey={(option) => `${view.followUp!.hypothesis}:${option.result}`}
              labelFor={(option) => option.label}
              loadingKey={savingAnswerKey}
              disabled={Boolean(savingAnswerKey)}
              onSelect={(option) => void saveFollowUp(view.followUp!.hypothesis, option.status, option.result)}
            />
            {savingAnswerKey ? <p className="mt-3 text-xs font-bold text-[#8a8378]">{t("plantAnalysis.updatingRecommendations")}</p> : null}
            {answerError ? <p className="mt-3 rounded-[16px] bg-[#fdeaf0] p-3 text-sm font-bold leading-5 text-[#9b2c3e]">{answerError}</p> : null}
          </div>
        ) : null}

        {view.answerConclusions.length ? (
          <details className="min-w-0 rounded-[20px] bg-[#eef5e8] p-3">
            <summary className="cursor-pointer text-xs font-bold uppercase text-[#6f8c62]">{t("plantAnalysis.checkedFacts")}</summary>
            <ul className="mt-2 grid gap-1.5 text-sm font-bold leading-5 text-[#4f6946] [overflow-wrap:anywhere]">
              {view.answerConclusions.map((fact) => (
                <li key={fact} className="flex gap-2">
                  <Check aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
                  <span>{fact}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {view.density === "serious" && view.lowConfidenceHypotheses.length ? (
          <div className="min-w-0 rounded-[20px] bg-white/45 p-3">
            <button
              type="button"
              onClick={() => setShowOtherCauses((value) => !value)}
              className="flex w-full items-center justify-between text-left text-sm font-extrabold text-[#7a7166]"
            >
              {t("plantAnalysis.otherPossibleCauses")}
              <ChevronDown aria-hidden="true" size={16} className={showOtherCauses ? "rotate-180 transition-transform" : "transition-transform"} />
            </button>
            {showOtherCauses ? (
              <ul className="mt-2 grid gap-1.5 text-sm font-bold leading-5 text-[#7a7166] [overflow-wrap:anywhere]">
                {view.lowConfidenceHypotheses.map((hypothesis) => (
                  <li key={hypothesis.id}>{hypothesis.text}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
