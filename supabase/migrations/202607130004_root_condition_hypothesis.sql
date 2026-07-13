do $$
begin
  if exists (select 1 from pg_constraint where conname = 'plant_hypothesis_resolutions_hypothesis_check') then
    alter table public.plant_hypothesis_resolutions drop constraint plant_hypothesis_resolutions_hypothesis_check;
  end if;

  alter table public.plant_hypothesis_resolutions add constraint plant_hypothesis_resolutions_hypothesis_check check (
    hypothesis in ('pests', 'sun_stress', 'old_compacted_soil', 'recent_repotting', 'watering', 'root_condition')
  );
end $$;
