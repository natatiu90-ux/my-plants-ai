"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { usePlantStore } from "@/data/PlantStore";

type DiagnosticState = {
  sessionExists: boolean;
  userIdExists: boolean;
  databaseQuerySucceeds: boolean;
  storageReachable: boolean;
  openAIConfigured: boolean;
};

export function DevDiagnostics() {
  const { userId } = usePlantStore();
  const [state, setState] = useState<DiagnosticState>({
    sessionExists: false,
    userIdExists: false,
    databaseQuerySucceeds: false,
    storageReachable: false,
    openAIConfigured: false
  });

  useEffect(() => {
    async function runDiagnostics() {
      const session = supabase ? await supabase.auth.getSession() : null;
      const plantQuery = supabase ? await supabase.from("plants").select("id", { count: "exact", head: true }) : { error: true };
      const storageQuery = supabase ? await supabase.storage.from("plant-photos").list(userId ?? "", { limit: 1 }) : { error: true };
      const serverDiagnostics = await fetch("/api/dev-diagnostics").then((response) => response.json()).catch(() => null);

      setState({
        sessionExists: Boolean(session?.data.session),
        userIdExists: Boolean(userId),
        databaseQuerySucceeds: !plantQuery.error,
        storageReachable: !storageQuery.error,
        openAIConfigured: Boolean(serverDiagnostics?.openAIConfigured)
      });
    }

    void runDiagnostics();
  }, [userId]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-[430px] bg-cream px-5 py-12">
      <section className="rounded-[28px] bg-[#fffaf3] p-5 shadow-soft">
        <h1 className="font-rounded text-2xl font-extrabold text-ink">Development diagnostics</h1>
        <div className="mt-5 grid gap-3 text-sm font-bold text-[#5f594f]">
          {Object.entries(state).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between rounded-[18px] bg-white/70 px-4 py-3">
              <span>{key}</span>
              <span className={value ? "text-[#2d7a4f]" : "text-[#a13445]"}>{value ? "OK" : "Needs attention"}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
