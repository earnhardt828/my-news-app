create table if not exists public.reports (
  id bigint generated always as identity primary key,
  comment_id bigint not null references public.comments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null,
  created_at timestamp with time zone not null default timezone('utc', now())
);

create index if not exists reports_comment_id_idx on public.reports (comment_id);
create index if not exists reports_user_id_idx on public.reports (user_id);
