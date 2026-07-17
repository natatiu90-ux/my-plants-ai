"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePlantStore } from "@/data/PlantStore";
import { useI18n } from "@/i18n/I18nProvider";
import { addDays, toDateKey } from "@/lib/date-format";
import { buildPlantEnvironmentContext, formatEnvironmentContextForPrompt } from "@/lib/home-room-context";
import { plantDisplayName } from "@/lib/plant-display";
import { deriveCareActionState } from "@/lib/plant-action-eligibility";
import { compareMilestonesNewestFirst } from "@/lib/milestone-dates";
import { logNavigationEvent, startNavigationLog } from "@/lib/navigation-performance";
import { PhotoStorageRepository } from "@/lib/photo-storage";
import { buildRecommendationContextSnapshot, changedContextSince, impactLabelKey, isRecommendationStale, isVisualEvidenceStale, reasonTypeFromChangedContext, sourceAnalysisAgeDays, staleReasonKeys, type RecommendationChangedContext, type RecommendationContextSnapshot } from "@/lib/recommendation-refresh";
import { RECOMMENDATION_PROMPT_VERSION, RECOMMENDATION_VERSION } from "@/lib/recommendation-version";
import { CareHistory } from "./CareHistory";
import { CareDateEditor } from "./CareDateEditor";
import { CareSummary } from "./CareSummary";
import { CheckSoilSheet } from "./CheckSoilSheet";
import { DeletePlantDialog } from "./DeletePlantDialog";
import { MilestoneEditor } from "./MilestoneEditor";
import { PhotoGallery } from "./PhotoGallery";
import { PhotoUploadFlow } from "./PhotoUploadFlow";
import { PlantAnalysisSection } from "./PlantAnalysisSection";
import { PlantDetailHeader } from "./PlantDetailHeader";
import { PlantHeroImage } from "./PlantHeroImage";
import { PlantNotificationControls } from "./PlantNotificationControls";
import { PlantStatusSection } from "./PlantStatusSection";
import { PrimaryCareAction } from "./PrimaryCareAction";
import { Toast } from "./Toast";
import type { PlantAnalysisRecord, PlantPhoto, PlantRecommendationRevision, SoilCheckResult } from "@/types/plant";
import type { PendingPhotoUpload } from "./photo-upload-types";

type Sheet = "check_soil" | "add_photo" | "add_event" | null;
type PhotoAssessmentState =
  | { status: "idle" }
  | { status: "analyzing" }
  | { status: "complete"; message: string; changes: string[] }
  | { status: "failed"; message: string; retryPhotos: PendingPhotoUpload[]; savedPhotos: PlantPhoto[] };

function localized(value: { en?: string | null; ru?: string | null } | undefined, locale: "en" | "ru") {
  return value?.[locale] || value?.en || value?.ru || "";
}

function photoAssessmentChanges(condition: string | undefined, locale: "en" | "ru") {
  if (condition === "needs_attention") {
    return locale === "ru"
      ? ["Появились признаки, которые стоит проверить.", "Я обновила ближайшие действия."]
      : ["I found signs worth checking.", "I updated the next actions."];
  }

  if (condition === "healthy") {
    return locale === "ru"
      ? ["Срочных проблем на новых фото не видно.", "Эти фото станут базой для будущего сравнения."]
      : ["No urgent issues are visible in the new photos.", "These photos will help future comparisons."];
  }

  return locale === "ru"
    ? ["Я учла новые фото в текущих рекомендациях.", "Пока не заявляю улучшение или ухудшение без надёжного сравнения."]
    : ["I folded the new photos into the current recommendations.", "I’m not claiming improvement or worsening without a reliable comparison."];
}

function analysisWithRecommendationRevision(analysis: PlantAnalysisRecord | undefined, revision: PlantRecommendationRevision | undefined): PlantAnalysisRecord | undefined {
  if (!analysis || !revision) {
    return analysis;
  }

  const structured = revision.structuredResult ?? {};
  return {
    ...analysis,
    condition: typeof structured.condition === "string" ? (structured.condition as PlantAnalysisRecord["condition"]) : analysis.condition,
    nextAction: typeof structured.nextAction === "string" ? (structured.nextAction === "none" ? null : (structured.nextAction as PlantAnalysisRecord["nextAction"])) : analysis.nextAction,
    summary: structured.summary && typeof structured.summary === "object" ? (structured.summary as PlantAnalysisRecord["summary"]) : analysis.summary,
    recommendations: revision.recommendations.length ? revision.recommendations : analysis.recommendations,
    rawResult: {
      ...structured,
      visibleObservations: analysis.rawResult?.visibleObservations ?? structured.visibleObservations,
      photoComparison: analysis.rawResult?.photoComparison ?? structured.photoComparison,
      recommendationRevision: {
        id: revision.id,
        reasonType: revision.reasonType,
        reasonText: revision.reasonText,
        changedContext: revision.changedContext,
        promptVersion: revision.promptVersion,
        recommendationVersion: revision.recommendationVersion,
        impactLevel: revision.impactLevel,
        changeSummary: revision.changeSummary,
        refreshedAt: revision.createdAt
      }
    }
  };
}

