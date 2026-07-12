"use client";

import type { Plant } from "@/types/plant";
import { plantCommonName, plantDisplayName } from "@/lib/plant-display";
import { PhotoImage } from "./PhotoImage";

export function PlantHeroImage({ plant, coverPhotoUrl }: { plant: Plant; coverPhotoUrl: string }) {
  const displayName = plantDisplayName(plant, plantCommonName(plant));
  return (
    <div className="relative h-[340px] overflow-hidden rounded-[30px] bg-[#dde8dc] shadow-soft">
      <PhotoImage
        src={coverPhotoUrl}
        alt={displayName}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
