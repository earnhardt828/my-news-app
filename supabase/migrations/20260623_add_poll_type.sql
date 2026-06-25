alter table public.polls
  add column if not exists poll_type text not null default 'news';

alter table public.polls
  drop constraint if exists polls_poll_type_check;

alter table public.polls
  add constraint polls_poll_type_check
  check (poll_type in ('news', 'community'));
