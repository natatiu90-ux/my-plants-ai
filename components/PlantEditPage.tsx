"use client";

import { ArrowLeft, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/I18nProvider";
import { usePlantStore } from "@/data/PlantStore";
import { findExistingBaselineMilestone } from "@/lib/care-baseline";
import { cleanScientificName, plantCommonName, plantDisplayName } from "@/lib/plant-display";
import { logNavigationEvent } from "@/lib/navigation-performance";
import { DeletePlantDialog } from "./DeletePlantDialog";
import { DeletePhotoDialog } from "./DeletePhotoDialog";
import { CareDateEditor } from "./CareDateEditor";
import { LocationPicker } from "./LocationPicker";
import { PhotoUploadFlow } from "./PhotoUploadFlow";
import { PhotoReviewGrid } from "./PhotoReviewGrid";
import { Toast } from "./Toast";

export function PlantEditPage({ plantId }: { plantId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const {
    addPlantPhotos,
    deletePlantPhoto,
    deletePlant,
    getPlant,
    getPlantMilestones,
    getPlantPhotos,
    saveBaselineHistory,
    setCoverPhoto,
    updatePhotoType,
    updatePlant
  } = usePlantStore();
  const plant = getPlant(plantId);
  const photos = getPlantPhotos(plantId);
  const milestones = getPlantMilestones(plantId);
  const repottingBaseline = findExistingBaselineMilestone(milestones, plantId, "repotting");
  const [homeName, setHomeName] = useState(plant?.homeName ?? "");
  const [speciesName, setSpeciesName] = useState(plant ? plantCommonName(plant) : "");
  const [scientificName, setScientificName] = useState(plant?.scientificName ?? "");
  const [homeId, setHomeId] = useState<string | undefined>(plant?.homeId);
  const [roomId, setRoomId] = useState<string | undefined>(plant?.roomId ?? (plant?.roomKey?.startsWith("rooms.") ? undefined : plant?.roomKey));
  const [positionInRoom, setPositionInRoom] = useState(plant?.positionInRoom);
  const [roomKey, setRoomKey] = useState<string | undefined>(plant?.roomKey);
  const [isAddingPhoto, setIsAddingPhoto] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const didSaveRef = useRef(false);
  const didLogEditDataReady = useRef(false);

  useEffect(() => {
    logNavigationEvent("edit", plantId, "edit_shell_rendered");
  }, [plantId]);

  useEffect(() => {
    if (!plant || didLogEditDataReady.current) {
      return;
    }
    didLogEditDataReady.current = true;
    logNavigationEvent("edit", plant.id, "edit_data_ready");
  }, [plant]);

  if (!plant) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-[430px] bg-cream px-5 pb-10 pt-12">
        <h1 className="font-rounded text-2xl font-extrabold text-ink">{t("plantDetail.notFound")}</h1>
      </main>
    );
  }

  const hasChanges =
    homeName !== (plant.homeName ?? "") ||
    speciesName !== plantCommonName(plant) ||
    cleanScientificName(scientificName) !== (plant.scientificName ?? "") ||
    homeId !== plant.homeId ||
    roomId !== (plant.roomId ?? (plant.roomKey?.startsWith("rooms.") ? undefined : plant.roomKey)) ||
    positionInRoom !== plant.positionInRoom;

  const goBack = () => {
    if (!didSaveRef.current && hasChanges && !window.confirm(t("edit.discardChangesConfirm"))) {
      return;
    }
    router.push(`/plants/${plant.id}`);
  };

  const save = async () => {
    if (isSaving || !hasChanges) {
      return;
    }
    setSaveError(null);
    setIsSaving(true);
    try {
      await updatePlant(plant.id, {
        homeId,
        homeName,
        speciesName,
        scientificName: cleanScientificName(scientificName),
        roomId,
        roomKey: roomId ?? roomKey,
        positionInRoom
      });
      didSaveRef.current = true;
      setToast(t("edit.saved"));
      window.setTimeout(() => router.push(`/plants/${plant.id}`), 500);
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("plant_edit_save_failed", {
          plantId: plant.id,
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
      setSaveError(t("edit.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = () => {
    deletePlant(plant.id);
    router.push("/");
  };

  const confirmDeletePhoto = async () => {
    if (!deletingPhotoId) {
      return;
    }

    const result = await deletePlantPhoto(plant.id, deletingPhotoId);
    setDeletingPhotoId(null);
    if (result === "only-photo") {
      setToast(t("photos.onlyPhotoError"));
    }
  };

  const saveRepottingDate = async (date?: string, unknown = false) => {
    setSaveError(null);
    try {
      await saveBaselineHistory(plant.id, { kind: "repotting", eventDate: date, unknown });
      setToast(t("edit.saved"));
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("repotting_baseline_save_failed", {
          plantId: plant.id,
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
      setSaveError(t("edit.saveFailed"));
    }
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-[430px] overflow-x-hidden bg-cream px-5 pb-10 pt-12">
      <header className="mb-5 flex min-w-0 items-center justify-between gap-2">
        <button type="button" onClick={goBack} aria-label={t("settings.back")} className="flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-white/85 text-[#7d776b] shadow-[0_1px_8px_rgba(0,0,0,0.07)]">
          <ArrowLeft aria-hidden="true" size={20} />
        </button>
        <h1 className="min-w-0 flex-1 truncate px-1 text-center font-rounded text-[28px] font-black leading-none text-ink">{t("edit.title")}</h1>
        <div aria-hidden="true" className="size-11 shrink-0" />
      </header>

      <section className="rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
        <div className="mb-3 flex min-w-0 items-center justify-between gap-2 px-1">
          <h2 className="min-w-0 flex-1 truncate font-rounded text-xl font-extrabold text-ink">{t("photos.plantPhotos")}</h2>
          <button type="button" onClick={() => setIsAddingPhoto(true)} className="flex min-h-10 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[#ddf2dc] px-3 text-sm font-extrabold text-[#2d7a4f]">
            <Plus aria-hidden="true" size={16} />
            {t("photos.addPhotos")}
          </button>
        </div>
        <PhotoReviewGrid
          photos={photos}
          onChangeType={updatePhotoType}
          onRemovePhoto={(photoId) => setDeletingPhotoId(photoId)}
          onSelectCover={(photoId) => setCoverPhoto(plant.id, photoId)}
        />
      </section>

      <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
        <h2 className="mb-3 px-1 font-rounded text-xl font-extrabold text-ink">{t("edit.general")}</h2>
        <label className="block min-w-0 text-sm font-extrabold text-[#4f4940]">
          {t("addPlant.nickname")}
          <input value={homeName} onChange={(event) => setHomeName(event.target.value)} className="mt-2 block min-h-12 w-full min-w-0 max-w-full rounded-[18px] bg-white/80 px-4 text-base outline-none" />
        </label>
        <label className="mt-4 block min-w-0 text-sm font-extrabold text-[#4f4940]">
          {t("addPlant.commonName")}
          <input value={speciesName} onChange={(event) => setSpeciesName(event.target.value)} className="mt-2 block min-h-12 w-full min-w-0 max-w-full rounded-[18px] bg-white/80 px-4 text-base outline-none" />
        </label>
        <label className="mt-4 block min-w-0 text-sm font-extrabold text-[#4f4940]">
          {t("addPlant.scientificName")}
          <input value={scientificName} onChange={(event) => setScientificName(event.target.value)} className="mt-2 block min-h-12 w-full min-w-0 max-w-full rounded-[18px] bg-white/80 px-4 text-base outline-none" />
        </label>
      </section>

      <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
        <h2 className="mb-3 px-1 font-rounded text-xl font-extrabold text-ink">{t("plantDetail.location")}</h2>
        <LocationPicker
          homeId={homeId}
          roomId={roomId}
          positionInRoom={positionInRoom}
          onChange={(location) => {
            setHomeId(location.homeId);
            setRoomId(location.roomId);
            setRoomKey(location.roomId);
            setPositionInRoom(location.positionInRoom);
          }}
        />
        {plant.roomKey?.startsWith("rooms.") && !roomId ? (
          <p className="mt-3 rounded-[18px] bg-white/70 p-3 text-sm font-bold text-[#7a7166]">
            {t("homeContext.legacyRoomNote")}
          </p>
        ) : null}
      </section>

      <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
        <h2 className="mb-3 px-1 font-rounded text-xl font-extrabold text-ink">{t("edit.careHistory")}</h2>
        <CareDateEditor
          label={t("baseline.lastRepottingLabel")}
          value={repottingBaseline?.type === "repotted" ? repottingBaseline.eventDate ?? undefined : undefined}
          isUnknown={repottingBaseline?.type === "repotting_unknown"}
          onSaveDate={(date) => void saveRepottingDate(date)}
          onSaveUnknown={() => void saveRepottingDate(undefined, true)}
        />
      </section>

      {saveError ? <p className="mt-4 rounded-[18px] bg-[#fdeaf0] p-3 text-sm font-bold leading-5 text-[#9b2c3e]">{saveError}</p> : null}
      {!hasChanges ? <p className="mt-4 text-center text-xs font-bold text-[#8a8378]">{t("edit.noChanges")}</p> : null}
      <button type="button" onClick={() => void save()} disabled={isSaving || !hasChanges} className="mt-5 min-h-12 w-full rounded-[18px] bg-gradient-to-br from-[#92cc90] to-[#6ba369] px-4 text-sm font-extrabold text-white shadow-fab disabled:opacity-60">
        {isSaving ? t("edit.saving") : t("edit.save")}
      </button>

      <button type="button" onClick={() => setIsDeleteOpen(true)} className="mt-6 min-h-12 w-full rounded-[18px] bg-[#f4d7dc] px-4 text-sm font-extrabold text-[#a13445]">
        {t("plantDetail.deletePlant")}
      </button>

      {isAddingPhoto ? (
        <PhotoUploadFlow
          title={t("photos.addPhotos")}
          hasExistingCover={photos.some((photo) => photo.isCover)}
          onCancel={() => setIsAddingPhoto(false)}
          onSave={(selectedPhotos) => {
            addPlantPhotos(plant.id, selectedPhotos);
            setIsAddingPhoto(false);
            setToast(t("toast.photoSaved"));
          }}
        />
      ) : null}
      {isDeleteOpen ? <DeletePlantDialog plantName={plantDisplayName(plant, t("plants.unknownName"))} onCancel={() => setIsDeleteOpen(false)} onConfirm={confirmDelete} /> : null}
      {deletingPhotoId ? <DeletePhotoDialog onCancel={() => setDeletingPhotoId(null)} onConfirm={confirmDeletePhoto} /> : null}
      {toast ? <Toast message={toast} /> : null}
    </main>
  );
}
