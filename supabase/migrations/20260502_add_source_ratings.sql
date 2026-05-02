create table if not exists public.source_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_name text not null,
  rating text not null check (rating in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists source_ratings_user_source_idx
  on public.source_ratings(user_id, source_name);

create index if not exists source_ratings_source_name_idx
  on public.source_ratings(source_name, updated_at desc);

alter table public.source_ratings enable row level security;

drop policy if exists "Authenticated users can read source ratings" on public.source_ratings;
create policy "Authenticated users can read source ratings"
on public.source_ratings
for select
to authenticated
using (true);

drop policy if exists "Users can insert their own source ratings" on public.source_ratings;
create policy "Users can insert their own source ratings"
on public.source_ratings
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own source ratings" on public.source_ratings;
create policy "Users can update their own source ratings"
on public.source_ratings
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own source ratings" on public.source_ratings;
create policy "Users can delete their own source ratings"
on public.source_ratings
for delete
to authenticated
using (auth.uid() = user_id);
