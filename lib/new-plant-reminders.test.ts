import assert from "node:assert/strict";
import { shouldEnableRemindersForNewPlant } from "./new-plant-reminders";

assert.equal(
  shouldEnableRemindersForNewPlant("enabled", { careNotificationsEnabled: true }),
  true,
  "fully enabled push setup should enable reminders for new plants"
);

assert.equal(
  shouldEnableRemindersForNewPlant("granted_no_subscription", { careNotificationsEnabled: true }),
  false,
  "permission without persisted subscription should not enable reminders"
);

assert.equal(
  shouldEnableRemindersForNewPlant("unsupported", { careNotificationsEnabled: true }),
  false,
  "unsupported push should not enable reminders"
);

assert.equal(
  shouldEnableRemindersForNewPlant("enabled", { careNotificationsEnabled: false }),
  false,
  "global reminders disabled should keep new plant reminders disabled"
);

assert.equal(
  shouldEnableRemindersForNewPlant("requires_install", { careNotificationsEnabled: true }),
  false,
  "iOS browser mode should not enable plant reminders"
);

console.log("new-plant-reminders tests passed");
