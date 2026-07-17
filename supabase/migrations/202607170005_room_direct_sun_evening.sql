alter table public.rooms
  drop constraint if exists rooms_direct_sun_check;

update public.rooms
set direct_sun = case direct_sun
  when 'afternoon' then 'midday'
  when 'all_day' then 'most_of_day'
  when 'unknown' then 'unsure'
  else direct_sun
end
where direct_sun in ('afternoon', 'all_day', 'unknown');

alter table public.rooms
  add constraint rooms_direct_sun_check
  check (
    direct_sun is null
    or direct_sun in (
      'none',
      'morning',
      'midday',
      'evening',
      'most_of_day',
      'unsure'
    )
  );
