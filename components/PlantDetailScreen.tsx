"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePlantStore } from "@/data/PlantStore";
import { useI18n } from "@/i18n/I18nProvider";
import { addDays, toDateKey } from "@/lib/date-format";
import { plantDisplayName } from "@/lib/plant-display";
import { deriveCareActionState } from "@/lib/plant-action-eligibility";
import { logNavigationEvent, startNavigationLog } from "@/lib/navigation-performance";
import { PhotoStorageRepository } from "@/lib/photo-storage";
import { CareHistory } from "./CareHistory";
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
import type { PlantPhoto, SoilCheckResult } from "@/types/plant";
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

export function PlantDetailScreen({ plantId }: { plantId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const { addMilestone, addPlantPhotos, deletePlant, ensureFullPhotoUrl, getCoverPhoto, getPlant, getPlantAnalysis, getPlantHypothesisResolutions, getPlantMilestones, getPlantPhotos, recordSoilChecked, resolvePlantHypothesis, saveBaselineHistory, savePlantAnalysis, secondaryDataReady, waterPlant } =
    usePlantStore();
  const { locale } = useI18n();
  const plant = getPlant(plantId);
  const analysis = getPlantAnalysis(plantId);
  const coverPhoto = getCoverPhoto(plantId);
  const photos = getPlantPhotos(plantId);
  const milestones = useMemo(
    () => getPlantMilestones(plantId).sort((a, b) => (b.eventDate ?? b.createdAt).localeCompare(a.eventDate ?? a.createdAt)),
    [getPlantMilestones, plantId]
  );
  const hypothesisResolutions = getPlantHypothesisResolutions(plantId);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isCompletingAction, setIsCompletingAction] = useState(false);
  const [fullCoverUrl, setFullCoverUrl] = useState<string | undefined>();
  const [baselineSaving, setBaselineSaving] = useState(false);
  const [baselineDate, setBaselineDate] = useState(toDateKey(new Date()));
  const [photoAssessment, setPhotoAssessment] = useState<PhotoAssessmentState>({ status: "idle" });
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
    if (!plant || !careActionState || process.env.NODE_ENV === "production") {
      return;
    }

    console.info("care_action_detail_state", {
      plantId: plant.id,
      rawNextAction: plant.nextAction,
      nextCheckAt: plant.nextCheckAt,
      lastSoilResult: plant.lastSoilResult,
      lastSoilCheckedAt: plant.lastSoilCheckedAt,
      derivedAction: careActionState.actionType,
      status: careActionState.status,
      actionable: careActionState.isActionable,
      reason: careActionState.reason,
      ctaVisible: careActionState.isActionable,
      cardBadgeKey: careActionState.cardBadgeKey
    });
  }, [careActionState, plant]);

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
      <PlantStatusSection plant={plant} careActionState={careActionState} />
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
            <button type="button" disabled={baselineSaving} onClick={() => void saveBaselineAnswer(baselineQuestion, toDateKey(new Date()))} className="min-h-11 rounded-[16px] bg-[#ddf2dc] px-3 text-sm font-extrabold text-[#2d7a4f] disabled:opacity-60">
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
          <div className="mt-3 rounded-[18px] bg-white/70 p-3">
            <label className="text-xs font-bold uppercase text-[#a09a90]" htmlFor="baseline-date">
              {t("addPlant.waterChooseDate")}
            </label>
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <input
                id="baseline-date"
                type="date"
                max={toDateKey(new Date())}
                value={baselineDate}
                onChange={(event) => setBaselineDate(event.target.value)}
                className="block min-h-11 w-full min-w-0 max-w-full overflow-hidden rounded-[16px] bg-[#fffaf3] px-3 text-base font-bold text-[#3f3b35] outline-none"
              />
              <button type="button" disabled={baselineSaving} onClick={() => void saveBaselineAnswer(baselineQuestion, baselineDate)} className="min-h-11 rounded-[16px] bg-[#ddf2dc] px-3 text-sm font-extrabold text-[#2d7a4f] disabled:opacity-60">
                {t("addPlant.add")}
              </button>
            </div>
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
        analysis={analysis}
        plant={plant}
        milestones={milestones}
        hypothesisResolutions={hypothesisResolutions}
        onResolveHypothesis={(hypothesis, status, result) => resolvePlantHypothesis(plant.id, hypothesis, status, result)}
      />
      <button
        type="button"
        onClick={() => setSheet("add_photo")}
        className="mt-4 min-h-12 w-full rounded-[20px] bg-[#ddf2dc] px-4 text-sm font-extrabold text-[#2d7a4f]"
      >
        {t("photos.addNewPhotos")}
      </button>
      <CareSummary plant={plant} careActionState={careActionState} />
      <PlantNotificationControls plant={plant} careActionState={careActionState} />
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
