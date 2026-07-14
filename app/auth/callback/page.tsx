"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/lib/supabase/client";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function finishSignIn() {
      if (!supabase) {
        setError(t("auth.notConfigured"));
        return;
      }

      const next = safeNextPath(searchParams.get("next"));
      const code = searchParams.get("code");
      try {
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            throw exchangeError;
          }
        } else {
          const { data, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) {
            throw sessionError;
          }
          if (!data.session) {
            await new Promise((resolve) => window.setTimeout(resolve, 400));
          }
        }

        if (isMounted) {
          router.replace(next);
        }
      } catch (nextError) {
        console.info("magic_link_callback_failed", {
          message: nextError instanceof Error ? nextError.message : "Unknown error"
        });
        if (isMounted) {
          setError(t("auth.callbackError"));
        }
      }
    }

    void finishSignIn();

    return () => {
      isMounted = false;
    };
  }, [router, searchParams, t]);

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-cream px-5 py-10">
      <section className="w-full max-w-[390px] rounded-[30px] bg-[#fffaf3] p-5 text-center shadow-soft">
        <h1 className="font-rounded text-2xl font-black text-ink">{error ? t("auth.callbackErrorTitle") : t("auth.callbackTitle")}</h1>
        <p className="mt-2 text-sm font-bold leading-6 text-[#7a7166]">{error ?? t("auth.callbackText")}</p>
      </section>
    </main>
  );
}
