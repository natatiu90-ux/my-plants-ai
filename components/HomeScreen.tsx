"use client";

import { useEffect, useMemo, useState } from "react";
import { Leaf, Sprout, X } from "lucide-react";
import Link from "next/link";
import { AttentionBanner } from "./AttentionBanner";
import { FloatingAddButton } from "./FloatingAddButton";
import { HomeHeader } from "./HomeHeader";
import { HomeRoomSettings } from "./HomeRoomSettings";
import { PlantList } from "./PlantList";
import { AddPlantWizard } from "./AddPlantWizard";
import { Toast } from "./Toast";
import { usePlantStore } from "@/data/PlantStore";
import { useI18n } from "@/i18n/I18nProvider";
import { hasUnfinishedAddPlantDraft } from "@/lib/add-plant-draft";
import { buildLegacyRoomImportGroups, noHomeSelectionId, plantsForHomeScope, resolveSelectedHomeId, shouldOfferExistingHomeImport } from "@/lib/home-room-context";
import { deriveCareActionState, isDueCareActionState, type DerivedCareActionState } from "@/lib/plant-action-eligibility";
import type { HomeContext, Plant } from "@/types/plant";

const homeSetupDismissedKey = "my_plants_home_setup_dismissed_until";
const selectedHomeStoragePrefix = "my_plants_selected_home_";

function sortPlantsByPriority(plants: Plant[]) {
  const priority = { needs_attention: 0, check_soon: 1, unknown: 2, healthy: 3 };
  return [...plants].sort((a, b) => priority[a.status] - priority[b.status]);
}

function HomeSkeleton() {
  return (
    <section className="grid gap-4 px-5 pt-6">
      {[0, 1, 2].map((item) => (
        <div key={item} className="overflow-hidden rounded-[28px] border border-white/60 bg-[#fffaf3] shadow-soft">
          <div className="h-[204px] animate-pulse bg-[#e5dfd4]" />
          <div className="space-y-3 p-5">
            <div className="h-5 w-1/2 rounded-full bg-[#e5dfd4]" />
            <div className="h-4 w-3/4 rounded-full bg-[#eee7dc]" />
            <div className="h-4 w-2/3 rounded-full bg-[#eee7dc]" />
          </div>
        </div>
      ))}
    </section>
  );
}

function HomeEmptyState({ onAddPlant }: { onAddPlant: () => void }) {
  const { t } = useI18n();

  return (
    <section className="px-5 pt-10">
      <div className="rounded-[32px] bg-[#fffaf3] p-6 text-center shadow-soft">
        <div className="mx-auto flex h-28 w-28 items-end justify-center rounded-full bg-[#ddf2dc] pb-5 text-[#2d7a4f]">
          <div className="relative">
            <Sprout aria-hidden="true" size={58} strokeWidth={2.2} />
            <Leaf aria-hidden="true" size={22} className="absolute -right-5 top-5 rotate-12 text-[#6ba369]" />
          </div>
        </div>
        <h2 className="mt-6 font-rounded text-[28px] font-black leading-tight text-ink">{t("home.emptyTitle")}</h2>
        <p className="mt-3 text-[15px] font-bold leading-6 text-[#676157]">{t("home.emptyBody")}</p>
        <button
          type="button"
          onClick={onAddPlant}
          className="mt-6 min-h-12 w-full rounded-[18px] bg-gradient-to-br from-[#92cc90] to-[#6ba369] px-4 text-sm font-extrabold text-white shadow-fab"
        >
          {t("home.emptyCta")}
        </button>
      </div>
    </section>
  );
}

function HomeErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();

  return (
    <section className="px-5 pt-10">
      <div className="rounded-[28px] bg-[#fffaf3] p-5 text-center shadow-soft">
        <h2 className="font-rounded text-2xl font-extrabold text-ink">{t("home.loadError")}</h2>
        <button type="button" onClick={onRetry} className="mt-5 min-h-12 w-full rounded-[18px] bg-[#ddf2dc] px-4 text-sm font-extrabold text-[#2d7a4f]">
          {t("common.tryAgain")}
        </button>
      </div>
    </section>
  );
}

