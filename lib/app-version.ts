"use client";

export const appBuildVersion = process.env.NEXT_PUBLIC_APP_BUILD_VERSION || "development";
export const appBuildStorageKey = "my-plants-app-build-version";

export function isStandalonePwa() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia("(display-mode: standalone)").matches || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}
