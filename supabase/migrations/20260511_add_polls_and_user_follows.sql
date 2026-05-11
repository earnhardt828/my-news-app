create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  username text,
  question text not null,
  category text not null,
  related_article_id text,
  related_article_title text,
  related_source text,
  status text not null default 'active' check (status in ('active', 'closed', 'archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_text text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint poll_votes_unique_per_user unique (poll_id, user_id)
);

create table if not exists public.user_follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  following_username text,
  created_at timestamptz not null default now(),
  constraint user_follows_unique unique (follower_id, following_id),
  constraint user_follows_not_self check (follower_id <> following_id)
);

create index if not exists polls_status_created_at_idx
  on public.polls (status, created_at desc);

create index if not exists polls_user_id_idx
  on public.polls (user_id, created_at desc);

create index if not exists poll_options_poll_id_idx
  on public.poll_options (poll_id, created_at asc);

create index if not exists poll_votes_poll_id_idx
  on public.poll_votes (poll_id, created_at desc);

create index if not exists poll_votes_user_id_idx
  on public.poll_votes (user_id, created_at desc);

create index if not exists user_follows_follower_id_idx
  on public.user_follows (follower_id, created_at desc);

create index if not exists user_follows_following_id_idx
  on public.user_follows (following_id, created_at desc);

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.user_follows enable row level security;

drop policy if exists "Public can read active polls" on public.polls;
create policy "Public can read active polls"
  on public.polls
  for select
  to public
  using (status = 'active');

drop policy if exists "Users can insert their own polls" on public.polls;
create policy "Users can insert their own polls"
  on public.polls
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own polls" on public.polls;
create policy "Users can update their own polls"
  on public.polls
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own polls" on public.polls;
create policy "Users can delete their own polls"
  on public.polls
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Public can read poll options for active polls" on public.poll_options;
create policy "Public can read poll options for active polls"
  on public.poll_options
  for select
  to public
  using (
    exists (
      select 1
      from public.polls
      where polls.id = poll_options.poll_id
        and polls.status = 'active'
    )
  );

drop policy if exists "Poll owners can insert poll options" on public.poll_options;
create policy "Poll owners can insert poll options"
  on public.poll_options
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.polls
      where polls.id = poll_options.poll_id
        and polls.user_id = auth.uid()
    )
  );

drop policy if exists "Poll owners can update poll options" on public.poll_options;
create policy "Poll owners can update poll options"
  on public.poll_options
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.polls
      where polls.id = poll_options.poll_id
        and polls.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.polls
      where polls.id = poll_options.poll_id
        and polls.user_id = auth.uid()
    )
  );

drop policy if exists "Poll owners can delete poll options" on public.poll_options;
create policy "Poll owners can delete poll options"
  on public.poll_options
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.polls
      where polls.id = poll_options.poll_id
        and polls.user_id = auth.uid()
    )
  );

drop policy if exists "Public can read active poll votes" on public.poll_votes;
create policy "Public can read active poll votes"
  on public.poll_votes
  for select
  to public
  using (
    exists (
      select 1
      from public.polls
      where polls.id = poll_votes.poll_id
        and polls.status = 'active'
    )
  );

drop policy if exists "Users can cast their own poll vote" on public.poll_votes;
create policy "Users can cast their own poll vote"
  on public.poll_votes
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.polls
      where polls.id = poll_votes.poll_id
        and polls.status = 'active'
    )
  );

drop policy if exists "Users can delete their own poll vote" on public.poll_votes;
create policy "Users can delete their own poll vote"
  on public.poll_votes
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can read their follows" on public.user_follows;
create policy "Users can read their follows"
  on public.user_follows
  for select
  to authenticated
  using (auth.uid() = follower_id or auth.uid() = following_id);

drop policy if exists "Users can insert their own follows" on public.user_follows;
create policy "Users can insert their own follows"
  on public.user_follows
  for insert
  to authenticated
  with check (
    auth.uid() = follower_id
    and follower_id <> following_id
    and not exists (
      select 1
      from public.blocked_users
      where (blocked_users.blocker_id = follower_id and blocked_users.blocked_id = following_id)
         or (blocked_users.blocker_id = following_id and blocked_users.blocked_id = follower_id)
    )
  );

drop policy if exists "Users can delete their own follows" on public.user_follows;
create policy "Users can delete their own follows"
  on public.user_follows
  for delete
  to authenticated
  using (auth.uid() = follower_id);
