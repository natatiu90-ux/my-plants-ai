import type { HomeContext, Plant, PlantAnalysisRecord, PlantCareEvent, PlantHypothesisResolution, PlantMilestone, PlantRecommendationRevision, Room } from "@/types/plant";
import type { RecommendationImpactLevel, RecommendationRevisionReasonType } from "@/types/plant";
import { RECOMMENDATION_PROMPT_VERSION, RECOMMENDATION_VERSION, VISUAL_EVIDENCE_STALE_DAYS } from "@/lib/recommendation-version";

function timestamp(value: string | undefined | null) {
  if (!value) {
    return null;
  }
  const normalized = value.length === 10 ? `${value}T12:00:00.000Z` : value;
  const time = new Date(normalized).getTime();
  return Number.isFinite(time) ? time : null;
}

function latestTimestamp(values: (string | undefined | null)[]) {
  return values.reduce<number | null>((latest, value) => {
    const time = timestamp(value);
    if (time == null) {
      return latest;
    }
    return latest == null ? time : Math.max(latest, time);
  }, null);
}

export function lastAnalysisTimestamp(analysis: PlantAnalysisRecord | undefined) {
  if (!analysis) {
    return null;
  }
  return latestTimestamp([analysis.rawResult?.photoComparison?.analysisTimestamp, analysis.createdAt]);
}

export function latestContextTimestamp(input: {
  plant: Plant;
  homes: HomeContext[];
  rooms: Room[];
  milestones: PlantMilestone[];
  careEvents: PlantCareEvent[];
  hypothesisResolutions: PlantHypothesisResolution[];
}) {
  const home = input.plant.homeId ? input.homes.find((item) => item.id === input.plant.homeId) : undefined;
  const room = input.plant.roomId ? input.rooms.find((item) => item.id === input.plant.roomId) : undefined;
  return latestTimestamp([
    input.plant.updatedAt,
    home?.updatedAt,
    room?.updatedAt,
    ...input.milestones.map((item) => item.createdAt),
    ...input.careEvents.map((item) => item.createdAt),
    ...input.hypothesisResolutions.map((item) => item.resolvedAt ?? item.createdAt)
  ]);
}

function isoTimestamp(value: number | null) {
  return value == null ? null : new Date(value).toISOString();
}

function latestMilestoneTimestamp(items: PlantMilestone[]) {
  return latestTimestamp(items.map((item) => item.eventDate ?? item.createdAt));
}

function latestCareEventTimestamp(items: PlantCareEvent[]) {
  return latestTimestamp(items.map((item) => item.createdAt));
}

function latestResolutionTimestamp(items: PlantHypothesisResolution[]) {
  return latestTimestamp(items.map((item) => item.resolvedAt ?? item.createdAt));
}

export type RecommendationContextSnapshot = {
  latestContextAt: string | null;
  plant: {
    homeId?: string;
    roomId?: string;
    positionInRoom?: Plant["positionInRoom"];
    lightConditionKey?: Plant["lightConditionKey"];
    lastWateredAt?: string;
    lastSoilCheckedAt?: string;
    lastSoilResult?: Plant["lastSoilResult"];
    nextCheckAt?: string;
    updatedAt?: string;
  };
  home?: {
    id: string;
    city?: string;
    country?: string;
    type?: HomeContext["type"];
    humidityLevel?: HomeContext["humidityLevel"];
    hasAirConditioning?: boolean;
    updatedAt?: string;
  };
  room?: {
    id: string;
    name: string;
    lightLevel?: Room["lightLevel"];
    directSun?: Room["directSun"];
    temperatureRelative?: Room["temperatureRelative"];
    hasAirConditioning?: Room["hasAirConditioning"];
    updatedAt?: string;
  };
  history: {
    milestoneCount: number;
    careEventCount: number;
    resolutionCount: number;
    latestMilestoneAt: string | null;
    latestCareEventAt: string | null;
    latestResolutionAt: string | null;
  };
};

export type RecommendationChangedContext = {
  home: {
    city: boolean;
    country: boolean;
    type: boolean;
    humidity: boolean;
    airConditioning: boolean;
  };
  room: {
    assignment: boolean;
    lightLevel: boolean;
    directSun: boolean;
    temperature: boolean;
    airConditioning: boolean;
  };
  plant: {
    positionInRoom: boolean;
    lightCondition: boolean;
  };
  care: {
    watering: boolean;
    repotting: boolean;
    soilCondition: boolean;
    history: boolean;
  };
  system: {
    promptVersion: boolean;
    modelVersion: boolean;
  };
};

export type RecommendationRevisionSaveResult = {
  created: boolean;
  unchanged: boolean;
  revisionId: string;
};

