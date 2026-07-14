"use client";

import type { Plant } from "@/types/plant";
import { plantCommonName, plantDisplayName } from "@/lib/plant-display";
import { PhotoImage } from "./PhotoImage";

export function PlantHeroImage({ plant, coverPhotoUrl, onLoad }: { plant: Plant; coverPhotoUrl: string; onLoad?: () => void }) {
  const displayName = plantDisplayName(plant, plantCommonName(plant));
  return (
    <div className="relative h-[340px] overflow-hidden rounded-[30px] bg-[#dde8dc] shadow-soft">
      <PhotoImage
        src={coverPhotoUrl}
        alt={displayName}
        onLoad={onLoad}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
