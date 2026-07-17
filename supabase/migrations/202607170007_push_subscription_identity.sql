do $$
begin
  if to_regclass('public.push_subscriptions') is null then
    raise exception 'Required table public.push_subscriptions is missing';
  end if;
end $$;

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, endpoint
      order by
        last_success_at desc nulls last,
        updated_at desc nulls last,
        created_at desc nulls last,
        id desc
    ) as duplicate_rank
  from public.push_subscriptions
  where disabled_at is null
)
update public.push_subscriptions as subscription
set
  disabled_at = now(),
  last_failure_at = coalesce(subscription.last_failure_at, now()),
  failure_count = greatest(subscription.failure_count, 1)
from ranked
where subscription.id = ranked.id
  and ranked.duplicate_rank > 1;

create unique index if not exists push_subscriptions_active_user_endpoint_unique
on public.push_subscriptions(user_id, endpoint)
where disabled_at is null;
