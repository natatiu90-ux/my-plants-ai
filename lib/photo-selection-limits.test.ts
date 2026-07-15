import { selectFilesWithinPhotoLimit } from "@/lib/photo-selection-limits";

const oneToThree = selectFilesWithinPhotoLimit(["a", "b", "c"], 0, 3);
if (oneToThree.acceptedFiles.length !== 3 || oneToThree.rejectedForLimit !== 0) {
  throw new Error("Expected 1-3 initial photos to be accepted.");
}

const fivePhotos = selectFilesWithinPhotoLimit(["a", "b", "c", "d", "e"], 0, 3);
if (fivePhotos.acceptedFiles.length !== 3 || fivePhotos.rejectedForLimit !== 2) {
  throw new Error("Expected five initial photos to be limited to three.");
}

const oneSlotAvailable = selectFilesWithinPhotoLimit(["d", "e"], 2, 3);
if (oneSlotAvailable.acceptedFiles.length !== 1 || oneSlotAvailable.rejectedForLimit !== 1) {
  throw new Error("Expected removing one photo to make exactly one slot available.");
}

const noLimit = selectFilesWithinPhotoLimit(["a", "b", "c", "d"], 0);
if (noLimit.acceptedFiles.length !== 4 || noLimit.rejectedForLimit !== 0) {
  throw new Error("Expected post-creation gallery flows without maxPhotos to remain unlimited.");
}
