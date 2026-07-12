"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlantStore } from "@/data/PlantStore";
import { useI18n } from "@/i18n/I18nProvider";
import { plantDisplayName } from "@/lib/plant-display";
import { CareHistory } from "./CareHistory";
import { CareSummary } from "./CareSummary";
import { CheckSoilSheet } from "./CheckSoilSheet";
import { DeletePlantDialog } from "./DeletePlantDialog";
import { MilestoneEditor } from "./MilestoneEditor";
import { PhotoGallery } from "./PhotoGallery";
import { PhotoUploadFlow } from "./PhotoUploadFlow";
import { PlantDetailHeader } from "./PlantDetailHeader";
import { PlantHeroImage } from "./PlantHeroImage";
import { PlantStatusSection } from "./PlantStatusSection";
import { PrimaryCareAction } from "./PrimaryCareAction";
import { Toast } from "./Toast";
import type { SoilCheckResult } from "@/types/plant";

type Sheet = "check_soil" | "add_photo" | "add_event" | null;

export function PlantDetailScreen({ plantId }: { plantId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const { addMilestone, addPlantPhotos, deletePlant, getCoverPhoto, getPlant, getPlantMilestones, getPlantPhotos, recordSoilChecked, waterPlant } =
    usePlantStore();
  const plant = getPlant(plantId);
  const coverPhoto = getCoverPhoto(plantId);
  const photos = getPlantPhotos(plantId);
  const milestones = useMemo(
    () => getPlantMilestones(plantId).sort((a, b) => (b.eventDate ?? b.createdAt).localeCompare(a.eventDate ?? a.createdAt)),
    [getPlantMilestones, plantId]
  );
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isCompletingAction, setIsCompletingAction] = useState(false);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

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

    if (plant.nextAction === "water") {
      void completeWatering();
    } else if (plant.nextAction === "check_soil") {
      setSheet("check_soil");
    } else if (plant.nextAction === "take_photo") {
      setSheet("add_photo");
    }
  };

  const confirmDelete = () => {
    deletePlant(plant.id);
    router.push("/");
  };

  return (
    <main className={`mx-auto min-h-screen w-full max-w-[430px] bg-cream px-5 ${plant.nextAction ? "pb-32" : "pb-10"}`}>
      <PlantDetailHeader
        title={plantName}
        isMenuOpen={isMenuOpen}
        onToggleMenu={() => setIsMenuOpen((value) => !value)}
        onEdit={() => {
          setIsMenuOpen(false);
          router.push(`/plants/${plant.id}/edit`);
        }}
        onDelete={() => {
          setIsMenuOpen(false);
          setIsDeleteOpen(true);
        }}
      />
      <PlantHeroImage plant={plant} coverPhotoUrl={coverPhoto?.url ?? "/plants/martha.png"} />
      <PlantStatusSection plant={plant} />
      <button
        type="button"
        onClick={() => setSheet("add_photo")}
        className="mt-4 min-h-12 w-full rounded-[20px] bg-[#ddf2dc] px-4 text-sm font-extrabold text-[#2d7a4f]"
      >
        {t("photos.addNewPhotos")}
      </button>
      <CareSummary plant={plant} />
      <PhotoGallery photos={photos} onAddPhoto={() => setSheet("add_photo")} />
      <CareHistory milestones={milestones} onAddEvent={() => setSheet("add_event")} />

      <PrimaryCareAction plant={plant} onAction={openPrimaryAction} disabled={isCompletingAction} />
      {sheet === "check_soil" ? (
        <CheckSoilSheet
          onClose={() => setSheet(null)}
          onWatered={() => void completeWatering()}
          isSaving={isCompletingAction}
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
              await addPlantPhotos(plant.id, selectedPhotos);
              setSheet(null);
              setToast(t("toast.photoSaved"));
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
