self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "My Plants AI";
  const options = {
    body: payload.body || "",
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: payload.tag || (payload.plantId ? `plant-care-${payload.plantId}` : "plant-care"),
    renotify: false,
    data: {
      url: payload.url || "/",
      plantId: payload.plantId,
      deliveryId: payload.deliveryId
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = new URL(data.url || "/", self.location.origin).href;

  event.waitUntil((async () => {
    if (data.deliveryId) {
      fetch("/api/notifications/opened", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deliveryId: data.deliveryId })
      }).catch(() => {});
    }

    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (client.url === targetUrl && "focus" in client) {
        return client.focus();
      }
    }

    return clients.openWindow(targetUrl);
  })());
});
