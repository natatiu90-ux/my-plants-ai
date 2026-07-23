import assert from "node:assert/strict";
import { normalizeReminderDueAt, reminderDueCycleKey, shouldScheduleCareReminder } from "./care-reminders";

assert.equal(
  shouldScheduleCareReminder({
    plantId: "plant-1",
    reminderType: "soil_check",
    nextCheckAt: "2026-07-25",
    notificationEnabled: true,
    careScheduleStatus: "active"
  }),
  true,
  "enabled active plant with a next check should schedule a reminder"
);

assert.equal(
  shouldScheduleCareReminder({
    plantId: "plant-1",
    reminderType: "soil_check",
    nextCheckAt: "2026-07-25",
    notificationEnabled: false,
    careScheduleStatus: "active"
  }),
  false,
  "disabled plant reminders should not schedule"
);

assert.equal(
  shouldScheduleCareReminder({
    plantId: "plant-1",
    reminderType: "soil_check",
    nextCheckAt: "2026-07-25",
    notificationEnabled: true,
    careScheduleStatus: "paused"
  }),
  false,
  "paused care schedules should not schedule"
);

assert.equal(
  shouldScheduleCareReminder({
    plantId: "plant-1",
    reminderType: "soil_check",
    nextCheckAt: null,
    notificationEnabled: true,
    careScheduleStatus: "active"
  }),
  false,
  "missing next check should not schedule"
);

assert.equal(normalizeReminderDueAt("2026-07-25"), "2026-07-25T12:00:00.000Z");
assert.equal(normalizeReminderDueAt("2026-07-25T08:30:00.000Z"), "2026-07-25T08:30:00.000Z");
assert.equal(reminderDueCycleKey("plant-1", "soil_check", "2026-07-25T08:30:00.000Z"), "plant-1:soil_check:2026-07-25");

console.log("care-reminders tests passed");
