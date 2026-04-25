create table if not exists public.blocked_users (
  id bigint generated always as identity primary key,
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamp with time zone not null default timezone('utc', now()),
  constraint blocked_users_unique unique (blocker_id, blocked_user_id),
  constraint blocked_users_not_self check (blocker_id <> blocked_user_id)
);

create index if not exists blocked_users_blocker_id_idx
  on public.blocked_users (blocker_id);

create index if not exists blocked_users_blocked_user_id_idx
  on public.blocked_users (blocked_user_id);

alter table public.blocked_users enable row level security;

create policy "Users can view their own blocks"
  on public.blocked_users
  for select
  to authenticated
  using (auth.uid() = blocker_id);

create policy "Users can create their own blocks"
  on public.blocked_users
  for insert
  to authenticated
  with check (auth.uid() = blocker_id);

create policy "Users can delete their own blocks"
  on public.blocked_users
  for delete
  to authenticated
  using (auth.uid() = blocker_id);

create table if not exists public.account_deletion_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamp with time zone not null default timezone('utc', now()),
  constraint account_deletion_requests_user_unique unique (user_id),
  constraint account_deletion_requests_status_check
    check (status in ('pending', 'reviewed', 'completed', 'rejected'))
);

create index if not exists account_deletion_requests_user_id_idx
  on public.account_deletion_requests (user_id);

alter table public.account_deletion_requests enable row level security;

create policy "Users can view their own deletion requests"
  on public.account_deletion_requests
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create their own deletion requests"
  on public.account_deletion_requests
  for insert
  to authenticated
  with check (auth.uid() = user_id);
