"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Home, MapPin, Plus, Trash2 } from "lucide-react";
import type { HomeContext, Room } from "@/types/plant";
import { useI18n } from "@/i18n/I18nProvider";
import { usePlantStore } from "@/data/PlantStore";
import { buildLegacyRoomImportGroups, dedupeImportGroups, shouldOfferExistingHomeImport, type LegacyRoomImportGroup } from "@/lib/home-room-context";
import { detectCityFromCoordinates, getBrowserPosition, searchCities, type CitySuggestion } from "@/lib/location-service";

const lightOptions: NonNullable<Room["lightLevel"]>[] = ["low", "medium_indirect", "bright_indirect", "direct_sun", "unknown"];
const sunOptions: NonNullable<Room["directSun"]>[] = ["none", "morning", "afternoon", "all_day", "unknown"];
const tempOptions: NonNullable<Room["temperatureRelative"]>[] = ["cool", "stable", "warm", "variable", "unknown"];
const acOptions: NonNullable<Room["hasAirConditioning"]>[] = ["inherit", "yes", "no", "unknown"];
const humidityOptions: NonNullable<HomeContext["humidityLevel"]>[] = ["dry", "normal", "humid", "unknown"];
const homeTypeOptions: NonNullable<HomeContext["type"]>[] = ["apartment", "house", "studio", "other"];

type Draft = {
  name: string;
  city: string;
  country: string;
  type: string;
  humidityLevel: string;
  hasAirConditioning: string;
  notes: string;
};

type RoomDraft = {
  id: string;
  name: string;
  lightLevel: string;
  directSun: string;
  temperatureRelative: string;
  hasAirConditioning: string;
  notes: string;
};

const emptyHomeDraft: Draft = { name: "", city: "", country: "", type: "", humidityLevel: "", hasAirConditioning: "", notes: "" };
const emptyRoomDraft: RoomDraft = { id: "", name: "", lightLevel: "", directSun: "", temperatureRelative: "", hasAirConditioning: "inherit", notes: "" };

function homeToDraft(home: HomeContext): Draft {
  return {
    name: home.name,
    city: home.city ?? "",
    country: home.country ?? "",
    type: home.type ?? "",
    humidityLevel: home.humidityLevel ?? "",
    hasAirConditioning: home.hasAirConditioning == null ? "" : home.hasAirConditioning ? "yes" : "no",
    notes: home.notes ?? ""
  };
}

function roomToDraft(room: Room): RoomDraft {
  return {
    id: room.id,
    name: room.name,
    lightLevel: room.lightLevel ?? "",
    directSun: room.directSun ?? "",
    temperatureRelative: room.temperatureRelative ?? "",
    hasAirConditioning: room.hasAirConditioning ?? "inherit",
    notes: room.notes ?? ""
  };
}

function homeInputFromDraft(draft: Draft, defaultName: string): Omit<HomeContext, "id" | "createdAt"> {
  return {
    name: draft.name.trim() || defaultName,
    city: draft.city.trim() || undefined,
    country: draft.country.trim() || undefined,
    type: (draft.type || undefined) as HomeContext["type"],
    humidityLevel: (draft.humidityLevel || undefined) as HomeContext["humidityLevel"],
    hasAirConditioning: draft.hasAirConditioning ? draft.hasAirConditioning === "yes" : undefined,
    notes: draft.notes.trim() || undefined
  };
}

