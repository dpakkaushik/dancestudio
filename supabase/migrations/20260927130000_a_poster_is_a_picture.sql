-- A POSTER IS A PICTURE (27 Sep 2026)
--
-- ⚠ Rule 9 (RLS): one new storage folder, two new doors, three new policies on
-- `storage.objects`. Nothing existing is widened.
--
-- THE GAP, open since Step 11. A class and an event have had a poster since
-- 25 Aug — but a DRAWN one: `classes.poster` is one of four words
-- ('bold' | 'split' | 'quiet' | 'none') and `PosterBlock` cuts the style's own
-- colours to match. That is the prototype's record sleeve, and it is the right
-- default; what the prototype ALSO has, and this app has never had, is
-- `PosterCropper` — the crop-and-frame flow behind "upload your own" (6604).
-- So the Discover shelf and the booking page have drawn art for every class
-- ever made, and a studio with a real flyer has had nowhere to put it.
--
-- THE SHAPE IS THE ONE EVERY OTHER PICTURE IN THIS APP TAKES (parity slice 2):
-- one PUBLIC bucket (`media`, which already exists), a folder whose name IS the
-- authority check, a storage policy that tests the prefix, and an RPC that
-- re-checks the same prefix before it records the path — so a row can never be
-- made to point at a file its business does not own. The folder is
-- `posters/{business_id}/`.
--
-- ⚠ THE FOLDER IS KEYED ON THE BUSINESS, NOT ON THE UPLOADER, and that is the
-- one real decision here. A studio's classes are posted by its owner AND its
-- trainers, and a class outlives whoever happened to upload for it — keying on
-- `auth.uid()` (as `routines/` does, correctly, because a routine belongs to a
-- PERSON) would scatter one studio's flyers across its team's folders and orphan
-- them the day somebody leaves. So the policy asks `is_business_member`, which
-- is the same question the classes desk asks.
--
-- ⚠ A POSTER IS PUBLIC BY DEFINITION. It goes on a published class's page, which
-- a stranger reads; the bucket is public for reads, so no signed URL and no
-- round trip. Nothing private is being put in a public place: a flyer is the
-- one picture in this product whose whole job is to be seen by somebody who has
-- not signed in.
--
-- ⚠ THE DRAWN POSTER STAYS. `classes.poster` is untouched and is still what a
-- class with no uploaded picture wears — 31 classes on production and every one
-- of them — so this changes what nobody sees until somebody uploads something.

begin;

-- ── 1 · where the picture lives ─────────────────────────────────────────────
alter table public.classes add column if not exists poster_path text;
alter table public.events  add column if not exists poster_path text;

comment on column public.classes.poster_path is
  'An UPLOADED poster, in media/posters/{business_id}/… (27 Sep 2026). Null means the class wears the drawn sleeve `poster` names, which is still the default and still what most classes have.';
comment on column public.events.poster_path is
  'An UPLOADED poster, in media/posters/{business_id}/… (27 Sep 2026). Null means the event wears its drawn sleeve.';

-- ── 2 · the folder, written by the business's own team ──────────────────────
-- the same three-policy shape every folder in this bucket has; the second
-- segment of the path is the BUSINESS, and `is_business_member` is the check.
drop policy if exists "a team writes its own posters folder" on storage.objects;
create policy "a team writes its own posters folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'posters'
    and public.is_business_member(((storage.foldername(name))[2])::uuid)
  );

drop policy if exists "a team replaces its own posters" on storage.objects;
create policy "a team replaces its own posters"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'posters'
    and public.is_business_member(((storage.foldername(name))[2])::uuid)
  );

drop policy if exists "a team deletes its own posters" on storage.objects;
create policy "a team deletes its own posters"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'posters'
    and public.is_business_member(((storage.foldername(name))[2])::uuid)
  );

-- ── 3 · the two doors that record it ────────────────────────────────────────
-- ⚠ OWNERS AND TRAINERS, which is exactly who may edit the class or the event
-- itself — not `is_business_member`, because the front desk does not change what
-- a class looks like. `null` clears it and the drawn sleeve comes back.
create or replace function public.set_class_poster(p_class_id uuid, p_path text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_business uuid;
begin
  select c.business_id into v_business
  from public.classes c
  where c.id = p_class_id and c.deleted_at is null;
  if v_business is null then
    raise exception 'that class does not exist';
  end if;
  if not exists (
    select 1 from public.business_members m
    where m.business_id = v_business and m.user_id = auth.uid()
      and m.member_role in ('owner', 'trainer') and m.deleted_at is null
  ) then
    raise exception 'only the studio that runs this class can change its poster';
  end if;
  /* the path is checked against THIS business's own folder — the same rule the
     storage policy keeps, said again here so a row can never point at a file
     somebody else owns (the parity-slice-2 pattern) */
  if p_path is not null and p_path !~ ('^posters/' || v_business::text || '/[^/]+$') then
    raise exception 'that file is not in this business''s own posters folder';
  end if;
  update public.classes set poster_path = p_path where id = p_class_id;
end;
$$;

create or replace function public.set_event_poster(p_event_id uuid, p_path text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_business uuid;
begin
  select e.business_id into v_business
  from public.events e
  where e.id = p_event_id and e.deleted_at is null;
  if v_business is null then
    raise exception 'that event does not exist';
  end if;
  if not exists (
    select 1 from public.business_members m
    where m.business_id = v_business and m.user_id = auth.uid()
      and m.member_role in ('owner', 'trainer') and m.deleted_at is null
  ) then
    raise exception 'only the organiser can change this event''s poster';
  end if;
  if p_path is not null and p_path !~ ('^posters/' || v_business::text || '/[^/]+$') then
    raise exception 'that file is not in this business''s own posters folder';
  end if;
  update public.events set poster_path = p_path where id = p_event_id;
end;
$$;

-- ⚠ A NEW FUNCTION ARRIVES WITH SUPABASE'S DEFAULT GRANTS — execute to anon,
-- authenticated AND service_role. Revoke first, then grant exactly what is
-- meant: the 16 Sep lesson, which cost 45 authenticated-only RPCs their gate.
revoke execute on function public.set_class_poster(uuid, text) from public, anon;
revoke execute on function public.set_event_poster(uuid, text) from public, anon;
grant execute on function public.set_class_poster(uuid, text) to authenticated;
grant execute on function public.set_event_poster(uuid, text) to authenticated;

commit;
