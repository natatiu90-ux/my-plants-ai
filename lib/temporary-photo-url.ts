export function isTemporaryPhotoUrl(url: string) {
  return url.startsWith("photo://");
}

export function temporaryPhotoStorageIdFromUrl(url: string) {
  return isTemporaryPhotoUrl(url) ? url.replace("photo://", "").split(/[?#]/)[0] : undefined;
}
