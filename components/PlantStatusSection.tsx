"use client";

import { StatusBadge } from "./StatusBadge";
import { useI18n } from "@/i18n/I18nProvider";
import type { DerivedCareActionState } from "@/lib/plant-action-eligibility";
import { derivePlantHealthStatus } from "@/lib/plant-health-status";
import { plantCommonName } from "@/lib/plant-display";
import { speciesDetailLabel } from "@/lib/plant-detail-recovery-presentation";
import { speciesLearningStateFromAnalysis } from "@/lib/species-learning";
import type { Plant, PlantAnalysisRecord, PlantMilestone } from "@/types/plant";

export function PlantStatusSection({ plant, careActionState, analysis, milestones }: { plant: Plant; careActionState: DerivedCareActionState | null; analysis?: PlantAnalysisRecord; milestones: PlantMilestone[] }) {
  const { locale, t } = useI18n();
  const speciesLearningState = speciesLearningStateFromAnalysis(analysis);
  const speciesLabel = speciesDetailLabel({ fallbackName: plantCommonName(plant), speciesLearningState });
  const commonName = speciesLabel.labelKey ? t(speciesLabel.labelKey) : speciesLabel.labelText ?? "";
  const healthStatus = derivePlantHealthStatus({ plant, analysis, milestones, careActionState });
  const primaryAction = analysis?.rawResult?.primaryAction?.[locale] || analysis?.rawResult?.primaryAction?.en || analysis?.rawResult?.primaryAction?.ru || "";
  const actionTimeframe = analysis?.rawResult?.actionTimeframe?.[locale] || analysis?.rawResult?.actionTimeframe?.en || analysis?.rawResult?.actionTimeframe?.ru || "";
  const highSeverityMessage = primaryAction && actionTimeframe ? `${primaryAction} ${actionTimeframe}` : primaryAction;
  const message = careActionState && (careActionState.isActionable || careActionState.status === "completed" || careActionState.status === "upcoming")
    ? t(careActionState.detailMessageKey, careActionState.detailMessageParams)
    : healthStatus.status === "needs_attention" || healthStatus.status === "action_needed"
      ? highSeverityMessage || t(healthStatus.messageKey)
      : t(healthStatus.messageKey);

  return (
    <section className="mt-4 min-w-0 rounded-[28px] bg-[#fffaf3] p-5 shadow-soft">
      {commonName ? <p className="text-[13px] italic leading-5 text-[#9a9aa3] [overflow-wrap:anywhere]">{commonName}</p> : null}
      {plant.scientificName ? <p className="mt-0.5 text-[13px] italic leading-5 text-[#b0a89d] [overflow-wrap:anywhere]">{plant.scientificName}</p> : null}
      <div className="mt-3">
        <StatusBadge label={t(healthStatus.labelKey)} status={healthStatus.status} />
      </div>
      <p className="mt-4 text-[15px] leading-6 text-[#4a4a54] [overflow-wrap:anywhere]">{plant.notes || message}</p>
    </section>
  );
}
