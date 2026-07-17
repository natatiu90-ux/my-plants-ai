"use client";

import { Loader2 } from "lucide-react";

export function AnswerChips<T>({
  options,
  getKey,
  labelFor,
  onSelect,
  selectedKey,
  loadingKey,
  disabled = false,
  variant = "green"
}: {
  options: readonly T[];
  getKey: (option: T) => string;
  labelFor: (option: T) => string;
  onSelect: (option: T) => void;
  selectedKey?: string;
  loadingKey?: string | null;
  disabled?: boolean;
  variant?: "green" | "neutral";
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {options.map((option) => {
        const key = getKey(option);
        const isSelected = selectedKey === key;
        const isLoading = loadingKey === key;
        const selectedClass = variant === "green" ? "bg-[#2d7a4f] text-white" : "bg-[#2d7a4f] text-white";
        const idleClass = variant === "green" ? "bg-[#ddf2dc] text-[#2d7a4f]" : "bg-[#fffaf3] text-[#6f675c]";
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(option)}
            disabled={disabled}
            aria-busy={isLoading}
            className={`flex min-h-10 items-center gap-2 rounded-[15px] px-3 text-sm font-extrabold disabled:opacity-60 ${isSelected ? selectedClass : idleClass}`}
          >
            {isLoading ? <Loader2 aria-hidden="true" size={14} className="animate-spin" /> : null}
            {labelFor(option)}
          </button>
        );
      })}
    </div>
  );
}
