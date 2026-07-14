"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, Leaf, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { appBuildVersion, isStandalonePwa } from "@/lib/app-version";
import { isSupabaseConfigured, supabase, supabaseAnonKeySuffix, supabaseProjectUrl } from "@/lib/supabase/client";

function authRedirectUrl() {
  return `${window.location.origin}/auth/callback`;
}

const debugAuthStorageKey = "my_plants_debug_auth";
const authMethodStorageKey = "my_plants_auth_method";

type AuthMethod = "magic_link" | "password";

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
  const [authMethod, setAuthMethod] = useState<AuthMethod>("magic_link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diagnostic, setDiagnostic] = useState<AuthDiagnostic | null>(null);
  const canSubmit = useMemo(
    () => email.trim().includes("@") && !isSending && (authMethod === "magic_link" || password.length > 0),
    [authMethod, email, isSending, password]
  );

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

  useEffect(() => {
    const storedMethod = window.localStorage.getItem(authMethodStorageKey);
    if (storedMethod === "magic_link" || storedMethod === "password") {
      setAuthMethod(storedMethod);
    }
  }, []);

  const chooseAuthMethod = (nextMethod: AuthMethod) => {
    setAuthMethod(nextMethod);
    window.localStorage.setItem(authMethodStorageKey, nextMethod);
    setMessage(null);
    setError(null);
    if (nextMethod !== "password") {
      setPassword("");
      setIsPasswordVisible(false);
    }
  };

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

    if (authMethod === "password" && !password) {
      setError(t("auth.passwordMissing"));
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
      const { error: signInError } =
        authMethod === "magic_link"
          ? await supabase.auth.signInWithOtp({
              email: email.trim(),
              options: {
                emailRedirectTo
              }
            })
          : await supabase.auth.signInWithPassword({
              email: email.trim(),
              password
            });
      if (signInError) {
        throw signInError;
      }
      console.info("magic_link_send_completed", startDiagnostic);
      setMessage(authMethod === "magic_link" ? t("auth.magicLinkSent") : t("auth.passwordSignedIn"));
    } catch (nextError) {
      const nextDiagnostic = await buildDiagnostic(emailRedirectTo, nextError);
      console.info("magic_link_send_failed", nextDiagnostic);
      setDiagnostic(nextDiagnostic);
      const message = `${nextDiagnostic.errorMessage ?? ""} ${nextDiagnostic.errorCode ?? ""}`.toLowerCase();
      if (authMethod === "magic_link" && (message.includes("rate") || message.includes("too many") || nextDiagnostic.errorStatus === 429)) {
        setError(t("auth.rateLimit"));
      } else if (authMethod === "magic_link" && (message.includes("email") || nextDiagnostic.errorStatus === 400)) {
        setError(t("auth.invalidEmail"));
      } else if (authMethod === "password" && (message.includes("invalid") || message.includes("credentials") || nextDiagnostic.errorStatus === 400)) {
        setError(t("auth.invalidCredentials"));
      } else if (message.includes("network") || message.includes("fetch")) {
        setError(t("auth.networkError"));
      } else {
        setError(authMethod === "magic_link" ? t("auth.magicLinkError") : t("auth.passwordSignInError"));
      }
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
        <div className="mt-6 grid grid-cols-2 rounded-[18px] bg-white/70 p-1">
          <button
            type="button"
            onClick={() => chooseAuthMethod("magic_link")}
            className={[
              "min-h-10 rounded-[14px] px-3 text-sm font-extrabold transition",
              authMethod === "magic_link" ? "bg-[#ddf2dc] text-[#2d7a4f] shadow-[0_1px_6px_rgba(0,0,0,0.06)]" : "text-[#7a7166]"
            ].join(" ")}
          >
            {t("auth.methodMagicLink")}
          </button>
          <button
            type="button"
            onClick={() => chooseAuthMethod("password")}
            className={[
              "min-h-10 rounded-[14px] px-3 text-sm font-extrabold transition",
              authMethod === "password" ? "bg-[#ddf2dc] text-[#2d7a4f] shadow-[0_1px_6px_rgba(0,0,0,0.06)]" : "text-[#7a7166]"
            ].join(" ")}
          >
            {t("auth.methodPassword")}
          </button>
        </div>
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
          {authMethod === "password" ? (
            <label className="block text-sm font-extrabold text-[#4f4940]">
              {t("auth.passwordLabel")}
              <span className="mt-2 flex min-h-12 items-center rounded-[18px] bg-white/80 pr-2 focus-within:ring-2 focus-within:ring-[#b7d8a8]">
                <input
                  type={isPasswordVisible ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={isSending || !isSupabaseConfigured}
                  className="min-h-12 min-w-0 flex-1 rounded-[18px] bg-transparent px-4 text-base outline-none disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setIsPasswordVisible((current) => !current)}
                  aria-label={isPasswordVisible ? t("auth.hidePassword") : t("auth.showPassword")}
                  className="flex size-10 shrink-0 items-center justify-center rounded-[14px] text-[#7a7166]"
                >
                  {isPasswordVisible ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
                </button>
              </span>
            </label>
          ) : null}
          <button
            type="submit"
            disabled={!canSubmit || !isSupabaseConfigured}
            className="flex min-h-12 items-center justify-center gap-2 rounded-[18px] bg-gradient-to-br from-[#92cc90] to-[#6ba369] px-4 text-sm font-extrabold text-white shadow-fab disabled:opacity-60"
          >
            {isSending ? <Loader2 aria-hidden="true" size={16} className="animate-spin" /> : null}
            {authMethod === "magic_link" ? t("auth.sendLink") : t("auth.signIn")}
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
