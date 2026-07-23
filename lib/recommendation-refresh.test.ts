import assert from "node:assert/strict";
import {
  buildRecommendationContextSnapshot,
  changedContextSince,
  impactLabelKey,
  isRecommendationStale,
  isVisualEvidenceStale,
  recommendationRevisionIsUnchanged,
  reasonTypeFromChangedContext,
  sourceAnalysisAgeDays,
  staleReasonKeys
} from "./recommendation-refresh";
import { RECOMMENDATION_PROMPT_VERSION, RECOMMENDATION_VERSION } from "./recommendation-version";
import type { HomeContext, Plant, PlantAnalysisRecord, PlantMilestone, PlantRecommendationRevision, Room } from "@/types/plant";

const plant: Plant = {
  id: "plant-1",
  homeId: "home-1",
  roomId: "room-1",
  speciesName: "Monstera",
  status: "healthy",
  statusLabelKey: "status.doingGreat",
  messageKey: "plants.afterWatering.message",
  nextAction: null,
  careScheduleStatus: "active",
  notificationEnabled: true,
  roomKey: "room-1",
  updatedAt: "2026-07-16T10:00:00.000Z"
};

const home: HomeContext = {
  id: "home-1",
  name: "Home",
  humidityLevel: "normal",
  createdAt: "2026-07-01",
  updatedAt: "2026-07-16T10:00:00.000Z"
};

const room: Room = {
  id: "room-1",
  homeId: "home-1",
  name: "Living room",
  isCustom: true,
  lightLevel: "bright_indirect",
  directSun: "morning",
  createdAt: "2026-07-01",
  updatedAt: "2026-07-16T10:00:00.000Z"
};

const analysis: PlantAnalysisRecord = {
  id: "analysis-1",
  plantId: plant.id,
  condition: "healthy",
  nextAction: null,
  summary: { en: "Looks healthy" },
  recommendations: [{ type: "observe", priority: "low", en: "Keep normal care" }],
  rawResult: {
    confidence: 0.8,
    careRightNow: [{ type: "observe", action: { en: "Keep normal care" } }]
  },
  createdAt: "2026-07-01T10:00:00.000Z"
};

const snapshot = buildRecommendationContextSnapshot({
  plant,
  homes: [home],
  rooms: [room],
  milestones: [],
  careEvents: [],
  hypothesisResolutions: [],
  weather: {
    status: "available",
    source: "open_meteo",
    fetchedAt: "2026-07-23T08:00:00.000Z",
    heatLevel: "hot",
    forecastMaxTemperatureC: 35,
    humidityPercent: 30,
    hotDays: 2
  }
});

const revision: PlantRecommendationRevision = {
  id: "revision-1",
  plantId: plant.id,
  analysisId: analysis.id,
  recommendations: analysis.recommendations,
  structuredResult: analysis.rawResult,
  reasonType: "manual_refresh",
  reasonText: "Recommendations checked.",
  changedContext: {
    home: { city: false, country: false, type: false, humidity: false, airConditioning: false, weather: false },
    room: { assignment: false, lightLevel: false, directSun: false, temperature: false, airConditioning: false },
    plant: { positionInRoom: false, lightCondition: false },
    care: { watering: false, repotting: false, soilCondition: false, history: false },
    system: { promptVersion: false, modelVersion: false }
  },
  contextSnapshot: snapshot,
  promptVersion: RECOMMENDATION_PROMPT_VERSION,
  recommendationVersion: RECOMMENDATION_VERSION,
  isCurrent: true,
  createdAt: "2026-07-16T11:00:00.000Z"
};

const unchangedContext = changedContextSince(revision.contextSnapshot, snapshot, {
  previousPromptVersion: revision.promptVersion,
  currentPromptVersion: RECOMMENDATION_PROMPT_VERSION
});

assert.equal(reasonTypeFromChangedContext(unchangedContext), "manual_refresh");
assert.equal(
  recommendationRevisionIsUnchanged({
    currentRevision: revision,
    contextSnapshot: snapshot,
    changedContext: unchangedContext,
    recommendations: analysis.recommendations,
    structuredResult: { ...analysis.rawResult, recommendationRefresh: { refreshedAt: "different-time" } },
    promptVersion: RECOMMENDATION_PROMPT_VERSION,
    recommendationVersion: RECOMMENDATION_VERSION
  }),
  true
);

