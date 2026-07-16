"use client";

import { useState } from "react";
import { ChevronLeft, Home, Plus, Trash2 } from "lucide-react";
import type { HomeContext, Room } from "@/types/plant";
import { useI18n } from "@/i18n/I18nProvider";
import { usePlantStore } from "@/data/PlantStore";

const lightOptions: NonNullable<Room["lightLevel"]>[] = ["low", "medium_indirect", "bright_indirect", "direct_sun", "unknown"];
const sunOptions: NonNullable<Room["directSun"]>[] = ["none", "morning", "afternoon", "all_day", "unknown"];
const tempOptions: NonNullable<Room["temperatureRelative"]>[] = ["cool", "stable", "warm", "variable", "unknown"];
const acOptions: NonNullable<Room["hasAirConditioning"]>[] = ["inherit", "yes", "no", "unknown"];
const humidityOptions: NonNullable<HomeContext["humidityLevel"]>[] = ["dry", "normal", "humid", "unknown"];
const homeTypeOptions: NonNullable<HomeContext["type"]>[] = ["apartment", "house", "studio", "other"];

export function HomeRoomSettings() {
  const { t } = useI18n();
  const { addHome, addRoom, deleteHome, deleteRoom, homes, plants, rooms, updateHome, updateRoom } = usePlantStore();
  const [selectedHomeId, setSelectedHomeId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [homeDraft, setHomeDraft] = useState({ name: "", city: "", country: "", type: "", humidityLevel: "", hasAirConditioning: "", notes: "" });
  const [roomDraft, setRoomDraft] = useState({ id: "", name: "", lightLevel: "", directSun: "", temperatureRelative: "", hasAirConditioning: "inherit", notes: "" });
  const selectedHome = selectedHomeId ? homes.find((home) => home.id === selectedHomeId) : null;
  const selectedRooms = selectedHome ? rooms.filter((room) => room.homeId === selectedHome.id) : [];

  const resetRoomDraft = () => setRoomDraft({ id: "", name: "", lightLevel: "", directSun: "", temperatureRelative: "", hasAirConditioning: "inherit", notes: "" });

  const saveHome = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const input = {
        name: homeDraft.name.trim() || t("homeContext.defaultHomeName"),
        city: homeDraft.city.trim() || undefined,
        country: homeDraft.country.trim() || undefined,
        type: (homeDraft.type || undefined) as HomeContext["type"],
        humidityLevel: (homeDraft.humidityLevel || undefined) as HomeContext["humidityLevel"],
        hasAirConditioning: homeDraft.hasAirConditioning ? homeDraft.hasAirConditioning === "yes" : undefined,
        notes: homeDraft.notes.trim() || undefined
      };
      const home = selectedHome ? await updateHome(selectedHome.id, input) : await addHome(input);
      setSelectedHomeId(home.id);
      setHomeDraft({ name: "", city: "", country: "", type: "", humidityLevel: "", hasAirConditioning: "", notes: "" });
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
      resetRoomDraft();
    } finally {
      setIsSaving(false);
    }
  };

  if (selectedHome) {
    const plantCount = plants.filter((plant) => plant.homeId === selectedHome.id).length;
    return (
      <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
        <button type="button" onClick={() => setSelectedHomeId(null)} className="mb-3 flex min-h-10 items-center gap-2 rounded-[16px] bg-white/75 px-3 text-sm font-extrabold text-[#6f675c]">
          <ChevronLeft aria-hidden="true" size={17} />
          {t("settings.back")}
        </button>
        <h2 className="px-1 font-rounded text-xl font-extrabold text-ink">{selectedHome.name}</h2>
        <p className="mt-1 px-1 text-sm font-bold text-[#7a7166]">{t("homeContext.homePlantCount").replace("{count}", String(plantCount))}</p>

        <div className="mt-4 grid gap-3 rounded-[22px] bg-white/70 p-3">
          <input value={homeDraft.name} onChange={(event) => setHomeDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder={selectedHome.name} className="min-h-11 rounded-[16px] bg-white px-3 text-base outline-none" />
          <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
            <input value={homeDraft.city} onChange={(event) => setHomeDraft((draft) => ({ ...draft, city: event.target.value }))} placeholder={selectedHome.city ?? t("homeContext.city")} className="min-h-11 min-w-0 rounded-[16px] bg-white px-3 text-base outline-none" />
            <input value={homeDraft.country} onChange={(event) => setHomeDraft((draft) => ({ ...draft, country: event.target.value }))} placeholder={selectedHome.country ?? t("homeContext.country")} className="min-h-11 min-w-0 rounded-[16px] bg-white px-3 text-base outline-none" />
          </div>
          <select value={homeDraft.type} onChange={(event) => setHomeDraft((draft) => ({ ...draft, type: event.target.value }))} className="min-h-11 rounded-[16px] bg-white px-3 text-base outline-none">
            <option value="">{t("homeContext.homeType")}</option>
            {homeTypeOptions.map((option) => <option key={option} value={option}>{t(`homeContext.homeType.${option}` as never)}</option>)}
          </select>
          <select value={homeDraft.humidityLevel} onChange={(event) => setHomeDraft((draft) => ({ ...draft, humidityLevel: event.target.value }))} className="min-h-11 rounded-[16px] bg-white px-3 text-base outline-none">
            <option value="">{t("homeContext.humidity")}</option>
            {humidityOptions.map((option) => <option key={option} value={option}>{t(`homeContext.humidity.${option}` as never)}</option>)}
          </select>
          <button type="button" onClick={() => void saveHome()} disabled={isSaving} className="min-h-11 rounded-[16px] bg-[#ddf2dc] px-3 text-sm font-extrabold text-[#2d7a4f] disabled:opacity-60">
            {t("homeContext.saveHome")}
          </button>
        </div>

        <h3 className="mt-5 px-1 font-rounded text-lg font-extrabold text-ink">{t("homeContext.rooms")}</h3>
        <div className="mt-2 grid gap-2">
          {selectedRooms.map((room) => (
            <div key={room.id} className="flex items-center justify-between gap-2 rounded-[20px] bg-white/70 p-3">
              <button type="button" onClick={() => setRoomDraft({ id: room.id, name: room.name, lightLevel: room.lightLevel ?? "", directSun: room.directSun ?? "", temperatureRelative: room.temperatureRelative ?? "", hasAirConditioning: room.hasAirConditioning ?? "inherit", notes: room.notes ?? "" })} className="min-w-0 flex-1 text-left">
                <p className="truncate font-bold text-[#565149]">{room.name}</p>
                <p className="text-xs font-bold text-[#9a9286]">{room.lightLevel ? t(`homeContext.light.${room.lightLevel}` as never) : t("homeContext.lightUnknown")}</p>
              </button>
              <button type="button" onClick={() => void deleteRoom(room.id)} aria-label={t("rooms.deleteRoom")} className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#fdeaf0] text-[#9b2c3e]">
                <Trash2 aria-hidden="true" size={17} />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-2 rounded-[22px] bg-white/70 p-3">
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
          <button type="button" onClick={() => void saveRoom()} disabled={isSaving || !roomDraft.name.trim()} className="min-h-11 rounded-[16px] bg-[#ddf2dc] px-3 text-sm font-extrabold text-[#2d7a4f] disabled:opacity-60">
            {roomDraft.id ? t("homeContext.saveRoom") : t("homeContext.addRoom")}
          </button>
        </div>

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
            <button key={home.id} type="button" onClick={() => setSelectedHomeId(home.id)} className="flex min-h-[58px] items-center justify-between gap-3 rounded-[22px] bg-white/70 px-3 text-left">
              <div className="min-w-0">
                <p className="truncate font-bold text-[#565149]">{home.name}</p>
                <p className="text-xs font-bold text-[#9a9286]">{t("homeContext.roomCount").replace("{count}", String(roomCount))}</p>
              </div>
              <span className="text-sm font-extrabold text-[#2d7a4f]">{t("homeContext.openHome")}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-4 grid gap-2 rounded-[22px] bg-white/70 p-3">
        <input value={homeDraft.name} onChange={(event) => setHomeDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder={t("homeContext.homeName")} className="min-h-11 rounded-[16px] bg-white px-3 text-base outline-none" />
        <button type="button" onClick={() => void saveHome()} disabled={isSaving} className="flex min-h-11 items-center justify-center gap-2 rounded-[16px] bg-[#ddf2dc] px-3 text-sm font-extrabold text-[#2d7a4f] disabled:opacity-60">
          <Plus aria-hidden="true" size={17} />
          {t("homeContext.addHome")}
        </button>
      </div>
    </section>
  );
}
