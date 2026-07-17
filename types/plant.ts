import type { TranslationKey } from "@/i18n/dictionaries";

export type PlantStatus = "healthy" | "check_soon" | "needs_attention" | "unknown";

export type PlantAction = "water" | "check_soil" | "take_photo" | null;

export type PhotoType = "overview" | "leaf" | "pot" | "roots" | "problem" | "other";

export type PlantCareEventType = "watered" | "soil_checked" | "photo_added";
export type SoilCheckResult = "dry" | "slightly_damp" | "very_wet" | "not_sure";
export type CareScheduleStatus = "active" | "paused" | "needs_first_check";
export type PlantHypothesis = "soil_condition" | "repotting" | "root_condition" | "drainage" | "direct_sun" | "pests";
export type PlantHypothesisStatus = "confirmed" | "ruled_out" | "unknown";
export type HomeType = "apartment" | "house" | "studio" | "other";
export type HomeHumidityLevel = "dry" | "normal" | "humid" | "unknown";
export type RoomLightLevel = "low" | "medium_indirect" | "bright_indirect" | "direct_sun" | "unknown";
export type RoomDirectSun = "none" | "morning" | "midday" | "evening" | "most_of_day" | "unsure";
export type RoomTemperatureRelative = "cool" | "stable" | "warm" | "variable" | "unknown";
export type RoomAirConditioning = "inherit" | "yes" | "no" | "unknown";
export type PlantPositionInRoom = "window_sill" | "near_window" | "shelf" | "table" | "floor" | "hanging" | "other";

export type PlantMilestoneType =
  | "plant_added"
  | "watered"
  | "watering_unknown"
  | "soil_checked"
  | "moved_home"
  | "repotted"
  | "repotting_unknown"
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
  homeId?: string;
  roomId?: string;
  positionInRoom?: PlantPositionInRoom;
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
  updatedAt?: string;
}

export interface Room {
  id: string;
  homeId?: string;
  name: string;
  isCustom: boolean;
  lightLevel?: RoomLightLevel;
  directSun?: RoomDirectSun;
  temperatureRelative?: RoomTemperatureRelative;
  hasAirConditioning?: RoomAirConditioning;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface HomeContext {
  id: string;
  name: string;
  city?: string;
  country?: string;
  type?: HomeType;
  humidityLevel?: HomeHumidityLevel;
  hasAirConditioning?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
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
    careRightNow?: {
      type?: string;
      priority?: string;
      action?: { en?: string; ru?: string };
      reason?: { en?: string; ru?: string };
    }[];
    aboutSpecies?: {
      profileId?: string | null;
      displayName?: string | null;
      preferredLight?: { en?: string; ru?: string };
      wateringPattern?: { en?: string; ru?: string };
      humidity?: { en?: string; ru?: string };
      temperature?: { en?: string; ru?: string };
      growthBehavior?: { en?: string; ru?: string };
      commonMistakes?: { en?: string; ru?: string }[];
      normalBehaviors?: { en?: string; ru?: string }[];
      warningSigns?: { en?: string; ru?: string }[];
      beginnerTips?: { en?: string; ru?: string }[];
      bullets?: { en?: string; ru?: string }[];
    };
    clarificationQuestions?: {
      hypothesis?: PlantHypothesis;
      question?: { en?: string | null; ru?: string | null };
      options?: { label?: { en?: string | null; ru?: string | null }; status?: PlantHypothesisStatus; result?: string }[];
      reasonForAsking?: { en?: string | null; ru?: string | null };
      expectedImpact?: { en?: string; ru?: string };
    }[];
    reasoning?: {
      currentSituation?: { en?: string; ru?: string };
      speciesTraitsApplied?: { en?: string; ru?: string }[];
      diagnosisLogic?: { en?: string; ru?: string };
      whyThisMatters?: { en?: string; ru?: string };
    };
    alternativeCauses?: {
      hypothesis?: PlantHypothesis | null;
      confidence?: "low" | "medium";
      explanation?: { en?: string; ru?: string };
      whyLowerPriority?: { en?: string; ru?: string };
    }[];
    hypotheses?: {
      type?: PlantHypothesis;
      status?: "supported" | "possible" | "unlikely" | "resolved";
      confidence?: number;
      evidence?: string[];
      missingEvidence?: string[];
      canUserAnswerChangeRecommendation?: boolean;
      clarificationQuestion?: {
        question?: { en?: string | null; ru?: string | null };
        options?: { label?: { en?: string | null; ru?: string | null }; status?: PlantHypothesisStatus; result?: string }[];
        reasonForAsking?: { en?: string | null; ru?: string | null };
      };
    }[];
    speciesReasoning?: {
      profileId?: string;
      displayName?: string | null;
      traitsApplied?: string[];
      questionSelection?: {
        maxQuestions?: number;
        selectedQuestions?: string[];
        removedQuestions?: string[];
        rule?: string;
      };
    };
    photoComparison?: {
      analyzedPhotoIds?: string[];
      analysisTimestamp?: string;
      comparisonTargetPhotoIds?: string[];
      observationsAdded?: string[];
      observationsUnchanged?: string[];
      observationsImproved?: string[];
      observationsWorsened?: string[];
      hypothesesChanged?: string[];
      recommendationChanges?: string[];
      confidenceChanges?: { previous?: number | null; current?: number | null };
      reliableComparison?: boolean;
      message?: { en?: string | null; ru?: string | null };
    };
    [key: string]: unknown;
  };
  model?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface PlantRecommendationRevision {
  id: string;
  plantId: string;
  analysisId: string;
  recommendations: PlantAnalysisRecord["recommendations"];
  structuredResult?: PlantAnalysisRecord["rawResult"];
  reasonType?: RecommendationRevisionReasonType;
  reasonText?: string;
  changedContext?: Record<string, unknown>;
  contextSnapshot?: Record<string, unknown>;
  promptVersion?: string;
  recommendationVersion?: number;
  modelVersion?: string;
  impactLevel?: RecommendationImpactLevel;
  changeSummary?: {
    en?: string | null;
    ru?: string | null;
  };
  isCurrent: boolean;
  createdAt: string;
  updatedAt?: string;
}

export type RecommendationRevisionReasonType =
  | "room_changed"
  | "home_changed"
  | "plant_location_changed"
  | "light_changed"
  | "direct_sun_changed"
  | "temperature_changed"
  | "humidity_changed"
  | "air_conditioning_changed"
  | "soil_changed"
  | "watering_changed"
  | "repotting_changed"
  | "care_history_changed"
  | "prompt_updated"
  | "model_updated"
  | "manual_refresh"
  | "mixed_context_changes"
  | "unknown_legacy";

export type RecommendationImpactLevel = "none" | "minor" | "moderate" | "major";

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
  updatedAt?: string;
  eventDate: string | null;
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