const darkerRoom: Room = { ...room, lightLevel: "low", updatedAt: "2026-07-17T09:00:00.000Z" };
const changedSnapshot = buildRecommendationContextSnapshot({
  plant,
  homes: [home],
  rooms: [darkerRoom],
  milestones: [],
  careEvents: [],
  hypothesisResolutions: [],
  weather: {
    status: "available",
    source: "open_meteo",
    fetchedAt: "2026-07-23T08:00:00.000Z",
    heatLevel: "hot",
    forecastMaxTemperatureC: 35,
    humidityPercent: 30,
    hotDays: 2
  }
});
const changedContext = changedContextSince(revision.contextSnapshot, changedSnapshot);
assert.equal(changedContext.room.lightLevel, true);
assert.equal(reasonTypeFromChangedContext(changedContext), "light_changed");
assert.deepEqual(staleReasonKeys({ changedContext }), ["light_changed"]);
assert.equal(impactLabelKey("minor"), "plantAnalysis.impactMinor");

const smallWeatherChange = buildRecommendationContextSnapshot({
  plant,
  homes: [home],
  rooms: [room],
  milestones: [],
  careEvents: [],
  hypothesisResolutions: [],
  weather: {
    status: "available",
    source: "open_meteo",
    fetchedAt: "2026-07-23T10:00:00.000Z",
    heatLevel: "hot",
    forecastMaxTemperatureC: 36,
    humidityPercent: 31,
    hotDays: 2
  }
});
assert.equal(changedContextSince(snapshot, smallWeatherChange).home.weather, false, "1-2 degree weather changes should not make recommendations stale");

const majorWeatherChange = buildRecommendationContextSnapshot({
  plant,
  homes: [home],
  rooms: [room],
  milestones: [],
  careEvents: [],
  hypothesisResolutions: [],
  weather: {
    status: "available",
    source: "open_meteo",
    fetchedAt: "2026-07-23T10:00:00.000Z",
    heatLevel: "extreme",
    forecastMaxTemperatureC: 41,
    humidityPercent: 22,
    hotDays: 4
  }
});
const weatherChangedContext = changedContextSince(snapshot, majorWeatherChange);
assert.equal(weatherChangedContext.home.weather, true, "a heat-wave level change should make recommendations stale");
assert.equal(reasonTypeFromChangedContext(weatherChangedContext), "temperature_changed");
assert.equal(
  recommendationRevisionIsUnchanged({
    currentRevision: revision,
    contextSnapshot: changedSnapshot,
    changedContext,
    recommendations: analysis.recommendations,
    structuredResult: analysis.rawResult,
    promptVersion: RECOMMENDATION_PROMPT_VERSION,
    recommendationVersion: RECOMMENDATION_VERSION
  }),
  false
);

assert.equal(
  isRecommendationStale({
    plant,
    analysis,
    currentRevision: { ...revision, promptVersion: "old-prompt" },
    homes: [home],
    rooms: [room],
    milestones: [],
    careEvents: [],
    hypothesisResolutions: []
  }),
  true
);
assert.equal(
  isRecommendationStale({
    plant,
    analysis,
    currentRevision: revision,
    homes: [home],
    rooms: [room],
    milestones: [],
    careEvents: [],
    hypothesisResolutions: []
  }),
  false
);
assert.equal(
  isRecommendationStale({
    plant: { ...plant, updatedAt: "2026-07-16T11:01:00.000Z" },
    analysis,
    currentRevision: revision,
    homes: [home],
    rooms: [room],
    milestones: [],
    careEvents: [],
    hypothesisResolutions: []
  }),
  false
);
const unknownRepottingMilestone: PlantMilestone = {
  id: "milestone-1",
  plantId: plant.id,
  type: "repotting_unknown",
  eventDate: null,
  createdAt: "2026-07-14T10:00:00.000Z",
  updatedAt: "2026-07-14T10:00:00.000Z"
};
const baselineUnknownSnapshot = buildRecommendationContextSnapshot({
  plant,
  homes: [home],
  rooms: [room],
  milestones: [unknownRepottingMilestone],
  careEvents: [],
  hypothesisResolutions: []
});
const baselineUnknownRevision: PlantRecommendationRevision = {
  ...revision,
  id: "revision-baseline-unknown",
  contextSnapshot: baselineUnknownSnapshot
};
assert.equal(
  isRecommendationStale({
    plant,
    analysis,
    currentRevision: baselineUnknownRevision,
    homes: [home],
    rooms: [room],
    milestones: [{ ...unknownRepottingMilestone, updatedAt: "2026-07-23T12:00:00.000Z" }],
    careEvents: [],
    hypothesisResolutions: []
  }),
  false
);
assert.equal(sourceAnalysisAgeDays(analysis, new Date("2026-07-31T10:00:00.000Z")), 30);
assert.equal(isVisualEvidenceStale(analysis, new Date("2026-07-31T10:00:00.000Z"), 30), true);

console.log("recommendation-refresh tests passed");
