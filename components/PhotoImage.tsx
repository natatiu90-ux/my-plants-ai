"use client";

import { usePhotoUrl } from "@/lib/use-photo-url";

export function PhotoImage({ src, alt, className, onLoad }: { src: string; alt: string; className?: string; onLoad?: () => void }) {
  const resolvedSrc = usePhotoUrl(src);

  return <img src={resolvedSrc} alt={alt} className={className} onLoad={onLoad} />;
}
