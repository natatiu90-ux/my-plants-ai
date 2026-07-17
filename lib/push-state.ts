export type PushReminderState =
  | "unsupported"
  | "requires_install"
  | "not_requested"
  | "requesting"
  | "granted_no_subscription"
  | "enabled"
  | "denied"
  | "error";

export type PushReminderStateInput = {
  isSecureContext: boolean;
  serviceWorkerSupported: boolean;
  notificationApiSupported: boolean;
  pushManagerSupported: boolean;
  isLikelyIos: boolean;
  isStandalone: boolean;
  permission: NotificationPermission | "unsupported";
  serviceWorkerReady: boolean;
  browserSubscriptionExists: boolean;
  subscriptionPersisted: boolean;
  vapidPublicKeyPresent: boolean;
  deliveryConfigReady: boolean;
  isRequesting?: boolean;
  hasError?: boolean;
};

export function derivePushReminderState(input: PushReminderStateInput): PushReminderState {
  if (input.isRequesting) {
    return "requesting";
  }

  if (input.hasError) {
    return "error";
  }

  if (!input.isSecureContext || !input.serviceWorkerSupported || !input.notificationApiSupported || !input.pushManagerSupported) {
    return "unsupported";
  }

  if (input.isLikelyIos && !input.isStandalone) {
    return "requires_install";
  }

  if (input.permission === "denied") {
    return "denied";
  }

  if (input.permission === "default" || input.permission === "unsupported") {
    return "not_requested";
  }

  if (
    input.permission === "granted" &&
    input.serviceWorkerReady &&
    input.browserSubscriptionExists &&
    input.subscriptionPersisted &&
    input.vapidPublicKeyPresent &&
    input.deliveryConfigReady
  ) {
    return "enabled";
  }

  return "granted_no_subscription";
}
