# Care Push Notifications

This app now has the first local layer for per-plant care reminders.

## Environment variables

Add these in local development and Vercel:

```bash
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:hello@example.com
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
```

`NEXT_PUBLIC_VAPID_PUBLIC_KEY` is safe for the browser. Keep `VAPID_PRIVATE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `CRON_SECRET` server-only.

Generate VAPID keys with:

```bash
npx web-push generate-vapid-keys
```

## Database migration

Apply:

```bash
supabase db push
```

The migration adds:

- per-plant reminder state, including `next_check_at`, notification enabled/disabled state, and last soil check result;
- `push_subscriptions` for browser subscriptions;
- `notification_deliveries` for deduplication and delivery/open tracking;
- notification preferences on `user_settings`.

## Service worker

`public/sw.js` receives push payloads and opens the plant detail page with `?action=check_soil`.

The app registers the worker from `components/ServiceWorkerRegistration.tsx`. The permission prompt is still user-initiated from Settings.

## Scheduled delivery

The cron-ready endpoint is:

```text
GET /api/notifications/cron
Authorization: Bearer $CRON_SECRET
```

Set it up in Vercel Cron to run periodically, for example every 15 or 30 minutes. This change intentionally does not modify deployment configuration.

The job:

- finds plants whose `next_check_at` is due;
- respects global notification opt-in, preferred time, and quiet hours;
- deduplicates by plant, subscription, notification type, and due cycle;
- records success/failure in Supabase;
- disables permanently invalid browser subscriptions.

## Testing on iPhone

1. Deploy with the environment variables above.
2. Open the site in Safari.
3. Add it to the Home Screen.
4. Open the installed PWA, not the Safari tab.
5. Go to Settings and enable care reminders.
6. Use the development-only test notification button locally, or set one plant's next check to today and run the cron endpoint.
7. Tap the notification and confirm it opens the plant detail page.

## Browser limitations

- iPhone push notifications require iOS/iPadOS 16.4+ and the installed Home Screen PWA.
- Safari browser tabs on iPhone cannot receive web push like an installed PWA.
- Users can block notifications at the OS/browser level; the app cannot override that.
- Delivery timing is best-effort and depends on the browser push service, OS power settings, and network state.
