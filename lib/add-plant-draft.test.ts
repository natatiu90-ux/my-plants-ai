import type { AddPlantDraft } from "@/lib/add-plant-draft";

const interruptedAnalysisDraft: AddPlantDraft = {
  draftId: "draft-1",
  step: "analysis",
  selectedPhotos: [
    {
      id: "local-photo-1",
      storageId: "local-photo-1",
      source: "gallery",
      originalName: "plant.jpg",
      originalType: "image/jpeg",
      originalSize: 320000,
      originalExtension: "jpg",
      decode: { succeeded: true, width: 1200, height: 1600 },
      orientation: {
        exifOrientation: 1,
        orientationSource: "browser_display",
        physicallyRotated: true,
        storedWidth: 1200,
        storedHeight: 1600,
        displayedWidth: 1200,
        displayedHeight: 1600
      },
      type: "overview",
      isCover: true
    }
  ],
  analysisStatus: "requesting",
  analysisRequestId: "analysis-1",
  analysisStartedAt: "2026-07-15T10:00:00.000Z",
  analysisResult: null,
  analysisError: null,
  identifiedPlantDraft: {
    homeName: "Sprout",
    speciesName: "",
    scientificName: ""
  },
  updatedAt: "2026-07-15T10:00:01.000Z"
};

if (interruptedAnalysisDraft.step !== "analysis" || interruptedAnalysisDraft.analysisStatus !== "requesting") {
  throw new Error("Expected active analysis drafts to preserve the interrupted analysis state.");
}

if (interruptedAnalysisDraft.selectedPhotos[0].url) {
  throw new Error("Persisted add-plant drafts must not rely on object URLs.");
}
