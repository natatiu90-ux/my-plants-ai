"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { formatRelativeDate } from "@/lib/date-format";
import { useI18n } from "@/i18n/I18nProvider";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { Plant, PlantAnalysisRecord, PlantHypothesis, PlantHypothesisResolution, PlantHypothesisStatus, PlantMilestone } from "@/types/plant";

type HypothesisView = {
  id: PlantHypothesis;
  confidence: number;
  text: string;
  evidence: string[];
  conflictingEvidence: string[];
  status: "active" | "confirmed" | "ruled_out";
};

type FollowUpView = {
  hypothesis: PlantHypothesis;
  question: string;
  options: { label: string; status: PlantHypothesisStatus; result: string }[];
};

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

function classifyObservation(item: string, t: (key: TranslationKey) => string) {
  if (includesAny(item, ["healthy", "firm", "new leaf", "здоров", "упруг", "нов"])) {
    return `${t("plantAnalysis.observationNormalPrefix")} ${item}`;
  }
  if (includesAny(item, ["dry", "brown", "yellow", "edge", "patch", "scorch", "bleach", "сух", "корич", "желт", "кра", "пятн", "ожог"])) {
    return `${t("plantAnalysis.observationPossibleConcernPrefix")} ${item}`;
  }
  return `${t("plantAnalysis.observationNeutralPrefix")} ${item}`;
}

