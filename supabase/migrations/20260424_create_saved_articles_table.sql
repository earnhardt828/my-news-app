create table if not exists public.saved_articles (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  article_id bigint not null,
  title text not null,
  source text not null,
  category text not null,
  time text not null,
  created_at timestamp with time zone not null default timezone('utc', now()),
  unique (user_id, article_id)
);

create index if not exists saved_articles_user_id_idx
  on public.saved_articles (user_id);
