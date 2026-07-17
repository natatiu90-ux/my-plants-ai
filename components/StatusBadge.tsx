"use client";

import type { PlantStatus } from "@/types/plant";
import type { PlantHealthStatus } from "@/lib/plant-health-status";

export type StatusBadgeStatus = PlantStatus | PlantHealthStatus;

const badgeStyles: Record<StatusBadgeStatus, string> = {
  healthy: "bg-[#ddf2dc] text-[#2d7a4f]",
  adapting: "bg-[#e9f4d8] text-[#5e7d22]",
  watch: "bg-[#eef0f7] text-[#4a5f8f]",
  check_soon: "bg-[#fdecd3] text-[#8b5e14]",
  needs_attention: "bg-[#fcdde3] text-[#9b2c3e]",
  action_needed: "bg-[#f8c8d1] text-[#842033]",
  unknown: "bg-[#f1eadf] text-[#6b6256]"
};

export function StatusBadge({ label, status }: { label: string; status: StatusBadgeStatus }) {
  return (
    <span
      className={`inline-flex max-w-[calc(100%-2rem)] items-center rounded-full px-3 py-1.5 text-[12.5px] font-bold leading-none shadow-[0_1px_3px_rgba(0,0,0,0.08)] ${badgeStyles[status]}`}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}
