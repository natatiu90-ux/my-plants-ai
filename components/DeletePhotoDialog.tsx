"use client";

import { useI18n } from "@/i18n/I18nProvider";

export function DeletePhotoDialog({
  onCancel,
  onConfirm
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1c1c1e]/25 px-4 pb-4 backdrop-blur-[2px] sm:items-center sm:pb-0">
      <div role="dialog" aria-modal="true" className="w-full max-w-[360px] rounded-[28px] bg-[#fffaf3] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.16)]">
        <h2 className="font-rounded text-2xl font-extrabold text-ink">{t("photos.deleteTitle")}</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-[#676157]">{t("photos.deleteBody")}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className="min-h-12 rounded-[18px] bg-white px-4 text-sm font-extrabold text-[#5f594f]">
            {t("plantDetail.cancel")}
          </button>
          <button type="button" onClick={onConfirm} className="min-h-12 rounded-[18px] bg-[#f4d7dc] px-4 text-sm font-extrabold text-[#a13445]">
            {t("plantDetail.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
