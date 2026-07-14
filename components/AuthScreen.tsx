"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Leaf, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { appBuildVersion, isStandalonePwa } from "@/lib/app-version";
import { isSupabaseConfigured, supabase, supabaseAnonKeySuffix, supabaseProjectUrl } from "@/lib/supabase/client";

function authRedirectUrl() {
  return `${window.location.origin}/auth/callback`;
}

const debugAuthStorageKey = "my_plants_debug_auth";

type AuthDiagnostic = {
  origin: string;
  href: string;
  displayMode: "standalone" | "browser";
  emailRedirectTo: string;
  supabaseProjectUrl: string;
  supabaseAnonKeySuffix: string;
  appBuildVersion: string;
  serviceWorkerControllerUrl: string | null;
  existingSession: boolean | null;
  errorMessage?: string;
  errorCode?: string;
  errorStatus?: number;
};

function safeSupabaseError(error: unknown) {
  const value = (typeof error === "object" && error ? error : {}) as {
    message?: unknown;
    code?: unknown;
    status?: unknown;
  };

  return {
    errorMessage: error instanceof Error ? error.message : typeof value.message === "string" ? value.message : undefined,
    errorCode: typeof value.code === "string" ? value.code : undefined,
    errorStatus: typeof value.status === "number" ? value.status : undefined
  };
}

export function AuthScreen() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const [isDebugAuth, setIsDebugAuth] = useState(false);
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diagnostic, setDiagnostic] = useState<AuthDiagnostic | null>(null);
  const canSubmit = useMemo(() => email.trim().includes("@") && !isSending, [email, isSending]);

  useEffect(() => {
    const debugParam = searchParams.get("debugAuth");
    if (debugParam === "1") {
      window.localStorage.setItem(debugAuthStorageKey, "1");
      setIsDebugAuth(true);
      return;
    }

    if (debugParam === "0") {
      window.localStorage.removeItem(debugAuthStorageKey);
      setIsDebugAuth(false);
      return;
    }

    setIsDebugAuth(window.localStorage.getItem(debugAuthStorageKey) === "1");
  }, [searchParams]);

  const buildDiagnostic = async (emailRedirectTo: string, nextError?: unknown): Promise<AuthDiagnostic> => {
    const sessionResult = supabase ? await supabase.auth.getSession().catch(() => null) : null;

    return {
      origin: window.location.origin,
      href: window.location.href,
      displayMode: isStandalonePwa() ? "standalone" : "browser",
      emailRedirectTo,
      supabaseProjectUrl,
      supabaseAnonKeySuffix,
      appBuildVersion,
      serviceWorkerControllerUrl: navigator.serviceWorker?.controller?.scriptURL ?? null,
      existingSession: sessionResult ? Boolean(sessionResult.data.session) : null,
      ...(nextError ? safeSupabaseError(nextError) : {})
    };
  };

  const copyDiagnostic = () => {
    if (!diagnostic) {
      return;
    }

    void navigator.clipboard?.writeText(JSON.stringify(diagnostic, null, 2));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || !supabase) {
      return;
    }

    setIsSending(true);
    setMessage(null);
    setError(null);
    setDiagnostic(null);
    const emailRedirectTo = authRedirectUrl();
    const startDiagnostic = await buildDiagnostic(emailRedirectTo);
    console.info("magic_link_send_started", startDiagnostic);
    if (isDebugAuth) {
      setDiagnostic(startDiagnostic);
    }
    try {
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo
        }
      });
      if (signInError) {
        throw signInError;
      }
      console.info("magic_link_send_completed", startDiagnostic);
      setMessage(t("auth.magicLinkSent"));
    } catch (nextError) {
      const nextDiagnostic = await buildDiagnostic(emailRedirectTo, nextError);
      console.info("magic_link_send_failed", nextDiagnostic);
      setDiagnostic(nextDiagnostic);
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
        {isDebugAuth ? (
          <p className="mt-4 inline-flex rounded-full bg-[#fdeecf] px-3 py-1 text-xs font-black uppercase tracking-[0.06em] text-[#8a6230]">
            Auth Debug ON
          </p>
        ) : null}
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
        {isDebugAuth ? (
          <div className="mt-4 rounded-[18px] bg-white/75 p-3 text-left text-[11px] font-bold leading-5 text-[#5f594f]">
            <p className="text-xs font-extrabold text-ink">Auth diagnostic</p>
            <p>mode: {diagnostic?.displayMode ?? (isStandalonePwa() ? "standalone" : "browser")}</p>
            <p>current origin: {diagnostic?.origin ?? (typeof window !== "undefined" ? window.location.origin : "-")}</p>
            <p className="break-words">emailRedirectTo: {diagnostic?.emailRedirectTo ?? (typeof window !== "undefined" ? authRedirectUrl() : "-")}</p>
            <p>app build version: {diagnostic?.appBuildVersion ?? appBuildVersion}</p>
            <p className="break-words">service worker controller URL: {diagnostic?.serviceWorkerControllerUrl ?? "none"}</p>
            <p className="break-words">Supabase project URL: {diagnostic?.supabaseProjectUrl ?? supabaseProjectUrl}</p>
            <p>existing session: {diagnostic?.existingSession == null ? "unknown" : diagnostic.existingSession ? "yes" : "no"}</p>
            <p>error message: {diagnostic?.errorMessage ?? "-"}</p>
            <p>error code: {diagnostic?.errorCode ?? "-"}</p>
            <p>HTTP status: {diagnostic?.errorStatus ?? "-"}</p>
            <button
              type="button"
              onClick={copyDiagnostic}
              disabled={!diagnostic}
              className="mt-3 min-h-10 rounded-[14px] bg-[#ddf2dc] px-3 text-xs font-extrabold text-[#2d7a4f]"
            >
              Copy diagnostic
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
