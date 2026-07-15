export function selectFilesWithinPhotoLimit<T>(files: T[], selectedCount: number, maxPhotos?: number) {
  if (typeof maxPhotos !== "number") {
    return {
      acceptedFiles: files,
      rejectedForLimit: 0,
      remainingSlots: Number.POSITIVE_INFINITY
    };
  }

  const remainingSlots = Math.max(0, maxPhotos - selectedCount);
  return {
    acceptedFiles: files.slice(0, remainingSlots),
    rejectedForLimit: Math.max(0, files.length - remainingSlots),
    remainingSlots
  };
}
