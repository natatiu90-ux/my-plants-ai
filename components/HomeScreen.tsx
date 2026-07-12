"use client";

import { useMemo, useState } from "react";
import { AttentionBanner } from "./AttentionBanner";
import { FloatingAddButton } from "./FloatingAddButton";
import { HomeHeader } from "./HomeHeader";
import { PlantList } from "./PlantList";
import { AddPlantWizard } from "./AddPlantWizard";
import { countPlantsNeedingAttention, sortPlantsByPriority } from "@/data/mockPlants";
import { usePlantStore } from "@/data/PlantStore";

export function HomeScreen() {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const { plants: storedPlants } = usePlantStore();
  const plants = useMemo(() => sortPlantsByPriority(storedPlants), [storedPlants]);
  const attentionCount = useMemo(() => countPlantsNeedingAttention(storedPlants), [storedPlants]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-[430px] bg-cream">
      <HomeHeader />
      <AttentionBanner count={attentionCount} />
      <div className="pb-[144px]">
        <PlantList plants={plants} />
      </div>
      <FloatingAddButton onClick={() => setIsAddOpen(true)} />
      {isAddOpen ? <AddPlantWizard onClose={() => setIsAddOpen(false)} /> : null}
    </main>
  );
}
