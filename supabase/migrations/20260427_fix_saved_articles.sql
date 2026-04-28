create table if not exists public.saved_articles (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  article_id bigint not null,
  title text not null,
  source text not null,
  category text not null,
  time text not null,
  url text,
  image text,
  published_at text,
  created_at timestamp with time zone not null default timezone('utc', now()),
  unique (user_id, article_id)
);

alter table public.saved_articles
add column if not exists url text,
add column if not exists image text,
add column if not exists published_at text;

create index if not exists saved_articles_user_id_idx
  on public.saved_articles (user_id);

create index if not exists saved_articles_user_article_idx
  on public.saved_articles (user_id, article_id);

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
