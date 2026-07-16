"use client";

import type { Plant } from "@/types/plant";
import { useI18n } from "@/i18n/I18nProvider";
import { usePlantStore } from "@/data/PlantStore";

const positionOptions: NonNullable<Plant["positionInRoom"]>[] = ["window_sill", "near_window", "shelf", "table", "floor", "hanging", "other"];

export function LocationPicker({
  homeId,
  roomId,
  positionInRoom,
  onChange
}: {
  homeId?: string;
  roomId?: string;
  positionInRoom?: Plant["positionInRoom"];
  onChange: (value: { homeId?: string; roomId?: string; positionInRoom?: Plant["positionInRoom"] }) => void;
}) {
  const { t } = useI18n();
  const { homes, rooms } = usePlantStore();
  const filteredRooms = rooms.filter((room) => (homeId ? room.homeId === homeId : !room.homeId));

  return (
    <div className="grid gap-3">
      <label className="block min-w-0 text-sm font-extrabold text-[#4f4940]">
        {t("homeContext.home")}
        <select
          value={homeId ?? ""}
          onChange={(event) => {
            const nextHomeId = event.target.value || undefined;
            const nextRoom = roomId ? rooms.find((room) => room.id === roomId) : undefined;
            onChange({
              homeId: nextHomeId,
              roomId: nextHomeId && nextRoom?.homeId === nextHomeId ? roomId : undefined,
              positionInRoom: nextHomeId && nextRoom?.homeId === nextHomeId ? positionInRoom : undefined
            });
          }}
          className="mt-2 min-h-12 w-full rounded-[18px] bg-white/80 px-4 text-base outline-none"
        >
          <option value="">{t("homeContext.noHome")}</option>
          {homes.map((home) => (
            <option key={home.id} value={home.id}>
              {home.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block min-w-0 text-sm font-extrabold text-[#4f4940]">
        {t("homeContext.room")}
        <select
          value={roomId ?? ""}
          onChange={(event) => onChange({ homeId, roomId: event.target.value || undefined, positionInRoom: event.target.value ? positionInRoom : undefined })}
          className="mt-2 min-h-12 w-full rounded-[18px] bg-white/80 px-4 text-base outline-none"
        >
          <option value="">{t("homeContext.noRoom")}</option>
          {filteredRooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block min-w-0 text-sm font-extrabold text-[#4f4940]">
        {t("homeContext.position")}
        <select
          value={positionInRoom ?? ""}
          onChange={(event) => onChange({ homeId, roomId, positionInRoom: (event.target.value || undefined) as Plant["positionInRoom"] })}
          disabled={!roomId}
          className="mt-2 min-h-12 w-full rounded-[18px] bg-white/80 px-4 text-base outline-none disabled:opacity-60"
        >
          <option value="">{t("homeContext.noPosition")}</option>
          {positionOptions.map((option) => (
            <option key={option} value={option}>
              {t(`homeContext.position.${option}` as never)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
