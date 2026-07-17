import assert from "node:assert/strict";
import { deriveCareActionState } from "./plant-action-eligibility";
import { alignPlantHealthStatusWithUrgency, derivePlantHealthStatus } from "./plant-health-status";
import type { Plant, PlantAnalysisRecord, PlantMilestone } from "@/types/plant";

const basePlant: Plant = {
  id: "plant-1",
  speciesName: "Monstera",
  scientificName: "Monstera deliciosa",
  status: "healthy",
  statusLabelKey: "status.doingGreat",
  messageKey: "careAction.noAction",
  nextAction: null,
  careScheduleStatus: "active",
  notificationEnabled: true
};

const healthyAnalysis: PlantAnalysisRecord = {
  id: "analysis-1",
  plantId: "plant-1",
  condition: "healthy",
  nextAction: null,
  summary: { en: "The plant looks healthy.", ru: "Растение выглядит здоровым." },
  recommendations: [],
  rawResult: {
    plantStatus: "healthy",
    visibleObservations: [{ en: "Leaves look firm and healthy.", ru: "Листья выглядят здоровыми." }]
  },
  createdAt: "2026-07-17T10:00:00.000Z",
  sourcePhotoIds: []
} as PlantAnalysisRecord;

assert.equal(
  derivePlantHealthStatus({
    plant: basePlant,
    analysis: healthyAnalysis,
    careActionState: deriveCareActionState(basePlant, [], new Date("2026-07-17T12:00:00"))
  }).status,
  "healthy"
);

const recentRepot: PlantMilestone = {
  id: "milestone-1",
  plantId: "plant-1",
  type: "repotted",
  titleKey: "history.plant_added",
  descriptionKey: "plants.new.message",
  eventDate: "2026-07-15",
  createdAt: "2026-07-15T10:00:00.000Z"
};

assert.equal(
  derivePlantHealthStatus({
    plant: basePlant,
    analysis: { ...healthyAnalysis, rawResult: {} },
    careActionState: deriveCareActionState(basePlant, [], new Date("2026-07-17T12:00:00")),
    milestones: [recentRepot]
  }).status,
  "adapting"
);

const futureCheckPlant = { ...basePlant, nextCheckAt: "2026-07-22" };
assert.equal(
  derivePlantHealthStatus({
    plant: futureCheckPlant,
    analysis: healthyAnalysis,
    careActionState: deriveCareActionState(futureCheckPlant, [], new Date("2026-07-17T12:00:00"))
  }).status,
  "healthy"
);

const waterPlant = { ...basePlant, nextAction: "water" as const };
assert.equal(
  derivePlantHealthStatus({
    plant: waterPlant,
    analysis: healthyAnalysis,
    careActionState: deriveCareActionState(waterPlant, [], new Date("2026-07-17T12:00:00"))
  }).status,
  "action_needed"
);

const passiveActionAnalysis = {
  ...healthyAnalysis,
  rawResult: {
    plantStatus: "action_needed" as const,
    urgency: "observe" as const,
    primaryAction: { en: "Watch new growth.", ru: "Наблюдай за новым ростом." },
    actionTimeframe: { en: "Over the next two weeks.", ru: "В течение двух недель." },
    visibleObservations: []
  }
} as PlantAnalysisRecord;

assert.equal(alignPlantHealthStatusWithUrgency("action_needed", passiveActionAnalysis), "watch");

const noActionNeedsAttention = {
  ...healthyAnalysis,
  rawResult: {
    plantStatus: "needs_attention" as const,
    urgency: "soon" as const,
    primaryAction: { en: "", ru: "" },
    actionTimeframe: { en: "", ru: "" },
    visibleObservations: []
  }
} as PlantAnalysisRecord;

assert.equal(alignPlantHealthStatusWithUrgency("needs_attention", noActionNeedsAttention), "healthy");

const immediateAction = {
  ...healthyAnalysis,
  rawResult: {
    plantStatus: "action_needed" as const,
    urgency: "today" as const,
    primaryAction: { en: "Move the plant out of direct sun.", ru: "Убери растение из прямого солнца." },
    actionTimeframe: { en: "Today.", ru: "Сегодня." },
    visibleObservations: []
  }
} as PlantAnalysisRecord;

assert.equal(alignPlantHealthStatusWithUrgency("action_needed", immediateAction), "action_needed");

const hiddenUrgency = {
  ...healthyAnalysis,
  rawResult: {
    plantStatus: "healthy" as const,
    urgency: "today" as const,
    primaryAction: { en: "Water now.", ru: "Полей сейчас." },
    actionTimeframe: { en: "Today.", ru: "Сегодня." },
    visibleObservations: []
  }
} as PlantAnalysisRecord;

assert.equal(alignPlantHealthStatusWithUrgency("healthy", hiddenUrgency), "action_needed");

console.log("plant-health-status tests passed");
