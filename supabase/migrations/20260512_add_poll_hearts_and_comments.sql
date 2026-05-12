create table if not exists public.poll_hearts (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint poll_hearts_unique unique (poll_id, user_id)
);

create table if not exists public.poll_comments (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists poll_hearts_poll_id_idx
  on public.poll_hearts (poll_id, created_at desc);

create index if not exists poll_hearts_user_id_idx
  on public.poll_hearts (user_id, created_at desc);

create index if not exists poll_comments_poll_id_idx
  on public.poll_comments (poll_id, created_at desc);

create index if not exists poll_comments_user_id_idx
  on public.poll_comments (user_id, created_at desc);

alter table public.poll_hearts enable row level security;
alter table public.poll_comments enable row level security;

drop policy if exists "Public can read hearts for active polls" on public.poll_hearts;
create policy "Public can read hearts for active polls"
  on public.poll_hearts
  for select
  to public
  using (
    exists (
      select 1
      from public.polls
      where polls.id = poll_hearts.poll_id
        and polls.status = 'active'
    )
  );

drop policy if exists "Users can heart active polls" on public.poll_hearts;
create policy "Users can heart active polls"
  on public.poll_hearts
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.polls
      where polls.id = poll_hearts.poll_id
        and polls.status = 'active'
    )
  );

drop policy if exists "Users can unheart their own poll hearts" on public.poll_hearts;
create policy "Users can unheart their own poll hearts"
  on public.poll_hearts
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Public can read comments for active polls" on public.poll_comments;
create policy "Public can read comments for active polls"
  on public.poll_comments
  for select
  to public
  using (
    exists (
      select 1
      from public.polls
      where polls.id = poll_comments.poll_id
        and polls.status = 'active'
    )
  );

drop policy if exists "Users can comment on active polls" on public.poll_comments;
create policy "Users can comment on active polls"
  on public.poll_comments
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and length(trim(text)) > 0
    and exists (
      select 1
      from public.polls
      where polls.id = poll_comments.poll_id
        and polls.status = 'active'
    )
  );

drop policy if exists "Users can delete their own poll comments" on public.poll_comments;
create policy "Users can delete their own poll comments"
  on public.poll_comments
  for delete
  to authenticated
  using (auth.uid() = user_id);
