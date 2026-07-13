alter table public.plants
  add column if not exists last_soil_checked_at timestamptz,
  add column if not exists last_soil_result text,
  add column if not exists care_schedule_status text not null default 'active',
  add column if not exists notification_enabled boolean not null default true,
  add column if not exists last_notification_sent_at timestamptz,
  add column if not exists notification_due_cycle_key text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plants_last_soil_result_check') then
    alter table public.plants add constraint plants_last_soil_result_check check (
      last_soil_result is null or last_soil_result in ('dry', 'slightly_damp', 'very_wet', 'not_sure')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'plants_care_schedule_status_check') then
    alter table public.plants add constraint plants_care_schedule_status_check check (care_schedule_status in ('active', 'paused', 'needs_first_check'));
  end if;
end $$;

alter table public.user_settings
  add column if not exists care_notifications_enabled boolean not null default false,
  add column if not exists preferred_notification_time time not null default time '09:00',
  add column if not exists quiet_hours_start time,
  add column if not exists quiet_hours_end time,
  add column if not exists timezone text,
  add column if not exists notification_locale text;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  timezone text,
  locale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer not null default 0
);

create unique index if not exists push_subscriptions_active_endpoint_unique
on public.push_subscriptions(endpoint)
where disabled_at is null;

create index if not exists push_subscriptions_user_active_idx
on public.push_subscriptions(user_id)
where disabled_at is null;

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plant_id uuid not null references public.plants(id) on delete cascade,
  subscription_id uuid references public.push_subscriptions(id) on delete set null,
  notification_type text not null,
  due_cycle_key text not null,
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  opened_at timestamptz,
  status text not null default 'pending',
  error_code text,
  created_at timestamptz not null default now()
);

create unique index if not exists notification_deliveries_cycle_subscription_unique
on public.notification_deliveries(plant_id, subscription_id, notification_type, due_cycle_key);

create index if not exists notification_deliveries_user_plant_idx
on public.notification_deliveries(user_id, plant_id, created_at desc);

create index if not exists plants_due_notifications_idx
on public.plants(user_id, next_check_at)
where notification_enabled = true;

alter table public.push_subscriptions enable row level security;
alter table public.notification_deliveries enable row level security;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
drop policy if exists notification_deliveries_select_own on public.notification_deliveries;

create policy push_subscriptions_select_own on public.push_subscriptions for select using (user_id = auth.uid());
create policy push_subscriptions_insert_own on public.push_subscriptions for insert with check (user_id = auth.uid());
create policy push_subscriptions_update_own on public.push_subscriptions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_subscriptions_delete_own on public.push_subscriptions for delete using (user_id = auth.uid());
create policy notification_deliveries_select_own on public.notification_deliveries for select using (user_id = auth.uid());

drop trigger if exists push_subscriptions_set_updated_at on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at before update on public.push_subscriptions for each row execute function public.set_updated_at();
