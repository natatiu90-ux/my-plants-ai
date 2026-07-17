alter table public.plant_recommendation_revisions
  add column if not exists reason_type text,
  add column if not exists reason_text text,
  add column if not exists prompt_version text,
  add column if not exists recommendation_version integer,
  add column if not exists model_version text,
  add column if not exists impact_level text,
  add column if not exists change_summary jsonb;

update public.plant_recommendation_revisions
set
  reason_type = coalesce(reason_type, 'unknown_legacy'),
  reason_text = coalesce(reason_text, reason),
  prompt_version = coalesce(prompt_version, 'recommendation-refresh-v1'),
  recommendation_version = coalesce(recommendation_version, 1),
  impact_level = coalesce(impact_level, 'none'),
  change_summary = coalesce(change_summary, '{}'::jsonb)
where reason_type is null
   or reason_text is null
   or prompt_version is null
   or recommendation_version is null
   or impact_level is null
   or change_summary is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'plant_recommendation_revisions_reason_type_check'
      and conrelid = 'public.plant_recommendation_revisions'::regclass
  ) then
    alter table public.plant_recommendation_revisions
      add constraint plant_recommendation_revisions_reason_type_check
      check (
        reason_type is null
        or reason_type in (
          'room_changed',
          'home_changed',
          'plant_location_changed',
          'light_changed',
          'direct_sun_changed',
          'temperature_changed',
          'humidity_changed',
          'air_conditioning_changed',
          'soil_changed',
          'watering_changed',
          'repotting_changed',
          'care_history_changed',
          'prompt_updated',
          'model_updated',
          'manual_refresh',
          'mixed_context_changes',
          'unknown_legacy'
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'plant_recommendation_revisions_impact_level_check'
      and conrelid = 'public.plant_recommendation_revisions'::regclass
  ) then
    alter table public.plant_recommendation_revisions
      add constraint plant_recommendation_revisions_impact_level_check
      check (
        impact_level is null
        or impact_level in ('none', 'minor', 'moderate', 'major')
      );
  end if;
end;
$$;

drop function if exists public.create_plant_recommendation_revision(
  uuid,
  uuid,
  jsonb,
  jsonb,
  text,
  jsonb,
  jsonb
);

create or replace function public.create_plant_recommendation_revision(
  target_plant_id uuid,
  source_analysis_id uuid,
  recommendations_input jsonb,
  structured_result_input jsonb,
  reason_type_input text,
  reason_text_input text,
  changed_context_input jsonb,
  context_snapshot_input jsonb,
  prompt_version_input text,
  recommendation_version_input integer,
  model_version_input text,
  impact_level_input text,
  change_summary_input jsonb
)
returns jsonb
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

  if reason_type_input is not null and reason_type_input not in (
    'room_changed',
    'home_changed',
    'plant_location_changed',
    'light_changed',
    'direct_sun_changed',
    'temperature_changed',
    'humidity_changed',
    'air_conditioning_changed',
    'soil_changed',
    'watering_changed',
    'repotting_changed',
    'care_history_changed',
    'prompt_updated',
    'model_updated',
    'manual_refresh',
    'mixed_context_changes',
    'unknown_legacy'
  ) then
    raise exception 'Unsupported recommendation revision reason type: %', reason_type_input using errcode = '22000';
  end if;

  if impact_level_input is not null and impact_level_input not in ('none', 'minor', 'moderate', 'major') then
    raise exception 'Unsupported recommendation revision impact level: %', impact_level_input using errcode = '22000';
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
    reason_type,
    reason_text,
    changed_context,
    context_snapshot,
    prompt_version,
    recommendation_version,
    model_version,
    impact_level,
    change_summary,
    is_current
  )
  values (
    current_user_id,
    target_plant_id,
    source_analysis_id,
    coalesce(recommendations_input, '[]'::jsonb),
    coalesce(structured_result_input, '{}'::jsonb),
    reason_text_input,
    coalesce(reason_type_input, 'manual_refresh'),
    reason_text_input,
    coalesce(changed_context_input, '{}'::jsonb),
    coalesce(context_snapshot_input, '{}'::jsonb),
    coalesce(prompt_version_input, 'recommendation-refresh-v1'),
    coalesce(recommendation_version_input, 1),
    model_version_input,
    coalesce(impact_level_input, 'none'),
    coalesce(change_summary_input, '{}'::jsonb),
    true
  )
  returning id into revision_id;

  return jsonb_build_object(
    'created', true,
    'unchanged', false,
    'revision_id', revision_id
  );
end;
$$;

grant execute on function public.create_plant_recommendation_revision(
  uuid,
  uuid,
  jsonb,
  jsonb,
  text,
  text,
  jsonb,
  jsonb,
  text,
  integer,
  text,
  text,
  jsonb
) to authenticated;