const emptyChangedContext = (): RecommendationChangedContext => ({
  home: { city: false, country: false, type: false, humidity: false, airConditioning: false },
  room: { assignment: false, lightLevel: false, directSun: false, temperature: false, airConditioning: false },
  plant: { positionInRoom: false, lightCondition: false },
  care: { watering: false, repotting: false, soilCondition: false, history: false },
  system: { promptVersion: false, modelVersion: false }
});

export function buildRecommendationContextSnapshot(input: {
  plant: Plant;
  homes: HomeContext[];
  rooms: Room[];
  milestones: PlantMilestone[];
  careEvents: PlantCareEvent[];
  hypothesisResolutions: PlantHypothesisResolution[];
}): RecommendationContextSnapshot {
  const home = input.plant.homeId ? input.homes.find((item) => item.id === input.plant.homeId) : undefined;
  const room = input.plant.roomId ? input.rooms.find((item) => item.id === input.plant.roomId) : undefined;
  return {
    latestContextAt: isoTimestamp(latestContextTimestamp(input)),
    plant: {
      homeId: input.plant.homeId,
      roomId: input.plant.roomId,
      positionInRoom: input.plant.positionInRoom,
      lightConditionKey: input.plant.lightConditionKey,
      lastWateredAt: input.plant.lastWateredAt,
      lastSoilCheckedAt: input.plant.lastSoilCheckedAt,
      lastSoilResult: input.plant.lastSoilResult,
      nextCheckAt: input.plant.nextCheckAt,
      updatedAt: input.plant.updatedAt
    },
    home: home
      ? {
          id: home.id,
          city: home.city,
          country: home.country,
          type: home.type,
          humidityLevel: home.humidityLevel,
          hasAirConditioning: home.hasAirConditioning,
          updatedAt: home.updatedAt
        }
      : undefined,
    room: room
      ? {
          id: room.id,
          name: room.name,
          lightLevel: room.lightLevel,
          directSun: room.directSun,
          temperatureRelative: room.temperatureRelative,
          hasAirConditioning: room.hasAirConditioning,
          updatedAt: room.updatedAt
        }
      : undefined,
    history: {
      milestoneCount: input.milestones.length,
      careEventCount: input.careEvents.length,
      resolutionCount: input.hypothesisResolutions.length,
      latestMilestoneAt: isoTimestamp(latestMilestoneTimestamp(input.milestones)),
      latestCareEventAt: isoTimestamp(latestCareEventTimestamp(input.careEvents)),
      latestResolutionAt: isoTimestamp(latestResolutionTimestamp(input.hypothesisResolutions))
    }
  };
}

function snapshotTimestamp(snapshot: Record<string, unknown> | undefined) {
  const value = snapshot?.latestContextAt;
  return typeof value === "string" ? timestamp(value) : null;
}

function booleanValue(value: unknown) {
  return value === true;
}

function hasChangedContextChanges(value: RecommendationChangedContext) {
  return Object.values(value).some((section) => Object.values(section).some(Boolean));
}

export function changedContextSince(
  previous: Record<string, unknown> | undefined,
  current: RecommendationContextSnapshot,
  options: { previousPromptVersion?: string; currentPromptVersion?: string; previousModelVersion?: string; currentModelVersion?: string } = {}
): RecommendationChangedContext {
  const previousRoom = previous?.room && typeof previous.room === "object" ? (previous.room as Record<string, unknown>) : undefined;
  const previousHome = previous?.home && typeof previous.home === "object" ? (previous.home as Record<string, unknown>) : undefined;
  const previousPlant = previous?.plant && typeof previous.plant === "object" ? (previous.plant as Record<string, unknown>) : undefined;
  const previousHistory = previous?.history && typeof previous.history === "object" ? (previous.history as Record<string, unknown>) : undefined;
  const changes = emptyChangedContext();

  changes.home.city = previousHome?.city !== current.home?.city;
  changes.home.country = previousHome?.country !== current.home?.country;
  changes.home.type = previousHome?.type !== current.home?.type;
  changes.home.humidity = previousHome?.humidityLevel !== current.home?.humidityLevel;
  changes.home.airConditioning = previousHome?.hasAirConditioning !== current.home?.hasAirConditioning;

  changes.room.assignment = previousRoom?.id !== current.room?.id;
  changes.room.lightLevel = previousRoom?.lightLevel !== current.room?.lightLevel;
  changes.room.directSun = previousRoom?.directSun !== current.room?.directSun;
  changes.room.temperature = previousRoom?.temperatureRelative !== current.room?.temperatureRelative;
  changes.room.airConditioning = previousRoom?.hasAirConditioning !== current.room?.hasAirConditioning;

  changes.plant.positionInRoom = previousPlant?.positionInRoom !== current.plant.positionInRoom;
  changes.plant.lightCondition = previousPlant?.lightConditionKey !== current.plant.lightConditionKey;

  changes.care.watering = previousPlant?.lastWateredAt !== current.plant.lastWateredAt;
  changes.care.soilCondition = previousPlant?.lastSoilCheckedAt !== current.plant.lastSoilCheckedAt || previousPlant?.lastSoilResult !== current.plant.lastSoilResult;
  changes.care.history =
    previousHistory?.milestoneCount !== current.history.milestoneCount ||
    previousHistory?.careEventCount !== current.history.careEventCount ||
    previousHistory?.resolutionCount !== current.history.resolutionCount ||
    previousHistory?.latestMilestoneAt !== current.history.latestMilestoneAt ||
    previousHistory?.latestCareEventAt !== current.history.latestCareEventAt ||
    previousHistory?.latestResolutionAt !== current.history.latestResolutionAt;
  changes.care.repotting = changes.care.history;

  changes.system.promptVersion = Boolean(options.previousPromptVersion && options.currentPromptVersion && options.previousPromptVersion !== options.currentPromptVersion);
  changes.system.modelVersion = Boolean(options.previousModelVersion && options.currentModelVersion && options.previousModelVersion !== options.currentModelVersion);
  return changes;
}

