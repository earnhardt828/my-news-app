create table if not exists public.comment_reactions (
  id bigint generated always as identity primary key,
  comment_id bigint not null references public.comments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  reaction_type text not null,
  created_at timestamp with time zone not null default timezone('utc', now()),
  constraint comment_reactions_unique unique (comment_id, user_id),
  constraint comment_reactions_type_check
    check (reaction_type in ('like', 'dislike'))
);

create index if not exists comment_reactions_comment_id_idx
  on public.comment_reactions (comment_id);

create index if not exists comment_reactions_user_id_idx
  on public.comment_reactions (user_id);

alter table public.comment_reactions enable row level security;

create policy "Anyone can view comment reactions"
  on public.comment_reactions
  for select
  to anon, authenticated
  using (true);

create policy "Users can create their own comment reactions"
  on public.comment_reactions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own comment reactions"
  on public.comment_reactions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own comment reactions"
  on public.comment_reactions
  for delete
  to authenticated
  using (auth.uid() = user_id);
