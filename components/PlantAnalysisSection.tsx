"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { formatRelativeDate } from "@/lib/date-format";
import { useI18n } from "@/i18n/I18nProvider";
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
  const date = new Date(`${dateKey}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - date.getTime()) / (24 * 60 * 60 * 1000)));
}

function includesAny(text: string, words: string[]) {
  const value = text.toLocaleLowerCase();
  return words.some((word) => value.includes(word));
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
    const repottedDaysAgo = daysSince(recentRepot?.eventDate ?? recentRepot?.createdAt);
    const wasRepottedRecently = repottedDaysAgo != null && repottedDaysAgo <= 21;
    const noPests = resolutionFor(hypothesisResolutions, "pests")?.status === "ruled_out";
    const pestsConfirmed = resolutionFor(hypothesisResolutions, "pests")?.status === "confirmed";
    const sunResolution = resolutionFor(hypothesisResolutions, "sun_stress");
    const sunMentioned = includesAny(combinedText, ["sun", "direct light", "bright window", "сол", "прям"]);
    const wateringMentioned = includesAny(combinedText, ["water", "soil", "dry", "полив", "почв", "сух"]);
    const pestMentioned = includesAny(combinedText, ["pest", "mite", "insect", "вредител", "клещ", "насеком"]);
    const oldSoilMentioned = includesAny(combinedText, ["compacted", "old soil", "salt buildup", "пересад", "стар", "уплотнен", "сол"]);
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
        evidence: wasRepottedRecently && repottedDaysAgo != null ? [t("plantAnalysis.checkedRepotted").replace("{date}", formatRelativeDate(recentRepot?.eventDate ?? recentRepot?.createdAt, locale, ""))] : [],
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
        id: "old_compacted_soil",
        confidence: wasRepottedRecently ? 0.05 : oldSoilMentioned ? 0.48 : 0.15,
        text: t("plantAnalysis.causeOldSoil"),
        evidence: [],
        conflictingEvidence: wasRepottedRecently ? [t("plantAnalysis.checkedRepotted").replace("{date}", formatRelativeDate(recentRepot?.eventDate ?? recentRepot?.createdAt, locale, ""))] : [],
        status: wasRepottedRecently ? "ruled_out" : statusFromResolution(resolutionFor(hypothesisResolutions, "old_compacted_soil"))
      }
    ];

    const activeHypotheses = hypotheses
      .filter((hypothesis) => hypothesis.status !== "ruled_out" && hypothesis.confidence >= 0.55)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 2);
    const lowConfidenceHypotheses = hypotheses.filter((hypothesis) => hypothesis.status === "active" && hypothesis.confidence >= 0.35 && hypothesis.confidence < 0.55);
    const observation = observations[0] || localized(analysis.summary, locale);
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
      activeHypotheses.length || wasRepottedRecently ? t("plantAnalysis.actionWatchNewGrowth") : ""
    ]).slice(0, 3);
    const activeActions = actions.length ? actions : [t("plantAnalysis.actionNothingNow")];
    const checkedFacts = unique([
      noPests ? t("plantAnalysis.checkedNoPests") : "",
      pestsConfirmed ? t("plantAnalysis.checkedPestsFound") : "",
      wasRepottedRecently && repottedDaysAgo != null ? t("plantAnalysis.checkedRepotted").replace("{date}", formatRelativeDate(recentRepot?.eventDate ?? recentRepot?.createdAt, locale, "")) : "",
      sunResolution?.status === "confirmed" ? t("plantAnalysis.checkedDirectSun") : sunResolution?.status === "ruled_out" ? t("plantAnalysis.checkedNoDirectSun") : "",
      plant.lastSoilCheckedAt ? t("plantAnalysis.checkedSoil").replace("{date}", formatRelativeDate(plant.lastSoilCheckedAt, locale, "")) : ""
    ]);
    const meaning = unique([
      ...activeHypotheses.map((hypothesis) => hypothesis.text),
      wasRepottedRecently ? t("plantAnalysis.meaningRepotAccounted") : "",
      noPests ? t("plantAnalysis.meaningPestsRuledOut") : "",
      sunResolution?.status === "ruled_out" ? t("plantAnalysis.meaningSunRuledOut") : ""
    ]).slice(0, 3);
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
        : !wasRepottedRecently && oldSoilMentioned
          ? { hypothesis: "old_compacted_soil" as const, question: t("plantAnalysis.questionRepot"), options: [
              { label: t("plantAnalysis.answerRecently"), status: "ruled_out" as const, result: "recently" },
              { label: t("plantAnalysis.answerLongAgo"), status: "confirmed" as const, result: "long_ago" },
              { label: t("plantAnalysis.answerUnsure"), status: "unknown" as const, result: "unsure" }
          ] }
          : null;
    const remainingUncertainty = unique([
      ...uncertainties,
      ...(followUp ? [followUp.question] : [])
    ]).slice(0, 2);

    return { observation, statusSummary, statusDetail, meaning, lowConfidenceHypotheses, activeActions, checkedFacts, followUp, remainingUncertainty };
  }, [analysis, hypothesisResolutions, locale, milestones, plant.lastSoilCheckedAt, plant.lastSoilResult, plant.nextAction, t]);

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

        {view.observation ? (
          <div className="rounded-[20px] bg-white/65 p-3">
            <p className="text-xs font-bold uppercase text-[#a09a90]">{t("plantAnalysis.observations")}</p>
            <p className="mt-1 text-sm font-bold leading-5 text-[#5f594f]">{view.observation}</p>
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
