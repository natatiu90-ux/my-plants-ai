import type { HomeContext, Plant, Room } from "@/types/plant";

export type WeatherHeatLevel = "none" | "warm" | "hot" | "extreme";

export type HomeWeatherContext = {
  status: "available" | "unavailable";
  source: "open_meteo" | "not_configured" | "failed";
  fetchedAt: string;
  locationLabel?: string;
  timezone?: string | null;
  currentTemperatureC?: number | null;
  forecastMaxTemperatureC?: number | null;
  humidityPercent?: number | null;
  hotDays?: number;
  heatLevel: WeatherHeatLevel;
};

const weatherCache = new Map<string, HomeWeatherContext>();

function cacheKeyForHome(home: Pick<HomeContext, "city" | "country"> | undefined | null) {
  const city = home?.city?.trim().toLocaleLowerCase();
  const country = home?.country?.trim().toLocaleLowerCase();
  return city ? `${city}|${country ?? ""}` : null;
}

function heatLevelFromTemperature(maxTemperature: number | null | undefined, hotDays = 0): WeatherHeatLevel {
  if (maxTemperature == null || !Number.isFinite(maxTemperature)) return "none";
  if (maxTemperature >= 38 || hotDays >= 3) return "extreme";
  if (maxTemperature >= 32) return "hot";
  if (maxTemperature >= 28) return "warm";
  return "none";
}

export function getCachedHomeWeatherContext(home: Pick<HomeContext, "city" | "country"> | undefined | null) {
  const key = cacheKeyForHome(home);
  return key ? weatherCache.get(key) ?? null : null;
}

export async function loadHomeWeatherContext(home: Pick<HomeContext, "city" | "country"> | undefined | null, signal?: AbortSignal): Promise<HomeWeatherContext> {
  const key = cacheKeyForHome(home);
  const now = new Date().toISOString();
  if (!key || !home?.city) {
    return { status: "unavailable", source: "not_configured", fetchedAt: now, heatLevel: "none" };
  }

  const cached = weatherCache.get(key);
  if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < 45 * 60 * 1000) {
    return cached;
  }

  try {
    const geoParams = new URLSearchParams({
      name: [home.city, home.country].filter(Boolean).join(", "),
      count: "1",
      language: "en",
      format: "json"
    });
    const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${geoParams.toString()}`, { signal });
    if (!geoResponse.ok) throw new Error("weather_geocoding_failed");
    const geoPayload = (await geoResponse.json()) as { results?: { latitude?: number; longitude?: number; timezone?: string; name?: string; country?: string }[] };
    const location = geoPayload.results?.[0];
    if (typeof location?.latitude !== "number" || typeof location.longitude !== "number") {
      throw new Error("weather_location_not_found");
    }

    const forecastParams = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      current: "temperature_2m,relative_humidity_2m",
      daily: "temperature_2m_max",
      forecast_days: "4",
      timezone: "auto"
    });
    const forecastResponse = await fetch(`https://api.open-meteo.com/v1/forecast?${forecastParams.toString()}`, { signal });
    if (!forecastResponse.ok) throw new Error("weather_forecast_failed");
    const forecast = (await forecastResponse.json()) as {
      timezone?: string;
      current?: { temperature_2m?: number; relative_humidity_2m?: number };
      daily?: { temperature_2m_max?: number[] };
    };
    const maxTemperatures = forecast.daily?.temperature_2m_max ?? [];
    const forecastMaxTemperatureC = maxTemperatures.filter((value) => typeof value === "number").reduce<number | null>((max, value) => (max == null ? value : Math.max(max, value)), null);
    const hotDays = maxTemperatures.filter((value) => typeof value === "number" && value >= 32).length;
    const context: HomeWeatherContext = {
      status: "available",
      source: "open_meteo",
      fetchedAt: now,
      locationLabel: [location.name ?? home.city, location.country ?? home.country].filter(Boolean).join(", "),
      timezone: forecast.timezone ?? location.timezone ?? null,
      currentTemperatureC: typeof forecast.current?.temperature_2m === "number" ? Math.round(forecast.current.temperature_2m) : null,
      forecastMaxTemperatureC: forecastMaxTemperatureC == null ? null : Math.round(forecastMaxTemperatureC),
      humidityPercent: typeof forecast.current?.relative_humidity_2m === "number" ? Math.round(forecast.current.relative_humidity_2m) : null,
      hotDays,
      heatLevel: heatLevelFromTemperature(forecastMaxTemperatureC, hotDays)
    };
    weatherCache.set(key, context);
    return context;
  } catch {
    const fallback: HomeWeatherContext = { status: "unavailable", source: "failed", fetchedAt: now, heatLevel: "none" };
    weatherCache.set(key, fallback);
    return fallback;
  }
}

