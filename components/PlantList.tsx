"use client";

import type { Plant } from "@/types/plant";
import { usePlantStore } from "@/data/PlantStore";
import { PlantCard } from "./PlantCard";

export function PlantList({ plants }: { plants: Plant[] }) {
  const { getCoverPhoto } = usePlantStore();

  return (
    <section className="flex flex-col gap-4 px-5 pt-6">
      {plants.map((plant) => (
        <PlantCard key={plant.id} plant={plant} coverPhotoUrl={getCoverPhoto(plant.id)?.url ?? "/plants/martha.png"} />
      ))}
    </section>
  );
}