function HomeSetupCard({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useI18n();
  return (
    <section className="px-5 pt-5">
      <div className="rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
        <h2 className="font-rounded text-xl font-extrabold text-ink">{t("homeContext.setupTitle")}</h2>
        <p className="mt-2 text-sm font-bold leading-5 text-[#7a7166]">{t("homeContext.setupBody")}</p>
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Link href="/settings" className="flex min-h-11 items-center justify-center rounded-[16px] bg-[#ddf2dc] px-4 text-sm font-extrabold text-[#2d7a4f]">
            {t("homeContext.setupAction")}
          </Link>
          <button type="button" onClick={onDismiss} className="min-h-11 rounded-[16px] bg-white/75 px-4 text-sm font-extrabold text-[#7a7166]">
            {t("homeContext.later")}
          </button>
        </div>
      </div>
    </section>
  );
}

function HomeMigrationCard({
  onOpen,
  plantCount,
  roomCount
}: {
  onOpen: () => void;
  plantCount: number;
  roomCount: number;
}) {
  const { t } = useI18n();
  return (
    <section className="px-5 pt-5">
      <div className="rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
        <h2 className="font-rounded text-xl font-extrabold text-ink">{t("homeContext.finishSetupTitle")}</h2>
        <p className="mt-2 text-sm font-bold leading-5 text-[#7a7166]">
          {t("homeContext.finishSetupBody")
            .replace("{plantCount}", String(plantCount))
            .replace("{roomCount}", String(roomCount))}
        </p>
        <button
          type="button"
          onClick={onOpen}
          className="mt-4 min-h-11 w-full rounded-[16px] bg-[#ddf2dc] px-4 text-sm font-extrabold text-[#2d7a4f]"
        >
          {t("homeContext.finishSetupAction")}
        </button>
      </div>
    </section>
  );
}

export function HomeScreen() {
  const { t } = useI18n();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isHomeImportOpen, setIsHomeImportOpen] = useState(false);
  const [homeImportMessage, setHomeImportMessage] = useState<string | null>(null);
  const [isHomeSetupDismissed, setIsHomeSetupDismissed] = useState(false);
  const [selectedHomeId, setSelectedHomeId] = useState<string | null>(null);
  const { getPlantHypothesisResolutions, homes, plants: storedPlants, retry, rooms, secondaryDataReady, status, userId } = usePlantStore();
  const unassignedPlants = useMemo(() => storedPlants.filter((plant) => !plant.homeId), [storedPlants]);
  const singleHomePlantCount = homes.length === 1 ? storedPlants.filter((plant) => plant.homeId === homes[0].id).length : 0;
  const shouldPreferUnassignedScope = homes.length === 1 && singleHomePlantCount === 0 && unassignedPlants.length > 0;
  const shouldShowMigrationCard = isReadyHomeImportCandidate({ homes, plants: storedPlants, homeId: homes[0]?.id });
  const importSummary = useMemo(() => {
    if (!unassignedPlants.length) {
      return { rooms: [], plantsWithoutRoom: [] };
    }
    return buildLegacyRoomImportGroups({
      plants: unassignedPlants,
      rooms,
      translateRoomKey: (roomKey) => t(roomKey as never)
    });
  }, [rooms, t, unassignedPlants]);
  const selectedScope = useMemo(() => {
    if (!homes.length) return null;
    return resolveSelectedHomeId({
      storedHomeId: selectedHomeId,
      homes,
      hasUnassignedPlants: Boolean(unassignedPlants.length),
      shouldPreferUnassigned: shouldPreferUnassignedScope
    });
  }, [homes, selectedHomeId, shouldPreferUnassignedScope, unassignedPlants.length]);
  const scopedPlants = useMemo(() => {
    return plantsForHomeScope(storedPlants, selectedScope);
  }, [selectedScope, storedPlants]);
  const plants = useMemo(() => sortPlantsByPriority(scopedPlants), [scopedPlants]);
  const careActionByPlantId = useMemo(() => {
    const states = new Map<string, DerivedCareActionState>();
    scopedPlants.forEach((plant) => {
      states.set(
        plant.id,
        deriveCareActionState(plant, getPlantHypothesisResolutions(plant.id), new Date(), {
          isCareDataReady: secondaryDataReady
        })
      );
    });
    return states;
  }, [getPlantHypothesisResolutions, scopedPlants, secondaryDataReady]);
  const duePlantIds = useMemo(
    () =>
      scopedPlants
        .filter((plant) => {
          const careAction = careActionByPlantId.get(plant.id);
          return careAction ? isDueCareActionState(careAction) : false;
        })
        .map((plant) => plant.id),
    [careActionByPlantId, scopedPlants]
  );
  const attentionCount = duePlantIds.length;
  const isReady = status === "ready";
  useEffect(() => {
    if (hasUnfinishedAddPlantDraft()) {
      setIsAddOpen(true);
    }
    const dismissedUntil = Number(window.localStorage.getItem(homeSetupDismissedKey) ?? "0");
    setIsHomeSetupDismissed(dismissedUntil > Date.now());
  }, []);
  useEffect(() => {
    if (!userId || !homes.length) return;
    const key = `${selectedHomeStoragePrefix}${userId}`;
    const stored = window.localStorage.getItem(key);
    setSelectedHomeId(
      resolveSelectedHomeId({
        storedHomeId: stored,
        homes,
        hasUnassignedPlants: Boolean(unassignedPlants.length),
        shouldPreferUnassigned: shouldPreferUnassignedScope
      })
    );
  }, [homes, shouldPreferUnassignedScope, unassignedPlants.length, userId]);
  const chooseHome = (homeId: string) => {
    setSelectedHomeId(homeId);
    if (userId) {
      window.localStorage.setItem(`${selectedHomeStoragePrefix}${userId}`, homeId);
    }
  };
  const dismissHomeSetup = () => {
    window.localStorage.setItem(homeSetupDismissedKey, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    setIsHomeSetupDismissed(true);
  };
  const focusAttentionPlant = () => {
    const firstDuePlantId = duePlantIds[0];
    if (!firstDuePlantId) {
      return;
    }

    document.getElementById(`plant-card-${firstDuePlantId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const completeHomeImport = (homeId: string) => {
    chooseHome(homeId);
    setIsHomeImportOpen(false);
    setHomeImportMessage(t("homeContext.importSuccess"));
    window.setTimeout(() => setHomeImportMessage(null), 2600);
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-[430px] bg-cream">
      <HomeHeader />
      {homeImportMessage ? <Toast message={homeImportMessage} /> : null}
      {isReady && homes.length > 1 ? (
        <section className="px-5 pt-4">
          <label className="block rounded-[22px] bg-[#fffaf3] p-3 shadow-soft">
            <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#9a9286]">{t("homeContext.home")}</span>
            <select value={selectedScope ?? ""} onChange={(event) => chooseHome(event.target.value)} className="mt-1 min-h-10 w-full rounded-[15px] bg-white/75 px-3 text-base font-extrabold text-[#565149] outline-none">
              {homes.map((home) => (
                <option key={home.id} value={home.id}>{home.name}</option>
              ))}
              {unassignedPlants.length ? <option value={noHomeSelectionId}>{t("homeContext.noHomeGroup")}</option> : null}
            </select>
          </label>
        </section>
      ) : null}
      {isReady && homes.length === 1 && selectedScope === noHomeSelectionId && unassignedPlants.length ? (
        <section className="px-5 pt-4">
          <div className="rounded-[22px] bg-[#fffaf3] p-3 shadow-soft">
            <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#9a9286]">{t("homeContext.noHomeGroup")}</p>
            <button type="button" onClick={() => chooseHome(homes[0].id)} className="mt-2 min-h-10 w-full rounded-[16px] bg-white/75 px-4 text-sm font-extrabold text-[#2d7a4f]">
              {t("homeContext.showHome").replace("{home}", homes[0].name)}
            </button>
          </div>
        </section>
      ) : null}
      {isReady && plants.length > 0 ? <AttentionBanner count={attentionCount} onActivate={focusAttentionPlant} /> : null}
      <div className="pb-[144px]">
        {status === "loading" ? <HomeSkeleton /> : null}
        {status === "error" ? <HomeErrorState onRetry={() => void retry()} /> : null}
        {isReady && !homes.length && !isHomeSetupDismissed ? <HomeSetupCard onDismiss={dismissHomeSetup} /> : null}
        {isReady && shouldShowMigrationCard ? (
          <HomeMigrationCard
            plantCount={unassignedPlants.length}
            roomCount={importSummary.rooms.length}
            onOpen={() => setIsHomeImportOpen(true)}
          />
        ) : null}
        {isReady && plants.length === 0 && unassignedPlants.length === 0 ? <HomeEmptyState onAddPlant={() => setIsAddOpen(true)} /> : null}
        {isReady && plants.length > 0 ? <PlantList plants={plants} careActionByPlantId={careActionByPlantId} /> : null}
      </div>
      <FloatingAddButton onClick={() => setIsAddOpen(true)} />
      {isAddOpen ? <AddPlantWizard onClose={() => setIsAddOpen(false)} /> : null}
      {isHomeImportOpen && homes[0] ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1c1c1e]/20 px-4 pb-4 backdrop-blur-[2px] sm:items-center sm:pb-0">
          <div role="dialog" aria-modal="true" className="max-h-[calc(100dvh-24px)] w-full max-w-[430px] overflow-y-auto rounded-[30px] bg-cream p-4 shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setIsHomeImportOpen(false)}
                aria-label={t("plantDetail.cancel")}
                className="flex size-10 items-center justify-center rounded-2xl bg-white/85 text-[#6f675c]"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            <HomeRoomSettings
              initialImportHomeId={homes[0].id}
              onImported={completeHomeImport}
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}

function isReadyHomeImportCandidate(input: { homes: HomeContext[]; plants: Plant[]; homeId: string | undefined }) {
  return shouldOfferExistingHomeImport(input);
}
