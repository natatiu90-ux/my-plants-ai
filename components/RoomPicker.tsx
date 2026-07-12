"use client";

import { useState } from "react";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/I18nProvider";
import { usePlantStore } from "@/data/PlantStore";

export const roomOptions = [
  "rooms.livingRoom",
  "rooms.bedroom",
  "rooms.kitchen",
  "rooms.bathroom",
  "rooms.office",
  "rooms.balcony"
] as const satisfies readonly TranslationKey[];

export function RoomPicker({ value, onChange }: { value?: string; onChange: (value?: string) => void }) {
  const { t } = useI18n();
  const { addRoom, roomExists, rooms } = usePlantStore();
  const [isAddingRoom, setIsAddingRoom] = useState(false);
  const [isSavingRoom, setIsSavingRoom] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const saveRoom = async () => {
    if (isSavingRoom) {
      return;
    }

    const trimmedName = roomName.trim();
    if (!trimmedName) {
      setError(t("rooms.nameRequired"));
      return;
    }

    const existingRoom = rooms.find((room) => room.name.trim().toLocaleLowerCase() === trimmedName.toLocaleLowerCase());
    if (existingRoom) {
      onChange(existingRoom.id);
      setRoomName("");
      setError(null);
      setIsAddingRoom(false);
      return;
    }
    if (roomExists(trimmedName)) {
      setError(t("rooms.duplicate"));
      return;
    }

    setIsSavingRoom(true);
    try {
      const room = await addRoom(trimmedName);
      onChange(room.id);
      setRoomName("");
      setError(null);
      setIsAddingRoom(false);
    } catch (error) {
      console.error("room_save_failed", {
        message: error instanceof Error ? error.message : "Unknown error"
      });
      setError(t("rooms.saveFailed"));
    } finally {
      setIsSavingRoom(false);
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {roomOptions.map((roomKey) => (
          <button
            key={roomKey}
            type="button"
            onClick={() => onChange(roomKey)}
            className={`min-h-11 rounded-[18px] px-3 text-sm font-extrabold ${
              value === roomKey ? "bg-[#ddf2dc] text-[#2d7a4f]" : "bg-white/70 text-[#5f594f]"
            }`}
          >
            {t(roomKey)}
          </button>
        ))}
        {rooms.map((room) => (
          <button
            key={room.id}
            type="button"
            onClick={() => onChange(room.id)}
            className={`min-h-11 rounded-[18px] px-3 text-sm font-extrabold ${
              value === room.id ? "bg-[#ddf2dc] text-[#2d7a4f]" : "bg-white/70 text-[#5f594f]"
            }`}
          >
            {room.name}
          </button>
        ))}
        <button type="button" onClick={() => setIsAddingRoom(true)} disabled={isSavingRoom} className="min-h-11 rounded-[18px] bg-white/70 px-3 text-sm font-extrabold text-[#8b8173] disabled:opacity-60">
          {t("rooms.addRoom")}
        </button>
      </div>
      {isAddingRoom ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1c1c1e]/20 px-4 pb-4 backdrop-blur-[2px] sm:items-center sm:pb-0">
          <div role="dialog" aria-modal="true" className="w-full max-w-[390px] rounded-[28px] bg-[#fffaf3] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.16)]">
            <h2 className="font-rounded text-2xl font-extrabold text-ink">{t("rooms.addRoom")}</h2>
            <label className="mt-4 block text-sm font-extrabold text-[#4f4940]">
              {t("rooms.roomName")}
              <input
                value={roomName}
                onChange={(event) => {
                  setRoomName(event.target.value);
                  setError(null);
                }}
                placeholder={t("rooms.roomNamePlaceholder")}
                className="mt-2 min-h-12 w-full rounded-[18px] bg-white/80 px-4 text-base outline-none"
              />
            </label>
            {error ? <p className="mt-3 rounded-[18px] bg-[#fdeaf0] p-3 text-sm font-bold text-[#9b2c3e]">{error}</p> : null}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setIsAddingRoom(false)} disabled={isSavingRoom} className="min-h-12 rounded-[18px] bg-white px-4 text-sm font-extrabold text-[#5f594f] disabled:opacity-60">
                {t("plantDetail.cancel")}
              </button>
              <button type="button" onClick={() => void saveRoom()} disabled={isSavingRoom} className="min-h-12 rounded-[18px] bg-[#ddf2dc] px-4 text-sm font-extrabold text-[#2d7a4f] disabled:opacity-60">
                {isSavingRoom ? t("rooms.addingRoom") : t("rooms.addRoomAction")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
