alter table public.blocked_users
  add column if not exists blocked_id uuid references auth.users (id) on delete cascade;

alter table public.blocked_users
  add column if not exists blocked_username text;

update public.blocked_users
set blocked_id = blocked_user_id
where blocked_id is null
  and blocked_user_id is not null;

alter table public.blocked_users
  alter column blocker_id set not null;

alter table public.blocked_users
  alter column blocked_id set not null;

create unique index if not exists blocked_users_blocker_id_blocked_id_unique
  on public.blocked_users (blocker_id, blocked_id);

create index if not exists blocked_users_blocked_id_idx
  on public.blocked_users (blocked_id);

drop policy if exists "Users can view their own blocks" on public.blocked_users;
create policy "Users can view rows involving their account"
  on public.blocked_users
  for select
  to authenticated
  using (auth.uid() = blocker_id or auth.uid() = blocked_id);

drop policy if exists "Users can create their own blocks" on public.blocked_users;
create policy "Users can create their own blocks"
  on public.blocked_users
  for insert
  to authenticated
  with check (auth.uid() = blocker_id);

drop policy if exists "Users can delete their own blocks" on public.blocked_users;
create policy "Users can delete their own blocks"
  on public.blocked_users
  for delete
  to authenticated
  using (auth.uid() = blocker_id);
