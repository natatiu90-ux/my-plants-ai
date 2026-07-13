import webpush, { WebPushError } from "web-push";

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

let configured = false;

export function getVapidPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? process.env.VAPID_PUBLIC_KEY ?? "";
}

export function configureWebPush() {
  if (configured) {
    return;
  }

  const publicKey = getVapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys are not configured.");
  }

  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:hello@example.com", publicKey, privateKey);
  configured = true;
}

export async function sendCarePush(subscription: PushSubscriptionRow, payload: unknown) {
  configureWebPush();
  return webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth
      }
    },
    JSON.stringify(payload)
  );
}

export function isPermanentPushError(error: unknown) {
  return error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410);
}

export function pushErrorCode(error: unknown) {
  if (error instanceof WebPushError) {
    return String(error.statusCode);
  }
  return error instanceof Error ? error.message : "unknown";
}
