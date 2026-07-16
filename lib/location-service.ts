export type CitySuggestion = {
  id: string;
  city: string;
  country: string;
  label: string;
};

const citySearchCache = new Map<string, CitySuggestion[]>();
const reverseCache = new Map<string, CitySuggestion>();
const applicationTag = "my-plants-ai";

function cityFromAddress(address: Record<string, unknown>) {
  return String(address.city ?? address.town ?? address.village ?? address.municipality ?? address.county ?? "");
}

function suggestionFromNominatim(item: {
  place_id?: number | string;
  display_name?: string;
  address?: Record<string, unknown>;
}): CitySuggestion | null {
  const address = item.address ?? {};
  const city = cityFromAddress(address).trim();
  const country = String(address.country ?? "").trim();
  if (!city || !country) {
    return null;
  }
  return {
    id: String(item.place_id ?? `${city}-${country}`),
    city,
    country,
    label: `${city}, ${country}`
  };
}

export async function searchCities(query: string, signal?: AbortSignal): Promise<CitySuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }
  const cacheKey = trimmed.toLocaleLowerCase();
  const cached = citySearchCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const params = new URLSearchParams({
    q: trimmed,
    format: "jsonv2",
    addressdetails: "1",
    limit: "5",
    featuretype: "city",
    app: applicationTag
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error("location_search_failed");
  }
  const payload = (await response.json()) as unknown[];
  const seen = new Set<string>();
  const suggestions = payload
    .map((item) => suggestionFromNominatim(item as never))
    .filter((item): item is CitySuggestion => Boolean(item))
    .filter((item) => {
      const key = item.label.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  citySearchCache.set(cacheKey, suggestions);
  return suggestions;
}

export async function detectCityFromCoordinates(latitude: number, longitude: number, signal?: AbortSignal): Promise<CitySuggestion> {
  const cacheKey = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
  const cached = reverseCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: "jsonv2",
    addressdetails: "1",
    zoom: "10",
    app: applicationTag
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error("location_reverse_failed");
  }
  const suggestion = suggestionFromNominatim(await response.json());
  if (!suggestion) {
    throw new Error("location_city_not_found");
  }
  reverseCache.set(cacheKey, suggestion);
  return suggestion;
}

export function getBrowserPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("geolocation_unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: 10 * 60 * 1000,
      timeout: 12_000
    });
  });
}
