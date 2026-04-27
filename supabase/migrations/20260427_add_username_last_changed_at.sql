alter table public.profiles
add column if not exists username_last_changed_at timestamptz;
