alter table public.profiles
  add column if not exists local_city text,
  add column if not exists local_state text;
