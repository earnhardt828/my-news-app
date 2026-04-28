create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  username text,
  bio text,
  avatar_url text,
  categories text[] not null default '{}'::text[],
  preferred_sources text[] not null default '{}'::text[],
  show_less_sources text[] not null default '{}'::text[],
  username_last_changed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles
add column if not exists email text,
add column if not exists username text,
add column if not exists bio text,
add column if not exists avatar_url text,
add column if not exists categories text[] not null default '{}'::text[],
add column if not exists preferred_sources text[] not null default '{}'::text[],
add column if not exists show_less_sources text[] not null default '{}'::text[],
add column if not exists username_last_changed_at timestamptz,
add column if not exists created_at timestamptz not null default timezone('utc', now()),
add column if not exists updated_at timestamptz not null default timezone('utc', now());

create index if not exists profiles_username_idx
  on public.profiles (username);

alter table public.profiles enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
drop policy if exists "Users can create their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Users can delete their own profile" on public.profiles;

create policy "Users can view their own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "Users can create their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users can delete their own profile"
  on public.profiles
  for delete
  to authenticated
  using (auth.uid() = id);
