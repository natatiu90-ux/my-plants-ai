import type { TranslationKey } from "@/i18n/dictionaries";
import type { PlantAnalysisRecord, PlantCareEvent, PlantFollowUp, PlantMilestone, PlantPhoto } from "@/types/plant";

export type PlantTimelineEventKind =
  | "plant_added"
  | "watering"
  | "soil_check"
  | "repotting"
  | "repotting_unknown"
  | "pruning"
  | "photo_added"
  | "checkin_completed"
  | "followup_scheduled"
  | "followup_completed"
  | "diagnosis_updated";

export type PlantTimelineEventOrigin =
  | "plant_milestones"
  | "care_events"
  | "plant_analyses"
  | "plant_follow_ups"
  | "plant_photos";

export type PlantTimelineEvent = {
  id: string;
  plantId: string;
  kind: PlantTimelineEventKind;
  occurredAt: string | null;
  sortAt: string;
  title: string;
  body?: string;
  payload?: Record<string, unknown>;
  origin: PlantTimelineEventOrigin;
};

type TimelineInput = {
  plantId: string;
  milestones?: PlantMilestone[];
  careEvents?: PlantCareEvent[];
  analyses?: PlantAnalysisRecord[];
  followUps?: PlantFollowUp[];
  photos?: PlantPhoto[];
};

function dateKey(value: string | null | undefined) {
  if (!value) return null;
  return value.slice(0, 10);
}

function sortAt(value: string | null | undefined, fallback?: string | null) {
  return value ?? fallback ?? "0000-01-01T00:00:00.000Z";
}

function localized(value: { en?: string | null; ru?: string | null } | undefined | null) {
  return value?.ru ?? value?.en ?? undefined;
}

function milestoneKind(milestone: PlantMilestone): PlantTimelineEventKind | null {
  if (milestone.type === "plant_added") return "plant_added";
  if (milestone.type === "watered") return "watering";
  if (milestone.type === "soil_checked") return "soil_check";
  if (milestone.type === "repotted") return "repotting";
  if (milestone.type === "repotting_unknown") return "repotting_unknown";
  if (milestone.type === "pruned") return "pruning";
  if (milestone.type === "follow_up_completed") return "followup_completed";
  if (milestone.type === "damaged" || milestone.type === "recovered" || milestone.type === "treatment_started" || milestone.type === "treatment_completed") {
    return "diagnosis_updated";
  }
  return null;
}

function milestoneTitle(kind: PlantTimelineEventKind, milestone: PlantMilestone): TranslationKey | string {
  if (milestone.customTitle) return milestone.customTitle;
  if (milestone.titleKey) return milestone.titleKey;
  if (kind === "watering") return "milestones.watered.title";
  if (kind === "soil_check") return "milestones.soil_checked.title";
  if (kind === "repotting") return "milestones.repotted.title";
  if (kind === "repotting_unknown") return "milestones.repotting_unknown.title";
  if (kind === "pruning") return "milestones.pruned.title";
  if (kind === "followup_completed" || kind === "checkin_completed") return "milestones.follow_up_completed.title";
  if (kind === "plant_added") return "milestones.plant_added.title";
  return "milestones.custom_note.title";
}

function milestoneBody(kind: PlantTimelineEventKind, milestone: PlantMilestone): TranslationKey | string | undefined {
  if (milestone.note) return milestone.note;
  if (milestone.customDescription) return milestone.customDescription;
  if (milestone.descriptionKey) return milestone.descriptionKey;
  if (kind === "watering") return "milestones.watered.description";
  if (kind === "soil_check") return "milestones.soil_checked.description";
  if (kind === "repotting") return "milestones.repotted.description";
  if (kind === "repotting_unknown") return "milestones.repotting_unknown.description";
  if (kind === "pruning") return "milestones.pruned.description";
  if (kind === "followup_completed" || kind === "checkin_completed") return "milestones.follow_up_completed.description";
  if (kind === "plant_added") return "milestones.custom_note.description";
  return undefined;
}

function milestoneToEvent(milestone: PlantMilestone): PlantTimelineEvent | null {
  const kind = milestoneKind(milestone);
  if (!kind) return null;
  return {
    id: `plant_milestones:${milestone.id}`,
    plantId: milestone.plantId,
    kind,
    occurredAt: milestone.eventDate,
    sortAt: sortAt(milestone.eventDate, milestone.updatedAt ?? milestone.createdAt),
    title: milestoneTitle(kind, milestone),
    body: milestoneBody(kind, milestone),
    origin: "plant_milestones",
    payload: { milestone }
  };
}

function careEventToEvent(event: PlantCareEvent): PlantTimelineEvent | null {
  const kind =
    event.type === "watered"
      ? "watering"
      : event.type === "soil_checked"
        ? "soil_check"
        : event.type === "follow_up_completed"
          ? "followup_completed"
          : null;
  if (!kind) return null;
  const eventDate = dateKey(event.createdAt);
  const title =
    kind === "watering"
      ? "milestones.watered.title"
      : kind === "soil_check"
        ? "milestones.soil_checked.title"
        : "milestones.follow_up_completed.title";
  const body =
    kind === "watering"
      ? "milestones.watered.description"
      : kind === "soil_check"
        ? "milestones.soil_checked.description"
        : "milestones.follow_up_completed.description";
  return {
    id: `care_events:${event.id}`,
    plantId: event.plantId,
    kind,
    occurredAt: eventDate,
    sortAt: sortAt(event.createdAt),
    title,
    body,
    origin: "care_events",
    payload: { careEvent: event }
  };
}