export function roomHeatExposure(input: { plant?: Pick<Plant, "positionInRoom"> | null; room?: Pick<Room, "lightLevel" | "directSun" | "temperatureRelative" | "hasAirConditioning"> | null }) {
  let score = 0;
  if (input.room?.temperatureRelative === "warm") score += 1;
  if (input.room?.temperatureRelative === "cool") score -= 1;
  if (input.room?.hasAirConditioning === "yes") score -= 1;
  if (input.room?.lightLevel === "bright_indirect" || input.room?.lightLevel === "direct_sun") score += 1;
  if (input.room?.directSun === "midday" || input.room?.directSun === "most_of_day") score += 2;
  if (input.room?.directSun === "morning" || input.room?.directSun === "evening") score += 1;
  if (input.plant?.positionInRoom === "window_sill" || input.plant?.positionInRoom === "near_window") score += 1;
  if (score >= 3) return "high" as const;
  if (score >= 1) return "elevated" as const;
  return "normal" as const;
}

export function soilDryingRisk(input: {
  weather?: HomeWeatherContext | null;
  plant?: Pick<Plant, "positionInRoom"> | null;
  room?: Pick<Room, "lightLevel" | "directSun" | "temperatureRelative" | "hasAirConditioning"> | null;
}) {
  const exposure = roomHeatExposure(input);
  const heatLevel = input.weather?.heatLevel ?? "none";
  if (heatLevel === "extreme" && exposure !== "normal") return "high" as const;
  if (heatLevel === "hot" && exposure === "high") return "high" as const;
  if (heatLevel === "extreme" || heatLevel === "hot" || (heatLevel === "warm" && exposure === "high")) return "elevated" as const;
  if (input.room?.temperatureRelative === "warm" && exposure !== "normal") return "elevated" as const;
  return "normal" as const;
}

export function adjustSoilCheckDaysForWeather(days: number | null, input: Parameters<typeof soilDryingRisk>[0]) {
  if (days == null) return null;
  const risk = soilDryingRisk(input);
  if (risk === "high") return Math.max(1, days - 2);
  if (risk === "elevated") return Math.max(1, days - 1);
  return days;
}

export function weatherChangedSubstantially(previous: unknown, current: HomeWeatherContext | null | undefined) {
  if (!current || current.status !== "available") return false;
  const previousWeather = previous && typeof previous === "object" ? (previous as Record<string, unknown>) : undefined;
  if (!previousWeather || previousWeather.status !== "available") return true;
  if (previousWeather.heatLevel !== current.heatLevel) return true;
  const previousMax = typeof previousWeather.forecastMaxTemperatureC === "number" ? previousWeather.forecastMaxTemperatureC : null;
  if (previousMax != null && current.forecastMaxTemperatureC != null && Math.abs(previousMax - current.forecastMaxTemperatureC) >= 5) return true;
  const previousHumidity = typeof previousWeather.humidityPercent === "number" ? previousWeather.humidityPercent : null;
  if (previousHumidity != null && current.humidityPercent != null && Math.abs(previousHumidity - current.humidityPercent) >= 15) return true;
  const previousHotDays = typeof previousWeather.hotDays === "number" ? previousWeather.hotDays : 0;
  return Math.abs(previousHotDays - (current.hotDays ?? 0)) >= 2;
}

export function summarizedWeatherForSnapshot(weather: HomeWeatherContext | null | undefined) {
  if (!weather) return undefined;
  return {
    status: weather.status,
    heatLevel: weather.heatLevel,
    forecastMaxTemperatureC: weather.forecastMaxTemperatureC ?? null,
    humidityPercent: weather.humidityPercent ?? null,
    hotDays: weather.hotDays ?? 0,
    source: weather.source,
    fetchedAt: weather.fetchedAt
  };
}
