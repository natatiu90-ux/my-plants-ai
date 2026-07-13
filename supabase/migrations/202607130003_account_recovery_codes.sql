create table if not exists public.account_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  code_hash text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  redeemed_at timestamptz
);

create index if not exists account_recovery_codes_user_idx
  on public.account_recovery_codes(user_id);

drop trigger if exists account_recovery_codes_set_updated_at on public.account_recovery_codes;
create trigger account_recovery_codes_set_updated_at before update on public.account_recovery_codes for each row execute function public.set_updated_at();

alter table public.account_recovery_codes enable row level security;

drop policy if exists account_recovery_codes_select_own on public.account_recovery_codes;
drop policy if exists account_recovery_codes_insert_own on public.account_recovery_codes;
drop policy if exists account_recovery_codes_update_own on public.account_recovery_codes;
drop policy if exists account_recovery_codes_delete_own on public.account_recovery_codes;

create policy account_recovery_codes_select_own on public.account_recovery_codes for select using (user_id = auth.uid());
create policy account_recovery_codes_insert_own on public.account_recovery_codes for insert with check (user_id = auth.uid());
create policy account_recovery_codes_update_own on public.account_recovery_codes for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy account_recovery_codes_delete_own on public.account_recovery_codes for delete using (user_id = auth.uid());
