# Anonymous Account Recovery

The app uses Supabase anonymous authentication. Plant ownership is stored in `user_id` columns that match `auth.uid()`.

When an installed iPhone PWA is deleted, Safari can clear the local Supabase session. On the next install, the app creates a new anonymous Supabase user. Existing rows are still in Supabase under the previous `user_id`, but row-level security hides them from the new session.

## Ownership path

`PWA startup -> supabase.auth.getSession() -> existing session or signInAnonymously() -> repositories use user.id -> Supabase filters by user_id`

Owned tables include:

- `profiles.id`
- `homes.user_id`
- `rooms.user_id`
- `plants.user_id`
- `plant_photos.user_id`
- `plant_milestones.user_id`
- `care_events.user_id`
- `plant_analyses.user_id`
- `plant_hypothesis_resolutions.user_id`
- `user_settings.user_id`
- `push_subscriptions.user_id`
- `notification_deliveries.user_id`

Photo files are also effectively owned by the first folder segment in `plant_photos.storage_path`.

## Immediate production recovery

Find likely old anonymous owners:

```sql
select user_id, count(*) as plants_count, max(created_at) as latest_plant
from public.plants
group by user_id
order by latest_plant desc;
```

Check related rows:

```sql
select
  (select count(*) from public.plants where user_id = '<old-user-id>') as plants,
  (select count(*) from public.plant_photos where user_id = '<old-user-id>') as photos,
  (select count(*) from public.plant_milestones where user_id = '<old-user-id>') as milestones,
  (select count(*) from public.care_events where user_id = '<old-user-id>') as care_events,
  (select count(*) from public.push_subscriptions where user_id = '<old-user-id>') as push_subscriptions;
```

Generate a one-time recovery code for that owner:

```bash
curl -X POST "$APP_URL/api/recovery/admin-code" \
  -H "Authorization: Bearer $RECOVERY_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"userId":"<old-user-id>"}'
```

Then open the reinstalled PWA, go to Settings, enter the code, and restore.

The claim operation:

- verifies the recovery code;
- refuses to merge into a current account that already has plants;
- copies photo files from the old user folder to the new user folder;
- updates all ownership columns to the current Supabase user id;
- disables old push subscriptions so a new iPhone subscription can attach cleanly;
- preserves existing plants, rooms, photos, history, analysis records, settings, and notification history.
