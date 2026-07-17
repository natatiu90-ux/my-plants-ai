"use client";

import { supabase } from "@/lib/supabase/client";
import { derivePushReminderState, type PushReminderState } from "@/lib/push-state";

type NotificationSupport = {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  careNotificationsEnabled: boolean;
  state: PushReminderState;
};

export type PushSetupStep =
  | "idle"
  | "button_click"
  | "standalone_check"
  | "service_worker_registration"
  | "service_worker_ready"
  | "notification_permission"
  | "vapid_public_key"
  | "push_subscribe"
  | "post_subscription"
  | "save_preferences"
  | "completed";

export type PushDiagnostics = {
  isStandalone: boolean;
  isLikelyIos: boolean;
  isSecureContext: boolean;
  serviceWorkerSupported: boolean;
  serviceWorkerState: string;
  serviceWorkerReady: boolean;
  notificationApiSupported: boolean;
  notificationPermission: NotificationPermission | "unsupported";
  pushManagerSupported: boolean;
  vapidPublicKeyPresent: boolean;
  missingConfig: string[];
  browserSubscriptionExists: boolean;
  subscriptionPersisted: boolean;
  careNotificationsEnabled: boolean;
  reminderState: PushReminderState;
  currentStep: PushSetupStep;
  errorName?: string;
  errorMessage?: string;
  latestApiStatus?: number;
};

export class PushSetupError extends Error {
  constructor(
    public code:
      | "open_installed_pwa"
      | "notifications_not_supported"
      | "service_worker_failed"
      | "vapid_public_key_missing"
      | "notification_permission_denied"
      | "push_subscription_failed"
      | "subscription_save_failed"
      | "test_notification_failed",
    message: string,
    public step: PushSetupStep,
    public apiStatus?: number
  ) {
    super(message);
    this.name = code;
  }
}

type DiagnosticsListener = (diagnostics: PushDiagnostics) => void;

