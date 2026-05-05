create table if not exists public.safety_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  issue_type text not null,
  description text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists safety_reports_user_id_idx
  on public.safety_reports (user_id);

create index if not exists safety_reports_created_at_idx
  on public.safety_reports (created_at desc);

alter table public.safety_reports enable row level security;

drop policy if exists "Users can insert their own safety reports" on public.safety_reports;
create policy "Users can insert their own safety reports"
  on public.safety_reports
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can read their own safety reports" on public.safety_reports;
create policy "Users can read their own safety reports"
  on public.safety_reports
  for select
  to authenticated
  using (auth.uid() = user_id);
