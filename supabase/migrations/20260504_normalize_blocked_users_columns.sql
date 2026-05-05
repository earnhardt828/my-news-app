do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'blocked_users'
      and column_name = 'blocker_user_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'blocked_users'
      and column_name = 'blocker_id'
  ) then
    alter table public.blocked_users
      rename column blocker_user_id to blocker_id;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'blocked_users'
      and column_name = 'blocked_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'blocked_users'
      and column_name = 'blocked_user_id'
  ) then
    alter table public.blocked_users
      rename column blocked_id to blocked_user_id;
  end if;
end $$;
