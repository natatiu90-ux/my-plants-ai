"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";

export function HomeHeader() {
  const { t } = useI18n();

  return (
    <header className="px-6 pt-14 sm:pt-16">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-rounded text-[38px] font-black leading-none tracking-normal text-ink">
            {t("home.title")}
          </h1>
        </div>
        <Link
          href="/settings"
          aria-label={t("settings.title")}
          className="flex size-11 items-center justify-center rounded-[15px] bg-white/85 text-[#7d776b] shadow-[0_1px_8px_rgba(0,0,0,0.07)] transition hover:-translate-y-0.5 hover:bg-white"
        >
          <Settings aria-hidden="true" size={18} strokeWidth={2.3} />
        </Link>
      </div>
    </header>
  );
}