export function HomeRoomSettings() {
  const { t } = useI18n();
  const { addHome, addRoom, createFirstHomeWithLegacyImport, deleteHome, deleteRoom, homes, importLegacyPlantsToHome, plants, rooms, updateHome, updateRoom } = usePlantStore();
  const [selectedHomeId, setSelectedHomeId] = useState<string | null>(null);
  const [homeDraft, setHomeDraft] = useState<Draft>(emptyHomeDraft);
  const [roomDraft, setRoomDraft] = useState<RoomDraft>(emptyRoomDraft);
  const [mode, setMode] = useState<"list" | "home" | "edit_home" | "edit_room" | "first_import" | "import_existing">("list");
  const [isSaving, setIsSaving] = useState(false);
  const [importGroups, setImportGroups] = useState<LegacyRoomImportGroup[]>([]);
  const [locationQuery, setLocationQuery] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<CitySuggestion[]>([]);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const selectedHome = selectedHomeId ? homes.find((home) => home.id === selectedHomeId) : null;
  const selectedRooms = selectedHome ? rooms.filter((room) => room.homeId === selectedHome.id) : [];
  const unassignedPlants = plants.filter((plant) => !plant.homeId);

  useEffect(() => {
    const controller = new AbortController();
    const trimmed = locationQuery.trim();
    if (trimmed.length < 2 || trimmed === [homeDraft.city, homeDraft.country].filter(Boolean).join(", ")) {
      setLocationSuggestions([]);
      return () => controller.abort();
    }
    const timer = window.setTimeout(() => {
      searchCities(trimmed, controller.signal)
        .then(setLocationSuggestions)
        .catch(() => setLocationSuggestions([]));
    }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [homeDraft.city, homeDraft.country, locationQuery]);

  const startCreateHome = () => {
    setHomeDraft(emptyHomeDraft);
    if (!homes.length && plants.length) {
      const inferred = buildLegacyRoomImportGroups({
        plants,
        rooms,
        translateRoomKey: (roomKey) => t(roomKey as never)
      });
      setImportGroups(inferred.rooms);
      setMode("first_import");
    } else {
      setMode("edit_home");
    }
  };

  const startExistingHomeImport = () => {
    if (!selectedHome) return;
    const inferred = buildLegacyRoomImportGroups({
      plants: unassignedPlants,
      rooms,
      translateRoomKey: (roomKey) => t(roomKey as never)
    });
    setImportGroups(inferred.rooms);
    setMode("import_existing");
  };

  const detectLocation = async () => {
    setLocationMessage(null);
    try {
      const position = await getBrowserPosition();
      const city = await detectCityFromCoordinates(position.coords.latitude, position.coords.longitude);
      setHomeDraft((draft) => ({ ...draft, city: city.city, country: city.country }));
      setLocationQuery(city.label);
      setLocationMessage(t("homeContext.locationDetected"));
    } catch {
      setLocationMessage(t("homeContext.locationUnavailable"));
    }
  };

  const saveHome = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const input = homeInputFromDraft(homeDraft, t("homeContext.defaultHomeName"));
      if (mode === "first_import") {
        const homeId = await createFirstHomeWithLegacyImport(input, dedupeImportGroups(importGroups));
        setSelectedHomeId(homeId);
        setMode("home");
      } else if (mode === "import_existing" && selectedHome) {
        const homeId = await importLegacyPlantsToHome(selectedHome.id, dedupeImportGroups(importGroups));
        setSelectedHomeId(homeId);
        setMode("home");
      } else if (selectedHome) {
        const home = await updateHome(selectedHome.id, input);
        setSelectedHomeId(home.id);
        setMode("home");
      } else {
        const home = await addHome(input);
        setSelectedHomeId(home.id);
        setMode("home");
      }
      setHomeDraft(emptyHomeDraft);
      setLocationQuery("");
    } finally {
      setIsSaving(false);
    }
  };

  const saveRoom = async () => {
    if (!selectedHome || isSaving || !roomDraft.name.trim()) return;
    setIsSaving(true);
    try {
      const input = {
        homeId: selectedHome.id,
        lightLevel: (roomDraft.lightLevel || undefined) as Room["lightLevel"],
        directSun: (roomDraft.directSun || undefined) as Room["directSun"],
        temperatureRelative: (roomDraft.temperatureRelative || undefined) as Room["temperatureRelative"],
        hasAirConditioning: (roomDraft.hasAirConditioning || "inherit") as Room["hasAirConditioning"],
        notes: roomDraft.notes.trim() || undefined
      };
      if (roomDraft.id) {
        await updateRoom(roomDraft.id, { name: roomDraft.name.trim(), ...input });
      } else {
        await addRoom(roomDraft.name.trim(), input);
      }
      setRoomDraft(emptyRoomDraft);
      setMode("home");
    } finally {
      setIsSaving(false);
    }
  };

  const homeForm = (
    <div className="grid gap-3 rounded-[22px] bg-white/70 p-3">
      <input value={homeDraft.name} onChange={(event) => setHomeDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder={t("homeContext.homeName")} className="min-h-11 rounded-[16px] bg-white px-3 text-base outline-none" />
      <div className="rounded-[18px] bg-white p-3">
        <p className="text-sm font-extrabold text-[#4f4940]">{t("homeContext.location")}</p>
        <button type="button" onClick={() => void detectLocation()} className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-[15px] bg-[#ddf2dc] px-3 text-sm font-extrabold text-[#2d7a4f]">
          <MapPin aria-hidden="true" size={16} />
          {t("homeContext.detectLocation")}
        </button>
        <input value={locationQuery} onChange={(event) => setLocationQuery(event.target.value)} placeholder={t("homeContext.searchCity")} className="mt-2 min-h-11 w-full rounded-[15px] bg-[#fffaf3] px-3 text-base outline-none" />
        {locationSuggestions.length ? (
          <div className="mt-2 grid gap-1">
            {locationSuggestions.map((suggestion) => (
              <button key={suggestion.id} type="button" onClick={() => {
                setHomeDraft((draft) => ({ ...draft, city: suggestion.city, country: suggestion.country }));
                setLocationQuery(suggestion.label);
                setLocationSuggestions([]);
              }} className="min-h-10 rounded-[14px] bg-[#fffaf3] px-3 text-left text-sm font-bold text-[#565149]">
                {suggestion.label}
              </button>
            ))}
          </div>
        ) : null}
        {homeDraft.city || homeDraft.country ? <p className="mt-2 text-sm font-bold text-[#6f675c]">{[homeDraft.city, homeDraft.country].filter(Boolean).join(", ")}</p> : null}
        {locationMessage ? <p className="mt-2 text-sm font-bold text-[#6f675c]">{locationMessage}</p> : null}
      </div>
      <select value={homeDraft.type} onChange={(event) => setHomeDraft((draft) => ({ ...draft, type: event.target.value }))} className="min-h-11 rounded-[16px] bg-white px-3 text-base outline-none">
        <option value="">{t("homeContext.homeType")}</option>
        {homeTypeOptions.map((option) => <option key={option} value={option}>{t(`homeContext.homeType.${option}` as never)}</option>)}
      </select>
      <select value={homeDraft.humidityLevel} onChange={(event) => setHomeDraft((draft) => ({ ...draft, humidityLevel: event.target.value }))} className="min-h-11 rounded-[16px] bg-white px-3 text-base outline-none">
        <option value="">{t("homeContext.humidity")}</option>
        {humidityOptions.map((option) => <option key={option} value={option}>{t(`homeContext.humidity.${option}` as never)}</option>)}
      </select>
    </div>
  );

  if (mode === "first_import" || mode === "import_existing") {
    const plantsWithoutRoom = unassignedPlants.filter((plant) => !plant.roomId && !plant.roomKey).length;
    const isExistingImport = mode === "import_existing";
    return (
      <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
        <button type="button" onClick={() => setMode(isExistingImport ? "home" : "list")} className="mb-3 flex min-h-10 items-center gap-2 rounded-[16px] bg-white/75 px-3 text-sm font-extrabold text-[#6f675c]">
          <ChevronLeft aria-hidden="true" size={17} />
          {t("settings.back")}
        </button>
        <h2 className="font-rounded text-xl font-extrabold text-ink">{t("homeContext.importTitle")}</h2>
        <p className="mt-2 text-sm font-bold leading-5 text-[#7a7166]">{t("homeContext.importDescription")}</p>
        {!isExistingImport ? <div className="mt-4">{homeForm}</div> : null}
        <div className="mt-4 grid gap-2">
          {importGroups.map((group, index) => (
            <div key={group.id} className="rounded-[20px] bg-white/70 p-3">
              <div className="flex items-center gap-2">
                <input value={group.name} onChange={(event) => setImportGroups((groups) => groups.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} className="min-h-10 min-w-0 flex-1 rounded-[14px] bg-white px-3 text-base font-bold outline-none" />
                <button type="button" onClick={() => setImportGroups((groups) => groups.map((item, itemIndex) => itemIndex === index ? { ...item, include: !item.include } : item))} className="min-h-10 rounded-[14px] bg-[#f1eadf] px-3 text-xs font-extrabold text-[#6f675c]">
                  {group.include ? t("homeContext.includeRoom") : t("homeContext.skipRoom")}
                </button>
              </div>
              <p className="mt-2 text-xs font-bold text-[#9a9286]">{t("rooms.plantCount").replace("{count}", String(group.plantIds.length))}</p>
            </div>
          ))}
          <button type="button" onClick={() => setImportGroups((groups) => [...groups, { id: `new-${Date.now()}`, legacyKey: null, name: t("rooms.roomName"), plantIds: [], include: true }])} className="min-h-11 rounded-[16px] bg-white/75 px-3 text-sm font-extrabold text-[#2d7a4f]">
            {t("homeContext.addAnotherRoom")}
          </button>
          <p className="rounded-[18px] bg-white/70 p-3 text-sm font-bold text-[#6f675c]">{t("homeContext.plantsWithoutRoom").replace("{count}", String(plantsWithoutRoom))}</p>
        </div>
        <button type="button" onClick={() => void saveHome()} disabled={isSaving} className="mt-4 min-h-12 w-full rounded-[18px] bg-[#2d7a4f] px-4 text-sm font-extrabold text-white disabled:opacity-60">
          {isExistingImport ? t("homeContext.importIntoExistingHome") : t("homeContext.createAndImport")}
        </button>
      </section>
    );
  }

  if (mode === "edit_home") {
    return (
      <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
        <button type="button" onClick={() => setMode(selectedHome ? "home" : "list")} className="mb-3 flex min-h-10 items-center gap-2 rounded-[16px] bg-white/75 px-3 text-sm font-extrabold text-[#6f675c]">
          <ChevronLeft aria-hidden="true" size={17} />
          {t("settings.back")}
        </button>
        <h2 className="font-rounded text-xl font-extrabold text-ink">{selectedHome ? t("homeContext.editHome") : t("homeContext.addHome")}</h2>
        <div className="mt-4">{homeForm}</div>
        <button type="button" onClick={() => void saveHome()} disabled={isSaving} className="mt-4 min-h-12 w-full rounded-[18px] bg-[#ddf2dc] px-4 text-sm font-extrabold text-[#2d7a4f] disabled:opacity-60">
          {t("homeContext.saveHome")}
        </button>
      </section>
    );
  }

  if (mode === "edit_room" && selectedHome) {
    return (
      <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
        <button type="button" onClick={() => setMode("home")} className="mb-3 flex min-h-10 items-center gap-2 rounded-[16px] bg-white/75 px-3 text-sm font-extrabold text-[#6f675c]">
          <ChevronLeft aria-hidden="true" size={17} />
          {t("settings.back")}
        </button>
        <h2 className="font-rounded text-xl font-extrabold text-ink">{roomDraft.id ? t("homeContext.editRoom") : t("homeContext.addRoom")}</h2>
        <div className="mt-4 grid gap-2 rounded-[22px] bg-white/70 p-3">
          <input value={roomDraft.name} onChange={(event) => setRoomDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder={t("rooms.roomName")} className="min-h-11 rounded-[16px] bg-white px-3 text-base outline-none" />
          <select value={roomDraft.lightLevel} onChange={(event) => setRoomDraft((draft) => ({ ...draft, lightLevel: event.target.value }))} className="min-h-11 rounded-[16px] bg-white px-3 text-base outline-none">
            <option value="">{t("homeContext.lightLevel")}</option>
            {lightOptions.map((option) => <option key={option} value={option}>{t(`homeContext.light.${option}` as never)}</option>)}
          </select>
          <select value={roomDraft.directSun} onChange={(event) => setRoomDraft((draft) => ({ ...draft, directSun: event.target.value }))} className="min-h-11 rounded-[16px] bg-white px-3 text-base outline-none">
            <option value="">{t("homeContext.directSun")}</option>
            {sunOptions.map((option) => <option key={option} value={option}>{t(`homeContext.sun.${option}` as never)}</option>)}
          </select>
          <select value={roomDraft.temperatureRelative} onChange={(event) => setRoomDraft((draft) => ({ ...draft, temperatureRelative: event.target.value }))} className="min-h-11 rounded-[16px] bg-white px-3 text-base outline-none">
            <option value="">{t("homeContext.temperature")}</option>
            {tempOptions.map((option) => <option key={option} value={option}>{t(`homeContext.temperature.${option}` as never)}</option>)}
          </select>
          <select value={roomDraft.hasAirConditioning} onChange={(event) => setRoomDraft((draft) => ({ ...draft, hasAirConditioning: event.target.value }))} className="min-h-11 rounded-[16px] bg-white px-3 text-base outline-none">
            {acOptions.map((option) => <option key={option} value={option}>{t(`homeContext.ac.${option}` as never)}</option>)}
          </select>
          <textarea value={roomDraft.notes} onChange={(event) => setRoomDraft((draft) => ({ ...draft, notes: event.target.value }))} placeholder={t("homeContext.roomNotes")} className="min-h-20 rounded-[16px] bg-white px-3 py-3 text-base outline-none" />
        </div>
        <button type="button" onClick={() => void saveRoom()} disabled={isSaving || !roomDraft.name.trim()} className="mt-4 min-h-12 w-full rounded-[18px] bg-[#ddf2dc] px-4 text-sm font-extrabold text-[#2d7a4f] disabled:opacity-60">
          {roomDraft.id ? t("homeContext.saveRoom") : t("homeContext.addRoom")}
        </button>
      </section>
    );
  }

  if (mode === "home" && selectedHome) {
    const plantCount = plants.filter((plant) => plant.homeId === selectedHome.id).length;
    return (
      <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
        <button type="button" onClick={() => setMode("list")} className="mb-3 flex min-h-10 items-center gap-2 rounded-[16px] bg-white/75 px-3 text-sm font-extrabold text-[#6f675c]">
          <ChevronLeft aria-hidden="true" size={17} />
          {t("settings.back")}
        </button>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-rounded text-xl font-extrabold text-ink">{selectedHome.name}</h2>
            <p className="mt-1 text-sm font-bold text-[#7a7166]">{[selectedHome.city, selectedHome.country].filter(Boolean).join(", ") || t("homeContext.locationNotSet")}</p>
            <p className="mt-1 text-xs font-bold text-[#9a9286]">{t("homeContext.homePlantCount").replace("{count}", String(plantCount))}</p>
          </div>
          <button type="button" onClick={() => { setHomeDraft(homeToDraft(selectedHome)); setMode("edit_home"); }} className="min-h-10 rounded-[15px] bg-[#ddf2dc] px-3 text-sm font-extrabold text-[#2d7a4f]">
            {t("homeContext.editHome")}
          </button>
        </div>

        <h3 className="mt-5 px-1 font-rounded text-lg font-extrabold text-ink">{t("homeContext.rooms")}</h3>
        {shouldOfferExistingHomeImport({ homes, plants, homeId: selectedHome.id }) ? (
          <button type="button" onClick={startExistingHomeImport} className="mt-4 min-h-11 w-full rounded-[16px] bg-[#ddf2dc] px-3 text-sm font-extrabold text-[#2d7a4f]">
            {t("homeContext.addExistingPlants")}
          </button>
        ) : null}
        <div className="mt-2 grid gap-2">
          {selectedRooms.map((room) => {
            const count = plants.filter((plant) => plant.roomId === room.id || plant.roomKey === room.id).length;
            return (
              <div key={room.id} className="flex items-center justify-between gap-2 rounded-[20px] bg-white/70 p-3">
                <button type="button" onClick={() => { setRoomDraft(roomToDraft(room)); setMode("edit_room"); }} className="min-w-0 flex-1 text-left">
                  <p className="truncate font-bold text-[#565149]">{room.name}</p>
                  <p className="text-xs font-bold text-[#9a9286]">{t("rooms.plantCount").replace("{count}", String(count))}</p>
                </button>
                <button type="button" onClick={() => void deleteRoom(room.id)} aria-label={t("rooms.deleteRoom")} className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#fdeaf0] text-[#9b2c3e]">
                  <Trash2 aria-hidden="true" size={17} />
                </button>
              </div>
            );
          })}
        </div>
        <button type="button" onClick={() => { setRoomDraft(emptyRoomDraft); setMode("edit_room"); }} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-[16px] bg-white/75 px-3 text-sm font-extrabold text-[#2d7a4f]">
          <Plus aria-hidden="true" size={17} />
          {t("homeContext.addRoom")}
        </button>
        <button type="button" onClick={() => void deleteHome(selectedHome.id)} disabled={isSaving} className="mt-5 min-h-11 w-full rounded-[16px] bg-[#fdeaf0] px-3 text-sm font-extrabold text-[#9b2c3e] disabled:opacity-60">
          {t("homeContext.deleteHome")}
        </button>
      </section>
    );
  }

  return (
    <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#eef5e8] text-[#3f7d4f]">
          <Home aria-hidden="true" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-rounded text-xl font-extrabold text-ink">{t("homeContext.myHomes")}</h2>
          <p className="mt-1 text-sm font-bold leading-5 text-[#8b8173]">{t("homeContext.settingsDescription")}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        {homes.map((home) => {
          const roomCount = rooms.filter((room) => room.homeId === home.id).length;
          return (
            <button key={home.id} type="button" onClick={() => { setSelectedHomeId(home.id); setMode("home"); }} className="flex min-h-[58px] items-center justify-between gap-3 rounded-[22px] bg-white/70 px-3 text-left">
              <div className="min-w-0">
                <p className="truncate font-bold text-[#565149]">{home.name}</p>
                <p className="text-xs font-bold text-[#9a9286]">{t("homeContext.roomCount").replace("{count}", String(roomCount))}</p>
              </div>
              <span className="text-sm font-extrabold text-[#2d7a4f]">{t("homeContext.openHome")}</span>
            </button>
          );
        })}
      </div>
      {unassignedPlants.length > 0 && homes.length > 0 ? (
        <p className="mt-3 rounded-[18px] bg-white/70 p-3 text-sm font-bold text-[#6f675c]">{t("homeContext.unassignedPlants").replace("{count}", String(unassignedPlants.length))}</p>
      ) : null}
      <button type="button" onClick={startCreateHome} disabled={isSaving} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-[16px] bg-[#ddf2dc] px-3 text-sm font-extrabold text-[#2d7a4f] disabled:opacity-60">
        <Plus aria-hidden="true" size={17} />
        {t("homeContext.addHome")}
      </button>
    </section>
  );
}
