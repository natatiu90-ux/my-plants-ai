import type { Plant } from "@/types/plant";

export function cleanPlantName(value: string | null | undefined) {
  return (value ?? "")
    .replace(/\([^)]*(confidence|уверен|пример|approx|possible|likely)[^)]*\)/gi, "")
    .replace(/\b(confidence|approx\.?|approximately|possibly|likely)\b.*$/gi, "")
    .trim();
}

export function cleanScientificName(value: string | null | undefined) {
  const match = (value ?? "").match(/[A-Z][a-z]+(?:\s(?:x\s)?[a-z][a-z-]+){1,3}/);
  return match?.[0].trim() ?? "";
}

export function commonNameFromScientificName(value: string | null | undefined) {
  const scientificName = cleanScientificName(value);
  if (!scientificName) {
    return "";
  }

  return scientificName
    .split(/\s+/)
    .map((part) => (part.length ? `${part[0].toLocaleUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

export function plantCommonName(plant: Pick<Plant, "speciesName" | "scientificName">) {
  return cleanPlantName(plant.speciesName) || commonNameFromScientificName(plant.scientificName);
}

export function plantDisplayName(plant: Pick<Plant, "homeName" | "speciesName" | "scientificName">, fallback: string) {
  return cleanPlantName(plant.homeName) || plantCommonName(plant) || fallback;
}
