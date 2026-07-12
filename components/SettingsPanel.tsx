"use client";

import Link from "next/link";
import { ArrowLeft, Bell, Home, UserRound } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { LanguageSwitcher } from "./LanguageSwitcher";

const futureSections = [
  { key: "settings.home", icon: Home },
  { key: "settings.notifications", icon: Bell },
  { key: "settings.account", icon: UserRound }
] as const;

export function SettingsPanel() {
  const { t } = useI18n();

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
    </main>
  );
}
