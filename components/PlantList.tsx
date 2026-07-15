"use client";

import type { Plant } from "@/types/plant";
import { usePlantStore } from "@/data/PlantStore";
import { PlantCard } from "./PlantCard";

export function PlantList({ plants }: { plants: Plant[] }) {
  const { getCoverPhoto, getPlantHypothesisResolutions, secondaryDataReady } = usePlantStore();

  return (
    <section className="flex flex-col gap-4 px-5 pt-6">
      {plants.map((plant) => {
        const coverPhoto = getCoverPhoto(plant.id);
        return (
          <PlantCard
            key={plant.id}
            plant={plant}
            hypothesisResolutions={getPlantHypothesisResolutions(plant.id)}
            isCareDataReady={secondaryDataReady}
            coverPhotoUrl={coverPhoto?.thumbnailUrl ?? coverPhoto?.url ?? "/plants/martha.png"}
          />
        );
      })}
    </section>
  );
}
