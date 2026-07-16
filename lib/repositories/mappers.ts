import type {
  PhotoType,
  Plant,
  PlantAnalysisRecord,
  PlantAction,
  PlantCareEvent,
  PlantCareEventType,
  CareScheduleStatus,
  PlantHypothesis,
  PlantHypothesisResolution,
  PlantHypothesisStatus,
  PlantMilestone,
  PlantMilestoneType,
  PlantPhoto,
  PlantStatus,
  HomeContext,
  Room,
  SoilCheckResult
} from "@/types/plant";
import type { TranslationKey } from "@/i18n/dictionaries";
import { commonNameFromScientificName } from "@/lib/plant-display";

export type PlantRow = {
  id: string;
  home_id?: string | null;
  room_id: string | null;
  position_in_room?: Plant["positionInRoom"] | null;
  room_key?: string | null;
  home_name: string | null;
  species_name: string | null;
  scientific_name: string | null;
  notes: string | null;
  status: PlantStatus;
  next_action: PlantAction | "none";
  last_watered_at: string | null;
  last_soil_checked_at?: string | null;
  last_soil_result?: SoilCheckResult | null;
  next_check_at: string | null;
  care_schedule_status?: CareScheduleStatus | null;
  notification_enabled?: boolean | null;
  last_notification_sent_at?: string | null;
  notification_due_cycle_key?: string | null;
  created_at: string;
};

export type PlantPhotoRow = {
  id: string;
  plant_id: string;
  storage_path: string;
  photo_type: PhotoType;
  is_cover: boolean;
  created_at: string;
  signed_url?: string | null;
  thumbnail_url?: string | null;
};

export type RoomRow = {
  id: string;
  home_id?: string | null;
  name: string;
  is_custom: boolean;
  light_level?: Room["lightLevel"] | null;
  direct_sun?: Room["directSun"] | null;
  temperature_relative?: Room["temperatureRelative"] | null;
  has_air_conditioning?: Room["hasAirConditioning"] | null;
  notes?: string | null;
  created_at: string;
};

export type HomeRow = {
  id: string;
  name: string;
  city?: string | null;
  country?: string | null;
  country_code?: string | null;
  home_type?: HomeContext["type"] | null;
  humidity_level?: HomeContext["humidityLevel"] | null;
  has_air_conditioning?: boolean | null;
  notes?: string | null;
  created_at: string;
};

export type MilestoneRow = {
  id: string;
  plant_id: string;
  type: PlantMilestoneType;
  event_date: string;
  note: string | null;
  photo_id: string | null;
  created_at: string;
};

export type CareEventRow = {
  id: string;
  plant_id: string;
  type: PlantCareEventType;
  event_date: string;
  created_at: string;
  metadata: Record<string, string> | null;
};

export type PlantAnalysisRow = {
  id: string;
  plant_id: string;
  condition: PlantStatus;
  next_action: PlantAction | "none" | null;
  summary_en: string | null;
  summary_ru: string | null;
  recommendations: unknown;
  raw_result: unknown;
  model: string | null;
  created_at: string;
  resolved_at?: string | null;
};

export type PlantHypothesisResolutionRow = {
  id: string;
  plant_id: string;
  hypothesis: string;
  status: PlantHypothesisStatus;
  user_result: string;
  evidence_source: string;
  resolved_at: string;
  created_at: string;
};

const statusLabelKeys: Record<PlantStatus, TranslationKey> = {
  healthy: "status.doingGreat",
  check_soon: "status.checkSoilToday",
  needs_attention: "status.needsHelp",
  unknown: "status.doingGreat"
};

const messageKeys: Record<PlantStatus, TranslationKey> = {
  healthy: "plants.afterWatering.message",
  check_soon: "plants.checkSoon.message",
  needs_attention: "plants.needsAttention.message",
  unknown: "plants.new.message"
};

function toDateKey(value: string | null | undefined) {
  return value ? value.slice(0, 10) : undefined;
}

export function mapPlant(row: PlantRow): Plant {
  const nextAction = row.next_action === "none" ? null : row.next_action;
  const statusLabelKey =
    nextAction === "water"
      ? "status.looksThirsty"
      : nextAction === "check_soil"
        ? "status.checkSoilToday"
        : statusLabelKeys[row.status];

  return {
    id: row.id,
    homeId: row.home_id ?? undefined,
    roomId: row.room_id ?? undefined,
    positionInRoom: row.position_in_room ?? undefined,
    homeName: row.home_name ?? undefined,
    speciesName: row.species_name || commonNameFromScientificName(row.scientific_name),
    scientificName: row.scientific_name ?? undefined,
    status: row.status,
    statusLabelKey,
    messageKey: messageKeys[row.status],
    nextAction,
    lastWateredAt: toDateKey(row.last_watered_at),
    lastSoilCheckedAt: toDateKey(row.last_soil_checked_at),
    lastSoilResult: row.last_soil_result ?? undefined,
    nextCheckAt: toDateKey(row.next_check_at),
    careScheduleStatus: row.care_schedule_status ?? "active",
    notificationEnabled: row.notification_enabled ?? true,
    lastNotificationSentAt: toDateKey(row.last_notification_sent_at),
    notificationDueCycleKey: row.notification_due_cycle_key ?? undefined,
    roomKey: row.room_key ?? row.room_id ?? undefined,
    lightConditionKey: "light.mediumIndirect",
    notes: row.notes ?? undefined
  };
}

