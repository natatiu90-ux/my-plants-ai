"use client";

import { useState } from "react";
import { MultiPhotoPicker } from "./MultiPhotoPicker";
import { PhotoBatchReview } from "./PhotoBatchReview";
import type { PendingPhotoUpload } from "./photo-upload-types";

export function PhotoUploadFlow({
  title,
  hasExistingCover = true,
  onCancel,
  onSave
}: {
  title: string;
  hasExistingCover?: boolean;
  onCancel: () => void;
  onSave: (photos: PendingPhotoUpload[]) => void;
}) {
  const [photos, setPhotos] = useState<PendingPhotoUpload[] | null>(null);
  const [rejectedCount, setRejectedCount] = useState(0);

  if (!photos) {
    return (
      <MultiPhotoPicker
        title={title}
        onCancel={onCancel}
        onSelect={(selectedPhotos, rejectedFiles) => {
          setPhotos(selectedPhotos);
          setRejectedCount(rejectedFiles);
        }}
      />
    );
  }

  return (
    <PhotoBatchReview
      initialPhotos={photos}
      hasExistingCover={hasExistingCover}
      rejectedCount={rejectedCount}
      onCancel={onCancel}
      onSave={onSave}
    />
  );
}