function compactPreviousRecommendation(
  analysis: PlantAnalysisRecord | undefined,
  input: { previousContextSnapshot?: Record<string, unknown>; changedContext?: RecommendationChangedContext; reasonType?: string } = {}
) {
  return {
    status: analysis?.condition ?? null,
    keyConcerns: Array.isArray(analysis?.rawResult?.hypotheses)
      ? analysis.rawResult?.hypotheses?.slice(0, 3).map((item) => ({
          type: item.type,
          status: item.status,
          confidence: item.confidence
        }))
      : [],
    previousActions: analysis?.recommendations.slice(0, 4).map((item) => ({
      type: item.type,
      priority: item.priority,
      en: item.en,
      ru: item.ru
    })) ?? [],
    whatNotToDo: Array.isArray(analysis?.rawResult?.whatNotToDo) ? analysis.rawResult.whatNotToDo : [],
    confidence: typeof analysis?.rawResult?.confidence === "number" ? analysis.rawResult.confidence : null,
    sourceAnalysis: analysis ? { id: analysis.id, createdAt: analysis.createdAt } : null,
    previousContextSnapshot: input.previousContextSnapshot ?? null,
    changedContext: input.changedContext ?? null,
    reasonType: input.reasonType ?? null
  };
}

function recommendationRefreshReason(
  changedContext: RecommendationChangedContext,
  currentSnapshot: RecommendationContextSnapshot,
  locale: "en" | "ru",
  t: (key: never) => string
) {
  if (changedContext.room.lightLevel && currentSnapshot.room?.lightLevel) {
    const light = t(`homeContext.light.${currentSnapshot.room.lightLevel}` as never);
    return locale === "ru"
      ? `Я обновила рекомендации, потому что теперь знаю, что растение стоит в комнате с освещением: ${light}.`
      : `I updated recommendations because I now know this plant is in a room with ${light}.`;
  }

  if (changedContext.room.directSun && currentSnapshot.room?.directSun) {
    const sun = t(`homeContext.sun.${currentSnapshot.room.directSun}` as never);
    return locale === "ru"
      ? `Я обновила рекомендации с учётом прямого солнца в этой комнате: ${sun}.`
      : `I updated recommendations using the direct-sun context for this room: ${sun}.`;
  }

  if (changedContext.home.humidity && currentSnapshot.home?.humidityLevel) {
    const humidity = t(`homeContext.humidity.${currentSnapshot.home.humidityLevel}` as never);
    return locale === "ru"
      ? `Я обновила рекомендации, потому что теперь учитываю влажность дома: ${humidity}.`
      : `I updated recommendations because I now know the home humidity: ${humidity}.`;
  }

  if (changedContext.room.assignment && currentSnapshot.room?.name) {
    return locale === "ru"
      ? `Я обновила рекомендации с учётом комнаты: ${currentSnapshot.room.name}.`
      : `I updated recommendations using the room context: ${currentSnapshot.room.name}.`;
  }

  if (changedContext.care.soilCondition) {
    return locale === "ru" ? "Рекомендации обновлены с учётом новой проверки почвы." : "I updated recommendations using the latest soil check.";
  }

  if (changedContext.care.watering || changedContext.care.repotting || changedContext.care.history) {
    return locale === "ru" ? "Я обновила рекомендации с учётом последней истории ухода." : "I updated recommendations using the latest care history.";
  }

  if (changedContext.system.promptVersion || changedContext.system.modelVersion) {
    return locale === "ru" ? "Рекомендации обновлены с учётом новой логики анализа." : "I updated recommendations using the latest analysis logic.";
  }

  return locale === "ru"
    ? "Рекомендации уже были актуальны, я проверила их ещё раз."
    : "Recommendations were already current, so I checked them again.";
}

function staleReasonMessage(reasonKey: string, t: (key: never) => string) {
  return t(`plantAnalysis.staleReason.${reasonKey}` as never);
}

