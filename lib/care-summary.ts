import type { Plant, PlantCareEvent, PlantMilestone } from "@/types/plant";

function timestamp(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.length === 10 ? `${value}T12:00:00.000Z` : value;
  const time = new Date(normalized).getTime();
  return Number.isFinite(time) ? time : null;
}

function newestDate(values: (string | null | undefined)[]) {
  return values.reduce<string | undefined>((latest, value) => {
    if (!value) return latest;
    const valueTime = timestamp(value);
    if (valueTime == null) return latest;
    const latestTime = timestamp(latest);
    return latestTime == null || valueTime > latestTime ? value.slice(0, 10) : latest;
  }, undefined);
}

export function latestWateredAtFromHistory(input: {
  plant: Pick<Plant, "id" | "lastWateredAt">;
  milestones?: PlantMilestone[];
  careEvents?: PlantCareEvent[];
}) {
  const milestoneDates = (input.milestones ?? [])
    .filter((milestone) => milestone.plantId === input.plant.id && milestone.type === "watered")
    .map((milestone) => milestone.eventDate ?? milestone.createdAt);
  const careEventDates = (input.careEvents ?? [])
    .filter((event) => event.plantId === input.plant.id && event.type === "watered")
    .map((event) => event.createdAt);

  return newestDate([input.plant.lastWateredAt, ...milestoneDates, ...careEventDates]);
}
