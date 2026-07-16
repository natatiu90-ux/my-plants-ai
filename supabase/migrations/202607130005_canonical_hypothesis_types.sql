do $$
declare
  unknown_values text;
  duplicate_count integer;
begin
  if to_regclass('public.plant_hypothesis_resolutions') is not null then
    select string_agg(distinct hypothesis, ', ' order by hypothesis)
    into unknown_values
    from public.plant_hypothesis_resolutions
    where hypothesis not in (
      'watering',
      'old_compacted_soil',
      'recent_repotting',
      'sun_stress',
      'soil_condition',
      'repotting',
      'root_condition',
      'drainage',
      'direct_sun',
      'pests'
    );

    if unknown_values is not null then
      raise exception 'Unknown plant_hypothesis_resolutions.hypothesis values before canonical migration: %', unknown_values
        using errcode = '23514';
    end if;

    with normalized as (
      select
        user_id,
        plant_id,
        case hypothesis
          when 'watering' then 'soil_condition'
          when 'old_compacted_soil' then 'repotting'
          when 'recent_repotting' then 'repotting'
          when 'sun_stress' then 'direct_sun'
          else hypothesis
        end as canonical_hypothesis,
        count(*) as resolution_count
      from public.plant_hypothesis_resolutions
      group by user_id, plant_id,
        case hypothesis
          when 'watering' then 'soil_condition'
          when 'old_compacted_soil' then 'repotting'
          when 'recent_repotting' then 'repotting'
          when 'sun_stress' then 'direct_sun'
          else hypothesis
        end
    )
    select count(*)
    into duplicate_count
    from normalized
    where resolution_count > 1;

    if duplicate_count > 0 then
      raise exception 'Cannot canonicalize plant_hypothesis_resolutions safely: % user/plant/hypothesis groups would become duplicates.', duplicate_count
        using errcode = '23505';
    end if;

    update public.plant_hypothesis_resolutions
    set hypothesis = case hypothesis
      when 'watering' then 'soil_condition'
      when 'old_compacted_soil' then 'repotting'
      when 'recent_repotting' then 'repotting'
      when 'sun_stress' then 'direct_sun'
      else hypothesis
    end
    where hypothesis in ('watering', 'old_compacted_soil', 'recent_repotting', 'sun_stress');

    if exists (select 1 from pg_constraint where conname = 'plant_hypothesis_resolutions_hypothesis_check') then
      alter table public.plant_hypothesis_resolutions drop constraint plant_hypothesis_resolutions_hypothesis_check;
    end if;

    alter table public.plant_hypothesis_resolutions add constraint plant_hypothesis_resolutions_hypothesis_check check (
      hypothesis in ('soil_condition', 'repotting', 'root_condition', 'drainage', 'direct_sun', 'pests')
    );
  end if;
end $$;
