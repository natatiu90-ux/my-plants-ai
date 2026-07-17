create table if not exists public.plant_recommendation_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plant_id uuid not null references public.plants(id) on delete cascade,
  analysis_id uuid not null references public.plant_analyses(id) on delete restrict,
  recommendations jsonb not null default '[]'::jsonb,
  structured_result jsonb not null default '{}'::jsonb,
  reason text,
  changed_context jsonb not null default '{}'::jsonb,
  context_snapshot jsonb not null default '{}'::jsonb,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists plant_recommendation_revisions_plant_idx
  on public.plant_recommendation_revisions (plant_id, created_at desc);

create index if not exists plant_recommendation_revisions_analysis_idx
  on public.plant_recommendation_revisions (analysis_id);

create unique index if not exists plant_recommendation_revisions_one_current_idx
  on public.plant_recommendation_revisions (user_id, plant_id)
  where is_current;

create or replace function public.set_plant_recommendation_revision_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_plant_recommendation_revision_updated_at
  on public.plant_recommendation_revisions;

create trigger set_plant_recommendation_revision_updated_at
before update on public.plant_recommendation_revisions
for each row execute function public.set_plant_recommendation_revision_updated_at();

alter table public.plant_recommendation_revisions enable row level security;

drop policy if exists "Users can read own recommendation revisions" on public.plant_recommendation_revisions;
create policy "Users can read own recommendation revisions"
  on public.plant_recommendation_revisions
  for select
  using (user_id = auth.uid());

drop policy if exists "Users can insert own recommendation revisions" on public.plant_recommendation_revisions;
create policy "Users can insert own recommendation revisions"
  on public.plant_recommendation_revisions
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.plants p
      where p.id = plant_recommendation_revisions.plant_id
        and p.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.plant_analyses a
      where a.id = plant_recommendation_revisions.analysis_id
        and a.plant_id = plant_recommendation_revisions.plant_id
        and a.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update own recommendation revisions" on public.plant_recommendation_revisions;
create policy "Users can update own recommendation revisions"
  on public.plant_recommendation_revisions
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete own recommendation revisions" on public.plant_recommendation_revisions;
create policy "Users can delete own recommendation revisions"
  on public.plant_recommendation_revisions
  for delete
  using (user_id = auth.uid());

create or replace function public.create_plant_recommendation_revision(
  target_plant_id uuid,
  source_analysis_id uuid,
  recommendations_input jsonb,
  structured_result_input jsonb,
  reason_input text,
  changed_context_input jsonb,
  context_snapshot_input jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  revision_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.plants
    where id = target_plant_id
      and user_id = current_user_id
  ) then
    raise exception 'Plant not found or not owned by current user' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.plant_analyses
    where id = source_analysis_id
      and plant_id = target_plant_id
      and user_id = current_user_id
  ) then
    raise exception 'Analysis not found or not owned by current user' using errcode = '42501';
  end if;

  update public.plant_recommendation_revisions
  set is_current = false
  where user_id = current_user_id
    and plant_id = target_plant_id
    and is_current;

  insert into public.plant_recommendation_revisions (
    user_id,
    plant_id,
    analysis_id,
    recommendations,
    structured_result,
    reason,
    changed_context,
    context_snapshot,
    is_current
  )
  values (
    current_user_id,
    target_plant_id,
    source_analysis_id,
    coalesce(recommendations_input, '[]'::jsonb),
    coalesce(structured_result_input, '{}'::jsonb),
    reason_input,
    coalesce(changed_context_input, '{}'::jsonb),
    coalesce(context_snapshot_input, '{}'::jsonb),
    true
  )
  returning id into revision_id;

  return revision_id;
end;
$$;

grant execute on function public.create_plant_recommendation_revision(
  uuid,
  uuid,
  jsonb,
  jsonb,
  text,
  jsonb,
  jsonb
) to authenticated;
