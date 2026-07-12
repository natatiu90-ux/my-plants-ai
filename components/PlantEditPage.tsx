"use client";

import Link from "next/link";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/I18nProvider";
import { usePlantStore } from "@/data/PlantStore";
import { cleanScientificName, plantCommonName, plantDisplayName } from "@/lib/plant-display";
import type { PlantMilestone } from "@/types/plant";
import { CareHistoryItem } from "./CareHistoryItem";
import { DeletePlantDialog } from "./DeletePlantDialog";
import { DeletePhotoDialog } from "./DeletePhotoDialog";
import { MilestoneEditor } from "./MilestoneEditor";
import { PhotoUploadFlow } from "./PhotoUploadFlow";
import { PhotoReviewGrid } from "./PhotoReviewGrid";
import { RoomPicker } from "./RoomPicker";
import { Toast } from "./Toast";

export function PlantEditPage({ plantId }: { plantId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const {
    addMilestone,
    addPlantPhotos,
    deleteMilestone,
    deletePlantPhoto,
    deletePlant,
    getPlant,
    getPlantMilestones,
    getPlantPhotos,
    setCoverPhoto,
    updateMilestone,
    updatePhotoType,
    updatePlant
  } = usePlantStore();
  const plant = getPlant(plantId);
  const photos = getPlantPhotos(plantId);
  const [homeName, setHomeName] = useState(plant?.homeName ?? "");
  const [speciesName, setSpeciesName] = useState(plant ? plantCommonName(plant) : "");
  const [scientificName, setScientificName] = useState(plant?.scientificName ?? "");
  const [roomKey, setRoomKey] = useState<string | undefined>(plant?.roomKey);
  const [notes, setNotes] = useState(plant?.notes ?? "");
  const [isAddingPhoto, setIsAddingPhoto] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<PlantMilestone | null>(null);
  const [isAddingMilestone, setIsAddingMilestone] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const milestones = useMemo(
    () =>
      getPlantMilestones(plantId).sort((a, b) =>
        (b.eventDate ?? b.createdAt).localeCompare(a.eventDate ?? a.createdAt)
      ),
    [getPlantMilestones, plantId]
  );

  if (!plant) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-[430px] bg-cream px-5 pb-10 pt-12">
        <h1 className="font-rounded text-2xl font-extrabold text-ink">{t("plantDetail.notFound")}</h1>
      </main>
    );
  }

  const save = () => {
    updatePlant(plant.id, { homeName, speciesName, scientificName: cleanScientificName(scientificName), roomKey, notes });
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
    <main className="mx-auto min-h-screen w-full max-w-[430px] bg-cream px-5 pb-10 pt-12">
      <header className="mb-5 flex items-center justify-between">
        <Link href={`/plants/${plant.id}`} aria-label={t("settings.back")} className="flex size-11 items-center justify-center rounded-[15px] bg-white/85 text-[#7d776b] shadow-[0_1px_8px_rgba(0,0,0,0.07)]">
          <ArrowLeft aria-hidden="true" size={20} />
        </Link>
        <h1 className="font-rounded text-[28px] font-black leading-none text-ink">{t("edit.title")}</h1>
        <div aria-hidden="true" className="size-11" />
      </header>

      <section className="rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <h2 className="font-rounded text-xl font-extrabold text-ink">{t("photos.plantPhotos")}</h2>
          <button type="button" onClick={() => setIsAddingPhoto(true)} className="flex min-h-10 items-center gap-1 rounded-full bg-[#ddf2dc] px-3 text-sm font-extrabold text-[#2d7a4f]">
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
        <label className="block text-sm font-extrabold text-[#4f4940]">
          {t("addPlant.nickname")}
          <input value={homeName} onChange={(event) => setHomeName(event.target.value)} className="mt-2 min-h-12 w-full rounded-[18px] bg-white/80 px-4 text-base outline-none" />
        </label>
        <label className="mt-4 block text-sm font-extrabold text-[#4f4940]">
          {t("addPlant.commonName")}
          <input value={speciesName} onChange={(event) => setSpeciesName(event.target.value)} className="mt-2 min-h-12 w-full rounded-[18px] bg-white/80 px-4 text-base outline-none" />
        </label>
        <label className="mt-4 block text-sm font-extrabold text-[#4f4940]">
          {t("addPlant.scientificName")}
          <input value={scientificName} onChange={(event) => setScientificName(event.target.value)} className="mt-2 min-h-12 w-full rounded-[18px] bg-white/80 px-4 text-base outline-none" />
        </label>
        <div className="mt-4">
          <p className="mb-2 text-sm font-extrabold text-[#4f4940]">{t("plantDetail.location")}</p>
          <RoomPicker value={roomKey} onChange={setRoomKey} />
        </div>
      </section>

      <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <h2 className="font-rounded text-xl font-extrabold text-ink">{t("plantDetail.story")}</h2>
          <button
            type="button"
            onClick={() => setIsAddingMilestone(true)}
            className="flex min-h-10 items-center gap-1 rounded-[16px] bg-[#ddf2dc] px-3 text-xs font-extrabold text-[#2d7a4f]"
          >
            <Plus aria-hidden="true" size={15} />
            {t("story.addEvent")}
          </button>
        </div>
        {milestones.length ? (
          <div className="grid gap-2">
            {milestones.map((milestone) => (
              <div key={milestone.id} className="rounded-[24px] bg-white/40 p-2">
                <ul>
                  <CareHistoryItem milestone={milestone} />
                </ul>
                {milestone.isManual ? (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingMilestone(milestone)}
                      className="flex min-h-10 items-center justify-center gap-2 rounded-[16px] bg-white/75 px-3 text-xs font-extrabold text-[#5f594f]"
                    >
                      <Pencil aria-hidden="true" size={14} />
                      {t("story.editEvent")}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteMilestone(milestone.id)}
                      className="flex min-h-10 items-center justify-center gap-2 rounded-[16px] bg-[#f4d7dc] px-3 text-xs font-extrabold text-[#a13445]"
                    >
                      <Trash2 aria-hidden="true" size={14} />
                      {t("story.deleteEvent")}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-[22px] bg-white/55 p-4 text-sm font-bold leading-6 text-[#676157]">{t("plantDetail.storyEmpty")}</p>
        )}
      </section>

      <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
        <h2 className="mb-3 px-1 font-rounded text-xl font-extrabold text-ink">{t("edit.notes")}</h2>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder={t("edit.notesPlaceholder")}
          className="min-h-36 w-full rounded-[20px] bg-white/80 p-4 text-sm leading-6 outline-none"
        />
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
      {isAddingMilestone ? (
        <MilestoneEditor
          onCancel={() => setIsAddingMilestone(false)}
          onSave={(input) => {
            addMilestone(plant.id, input);
            setIsAddingMilestone(false);
            setToast(t("edit.saved"));
          }}
        />
      ) : null}
      {editingMilestone ? (
        <MilestoneEditor
          milestone={editingMilestone}
          onCancel={() => setEditingMilestone(null)}
          onSave={(input) => {
            updateMilestone(editingMilestone.id, input);
            setEditingMilestone(null);
            setToast(t("edit.saved"));
          }}
        />
      ) : null}
      {isDeleteOpen ? <DeletePlantDialog plantName={plantDisplayName(plant, t("plants.unknownName"))} onCancel={() => setIsDeleteOpen(false)} onConfirm={confirmDelete} /> : null}
      {deletingPhotoId ? <DeletePhotoDialog onCancel={() => setDeletingPhotoId(null)} onConfirm={confirmDeletePhoto} /> : null}
      {toast ? <Toast message={toast} /> : null}
    </main>
  );
}
