alter table public.blocked_users
  drop constraint if exists blocked_users_blocker_id_fkey;

alter table public.blocked_users
  drop constraint if exists blocked_users_blocked_id_fkey;

alter table public.blocked_users
  drop constraint if exists blocked_users_blocked_user_id_fkey;

alter table public.blocked_users
  add constraint blocked_users_blocker_id_fkey
  foreign key (blocker_id) references public.profiles (id) on delete cascade;

alter table public.blocked_users
  add constraint blocked_users_blocked_id_fkey
  foreign key (blocked_id) references public.profiles (id) on delete cascade;
