"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Bell, Home, Trash2, UserRound } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { usePlantStore } from "@/data/PlantStore";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { roomOptions } from "./RoomPicker";

const futureSections = [
  { key: "settings.home", icon: Home },
  { key: "settings.notifications", icon: Bell },
  { key: "settings.account", icon: UserRound }
] as const;

export function SettingsPanel() {
  const { t } = useI18n();
  const { rooms, plants, deleteRoom } = usePlantStore();
  const [roomToDelete, setRoomToDelete] = useState<string | null>(null);
  const [replacementRoomKey, setReplacementRoomKey] = useState("");
  const [isDeletingRoom, setIsDeletingRoom] = useState(false);
  const selectedRoom = rooms.find((room) => room.id === roomToDelete);
  const selectedRoomPlantCount = plants.filter((plant) => plant.roomKey === roomToDelete).length;

  const confirmDeleteRoom = async () => {
    if (!selectedRoom || isDeletingRoom) {
      return;
    }

    setIsDeletingRoom(true);
    try {
      await deleteRoom(selectedRoom.id, replacementRoomKey || undefined);
      setRoomToDelete(null);
      setReplacementRoomKey("");
    } catch (error) {
      console.error("room_delete_failed", {
        roomId: selectedRoom.id,
        message: error instanceof Error ? error.message : "Unknown error"
      });
    } finally {
      setIsDeletingRoom(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-[430px] bg-cream px-5 pb-10 pt-12">
      <div className="mb-7 flex items-center justify-between">
        <Link
          href="/"
          aria-label={t("settings.back")}
          className="flex size-11 items-center justify-center rounded-[15px] bg-white/85 text-[#7d776b] shadow-[0_1px_8px_rgba(0,0,0,0.07)]"
        >
          <ArrowLeft aria-hidden="true" size={20} />
        </Link>
        <h1 className="font-rounded text-[30px] font-black leading-none text-ink">{t("settings.title")}</h1>
        <div aria-hidden="true" className="size-11" />
      </div>

      <section className="rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
        <h2 className="mb-3 px-1 font-rounded text-xl font-extrabold text-ink">{t("settings.language")}</h2>
        <LanguageSwitcher />
      </section>

      <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
        <h2 className="mb-3 px-1 font-rounded text-xl font-extrabold text-ink">{t("settings.rooms")}</h2>
        {rooms.length ? (
          <div className="grid gap-2">
            {rooms.map((room) => {
              const plantCount = plants.filter((plant) => plant.roomKey === room.id).length;
              return (
                <div key={room.id} className="flex min-h-[58px] items-center justify-between gap-3 rounded-[22px] bg-white/70 px-3">
                  <div>
                    <p className="font-bold text-[#565149]">{room.name}</p>
                    <p className="text-xs font-bold text-[#9a9286]">{t(plantCount === 1 ? "rooms.plantCount_one" : "rooms.plantCount").replace("{count}", String(plantCount))}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRoomToDelete(room.id);
                      setReplacementRoomKey("");
                    }}
                    aria-label={t("rooms.deleteRoom")}
                    className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#fdeaf0] text-[#9b2c3e]"
                  >
                    <Trash2 aria-hidden="true" size={17} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-[22px] bg-white/70 p-3 text-sm font-bold text-[#7a7166]">{t("rooms.noCustomRooms")}</p>
        )}
      </section>

      <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-2 shadow-soft">
        {futureSections.map(({ key, icon: Icon }) => (
          <div key={key} className="flex min-h-[58px] items-center justify-between rounded-[22px] px-3 opacity-60">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-[#f1eadf] text-[#7d776b]">
                <Icon aria-hidden="true" size={18} />
              </span>
              <span className="font-bold text-[#565149]">{t(key)}</span>
            </div>
            <span className="rounded-full bg-[#f1eadf] px-3 py-1 text-xs font-bold text-[#8b8173]">
              {t("settings.future")}
            </span>
          </div>
        ))}
      </section>
      {selectedRoom ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1c1c1e]/20 px-4 pb-4 backdrop-blur-[2px] sm:items-center sm:pb-0">
          <div role="dialog" aria-modal="true" className="w-full max-w-[390px] rounded-[28px] bg-[#fffaf3] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.16)]">
            <h2 className="font-rounded text-2xl font-extrabold text-ink">{t("rooms.deleteRoom")}</h2>
            <p className="mt-3 text-sm font-bold leading-6 text-[#5f594f]">
              {selectedRoomPlantCount
                ? t("rooms.deleteWithPlants").replace("{room}", selectedRoom.name).replace("{count}", String(selectedRoomPlantCount))
                : t("rooms.deleteEmpty").replace("{room}", selectedRoom.name)}
            </p>
            {selectedRoomPlantCount ? (
              <label className="mt-4 block text-sm font-extrabold text-[#4f4940]">
                {t("rooms.movePlantsTo")}
                <select
                  value={replacementRoomKey}
                  onChange={(event) => setReplacementRoomKey(event.target.value)}
                  className="mt-2 min-h-12 w-full rounded-[18px] bg-white/80 px-4 text-base outline-none"
                >
                  <option value="">{t("rooms.noRoom")}</option>
                  {roomOptions.map((roomKey) => (
                    <option key={roomKey} value={roomKey}>
                      {t(roomKey)}
                    </option>
                  ))}
                  {rooms
                    .filter((room) => room.id !== selectedRoom.id)
                    .map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.name}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setRoomToDelete(null)} disabled={isDeletingRoom} className="min-h-12 rounded-[18px] bg-white px-4 text-sm font-extrabold text-[#5f594f] disabled:opacity-60">
                {t("plantDetail.cancel")}
              </button>
              <button type="button" onClick={() => void confirmDeleteRoom()} disabled={isDeletingRoom} className="min-h-12 rounded-[18px] bg-[#fdeaf0] px-4 text-sm font-extrabold text-[#9b2c3e] disabled:opacity-60">
                {isDeletingRoom ? t("rooms.deletingRoom") : t("plantDetail.delete")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
