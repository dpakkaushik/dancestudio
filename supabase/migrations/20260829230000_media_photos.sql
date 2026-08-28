-- Parity slice 2 (28 Aug 2026): photos — a face on a person, a crew and a business.
--
-- Every profile, crew and business page in this app draws INITIALS ON A GRADIENT
-- where a picture belongs. The prototype uploads real ones (the profile photo at
-- 10619, studio photos at 10980, album shots at 11093) through a cropper, and the
-- parity backlog has carried "poster uploads + Storage" since Step 11.
--
-- WHAT THIS SLICE DOES AND DOES NOT DO. It gives the three entities that HAVE an
-- obvious owner and an obvious screen a photo: a person (their own), a crew (its
-- leader's) and a business (its owner's or trainer's). It does NOT do class and
-- event POSTERS: a poster is a different thing — the prototype draws three
-- designs and only then offers an upload through PosterCropper's crop-and-frame
-- flow — and the albums/photo-grid is a third thing again. Both stay on the
-- backlog rather than being half-built here.
--
-- ONE BUCKET, PUBLIC ON PURPOSE. These images exist to be looked at: a studio's
-- photo is on a page anyone can read, and a signed URL that expires would make
-- a public page depend on a round trip per image. So `media` is public for READS
-- and tightly scoped for WRITES — the path says who may write it:
--     avatars/{user id}/…      only that person
--     tenants/{tenant id}/…    only an owner or trainer of that business
--     crews/{crew id}/…        only that crew's leader
-- and nothing else can be written at all. A person can therefore never upload
-- into somebody else's folder, and the row that POINTS at a file is set by an
-- RPC that checks the same authority AND that the path is in the right folder —
-- so a row cannot be made to point at a file its owner does not own.

-- ── the bucket ───────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- ── who may write where ──────────────────────────────────────────────────────
-- anyone reads: that is what a public bucket is for, and these are pictures on
-- pages the public already reads
drop policy if exists "media is public to read" on storage.objects;
create policy "media is public to read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'media');

-- your own folder, and only yours
drop policy if exists "people write their own avatar folder" on storage.objects;
create policy "people write their own avatar folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
drop policy if exists "people replace their own avatar folder" on storage.objects;
create policy "people replace their own avatar folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
drop policy if exists "people delete from their own avatar folder" on storage.objects;
create policy "people delete from their own avatar folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- a business's folder: its owner or a trainer, the same pair that may publish a
-- class or run an event (Step 11's line)
drop policy if exists "business people write their tenant folder" on storage.objects;
create policy "business people write their tenant folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'tenants'
    and exists (
      select 1 from public.tenant_members m
      where m.tenant_id = ((storage.foldername(name))[2])::uuid
        and m.user_id = auth.uid()
        and m.member_role in ('owner', 'trainer')
        and m.deleted_at is null
    )
  );
drop policy if exists "business people delete from their tenant folder" on storage.objects;
create policy "business people delete from their tenant folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'tenants'
    and exists (
      select 1 from public.tenant_members m
      where m.tenant_id = ((storage.foldername(name))[2])::uuid
        and m.user_id = auth.uid()
        and m.member_role in ('owner', 'trainer')
        and m.deleted_at is null
    )
  );

-- a crew's folder: the leader, who is the only one who may change the crew at all
drop policy if exists "crew leaders write their crew folder" on storage.objects;
create policy "crew leaders write their crew folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'crews'
    and public.is_crew_leader(((storage.foldername(name))[2])::uuid)
  );
drop policy if exists "crew leaders delete from their crew folder" on storage.objects;
create policy "crew leaders delete from their crew folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'crews'
    and public.is_crew_leader(((storage.foldername(name))[2])::uuid)
  );

-- ── where the path is remembered ─────────────────────────────────────────────
alter table public.profiles add column avatar_path text;
alter table public.tenants add column photo_path text;
-- crews.photo already exists (Step 22 carried the prototype's field); it holds a
-- path in this bucket now, and the comment says so
comment on column public.crews.photo is
  'A path in the public `media` bucket (crews/{crew id}/…), set by set_crew_photo. Null means the crew wears its initials.';
comment on column public.profiles.avatar_path is
  'A path in the public `media` bucket (avatars/{user id}/…), set by set_my_avatar. Null means initials on the role''s own metal.';
comment on column public.tenants.photo_path is
  'A path in the public `media` bucket (tenants/{tenant id}/…), set by set_tenant_photo.';

-- ── and the three doors that set it ──────────────────────────────────────────
-- Each checks the same authority the storage policy does, AND that the path sits
-- in the folder that authority owns — so a row can never be made to point at a
-- file its owner does not own. Passing null clears the photo.
create or replace function public.set_my_avatar(p_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_path is not null and p_path not like 'avatars/' || v_user::text || '/%' then
    raise exception 'that file is not in your own folder';
  end if;
  update public.profiles set avatar_path = p_path, updated_by = v_user
    where id = v_user and deleted_at is null;
  if not found then
    raise exception 'finish onboarding first';
  end if;
  return p_path;
end;
$$;
revoke execute on function public.set_my_avatar(text) from public, anon;
grant execute on function public.set_my_avatar(text) to authenticated;

create or replace function public.set_tenant_photo(p_tenant_id uuid, p_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.tenant_members m
    where m.tenant_id = p_tenant_id and m.user_id = v_user
      and m.member_role in ('owner', 'trainer') and m.deleted_at is null
  ) then
    raise exception 'only the studio''s owner or a trainer can change its photo';
  end if;
  if p_path is not null and p_path not like 'tenants/' || p_tenant_id::text || '/%' then
    raise exception 'that file does not belong to this business';
  end if;
  update public.tenants set photo_path = p_path, updated_by = v_user
    where id = p_tenant_id and deleted_at is null;
  return p_path;
end;
$$;
revoke execute on function public.set_tenant_photo(uuid, text) from public, anon;
grant execute on function public.set_tenant_photo(uuid, text) to authenticated;

create or replace function public.set_crew_photo(p_crew_id uuid, p_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_crew_leader(p_crew_id) then
    raise exception 'only the crew''s leader can change its photo';
  end if;
  if p_path is not null and p_path not like 'crews/' || p_crew_id::text || '/%' then
    raise exception 'that file does not belong to this crew';
  end if;
  update public.crews set photo = p_path, updated_by = v_user
    where id = p_crew_id and deleted_at is null;
  return p_path;
end;
$$;
revoke execute on function public.set_crew_photo(uuid, text) from public, anon;
grant execute on function public.set_crew_photo(uuid, text) to authenticated;

-- ── and the reads that already name people learn to carry the face ──────────
-- The person board and the search's People section print a name; a face beside
-- it is the same row, so `search_dance_os` gains nothing new to leak. (It stays
-- SECURITY INVOKER: a stranger still finds no people at all.)
create or replace function public.person_avatar_paths(p_user_ids uuid[])
returns table (user_id uuid, avatar_path text)
language sql
security definer
set search_path = ''
stable
as $$
  select p.id, p.avatar_path
  from public.profiles p
  where p.id = any (p_user_ids) and p.deleted_at is null and auth.uid() is not null;
$$;
revoke execute on function public.person_avatar_paths(uuid[]) from public, anon;
grant execute on function public.person_avatar_paths(uuid[]) to authenticated;