export function reasonTypeFromChangedContext(changedContext: RecommendationChangedContext, fallback: RecommendationRevisionReasonType = "manual_refresh"): RecommendationRevisionReasonType {
  const matched: RecommendationRevisionReasonType[] = [];
  if (changedContext.room.assignment) matched.push("plant_location_changed");
  if (changedContext.room.lightLevel || changedContext.plant.lightCondition) matched.push("light_changed");
  if (changedContext.room.directSun) matched.push("direct_sun_changed");
  if (changedContext.room.temperature) matched.push("temperature_changed");
  if (changedContext.home.humidity) matched.push("humidity_changed");
  if (changedContext.home.airConditioning || changedContext.room.airConditioning) matched.push("air_conditioning_changed");
  if (changedContext.home.city || changedContext.home.country || changedContext.home.type) matched.push("home_changed");
  if (changedContext.care.soilCondition) matched.push("soil_changed");
  if (changedContext.care.watering) matched.push("watering_changed");
  if (changedContext.care.repotting) matched.push("repotting_changed");
  if (changedContext.care.history) matched.push("care_history_changed");
  if (changedContext.system.promptVersion) matched.push("prompt_updated");
  if (changedContext.system.modelVersion) matched.push("model_updated");

  const unique = Array.from(new Set(matched));
  if (unique.length > 1) return "mixed_context_changes";
  return unique[0] ?? fallback;
}

export function staleReasonKeys(input: {
  changedContext: RecommendationChangedContext;
  promptChanged?: boolean;
  modelChanged?: boolean;
  currentRevision?: PlantRecommendationRevision;
}) {
  const reasons: string[] = [];
  if (input.changedContext.room.lightLevel) reasons.push("light_changed");
  if (input.changedContext.room.directSun) reasons.push("direct_sun_changed");
  if (input.changedContext.home.humidity || input.changedContext.home.city || input.changedContext.home.country || input.changedContext.home.type) reasons.push("home_changed");
  if (input.changedContext.care.soilCondition) reasons.push("soil_changed");
  if (input.changedContext.care.watering) reasons.push("watering_changed");
  if (input.changedContext.care.repotting || input.changedContext.care.history) reasons.push("care_history_changed");
  if (input.changedContext.room.assignment || input.changedContext.plant.positionInRoom) reasons.push("plant_location_changed");
  if (input.changedContext.room.temperature) reasons.push("temperature_changed");
  if (input.changedContext.home.airConditioning || input.changedContext.room.airConditioning) reasons.push("air_conditioning_changed");
  if (input.promptChanged || input.changedContext.system.promptVersion || (input.currentRevision ? input.currentRevision.promptVersion !== RECOMMENDATION_PROMPT_VERSION : false)) reasons.push("prompt_updated");
  if (input.modelChanged || input.changedContext.system.modelVersion) reasons.push("model_updated");

  const unique = Array.from(new Set(reasons));
  if (unique.length > 2) {
    return ["mixed_context_changes", ...unique.slice(0, 2)];
  }
  return unique;
}

export function impactLabelKey(impactLevel: RecommendationImpactLevel | undefined) {
  if (impactLevel === "major") return "plantAnalysis.impactMajor";
  if (impactLevel === "moderate") return "plantAnalysis.impactModerate";
  if (impactLevel === "minor") return "plantAnalysis.impactMinor";
  return "plantAnalysis.impactNone";
}

