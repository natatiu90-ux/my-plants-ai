"use client";

import { useEffect, useState } from "react";
import { PhotoStorageRepository } from "./photo-storage";
import { isTemporaryPhotoUrl, temporaryPhotoStorageIdFromUrl } from "./temporary-photo-url";

export function usePhotoUrl(url: string) {
  const [resolvedUrl, setResolvedUrl] = useState<string | undefined>(() => (isTemporaryPhotoUrl(url) ? undefined : url));

  useEffect(() => {
    let objectUrl: string | null = null;
    let isMounted = true;

    async function resolve() {
      if (!isTemporaryPhotoUrl(url)) {
        setResolvedUrl(url);
        return;
      }

      setResolvedUrl(undefined);
      const storageId = temporaryPhotoStorageIdFromUrl(url);
      const blob = storageId ? await PhotoStorageRepository.getPhoto(storageId) : null;
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
