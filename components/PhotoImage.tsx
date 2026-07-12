"use client";

import { usePhotoUrl } from "@/lib/use-photo-url";

export function PhotoImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const resolvedSrc = usePhotoUrl(src);

  return <img src={resolvedSrc} alt={alt} className={className} />;
}