function normalizeForComparison(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "string") {
    return value.trim().replace(/\s+/g, " ");
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map(normalizeForComparison);
  }

  const object = value as Record<string, unknown>;
  return Object.keys(object)
    .filter((key) => !["refreshedAt", "createdAt", "updatedAt", "reason", "reasonText"].includes(key))
    .sort()
    .reduce<Record<string, unknown>>((normalized, key) => {
      const next = normalizeForComparison(object[key]);
      const isEmptyArray = Array.isArray(next) && next.length === 0;
      const isEmptyObject = Boolean(next && typeof next === "object" && !Array.isArray(next) && !Object.keys(next as Record<string, unknown>).length);
      if (next !== null && next !== undefined && !isEmptyArray && !isEmptyObject) {
        normalized[key] = next;
      }
      return normalized;
    }, {});
}

export function stableRecommendationFingerprint(input: {
  recommendations?: PlantAnalysisRecord["recommendations"];
  structuredResult?: PlantAnalysisRecord["rawResult"];
}) {
  return JSON.stringify(
    normalizeForComparison({
      recommendations: input.recommendations ?? [],
      structuredResult: input.structuredResult ?? {}
    })
  );
}

export function recommendationRevisionIsUnchanged(input: {
  currentRevision?: PlantRecommendationRevision;
  contextSnapshot: RecommendationContextSnapshot;
  changedContext: RecommendationChangedContext;
  recommendations: PlantAnalysisRecord["recommendations"];
  structuredResult?: PlantAnalysisRecord["rawResult"];
  promptVersion?: string;
  recommendationVersion?: number;
  modelVersion?: string | null;
}) {
  if (!input.currentRevision || !input.currentRevision.isCurrent) {
    return false;
  }
  if (hasChangedContextChanges(input.changedContext)) {
    return false;
  }
  if ((input.currentRevision.promptVersion ?? RECOMMENDATION_PROMPT_VERSION) !== (input.promptVersion ?? RECOMMENDATION_PROMPT_VERSION)) {
    return false;
  }
  if ((input.currentRevision.recommendationVersion ?? RECOMMENDATION_VERSION) !== (input.recommendationVersion ?? RECOMMENDATION_VERSION)) {
    return false;
  }
  if (input.modelVersion && input.currentRevision.modelVersion && input.currentRevision.modelVersion !== input.modelVersion) {
    return false;
  }
  if (snapshotTimestamp(input.currentRevision.contextSnapshot) !== snapshotTimestamp(input.contextSnapshot as unknown as Record<string, unknown>)) {
    return false;
  }

  return (
    stableRecommendationFingerprint({
      recommendations: input.currentRevision.recommendations,
      structuredResult: input.currentRevision.structuredResult
    }) ===
    stableRecommendationFingerprint({
      recommendations: input.recommendations,
      structuredResult: input.structuredResult
    })
  );
}

export function sourceAnalysisAgeDays(analysis: PlantAnalysisRecord | undefined, now = new Date()) {
  const sourceAt = lastAnalysisTimestamp(analysis);
  if (sourceAt == null) return null;
  return Math.max(0, Math.floor((now.getTime() - sourceAt) / 86_400_000));
}

export function isVisualEvidenceStale(analysis: PlantAnalysisRecord | undefined, now = new Date(), thresholdDays = VISUAL_EVIDENCE_STALE_DAYS) {
  const age = sourceAnalysisAgeDays(analysis, now);
  return age != null && age >= thresholdDays;
}

export function isRecommendationStale(input: {
  plant: Plant;
  analysis: PlantAnalysisRecord | undefined;
  currentRevision?: PlantRecommendationRevision;
  homes: HomeContext[];
  rooms: Room[];
  milestones: PlantMilestone[];
  careEvents: PlantCareEvent[];
  hypothesisResolutions: PlantHypothesisResolution[];
}) {
  const contextAt = latestContextTimestamp(input);
  const revisionContextAt = snapshotTimestamp(input.currentRevision?.contextSnapshot);
  if (revisionContextAt != null) {
    return Boolean(
      (contextAt != null && contextAt > revisionContextAt) ||
        input.currentRevision?.promptVersion !== RECOMMENDATION_PROMPT_VERSION ||
        input.currentRevision?.recommendationVersion !== RECOMMENDATION_VERSION
    );
  }

  const analysisAt = lastAnalysisTimestamp(input.analysis);
  return Boolean(analysisAt != null && contextAt != null && contextAt > analysisAt);
}
