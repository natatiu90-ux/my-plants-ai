import type { PendingPhotoUpload } from "@/components/photo-upload-types";

export const addPlantDraftStorageKey = "my_plants_add_plant_draft_v1";

export type AddPlantDraftStep = "pick" | "pick_more" | "review" | "analysis" | "confirm" | "details";
export type AddPlantDraftAnalysisStatus = "idle" | "preparing" | "requesting" | "interrupted" | "failed" | "completed";

export type PersistedPendingPhotoUpload = Omit<PendingPhotoUpload, "url"> & {
  url?: string;
};

export type AddPlantDraft = {
  draftId: string;
  step: AddPlantDraftStep;
  selectedPhotos: PersistedPendingPhotoUpload[];
  analysisStatus: AddPlantDraftAnalysisStatus;
  analysisRequestId: string | null;
  analysisStartedAt: string | null;
  analysisResult: unknown | null;
  analysisError: string | null;
  identifiedPlantDraft: {
    homeName: string;
    homeId?: string;
    speciesName: string;
    scientificName: string;
    roomKey?: string;
    roomId?: string;
  };
  updatedAt: string;
};

export function createAddPlantDraftId() {
  return `add-plant-${Date.now()}-${crypto.randomUUID()}`;
}

export function createAnalysisRequestId() {
  return `analysis-${Date.now()}-${crypto.randomUUID()}`;
}

export function hasUnfinishedAddPlantDraft() {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem(addPlantDraftStorageKey));
}

export function loadAddPlantDraft() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(addPlantDraftStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AddPlantDraft>;
    if (!parsed.draftId || !parsed.step || !Array.isArray(parsed.selectedPhotos)) {
      return null;
    }
    return parsed as AddPlantDraft;
  } catch {
    return null;
  }
}

export function saveAddPlantDraft(draft: AddPlantDraft) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    addPlantDraftStorageKey,
    JSON.stringify({
      ...draft,
      selectedPhotos: draft.selectedPhotos.map((photo) => ({
        ...photo,
        url: undefined
      })),
      updatedAt: new Date().toISOString()
    })
  );
}

export function clearAddPlantDraft() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(addPlantDraftStorageKey);
}
