"use client";

export function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="fixed left-1/2 top-[calc(1rem+env(safe-area-inset-top))] z-50 w-[calc(100%-2rem)] max-w-[360px] -translate-x-1/2 rounded-[20px] bg-[#2f6f4b] px-4 py-3 text-center text-sm font-extrabold text-white shadow-[0_12px_36px_rgba(45,122,79,0.28)]"
    >
      {message}
    </div>
  );
}
