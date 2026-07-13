do $$
begin
  if to_regclass('public.plant_hypothesis_resolutions') is not null then
    if exists (select 1 from pg_constraint where conname = 'plant_hypothesis_resolutions_hypothesis_check') then
      alter table public.plant_hypothesis_resolutions drop constraint plant_hypothesis_resolutions_hypothesis_check;
    end if;

    with normalized as (
      select
        id,
        case hypothesis
          when 'watering' then 'soil_condition'
          when 'old_compacted_soil' then 'repotting'
          when 'recent_repotting' then 'repotting'
          when 'sun_stress' then 'direct_sun'
          else hypothesis
        end as canonical_hypothesis,
        row_number() over (
          partition by user_id, plant_id,
            case hypothesis
              when 'watering' then 'soil_condition'
              when 'old_compacted_soil' then 'repotting'
              when 'recent_repotting' then 'repotting'
              when 'sun_stress' then 'direct_sun'
              else hypothesis
            end
          order by resolved_at desc nulls last, created_at desc nulls last, id desc
        ) as duplicate_rank
      from public.plant_hypothesis_resolutions
    )
    delete from public.plant_hypothesis_resolutions resolutions
    using normalized
    where resolutions.id = normalized.id
      and normalized.duplicate_rank > 1;

    update public.plant_hypothesis_resolutions
    set hypothesis = case hypothesis
      when 'watering' then 'soil_condition'
      when 'old_compacted_soil' then 'repotting'
      when 'recent_repotting' then 'repotting'
      when 'sun_stress' then 'direct_sun'
      else hypothesis
    end
    where hypothesis in ('watering', 'old_compacted_soil', 'recent_repotting', 'sun_stress');

    alter table public.plant_hypothesis_resolutions add constraint plant_hypothesis_resolutions_hypothesis_check check (
      hypothesis in ('soil_condition', 'repotting', 'root_condition', 'drainage', 'direct_sun', 'pests')
    );
  end if;
end $$;
