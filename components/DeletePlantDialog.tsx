"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/i18n/I18nProvider";

export function DeletePlantDialog({
  plantName,
  onCancel,
  onConfirm
}: {
  plantName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#1c1c1e]/25 px-4 pb-4 backdrop-blur-[2px] sm:items-center sm:pb-0">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-plant-title"
        className="w-full max-w-[390px] rounded-[28px] bg-[#fffaf3] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.16)]"
      >
        <h2 id="delete-plant-title" className="font-rounded text-2xl font-extrabold text-ink">
          {t("plantDetail.deleteTitle", { name: plantName })}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#66625b]">{t("plantDetail.deleteBody")}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="min-h-12 rounded-[18px] bg-white px-4 text-sm font-extrabold text-[#5f594f] shadow-[0_1px_8px_rgba(0,0,0,0.06)]"
          >
            {t("plantDetail.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-12 rounded-[18px] bg-[#f4d7dc] px-4 text-sm font-extrabold text-[#a13445]"
          >
            {t("plantDetail.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
