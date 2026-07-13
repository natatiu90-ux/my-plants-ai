"use client";

import { supabase } from "@/lib/supabase/client";

type NotificationSupport =
  | { supported: true; permission: NotificationPermission; subscribed: boolean }
  | { supported: false; permission: "unsupported"; subscribed: false };

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
  serviceWorkerSupported: boolean;
  serviceWorkerState: string;
  notificationApiSupported: boolean;
  notificationPermission: NotificationPermission | "unsupported";
  pushManagerSupported: boolean;
  vapidPublicKeyPresent: boolean;
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
      | "subscription_save_failed",
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

function isLikelyIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

export async function collectPushDiagnostics(currentStep: PushSetupStep = "idle", latestApiStatus?: number): Promise<PushDiagnostics> {
  const serviceWorkerSupported = "serviceWorker" in navigator;
  const registration = serviceWorkerSupported ? await navigator.serviceWorker.getRegistration().catch(() => undefined) : undefined;
  const publicKeyStatus = await fetch("/api/push/vapid-public-key")
    .then(async (response) => ({ status: response.status, payload: await response.json().catch(() => ({})) as { publicKey?: string } }))
    .catch(() => ({ status: undefined, payload: {} as { publicKey?: string } }));

  return {
    isStandalone: isStandalonePwa(),
    serviceWorkerSupported,
    serviceWorkerState: registration?.active?.state ?? registration?.installing?.state ?? registration?.waiting?.state ?? "none",
    notificationApiSupported: "Notification" in window,
    notificationPermission: "Notification" in window ? Notification.permission : "unsupported",
    pushManagerSupported: "PushManager" in window,
    vapidPublicKeyPresent: Boolean(publicKeyStatus.payload.publicKey),
    currentStep,
    latestApiStatus: latestApiStatus ?? publicKeyStatus.status
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
  if (!("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) {
    return { supported: false, permission: "unsupported", subscribed: false };
  }

  const registration = await navigator.serviceWorker.ready.catch(() => null);
  const subscription = await registration?.pushManager.getSubscription();
  return { supported: true, permission: Notification.permission, subscribed: Boolean(subscription) };
}

export async function subscribeToCarePush(locale: string, onDiagnostics?: DiagnosticsListener) {
  notifyDiagnostics(onDiagnostics, await collectPushDiagnostics("standalone_check"));
  if (isLikelyIos() && !isStandalonePwa()) {
    throw new PushSetupError("open_installed_pwa", "Open the installed Home Screen app.", "standalone_check");
  }

  if (!("Notification" in window) || !("PushManager" in window)) {
    throw new PushSetupError("notifications_not_supported", "Notifications are not supported.", "standalone_check");
  }

  console.info("notification_opt_in_shown");
  notifyDiagnostics(onDiagnostics, await collectPushDiagnostics("notification_permission"));
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  console.info("notification_permission_result", { permission });
  notifyDiagnostics(onDiagnostics, await collectPushDiagnostics("notification_permission"));
  if (permission !== "granted") {
    throw new PushSetupError("notification_permission_denied", "Permission was denied.", "notification_permission");
  }

  const [publicKeyResponse, token, registration] = await Promise.all([
    fetch("/api/push/vapid-public-key"),
    getSessionToken(),
    getServiceWorkerRegistration(onDiagnostics)
  ]);
  const { publicKey } = await publicKeyResponse.json().catch(() => ({})) as { publicKey?: string };
  notifyDiagnostics(onDiagnostics, await collectPushDiagnostics("vapid_public_key", publicKeyResponse.status));
  if (!publicKey) {
    throw new PushSetupError("vapid_public_key_missing", "Public notification key is missing.", "vapid_public_key", publicKeyResponse.status);
  }

  const existingSubscription = await registration.pushManager.getSubscription();
  let subscription = existingSubscription;
  if (!subscription) {
    try {
      notifyDiagnostics(onDiagnostics, await collectPushDiagnostics("push_subscribe"));
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    } catch (error) {
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
  if (!response.ok) {
    console.info("push_subscription_failed", { status: response.status });
    throw new PushSetupError("subscription_save_failed", "Subscription could not be saved.", "post_subscription", response.status);
  }

  console.info("push_subscription_created");
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
  if (!response.ok) {
    throw new Error("push_test_failed");
  }
}
