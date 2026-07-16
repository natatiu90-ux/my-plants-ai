"use client";

import { useEffect, useRef, useState } from "react";
import { isStandalonePwa } from "@/lib/app-version";

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
  removeEventListener: (type: "release", listener: () => void) => void;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

export type WakeLockDiagnostic = {
  wakeLockSupported: boolean;
  wakeLockRequested: boolean;
  wakeLockAcquired: boolean;
  wakeLockReleased: boolean;
  wakeLockReleaseReason: string | null;
  wakeLockReacquireAttempted: boolean;
  wakeLockError: { name: string; message: string } | null;
  mode: "standalone" | "browser";
  visibilityState: DocumentVisibilityState;
};

function wakeLockSupported() {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

export function useScreenWakeLock(active: boolean) {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);
  const activeRef = useRef(active);
  const [diagnostic, setDiagnostic] = useState<WakeLockDiagnostic>(() => ({
    wakeLockSupported: typeof navigator !== "undefined" ? wakeLockSupported() : false,
    wakeLockRequested: false,
    wakeLockAcquired: false,
    wakeLockReleased: false,
    wakeLockReleaseReason: null,
    wakeLockReacquireAttempted: false,
    wakeLockError: null,
    mode: typeof window !== "undefined" && isStandalonePwa() ? "standalone" : "browser",
    visibilityState: typeof document !== "undefined" ? document.visibilityState : "visible"
  }));

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    let disposed = false;

    const updateDiagnostic = (patch: Partial<WakeLockDiagnostic>) => {
      setDiagnostic((current) => ({
        ...current,
        wakeLockSupported: wakeLockSupported(),
        mode: isStandalonePwa() ? "standalone" : "browser",
        visibilityState: document.visibilityState,
        ...patch
      }));
    };

    const releaseCurrent = async (reason: string) => {
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (!sentinel || sentinel.released) {
        updateDiagnostic({ wakeLockAcquired: false, wakeLockReleased: true, wakeLockReleaseReason: reason });
        return;
      }

      try {
        await sentinel.release();
      } catch {
        // Browser may have already released it.
      } finally {
        updateDiagnostic({ wakeLockAcquired: false, wakeLockReleased: true, wakeLockReleaseReason: reason });
      }
    };

    const requestWakeLock = async (isReacquire = false) => {
      if (!activeRef.current || document.visibilityState !== "visible") {
        return;
      }

      const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock;
      updateDiagnostic({
        wakeLockRequested: true,
        ...(isReacquire ? { wakeLockReacquireAttempted: true } : {}),
        wakeLockError: null
      });

      if (!wakeLock) {
        updateDiagnostic({
          wakeLockAcquired: false,
          wakeLockError: { name: "NotSupportedError", message: "Screen Wake Lock is not supported." }
        });
        return;
      }

      try {
        const sentinel = await wakeLock.request("screen");
        if (disposed || !activeRef.current) {
          await sentinel.release().catch(() => {});
          return;
        }

        const onRelease = () => {
          if (sentinelRef.current === sentinel) {
            sentinelRef.current = null;
          }
          updateDiagnostic({ wakeLockAcquired: false, wakeLockReleased: true, wakeLockReleaseReason: "sentinel_release" });
        };

        sentinel.addEventListener("release", onRelease);
        sentinelRef.current = sentinel;
        updateDiagnostic({ wakeLockAcquired: true, wakeLockReleased: false, wakeLockReleaseReason: null });
      } catch (error) {
        updateDiagnostic({
          wakeLockAcquired: false,
          wakeLockError: {
            name: error instanceof Error ? error.name : "WakeLockError",
            message: error instanceof Error ? error.message : "Wake lock request failed."
          }
        });
      }
    };

    const onVisibilityChange = () => {
      updateDiagnostic({});
      if (document.visibilityState === "visible" && activeRef.current && !sentinelRef.current) {
        void requestWakeLock(true);
      }
    };

    if (active) {
      void requestWakeLock(false);
    } else {
      void releaseCurrent("inactive");
    }

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void releaseCurrent("unmount");
    };
  }, [active]);

  return diagnostic;
}
