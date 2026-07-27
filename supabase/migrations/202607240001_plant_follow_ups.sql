create table if not exists public.plant_follow_ups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plant_id uuid not null references public.plants(id) on delete cascade,
  reason text not null,
  task_type text not null default 'add_photo',
  due_at timestamptz not null,
  status text not null default 'scheduled',
  source_event_id uuid references public.care_events(id) on delete set null,
  source_milestone_id uuid references public.plant_milestones(id) on delete set null,
  required_inputs jsonb not null default '[]'::jsonb,
  completed_photo_ids uuid[] not null default '{}',
  completed_input_ids jsonb not null default '{}'::jsonb,
  result text,
  summary jsonb not null default '{}'::jsonb,
  timeline_entry jsonb not null default '{}'::jsonb,
  comparison jsonb not null default '{}'::jsonb,
  next_follow_up_at timestamptz,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plant_follow_ups_reason_check') then
    alter table public.plant_follow_ups add constraint plant_follow_ups_reason_check
      check (reason in ('after_repotting', 'after_pruning', 'recovery_monitoring', 'species_uncertain', 'stable'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'plant_follow_ups_status_check') then
    alter table public.plant_follow_ups add constraint plant_follow_ups_status_check
      check (status in ('scheduled', 'due', 'completed', 'skipped'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'plant_follow_ups_task_type_check') then
    alter table public.plant_follow_ups add constraint plant_follow_ups_task_type_check
      check (task_type in ('add_photo', 'check_moisture', 'rotate_plant', 'inspect_new_growth', 'inspect_roots'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'plant_follow_ups_result_check') then
    alter table public.plant_follow_ups add constraint plant_follow_ups_result_check
      check (result is null or result in ('improved', 'stable', 'worse', 'unclear'));
  end if;
end $$;

create index if not exists plant_follow_ups_user_due_idx
on public.plant_follow_ups(user_id, status, due_at);

create index if not exists plant_follow_ups_plant_due_idx
on public.plant_follow_ups(plant_id, status, due_at);

create unique index if not exists plant_follow_ups_one_active_per_milestone_idx
on public.plant_follow_ups(user_id, plant_id, reason, source_milestone_id)
where status in ('scheduled', 'due') and source_milestone_id is not null;

create unique index if not exists plant_follow_ups_one_active_per_event_idx
on public.plant_follow_ups(user_id, plant_id, reason, source_event_id)
where status in ('scheduled', 'due') and source_event_id is not null;

create unique index if not exists plant_follow_ups_one_active_reason_without_source_idx
on public.plant_follow_ups(user_id, plant_id, reason)
where status in ('scheduled', 'due') and source_milestone_id is null and source_event_id is null;

drop trigger if exists plant_follow_ups_set_updated_at on public.plant_follow_ups;
create trigger plant_follow_ups_set_updated_at
before update on public.plant_follow_ups
for each row execute function public.set_updated_at();

alter table public.plant_follow_ups enable row level security;

drop policy if exists plant_follow_ups_select_own on public.plant_follow_ups;
drop policy if exists plant_follow_ups_insert_own on public.plant_follow_ups;
drop policy if exists plant_follow_ups_update_own on public.plant_follow_ups;
drop policy if exists plant_follow_ups_delete_own on public.plant_follow_ups;

create policy plant_follow_ups_select_own on public.plant_follow_ups
for select using (user_id = auth.uid());

create policy plant_follow_ups_insert_own on public.plant_follow_ups
for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.plants
    where plants.id = plant_follow_ups.plant_id
      and plants.user_id = auth.uid()
  )
);

create policy plant_follow_ups_update_own on public.plant_follow_ups
for update using (
  user_id = auth.uid()
  and exists (
    select 1 from public.plants
    where plants.id = plant_follow_ups.plant_id
      and plants.user_id = auth.uid()
  )
) with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.plants
    where plants.id = plant_follow_ups.plant_id
      and plants.user_id = auth.uid()
  )
);

create policy plant_follow_ups_delete_own on public.plant_follow_ups
for delete using (
  user_id = auth.uid()
  and exists (
    select 1 from public.plants
    where plants.id = plant_follow_ups.plant_id
      and plants.user_id = auth.uid()
  )
);

alter table public.care_reminders drop constraint if exists care_reminders_type_check;
alter table public.care_reminders add constraint care_reminders_type_check
  check (reminder_type in ('soil_check', 'follow_up_task'));