export function PlantDetailScreen({ plantId }: { plantId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const { addMilestone, addPlantPhotos, deletePlant, ensureFullPhotoUrl, getCoverPhoto, getCurrentRecommendationRevision, getPlant, getPlantAnalysis, getPlantCareEvents, getPlantHypothesisResolutions, getPlantMilestones, getPlantPhotos, homes, recordSoilChecked, resolvePlantHypothesis, rooms, saveBaselineHistory, savePlantAnalysis, saveRecommendationRevision, secondaryDataReady, waterPlant } =
    usePlantStore();
  const { locale } = useI18n();
  const plant = getPlant(plantId);
  const analysis = getPlantAnalysis(plantId);
  const currentRecommendationRevision = getCurrentRecommendationRevision(plantId);
  const displayAnalysis = analysisWithRecommendationRevision(analysis, currentRecommendationRevision);
  const coverPhoto = getCoverPhoto(plantId);
  const photos = getPlantPhotos(plantId);
  const milestones = useMemo(
    () => getPlantMilestones(plantId).sort(compareMilestonesNewestFirst),
    [getPlantMilestones, plantId]
  );
  const hypothesisResolutions = getPlantHypothesisResolutions(plantId);
  const careEvents = getPlantCareEvents(plantId);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isCompletingAction, setIsCompletingAction] = useState(false);
  const [fullCoverUrl, setFullCoverUrl] = useState<string | undefined>();
  const [baselineSaving, setBaselineSaving] = useState(false);
  const [photoAssessment, setPhotoAssessment] = useState<PhotoAssessmentState>({ status: "idle" });
  const [isUpdatingRecommendations, setIsUpdatingRecommendations] = useState(false);
  const [recommendationUpdateError, setRecommendationUpdateError] = useState<string | null>(null);
  const loggedEvents = useRef(new Set<string>());
  const openedActionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    logNavigationEvent("detail", plantId, "detail_shell_rendered");
  }, [plantId]);

  const careActionState = useMemo(
    () => (plant ? deriveCareActionState(plant, hypothesisResolutions, new Date(), { isCareDataReady: secondaryDataReady }) : null),
    [hypothesisResolutions, plant, secondaryDataReady]
  );
  const primaryCareAction = careActionState?.isActionable
    ? careActionState.actionType === "observe" || careActionState.actionType === "none"
      ? null
      : careActionState.actionType
    : null;

  useEffect(() => {
    const action = searchParams.get("action");
    if (action !== "check_soil" || openedActionRef.current === `${plantId}:${action}`) {
      return;
    }
    if (careActionState?.actionType !== "check_soil" || !careActionState.isActionable) {
      return;
    }
    openedActionRef.current = `${plantId}:${action}`;
    setSheet("check_soil");
  }, [careActionState, plantId, searchParams]);

  useEffect(() => {
    if (!plant || loggedEvents.current.has("plant_data_ready")) {
      return;
    }
    loggedEvents.current.add("plant_data_ready");
    logNavigationEvent("detail", plant.id, "plant_data_ready");
    logNavigationEvent("detail", plant.id, "recommendations_ready");
  }, [plant]);

  useEffect(() => {
    if (!plant || !secondaryDataReady || loggedEvents.current.has("history_ready")) {
      return;
    }
    loggedEvents.current.add("history_ready");
    logNavigationEvent("detail", plant.id, "history_ready");
  }, [plant, milestones.length, secondaryDataReady]);

  useEffect(() => {
    let isMounted = true;
    setFullCoverUrl(undefined);
    if (!plant || !coverPhoto?.id) {
      return;
    }

    void ensureFullPhotoUrl(coverPhoto.id).then((url) => {
      if (isMounted && url) {
        setFullCoverUrl(url);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [coverPhoto?.id, ensureFullPhotoUrl, plant]);

  if (!plant) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-[430px] bg-cream px-5 pb-10 pt-12">
        <section className="rounded-[28px] bg-[#fffaf3] p-5 shadow-soft">
          <h1 className="font-rounded text-2xl font-extrabold text-ink">{t("plantDetail.notFound")}</h1>
        </section>
      </main>
    );
  }

  const plantName = plantDisplayName(plant, t("plants.unknownName"));
  const hasWateringBaseline = milestones.some((milestone) => milestone.type === "watered" || milestone.type === "watering_unknown") || Boolean(plant.lastWateredAt);
  const hasRepottingBaseline = milestones.some((milestone) => milestone.type === "repotted" || milestone.type === "repotting_unknown");
  const baselineQuestion = !hasWateringBaseline ? "watering" : !hasRepottingBaseline ? "repotting" : null;
  const recommendationContextSnapshot = buildRecommendationContextSnapshot({
    plant,
    homes,
    rooms,
    milestones,
    careEvents,
    hypothesisResolutions
  });
  const currentChangedContext = changedContextSince(currentRecommendationRevision?.contextSnapshot, recommendationContextSnapshot, {
    previousPromptVersion: currentRecommendationRevision?.promptVersion,
    currentPromptVersion: RECOMMENDATION_PROMPT_VERSION,
    previousModelVersion: currentRecommendationRevision?.modelVersion
  });
  const staleReasons = currentRecommendationRevision
    ? staleReasonKeys({
        changedContext: currentChangedContext,
        currentRevision: currentRecommendationRevision
      })
    : ["no_revision"];
  const recommendationsAreStale = analysis
    ? !currentRecommendationRevision ||
      isRecommendationStale({
          plant,
          analysis,
          currentRevision: currentRecommendationRevision,
          homes,
          rooms,
          milestones,
          careEvents,
          hypothesisResolutions
        })
    : false;
  const visualEvidenceAge = sourceAnalysisAgeDays(analysis);
  const visualEvidenceIsStale = isVisualEvidenceStale(analysis);

  const completeWatering = async () => {
    if (isCompletingAction) {
      return;
    }

    setIsCompletingAction(true);
    try {
      await waterPlant(plant.id);
      setSheet(null);
      setToast(t("toast.wateringSaved"));
    } finally {
      setIsCompletingAction(false);
    }
  };

  const openPrimaryAction = () => {
    if (isCompletingAction) {
      return;
    }

    if (primaryCareAction === "water") {
      void completeWatering();
    } else if (primaryCareAction === "check_soil") {
      setSheet("check_soil");
    } else if (primaryCareAction === "take_photo") {
      setSheet("add_photo");
    }
  };

  const confirmDelete = () => {
    deletePlant(plant.id);
    router.push("/");
  };

  const saveBaselineAnswer = async (kind: "watering" | "repotting", eventDate?: string, unknown = false) => {
    if (baselineSaving) {
      return;
    }

    setBaselineSaving(true);
    try {
      await saveBaselineHistory(plant.id, { kind, eventDate, unknown });
      setToast(t("edit.saved"));
    } finally {
      setBaselineSaving(false);
    }
  };

  const analyzeNewPhotos = async (selectedPhotos: PendingPhotoUpload[], savedPhotos: PlantPhoto[]) => {
    if (!selectedPhotos.length || !savedPhotos.length) {
      return;
    }

    setPhotoAssessment({ status: "analyzing" });
    const startedAt = Date.now();
    try {
      const formData = new FormData();
      for (const photo of selectedPhotos) {
        const blob = await PhotoStorageRepository.getPhoto(photo.storageId);
        if (!blob) {
          throw new Error("temporary_photo_missing");
        }
        formData.append("photos", new File([blob], `${photo.originalName.replace(/\.[^.]+$/, "") || "plant-photo"}.jpg`, { type: blob.type || "image/jpeg" }));
        formData.append("photoTypes", photo.type);
        formData.append("photoSources", photo.source);
        formData.append("clientFileNames", photo.originalName);
        formData.append("clientMimeTypes", photo.originalType);
        formData.append("clientExtensions", photo.originalExtension ?? "");
        formData.append("clientByteSizes", String(photo.originalSize));
        formData.append("clientDecodeSucceeded", String(photo.decode.succeeded));
        formData.append("clientWidths", String(photo.decode.width ?? ""));
        formData.append("clientHeights", String(photo.decode.height ?? ""));
        formData.append("clientExifOrientations", String(photo.orientation.exifOrientation ?? ""));
        formData.append("clientPhysicallyRotated", String(photo.orientation.physicallyRotated));
        formData.append("clientOrientationSources", photo.orientation.orientationSource);
        formData.append("clientDebugIds", photo.debugId ?? photo.id);
      }
      formData.append("locale", locale);
      formData.append("currentCommonName", plant.speciesName ?? "");
      formData.append("currentScientificName", plant.scientificName ?? "");
      formData.append("currentDetectedSpecies", [plant.speciesName, plant.scientificName].filter(Boolean).join(" "));
      formData.append("currentLightCondition", plant.lightConditionKey ? t(plant.lightConditionKey) : "");
      formData.append("environmentContext", formatEnvironmentContextForPrompt(buildPlantEnvironmentContext({ plant, homes, rooms })));

      const response = await fetch("/api/analyze-plant", { method: "POST", body: formData });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.analysis) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "photo_assessment_failed");
      }

      const previousConfidence = analysis?.rawResult && typeof analysis.rawResult === "object" && "confidence" in analysis.rawResult ? Number(analysis.rawResult.confidence) : null;
      const comparisonTargetPhotoIds = [coverPhoto?.id, ...photos.slice(0, 2).map((photo) => photo.id)].filter(Boolean) as string[];
      const message =
        payload.analysis.condition === "needs_attention"
          ? t("photoAssessment.newSigns")
          : payload.analysis.condition === "healthy"
            ? t("photoAssessment.stable")
            : t("photoAssessment.reviewed");
      const changes = photoAssessmentChanges(payload.analysis.condition, locale);
      await savePlantAnalysis(plant.id, {
        sourcePhotoIds: savedPhotos.map((photo) => photo.id),
        detectedSpecies: payload.analysis.detectedSpecies,
        confidence: payload.analysis.confidence,
        condition: payload.analysis.condition,
        nextAction: payload.analysis.nextAction === "none" ? null : payload.analysis.nextAction,
        nextCheckInDays: payload.analysis.nextCheckInDays,
        summary: payload.analysis.summary,
        recommendations: payload.analysis.recommendations,
        rawResult: {
          ...payload.analysis,
          photoComparison: {
            analyzedPhotoIds: savedPhotos.map((photo) => photo.id),
            analysisTimestamp: new Date().toISOString(),
            comparisonTargetPhotoIds,
            observationsAdded: [],
            observationsUnchanged: (payload.analysis.visibleObservations ?? []).map((item: { en?: string; ru?: string }) => localized(item, locale)),
            observationsImproved: [],
            observationsWorsened: [],
            hypothesesChanged: [],
            recommendationChanges: changes,
            confidenceChanges: { previous: Number.isFinite(previousConfidence) ? previousConfidence : null, current: payload.analysis.confidence ?? null },
            reliableComparison: false,
            message: { en: payload.analysis.condition === "needs_attention" ? "I found new signs and updated the recommendations." : "I reviewed the new photos. The plant looks stable.", ru: message }
          }
        },
        model: payload.model
      });
      console.info("photo_assessment_completed", { plantId: plant.id, photoCount: savedPhotos.length, durationMs: Date.now() - startedAt });
      setPhotoAssessment({ status: "complete", message, changes });
    } catch (error) {
      console.warn("photo_assessment_failed", {
        plantId: plant.id,
        photoCount: selectedPhotos.length,
        message: error instanceof Error ? error.message : "Unknown error",
        durationMs: Date.now() - startedAt
      });
      setPhotoAssessment({ status: "failed", message: t("photoAssessment.failed"), retryPhotos: selectedPhotos, savedPhotos });
    }
  };

  const updateRecommendations = async () => {
    if (isUpdatingRecommendations || !photos.length || !analysis) {
      return;
    }

    setIsUpdatingRecommendations(true);
    setRecommendationUpdateError(null);
    const startedAt = Date.now();
    try {
      const photosForAnalysis = [coverPhoto, ...photos.filter((photo) => photo.id !== coverPhoto?.id)].filter(Boolean).slice(0, 5) as PlantPhoto[];
      const formData = new FormData();
      for (const photo of photosForAnalysis) {
        const url = (await ensureFullPhotoUrl(photo.id)) ?? photo.url ?? photo.thumbnailUrl;
        if (!url) {
          continue;
        }
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error("saved_photo_fetch_failed");
        }
        const blob = await response.blob();
        formData.append("photos", new File([blob], `${photo.id}.jpg`, { type: blob.type || "image/jpeg" }));
        formData.append("photoTypes", photo.type);
        formData.append("photoSources", "saved");
        formData.append("clientFileNames", `${photo.id}.jpg`);
        formData.append("clientMimeTypes", blob.type || "image/jpeg");
        formData.append("clientExtensions", "jpg");
        formData.append("clientByteSizes", String(blob.size));
        formData.append("clientDecodeSucceeded", "true");
        formData.append("clientWidths", "");
        formData.append("clientHeights", "");
        formData.append("clientExifOrientations", "");
        formData.append("clientPhysicallyRotated", "true");
        formData.append("clientOrientationSources", "saved_normalized_photo");
        formData.append("clientDebugIds", photo.id);
      }

      formData.append("locale", locale);
      formData.append("analysisMode", "recommendation_refresh");
      formData.append("currentCommonName", plant.speciesName ?? "");
      formData.append("currentScientificName", plant.scientificName ?? "");
      formData.append("currentDetectedSpecies", [plant.speciesName, plant.scientificName].filter(Boolean).join(" "));
      formData.append("currentLightCondition", plant.lightConditionKey ? t(plant.lightConditionKey) : "");
      formData.append("environmentContext", formatEnvironmentContextForPrompt(buildPlantEnvironmentContext({ plant, homes, rooms })));
      const changedContext = changedContextSince(currentRecommendationRevision?.contextSnapshot, recommendationContextSnapshot, {
        previousPromptVersion: currentRecommendationRevision?.promptVersion,
        currentPromptVersion: RECOMMENDATION_PROMPT_VERSION,
        previousModelVersion: currentRecommendationRevision?.modelVersion
      });
      const reasonType = reasonTypeFromChangedContext(changedContext);
      const refreshReason = recommendationRefreshReason(changedContext, recommendationContextSnapshot, locale, t);
      formData.append(
        "previousAnalysis",
        JSON.stringify({
          ...compactPreviousRecommendation(displayAnalysis, {
            previousContextSnapshot: currentRecommendationRevision?.contextSnapshot,
            changedContext,
            reasonType
          })
        })
      );

      const response = await fetch("/api/analyze-plant", { method: "POST", body: formData });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.analysis) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "recommendation_refresh_failed");
      }

      const revisionResult = await saveRecommendationRevision(plant.id, {
        analysisId: analysis.id,
        recommendations: Array.isArray(payload.analysis.recommendations) ? payload.analysis.recommendations : [],
        structuredResult: {
          ...payload.analysis,
          recommendationRefresh: {
            refreshedAt: new Date().toISOString(),
            reason: refreshReason,
            sourceAnalysisId: analysis.id,
            sourcePhotoIds: photosForAnalysis.map((photo) => photo.id),
            changedContext
          }
        },
        reasonType,
        reasonText: refreshReason,
        changedContext,
        contextSnapshot: recommendationContextSnapshot,
        promptVersion: RECOMMENDATION_PROMPT_VERSION,
        recommendationVersion: RECOMMENDATION_VERSION,
        modelVersion: typeof payload.model === "string" ? payload.model : undefined,
        impactLevel: payload.analysis.recommendationImpact?.impactLevel,
        changeSummary: payload.analysis.recommendationImpact?.changeSummary
      });
      console.info("recommendation_refresh_completed", { plantId: plant.id, photoCount: photosForAnalysis.length, durationMs: Date.now() - startedAt });
      setToast(revisionResult.unchanged ? t("plantAnalysis.alreadyCurrent") : t("plantAnalysis.updateSuccess"));
    } catch (error) {
      console.warn("recommendation_refresh_failed", {
        plantId: plant.id,
        message: error instanceof Error ? error.message : "Unknown error",
        durationMs: Date.now() - startedAt
      });
      setRecommendationUpdateError(t("plantAnalysis.updateFailed"));
    } finally {
      setIsUpdatingRecommendations(false);
    }
  };

  return (
    <main className={`mx-auto min-h-screen w-full max-w-[430px] bg-cream px-5 ${careActionState?.isActionable ? "pb-[calc(9rem+env(safe-area-inset-bottom))]" : "pb-10"}`}>
      <PlantDetailHeader
        title={plantName}
        isMenuOpen={isMenuOpen}
        onToggleMenu={() => setIsMenuOpen((value) => !value)}
        onEdit={() => {
          setIsMenuOpen(false);
          startNavigationLog("edit", plant.id, "edit_navigation_started");
          router.push(`/plants/${plant.id}/edit`);
        }}
        onDelete={() => {
          setIsMenuOpen(false);
          setIsDeleteOpen(true);
        }}
      />
      <PlantHeroImage
        plant={plant}
        coverPhotoUrl={fullCoverUrl ?? coverPhoto?.thumbnailUrl ?? coverPhoto?.url ?? "/plants/martha.png"}
        onLoad={() => {
          logNavigationEvent("detail", plant.id, fullCoverUrl ? "cover_full_image_ready" : "cover_thumbnail_ready");
        }}
      />
      <PlantStatusSection plant={plant} careActionState={careActionState} analysis={displayAnalysis} />
      {baselineQuestion ? (
        <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
          <p className="text-xs font-bold uppercase text-[#a09a90]">{baselineQuestion === "watering" ? t("baseline.welcome") : t("baseline.thanks")}</p>
          <h2 className="mt-1 font-rounded text-xl font-extrabold text-ink">
            {baselineQuestion === "watering" ? t("baseline.lastWateringQuestion") : t("baseline.lastRepottingQuestion")}
          </h2>
          <p className="mt-1 text-sm font-bold leading-5 text-[#7a7166]">
            {baselineQuestion === "watering" ? t("baseline.wateringHelper") : t("baseline.repottingHelper")}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" disabled={baselineSaving} onClick={() => void saveBaselineAnswer(baselineQuestion, toDateKey(new Date()))} className="min-h-11 rounded-[16px] bg-white px-3 text-sm font-extrabold text-[#5f594f] disabled:opacity-60">
              {t("addPlant.waterToday")}
            </button>
            <button type="button" disabled={baselineSaving} onClick={() => void saveBaselineAnswer(baselineQuestion, toDateKey(addDays(new Date(), -1)))} className="min-h-11 rounded-[16px] bg-white px-3 text-sm font-extrabold text-[#5f594f] disabled:opacity-60">
              {t("addPlant.waterYesterday")}
            </button>
            <button type="button" disabled={baselineSaving} onClick={() => void saveBaselineAnswer(baselineQuestion, toDateKey(addDays(new Date(), -4)))} className="min-h-11 rounded-[16px] bg-white px-3 text-sm font-extrabold text-[#5f594f] disabled:opacity-60">
              {t("addPlant.waterFewDaysAgo")}
            </button>
            <button type="button" disabled={baselineSaving} onClick={() => void saveBaselineAnswer(baselineQuestion, undefined, true)} className="min-h-11 rounded-[16px] bg-white px-3 text-sm font-extrabold text-[#5f594f] disabled:opacity-60">
              {t("addPlant.waterUnknown")}
            </button>
          </div>
          <div className="mt-3">
            <CareDateEditor
              label={t("baseline.dateLabel")}
              disabled={baselineSaving}
              onSaveDate={(date) => void saveBaselineAnswer(baselineQuestion, date)}
              onSaveUnknown={() => void saveBaselineAnswer(baselineQuestion, undefined, true)}
            />
          </div>
        </section>
      ) : null}
      {photoAssessment.status !== "idle" ? (
        <section className="mt-4 rounded-[24px] bg-[#eef5e8] p-4 shadow-soft">
          <p className="text-xs font-bold uppercase text-[#6f8c62]">{t("photoAssessment.title")}</p>
          <p className="mt-1 text-sm font-extrabold leading-5 text-[#355f3d]">
            {photoAssessment.status === "analyzing" ? t("photoAssessment.analyzing") : photoAssessment.message}
          </p>
          {photoAssessment.status === "complete" ? (
            <ul className="mt-3 grid gap-2 text-sm font-bold leading-5 text-[#4f6946]">
              {photoAssessment.changes.map((change) => (
                <li key={change} className="flex gap-2">
                  <span aria-hidden="true">✓</span>
                  <span>{change}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {photoAssessment.status === "failed" ? (
            <button type="button" onClick={() => void analyzeNewPhotos(photoAssessment.retryPhotos, photoAssessment.savedPhotos)} className="mt-3 min-h-10 rounded-[16px] bg-white px-3 text-sm font-extrabold text-[#2d7a4f]">
              {t("common.tryAgain")}
            </button>
          ) : null}
        </section>
      ) : null}
      <PlantAnalysisSection
        analysis={displayAnalysis}
        plant={plant}
        milestones={milestones}
        hypothesisResolutions={hypothesisResolutions}
        onResolveHypothesis={(hypothesis, status, result) => resolvePlantHypothesis(plant.id, hypothesis, status, result)}
      />
      {currentRecommendationRevision?.reasonText ? (
        <section className="mt-4 rounded-[24px] bg-[#eef5e8] p-4 shadow-soft">
          <p className="text-xs font-bold uppercase text-[#6f8c62]">{t("plantAnalysis.revisionNoteTitle")}</p>
          <p className="mt-1 text-sm font-extrabold leading-5 text-[#355f3d]">{currentRecommendationRevision.reasonText}</p>
          {currentRecommendationRevision.impactLevel ? (
            <p className="mt-3 inline-flex rounded-full bg-white/75 px-3 py-1 text-xs font-extrabold text-[#355f3d]">
              {t(impactLabelKey(currentRecommendationRevision.impactLevel) as never)}
            </p>
          ) : null}
          {localized(currentRecommendationRevision.changeSummary, locale) ? (
            <p className="mt-2 text-sm font-bold leading-5 text-[#4f6946]">{localized(currentRecommendationRevision.changeSummary, locale)}</p>
          ) : null}
        </section>
      ) : null}
      {visualEvidenceIsStale && visualEvidenceAge != null ? (
        <section className="mt-4 rounded-[24px] bg-white/75 p-4 shadow-soft">
          <p className="text-sm font-extrabold leading-5 text-ink">{t("plantAnalysis.visualEvidenceOldTitle")}</p>
          <p className="mt-1 text-sm font-bold leading-5 text-[#7a7166]">{t("plantAnalysis.visualEvidenceOldBody").replace("{days}", String(visualEvidenceAge))}</p>
        </section>
      ) : null}
      {recommendationsAreStale ? (
        <section className="mt-4 rounded-[24px] bg-[#fffaf3] p-4 shadow-soft">
          <p className="text-sm font-extrabold leading-5 text-ink">{t("plantAnalysis.staleTitle")}</p>
          <p className="mt-1 text-sm font-bold leading-5 text-[#7a7166]">{t("plantAnalysis.staleBody")}</p>
          {staleReasons.length ? (
            <ul className="mt-3 grid gap-1.5 text-sm font-bold leading-5 text-[#6f675c]">
              {staleReasons.slice(0, 3).map((reason) => (
                <li key={reason}>• {staleReasonMessage(reason, t)}</li>
              ))}
            </ul>
          ) : null}
          {recommendationUpdateError ? <p className="mt-3 rounded-[16px] bg-[#fdeaf0] p-3 text-sm font-bold leading-5 text-[#9b2c3e]">{recommendationUpdateError}</p> : null}
          <button
            type="button"
            onClick={() => void updateRecommendations()}
            disabled={isUpdatingRecommendations || !photos.length}
            className="mt-3 min-h-11 w-full rounded-[18px] bg-[#2d7a4f] px-4 text-sm font-extrabold text-white disabled:opacity-60"
          >
            {isUpdatingRecommendations ? t("plantAnalysis.updatingRecommendations") : t("plantAnalysis.updateRecommendations")}
          </button>
        </section>
      ) : null}
      <button
        type="button"
        onClick={() => setSheet("add_photo")}
        className="mt-4 min-h-12 w-full rounded-[20px] bg-[#ddf2dc] px-4 text-sm font-extrabold text-[#2d7a4f]"
      >
        {t("photos.addNewPhotos")}
      </button>
      <CareSummary plant={plant} />
      <PlantNotificationControls plant={plant} />
      <PhotoGallery photos={photos} onAddPhoto={() => setSheet("add_photo")} />
      <CareHistory milestones={milestones} onAddEvent={() => setSheet("add_event")} />

      {careActionState?.isActionable ? <PrimaryCareAction plant={plant} actionState={careActionState} onAction={openPrimaryAction} disabled={isCompletingAction} /> : null}
      {sheet === "check_soil" ? (
        <CheckSoilSheet
          onClose={() => setSheet(null)}
          onWatered={() => void completeWatering()}
          isSaving={isCompletingAction}
          plant={plant}
          milestones={milestones}
          hypothesisResolutions={hypothesisResolutions}
          onSoilChecked={async (result: SoilCheckResult, note) => {
            if (isCompletingAction) {
              return;
            }

            setIsCompletingAction(true);
            try {
              await recordSoilChecked(plant.id, result, note);
            } finally {
              setIsCompletingAction(false);
            }
            setToast(t("toast.soilChecked"));
          }}
        />
      ) : null}
      {sheet === "add_photo" ? (
        <PhotoUploadFlow
          title={t("photos.addPhotos")}
          hasExistingCover={photos.some((photo) => photo.isCover)}
          onCancel={() => setSheet(null)}
          onSave={async (selectedPhotos) => {
            setIsCompletingAction(true);
            try {
              const savedPhotos = await addPlantPhotos(plant.id, selectedPhotos);
              setSheet(null);
              setToast(t("toast.photoSaved"));
              void analyzeNewPhotos(selectedPhotos, savedPhotos);
            } finally {
              setIsCompletingAction(false);
            }
          }}
        />
      ) : null}
      {sheet === "add_event" ? (
        <MilestoneEditor
          onCancel={() => setSheet(null)}
          onSave={(input) => {
            addMilestone(plant.id, input);
            setSheet(null);
            setToast(t("edit.saved"));
          }}
        />
      ) : null}
      {isDeleteOpen ? <DeletePlantDialog plantName={plantName} onCancel={() => setIsDeleteOpen(false)} onConfirm={confirmDelete} /> : null}
      {toast ? <Toast message={toast} /> : null}
    </main>
  );
}
