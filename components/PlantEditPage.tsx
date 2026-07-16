"use client";

import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/I18nProvider";
import { usePlantStore } from "@/data/PlantStore";
import { cleanScientificName, plantCommonName, plantDisplayName } from "@/lib/plant-display";
import { logNavigationEvent } from "@/lib/navigation-performance";
import { DeletePlantDialog } from "./DeletePlantDialog";
import { DeletePhotoDialog } from "./DeletePhotoDialog";
import { PhotoUploadFlow } from "./PhotoUploadFlow";
import { PhotoReviewGrid } from "./PhotoReviewGrid";
import { RoomPicker } from "./RoomPicker";
import { Toast } from "./Toast";

export function PlantEditPage({ plantId }: { plantId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const {
    addPlantPhotos,
    deletePlantPhoto,
    deletePlant,
    getPlant,
    getPlantPhotos,
    setCoverPhoto,
    updatePhotoType,
    updatePlant
  } = usePlantStore();
  const plant = getPlant(plantId);
  const photos = getPlantPhotos(plantId);
  const [homeName, setHomeName] = useState(plant?.homeName ?? "");
  const [speciesName, setSpeciesName] = useState(plant ? plantCommonName(plant) : "");
  const [scientificName, setScientificName] = useState(plant?.scientificName ?? "");
  const [roomKey, setRoomKey] = useState<string | undefined>(plant?.roomKey);
  const [isAddingPhoto, setIsAddingPhoto] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
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

  const save = () => {
    updatePlant(plant.id, { homeName, speciesName, scientificName: cleanScientificName(scientificName), roomKey });
    setToast(t("edit.saved"));
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

  return (
    <main className="mx-auto min-h-screen w-full max-w-[430px] overflow-x-hidden bg-cream px-5 pb-10 pt-12">
      <header className="mb-5 flex min-w-0 items-center justify-between gap-2">
        <Link href={`/plants/${plant.id}`} aria-label={t("settings.back")} className="flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-white/85 text-[#7d776b] shadow-[0_1px_8px_rgba(0,0,0,0.07)]">
          <ArrowLeft aria-hidden="true" size={20} />
        </Link>
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
        <div className="mt-4">
          <p className="mb-2 text-sm font-extrabold text-[#4f4940]">{t("plantDetail.location")}</p>
          <RoomPicker value={roomKey} onChange={setRoomKey} />
        </div>
      </section>

      <button type="button" onClick={save} className="mt-5 min-h-12 w-full rounded-[18px] bg-gradient-to-br from-[#92cc90] to-[#6ba369] px-4 text-sm font-extrabold text-white shadow-fab">
        {t("edit.save")}
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
