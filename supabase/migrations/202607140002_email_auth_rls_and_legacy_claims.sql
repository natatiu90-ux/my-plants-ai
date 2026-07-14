create table if not exists public.legacy_account_claims (
  id uuid primary key default gen_random_uuid(),
  legacy_user_id uuid not null unique,
  claimed_by uuid not null references auth.users(id) on delete cascade,
  claimed_email text,
  plants_count integer not null default 0,
  photos_moved integer not null default 0,
  claimed_at timestamptz not null default now()
);

create unique index if not exists legacy_account_claims_claimed_by_unique
  on public.legacy_account_claims(claimed_by);

alter table public.legacy_account_claims enable row level security;

drop policy if exists legacy_account_claims_select_own on public.legacy_account_claims;
create policy legacy_account_claims_select_own
on public.legacy_account_claims for select
using (claimed_by = auth.uid());

create or replace function public.is_email_authenticated_user()
returns boolean
language sql
stable
as $$
  select auth.uid() is not null
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
$$;

do $$
declare
  missing_core_tables text[];
begin
  select array_agg(table_name)
  into missing_core_tables
  from unnest(array[
    'profiles',
    'homes',
    'rooms',
    'plants',
    'plant_photos',
    'plant_milestones',
    'care_events',
    'plant_analyses',
    'user_settings'
  ]) as table_name
  where to_regclass('public.' || table_name) is null;

  if missing_core_tables is not null then
    raise exception 'Required core tables are missing: %', array_to_string(missing_core_tables, ', ');
  end if;
end $$;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_select_own on public.profiles for select using (id = auth.uid() and public.is_email_authenticated_user());
create policy profiles_insert_own on public.profiles for insert with check (id = auth.uid() and public.is_email_authenticated_user());
create policy profiles_update_own on public.profiles for update using (id = auth.uid() and public.is_email_authenticated_user()) with check (id = auth.uid() and public.is_email_authenticated_user());
create policy profiles_delete_own on public.profiles for delete using (id = auth.uid() and public.is_email_authenticated_user());

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
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
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_select_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_insert_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_update_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_delete_own', table_name);

    execute format('create policy %I on public.%I for select using (user_id = auth.uid() and public.is_email_authenticated_user())', table_name || '_select_own', table_name);
    execute format('create policy %I on public.%I for insert with check (user_id = auth.uid() and public.is_email_authenticated_user())', table_name || '_insert_own', table_name);
    execute format('create policy %I on public.%I for update using (user_id = auth.uid() and public.is_email_authenticated_user()) with check (user_id = auth.uid() and public.is_email_authenticated_user())', table_name || '_update_own', table_name);
    execute format('create policy %I on public.%I for delete using (user_id = auth.uid() and public.is_email_authenticated_user())', table_name || '_delete_own', table_name);
  end loop;
end $$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'push_subscriptions',
    'notification_deliveries',
    'plant_hypothesis_resolutions',
    'account_recovery_codes'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('drop policy if exists %I on public.%I', table_name || '_select_own', table_name);
      execute format('drop policy if exists %I on public.%I', table_name || '_insert_own', table_name);
      execute format('drop policy if exists %I on public.%I', table_name || '_update_own', table_name);
      execute format('drop policy if exists %I on public.%I', table_name || '_delete_own', table_name);

      execute format('create policy %I on public.%I for select using (user_id = auth.uid() and public.is_email_authenticated_user())', table_name || '_select_own', table_name);
      execute format('create policy %I on public.%I for insert with check (user_id = auth.uid() and public.is_email_authenticated_user())', table_name || '_insert_own', table_name);
      execute format('create policy %I on public.%I for update using (user_id = auth.uid() and public.is_email_authenticated_user()) with check (user_id = auth.uid() and public.is_email_authenticated_user())', table_name || '_update_own', table_name);
      execute format('create policy %I on public.%I for delete using (user_id = auth.uid() and public.is_email_authenticated_user())', table_name || '_delete_own', table_name);
    end if;
  end loop;
end $$;

do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists plant_photos_storage_select_own on storage.objects;
    drop policy if exists plant_photos_storage_insert_own on storage.objects;
    drop policy if exists plant_photos_storage_update_own on storage.objects;
    drop policy if exists plant_photos_storage_delete_own on storage.objects;

    create policy plant_photos_storage_select_own
    on storage.objects for select
    using (bucket_id = 'plant-photos' and auth.uid()::text = (storage.foldername(name))[1] and public.is_email_authenticated_user());

    create policy plant_photos_storage_insert_own
    on storage.objects for insert
    with check (bucket_id = 'plant-photos' and auth.uid()::text = (storage.foldername(name))[1] and public.is_email_authenticated_user());

    create policy plant_photos_storage_update_own
    on storage.objects for update
    using (bucket_id = 'plant-photos' and auth.uid()::text = (storage.foldername(name))[1] and public.is_email_authenticated_user())
    with check (bucket_id = 'plant-photos' and auth.uid()::text = (storage.foldername(name))[1] and public.is_email_authenticated_user());

    create policy plant_photos_storage_delete_own
    on storage.objects for delete
    using (bucket_id = 'plant-photos' and auth.uid()::text = (storage.foldername(name))[1] and public.is_email_authenticated_user());
  end if;
end $$;
