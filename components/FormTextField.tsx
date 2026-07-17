"use client";

export function FormTextField({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  error
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string | null;
}) {
  return (
    <label className="block rounded-[18px] bg-white/70 p-3">
      <span className="text-sm font-extrabold text-[#4f4940]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        className={`mt-2 block min-h-11 w-full min-w-0 max-w-full rounded-[16px] bg-[#fffaf3] px-3 text-base font-bold outline-none transition focus:bg-white focus:ring-2 focus:ring-[#b8dfb6] disabled:opacity-60 ${
          error ? "ring-2 ring-[#e7a3ad]" : ""
        }`}
      />
      {error ? <span className="mt-2 block text-xs font-bold leading-4 text-[#9b2c3e]">{error}</span> : null}
    </label>
  );
}
