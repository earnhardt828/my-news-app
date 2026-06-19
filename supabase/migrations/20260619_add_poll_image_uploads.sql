alter table public.polls
  add column if not exists image_url text;

insert into storage.buckets (id, name, public)
values ('poll-images', 'poll-images', true)
on conflict (id) do update
set public = excluded.public;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public can view poll images'
  ) then
    create policy "Public can view poll images"
      on storage.objects
      for select
      using (bucket_id = 'poll-images');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can upload poll images'
  ) then
    create policy "Authenticated users can upload poll images"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'poll-images'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can update their poll images'
  ) then
    create policy "Authenticated users can update their poll images"
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'poll-images'
        and owner = auth.uid()
      )
      with check (
        bucket_id = 'poll-images'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;
