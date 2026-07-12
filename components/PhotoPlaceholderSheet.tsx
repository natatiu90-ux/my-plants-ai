"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";

export function PhotoPlaceholderSheet({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-[#1c1c1e]/20 px-4 pb-4 backdrop-blur-[2px] sm:items-center sm:pb-0">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-sheet-title"
        className="w-full max-w-[390px] rounded-[28px] bg-[#fffaf3] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.16)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="photo-sheet-title" className="font-rounded text-2xl font-extrabold text-ink">
              {t("photo.title")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#66625b]">{t("photo.message")}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t("settings.close")}
            className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#7d776b] shadow-[0_1px_8px_rgba(0,0,0,0.06)]"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