export function mapPhoto(row: PlantPhotoRow): PlantPhoto {
  return {
    id: row.id,
    plantId: row.plant_id,
    url: row.signed_url ?? "",
    thumbnailUrl: row.thumbnail_url ?? row.signed_url ?? "",
    storageId: row.storage_path,
    storagePath: row.storage_path,
    type: row.photo_type,
    createdAt: toDateKey(row.created_at) ?? row.created_at,
    isCover: row.is_cover,
    analysis: { status: "pending" }
  };
}

export function mapRoom(row: RoomRow): Room {
  return {
    id: row.id,
    homeId: row.home_id ?? undefined,
    name: row.name,
    isCustom: row.is_custom,
    lightLevel: row.light_level ?? undefined,
    directSun: row.direct_sun ?? undefined,
    temperatureRelative: row.temperature_relative ?? undefined,
    hasAirConditioning: row.has_air_conditioning ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: toDateKey(row.created_at) ?? row.created_at
  };
}

export function mapHome(row: HomeRow): HomeContext {
  return {
    id: row.id,
    name: row.name,
    city: row.city ?? undefined,
    country: row.country ?? row.country_code ?? undefined,
    type: row.home_type ?? undefined,
    humidityLevel: row.humidity_level ?? undefined,
    hasAirConditioning: row.has_air_conditioning ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: toDateKey(row.created_at) ?? row.created_at
  };
}

export function mapMilestone(row: MilestoneRow): PlantMilestone {
  return {
    id: row.id,
    plantId: row.plant_id,
    type: row.type,
    createdAt: toDateKey(row.created_at) ?? row.created_at,
    eventDate: row.event_date,
    note: row.note ?? undefined,
    photoId: row.photo_id ?? undefined,
    isManual: row.type !== "plant_added"
  };
}

export function mapCareEvent(row: CareEventRow): PlantCareEvent {
  return {
    id: row.id,
    plantId: row.plant_id,
    type: row.type,
    createdAt: toDateKey(row.event_date) ?? row.created_at,
    metadata: row.metadata ?? undefined
  };
}

function isRecommendationList(value: unknown): PlantAnalysisRecord["recommendations"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is PlantAnalysisRecord["recommendations"][number] => Boolean(item && typeof item === "object"));
}

function isRawAnalysis(value: unknown): PlantAnalysisRecord["rawResult"] {
  return value && typeof value === "object" ? (value as PlantAnalysisRecord["rawResult"]) : undefined;
}

export function mapAnalysis(row: PlantAnalysisRow): PlantAnalysisRecord {
  return {
    id: row.id,
    plantId: row.plant_id,
    condition: row.condition,
    nextAction: row.next_action === "none" ? null : row.next_action,
    summary: {
      en: row.summary_en,
      ru: row.summary_ru
    },
    recommendations: isRecommendationList(row.recommendations),
    rawResult: isRawAnalysis(row.raw_result),
    model: row.model ?? undefined,
    createdAt: toDateKey(row.created_at) ?? row.created_at,
    resolvedAt: toDateKey(row.resolved_at) ?? undefined
  };
}

export function mapHypothesisResolution(row: PlantHypothesisResolutionRow): PlantHypothesisResolution {
  return {
    id: row.id,
    plantId: row.plant_id,
    hypothesis: normalizeHypothesis(row.hypothesis),
    status: row.status,
    userResult: row.user_result,
    evidenceSource: row.evidence_source,
    resolvedAt: toDateKey(row.resolved_at) ?? row.resolved_at,
    createdAt: toDateKey(row.created_at) ?? row.created_at
  };
}

function normalizeHypothesis(hypothesis: string): PlantHypothesis {
  if (hypothesis === "watering") return "soil_condition";
  if (hypothesis === "old_compacted_soil" || hypothesis === "recent_repotting") return "repotting";
  if (hypothesis === "sun_stress") return "direct_sun";
  if (hypothesis === "soil_condition" || hypothesis === "repotting" || hypothesis === "root_condition" || hypothesis === "drainage" || hypothesis === "direct_sun" || hypothesis === "pests") {
    return hypothesis;
  }
  return "soil_condition";
}
