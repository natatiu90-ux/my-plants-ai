create table if not exists public.plant_hypothesis_resolutions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plant_id uuid not null references public.plants(id) on delete cascade,
  hypothesis text not null,
  status text not null,
  user_result text not null,
  evidence_source text not null default 'user_confirmation',
  resolved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint plant_hypothesis_resolutions_hypothesis_check check (
    hypothesis in ('pests', 'sun_stress', 'old_compacted_soil', 'recent_repotting', 'watering')
  ),
  constraint plant_hypothesis_resolutions_status_check check (status in ('confirmed', 'ruled_out', 'unknown'))
);

create index if not exists plant_hypothesis_resolutions_plant_idx
  on public.plant_hypothesis_resolutions(user_id, plant_id, resolved_at desc);

create unique index if not exists plant_hypothesis_resolutions_latest_unique
  on public.plant_hypothesis_resolutions(user_id, plant_id, hypothesis);

alter table public.plant_hypothesis_resolutions enable row level security;

drop policy if exists plant_hypothesis_resolutions_select_own on public.plant_hypothesis_resolutions;
drop policy if exists plant_hypothesis_resolutions_insert_own on public.plant_hypothesis_resolutions;
drop policy if exists plant_hypothesis_resolutions_update_own on public.plant_hypothesis_resolutions;
drop policy if exists plant_hypothesis_resolutions_delete_own on public.plant_hypothesis_resolutions;

create policy plant_hypothesis_resolutions_select_own on public.plant_hypothesis_resolutions for select using (user_id = auth.uid());
create policy plant_hypothesis_resolutions_insert_own on public.plant_hypothesis_resolutions for insert with check (user_id = auth.uid());
create policy plant_hypothesis_resolutions_update_own on public.plant_hypothesis_resolutions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy plant_hypothesis_resolutions_delete_own on public.plant_hypothesis_resolutions for delete using (user_id = auth.uid());
