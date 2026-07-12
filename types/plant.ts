import type { TranslationKey } from "@/i18n/dictionaries";

export type PlantStatus = "healthy" | "check_soon" | "needs_attention" | "unknown";

export type PlantAction = "water" | "check_soil" | "take_photo" | null;

export type PhotoType = "overview" | "leaf" | "pot" | "roots" | "problem" | "other";

export type PlantCareEventType = "watered" | "soil_checked" | "photo_added";
export type SoilCheckResult = "dry" | "slightly_damp" | "very_wet" | "not_sure";

export type PlantMilestoneType =
  | "plant_added"
  | "watered"
  | "soil_checked"
  | "moved_home"
  | "repotted"
  | "fertilized"
  | "new_leaf"
  | "bloomed"
  | "pruned"
  | "damaged"
  | "recovered"
  | "treatment_started"
  | "treatment_completed"
  | "custom_note";

export interface Plant {
  id: string;
  homeName?: string;
  speciesName: string;
  scientificName?: string;
  status: PlantStatus;
  messageKey: TranslationKey;
  statusLabelKey: TranslationKey;
  nextAction?: PlantAction;
  lastWateredAt?: string;
  nextCheckAt?: string;
  roomKey?: string;
  lightConditionKey?: TranslationKey;
  notes?: string;
}

export interface Room {
  id: string;
  name: string;
  isCustom: boolean;
  createdAt: string;
}

export interface PlantCareEvent {
  id: string;
  plantId: string;
  type: PlantCareEventType;
  createdAt: string;
  metadata?: Record<string, string>;
}

export interface PlantMilestone {
  id: string;
  plantId: string;
  type: PlantMilestoneType;
  createdAt: string;
  eventDate?: string;
  titleKey?: TranslationKey;
  descriptionKey?: TranslationKey;
  customTitle?: string;
  customDescription?: string;
  note?: string;
  photoId?: string;
  isManual?: boolean;
}

export interface PlantPhoto {
  id: string;
  plantId: string;
  url: string;
  thumbnailUrl?: string;
  storageId?: string;
  storagePath?: string;
  type: PhotoType;
  createdAt: string;
  isCover: boolean;
  analysis?: {
    status: "pending" | "complete" | "failed";
    detectedIssues?: string[];
    recommendations?: string[];
  };
}
