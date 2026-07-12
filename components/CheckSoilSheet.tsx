"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";

type SoilChoice = "dry" | "slightly_damp" | "very_wet" | "not_sure";

const soilOptions = [
  { value: "dry", labelKey: "checkSoil.dry" },
  { value: "slightly_damp", labelKey: "checkSoil.slightlyDamp" },
  { value: "very_wet", labelKey: "checkSoil.veryWet" },
  { value: "not_sure", labelKey: "checkSoil.notSure" }
] as const;

export function CheckSoilSheet({
  onClose,
  onWatered,
  onSoilChecked
}: {
  onClose: () => void;
  onWatered: () => void;
  onSoilChecked: (result: SoilChoice) => void;
}) {
  const { t } = useI18n();
  const [choice, setChoice] = useState<SoilChoice | null>(null);
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

  const choose = (nextChoice: SoilChoice) => {
    setChoice(nextChoice);
    onSoilChecked(nextChoice);
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-[#1c1c1e]/20 px-4 pb-4 backdrop-blur-[2px] sm:items-center sm:pb-0">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="check-soil-title"
        className="w-full max-w-[390px] rounded-[28px] bg-[#fffaf3] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.16)]"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          {choice ? (
            <button
              type="button"
              onClick={() => setChoice(null)}
              aria-label={t("settings.back")}
              className="flex size-11 items-center justify-center rounded-2xl bg-white text-[#7d776b] shadow-[0_1px_8px_rgba(0,0,0,0.06)]"
            >
              <ArrowLeft aria-hidden="true" size={18} />
            </button>
          ) : (
            <div aria-hidden="true" className="size-11" />
          )}
          <h2 id="check-soil-title" className="text-center font-rounded text-[22px] font-extrabold text-ink">
            {t("checkSoil.title")}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t("settings.close")}
            className="flex size-11 items-center justify-center rounded-2xl bg-white text-[#7d776b] shadow-[0_1px_8px_rgba(0,0,0,0.06)]"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        {!choice ? (
          <div className="grid gap-2">
            {soilOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => choose(option.value)}
                className="min-h-[56px] rounded-[20px] bg-white/75 px-4 text-left text-[15px] font-extrabold text-[#4f4940] shadow-[0_1px_6px_rgba(0,0,0,0.04)]"
              >
                {t(option.labelKey)}
              </button>
            ))}
          </div>
        ) : null}

        {choice === "dry" ? (
          <div>
            <p className="rounded-[22px] bg-[#edf8ed] p-4 text-[15px] font-bold leading-6 text-[#2d7a4f]">
              {t("checkSoil.ready")}
            </p>
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={onWatered}
                className="min-h-12 rounded-[18px] bg-gradient-to-br from-[#92cc90] to-[#6ba369] px-4 text-sm font-extrabold text-white shadow-fab"
              >
                {t("checkSoil.iWatered")}
              </button>
              <button type="button" onClick={onClose} className="min-h-12 rounded-[18px] px-4 text-sm font-extrabold text-[#777167]">
                {t("checkSoil.notNow")}
              </button>
            </div>
          </div>
        ) : null}

        {choice === "slightly_damp" ? (
          <ResultMessage message={t("checkSoil.wait")} buttonLabel={t("checkSoil.gotIt")} onClose={onClose} />
        ) : null}

        {choice === "very_wet" ? (
          <div>
            <p className="rounded-[22px] bg-[#fdeaf0] p-4 text-[15px] font-bold leading-6 text-[#9b2c3e]">{t("checkSoil.wet")}</p>
            <p className="mt-3 text-sm leading-6 text-[#66625b]">{t("checkSoil.wetWarning")}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 min-h-12 w-full rounded-[18px] bg-white px-4 text-sm font-extrabold text-[#5f594f] shadow-[0_1px_8px_rgba(0,0,0,0.06)]"
            >
              {t("checkSoil.gotIt")}
            </button>
          </div>
        ) : null}

        {choice === "not_sure" ? (
          <ResultMessage message={t("checkSoil.unsure")} buttonLabel={t("checkSoil.backToOptions")} onClose={() => setChoice(null)} />
        ) : null}
      </div>
    </div>
  );
}

function ResultMessage({ message, buttonLabel, onClose }: { message: string; buttonLabel: string; onClose: () => void }) {
  return (
    <div>
      <p className="rounded-[22px] bg-[#f4efe6] p-4 text-[15px] font-bold leading-6 text-[#5f594f]">{message}</p>
      <button
        type="button"
        onClick={onClose}
        className="mt-4 min-h-12 w-full rounded-[18px] bg-white px-4 text-sm font-extrabold text-[#5f594f] shadow-[0_1px_8px_rgba(0,0,0,0.06)]"
      >
        {buttonLabel}
      </button>
    </div>
  );
}
