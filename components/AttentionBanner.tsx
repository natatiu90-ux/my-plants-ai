"use client";

import { useI18n } from "@/i18n/I18nProvider";

export function AttentionBanner({ count, onActivate }: { count: number; onActivate: () => void }) {
  const { t } = useI18n();
  const key = count === 1 ? "home.attention_one" : "home.attention";

  if (count <= 0) {
    return null;
  }

  return (
    <section className="px-5 pt-5">
      <button
        type="button"
        onClick={onActivate}
        className="flex w-full items-center gap-3 rounded-[18px] border border-[#e6a046]/20 bg-gradient-to-br from-[#fff9f0] to-[#fef2dc] px-4 py-[15px] text-left transition active:scale-[0.99]"
      >
        <span aria-hidden="true" className="text-xl leading-none">
          🌿
        </span>
        <p className="text-sm font-semibold leading-5 text-[#8b6a14]">{t(key, { count })}</p>
      </button>
    </section>
  );
}
