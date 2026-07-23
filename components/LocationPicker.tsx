"use client";

import { useEffect } from "react";
import { ChevronsUpDown } from "lucide-react";
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
  const effectiveRoomId = homeId && !filteredRooms.some((room) => room.id === roomId) ? filteredRooms[0]?.id : roomId;
  const fieldClassName = "block h-12 w-full min-w-0 max-w-full appearance-none rounded-[18px] bg-transparent px-4 pr-12 text-base text-[#4f4940] outline-none";
  const labelClassName = "block min-w-0 text-sm font-extrabold text-[#4f4940]";
  const fieldWrapClassName = "mt-2 flex h-12 w-full min-w-0 max-w-full items-center rounded-[18px] bg-white/80 focus-within:bg-white";

  useEffect(() => {
    if (homeId && effectiveRoomId && effectiveRoomId !== roomId) {
      onChange({ homeId, roomId: effectiveRoomId, positionInRoom });
    }
  }, [effectiveRoomId, homeId, onChange, positionInRoom, roomId]);

  return (
    <div className="grid gap-4">
      <label className={labelClassName}>
        {t("homeContext.home")}
        <span className={fieldWrapClassName}>
          <select
            value={homeId ?? ""}
            onChange={(event) => {
              const nextHomeId = event.target.value || undefined;
              const nextRoom = roomId ? rooms.find((room) => room.id === roomId) : undefined;
              const firstRoomInHome = nextHomeId ? rooms.find((room) => room.homeId === nextHomeId) : undefined;
              onChange({
                homeId: nextHomeId,
                roomId: nextHomeId ? (nextRoom?.homeId === nextHomeId ? roomId : firstRoomInHome?.id) : undefined,
                positionInRoom: nextHomeId && (nextRoom?.homeId === nextHomeId || firstRoomInHome) ? positionInRoom : undefined
              });
            }}
            className={fieldClassName}
          >
            <option value="">{t("homeContext.noHome")}</option>
            {homes.map((home) => (
              <option key={home.id} value={home.id} disabled={!rooms.some((room) => room.homeId === home.id)}>
                {home.name}
              </option>
            ))}
          </select>
          <ChevronsUpDown aria-hidden="true" size={20} className="-ml-10 mr-4 shrink-0 text-[#1f1f22]" />
        </span>
        {!homeId ? <span className="mt-2 block text-[13px] font-medium leading-5 text-[#7a7166]">{t("homeContext.weatherHint")}</span> : null}
      </label>

      <label className={labelClassName}>
        {t("homeContext.room")}
        <span className={`${fieldWrapClassName} ${homeId && !filteredRooms.length ? "opacity-60" : ""}`}>
          <select
            value={effectiveRoomId ?? ""}
            onChange={(event) => onChange({ homeId, roomId: event.target.value || undefined, positionInRoom: event.target.value ? positionInRoom : undefined })}
            disabled={Boolean(homeId && !filteredRooms.length)}
            className={`${fieldClassName} disabled:opacity-60`}
          >
            {!homeId ? <option value="">{t("homeContext.noRoom")}</option> : null}
            {filteredRooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
          <ChevronsUpDown aria-hidden="true" size={20} className="-ml-10 mr-4 shrink-0 text-[#1f1f22]" />
        </span>
      </label>

      <label className={labelClassName}>
        {t("homeContext.position")}
        <span className={`${fieldWrapClassName} ${!effectiveRoomId ? "opacity-60" : ""}`}>
          <select
            value={positionInRoom ?? ""}
            onChange={(event) => onChange({ homeId, roomId: effectiveRoomId, positionInRoom: (event.target.value || undefined) as Plant["positionInRoom"] })}
            disabled={!effectiveRoomId}
            className={`${fieldClassName} disabled:opacity-60`}
          >
            <option value="">{t("homeContext.noPosition")}</option>
            {positionOptions.map((option) => (
              <option key={option} value={option}>
                {t(`homeContext.position.${option}` as never)}
              </option>
            ))}
          </select>
          <ChevronsUpDown aria-hidden="true" size={20} className="-ml-10 mr-4 shrink-0 text-[#1f1f22]" />
        </span>
      </label>
    </div>
  );
}
