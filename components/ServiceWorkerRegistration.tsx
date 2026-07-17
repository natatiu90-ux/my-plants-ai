"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { appBuildStorageKey, appBuildVersion, isStandalonePwa } from "@/lib/app-version";
import { PhotoStorageRepository, temporaryPhotoSchemaVersion } from "@/lib/photo-storage";
import { buildIdFromServiceWorkerUrl, shouldShowPwaUpdateBanner } from "@/lib/pwa-update-state";

const updateRequestedSessionKey = "my-plants-update-requested";
const dismissedWorkerBuildSessionKey = "my-plants-dismissed-update-worker-build";
const staleUpdateStorageKeys = ["my-plants-update-available", "my-plants-update-ready", "my_plants_update_available"];

function canUseServiceWorker() {
  return (
    "serviceWorker" in navigator &&
    (window.location.protocol === "https:" ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1")
  );
}

function isActionableWaitingWorker(registration: ServiceWorkerRegistration, worker: ServiceWorker | null, detectedThisSession: boolean) {
  const controller = navigator.serviceWorker.controller;
  return Boolean(
    worker &&
      controller &&
      registration.waiting === worker &&
      shouldShowPwaUpdateBanner({
        clientBuildId: appBuildVersion,
        controllerBuildId: buildIdFromServiceWorkerUrl(controller.scriptURL),
        waitingBuildId: buildIdFromServiceWorkerUrl(worker.scriptURL),
        waitingDetectedThisSession: detectedThisSession,
        dismissedWaitingBuildId: window.sessionStorage.getItem(dismissedWorkerBuildSessionKey)
      })
  );
}

function logPwaUpdateDecision(registration: ServiceWorkerRegistration, reason: string) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.info("pwa_update_state", {
    reason,
    clientBuildId: appBuildVersion,
    controllerUrl: navigator.serviceWorker.controller?.scriptURL ?? null,
    controllerBuildId: buildIdFromServiceWorkerUrl(navigator.serviceWorker.controller?.scriptURL),
    activeState: registration.active?.state ?? null,
    waitingState: registration.waiting?.state ?? null,
    installingState: registration.installing?.state ?? null,
    activeUrl: registration.active?.scriptURL ?? null,
    activeBuildId: buildIdFromServiceWorkerUrl(registration.active?.scriptURL),
    waitingUrl: registration.waiting?.scriptURL ?? null,
    waitingBuildId: buildIdFromServiceWorkerUrl(registration.waiting?.scriptURL),
    installingUrl: registration.installing?.scriptURL ?? null
  });
}

