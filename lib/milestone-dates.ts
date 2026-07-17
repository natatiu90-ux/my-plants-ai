import { formatRelativeDate } from "@/lib/date-format";
import type { Locale } from "@/i18n/dictionaries";
import type { PlantMilestone } from "@/types/plant";

export function milestoneHasKnownEventDate(milestone: PlantMilestone) {
  return Boolean(milestone.eventDate);
}

export function milestoneDateLabel(milestone: PlantMilestone, locale: Locale, unknownFallback: string) {
  return milestone.eventDate ? formatRelativeDate(milestone.eventDate, locale, unknownFallback) : unknownFallback;
}

function sortTimestamp(value: string | null | undefined) {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const normalized = value.length === 10 ? `${value}T12:00:00` : value;
  const time = new Date(normalized).getTime();
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

export function compareMilestonesNewestFirst(a: PlantMilestone, b: PlantMilestone) {
  const aKnown = milestoneHasKnownEventDate(a);
  const bKnown = milestoneHasKnownEventDate(b);
  if (aKnown !== bKnown) {
    return aKnown ? -1 : 1;
  }

  const primary = sortTimestamp(b.eventDate) - sortTimestamp(a.eventDate);
  if (primary !== 0) {
    return primary;
  }

  return sortTimestamp(b.updatedAt ?? b.createdAt) - sortTimestamp(a.updatedAt ?? a.createdAt);
}
