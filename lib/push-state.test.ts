import assert from "node:assert/strict";
import { derivePushReminderState, type PushReminderStateInput } from "./push-state";

const base: PushReminderStateInput = {
  isSecureContext: true,
  serviceWorkerSupported: true,
  notificationApiSupported: true,
  pushManagerSupported: true,
  isLikelyIos: false,
  isStandalone: true,
  permission: "default",
  serviceWorkerReady: false,
  browserSubscriptionExists: false,
  subscriptionPersisted: false,
  vapidPublicKeyPresent: true,
  deliveryConfigReady: true
};

assert.equal(derivePushReminderState({ ...base, notificationApiSupported: false }), "unsupported");
assert.equal(derivePushReminderState({ ...base, isLikelyIos: true, isStandalone: false }), "requires_install");
assert.equal(derivePushReminderState({ ...base, permission: "default" }), "not_requested");
assert.equal(derivePushReminderState({ ...base, permission: "denied" }), "denied");
assert.equal(derivePushReminderState({ ...base, permission: "granted", serviceWorkerReady: false }), "granted_no_subscription");
assert.equal(
  derivePushReminderState({
    ...base,
    permission: "granted",
    serviceWorkerReady: true,
    browserSubscriptionExists: true,
    subscriptionPersisted: false
  }),
  "granted_no_subscription"
);
assert.equal(
  derivePushReminderState({
    ...base,
    permission: "granted",
    serviceWorkerReady: true,
    browserSubscriptionExists: true,
    subscriptionPersisted: true,
    vapidPublicKeyPresent: false,
    deliveryConfigReady: true
  }),
  "granted_no_subscription"
);
assert.equal(
  derivePushReminderState({
    ...base,
    permission: "granted",
    serviceWorkerReady: true,
    browserSubscriptionExists: true,
    subscriptionPersisted: true,
    vapidPublicKeyPresent: true,
    deliveryConfigReady: false
  }),
  "granted_no_subscription"
);
assert.equal(
  derivePushReminderState({
    ...base,
    permission: "granted",
    serviceWorkerReady: true,
    browserSubscriptionExists: true,
    subscriptionPersisted: true,
    vapidPublicKeyPresent: true
  }),
  "enabled"
);
assert.equal(derivePushReminderState({ ...base, isRequesting: true }), "requesting");
assert.equal(derivePushReminderState({ ...base, hasError: true }), "error");

console.log("push-state tests passed");
