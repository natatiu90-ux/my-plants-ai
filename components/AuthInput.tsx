"use client";

import { Eye, EyeOff } from "lucide-react";

export function AuthInput({
  label,
  type,
  value,
  onChange,
  autoComplete,
  disabled,
  inputMode,
  isPasswordVisible,
  onTogglePassword,
  showPasswordLabel,
  hidePasswordLabel
}: {
  label: string;
  type: "email" | "password" | "text";
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  disabled?: boolean;
  inputMode?: "email";
  isPasswordVisible?: boolean;
  onTogglePassword?: () => void;
  showPasswordLabel?: string;
  hidePasswordLabel?: string;
}) {
  const isPassword = Boolean(onTogglePassword);
  const inputType = isPassword ? (isPasswordVisible ? "text" : "password") : type;

  return (
    <label className="block min-w-0 text-sm font-extrabold text-[#4f4940]">
      {label}
      <span className="mt-2 flex min-h-12 w-full min-w-0 items-center rounded-[18px] border border-[#ece3d4] bg-white/80 px-4 focus-within:border-[#b7d8a8] focus-within:ring-2 focus-within:ring-[#b7d8a8]">
        <input
          type={inputType}
          inputMode={inputMode}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className="min-h-12 min-w-0 flex-1 border-0 bg-transparent p-0 text-base outline-none disabled:opacity-60"
        />
        {isPassword ? (
          <button
            type="button"
            onClick={onTogglePassword}
            disabled={disabled}
            aria-label={isPasswordVisible ? hidePasswordLabel : showPasswordLabel}
            className="-mr-2 ml-2 flex size-10 shrink-0 items-center justify-center rounded-[14px] text-[#7a7166] disabled:opacity-60"
          >
            {isPasswordVisible ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
          </button>
        ) : null}
      </span>
    </label>
  );
}
