"use client";

import { useI18n } from "@/i18n/I18nProvider";
import type { Plant, PlantAnalysisRecord } from "@/types/plant";

function localized(value: { en?: string | null; ru?: string | null } | undefined, locale: "en" | "ru") {
  return value?.[locale] || value?.en || value?.ru || "";
}

export function PlantAnalysisSection({ analysis, plant }: { analysis?: PlantAnalysisRecord; plant: Plant }) {
  const { locale, t } = useI18n();

  if (!analysis) {
    return null;
  }

  const summary = localized(analysis.summary, locale);
  const observations = analysis.rawResult?.visibleObservations?.map((item) => localized(item, locale)).filter(Boolean) ?? [];
  const uncertainties = analysis.rawResult?.uncertainties?.map((item) => localized(item, locale)).filter(Boolean) ?? [];
  const recommendations = analysis.recommendations.map((item) => item[locale] || item.en || item.ru || "").filter(Boolean);
  const actionLabel =
    plant.nextAction === "water"
      ? t("actions.water")
      : plant.nextAction === "check_soil"
        ? t("actions.check_soil")
        : plant.nextAction === "take_photo"
          ? t("actions.take_photo")
          : t("plantAnalysis.noCurrentAction");

  return (
    <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
      <h2 className="px-1 font-rounded text-xl font-extrabold text-ink">{t("plantAnalysis.title")}</h2>
      {summary ? <p className="mt-3 rounded-[20px] bg-white/65 p-3 text-sm font-bold leading-6 text-[#5f594f]">{summary}</p> : null}
      <div className="mt-3 grid gap-2">
        <div className="rounded-[20px] bg-white/65 p-3">
          <p className="text-xs font-bold uppercase text-[#a09a90]">{t("plantAnalysis.currentAction")}</p>
          <p className="mt-1 text-sm font-extrabold leading-5 text-[#3f3b35]">{actionLabel}</p>
        </div>
        {observations.length ? (
          <div className="rounded-[20px] bg-white/65 p-3">
            <p className="text-xs font-bold uppercase text-[#a09a90]">{t("plantAnalysis.observations")}</p>
            <ul className="mt-2 grid gap-1.5 text-sm font-bold leading-5 text-[#5f594f]">
              {observations.map((observation) => (
                <li key={observation}>{observation}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {recommendations.length ? (
          <div className="rounded-[20px] bg-white/65 p-3">
            <p className="text-xs font-bold uppercase text-[#a09a90]">{t("plantAnalysis.recommendations")}</p>
            <ul className="mt-2 grid gap-1.5 text-sm font-bold leading-5 text-[#5f594f]">
              {recommendations.map((recommendation) => (
                <li key={recommendation}>{recommendation}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {uncertainties.length ? (
          <div className="rounded-[20px] bg-[#fff1d8] p-3">
            <p className="text-xs font-bold uppercase text-[#a77735]">{t("plantAnalysis.uncertainty")}</p>
            <ul className="mt-2 grid gap-1.5 text-sm font-bold leading-5 text-[#7a623d]">
              {uncertainties.map((uncertainty) => (
                <li key={uncertainty}>{uncertainty}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
