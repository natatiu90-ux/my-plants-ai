"use client";

import { AuthScreen } from "@/components/AuthScreen";
import { useI18n } from "@/i18n/I18nProvider";
import { usePlantStore } from "@/data/PlantStore";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { error, retry, status } = usePlantStore();

  if (status === "loading") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[430px] items-center justify-center bg-cream px-5 text-center" aria-busy="true">
        <p className="font-rounded text-[22px] font-extrabold leading-7 text-[#3f3b35]">{t("home.loadingTitle")}</p>
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
