alter table public.plant_analyses
  add column if not exists resolved_at timestamptz,
  add column if not exists resolution_action text,
  add column if not exists resolution_result text,
  add column if not exists replacement_recommendation_id text;

create index if not exists plant_analyses_active_recommendation_idx
  on public.plant_analyses(user_id, plant_id, created_at desc)
  where resolved_at is null;
