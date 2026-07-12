import type { PhotoType } from "@/types/plant";

export type PendingPhotoUpload = {
  id: string;
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
  type: PhotoType;
  isCover: boolean;
};
