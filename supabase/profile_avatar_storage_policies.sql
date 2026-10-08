-- The `avatars` bucket should already exist and be marked public.
-- Files are stored at <auth user UUID>/avatar.

drop policy if exists "Users can read their own avatar objects"
  on storage.objects;
create policy "Users can read their own avatar objects"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can upload their own avatar objects"
  on storage.objects;
create policy "Users can upload their own avatar objects"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can update their own avatar objects"
  on storage.objects;
create policy "Users can update their own avatar objects"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Add an owner-only profile update policy if one does not already exist.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can update their own profile'
  ) then
    create policy "Users can update their own profile"
      on public.profiles
      for update
      to authenticated
      using (id = (select auth.uid()))
      with check (id = (select auth.uid()));
  end if;
end
$$;
