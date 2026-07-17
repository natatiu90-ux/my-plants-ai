import type { PushReminderState } from "@/lib/push-state";

export type GlobalReminderSettings = {
  careNotificationsEnabled: boolean;
};

export function shouldEnableRemindersForNewPlant(
  pushState: PushReminderState,
  globalReminderSettings: GlobalReminderSettings
) {
  return pushState === "enabled" && globalReminderSettings.careNotificationsEnabled;
}
