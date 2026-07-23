"use client";

import { Leaf } from "lucide-react";
import { AuthScreen } from "@/components/AuthScreen";
import { useI18n } from "@/i18n/I18nProvider";
import { usePlantStore } from "@/data/PlantStore";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { error, retry, status } = usePlantStore();

  if (status === "loading") {
    return (
      <main className="mx-auto min-h-screen w-full max-w-[430px] bg-cream px-5 pb-10 pt-[max(3rem,env(safe-area-inset-top))]" aria-busy="true">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="h-12 w-56 animate-pulse rounded-full bg-[#e9e1d5]" />
            <div className="mt-3 h-5 w-40 animate-pulse rounded-full bg-[#eee7dc]" />
          </div>
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] bg-white shadow-soft">
            <Leaf aria-hidden="true" size={28} className="text-[#79ad6c]" />
          </div>
        </div>

        <div className="mt-8 rounded-[30px] border border-[#f2dfbc] bg-[#fff8e8] p-4 shadow-[0_14px_34px_rgba(96,73,39,0.08)]">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-[#e2f3d9] text-[#5e9b57]">
              <Leaf aria-hidden="true" size={23} />
            </span>
            <div className="min-w-0">
              <p className="font-rounded text-lg font-extrabold leading-6 text-[#3f3b35]">{t("home.loadingTitle")}</p>
              <p className="mt-0.5 text-sm font-semibold leading-5 text-[#7a7166]">{t("home.loadingBody")}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-[34px] border border-[#f1dfbd] bg-[#fffaf3] shadow-soft">
          <div className="relative h-[248px] overflow-hidden bg-[#e9e1d5]">
            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-[#eee8dd] via-[#e1dbcf] to-[#f8f2e8]" />
            <div className="absolute left-8 top-9 h-28 w-7 origin-bottom -rotate-6 rounded-full bg-[#c7d8b8]/70" />
            <div className="absolute left-14 top-20 h-16 w-12 rotate-12 rounded-[50%] bg-[#b4ce9e]/80" />
            <div className="absolute right-10 top-12 h-32 w-8 origin-bottom rotate-12 rounded-full bg-[#9fbc83]/70" />
            <div className="absolute right-16 top-24 h-14 w-16 -rotate-12 rounded-[50%] bg-[#d4e5c2]/80" />
            <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#fffaf3] to-transparent" />
            <div className="absolute bottom-6 left-6 h-9 w-36 animate-pulse rounded-full bg-white/80 shadow-sm" />
          </div>
          <div className="space-y-3 px-5 pb-5 pt-4">
            <div className="h-8 w-1/2 animate-pulse rounded-full bg-[#ded6ca]" />
            <div className="h-5 w-1/3 animate-pulse rounded-full bg-[#eee7dc]" />
            <div className="mt-4 h-5 w-5/6 animate-pulse rounded-full bg-[#eee7dc]" />
            <div className="h-5 w-2/3 animate-pulse rounded-full bg-[#eee7dc]" />
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          <div className="h-24 animate-pulse rounded-[28px] bg-[#fffaf3] shadow-soft" />
          <div className="h-24 animate-pulse rounded-[28px] bg-[#fffaf3] shadow-soft" />
        </div>
      </main>
    );
  }

  if (status === "unauthenticated") {
    return <AuthScreen />;
  }

  if (status === "error") {
    return (
      <main className="mx-auto min-h-screen w-full max-w-[430px] bg-cream px-5 pb-10 pt-12">
        <section className="rounded-[28px] bg-[#fffaf3] p-5 shadow-soft">
          <h1 className="font-rounded text-2xl font-extrabold text-ink">{t("auth.sessionErrorTitle")}</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-[#7a7166]">{error ?? t("auth.sessionErrorText")}</p>
          <button type="button" onClick={() => void retry()} className="mt-4 min-h-12 w-full rounded-[18px] bg-[#ddf2dc] px-4 text-sm font-extrabold text-[#2d7a4f]">
            {t("auth.retry")}
          </button>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
