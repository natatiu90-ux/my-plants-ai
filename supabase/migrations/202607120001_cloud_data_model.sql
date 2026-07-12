create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  preferred_locale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.homes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Home',
  city text,
  country_code text,
  latitude numeric,
  longitude numeric,
  timezone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid references public.homes(id) on delete set null,
  name text not null,
  is_custom boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid references public.homes(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  home_name text,
  species_name text,
  scientific_name text,
  notes text,
  status text not null default 'unknown',
  next_action text,
  last_watered_at timestamptz,
  next_check_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plants_status_check check (status in ('healthy', 'check_soon', 'needs_attention', 'unknown')),
  constraint plants_next_action_check check (next_action in ('water', 'check_soil', 'take_photo', 'none') or next_action is null)
);

create table if not exists public.plant_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plant_id uuid not null references public.plants(id) on delete cascade,
  storage_path text not null,
  photo_type text not null default 'overview',
  is_cover boolean not null default false,
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  constraint plant_photos_type_check check (photo_type in ('overview', 'leaf', 'pot', 'roots', 'problem', 'other'))
);

create table if not exists public.plant_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plant_id uuid not null references public.plants(id) on delete cascade,
  type text not null,
  event_date date not null default current_date,
  note text,
  photo_id uuid references public.plant_photos(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.care_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plant_id uuid not null references public.plants(id) on delete cascade,
  type text not null,
  event_date timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.plant_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plant_id uuid not null references public.plants(id) on delete cascade,
  source_photo_ids uuid[] not null default '{}',
  detected_species text,
  confidence numeric,
  condition text not null default 'unknown',
  status text not null default 'complete',
  next_action text,
  summary_key text,
  summary_en text,
  summary_ru text,
  recommendations jsonb not null default '[]'::jsonb,
  raw_result jsonb,
  model text,
  created_at timestamptz not null default now(),
  constraint plant_analyses_condition_check check (condition in ('healthy', 'check_soon', 'needs_attention', 'unknown')),
  constraint plant_analyses_next_action_check check (next_action in ('water', 'check_soil', 'take_photo', 'none') or next_action is null)
);

create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  locale text,
  notifications_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists homes_user_id_idx on public.homes(user_id);
create index if not exists rooms_user_id_idx on public.rooms(user_id);
create index if not exists rooms_home_id_idx on public.rooms(home_id);
create index if not exists plants_user_id_idx on public.plants(user_id);
create index if not exists plants_room_id_idx on public.plants(room_id);
create index if not exists plants_next_check_at_idx on public.plants(next_check_at);
create index if not exists plant_photos_user_id_idx on public.plant_photos(user_id);
create index if not exists plant_photos_plant_id_idx on public.plant_photos(plant_id);
create index if not exists plant_photos_plant_cover_idx on public.plant_photos(plant_id, is_cover);
create index if not exists plant_milestones_user_id_idx on public.plant_milestones(user_id);
create index if not exists plant_milestones_plant_date_idx on public.plant_milestones(plant_id, event_date desc);
create index if not exists care_events_user_id_idx on public.care_events(user_id);
create index if not exists care_events_plant_date_idx on public.care_events(plant_id, event_date desc);
create index if not exists plant_analyses_user_id_idx on public.plant_analyses(user_id);
create index if not exists plant_analyses_plant_created_idx on public.plant_analyses(plant_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.homes enable row level security;
alter table public.rooms enable row level security;
alter table public.plants enable row level security;
alter table public.plant_photos enable row level security;
alter table public.plant_milestones enable row level security;
alter table public.care_events enable row level security;
alter table public.plant_analyses enable row level security;
alter table public.user_settings enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger homes_set_updated_at before update on public.homes for each row execute function public.set_updated_at();
create trigger rooms_set_updated_at before update on public.rooms for each row execute function public.set_updated_at();
create trigger plants_set_updated_at before update on public.plants for each row execute function public.set_updated_at();
create trigger plant_milestones_set_updated_at before update on public.plant_milestones for each row execute function public.set_updated_at();
create trigger user_settings_set_updated_at before update on public.user_settings for each row execute function public.set_updated_at();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'homes',
    'rooms',
    'plants',
    'plant_photos',
    'plant_milestones',
    'care_events',
    'plant_analyses',
    'user_settings'
  ]
  loop
    execute format('drop policy if exists "%1$s_select_own" on public.%1$I', table_name);
    execute format('drop policy if exists "%1$s_insert_own" on public.%1$I', table_name);
    execute format('drop policy if exists "%1$s_update_own" on public.%1$I', table_name);
    execute format('drop policy if exists "%1$s_delete_own" on public.%1$I', table_name);
  end loop;