export function isStandalonePwa() {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function isLikelyIosPushBrowser() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function endpointSuffix(endpoint?: string | null) {
  if (!endpoint) return null;
  return endpoint.slice(-12);
}

async function serviceWorkerReadyWithin(timeoutMs: number) {
  if (!("serviceWorker" in navigator)) {
    return null;
  }
  return Promise.race<ServiceWorkerRegistration | null>([
    navigator.serviceWorker.ready,
    new Promise<ServiceWorkerRegistration | null>((resolve) => window.setTimeout(() => resolve(null), timeoutMs))
  ]).catch(() => null);
}

export async function collectPushDiagnostics(currentStep: PushSetupStep = "idle", latestApiStatus?: number): Promise<PushDiagnostics> {
  const serviceWorkerSupported = "serviceWorker" in navigator;
  const registration = serviceWorkerSupported ? await navigator.serviceWorker.getRegistration().catch(() => undefined) : undefined;
  const readyRegistration = serviceWorkerSupported ? await serviceWorkerReadyWithin(1500) : null;
  const subscription = await (readyRegistration ?? registration)?.pushManager.getSubscription().catch(() => null);
  const publicKeyStatus = await fetch("/api/push/vapid-public-key")
    .then(async (response) => ({
      status: response.status,
      payload: await response.json().catch(() => ({})) as { publicKey?: string; missingConfig?: string[] }
    }))
    .catch(() => ({ status: undefined, payload: {} as { publicKey?: string; missingConfig?: string[] } }));
  const persistedStatus = subscription
    ? await getPersistedPushStatus(subscription.endpoint).catch(() => ({
      response: null,
      subscriptionPersisted: false,
      careNotificationsEnabled: false,
      missingConfig: [] as string[]
    }))
    : {
      response: null,
      subscriptionPersisted: false,
      careNotificationsEnabled: false,
      missingConfig: [] as string[]
    };
  const missingConfig = Array.from(new Set([
    ...(Array.isArray(publicKeyStatus.payload.missingConfig) ? publicKeyStatus.payload.missingConfig : []),
    ...persistedStatus.missingConfig
  ]));
  const notificationPermission = "Notification" in window ? Notification.permission : "unsupported";
  const browserSubscriptionExists = Boolean(subscription);
  const subscriptionPersisted = Boolean(persistedStatus.subscriptionPersisted);
  const reminderState = derivePushReminderState({
    isSecureContext: window.isSecureContext,
    serviceWorkerSupported,
    notificationApiSupported: "Notification" in window,
    pushManagerSupported: "PushManager" in window,
    isLikelyIos: isLikelyIosPushBrowser(),
    isStandalone: isStandalonePwa(),
    permission: notificationPermission,
    serviceWorkerReady: Boolean(readyRegistration),
    browserSubscriptionExists,
    subscriptionPersisted,
    vapidPublicKeyPresent: Boolean(publicKeyStatus.payload.publicKey),
    deliveryConfigReady: missingConfig.length === 0
  });

  return {
    isStandalone: isStandalonePwa(),
    isLikelyIos: isLikelyIosPushBrowser(),
    isSecureContext: window.isSecureContext,
    serviceWorkerSupported,
    serviceWorkerState: readyRegistration?.active?.state ?? registration?.active?.state ?? registration?.installing?.state ?? registration?.waiting?.state ?? "none",
    serviceWorkerReady: Boolean(readyRegistration),
    notificationApiSupported: "Notification" in window,
    notificationPermission,
    pushManagerSupported: "PushManager" in window,
    vapidPublicKeyPresent: Boolean(publicKeyStatus.payload.publicKey),
    missingConfig,
    browserSubscriptionExists,
    subscriptionPersisted,
    careNotificationsEnabled: Boolean(persistedStatus.careNotificationsEnabled),
    reminderState,
    currentStep,
    latestApiStatus: latestApiStatus ?? persistedStatus.response?.status ?? publicKeyStatus.status
  };
}

function notifyDiagnostics(listener: DiagnosticsListener | undefined, diagnostics: PushDiagnostics) {
  listener?.(diagnostics);
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }
  return output;
}

async function getSessionToken() {
  const { data, error } = await supabase?.auth.getSession() ?? { data: null, error: new Error("Supabase is not configured.") };
  if (error || !data?.session?.access_token) {
    throw error ?? new Error("No active session.");
  }
  return data.session.access_token;
}

async function getPersistedPushStatus(endpoint?: string | null) {
  const token = await getSessionToken();
  const response = await fetch("/api/push/status", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ endpoint: endpoint ?? null })
  });
  const payload = await response.json().catch(() => ({})) as {
    subscriptionPersisted?: boolean;
    careNotificationsEnabled?: boolean;
    missingConfig?: string[];
  };
  return {
    response,
    subscriptionPersisted: Boolean(payload.subscriptionPersisted),
    careNotificationsEnabled: Boolean(payload.careNotificationsEnabled),
    missingConfig: Array.isArray(payload.missingConfig) ? payload.missingConfig : []
  };
}

async function getServiceWorkerRegistration(onDiagnostics?: DiagnosticsListener) {
  if (!("serviceWorker" in navigator)) {
    throw new PushSetupError("notifications_not_supported", "Service workers are not supported.", "service_worker_registration");
  }

  try {
    notifyDiagnostics(onDiagnostics, await collectPushDiagnostics("service_worker_registration"));
    await navigator.serviceWorker.register("/sw.js");
    notifyDiagnostics(onDiagnostics, await collectPushDiagnostics("service_worker_ready"));
    return await navigator.serviceWorker.ready;
  } catch (error) {
    throw new PushSetupError("service_worker_failed", error instanceof Error ? error.message : "Service worker failed to start.", "service_worker_ready");
  }
}

