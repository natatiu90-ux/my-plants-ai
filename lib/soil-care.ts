import { addDays, toDateKey } from "./date-format";
import type { Plant, PlantHypothesisResolution, PlantMilestone, Room, SoilCheckResult } from "@/types/plant";
import type { HomeWeatherContext } from "./weather-context";
import { adjustSoilCheckDaysForWeather, soilDryingRisk } from "./weather-context";

export type SoilCareProfile = "drought_tolerant" | "balanced" | "moisture_loving";

export type SoilCheckCareResolution = {
  profile: SoilCareProfile;
  status: Plant["status"];
  nextAction: Plant["nextAction"];
  nextCheckAt: string | null;
  checkInDays: number | null;
  careScheduleStatus: Plant["careScheduleStatus"];
  replacementRecommendationId: string | null;
  message: {
    en: string;
    ru: string;
  };
};

type NextPlantActionResolution = {
  status: Plant["status"];
  nextAction: Plant["nextAction"];
  checkInDays: number | null;
  replacementRecommendationId: string | null;
};

function normalizedPlantName(plant: Plant) {
  return `${plant.scientificName ?? ""} ${plant.speciesName ?? ""}`.toLocaleLowerCase();
}

function daysSince(dateKey?: string) {
  if (!dateKey) return null;
  const date = new Date(`${dateKey.slice(0, 10)}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - date.getTime()) / (24 * 60 * 60 * 1000)));
}

function includesAny(value: string, words: string[]) {
  return words.some((word) => value.includes(word));
}

export function soilCareProfileForPlant(plant: Plant): SoilCareProfile {
  const value = normalizedPlantName(plant);
  if (
    includesAny(value, [
      "cactus",
      "кактус",
      "succulent",
      "суккулент",
      "portulacaria",
      "портулакар",
      "zamioculcas",
      "zz plant",
      "замиокулькас",
      "sansevieria",
      "сансевиер"
    ])
  ) {
    return "drought_tolerant";
  }

  if (includesAny(value, ["calathea", "калате", "spathiphyllum", "спатифилл", "peace lily", "fittonia", "фиттони"])) {
    return "moisture_loving";
  }

  return "balanced";
}

function hasPoorDrainage(resolutions: PlantHypothesisResolution[]) {
  return resolutions.some((resolution) => resolution.hypothesis === "drainage" && resolution.status === "confirmed" && resolution.userResult === "no");
}

function wasRepottedRecently(milestones: PlantMilestone[]) {
  return milestones.some((milestone) => milestone.type === "repotted" && milestone.eventDate && (daysSince(milestone.eventDate) ?? Number.POSITIVE_INFINITY) <= 14);
}

export function deriveNextPlantAction(input: {
  plant: Plant;
  soilResult: SoilCheckResult;
  profile?: SoilCareProfile;
  milestones?: PlantMilestone[];
  hypothesisResolutions?: PlantHypothesisResolution[];
  room?: Room | null;
  weather?: HomeWeatherContext | null;
}): NextPlantActionResolution {
  const profile = input.profile ?? soilCareProfileForPlant(input.plant);
  const lastWateredDaysAgo = daysSince(input.plant.lastWateredAt);
  const recentRepotting = wasRepottedRecently(input.milestones ?? []);
  const drainageConcern = hasPoorDrainage(input.hypothesisResolutions ?? []);
  const adjustCheckDays = (days: number | null) =>
    adjustSoilCheckDaysForWeather(days, { weather: input.weather, plant: input.plant, room: input.room });

  if (input.soilResult === "dry") {
    const wateredVeryRecently = lastWateredDaysAgo != null && lastWateredDaysAgo <= 2;
    if (profile === "drought_tolerant") {
      if (!wateredVeryRecently && !recentRepotting && !drainageConcern) {
        return {
          status: "check_soon",
          nextAction: "water",
          checkInDays: null,
          replacementRecommendationId: "water_after_soil_check"
        };
      }

      return {
        status: "healthy",
        nextAction: null,
        checkInDays: adjustCheckDays(5),
        replacementRecommendationId: "next_check_scheduled"
      };
    }

    if (profile === "moisture_loving") {
      return {
        status: "check_soon",
        nextAction: "water",
        checkInDays: null,
        replacementRecommendationId: "water_after_soil_check"
      };
    }

    const shouldWait = lastWateredDaysAgo != null && lastWateredDaysAgo <= 3;
    return {
      status: shouldWait ? "healthy" : "check_soon",
      nextAction: shouldWait ? null : "water",
      checkInDays: shouldWait ? adjustCheckDays(2) : null,
      replacementRecommendationId: shouldWait ? "next_check_scheduled" : "water_after_soil_check"
    };
  }

  if (input.soilResult === "slightly_damp") {
    return {
      status: "healthy",
      nextAction: null,
      checkInDays: adjustCheckDays((profile === "drought_tolerant" ? 4 : profile === "moisture_loving" ? 2 : 3) + (recentRepotting ? 1 : 0)),
      replacementRecommendationId: "next_check_scheduled"
    };
  }

  if (input.soilResult === "very_wet") {
    return {
      status: drainageConcern || profile === "drought_tolerant" ? "check_soon" : "healthy",
      nextAction: null,
      checkInDays: adjustCheckDays(profile === "moisture_loving" && !drainageConcern ? 2 : 3),
      replacementRecommendationId: drainageConcern ? "check_drainage_after_wet_soil" : "next_check_scheduled"
    };
  }

  return {
    status: "check_soon",
    nextAction: "check_soil",
    checkInDays: adjustCheckDays(2),
    replacementRecommendationId: "soil_check_guidance"
  };
}

function dateInDays(days: number | null) {
  return days == null ? null : toDateKey(addDays(new Date(), days));
}

function displayName(plant: Plant, locale: "en" | "ru") {
  const scientific = plant.scientificName?.trim();
  const common = plant.speciesName?.trim();
  if (scientific && scientific.toLocaleLowerCase().includes("portulacaria afra")) {
    return locale === "ru" ? "портулакарии" : "Portulacaria";
  }
  if (common) return common;
  return locale === "ru" ? "этого растения" : "this plant";
}

function localizedMessage(
  plant: Plant,
  result: SoilCheckResult,
  days: number | null,
  nextAction: Plant["nextAction"],
  profile: SoilCareProfile,
  drainageConcern: boolean,
  heatRisk: ReturnType<typeof soilDryingRisk>
) {
  const ruName = displayName(plant, "ru");
  const enName = displayName(plant, "en");
  const ruNext = days == null ? "" : ` Проверим снова через ${days} ${days === 1 ? "день" : days >= 2 && days <= 4 ? "дня" : "дней"}.`;
  const enNext = days == null ? "" : ` Check again in ${days} ${days === 1 ? "day" : "days"}.`;

  if (result === "dry") {
    if (nextAction === "water") {
      return {
        ru:
          heatRisk === "high" || heatRisk === "elevated"
            ? `Почва сухая, а жара ускоряет потерю влаги. Полей ${ruName} сейчас и убедись, что лишняя вода свободно уходит.`
            : `Для ${ruName} сухая почва означает, что пора полить.`,
        en:
          heatRisk === "high" || heatRisk === "elevated"
            ? `The soil is dry, and heat can make it lose moisture faster. Water ${enName} now and make sure excess water drains freely.`
            : `For ${enName}, dry soil means it is time to water.`
      };
    }
    return {
      ru: `Для ${ruName} сухая почва сейчас не выглядит проблемой.${ruNext}`,
      en: `For ${enName}, dry soil is not a problem right now.${enNext}`
    };
  }

  if (result === "slightly_damp") {
    if (heatRisk === "high" || heatRisk === "elevated") {
      return {
        ru: `Пока не поливай. Из-за жары проверь почву снова через ${days ?? 1} ${days === 1 ? "день" : days != null && days >= 2 && days <= 4 ? "дня" : "дней"}.`,
        en: `Do not water yet. Because it is hot, check the soil again in ${days ?? 1} ${days === 1 ? "day" : "days"}.`
      };
    }
    if (profile === "drought_tolerant") {
      return {
        ru: `Для ${ruName} слегка влажная почва — пока рано для полива.${ruNext}`,
        en: `For ${enName}, slightly damp soil means it is too early to water.${enNext}`
      };
    }
    return {
      ru: `Почва немного влажная, полив пока не нужен.${ruNext}`,
      en: `The soil is slightly damp, so watering is not needed yet.${enNext}`
    };
  }

  if (result === "very_wet") {
    return {
      ru: `Почва очень влажная. Пока не поливай${drainageConcern ? ", особенно проверь дренаж" : ""}.${ruNext}`,
      en: `The soil is very wet. Do not water yet${drainageConcern ? ", and check drainage" : ""}.${enNext}`
    };
  }

  return {
    ru: `Проверь верхние 3–4 см почвы пальцем и ориентируйся на ощущения.${ruNext}`,
    en: `Check the top 3–4 cm of soil with your finger and use that as your guide.${enNext}`
  };
}

export function calculateSoilCheckCareResolution(
  plant: Plant,
  result: SoilCheckResult,
  milestones: PlantMilestone[],
  hypothesisResolutions: PlantHypothesisResolution[],
  context: { room?: Room | null; weather?: HomeWeatherContext | null } = {}
): SoilCheckCareResolution {
  const profile = soilCareProfileForPlant(plant);
  const drainageConcern = hasPoorDrainage(hypothesisResolutions);
  const next = deriveNextPlantAction({ plant, soilResult: result, profile, milestones, hypothesisResolutions, room: context.room, weather: context.weather });
  const heatRisk = soilDryingRisk({ weather: context.weather, plant, room: context.room });

  return {
    profile,
    status: next.status,
    nextAction: next.nextAction,
    nextCheckAt: dateInDays(next.checkInDays),
    checkInDays: next.checkInDays,
    careScheduleStatus: "active",
    replacementRecommendationId: next.replacementRecommendationId,
    message: localizedMessage(plant, result, next.checkInDays, next.nextAction, profile, drainageConcern, heatRisk)
  };
}

export function nextSoilCheckAfterWatering(input: {
  plant: Plant;
  room?: Room | null;
  weather?: HomeWeatherContext | null;
}) {
  const profile = soilCareProfileForPlant(input.plant);
  const baseDays = profile === "drought_tolerant" ? 5 : profile === "moisture_loving" ? 2 : 4;
  return adjustSoilCheckDaysForWeather(baseDays, { weather: input.weather, plant: input.plant, room: input.room }) ?? baseDays;
}
