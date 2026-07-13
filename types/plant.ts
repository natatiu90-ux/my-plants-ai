import type { TranslationKey } from "@/i18n/dictionaries";

export type PlantStatus = "healthy" | "check_soon" | "needs_attention" | "unknown";

export type PlantAction = "water" | "check_soil" | "take_photo" | null;

export type PhotoType = "overview" | "leaf" | "pot" | "roots" | "problem" | "other";

export type PlantCareEventType = "watered" | "soil_checked" | "photo_added";
export type SoilCheckResult = "dry" | "slightly_damp" | "very_wet" | "not_sure";
export type CareScheduleStatus = "active" | "paused" | "needs_first_check";
export type PlantHypothesis = "pests" | "sun_stress" | "old_compacted_soil" | "recent_repotting" | "watering";
export type PlantHypothesisStatus = "confirmed" | "ruled_out" | "unknown";

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
  lastSoilCheckedAt?: string;
  lastSoilResult?: SoilCheckResult;
  nextCheckAt?: string;
  careScheduleStatus: CareScheduleStatus;
  notificationEnabled: boolean;
  lastNotificationSentAt?: string;
  notificationDueCycleKey?: string;
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

export interface PlantAnalysisRecord {
  id: string;
  plantId: string;
  condition: PlantStatus;
  nextAction?: PlantAction;
  summary?: {
    en?: string | null;
    ru?: string | null;
  };
  recommendations: {
    type?: string;
    priority?: string;
    en?: string;
    ru?: string;
  }[];
  rawResult?: {
    visibleObservations?: { en?: string; ru?: string }[];
    uncertainties?: { en?: string; ru?: string }[];
    [key: string]: unknown;
  };
  model?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface PlantHypothesisResolution {
  id: string;
  plantId: string;
  hypothesis: PlantHypothesis;
  status: PlantHypothesisStatus;
  userResult: string;
  evidenceSource: string;
  resolvedAt: string;
  createdAt: string;
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