end $$;

create policy profiles_select_own on public.profiles for select using (id = auth.uid());
create policy profiles_insert_own on public.profiles for insert with check (id = auth.uid());
create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_delete_own on public.profiles for delete using (id = auth.uid());

create policy homes_select_own on public.homes for select using (user_id = auth.uid());
create policy homes_insert_own on public.homes for insert with check (user_id = auth.uid());
create policy homes_update_own on public.homes for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy homes_delete_own on public.homes for delete using (user_id = auth.uid());

create policy rooms_select_own on public.rooms for select using (user_id = auth.uid());
create policy rooms_insert_own on public.rooms for insert with check (user_id = auth.uid());
create policy rooms_update_own on public.rooms for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy rooms_delete_own on public.rooms for delete using (user_id = auth.uid());

create policy plants_select_own on public.plants for select using (user_id = auth.uid());
create policy plants_insert_own on public.plants for insert with check (user_id = auth.uid());
create policy plants_update_own on public.plants for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy plants_delete_own on public.plants for delete using (user_id = auth.uid());

create policy plant_photos_select_own on public.plant_photos for select using (user_id = auth.uid());
create policy plant_photos_insert_own on public.plant_photos for insert with check (user_id = auth.uid());
create policy plant_photos_update_own on public.plant_photos for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy plant_photos_delete_own on public.plant_photos for delete using (user_id = auth.uid());

create policy plant_milestones_select_own on public.plant_milestones for select using (user_id = auth.uid());
create policy plant_milestones_insert_own on public.plant_milestones for insert with check (user_id = auth.uid());
create policy plant_milestones_update_own on public.plant_milestones for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy plant_milestones_delete_own on public.plant_milestones for delete using (user_id = auth.uid());

create policy care_events_select_own on public.care_events for select using (user_id = auth.uid());
create policy care_events_insert_own on public.care_events for insert with check (user_id = auth.uid());
create policy care_events_update_own on public.care_events for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy care_events_delete_own on public.care_events for delete using (user_id = auth.uid());

create policy plant_analyses_select_own on public.plant_analyses for select using (user_id = auth.uid());
create policy plant_analyses_insert_own on public.plant_analyses for insert with check (user_id = auth.uid());
create policy plant_analyses_update_own on public.plant_analyses for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy plant_analyses_delete_own on public.plant_analyses for delete using (user_id = auth.uid());

create policy user_settings_select_own on public.user_settings for select using (user_id = auth.uid());
create policy user_settings_insert_own on public.user_settings for insert with check (user_id = auth.uid());
create policy user_settings_update_own on public.user_settings for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_settings_delete_own on public.user_settings for delete using (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('plant-photos', 'plant-photos', false)
on conflict (id) do update set public = false;

drop policy if exists plant_photos_storage_select_own on storage.objects;
drop policy if exists plant_photos_storage_insert_own on storage.objects;
drop policy if exists plant_photos_storage_update_own on storage.objects;
drop policy if exists plant_photos_storage_delete_own on storage.objects;

create policy plant_photos_storage_select_own
on storage.objects for select
using (bucket_id = 'plant-photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy plant_photos_storage_insert_own
on storage.objects for insert
with check (bucket_id = 'plant-photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy plant_photos_storage_update_own
on storage.objects for update
using (bucket_id = 'plant-photos' and auth.uid()::text = (storage.foldername(name))[1])
with check (bucket_id = 'plant-photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy plant_photos_storage_delete_own
on storage.objects for delete
using (bucket_id = 'plant-photos' and auth.uid()::text = (storage.foldername(name))[1]);
