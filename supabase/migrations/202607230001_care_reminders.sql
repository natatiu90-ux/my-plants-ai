create table if not exists public.care_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plant_id uuid not null references public.plants(id) on delete cascade,
  reminder_type text not null,
  action_key text not null,
  due_at timestamptz not null,
  timezone text,
  due_cycle_key text not null,
  status text not null default 'scheduled',
  sent_at timestamptz,
  failed_at timestamptz,
  failure_count integer not null default 0,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'care_reminders_type_check') then
    alter table public.care_reminders add constraint care_reminders_type_check
      check (reminder_type in ('soil_check'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'care_reminders_status_check') then
    alter table public.care_reminders add constraint care_reminders_status_check
      check (status in ('scheduled', 'sent', 'failed', 'cancelled'));
  end if;
end $$;

create unique index if not exists care_reminders_one_scheduled_type_per_plant_idx
on public.care_reminders(plant_id, reminder_type)
where status = 'scheduled';

create index if not exists care_reminders_due_idx
on public.care_reminders(status, due_at);

create index if not exists care_reminders_user_plant_idx
on public.care_reminders(user_id, plant_id, created_at desc);

alter table public.care_reminders enable row level security;

drop policy if exists care_reminders_select_own on public.care_reminders;
drop policy if exists care_reminders_insert_own on public.care_reminders;
drop policy if exists care_reminders_update_own on public.care_reminders;

create policy care_reminders_select_own on public.care_reminders
for select using (user_id = auth.uid());

create policy care_reminders_insert_own on public.care_reminders
for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.plants
    where plants.id = care_reminders.plant_id
      and plants.user_id = auth.uid()
  )
);

create policy care_reminders_update_own on public.care_reminders
for update using (
  user_id = auth.uid()
  and exists (
    select 1 from public.plants
    where plants.id = care_reminders.plant_id
      and plants.user_id = auth.uid()
  )
) with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.plants
    where plants.id = care_reminders.plant_id
      and plants.user_id = auth.uid()
  )
);

drop trigger if exists care_reminders_set_updated_at on public.care_reminders;
create trigger care_reminders_set_updated_at
before update on public.care_reminders
for each row execute function public.set_updated_at();
