-- Storage privé photos + PDF signés. Pas d’URL publique permanente.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select
  'coach-private',
  'coach-private',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
where not exists (select 1 from storage.buckets b where b.id = 'coach-private');

update storage.buckets
set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
where id = 'coach-private';

drop policy if exists coach_private_select_own on storage.objects;
create policy coach_private_select_own on storage.objects
  for select
  using (
    bucket_id = 'coach-private'
    and (
      auth.role() = 'service_role'
      or (storage.foldername(name))[1] = auth.uid()::text
      or public.coach_jwt_role() = 'direction'
    )
  );

drop policy if exists coach_private_insert_own on storage.objects;
create policy coach_private_insert_own on storage.objects
  for insert
  with check (
    bucket_id = 'coach-private'
    and (
      auth.role() = 'service_role'
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

drop policy if exists coach_private_update_own on storage.objects;
create policy coach_private_update_own on storage.objects
  for update
  using (
    bucket_id = 'coach-private'
    and (
      auth.role() = 'service_role'
      or (storage.foldername(name))[1] = auth.uid()::text
      or public.coach_jwt_role() = 'direction'
    )
  );
