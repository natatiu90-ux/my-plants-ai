do $$
begin
  if to_regclass('public.plant_hypothesis_resolutions') is not null then
    delete from public.plant_hypothesis_resolutions legacy
    using public.plant_hypothesis_resolutions canonical
    where legacy.user_id = canonical.user_id
      and legacy.plant_id = canonical.plant_id
      and canonical.hypothesis = case legacy.hypothesis
        when 'watering' then 'soil_condition'
        when 'old_compacted_soil' then 'repotting'
        when 'recent_repotting' then 'repotting'
        when 'sun_stress' then 'direct_sun'
        else legacy.hypothesis
      end
      and legacy.hypothesis in ('watering', 'old_compacted_soil', 'recent_repotting', 'sun_stress');

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