export async function getNotificationSupport(): Promise<NotificationSupport> {
  const base = {
    isSecureContext: window.isSecureContext,
    serviceWorkerSupported: "serviceWorker" in navigator,
    notificationApiSupported: "Notification" in window,
    pushManagerSupported: "PushManager" in window,
    isLikelyIos: isLikelyIosPushBrowser(),
    isStandalone: isStandalonePwa()
  };

  if (!base.isSecureContext || !base.notificationApiSupported || !base.pushManagerSupported || !base.serviceWorkerSupported) {
    return { supported: false, permission: "unsupported", subscribed: false, careNotificationsEnabled: false, state: "unsupported" };
  }

  if (base.isLikelyIos && !base.isStandalone) {
    return { supported: false, permission: Notification.permission, subscribed: false, careNotificationsEnabled: false, state: "requires_install" };
  }

  const registration = await navigator.serviceWorker.getRegistration().catch(() => null);
  const subscription = await registration?.pushManager.getSubscription();
  const persistedStatus = subscription
    ? await getPersistedPushStatus(subscription.endpoint).catch(() => ({
      subscriptionPersisted: false,
      careNotificationsEnabled: false
    }))
    : { subscriptionPersisted: false, careNotificationsEnabled: false };
  const publicKeyResponse = await fetch("/api/push/vapid-public-key").catch(() => null);
  const publicKeyPayload = await publicKeyResponse?.json().catch(() => ({})) as { publicKey?: string; missingConfig?: string[] } | undefined;
  const missingConfig = Array.isArray(publicKeyPayload?.missingConfig) ? publicKeyPayload.missingConfig : [];
  const state = derivePushReminderState({
    ...base,
    permission: Notification.permission,
    serviceWorkerReady: Boolean(registration?.active),
    browserSubscriptionExists: Boolean(subscription),
    subscriptionPersisted: Boolean(persistedStatus.subscriptionPersisted && persistedStatus.careNotificationsEnabled),
    vapidPublicKeyPresent: Boolean(publicKeyPayload?.publicKey),
    deliveryConfigReady: missingConfig.length === 0
  });
  return {
    supported: true,
    permission: Notification.permission,
    subscribed: state === "enabled",
    careNotificationsEnabled: Boolean(persistedStatus.careNotificationsEnabled),
    state
  };
}

