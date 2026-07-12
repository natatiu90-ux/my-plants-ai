"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/I18nProvider";
import { usePlantStore } from "@/data/PlantStore";
import { PhotoImage } from "./PhotoImage";
import { PhotoUploadFlow } from "./PhotoUploadFlow";
import { RoomPicker } from "./RoomPicker";
import { Toast } from "./Toast";
import type { PendingPhotoUpload } from "./photo-upload-types";

type Step = "pick" | "analysis" | "form";

export function AddPlantWizard({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { t } = useI18n();
  const { addPlant } = usePlantStore();
  const [step, setStep] = useState<Step>("pick");
  const [selectedPhotos, setSelectedPhotos] = useState<PendingPhotoUpload[]>([]);
  const [homeName, setHomeName] = useState("");
  const [roomKey, setRoomKey] = useState<string | undefined>();
  const [showToast, setShowToast] = useState(false);
  const detectedSpecies = "Monstera deliciosa";

  useEffect(() => {
    if (step !== "analysis") {
      return;
    }

    const timeout = window.setTimeout(() => setStep("form"), 2200);
    return () => window.clearTimeout(timeout);
  }, [step]);

  if (step === "pick") {
    return (
      <PhotoUploadFlow
        title={t("addPlant.title")}
        hasExistingCover={false}
        onCancel={onClose}
        onSave={(photos) => {
          setSelectedPhotos(photos);
          setStep("analysis");
        }}
      />
    );
  }

  if (step === "analysis") {
    return (
      <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#1c1c1e]/20 px-4 pb-4 backdrop-blur-[2px] sm:items-center sm:pb-0">
        <div className="w-full max-w-[390px] rounded-[28px] bg-[#fffaf3] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.16)]">
          <h2 className="font-rounded text-2xl font-extrabold text-ink">{t("addPlant.analysisTitle")}</h2>
          <div className="mt-5 grid gap-3 text-[15px] font-bold text-[#5f594f]">
            <p>🌿 {t("addPlant.meeting")}</p>
            <p>✓ {t("addPlant.identifying")}</p>
            <p>… {t("addPlant.checking")}</p>
            <p>… {t("addPlant.preparing")}</p>
          </div>
        </div>
      </div>
    );
  }

  const coverPhoto = selectedPhotos.find((photo) => photo.isCover) ?? selectedPhotos[0];

  const save = () => {
    if (!selectedPhotos.length || !coverPhoto) {
      return;
    }

    const plantId = addPlant({
      homeName,
      speciesName: detectedSpecies,
      roomKey,
      photos: selectedPhotos
    });
    setShowToast(true);
    router.push(`/plants/${plantId}`);
    window.setTimeout(onClose, 1200);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#1c1c1e]/20 px-4 pb-4 backdrop-blur-[2px] sm:items-center sm:pb-0">
      <div role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-[390px] overflow-y-auto rounded-[28px] bg-[#fffaf3] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.16)]">
        <h2 className="font-rounded text-2xl font-extrabold text-ink">{t("addPlant.title")}</h2>
        {coverPhoto ? (
          <div className="relative mt-4 h-56 overflow-hidden rounded-[24px] bg-[#dde8dc]">
            <PhotoImage src={coverPhoto.url} alt={t("photos.photoAlt")} className="h-full w-full object-cover" />
          </div>
        ) : null}
        {selectedPhotos.length > 1 ? (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {selectedPhotos.map((photo) => (
              <div key={photo.id} className="relative size-16 shrink-0 overflow-hidden rounded-[16px] bg-[#dde8dc]">
                <PhotoImage src={photo.url} alt={t("photos.photoAlt")} className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        ) : null}
        <p className="mt-4 text-sm font-bold text-[#5f594f]">{t("addPlant.detected", { species: detectedSpecies })}</p>
        <label className="mt-4 block text-sm font-extrabold text-[#4f4940]">
          {t("addPlant.nickname")}
          <input
            value={homeName}
            onChange={(event) => setHomeName(event.target.value)}
            className="mt-2 min-h-12 w-full rounded-[18px] bg-white/80 px-4 text-base outline-none"
          />
        </label>
        <div className="mt-4">
          <p className="mb-2 text-sm font-extrabold text-[#4f4940]">{t("plantDetail.location")}</p>
          <RoomPicker value={roomKey} onChange={setRoomKey} />
        </div>
        <div className="mt-5 grid gap-2">
          <button type="button" onClick={save} className="min-h-12 rounded-[18px] bg-gradient-to-br from-[#92cc90] to-[#6ba369] px-4 text-sm font-extrabold text-white shadow-fab">
            {t("addPlant.save")}
          </button>
          <button type="button" onClick={onClose} className="min-h-12 rounded-[18px] px-4 text-sm font-extrabold text-[#777167]">
            {t("plantDetail.cancel")}
          </button>
        </div>
      </div>
      {showToast ? <Toast message={t("toast.welcomeHome")} /> : null}
    </div>
  );
}
