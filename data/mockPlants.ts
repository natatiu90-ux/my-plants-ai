import type { Plant, PlantCareEvent, PlantMilestone, PlantPhoto, PlantStatus } from "@/types/plant";

export const statusPriority: Record<PlantStatus, number> = {
  needs_attention: 0,
  check_soon: 1,
  unknown: 2,
  healthy: 3
};

export const mockPlants: Plant[] = [
  {
    id: "martha",
    homeName: "Martha",
    speciesName: "Monstera deliciosa",
    status: "healthy",
    messageKey: "plants.martha.message",
    statusLabelKey: "status.growingBeautifully",
    nextAction: null,
    lastWateredAt: "2026-07-08",
    nextCheckAt: "2026-07-16",
    careScheduleStatus: "active",
    notificationEnabled: true,
    roomKey: "rooms.livingRoom",
    lightConditionKey: "light.brightIndirect"
  },
  {
    id: "ollie",
    homeName: "Ollie",
    speciesName: "Epipremnum aureum",
    status: "check_soon",
    messageKey: "plants.ollie.message",
    statusLabelKey: "status.looksThirsty",
    nextAction: "water",
    lastWateredAt: "2026-07-06",
    nextCheckAt: "2026-07-12",
    careScheduleStatus: "active",
    notificationEnabled: true,
    roomKey: "rooms.kitchen",
    lightConditionKey: "light.mediumIndirect"
  },
  {
    id: "franklin",
    homeName: "Franklin",
    speciesName: "Ficus lyrata",
    status: "needs_attention",
    messageKey: "plants.franklin.message",
    statusLabelKey: "status.needsHelp",
    nextAction: "take_photo",
    lastWateredAt: "2026-07-06",
    nextCheckAt: "2026-07-12",
    careScheduleStatus: "active",
    notificationEnabled: true,
    roomKey: "rooms.livingRoom",
    lightConditionKey: "light.brightIndirect"
  },
  {
    id: "luna",
    homeName: "Luna",
    speciesName: "Spathiphyllum wallisii",
    status: "check_soon",
    messageKey: "plants.luna.checkMessage",
    statusLabelKey: "status.checkSoilToday",
    nextAction: "check_soil",
    lastWateredAt: "2026-07-09",
    nextCheckAt: "2026-07-12",
    careScheduleStatus: "active",
    notificationEnabled: true,
    roomKey: "rooms.bedroom",
    lightConditionKey: "light.softMorning"
  }
];

export const mockPhotos: PlantPhoto[] = [
  { id: "martha-photo-cover", plantId: "martha", url: "/plants/martha.png", type: "overview", createdAt: "2026-07-10", isCover: true },
  { id: "martha-photo-leaf", plantId: "martha", url: "/plants/luna.png", type: "leaf", createdAt: "2026-07-09", isCover: false },
  { id: "ollie-photo-cover", plantId: "ollie", url: "/plants/ollie.png", type: "overview", createdAt: "2026-07-11", isCover: true },
  { id: "ollie-photo-pot", plantId: "ollie", url: "/plants/martha.png", type: "pot", createdAt: "2026-07-07", isCover: false },
  { id: "franklin-photo-cover", plantId: "franklin", url: "/plants/franklin.png", type: "overview", createdAt: "2026-07-11", isCover: true },
  { id: "franklin-photo-problem", plantId: "franklin", url: "/plants/franklin.png", type: "problem", createdAt: "2026-07-11", isCover: false },
  { id: "luna-photo-cover", plantId: "luna", url: "/plants/luna.png", type: "overview", createdAt: "2026-07-09", isCover: true },
  { id: "luna-photo-leaf", plantId: "luna", url: "/plants/martha.png", type: "leaf", createdAt: "2026-07-08", isCover: false }
];

export const mockCareEvents: PlantCareEvent[] = [
  { id: "martha-watered-1", plantId: "martha", type: "watered", createdAt: "2026-07-08" },
  { id: "ollie-watered-1", plantId: "ollie", type: "watered", createdAt: "2026-07-06" },
  { id: "ollie-soil-1", plantId: "ollie", type: "soil_checked", createdAt: "2026-07-06" },
  { id: "franklin-photo-1", plantId: "franklin", type: "photo_added", createdAt: "2026-07-11" },
  { id: "franklin-watered-1", plantId: "franklin", type: "watered", createdAt: "2026-07-06" },
  { id: "luna-watered-1", plantId: "luna", type: "watered", createdAt: "2026-07-09" },
  { id: "luna-soil-1", plantId: "luna", type: "soil_checked", createdAt: "2026-07-06" }
];

export const mockMilestones: PlantMilestone[] = [
  {
    id: "martha-new-leaf-1",
    plantId: "martha",
    type: "new_leaf",
    createdAt: "2026-07-10",
    eventDate: null,
    titleKey: "milestones.new_leaf.title",
    descriptionKey: "milestones.new_leaf.description"
  },
  {
    id: "martha-added-1",
    plantId: "martha",
    type: "plant_added",
    createdAt: "2026-06-28",
    eventDate: null,
    titleKey: "milestones.plant_added.title",
    descriptionKey: "milestones.martha.plant_added.description"
  },
  {
    id: "ollie-repotted-1",
    plantId: "ollie",
    type: "repotted",
    createdAt: "2026-07-01",
    eventDate: null,
    titleKey: "milestones.repotted.title",
    descriptionKey: "milestones.repotted.description"
  },
  {
    id: "ollie-added-1",
    plantId: "ollie",
    type: "plant_added",
    createdAt: "2026-06-29",
    eventDate: null,
    titleKey: "milestones.plant_added.title",
    descriptionKey: "milestones.ollie.plant_added.description"
  },
  {
    id: "franklin-damaged-1",
    plantId: "franklin",
    type: "damaged",
    createdAt: "2026-07-11",
    eventDate: null,
    titleKey: "milestones.damaged.title",
    descriptionKey: "milestones.damaged.description"
  },
  {
    id: "franklin-recovered-1",
    plantId: "franklin",
    type: "recovered",
    createdAt: "2026-07-04",
    eventDate: null,
    titleKey: "milestones.recovered.title",
    descriptionKey: "milestones.recovered.description"
  },
  {
    id: "franklin-added-1",
    plantId: "franklin",
    type: "plant_added",
    createdAt: "2026-06-28",
    eventDate: null,
    titleKey: "milestones.plant_added.title",
    descriptionKey: "milestones.franklin.plant_added.description"
  },
  {
    id: "luna-bloomed-1",
    plantId: "luna",
    type: "bloomed",
    createdAt: "2026-07-08",
    eventDate: null,
    titleKey: "milestones.bloomed.title",
    descriptionKey: "milestones.bloomed.description"
  },
  {
    id: "luna-added-1",
    plantId: "luna",
    type: "plant_added",
    createdAt: "2026-06-27",
    eventDate: null,
    titleKey: "milestones.plant_added.title",
    descriptionKey: "milestones.luna.plant_added.description"
  }
];

export function sortPlantsByPriority(plants: Plant[]) {
  return [...plants].sort((a, b) => statusPriority[a.status] - statusPriority[b.status]);
}

export function countPlantsNeedingAttention(plants: Plant[]) {
  return plants.filter((plant) => plant.nextAction).length;
}
