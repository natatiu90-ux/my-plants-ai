"use client";

import type { ReactNode } from "react";

export function CareInfoRow({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="flex min-h-[58px] items-center gap-3 rounded-[20px] bg-white/60 px-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#f1eadf] text-[#746b5e]">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-normal text-[#a09a90]">{label}</p>
        <p className="truncate text-[15px] font-extrabold text-[#3f3b35]">{value}</p>
      </div>
    </div>
  );
}
