"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Bell, Home, Trash2, UserRound } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { usePlantStore } from "@/data/PlantStore";
import {
  PushSetupError,
  collectPushDiagnostics,
  getNotificationSupport,
  saveCareNotificationSettings,
  sendTestCareNotification,
  subscribeToCarePush,
  unsubscribeFromCarePush,
  type PushDiagnostics
} from "@/lib/push-client";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { roomOptions } from "./RoomPicker";

const futureSections = [
  { key: "settings.home", icon: Home }
] as const;

export function SettingsPanel() {
  const { locale, t } = useI18n();
  const { rooms, plants, deleteRoom, signOut, userEmail } = usePlantStore();
  const [roomToDelete, setRoomToDelete] = useState<string | null>(null);
  const [replacementRoomKey, setReplacementRoomKey] = useState("");
  const [isDeletingRoom, setIsDeletingRoom] = useState(false);
  const [isPushSupported, setIsPushSupported] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [preferredTime, setPreferredTime] = useState("09:00");
  const [quietHoursStart, setQuietHoursStart] = useState("22:00");
  const [quietHoursEnd, setQuietHoursEnd] = useState("08:00");
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
  const [isNotificationSaving, setIsNotificationSaving] = useState(false);
  const [pushDiagnostics, setPushDiagnostics] = useState<PushDiagnostics | null>(null);
  const selectedRoom = rooms.find((room) => room.id === roomToDelete);
  const selectedRoomPlantCount = plants.filter((plant) => plant.roomKey === roomToDelete).length;
  const isPermissionGranted = notificationPermission === "granted";
  const isPermissionDenied = notificationPermission === "denied";
  const showPushDiagnostics = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_SHOW_PUSH_DIAGNOSTICS === "true";
  const permissionLabel = {
    default: t("notifications.permission.default"),
    granted: t("notifications.permission.granted"),
    denied: t("notifications.permission.denied"),
    unsupported: t("notifications.permission.unsupported")
  }[notificationPermission];

  const refreshNotificationSupport = async () => {
    const support = await getNotificationSupport();
    setIsPushSupported(support.supported);
    setNotificationPermission(support.permission);
    setNotificationsEnabled(support.subscribed);
    setPushDiagnostics(await collectPushDiagnostics());
  };

  useEffect(() => {
    void refreshNotificationSupport();
  }, []);

  const notificationErrorMessage = (error: unknown) => {
    if (error instanceof PushSetupError) {
      const key = {
        open_installed_pwa: "notifications.error.openInstalled",
        notifications_not_supported: "notifications.error.unsupported",
        service_worker_failed: "notifications.error.serviceWorker",
        vapid_public_key_missing: "notifications.error.publicKey",
        notification_permission_denied: "notifications.error.permissionDenied",
        push_subscription_failed: "notifications.error.pushSubscribe",
        subscription_save_failed: "notifications.error.subscriptionSave"
      }[error.code] as Parameters<typeof t>[0];
      return t(key);
    }
    return t("notifications.failedMessage");
  };

  const enableNotifications = async () => {
    if (isNotificationSaving) return;
    setIsNotificationSaving(true);
    setNotificationMessage(null);
    try {
      setPushDiagnostics(await collectPushDiagnostics("button_click"));
      await subscribeToCarePush(locale, setPushDiagnostics);
      setPushDiagnostics(await collectPushDiagnostics("save_preferences"));
      await saveCareNotificationSettings({ preferredTime, quietHoursStart, quietHoursEnd, locale });
      await refreshNotificationSupport();
      setNotificationMessage(t("notifications.enabledMessage"));
    } catch (error) {
      const safeError = {
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        latestApiStatus: error instanceof PushSetupError ? error.apiStatus : pushDiagnostics?.latestApiStatus,
        currentStep: error instanceof PushSetupError ? error.step : pushDiagnostics?.currentStep ?? "idle"
      };
      console.info("push_subscription_failed", safeError);
      setPushDiagnostics((current) => current ? { ...current, ...safeError } : null);
      setNotificationMessage(notificationErrorMessage(error));
    } finally {
      setIsNotificationSaving(false);
    }
  };

  const disableNotifications = async () => {
    if (isNotificationSaving) return;
    setIsNotificationSaving(true);
    setNotificationMessage(null);
    try {
      await unsubscribeFromCarePush();
      await refreshNotificationSupport();
      setNotificationMessage(t("notifications.disabledMessage"));
    } catch (error) {
      console.info("push_unsubscribe_failed", { message: error instanceof Error ? error.message : "Unknown error" });
      setNotificationMessage(t("notifications.failedMessage"));
    } finally {
      setIsNotificationSaving(false);
    }
  };

  const saveNotificationSettings = async () => {
    if (isNotificationSaving) return;
    setIsNotificationSaving(true);
    setNotificationMessage(null);
    try {
      await saveCareNotificationSettings({ preferredTime, quietHoursStart, quietHoursEnd, locale });
      setNotificationMessage(t("notifications.savedMessage"));
    } catch (error) {
      console.info("push_settings_failed", { message: error instanceof Error ? error.message : "Unknown error" });
      setNotificationMessage(t("notifications.failedMessage"));
    } finally {
      setIsNotificationSaving(false);
    }
  };

  const sendTest = async () => {
    if (isNotificationSaving) return;
    setIsNotificationSaving(true);
    setNotificationMessage(null);
    try {
      await sendTestCareNotification(locale);
      setNotificationMessage(t("notifications.testSent"));
    } catch (error) {
      console.info("push_test_failed", { message: error instanceof Error ? error.message : "Unknown error" });
      setNotificationMessage(t("notifications.failedMessage"));
    } finally {
      setIsNotificationSaving(false);
    }
  };

  const confirmDeleteRoom = async () => {
    if (!selectedRoom || isDeletingRoom) {
      return;
    }

    setIsDeletingRoom(true);
    try {
      await deleteRoom(selectedRoom.id, replacementRoomKey || undefined);
      setRoomToDelete(null);
      setReplacementRoomKey("");
    } catch (error) {
      console.error("room_delete_failed", {
        roomId: selectedRoom.id,
        message: error instanceof Error ? error.message : "Unknown error"
      });
    } finally {
      setIsDeletingRoom(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-[430px] bg-cream px-5 pb-10 pt-12">
      <div className="mb-7 flex items-center justify-between">
        <Link
          href="/"
          aria-label={t("settings.back")}
          className="flex size-11 items-center justify-center rounded-[15px] bg-white/85 text-[#7d776b] shadow-[0_1px_8px_rgba(0,0,0,0.07)]"
        >
          <ArrowLeft aria-hidden="true" size={20} />
        </Link>
        <h1 className="font-rounded text-[30px] font-black leading-none text-ink">{t("settings.title")}</h1>
        <div aria-hidden="true" className="size-11" />
      </div>

      <section className="rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
        <h2 className="mb-3 px-1 font-rounded text-xl font-extrabold text-ink">{t("settings.language")}</h2>
        <LanguageSwitcher />
      </section>

      <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#f1eadf] text-[#7d776b]">
            <UserRound aria-hidden="true" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-rounded text-xl font-extrabold text-ink">{t("settings.account")}</h2>
            <p className="mt-1 truncate text-sm font-bold leading-5 text-[#7a7166]">{userEmail ?? t("auth.emailAccount")}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-4 min-h-12 w-full rounded-[18px] bg-white/75 px-4 text-sm font-extrabold text-[#7d776b]"
        >
          {t("auth.logout")}
        </button>
      </section>

      <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
        <h2 className="mb-3 px-1 font-rounded text-xl font-extrabold text-ink">{t("settings.rooms")}</h2>
        {rooms.length ? (
          <div className="grid gap-2">
            {rooms.map((room) => {
              const plantCount = plants.filter((plant) => plant.roomKey === room.id).length;
              return (
                <div key={room.id} className="flex min-h-[58px] items-center justify-between gap-3 rounded-[22px] bg-white/70 px-3">
                  <div>
                    <p className="font-bold text-[#565149]">{room.name}</p>
                    <p className="text-xs font-bold text-[#9a9286]">{t(plantCount === 1 ? "rooms.plantCount_one" : "rooms.plantCount").replace("{count}", String(plantCount))}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRoomToDelete(room.id);
                      setReplacementRoomKey("");
                    }}
                    aria-label={t("rooms.deleteRoom")}
                    className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#fdeaf0] text-[#9b2c3e]"
                  >
                    <Trash2 aria-hidden="true" size={17} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-[22px] bg-white/70 p-3 text-sm font-bold text-[#7a7166]">{t("rooms.noCustomRooms")}</p>
        )}
      </section>

      <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-4 shadow-soft">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#eef5e8] text-[#3f7d4f]">
            <Bell aria-hidden="true" size={18} />
          </span>
          <div>
            <h2 className="font-rounded text-xl font-extrabold text-ink">{t("notifications.title")}</h2>
            <p className="mt-1 text-sm font-bold leading-5 text-[#8b8173]">{t("notifications.description")}</p>
          </div>
        </div>

        {!isPushSupported ? (
          <p className="mt-4 rounded-[20px] bg-white/75 p-3 text-sm font-bold leading-5 text-[#7a7166]">{t("notifications.unsupported")}</p>
        ) : isPermissionDenied ? (
          <div className="mt-4 rounded-[20px] bg-white/75 p-3 text-sm font-bold leading-5 text-[#7a7166]">
            <p>{t("notifications.deniedMessage")}</p>
            <p className="mt-2 text-[#4f4940]">{t("notifications.deniedAction")}</p>
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            {!notificationsEnabled || !isPermissionGranted ? (
              <div className="rounded-[22px] bg-white/70 p-3">
              <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#9a9286]">{t("notifications.permission")}</p>
              <p className="mt-1 text-sm font-bold text-[#565149]">{permissionLabel}</p>
              </div>
            ) : null}

            {notificationsEnabled && isPermissionGranted ? (
              <>
                <label className="block min-w-0 text-sm font-extrabold text-[#4f4940]">
                  {t("notifications.preferredTime")}
                <input
                  type="time"
                  value={preferredTime}
                  onChange={(event) => setPreferredTime(event.target.value)}
                  onBlur={() => void saveNotificationSettings()}
                  className="app-time-input mt-2 outline-none focus:ring-2 focus:ring-[#b7d8a8]"
                />
              </label>

                <div className="grid min-w-0 grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
                  <label className="block min-w-0 text-sm font-extrabold text-[#4f4940]">
                    {t("notifications.quietStart")}
                    <input
                      type="time"
                      value={quietHoursStart}
                      onChange={(event) => setQuietHoursStart(event.target.value)}
                      onBlur={() => void saveNotificationSettings()}
                      className="app-time-input mt-2 outline-none focus:ring-2 focus:ring-[#b7d8a8]"
                    />
                  </label>
                  <label className="block min-w-0 text-sm font-extrabold text-[#4f4940]">
                    {t("notifications.quietEnd")}
                    <input
                      type="time"
                      value={quietHoursEnd}
                      onChange={(event) => setQuietHoursEnd(event.target.value)}
                      onBlur={() => void saveNotificationSettings()}
                      className="app-time-input mt-2 outline-none focus:ring-2 focus:ring-[#b7d8a8]"
                    />
                  </label>
                </div>
              </>
            ) : null}

            <button
              type="button"
              onClick={() => void (notificationsEnabled ? disableNotifications() : enableNotifications())}
              disabled={isNotificationSaving}
              className={
                notificationsEnabled
                  ? "min-h-12 rounded-[20px] bg-white/75 px-4 text-sm font-extrabold text-[#7d776b] disabled:opacity-60"
                  : "min-h-12 rounded-[20px] bg-[#2d7a4f] px-4 text-sm font-extrabold text-white shadow-[0_10px_24px_rgba(45,122,79,0.18)] disabled:opacity-60"
              }
            >
              {notificationsEnabled ? t("notifications.disable") : t("notifications.enable")}
            </button>
            {process.env.NODE_ENV !== "production" ? (
              <button
                type="button"
                onClick={() => void sendTest()}
                disabled={isNotificationSaving || !notificationsEnabled}
                className="min-h-11 rounded-[18px] bg-white/75 px-4 text-sm font-extrabold text-[#7d776b] disabled:opacity-60"
              >
                {t("notifications.sendTest")}
              </button>
            ) : null}
            {notificationMessage ? <p className="text-sm font-bold leading-5 text-[#6f675c]">{notificationMessage}</p> : null}
            {showPushDiagnostics && pushDiagnostics ? (
              <div className="rounded-[20px] bg-white/70 p-3 text-left">
                <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#9a9286]">{t("notifications.diagnostics")}</p>
                <dl className="mt-2 grid grid-cols-[1.2fr_1fr] gap-x-3 gap-y-1 text-[11px] font-bold leading-4 text-[#6f675c]">
                  <dt>isStandalone</dt>
                  <dd>{String(pushDiagnostics.isStandalone)}</dd>
                  <dt>serviceWorkerSupported</dt>
                  <dd>{String(pushDiagnostics.serviceWorkerSupported)}</dd>
                  <dt>serviceWorkerState</dt>
                  <dd>{pushDiagnostics.serviceWorkerState}</dd>
                  <dt>notificationApiSupported</dt>
                  <dd>{String(pushDiagnostics.notificationApiSupported)}</dd>
                  <dt>Notification.permission</dt>
                  <dd>{pushDiagnostics.notificationPermission}</dd>
                  <dt>pushManagerSupported</dt>
                  <dd>{String(pushDiagnostics.pushManagerSupported)}</dd>
                  <dt>vapidPublicKeyPresent</dt>
                  <dd>{String(pushDiagnostics.vapidPublicKeyPresent)}</dd>
                  <dt>currentStep</dt>
                  <dd>{pushDiagnostics.currentStep}</dd>
                  <dt>errorName</dt>
                  <dd>{pushDiagnostics.errorName ?? "-"}</dd>
                  <dt>errorMessage</dt>
                  <dd className="break-words">{pushDiagnostics.errorMessage ?? "-"}</dd>
                  <dt>latestApiStatus</dt>
                  <dd>{pushDiagnostics.latestApiStatus ?? "-"}</dd>
                </dl>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="mt-4 rounded-[28px] bg-[#fffaf3] p-2 shadow-soft">
        {futureSections.map(({ key, icon: Icon }) => (
          <div key={key} className="flex min-h-[58px] items-center justify-between rounded-[22px] px-3 opacity-60">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-[#f1eadf] text-[#7d776b]">
                <Icon aria-hidden="true" size={18} />
              </span>
              <span className="font-bold text-[#565149]">{t(key)}</span>
            </div>
            <span className="rounded-full bg-[#f1eadf] px-3 py-1 text-xs font-bold text-[#8b8173]">
              {t("settings.future")}
            </span>
          </div>
        ))}
      </section>
      {selectedRoom ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1c1c1e]/20 px-4 pb-4 backdrop-blur-[2px] sm:items-center sm:pb-0">
          <div role="dialog" aria-modal="true" className="w-full max-w-[390px] rounded-[28px] bg-[#fffaf3] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.16)]">
            <h2 className="font-rounded text-2xl font-extrabold text-ink">{t("rooms.deleteRoom")}</h2>
            <p className="mt-3 text-sm font-bold leading-6 text-[#5f594f]">
              {selectedRoomPlantCount
                ? t("rooms.deleteWithPlants").replace("{room}", selectedRoom.name).replace("{count}", String(selectedRoomPlantCount))
                : t("rooms.deleteEmpty").replace("{room}", selectedRoom.name)}
            </p>
            {selectedRoomPlantCount ? (
              <label className="mt-4 block text-sm font-extrabold text-[#4f4940]">
                {t("rooms.movePlantsTo")}
                <select
                  value={replacementRoomKey}
                  onChange={(event) => setReplacementRoomKey(event.target.value)}
                  className="mt-2 min-h-12 w-full rounded-[18px] bg-white/80 px-4 text-base outline-none"
                >
                  <option value="">{t("rooms.noRoom")}</option>
                  {roomOptions.map((roomKey) => (
                    <option key={roomKey} value={roomKey}>
                      {t(roomKey)}
                    </option>
                  ))}
                  {rooms
                    .filter((room) => room.id !== selectedRoom.id)
                    .map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.name}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setRoomToDelete(null)} disabled={isDeletingRoom} className="min-h-12 rounded-[18px] bg-white px-4 text-sm font-extrabold text-[#5f594f] disabled:opacity-60">
                {t("plantDetail.cancel")}
              </button>
              <button type="button" onClick={() => void confirmDeleteRoom()} disabled={isDeletingRoom} className="min-h-12 rounded-[18px] bg-[#fdeaf0] px-4 text-sm font-extrabold text-[#9b2c3e] disabled:opacity-60">
                {isDeletingRoom ? t("rooms.deletingRoom") : t("plantDetail.delete")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
