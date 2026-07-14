"use client";

import { FormEvent, useMemo, useState } from "react";
import { Leaf, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";

function authRedirectUrl() {
  const next = `${window.location.pathname}${window.location.search}`;
  const callback = new URL("/auth/callback", window.location.origin);
  if (next && next !== "/") {
    callback.searchParams.set("next", next);
  }
  return callback.toString();
}

export function AuthScreen() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = useMemo(() => email.trim().includes("@") && !isSending, [email, isSending]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || !supabase) {
      return;
    }

    setIsSending(true);
    setMessage(null);
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: authRedirectUrl()
        }
      });
      if (signInError) {
        throw signInError;
      }
      setMessage(t("auth.magicLinkSent"));
    } catch (nextError) {
      console.info("magic_link_send_failed", {
        message: nextError instanceof Error ? nextError.message : "Unknown error"
      });
      setError(t("auth.magicLinkError"));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-cream px-5 py-10">
      <section className="w-full max-w-[390px] rounded-[30px] bg-[#fffaf3] p-5 shadow-soft">
        <div className="flex size-14 items-center justify-center rounded-[22px] bg-[#ddf2dc] text-[#2d7a4f]">
          <Leaf aria-hidden="true" size={24} />
        </div>
        <h1 className="mt-5 font-rounded text-[32px] font-black leading-tight text-ink">{t("auth.title")}</h1>
        <p className="mt-2 text-sm font-bold leading-6 text-[#7a7166]">{t("auth.description")}</p>
        <form onSubmit={submit} className="mt-6 grid gap-3">
          <label className="block text-sm font-extrabold text-[#4f4940]">
            {t("auth.emailLabel")}
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isSending || !isSupabaseConfigured}
              className="mt-2 min-h-12 w-full rounded-[18px] bg-white/80 px-4 text-base outline-none focus:ring-2 focus:ring-[#b7d8a8] disabled:opacity-60"
            />
          </label>
          <button
            type="submit"
            disabled={!canSubmit || !isSupabaseConfigured}
            className="flex min-h-12 items-center justify-center gap-2 rounded-[18px] bg-gradient-to-br from-[#92cc90] to-[#6ba369] px-4 text-sm font-extrabold text-white shadow-fab disabled:opacity-60"
          >
            {isSending ? <Loader2 aria-hidden="true" size={16} className="animate-spin" /> : null}
            {t("auth.sendLink")}
          </button>
        </form>
        {!isSupabaseConfigured ? <p className="mt-4 rounded-[18px] bg-[#fdeaf0] p-3 text-sm font-bold leading-5 text-[#9b2c3e]">{t("auth.notConfigured")}</p> : null}
        {message ? <p className="mt-4 rounded-[18px] bg-[#edf8ed] p-3 text-sm font-bold leading-5 text-[#2d7a4f]">{message}</p> : null}
        {error ? <p className="mt-4 rounded-[18px] bg-[#fdeaf0] p-3 text-sm font-bold leading-5 text-[#9b2c3e]">{error}</p> : null}
      </section>
    </main>
  );
}
