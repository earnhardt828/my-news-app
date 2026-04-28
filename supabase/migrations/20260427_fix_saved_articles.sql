alter table public.saved_articles
add column if not exists url text,
add column if not exists image text,
add column if not exists published_at text;

alter table public.saved_articles enable row level security;

drop policy if exists "Users can view their own saved articles" on public.saved_articles;
drop policy if exists "Users can create their own saved articles" on public.saved_articles;
drop policy if exists "Users can update their own saved articles" on public.saved_articles;
drop policy if exists "Users can delete their own saved articles" on public.saved_articles;

create policy "Users can view their own saved articles"
  on public.saved_articles
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create their own saved articles"
  on public.saved_articles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own saved articles"
  on public.saved_articles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own saved articles"
  on public.saved_articles
  for delete
  to authenticated
  using (auth.uid() = user_id);
