do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'blocked_users'
      and column_name = 'blocked_user_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'blocked_users'
      and column_name = 'blocked_id'
  ) then
    alter table public.blocked_users
      rename column blocked_user_id to blocked_id;
  end if;

  alter table public.blocked_users
    add column if not exists blocked_username text;
end $$;
