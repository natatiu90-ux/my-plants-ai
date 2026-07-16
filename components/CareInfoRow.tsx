"use client";

import type { ReactNode } from "react";

export function CareInfoRow({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="flex min-h-[58px] min-w-0 items-center gap-3 rounded-[20px] bg-white/60 px-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#f1eadf] text-[#746b5e]">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-normal text-[#a09a90]">{label}</p>
        <p className="text-[15px] font-extrabold leading-5 text-[#3f3b35] [overflow-wrap:anywhere]">{value}</p>
      </div>
    </div>
  );
}
