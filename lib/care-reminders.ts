export type CareReminderType = "soil_check";
export type CareReminderStatus = "scheduled" | "sent" | "failed" | "cancelled";

export type CareReminderScheduleInput = {
  plantId: string;
  reminderType: CareReminderType;
  nextCheckAt?: string | null;
  notificationEnabled: boolean;
  careScheduleStatus?: "active" | "paused" | "needs_first_check" | null;
};

export function dateKeyFromReminderDate(value?: string | null) {
  return value ? value.slice(0, 10) : null;
}

export function reminderDueCycleKey(plantId: string, reminderType: CareReminderType, dueAt: string) {
  const dateKey = dateKeyFromReminderDate(dueAt) ?? dueAt;
  return `${plantId}:${reminderType}:${dateKey}`;
}

export function shouldScheduleCareReminder(input: CareReminderScheduleInput) {
  return Boolean(input.notificationEnabled && input.nextCheckAt && input.careScheduleStatus !== "paused");
}

export function normalizeReminderDueAt(nextCheckAt: string) {
  return nextCheckAt.includes("T") ? nextCheckAt : `${nextCheckAt}T12:00:00.000Z`;
}
