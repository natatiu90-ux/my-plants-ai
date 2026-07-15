"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import type { DerivedCareActionState } from "@/lib/plant-action-eligibility";
import { plantCommonName, plantDisplayName } from "@/lib/plant-display";
import { logNavigationEvent, startNavigationLog } from "@/lib/navigation-performance";
import type { Plant, PlantStatus } from "@/types/plant";
import { PhotoImage } from "./PhotoImage";
import { StatusBadge } from "./StatusBadge";

const cardStyles: Record<PlantStatus, { card: string; image: string; fade: string }> = {
  healthy: {
    card: "border-[#6eaf6c]/20 bg-gradient-to-br from-[#ecf7eb] to-[#f6fcf6]",
    image: "bg-[#dde8dc]",
    fade: "from-transparent to-[#ecf7eb]/95"
  },
  check_soon: {
    card: "border-[#e6a050]/20 bg-gradient-to-br from-[#fef2e4] to-[#fef8f2]",
    image: "bg-[#ece0d2]",
    fade: "from-transparent to-[#fef2e4]/95"
  },
  needs_attention: {
    card: "border-[#d26478]/20 bg-gradient-to-br from-[#fdeaf0] to-[#fef5f7]",
    image: "bg-[#eadde0]",
    fade: "from-transparent to-[#fdeaf0]/95"
  },
  unknown: {
    card: "border-[#b9a98d]/20 bg-gradient-to-br from-[#fffaf3] to-[#f8f1e6]",
    image: "bg-[#dde8dc]",
    fade: "from-transparent to-[#fffaf3]/95"
  }
};

export function PlantCard({
  plant,
  careAction,
  coverPhotoUrl
}: {
  plant: Plant;
  careAction: DerivedCareActionState;
  coverPhotoUrl: string;
}) {
  const { t } = useI18n();
  const styles = cardStyles[plant.status];
  const displayName = plantDisplayName(plant, t("plants.unknownName"));
  const commonName = plantCommonName(plant);
  const badgeStatus = careAction.isActionable || careAction.cardBadgeKey === "status.needsHelp" ? plant.status : "healthy";

  return (
    <Link
      id={`plant-card-${plant.id}`}
      href={`/plants/${plant.id}`}
      onClick={() => {
        startNavigationLog("detail", plant.id, "plant_card_tapped");
        startNavigationLog("detail", plant.id, "detail_navigation_started");
      }}
      aria-label={`${t("plant.open")}: ${displayName}`}
      className={`block overflow-hidden rounded-[28px] border-[1.5px] shadow-soft transition duration-200 hover:-translate-y-1 focus-visible:-translate-y-1 ${styles.card}`}
    >
      <article>
        <div className={`relative h-[224px] overflow-hidden rounded-t-[27px] ${styles.image}`}>
          <PhotoImage
            src={coverPhotoUrl}
            onLoad={() => {
              logNavigationEvent("detail", plant.id, "cover_thumbnail_ready");
            }}
            alt={`${displayName}, ${commonName}`}
            className="h-full w-full object-cover"
          />
          <div className={`pointer-events-none absolute inset-x-0 bottom-0 h-[72px] bg-gradient-to-b ${styles.fade}`} />
          <div className="absolute bottom-3.5 left-4 right-4">
            {careAction.cardBadgeKey ? <StatusBadge label={t(careAction.cardBadgeKey)} status={badgeStatus} /> : null}
          </div>
        </div>
        <div className="px-5 pb-5 pt-3.5">
          <h2 className="font-rounded text-[22px] font-extrabold leading-[1.15] tracking-normal text-ink">
            {displayName}
          </h2>
          {commonName ? <p className="mt-0.5 text-[13px] italic leading-5 text-[#9a9aa3]">{commonName}</p> : null}
          <p className="mt-2 line-clamp-3 text-[14.5px] leading-[1.55] text-[#4a4a54]">
            {t(careAction.cardMessageKey, careAction.cardMessageParams)}
          </p>
        </div>
      </article>
    </Link>
  );
}
