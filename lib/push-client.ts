"use client";

import { supabase } from "@/lib/supabase/client";

type NotificationSupport =
  | { supported: true; permission: NotificationPermission; subscribed: boolean }
  | { supported: false; permission: "unsupported"; subscribed: false };

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

async function getServiceWorkerRegistration() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported.");
  }

  const registration = await navigator.serviceWorker.ready;
  return registration;
}

export async function getNotificationSupport(): Promise<NotificationSupport> {
  if (!("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) {
    return { supported: false, permission: "unsupported", subscribed: false };
  }

  const registration = await navigator.serviceWorker.ready.catch(() => null);
  const subscription = await registration?.pushManager.getSubscription();
  return { supported: true, permission: Notification.permission, subscribed: Boolean(subscription) };
}

export async function subscribeToCarePush(locale: string) {
  if (!("Notification" in window) || !("PushManager" in window)) {
    throw new Error("push_not_supported");
  }

  console.info("notification_opt_in_shown");
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  console.info("notification_permission_result", { permission });
  if (permission !== "granted") {
    throw new Error("notification_permission_denied");
  }

  const [{ publicKey }, token, registration] = await Promise.all([
    fetch("/api/push/vapid-public-key").then((response) => response.json() as Promise<{ publicKey?: string }>),
    getSessionToken(),
    getServiceWorkerRegistration()
  ]);
  if (!publicKey) {
    throw new Error("vapid_public_key_missing");
  }

  const existingSubscription = await registration.pushManager.getSubscription();
  const subscription =
    existingSubscription ??
    await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

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
  if (!response.ok) {
    console.info("push_subscription_failed", { status: response.status });
    throw new Error("push_subscription_failed");
  }

  console.info("push_subscription_created");
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
    throw new Error("push_settings_failed");
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