function photoToEvent(photos: PlantPhoto[]): PlantTimelineEvent | null {
  const [firstPhoto] = photos;
  if (!firstPhoto) return null;
  const newestPhoto = photos.reduce((newest, photo) => (photo.createdAt.localeCompare(newest.createdAt) > 0 ? photo : newest), firstPhoto);
  const occurredAt = dateKey(newestPhoto.createdAt);
  const photoIds = photos.map((photo) => photo.id).sort();
  return {
    id: `plant_photos:${photoIds.join("+")}`,
    plantId: newestPhoto.plantId,
    kind: "photo_added",
    occurredAt,
    sortAt: sortAt(newestPhoto.createdAt),
    title: photos.length > 1 ? "history.photos_added" : "history.photo_added",
    origin: "plant_photos",
    payload: { photoIds, photoCount: photos.length, photoType: newestPhoto.type, isCover: photos.some((photo) => photo.isCover) }
  };
}

function photoToEvents(photos: PlantPhoto[] = []): PlantTimelineEvent[] {
  const sorted = [...photos].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const groups: PlantPhoto[][] = [];
  const groupingWindowMs = 5 * 60 * 1000;

  for (const photo of sorted) {
    const lastGroup = groups[groups.length - 1];
    const lastPhoto = lastGroup?.[lastGroup.length - 1];
    const lastTime = lastPhoto ? new Date(lastPhoto.createdAt).getTime() : Number.NaN;
    const currentTime = new Date(photo.createdAt).getTime();
    const sameBatch =
      lastGroup &&
      lastPhoto?.plantId === photo.plantId &&
      Number.isFinite(lastTime) &&
      Number.isFinite(currentTime) &&
      currentTime - lastTime <= groupingWindowMs;

    if (sameBatch) {
      lastGroup.push(photo);
    } else {
      groups.push([photo]);
    }
  }

  return groups.map(photoToEvent).filter((event): event is PlantTimelineEvent => Boolean(event));
}

function followUpToEvents(followUp: PlantFollowUp): PlantTimelineEvent[] {
  const scheduled: PlantTimelineEvent = {
    id: `plant_follow_ups:${followUp.id}:scheduled`,
    plantId: followUp.plantId,
    kind: "followup_scheduled",
    occurredAt: dateKey(followUp.dueAt),
    sortAt: sortAt(followUp.dueAt, followUp.createdAt),
    title: "followUps.title",
    body: `followUps.reason.${followUp.reason}`,
    origin: "plant_follow_ups",
    payload: { followUpId: followUp.id, reason: followUp.reason, taskType: followUp.taskType, status: followUp.status }
  };

  if (followUp.status !== "completed") {
    return [scheduled];
  }

  return [
    scheduled,
    {
      id: `plant_follow_ups:${followUp.id}:completed`,
      plantId: followUp.plantId,
      kind: "followup_completed",
      occurredAt: dateKey(followUp.updatedAt ?? followUp.createdAt),
      sortAt: sortAt(followUp.updatedAt ?? followUp.createdAt),
      title: localized(followUp.timelineEntry?.title) ?? "milestones.follow_up_completed.title",
      body: localized(followUp.timelineEntry?.body ?? followUp.summary) ?? "milestones.follow_up_completed.description",
      origin: "plant_follow_ups",
      payload: { followUpId: followUp.id, result: followUp.result, summary: followUp.summary, comparison: followUp.comparison }
    }
  ];
}

function analysisToEvent(analysis: PlantAnalysisRecord): PlantTimelineEvent | null {
  const raw = analysis.rawResult;
  const mode = raw && typeof raw === "object" ? raw.analysisMode : null;
  if (mode !== "plant_checkin") {
    return null;
  }

  return {
    id: `plant_analyses:${analysis.id}`,
    plantId: analysis.plantId,
    kind: "checkin_completed",
    occurredAt: dateKey(analysis.createdAt),
    sortAt: sortAt(analysis.createdAt),
    title: "milestones.follow_up_completed.title",
    body: localized(raw?.photoComparison?.message ?? analysis.summary) ?? "milestones.follow_up_completed.description",
    origin: "plant_analyses",
    payload: { analysisId: analysis.id, condition: analysis.condition, photoComparison: raw?.photoComparison }
  };
}

function dedupeKey(event: PlantTimelineEvent) {
  if (event.kind === "watering" || event.kind === "soil_check" || event.kind === "repotting_unknown") {
    return [event.plantId, event.kind, event.occurredAt ?? "unknown"].join(":");
  }
  return event.id;
}

function eventRank(event: PlantTimelineEvent) {
  if (event.origin === "plant_milestones") return 0;
  if (event.origin === "care_events") return 1;
  return 2;
}

export function buildPlantTimeline(input: TimelineInput): PlantTimelineEvent[] {
  const candidates = [
    ...(input.milestones ?? []).map(milestoneToEvent),
    ...(input.careEvents ?? []).map(careEventToEvent),
    ...(input.analyses ?? []).map(analysisToEvent),
    ...(input.followUps ?? []).flatMap(followUpToEvents),
    ...photoToEvents(input.photos)
  ].filter((event): event is PlantTimelineEvent => Boolean(event && event.plantId === input.plantId));

  const deduped = new Map<string, PlantTimelineEvent>();
  for (const event of candidates) {
    const key = dedupeKey(event);
    const current = deduped.get(key);
    if (!current || eventRank(event) < eventRank(current)) {
      deduped.set(key, event);
    }
  }

  return Array.from(deduped.values()).sort((a, b) => {
    const byDate = b.sortAt.localeCompare(a.sortAt);
    if (byDate !== 0) return byDate;
    const byKind = a.kind.localeCompare(b.kind);
    if (byKind !== 0) return byKind;
    return a.id.localeCompare(b.id);
  });
}
