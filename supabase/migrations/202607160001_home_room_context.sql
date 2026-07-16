alter table public.homes
  add column if not exists country text,
  add column if not exists home_type text,
  add column if not exists humidity_level text,
  add column if not exists has_air_conditioning boolean,
  add column if not exists notes text;

alter table public.rooms
  add column if not exists light_level text,
  add column if not exists direct_sun text,
  add column if not exists temperature_relative text,
  add column if not exists has_air_conditioning text,
  add column if not exists notes text;

alter table public.plants
  add column if not exists position_in_room text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'homes_type_check' and conrelid = 'public.homes'::regclass
  ) then
    alter table public.homes
      add constraint homes_type_check check (home_type in ('apartment', 'house', 'studio', 'other') or home_type is null);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'homes_humidity_check' and conrelid = 'public.homes'::regclass
  ) then
    alter table public.homes
      add constraint homes_humidity_check check (humidity_level in ('dry', 'normal', 'humid', 'unknown') or humidity_level is null);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'rooms_light_level_check' and conrelid = 'public.rooms'::regclass
  ) then
    alter table public.rooms
      add constraint rooms_light_level_check check (light_level in ('low', 'medium_indirect', 'bright_indirect', 'direct_sun', 'unknown') or light_level is null);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'rooms_direct_sun_check' and conrelid = 'public.rooms'::regclass
  ) then
    alter table public.rooms
      add constraint rooms_direct_sun_check check (direct_sun in ('none', 'morning', 'afternoon', 'all_day', 'unknown') or direct_sun is null);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'rooms_temperature_relative_check' and conrelid = 'public.rooms'::regclass
  ) then
    alter table public.rooms
      add constraint rooms_temperature_relative_check check (temperature_relative in ('cool', 'stable', 'warm', 'variable', 'unknown') or temperature_relative is null);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'rooms_air_conditioning_check' and conrelid = 'public.rooms'::regclass
  ) then
    alter table public.rooms
      add constraint rooms_air_conditioning_check check (has_air_conditioning in ('inherit', 'yes', 'no', 'unknown') or has_air_conditioning is null);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'plants_position_in_room_check' and conrelid = 'public.plants'::regclass
  ) then
    alter table public.plants
      add constraint plants_position_in_room_check check (position_in_room in ('window_sill', 'near_window', 'shelf', 'table', 'floor', 'hanging', 'other') or position_in_room is null);
  end if;
end $$;

create index if not exists plants_home_id_idx on public.plants(home_id);
create index if not exists plants_position_in_room_idx on public.plants(position_in_room);
create index if not exists rooms_user_home_idx on public.rooms(user_id, home_id);
create index if not exists homes_user_name_idx on public.homes(user_id, lower(btrim(name)));

create or replace function public.ensure_plant_room_matches_home()
returns trigger
language plpgsql
as $$
declare
  room_home_id uuid;
begin
  if new.room_id is null or new.home_id is null then
    return new;
  end if;

  select home_id into room_home_id
  from public.rooms
  where id = new.room_id and user_id = new.user_id;

  if room_home_id is not null and room_home_id <> new.home_id then
    raise exception 'Plant room must belong to the selected home.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists plants_room_home_match on public.plants;
create trigger plants_room_home_match
before insert or update of home_id, room_id on public.plants
for each row execute function public.ensure_plant_room_matches_home();
