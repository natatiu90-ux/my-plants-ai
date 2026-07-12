import type { PhotoType } from "@/types/plant";

export type PendingPhotoUpload = {
  id: string;
  url: string;
  storageId: string;
  type: PhotoType;
  isCover: boolean;
};
