"use client";

import Link from "next/link";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { PlantMenu } from "./PlantMenu";

export function PlantDetailHeader({
  title,
  isMenuOpen,
  onToggleMenu,
  onEdit,
  onDelete
}: {
  title: string;
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();

  return (
    <header className="relative mb-5 flex items-center justify-between pt-12">
      <Link
        href="/"
        aria-label={t("settings.back")}
        className="flex size-11 items-center justify-center rounded-[15px] bg-white/85 text-[#7d776b] shadow-[0_1px_8px_rgba(0,0,0,0.07)]"
      >
        <ArrowLeft aria-hidden="true" size={20} />
      </Link>
      <h1 className="max-w-[230px] truncate text-center font-rounded text-[28px] font-black leading-none text-ink">
        {title}
      </h1>
      <button
        type="button"
        onClick={onToggleMenu}
        aria-label={t("plantDetail.menu")}
        aria-expanded={isMenuOpen}
        className="flex size-11 items-center justify-center rounded-[15px] bg-white/85 text-[#7d776b] shadow-[0_1px_8px_rgba(0,0,0,0.07)]"
      >
        <MoreHorizontal aria-hidden="true" size={21} />
      </button>
      {isMenuOpen ? <PlantMenu onEdit={onEdit} onDelete={onDelete} /> : null}
    </header>
  );
}
