alter table public.plants
add column if not exists room_key text;

with duplicate_rooms as (
  select
    id,
    first_value(id) over (
      partition by user_id, lower(btrim(name))
      order by created_at asc, id asc
    ) as keep_id
  from public.rooms
  where is_custom = true
),
rooms_to_merge as (
  select id, keep_id
  from duplicate_rooms
  where id <> keep_id
)
update public.plants
set room_id = rooms_to_merge.keep_id
from rooms_to_merge
where public.plants.room_id = rooms_to_merge.id;

with duplicate_rooms as (
  select
    id,
    first_value(id) over (
      partition by user_id, lower(btrim(name))
      order by created_at asc, id asc
    ) as keep_id
  from public.rooms
  where is_custom = true
),
rooms_to_delete as (
  select id
  from duplicate_rooms
  where id <> keep_id
)
delete from public.rooms
using rooms_to_delete
where public.rooms.id = rooms_to_delete.id;

create unique index if not exists rooms_user_normalized_name_unique
on public.rooms (user_id, lower(btrim(name)))
where is_custom = true;
