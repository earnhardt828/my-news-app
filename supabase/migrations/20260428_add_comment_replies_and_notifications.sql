create table if not exists public.comment_replies (
  id bigserial primary key,
  comment_id bigint not null references public.comments(id) on delete cascade,
  article_id bigint not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text,
  text text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists comment_replies_comment_id_idx
  on public.comment_replies(comment_id);

create index if not exists comment_replies_article_id_idx
  on public.comment_replies(article_id);

alter table public.comment_replies enable row level security;

drop policy if exists "Users can read comment replies" on public.comment_replies;
create policy "Users can read comment replies"
on public.comment_replies
for select
using (true);

drop policy if exists "Users can create their own comment replies" on public.comment_replies;
create policy "Users can create their own comment replies"
on public.comment_replies
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own comment replies" on public.comment_replies;
create policy "Users can delete their own comment replies"
on public.comment_replies
for delete
to authenticated
using (auth.uid() = user_id);

create table if not exists public.notifications (
  id bigserial primary key,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('comment_like', 'comment_reply')),
  article_id bigint,
  comment_id bigint references public.comments(id) on delete cascade,
  reply_id bigint references public.comment_replies(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists notifications_recipient_idx
  on public.notifications(recipient_user_id, created_at desc);

create index if not exists notifications_read_idx
  on public.notifications(recipient_user_id, read_at);

alter table public.notifications enable row level security;

drop policy if exists "Users can read their own notifications" on public.notifications;
create policy "Users can read their own notifications"
on public.notifications
for select
to authenticated
using (auth.uid() = recipient_user_id);

drop policy if exists "Users can update their own notifications" on public.notifications;
create policy "Users can update their own notifications"
on public.notifications
for update
to authenticated
using (auth.uid() = recipient_user_id)
with check (auth.uid() = recipient_user_id);

drop policy if exists "Authenticated users can create notifications" on public.notifications;
create policy "Authenticated users can create notifications"
on public.notifications
for insert
to authenticated
with check (auth.uid() = actor_user_id);
