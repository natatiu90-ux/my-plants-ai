"use client";

import type { DerivedCareActionState } from "@/lib/plant-action-eligibility";
import type { Plant } from "@/types/plant";
import { usePlantStore } from "@/data/PlantStore";
import { PlantCard } from "./PlantCard";

export function PlantList({
  plants,
  careActionByPlantId
}: {
  plants: Plant[];
  careActionByPlantId: Map<string, DerivedCareActionState>;
}) {
  const { getCoverPhoto } = usePlantStore();

  return (
    <section className="flex flex-col gap-4 px-5 pt-6">
      {plants.map((plant) => {
        const coverPhoto = getCoverPhoto(plant.id);
        const careAction = careActionByPlantId.get(plant.id);
        if (!careAction) {
          return null;
        }

        return (
          <PlantCard
            key={plant.id}
            plant={plant}
            careAction={careAction}
            coverPhotoUrl={coverPhoto?.thumbnailUrl ?? coverPhoto?.url ?? "/plants/martha.png"}
          />
        );
      })}
    </section>
  );
}
