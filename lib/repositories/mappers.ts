import type {
  PhotoType,
  Plant,
  PlantAction,
  PlantCareEvent,
  PlantCareEventType,
  PlantMilestone,
  PlantMilestoneType,
  PlantPhoto,
  PlantStatus,
  Room
} from "@/types/plant";
import type { TranslationKey } from "@/i18n/dictionaries";

export type PlantRow = {
  id: string;
  room_id: string | null;
  room_key?: string | null;
  home_name: string | null;
  species_name: string | null;
  scientific_name: string | null;
  notes: string | null;
  status: PlantStatus;
  next_action: PlantAction | "none";
  last_watered_at: string | null;
  next_check_at: string | null;
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
};

export type RoomRow = {
  id: string;
  name: string;
  is_custom: boolean;
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

const statusLabelKeys: Record<PlantStatus, TranslationKey> = {
  healthy: "status.doingGreat",
  check_soon: "status.checkSoilToday",
  needs_attention: "status.needsHelp",
  unknown: "status.doingGreat"
};

const messageKeys: Record<PlantStatus, TranslationKey> = {
  healthy: "plants.afterWatering.message",
  check_soon: "plants.luna.checkMessage",
  needs_attention: "plants.franklin.message",
  unknown: "plants.new.message"
};

function toDateKey(value: string | null | undefined) {
  return value ? value.slice(0, 10) : undefined;
}

export function mapPlant(row: PlantRow): Plant {
  return {
    id: row.id,
    homeName: row.home_name ?? undefined,
    speciesName: row.species_name || row.scientific_name || "Unknown plant",
    scientificName: row.scientific_name ?? undefined,
    status: row.status,
    statusLabelKey: statusLabelKeys[row.status],
    messageKey: messageKeys[row.status],
    nextAction: row.next_action === "none" ? null : row.next_action,
    lastWateredAt: toDateKey(row.last_watered_at),
    nextCheckAt: toDateKey(row.next_check_at),
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
    name: row.name,
    isCustom: row.is_custom,
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
