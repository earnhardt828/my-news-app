alter table public.profiles
add column if not exists preferred_sources text[] default '{}'::text[];

alter table public.profiles
add column if not exists show_less_sources text[] default '{}'::text[];