export function ServiceWorkerRegistration() {
  const { t } = useI18n();
  const [isUpdateReady, setIsUpdateReady] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!canUseServiceWorker()) {
      return;
    }

    let hasReloadedForControllerChange = false;
    let registrationRef: ServiceWorkerRegistration | null = null;
    const previousVersion = window.localStorage.getItem(appBuildStorageKey);
    const shouldClearDisposablePhotos = !previousVersion || previousVersion !== appBuildVersion;
    staleUpdateStorageKeys.forEach((key) => window.localStorage.removeItem(key));

    if (shouldClearDisposablePhotos) {
      void PhotoStorageRepository.clearTemporaryPhotos()
        .catch((error) => {
          console.info("temporary_photo_version_cleanup_failed", {
            message: error instanceof Error ? error.message : "Unknown error"
          });
        })
        .finally(() => {
          window.localStorage.setItem(appBuildStorageKey, appBuildVersion);
        });
    } else {
      window.localStorage.setItem(appBuildStorageKey, appBuildVersion);
    }

    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(appBuildVersion)}`).then((registration) => {
      registrationRef = registration;

      const hideUpdateBanner = (reason: string) => {
        setWaitingWorker(null);
        setIsUpdateReady(false);
        window.sessionStorage.removeItem(updateRequestedSessionKey);
        logPwaUpdateDecision(registration, reason);
      };

      const showUpdateBannerIfActionable = (worker: ServiceWorker | null, reason: string, detectedThisSession: boolean) => {
        if (!isActionableWaitingWorker(registration, worker, detectedThisSession)) {
          hideUpdateBanner(reason);
          return;
        }

        setWaitingWorker(worker);
        setIsUpdateReady(true);
        logPwaUpdateDecision(registration, reason);
      };

      const reportDiagnostics = async () => {
        if (process.env.NODE_ENV === "production") {
          return;
        }

        const cacheNames = "caches" in window ? await caches.keys().catch(() => []) : [];
        const temporaryPhotoIds = await PhotoStorageRepository.listPhotoIds().catch(() => []);
        console.info("pwa_update_diagnostics", {
          mode: isStandalonePwa() ? "standalone" : "browser",
          currentBuildVersion: appBuildVersion,
          storedPreviousBuildVersion: previousVersion,
          serviceWorkerController: navigator.serviceWorker.controller?.scriptURL ?? null,
          serviceWorkerControllerBuildId: buildIdFromServiceWorkerUrl(navigator.serviceWorker.controller?.scriptURL),
          serviceWorkerInstalling: registration.installing?.scriptURL ?? null,
          serviceWorkerWaiting: registration.waiting?.scriptURL ?? null,
          serviceWorkerWaitingBuildId: buildIdFromServiceWorkerUrl(registration.waiting?.scriptURL),
          serviceWorkerActive: registration.active?.scriptURL ?? null,
          serviceWorkerActiveBuildId: buildIdFromServiceWorkerUrl(registration.active?.scriptURL),
          activeCacheNames: cacheNames,
          temporaryPhotoSchemaVersion,
          temporaryPhotoCount: temporaryPhotoIds.length
        });
      };

      void reportDiagnostics();

      showUpdateBannerIfActionable(registration.waiting, registration.waiting ? "existing_waiting_worker_ignored_until_session_update" : "no_waiting_worker", false);
      void registration.update().then(() => {
        showUpdateBannerIfActionable(registration.waiting, registration.waiting ? "waiting_worker_after_update_check" : "no_waiting_worker_after_update_check", false);
      }).catch((error) => {
        console.info("service_worker_update_check_failed", {
          message: error instanceof Error ? error.message : "Unknown error"
        });
      });

      registration.addEventListener("updatefound", () => {
        const nextWorker = registration.installing;
        if (!nextWorker) {
          hideUpdateBanner("updatefound_without_installing_worker");
          return;
        }

        logPwaUpdateDecision(registration, "updatefound");
        nextWorker.addEventListener("statechange", () => {
          if (nextWorker.state === "installed") {
            showUpdateBannerIfActionable(nextWorker, "installing_worker_installed", true);
          }
        });
      });
    }).catch((error) => {
      console.info("service_worker_registration_failed", {
        message: error instanceof Error ? error.message : "Unknown error"
      });
    });

    const handleControllerChange = () => {
      if (hasReloadedForControllerChange) {
        return;
      }

      hasReloadedForControllerChange = true;
      window.localStorage.setItem(appBuildStorageKey, appBuildVersion);
      if (window.sessionStorage.getItem(updateRequestedSessionKey) === "1") {
        window.sessionStorage.removeItem(updateRequestedSessionKey);
        window.location.reload();
        return;
      }

      if (registrationRef) {
        logPwaUpdateDecision(registrationRef, "controller_changed_without_user_update_request");
      }
      setWaitingWorker(null);
      setIsUpdateReady(false);
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  const updateApp = () => {
    if (!waitingWorker) {
      setIsUpdateReady(false);
      return;
    }

    setIsUpdating(true);
    window.sessionStorage.setItem(updateRequestedSessionKey, "1");
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  };

  const dismissUpdate = () => {
    if (waitingWorker?.scriptURL) {
      const waitingBuildId = buildIdFromServiceWorkerUrl(waitingWorker.scriptURL);
      if (waitingBuildId) {
        window.sessionStorage.setItem(dismissedWorkerBuildSessionKey, waitingBuildId);
      }
    }
    setWaitingWorker(null);
    setIsUpdateReady(false);
  };

  if (!isUpdateReady) {
    return null;
  }

  return (
    <div className="fixed inset-x-4 top-[calc(env(safe-area-inset-top)+12px)] z-[70] mx-auto flex max-w-[390px] items-center gap-3 rounded-[20px] bg-[#fffaf3] p-3 shadow-[0_14px_40px_rgba(0,0,0,0.16)]">
      <p className="min-w-0 flex-1 text-sm font-extrabold leading-5 text-[#3f3b35]">{t("pwa.updateReady")}</p>
      <button
        type="button"
        onClick={updateApp}
        disabled={isUpdating || !waitingWorker}
        className="shrink-0 rounded-[14px] bg-[#ddf2dc] px-3 py-2 text-sm font-extrabold text-[#2d7a4f] disabled:opacity-60"
      >
        {isUpdating ? "..." : t("pwa.updateAction")}
      </button>
      <button type="button" onClick={dismissUpdate} className="shrink-0 rounded-[14px] px-2 py-2 text-sm font-extrabold text-[#7a7166]" aria-label={t("settings.close")}>
        ×
      </button>
    </div>
  );
}
