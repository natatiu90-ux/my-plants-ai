"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { appBuildStorageKey, appBuildVersion, isStandalonePwa } from "@/lib/app-version";
import { PhotoStorageRepository, temporaryPhotoSchemaVersion } from "@/lib/photo-storage";

export function ServiceWorkerRegistration() {
  const { t } = useI18n();
  const [isUpdateReady, setIsUpdateReady] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || window.location.protocol !== "https:" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      return;
    }

    let hasReloadedForControllerChange = false;
    const previousVersion = window.localStorage.getItem(appBuildStorageKey);
    const shouldClearDisposablePhotos = !previousVersion || previousVersion !== appBuildVersion;

    if (shouldClearDisposablePhotos) {
      void PhotoStorageRepository.clearTemporaryPhotos()
        .catch((error) => {
          console.info("temporary_photo_version_cleanup_failed", {
            message: error instanceof Error ? error.message : "Unknown error"
          });
        })
        .finally(() => {
          window.localStorage.setItem(appBuildStorageKey, appBuildVersion);
          if (previousVersion) {
            setIsUpdateReady(true);
          }
        });
    } else {
      window.localStorage.setItem(appBuildStorageKey, appBuildVersion);
    }

    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(appBuildVersion)}`).then((registration) => {
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
          serviceWorkerInstalling: registration.installing?.scriptURL ?? null,
          serviceWorkerWaiting: registration.waiting?.scriptURL ?? null,
          serviceWorkerActive: registration.active?.scriptURL ?? null,
          activeCacheNames: cacheNames,
          temporaryPhotoSchemaVersion,
          temporaryPhotoCount: temporaryPhotoIds.length
        });
      };

      void reportDiagnostics();

      if (registration.waiting) {
        setWaitingWorker(registration.waiting);
        setIsUpdateReady(true);
      }

      registration.addEventListener("updatefound", () => {
        const nextWorker = registration.installing;
        if (!nextWorker) {
          return;
        }

        nextWorker.addEventListener("statechange", () => {
          if (nextWorker.state === "installed" && navigator.serviceWorker.controller) {
            setWaitingWorker(nextWorker);
            setIsUpdateReady(true);
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
      if (window.sessionStorage.getItem("my-plants-update-requested") === "1") {
        window.sessionStorage.removeItem("my-plants-update-requested");
        window.location.reload();
        return;
      }

      setIsUpdateReady(true);
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  const updateApp = () => {
    window.sessionStorage.setItem("my-plants-update-requested", "1");

    if (waitingWorker) {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
      return;
    }

    window.location.reload();
  };

  if (!isUpdateReady) {
    return null;
  }

  return (
    <div className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+16px)] z-[70] mx-auto flex max-w-[390px] items-center gap-3 rounded-[20px] bg-[#fffaf3] p-3 shadow-[0_14px_40px_rgba(0,0,0,0.16)]">
      <p className="min-w-0 flex-1 text-sm font-extrabold leading-5 text-[#3f3b35]">{t("pwa.updateReady")}</p>
      <button type="button" onClick={updateApp} className="shrink-0 rounded-[14px] bg-[#ddf2dc] px-3 py-2 text-sm font-extrabold text-[#2d7a4f]">
        {t("pwa.updateAction")}
      </button>
    </div>
  );
}
