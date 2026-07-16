do $$
declare
  unknown_values text;
begin
  if to_regclass('public.plant_hypothesis_resolutions') is null then
    return;
  end if;

  if exists (select 1 from pg_constraint where conname = 'plant_hypothesis_resolutions_hypothesis_check') then
    alter table public.plant_hypothesis_resolutions drop constraint plant_hypothesis_resolutions_hypothesis_check;
  end if;

  select string_agg(distinct hypothesis, ', ' order by hypothesis)
  into unknown_values
  from public.plant_hypothesis_resolutions
  where hypothesis not in (
    'pests',
    'sun_stress',
    'old_compacted_soil',
    'recent_repotting',
    'watering',
    'root_condition',
    'drainage',
    'soil_condition',
    'repotting',
    'direct_sun'
  );

  if unknown_values is not null then
    raise exception 'Unknown plant_hypothesis_resolutions.hypothesis values before root_condition migration: %', unknown_values
      using errcode = '23514';
  end if;

  alter table public.plant_hypothesis_resolutions add constraint plant_hypothesis_resolutions_hypothesis_check check (
    hypothesis in (
      'pests',
      'sun_stress',
      'old_compacted_soil',
      'recent_repotting',
      'watering',
      'root_condition',
      'drainage',
      'soil_condition',
      'repotting',
      'direct_sun'
    )
  );
end $$;