export async function subscribeToCarePush(locale: string, onDiagnostics?: DiagnosticsListener) {
  notifyDiagnostics(onDiagnostics, await collectPushDiagnostics("standalone_check"));
  console.info("push_support_check", {
    isSecureContext: window.isSecureContext,
    serviceWorkerSupported: "serviceWorker" in navigator,
    notificationApiSupported: "Notification" in window,
    pushManagerSupported: "PushManager" in window,
    isLikelyIos: isLikelyIosPushBrowser(),
    isStandalone: isStandalonePwa()
  });
  if (isLikelyIosPushBrowser() && !isStandalonePwa()) {
    throw new PushSetupError("open_installed_pwa", "Open the installed Home Screen app.", "standalone_check");
  }

  if (!window.isSecureContext || !("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) {
    throw new PushSetupError("notifications_not_supported", "Notifications are not supported.", "standalone_check");
  }

  console.info("notification_permission_before", { permission: Notification.permission });
  notifyDiagnostics(onDiagnostics, await collectPushDiagnostics("notification_permission"));
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  console.info("notification_permission_after", { permission });
  notifyDiagnostics(onDiagnostics, await collectPushDiagnostics("notification_permission"));
  if (permission !== "granted") {
    throw new PushSetupError("notification_permission_denied", "Permission was denied.", "notification_permission");
  }

  const [publicKeyResponse, token, registration] = await Promise.all([
    fetch("/api/push/vapid-public-key"),
    getSessionToken(),
    getServiceWorkerRegistration(onDiagnostics)
  ]);
  const publicKeyPayload = await publicKeyResponse.json().catch(() => ({})) as { publicKey?: string; missingConfig?: string[] };
  const { publicKey } = publicKeyPayload;
  notifyDiagnostics(onDiagnostics, await collectPushDiagnostics("vapid_public_key", publicKeyResponse.status));
  if (!publicKey || !publicKeyResponse.ok) {
    console.info("push_config_missing", { missing: publicKeyPayload.missingConfig ?? ["NEXT_PUBLIC_VAPID_PUBLIC_KEY"] });
    throw new PushSetupError("vapid_public_key_missing", "Public notification key is missing.", "vapid_public_key", publicKeyResponse.status);
  }

  const existingSubscription = await registration.pushManager.getSubscription();
  let subscription = existingSubscription;
  console.info("push_existing_subscription_checked", { exists: Boolean(existingSubscription), endpointSuffix: endpointSuffix(existingSubscription?.endpoint) });
  if (!subscription) {
    try {
      notifyDiagnostics(onDiagnostics, await collectPushDiagnostics("push_subscribe"));
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
      console.info("push_subscription_created", { endpointSuffix: endpointSuffix(subscription.endpoint) });
    } catch (error) {
      console.info("push_subscription_failed", {
        stage: "push_subscribe",
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : "Unknown error"
      });
      throw new PushSetupError("push_subscription_failed", error instanceof Error ? error.message : "Push subscription failed.", "push_subscribe");
    }
  }

  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale
    })
  });
  notifyDiagnostics(onDiagnostics, await collectPushDiagnostics("post_subscription", response.status));
  const savePayload = await response.json().catch(() => ({})) as { subscriptionPersisted?: boolean; missingConfig?: string[]; error?: string };
  if (!response.ok) {
    console.info("push_subscription_failed", { stage: "post_subscription", status: response.status, error: savePayload.error, missingConfig: savePayload.missingConfig });
    throw new PushSetupError("subscription_save_failed", "Subscription could not be saved.", "post_subscription", response.status);
  }
  if (!savePayload.subscriptionPersisted) {
    console.info("push_subscription_failed", { stage: "post_subscription", status: response.status, error: "subscription_not_persisted" });
    throw new PushSetupError("subscription_save_failed", "Subscription could not be saved.", "post_subscription", response.status);
  }

  console.info("push_subscription_persisted", { endpointSuffix: endpointSuffix(subscription.endpoint) });
  notifyDiagnostics(onDiagnostics, await collectPushDiagnostics("completed", response.status));
  return subscription;
}

export async function unsubscribeFromCarePush() {
  const [token, registration] = await Promise.all([getSessionToken(), getServiceWorkerRegistration()]);
  const subscription = await registration.pushManager.getSubscription();

  const response = await fetch("/api/push/unsubscribe", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ endpoint: subscription?.endpoint })
  });
  if (!response.ok) {
    throw new Error("push_unsubscribe_failed");
  }

  await subscription?.unsubscribe();
}

export async function saveCareNotificationSettings(input: {
  preferredTime: string;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  locale: string;
}) {
  const token = await getSessionToken();
  const response = await fetch("/api/push/settings", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      preferredTime: input.preferredTime,
      quietHoursStart: input.quietHoursStart || null,
      quietHoursEnd: input.quietHoursEnd || null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: input.locale
    })
  });
  if (!response.ok) {
    throw new PushSetupError("subscription_save_failed", "Subscription preferences could not be saved.", "save_preferences", response.status);
  }
}

export async function sendTestCareNotification(locale: string) {
  const token = await getSessionToken();
  const response = await fetch("/api/push/test", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ locale })
  });
  const payload = await response.json().catch(() => ({})) as { error?: string; missingConfig?: string[] };
  if (!response.ok) {
    console.info("push_test_failed", { status: response.status, error: payload.error, missingConfig: payload.missingConfig });
    throw new PushSetupError("test_notification_failed", payload.error ?? "push_test_failed", "completed", response.status);
  }
}
