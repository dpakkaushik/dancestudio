-- AN ARTIST'S GALLERY (14 Sep 2026)
--
-- The user, on the identity pages: "Artist and Studio has scrollable images in
-- cover photo area but in case of user we don't want scrollable cover photo
-- collection, just one cover image is enough." A studio's cover swipes through
-- the photos of its space it showed DanceOS for the badge. An artist had only
-- the one picture — so this is where the rest of them live: up to ten, in the
-- public `media` bucket under a fourth folder, `gallery/{user id}/…`, written
-- exactly the way the avatar folder is (20260829230000): the browser uploads
-- into its own folder, the storage policy is what admits it, and the RPC that
-- records the row checks the same folder again.
--
-- Only a PERSON has a gallery. Whether it is SHOWN is the Home's decision — it
-- draws the rail for an artist (a live Artist plan) and the single square for
-- a user — so a lapsed plan hides the pictures without deleting them.

create table if not exists public.profile_photos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  path        text not null,
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  deleted_at  timestamptz
);
comment on table public.profile_photos is
  'An artist''s gallery: paths in the public media bucket (gallery/{user id}/…), swiped behind the profile photo on Home. Ten at most; live rows have deleted_at null.';
create unique index if not exists profile_photos_live_path on public.profile_photos (path) where deleted_at is null;
create index if not exists profile_photos_by_user on public.profile_photos (user_id, sort, created_at) where deleted_at is null;

alter table public.profile_photos enable row level security;

-- anyone reads: these are pictures in a public bucket, on a page the public
-- will read; the writes go through the two doors below and nothing else
drop policy if exists "a gallery is public to read" on public.profile_photos;
create policy "a gallery is public to read"
  on public.profile_photos for select
  to anon, authenticated
  using (deleted_at is null);

-- ── the folder: your own, and only yours ─────────────────────────────────────
drop policy if exists "people write their own gallery folder" on storage.objects;
create policy "people write their own gallery folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'gallery'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
drop policy if exists "people delete from their own gallery folder" on storage.objects;
create policy "people delete from their own gallery folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'gallery'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- ── the two doors ────────────────────────────────────────────────────────────
create or replace function public.add_my_gallery_photo(p_path text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_path is null or p_path not like 'gallery/' || v_user::text || '/%' then
    raise exception 'that file is not in your own folder';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user and p.deleted_at is null) then
    raise exception 'finish onboarding first';
  end if;
  select count(*) into v_count from public.profile_photos g where g.user_id = v_user and g.deleted_at is null;
  if v_count >= 10 then
    raise exception 'ten photos is the most a gallery holds — remove one first';
  end if;
  insert into public.profile_photos (user_id, path, sort, created_by)
    values (v_user, p_path, v_count, v_user)
    returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.add_my_gallery_photo(text) from public, anon;
grant execute on function public.add_my_gallery_photo(text) to authenticated;

-- returns the path, so the browser can take the object out of the bucket too
create or replace function public.remove_my_gallery_photo(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_path text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  update public.profile_photos set deleted_at = now()
    where id = p_id and user_id = v_user and deleted_at is null
    returning path into v_path;
  if v_path is null then
    raise exception 'that photo is not in your gallery';
  end if;
  return v_path;
end;
$$;
revoke execute on function public.remove_my_gallery_photo(uuid) from public, anon;
grant execute on function public.remove_my_gallery_photo(uuid) to authenticated;
