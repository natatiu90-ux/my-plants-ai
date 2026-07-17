create or replace function public.import_legacy_plants_to_home(
  target_home_id uuid,
  home_input jsonb,
  room_imports jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  existing_home_count integer;
  import_home_id uuid;
  room_item jsonb;
  created_room_id uuid;
  existing_room_home_id uuid;
  legacy_key text;
  room_name text;
  plant_ids uuid[];
  all_selected_plant_ids uuid[];
  invalid_plant_count integer;
  duplicate_plant_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication is required to import plants.'
      using errcode = '42501';
  end if;

  select coalesce(array_agg(plant_id_values.plant_id::uuid), array[]::uuid[]) into all_selected_plant_ids
  from jsonb_array_elements(coalesce(room_imports, '[]'::jsonb)) as rooms(value)
  cross join lateral jsonb_array_elements_text(coalesce(rooms.value->'plantIds', '[]'::jsonb)) as plant_id_values(plant_id);

  select count(*) into duplicate_plant_count
  from (
    select selected_id
    from unnest(all_selected_plant_ids) as selected_ids(selected_id)
    group by selected_id
    having count(*) > 1
  ) duplicated_ids;

  if duplicate_plant_count > 0 then
    raise exception 'The same plant was selected for more than one imported room.'
      using errcode = '23505';
  end if;

  if cardinality(all_selected_plant_ids) > 0 then
    select count(*) into invalid_plant_count
    from unnest(all_selected_plant_ids) as requested_plant_id(id)
    left join public.plants p
      on p.id = requested_plant_id.id
     and p.user_id = current_user_id
     and p.home_id is null
    where p.id is null;

    if invalid_plant_count > 0 then
      raise exception 'One or more selected plants are not eligible for import.'
        using errcode = '42501';
    end if;
  end if;

  if target_home_id is null then
    select count(*) into existing_home_count
    from public.homes
    where user_id = current_user_id;

    if existing_home_count > 0 then
      raise exception 'First-home import can only create a home before any home exists.'
        using errcode = '23505';
    end if;

    insert into public.homes (
      user_id,
      name,
      city,
      country,
      home_type,
      humidity_level,
      has_air_conditioning,
      notes
    )
    values (
      current_user_id,
      coalesce(nullif(btrim(home_input->>'name'), ''), 'Home'),
      nullif(btrim(home_input->>'city'), ''),
      nullif(btrim(home_input->>'country'), ''),
      nullif(home_input->>'type', ''),
      nullif(home_input->>'humidityLevel', ''),
      case
        when home_input ? 'hasAirConditioning' then (home_input->>'hasAirConditioning')::boolean
        else null
      end,
      nullif(btrim(home_input->>'notes'), '')
    )
    returning id into import_home_id;
  else
    select id into import_home_id
    from public.homes
    where id = target_home_id
      and user_id = current_user_id;

    if import_home_id is null then
      raise exception 'Home not found or not owned by current user.'
        using errcode = '42501';
    end if;
  end if;

  for room_item in select * from jsonb_array_elements(coalesce(room_imports, '[]'::jsonb))
  loop
    select coalesce(array_agg(plant_id_values.plant_id::uuid), array[]::uuid[]) into plant_ids
    from jsonb_array_elements_text(coalesce(room_item->'plantIds', '[]'::jsonb)) as plant_id_values(plant_id);

    if coalesce((room_item->>'include')::boolean, true) then
      legacy_key := nullif(room_item->>'legacyKey', '');
      room_name := nullif(btrim(room_item->>'name'), '');

      if room_name is null then
        raise exception 'Imported room name cannot be empty.'
          using errcode = '23514';
      end if;

      select id, home_id into created_room_id, existing_room_home_id
      from public.rooms
      where user_id = current_user_id
        and lower(btrim(name)) = lower(btrim(room_name))
        and (home_id = import_home_id or home_id is null)
      order by (home_id = import_home_id) desc
      limit 1;

      if created_room_id is null then
        insert into public.rooms (user_id, home_id, name, is_custom)
        values (current_user_id, import_home_id, room_name, true)
        returning id into created_room_id;
      elsif existing_room_home_id is null then
        update public.rooms
        set home_id = import_home_id,
            is_custom = true
        where id = created_room_id
          and user_id = current_user_id
          and home_id is null;
      end if;

      if cardinality(plant_ids) > 0 then
        update public.plants
        set home_id = import_home_id,
            room_id = created_room_id,
            room_key = null
        where user_id = current_user_id
          and home_id is null
          and id = any(plant_ids);
      elsif legacy_key is not null then
        update public.plants
        set home_id = import_home_id,
            room_id = created_room_id,
            room_key = null
        where user_id = current_user_id
          and home_id is null
          and (room_id::text = legacy_key or room_key = legacy_key);
      end if;
    end if;
  end loop;

  update public.plants
  set home_id = import_home_id,
      room_id = null,
      position_in_room = null
  where user_id = current_user_id
    and home_id is null;

  return import_home_id;
end;
$$;

create or replace function public.create_first_home_with_legacy_import(
  home_input jsonb,
  room_imports jsonb
)
returns uuid
language sql
security invoker
set search_path = public
as $$
  select public.import_legacy_plants_to_home(null, home_input, room_imports);
$$;

revoke all on function public.import_legacy_plants_to_home(uuid, jsonb, jsonb) from public;
grant execute on function public.import_legacy_plants_to_home(uuid, jsonb, jsonb) to authenticated;

revoke all on function public.create_first_home_with_legacy_import(jsonb, jsonb) from public;
grant execute on function public.create_first_home_with_legacy_import(jsonb, jsonb) to authenticated;
