# My Plants AI

My Plants AI is a mobile-first Progressive Web App for warm, practical houseplant care. The live app uses Supabase anonymous sessions, Supabase Postgres, private Supabase Storage, and a server-side OpenAI analysis route.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Required local variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

`OPENAI_API_KEY` is server-only. Never prefix it with `NEXT_PUBLIC_`, print it, or commit `.env.local`.

## Anonymous Sessions

The app restores the existing Supabase session on startup. If no session exists, it calls `supabase.auth.signInAnonymously()` and persists that anonymous user in the browser. There is no visible login screen.

Anonymous users use the authenticated role after sign-in. All user-owned tables are protected with RLS policies based on `user_id = auth.uid()`.

## Supabase Migration

Apply the migration:

```bash
supabase db push
```

Migration file:

- `supabase/migrations/202607120001_cloud_data_model.sql`

It creates:

- `profiles`
- `homes`
- `rooms`
- `plants`
- `plant_photos`
- `plant_milestones`
- `care_events`
- `plant_analyses`
- `user_settings`
- private Storage bucket `plant-photos`
- RLS policies for user-owned database rows and Storage paths

Photo paths use:

```text
{user_id}/{plant_id}/{photo_id}.{extension}
```

## Verify RLS

1. Open the app in one browser and add a plant.
2. Open the app in a separate browser profile.
3. Confirm the second anonymous user sees an empty collection.
4. In Supabase SQL editor, verify rows have different `user_id` values.
5. Attempt a query as each authenticated user and confirm only their own rows are visible.

## Verify Storage Policies

1. Add a plant with photos.
2. Confirm objects are created in `plant-photos/{user_id}/{plant_id}/`.
3. Confirm the bucket is private.
4. Confirm a different anonymous user cannot list or download another user’s folder.

## OpenAI Configuration

The plant analysis endpoint is:

```text
POST /api/analyze-plant
```

It accepts up to 5 images, 10 MB each, optimizes image copies server-side, and calls OpenAI from the server only. The model is read from `OPENAI_MODEL` and falls back to `gpt-5-mini`. If `OPENAI_API_KEY` is missing, development returns a controlled configuration error and production returns a generic failure.

To configure Vercel:

1. Open the Vercel project.
2. Go to Settings → Environment Variables.
3. Add `OPENAI_API_KEY`.
4. Add `OPENAI_MODEL` with `gpt-5-mini`.
5. Redeploy after saving.

## Testing

Empty state:

1. Clear the Supabase anonymous session or open a fresh browser profile.
2. Load Home.
3. Confirm no demo plants appear.
4. Confirm the empty-state CTA opens Add Plant.

Add real plant:

1. Select one or more real photos.
2. Review photo types and cover selection.
3. Continue through analysis.
4. Edit the detected species if needed.
5. Save.
6. Confirm the plant appears on Home and remains after refresh.

AI failure fallback:

1. Temporarily unset `OPENAI_API_KEY` locally.
2. Add a plant.
3. Confirm the calm warning appears.
4. Confirm the plant can still be added manually with the selected photos.

Development diagnostics:

```text
/dev/diagnostics
```

This route is hidden in production and shows only booleans for session, user id, database query, Storage reachability, and OpenAI configuration. It never displays keys, tokens, or secret values.
