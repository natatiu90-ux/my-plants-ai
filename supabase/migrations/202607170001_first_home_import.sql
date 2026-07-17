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
  legacy_key text;
  room_name text;
  plant_ids uuid[];
  invalid_plant_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication is required to import plants.'
      using errcode = '42501';
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
    select coalesce(array_agg(value::uuid), array[]::uuid[]) into plant_ids
    from jsonb_array_elements_text(coalesce(room_item->'plantIds', '[]'::jsonb)) as plant_id_values(value);

    if cardinality(plant_ids) > 0 then
      select count(*) into invalid_plant_count
      from unnest(plant_ids) as requested_plant_id(id)
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

    if coalesce((room_item->>'include')::boolean, true) then
      legacy_key := nullif(room_item->>'legacyKey', '');
      room_name := nullif(btrim(room_item->>'name'), '');

      if room_name is null then
        raise exception 'Imported room name cannot be empty.'
          using errcode = '23514';
      end if;

      select id into created_room_id
      from public.rooms
      where user_id = current_user_id
        and home_id = import_home_id
        and lower(btrim(name)) = lower(btrim(room_name))
      limit 1;

      if created_room_id is null then
        insert into public.rooms (user_id, home_id, name, is_custom)
        values (current_user_id, import_home_id, room_name, true)
        returning id into created_room_id;
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
