"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || window.location.protocol !== "https:" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.info("service_worker_registration_failed", {
        message: error instanceof Error ? error.message : "Unknown error"
      });
    });
  }, []);

  return null;
}
