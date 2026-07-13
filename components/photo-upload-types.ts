import type { PhotoType } from "@/types/plant";

export type PendingPhotoUpload = {
  id: string;
  debugId?: string;
  url: string;
  storageId: string;
  source: "camera" | "gallery";
  originalName: string;
  originalType: string;
  originalSize: number;
  originalExtension: string | null;
  decode: {
    succeeded: boolean;
    width: number | null;
    height: number | null;
  };
  orientation: {
    exifOrientation: number | null;
    orientationSource: "raw_pixels" | "browser_display" | "unknown";
    physicallyRotated: boolean;
    storedWidth: number | null;
    storedHeight: number | null;
    displayedWidth: number | null;
    displayedHeight: number | null;
  };
  type: PhotoType;
  isCover: boolean;
};
