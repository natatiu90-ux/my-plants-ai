import type { PlantMilestone, PlantMilestoneType } from "@/types/plant";

export function initialMilestoneEditorDraft(milestone: PlantMilestone | undefined, today: string) {
  return {
    type: milestone?.type ?? null,
    eventDate: milestone?.eventDate ?? "",
    note: milestone?.note ?? milestone?.customDescription ?? "",
    today
  } satisfies {
    type: PlantMilestoneType | null;
    eventDate: string;
    note: string;
    today: string;
  };
}

export function dateFieldIsVisible(type: PlantMilestoneType | null) {
  return Boolean(type);
}

export function selectMilestoneType(currentEventDate: string, today: string) {
  return currentEventDate || today;
}

export function canSaveMilestoneDraft(input: { type: PlantMilestoneType | null; eventDate: string; isSaving?: boolean }) {
  return Boolean(input.type && input.eventDate && !input.isSaving);
}
