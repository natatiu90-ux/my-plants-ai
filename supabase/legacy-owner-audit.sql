-- Read-only audit for pre-email-auth ownership cleanup.
-- Run in Supabase SQL editor before configuring LEGACY_OWNER_ID.

with owners as (
  select user_id from public.plants
  union select user_id from public.plant_photos
  union select user_id from public.plant_milestones
  union select user_id from public.care_events
  union select user_id from public.plant_analyses
  union select user_id from public.plant_hypothesis_resolutions
  union select user_id from public.push_subscriptions
  union select user_id from public.notification_deliveries
  union select user_id from public.user_settings
)
select
  owners.user_id as owner_id,
  (select count(*) from public.plants where user_id = owners.user_id) as plant_count,
  (select count(*) from public.plant_photos where user_id = owners.user_id) as photo_count,
  (select count(*) from public.plant_milestones where user_id = owners.user_id) as milestone_count,
  (select count(*) from public.care_events where user_id = owners.user_id) as care_event_count,
  (select count(*) from public.plant_analyses where user_id = owners.user_id) as analysis_count,
  (select count(*) from public.plant_hypothesis_resolutions where user_id = owners.user_id) as hypothesis_resolution_count,
  (select count(*) from public.push_subscriptions where user_id = owners.user_id) as push_subscription_count,
  (select count(*) from public.notification_deliveries where user_id = owners.user_id) as notification_delivery_count,
  (select count(*) from public.user_settings where user_id = owners.user_id) as settings_count
from owners
order by plant_count desc, photo_count desc;

select 'plant_photos_without_owned_plant' as issue, count(*) as count
from public.plant_photos photo
left join public.plants plant on plant.id = photo.plant_id and plant.user_id = photo.user_id
where plant.id is null
union all
select 'milestones_without_owned_plant', count(*)
from public.plant_milestones milestone
left join public.plants plant on plant.id = milestone.plant_id and plant.user_id = milestone.user_id
where plant.id is null
union all
select 'care_events_without_owned_plant', count(*)
from public.care_events event
left join public.plants plant on plant.id = event.plant_id and plant.user_id = event.user_id
where plant.id is null
union all
select 'analyses_without_owned_plant', count(*)
from public.plant_analyses analysis
left join public.plants plant on plant.id = analysis.plant_id and plant.user_id = analysis.user_id
where plant.id is null
union all
select 'hypothesis_resolutions_without_owned_plant', count(*)
from public.plant_hypothesis_resolutions resolution
left join public.plants plant on plant.id = resolution.plant_id and plant.user_id = resolution.user_id
where plant.id is null
union all
select 'notification_deliveries_without_owned_plant', count(*)
from public.notification_deliveries delivery
left join public.plants plant on plant.id = delivery.plant_id and plant.user_id = delivery.user_id
where plant.id is null;

select
  user_id,
  lower(coalesce(home_name, '')) as normalized_home_name,
  lower(coalesce(scientific_name, species_name, '')) as normalized_species,
  count(*) as duplicate_count,
  array_agg(id order by created_at desc) as plant_ids
from public.plants
group by user_id, lower(coalesce(home_name, '')), lower(coalesce(scientific_name, species_name, ''))
having count(*) > 1
order by duplicate_count desc;
