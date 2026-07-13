"use client";

import { useEffect, useState } from "react";
import { PhotoStorageRepository } from "./photo-storage";

function storageIdFromPhotoUrl(url: string) {
  return url.replace("photo://", "").split(/[?#]/)[0];
}

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

      const blob = await PhotoStorageRepository.getPhoto(storageIdFromPhotoUrl(url));
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
