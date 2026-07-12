"use client";

import type { Plant } from "@/types/plant";
import { PhotoImage } from "./PhotoImage";

export function PlantHeroImage({ plant, coverPhotoUrl }: { plant: Plant; coverPhotoUrl: string }) {
  return (
    <div className="relative h-[340px] overflow-hidden rounded-[30px] bg-[#dde8dc] shadow-soft">
      <PhotoImage
        src={coverPhotoUrl}
        alt={`${plant.homeName ?? plant.speciesName}, ${plant.speciesName}`}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
