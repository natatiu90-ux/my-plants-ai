import { addDays, toDateKey } from "@/lib/date-format";
import type { Plant, PlantHypothesisResolution, PlantMilestone, SoilCheckResult } from "@/types/plant";

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

function localizedMessage(plant: Plant, result: SoilCheckResult, days: number | null, nextAction: Plant["nextAction"], profile: SoilCareProfile, drainageConcern: boolean) {
  const ruName = displayName(plant, "ru");
  const enName = displayName(plant, "en");
  const ruNext = days == null ? "" : ` Проверим снова через ${days} ${days === 1 ? "день" : days >= 2 && days <= 4 ? "дня" : "дней"}.`;
  const enNext = days == null ? "" : ` Check again in ${days} ${days === 1 ? "day" : "days"}.`;

  if (result === "dry") {
    if (nextAction === "water") {
      return {
        ru: `Для ${ruName} сухая почва означает, что пора полить.`,
        en: `For ${enName}, dry soil means it is time to water.`
      };
    }
    return {
      ru: `Для ${ruName} сухая почва сейчас не выглядит проблемой.${ruNext}`,
      en: `For ${enName}, dry soil is not a problem right now.${enNext}`
    };
  }

  if (result === "slightly_damp") {
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
  hypothesisResolutions: PlantHypothesisResolution[]
): SoilCheckCareResolution {
  const profile = soilCareProfileForPlant(plant);
  const lastWateredDaysAgo = daysSince(plant.lastWateredAt);
  const recentRepotting = wasRepottedRecently(milestones);
  const drainageConcern = hasPoorDrainage(hypothesisResolutions);

  let days: number | null;
  let nextAction: Plant["nextAction"] = null;
  let status: Plant["status"] = "healthy";
  let replacementRecommendationId: string | null = "next_check_scheduled";

  if (result === "dry") {
    const wateredVeryRecently = lastWateredDaysAgo != null && lastWateredDaysAgo <= 2;
    if (profile === "drought_tolerant") {
      days = wateredVeryRecently || recentRepotting ? 5 : 4;
    } else if (profile === "moisture_loving") {
      days = null;
      nextAction = "water";
      status = "check_soon";
      replacementRecommendationId = "water_after_soil_check";
    } else {
      days = lastWateredDaysAgo != null && lastWateredDaysAgo <= 3 ? 2 : null;
      nextAction = days == null ? "water" : null;
      status = days == null ? "check_soon" : "healthy";
      replacementRecommendationId = days == null ? "water_after_soil_check" : "next_check_scheduled";
    }
  } else if (result === "slightly_damp") {
    days = profile === "drought_tolerant" ? 4 : profile === "moisture_loving" ? 2 : 3;
    if (recentRepotting) days += 1;
  } else if (result === "very_wet") {
    days = profile === "drought_tolerant" || drainageConcern ? 3 : profile === "moisture_loving" ? 2 : 3;
    status = drainageConcern || profile === "drought_tolerant" ? "check_soon" : "healthy";
    replacementRecommendationId = drainageConcern ? "check_drainage_after_wet_soil" : "next_check_scheduled";
  } else {
    days = null;
    nextAction = "check_soil";
    status = "check_soon";
    replacementRecommendationId = "soil_check_guidance";
  }

  return {
    profile,
    status,
    nextAction,
    nextCheckAt: dateInDays(days),
    checkInDays: days,
    careScheduleStatus: "active",
    replacementRecommendationId,
    message: localizedMessage(plant, result, days, nextAction, profile, drainageConcern)
  };
}
