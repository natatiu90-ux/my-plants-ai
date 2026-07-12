"use client";

import { useEffect, useState } from "react";
import { PhotoStorageRepository } from "./photo-storage";

export function usePhotoUrl(url: string) {
  const [resolvedUrl, setResolvedUrl] = useState(url);

  useEffect(() => {
    let objectUrl: string | null = null;
    let isMounted = true;

    async function resolve() {
      if (!url.startsWith("photo://")) {
        setResolvedUrl(url);
        return;
      }

      const blob = await PhotoStorageRepository.getPhoto(url.replace("photo://", ""));
      if (!blob || !isMounted) {
        return;
      }

      objectUrl = URL.createObjectURL(blob);
      setResolvedUrl(objectUrl);
    }

    resolve();

    return () => {
      isMounted = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [url]);

  return resolvedUrl;
}