export function PlantAnalysisSection({
  analysis,
  plant,
  milestones,
  hypothesisResolutions,
  onResolveHypothesis
}: {
  analysis?: PlantAnalysisRecord;
  plant: Plant;
  milestones: PlantMilestone[];
  hypothesisResolutions: PlantHypothesisResolution[];
  onResolveHypothesis: (hypothesis: PlantHypothesis, status: PlantHypothesisStatus, result: string) => Promise<void>;
}) {
  const { locale, t } = useI18n();
  const [isSavingHypothesis, setIsSavingHypothesis] = useState(false);
  const [showOtherCauses, setShowOtherCauses] = useState(false);

  const view = useMemo(() => {
    if (!analysis) return null;

    const observations = analysis.rawResult?.visibleObservations?.map((item) => localized(item, locale)).filter(Boolean) ?? [];
    const uncertainties = analysis.rawResult?.uncertainties?.map((item) => localized(item, locale)).filter(Boolean) ?? [];
    const recommendationTexts = analysis.recommendations.map((item) => item[locale] || item.en || item.ru || "").filter(Boolean);
    const combinedText = [localized(analysis.summary, locale), ...observations, ...uncertainties, ...recommendationTexts].join(" ");
    const recentRepot = milestones
      .filter((milestone) => milestone.type === "repotted")
      .sort((a, b) => (b.eventDate ?? b.createdAt).localeCompare(a.eventDate ?? a.createdAt))[0];
    const repotDate = recentRepot?.eventDate ?? recentRepot?.createdAt;
    const repottedDaysAgo = daysSince(repotDate);
    const wasRepottedRecently = repottedDaysAgo != null && repottedDaysAgo <= 21;
    const pestsResolution = resolutionFor(hypothesisResolutions, "pests");
    const noPests = pestsResolution?.status === "ruled_out";
    const pestsConfirmed = pestsResolution?.status === "confirmed";
    const sunResolution = resolutionFor(hypothesisResolutions, "sun_stress");
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
    const rootMentioned = includesAny(combinedText, ["root", "roots", "корн"]);
    const soilCheckedToday = plant.lastSoilCheckedAt ? daysSince(plant.lastSoilCheckedAt) === 0 : false;

    const hypotheses: HypothesisView[] = [
      {
        id: "sun_stress",
        confidence: sunResolution?.status === "confirmed" ? 0.9 : sunMentioned ? 0.72 : 0.2,
        text: t("plantAnalysis.causeSunStress"),
        evidence: unique([sunMentioned ? t("plantAnalysis.evidencePhotoLight") : "", sunResolution?.status === "confirmed" ? t("plantAnalysis.checkedDirectSun") : ""]),
        conflictingEvidence: [],
        status: statusFromResolution(sunResolution)
      },
      {
        id: "recent_repotting",
        confidence: wasRepottedRecently ? 0.68 : 0.18,
        text: t("plantAnalysis.causeRepotAdaptation"),
        evidence: wasRepottedRecently && repotDate ? [t("plantAnalysis.checkedRepotted").replace("{date}", formatRelativeDate(repotDate, locale, ""))] : [],
        conflictingEvidence: [],
        status: wasRepottedRecently ? "confirmed" : "active"
      },
      {
        id: "watering",
        confidence: plant.nextAction === "water" || plant.nextAction === "check_soil" ? 0.7 : wateringMentioned ? 0.58 : 0.25,
        text: t("plantAnalysis.causeWatering"),
        evidence: unique([plant.lastSoilResult ? t(`checkSoil.${plant.lastSoilResult === "slightly_damp" ? "slightlyDamp" : plant.lastSoilResult === "very_wet" ? "veryWet" : plant.lastSoilResult === "not_sure" ? "notSure" : "dry"}`) : ""]),
        conflictingEvidence: [],
        status: "active"
      },
      {
        id: "pests",
        confidence: pestsConfirmed ? 0.82 : pestMentioned ? 0.45 : 0.15,
        text: t("plantAnalysis.causePests"),
        evidence: pestsConfirmed ? [t("plantAnalysis.checkedPestsFound")] : [],
        conflictingEvidence: noPests ? [t("plantAnalysis.checkedNoPests")] : [],
        status: noPests ? "ruled_out" : pestsConfirmed ? "confirmed" : "active"
      },
      {
        id: "root_condition",
        confidence: rootsConcernConfirmed ? 0.82 : rootMentioned && wasRepottedRecently && !rootsReportedNormal ? 0.45 : 0.12,
        text: t("plantAnalysis.causeRoots"),
        evidence: rootsConcernConfirmed ? [t("plantAnalysis.checkedRootsProblem")] : [],
        conflictingEvidence: rootsReportedNormal ? [t("plantAnalysis.checkedRootsNormal")] : [],
        status: rootsConcernConfirmed ? "confirmed" : rootsReportedNormal ? "ruled_out" : "active"
      },
      {
        id: "old_compacted_soil",
        confidence: wasRepottedRecently ? 0.05 : oldSoilMentioned ? 0.48 : 0.15,
        text: t("plantAnalysis.causeOldSoil"),
        evidence: [],
        conflictingEvidence: wasRepottedRecently && repotDate ? [t("plantAnalysis.checkedRepotted").replace("{date}", formatRelativeDate(repotDate, locale, ""))] : [],
        status: wasRepottedRecently ? "ruled_out" : statusFromResolution(resolutionFor(hypothesisResolutions, "old_compacted_soil"))
      }
    ];

    const activeHypotheses = hypotheses
      .filter((hypothesis) => hypothesis.status !== "ruled_out" && hypothesis.confidence >= 0.55)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 2);
    const lowConfidenceHypotheses = hypotheses.filter((hypothesis) => hypothesis.status === "active" && hypothesis.confidence >= 0.35 && hypothesis.confidence < 0.55);
    const meaningfulObservations = unique([
      normalPortulacariaLeaves ? t("plantAnalysis.observationPortulacariaNormal") : "",
      visibleSunDamage ? t("plantAnalysis.observationOldDryDamage") : "",
      ...observations
        .filter((item) => observationHasConditionValue(item) && !(normalPortulacariaLeaves && includesAny(item, ["small rounded", "rounded leaves", "paired", "мелк", "округл", "парами"])))
        .map((item) => classifyObservation(item, t))
    ]).slice(0, 2);
    const statusSummary =
      analysis.condition === "healthy" && activeHypotheses.length === 0
        ? t("plantAnalysis.statusLooksOkay")
        : wasRepottedRecently
          ? t("plantAnalysis.statusRecovering")
          : activeHypotheses.length === 0
            ? t("plantAnalysis.statusOldDamage")
            : plant.nextAction
              ? t("plantAnalysis.statusWatch")
              : t("plantAnalysis.statusStableWatch");
    const statusDetail = firstNonEmpty([
      wasRepottedRecently ? t("plantAnalysis.statusDetailRepot") : "",
      activeHypotheses.some((hypothesis) => hypothesis.id === "sun_stress") ? t("plantAnalysis.statusDetailSun") : "",
      activeHypotheses.length === 0 ? t("plantAnalysis.statusDetailNoUrgent") : ""
    ]);
    const actions = unique([
      activeHypotheses.some((hypothesis) => hypothesis.id === "sun_stress") && sunResolution?.status !== "ruled_out" ? t("plantAnalysis.actionBrightIndirect") : "",
      wasRepottedRecently ? t("plantAnalysis.actionDoNotRepot") : "",
      !soilCheckedToday && (activeHypotheses.some((hypothesis) => hypothesis.id === "watering") || plant.nextAction === "check_soil") ? t("plantAnalysis.actionCheckSoil") : "",
      activeHypotheses.some((hypothesis) => hypothesis.id === "pests") ? t("plantAnalysis.actionPests") : "",
      activeHypotheses.some((hypothesis) => hypothesis.id === "root_condition") ? t("plantAnalysis.actionRoots") : "",
      activeHypotheses.length || wasRepottedRecently ? t("plantAnalysis.actionWatchNewGrowth") : ""
    ]).slice(0, 3);
    const activeActions = actions.length ? actions : [t("plantAnalysis.actionNothingNow")];
    const checkedFacts = unique([
      noPests ? t("plantAnalysis.checkedNoPests") : "",
      pestsConfirmed ? t("plantAnalysis.checkedPestsFound") : "",
      rootsReportedNormal ? t("plantAnalysis.checkedRootsNormal") : rootsConcernConfirmed ? t("plantAnalysis.checkedRootsProblem") : "",
      wasRepottedRecently && repotDate ? t("plantAnalysis.checkedRepotted").replace("{date}", formatRelativeDate(repotDate, locale, "")) : "",
      sunResolution?.status === "confirmed" ? t("plantAnalysis.checkedDirectSun") : sunResolution?.status === "ruled_out" ? t("plantAnalysis.checkedNoDirectSun") : "",
      plant.lastSoilCheckedAt ? t("plantAnalysis.checkedSoil").replace("{date}", formatRelativeDate(plant.lastSoilCheckedAt, locale, "")) : ""
    ]);
    const meaning = unique([
      ...activeHypotheses.map((hypothesis) => hypothesis.text),
      noPests ? t("plantAnalysis.meaningPestsRuledOut") : "",
      rootsReportedNormal ? t("plantAnalysis.meaningRootsNormal") : "",
      sunResolution?.status === "ruled_out" ? t("plantAnalysis.meaningSunRuledOut") : ""
    ]).slice(0, 2);
    const followUp: FollowUpView | null = !noPests && pestMentioned
      ? { hypothesis: "pests" as const, question: t("plantAnalysis.questionPests"), options: [
          { label: t("plantAnalysis.answerYes"), status: "confirmed" as const, result: "yes" },
          { label: t("plantAnalysis.answerNo"), status: "ruled_out" as const, result: "no" },
          { label: t("plantAnalysis.answerUnsure"), status: "unknown" as const, result: "unsure" }
        ] }
      : !sunResolution && sunMentioned
        ? { hypothesis: "sun_stress" as const, question: t("plantAnalysis.questionSun"), options: [
            { label: t("plantAnalysis.answerYes"), status: "confirmed" as const, result: "yes" },
            { label: t("plantAnalysis.answerNo"), status: "ruled_out" as const, result: "no" }
          ] }
        : wasRepottedRecently && rootMentioned && !rootResolution
          ? { hypothesis: "root_condition" as const, question: t("plantAnalysis.questionRoots"), options: [
              { label: t("plantAnalysis.answerRootsHealthy"), status: "ruled_out" as const, result: "healthy" },
              { label: t("plantAnalysis.answerRootsProblem"), status: "confirmed" as const, result: "dark_or_soft" },
              { label: t("plantAnalysis.answerRootsNotChecked"), status: "unknown" as const, result: "not_checked" },
              { label: t("plantAnalysis.answerUnsure"), status: "unknown" as const, result: "unsure" }
            ] }
          : !wasRepottedRecently && oldSoilMentioned
            ? { hypothesis: "old_compacted_soil" as const, question: t("plantAnalysis.questionRepot"), options: [
                { label: t("plantAnalysis.answerRecently"), status: "ruled_out" as const, result: "recently" },
                { label: t("plantAnalysis.answerLongAgo"), status: "confirmed" as const, result: "long_ago" },
                { label: t("plantAnalysis.answerUnsure"), status: "unknown" as const, result: "unsure" }
              ] }
            : null;
    const remainingUncertainty = followUp
      ? unique([
          ...uncertainties.filter((item) => !(rootsReportedNormal && includesAny(item, ["root", "roots", "корн"]))),
          followUp.question
        ]).slice(0, 2)
      : [];

    return { meaningfulObservations, statusSummary, statusDetail, meaning, lowConfidenceHypotheses, activeActions, checkedFacts, followUp, remainingUncertainty };
  }, [analysis, hypothesisResolutions, locale, milestones, plant, t]);

  if (!analysis || !view) {
    return null;
  }

  const saveFollowUp = async (hypothesis: PlantHypothesis, status: PlantHypothesisStatus, result: string) => {
    if (isSavingHypothesis) return;
    setIsSavingHypothesis(true);
    try {
      await onResolveHypothesis(hypothesis, status, result);
    } finally {
      setIsSavingHypothesis(false);
    }
  };

  return (
    <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
      <h2 className="px-1 font-rounded text-xl font-extrabold text-ink">{t("plantAnalysis.title")}</h2>
      <div className="mt-3 grid gap-2">
        <div className="rounded-[22px] bg-[#eef5e8] p-3">
          <p className="text-sm font-extrabold leading-5 text-[#355f3d]">{view.statusSummary}</p>
          {view.statusDetail ? <p className="mt-1 text-sm font-bold leading-5 text-[#4f6946]">{view.statusDetail}</p> : null}
        </div>

        <div className="rounded-[20px] bg-white/65 p-3">
          <p className="text-xs font-bold uppercase text-[#a09a90]">{t("plantAnalysis.currentAction")}</p>
          <ul className="mt-2 grid gap-1.5 text-sm font-bold leading-5 text-[#5f594f]">
            {view.activeActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </div>

        {view.checkedFacts.length ? (
          <div className="rounded-[20px] bg-[#eef5e8] p-3">
            <p className="text-xs font-bold uppercase text-[#6f8c62]">{t("plantAnalysis.checkedFacts")}</p>
            <ul className="mt-2 grid gap-1.5 text-sm font-bold leading-5 text-[#4f6946]">
              {view.checkedFacts.map((fact) => (
                <li key={fact} className="flex gap-2">
                  <Check aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
                  <span>{fact}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {view.meaningfulObservations.length ? (
          <div className="rounded-[20px] bg-white/65 p-3">
            <p className="text-xs font-bold uppercase text-[#a09a90]">{t("plantAnalysis.observations")}</p>
            <ul className="mt-2 grid gap-1.5 text-sm font-bold leading-5 text-[#5f594f]">
              {view.meaningfulObservations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {view.meaning.length ? (
          <div className="rounded-[20px] bg-white/65 p-3">
            <p className="text-xs font-bold uppercase text-[#a09a90]">{t("plantAnalysis.whatItMeans")}</p>
            <ul className="mt-2 grid gap-2 text-sm font-bold leading-5 text-[#4f4940]">
              {view.meaning.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {view.remainingUncertainty.length ? (
          <div className="rounded-[20px] bg-[#fff8e8] p-3">
            <p className="text-xs font-bold uppercase text-[#a77735]">{t("plantAnalysis.remainingUncertainty")}</p>
            <ul className="mt-2 grid gap-1.5 text-sm font-bold leading-5 text-[#7a623d]">
              {view.remainingUncertainty.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {view.followUp ? (
          <div className="rounded-[20px] bg-white/65 p-3">
            <p className="text-sm font-extrabold leading-5 text-[#4f4940]">{view.followUp.question}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {view.followUp.options.map((option) => (
                <button
                  key={option.result}
                  type="button"
                  onClick={() => void saveFollowUp(view.followUp!.hypothesis, option.status, option.result)}
                  disabled={isSavingHypothesis}
                  className="min-h-10 rounded-[16px] bg-[#ddf2dc] px-3 text-sm font-extrabold text-[#2d7a4f] disabled:opacity-60"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {view.lowConfidenceHypotheses.length ? (
          <div className="rounded-[20px] bg-white/45 p-3">
            <button
              type="button"
              onClick={() => setShowOtherCauses((value) => !value)}
              className="flex w-full items-center justify-between text-left text-sm font-extrabold text-[#7a7166]"
            >
              {t("plantAnalysis.otherPossibleCauses")}
              <ChevronDown aria-hidden="true" size={16} className={showOtherCauses ? "rotate-180 transition-transform" : "transition-transform"} />
            </button>
            {showOtherCauses ? (
              <ul className="mt-2 grid gap-1.5 text-sm font-bold leading-5 text-[#7a7166]">
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
