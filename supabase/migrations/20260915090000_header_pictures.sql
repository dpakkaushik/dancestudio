-- HEADER PICTURES AND THE PROFILE DISC (15 Sep 2026)
--
-- The user, on the identity hero: "I need a profile picture for the studio,
-- same way need a profile image for the Artist page… user must have option to
-- edit profile where he can change Name, Mobile, Profile Pic, Header Pictures
-- (max 10). A studio gives these pictures when he submits for studio
-- verification; an artist has no such verification so the option to enter
-- header pics will be through the profile edit option." Then, asked:
--   * a plain user has "just a profile pic and one header";
--   * a studio's owner "can add, remove or update — make sure he can't delete
--     all, at least one has to stay in the header image folder";
--   * "when a user clicks over a studio or artist he will see the same:
--     scrollable header and profile image, name…"
--
-- So the two photo tables this app already has become the HEADER PICTURES of
-- the two kinds of page, and nothing new is stored:
--   * `profile_photos` (the artist gallery, 20260914170000) is a PERSON's
--     header — ten for an artist, ONE for a user;
--   * `org_proof_photos` rows with a tenant_id (20260914090000) are a STUDIO's
--     header — the same five to ten photos it showed DanceOS, which the public
--     may now READ once the studio is on Discover.
--
-- ⚠ RLS: the second point opens a private bucket's objects to the public,
-- narrowly. Until tonight a proof photo was readable by the organization and a
-- platform admin only. From tonight a LISTED studio's photos — and only a
-- listed studio's — are readable by anyone, as its public page is; a studio
-- that is not on Discover keeps them private, exactly as before. The header is
-- the one place they are shown, and its being on Discover is what a stranger
-- is allowed to look at.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. WHAT THE TWO TABLES ARE NOW
-- ─────────────────────────────────────────────────────────────────────────────

comment on table public.profile_photos is
  'A person''s HEADER PICTURES (15 Sep 2026; the artist gallery of 14 Sep): paths in the public media bucket (gallery/{user id}/…), swiped across the top of their pages above the profile disc. Ten for an artist, one for a user — add_my_gallery_photo refuses past either.';

comment on table public.org_proof_photos is
  'The 5-10 photos of its space a studio shows DanceOS to be verified — AND, since 15 Sep 2026, its HEADER PICTURES: once the studio is listed they are readable by anyone, as its public page is. Objects live in the private org-proof bucket under proof/{org_id}/…; rows with a null tenant_id are legacy organization photos and stay private.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. A PERSON'S HEADER: ten for an artist, one for a user
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.add_my_gallery_photo(p_path text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
  v_max integer;
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
  /* the plan decides the ceiling: an artist swipes through ten, a user has one */
  v_max := case when public.artist_plan_active(v_user) then 10 else 1 end;
  select count(*) into v_count from public.profile_photos g where g.user_id = v_user and g.deleted_at is null;
  if v_count >= v_max then
    if v_max = 1 then
      raise exception 'one header picture is what a profile holds — remove it first, or take the Artist plan for ten';
    end if;
    raise exception 'ten header pictures is the most — remove one first';
  end if;
  insert into public.profile_photos (user_id, path, sort, created_by)
    values (v_user, p_path, v_count, v_user)
    returning id into v_id;
  return v_id;
end;
$$;
comment on function public.add_my_gallery_photo(text) is
  'Record one header picture a person has just uploaded to their own gallery folder. Ten for an artist (a live Artist plan), ONE for a user (15 Sep 2026).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. A STUDIO'S HEADER NEVER EMPTIES
-- ─────────────────────────────────────────────────────────────────────────────

/** Take one studio photo back. Two refusals: while a review is pending it
 *  would drop the evidence below five (R16), and — the user's rule — it is the
 *  LAST one. A header with nothing in it is a page with a hole at the top, so
 *  the way to replace the only picture is to add the new one first. */
create or replace function public.remove_org_proof_photo(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_tenant uuid;
  v_live integer;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select p.tenant_id into v_tenant from public.org_proof_photos p
    where p.id = p_id and p.org_id = v_user and p.deleted_at is null;
  if not found then
    raise exception 'no such photo';
  end if;

  if v_tenant is not null then
    select count(*) into v_live from public.org_proof_photos p
      where p.tenant_id = v_tenant and p.deleted_at is null;
    if v_live <= 1 then
      raise exception 'a studio keeps at least one header picture — add another before you remove this one';
    end if;
    if v_live <= 5 and exists (select 1 from public.org_verification_requests r
                                where r.tenant_id = v_tenant and r.status = 'pending' and r.deleted_at is null) then
      raise exception 'DanceOS is checking these now — add a replacement before you remove one';
    end if;
  else
    /* a legacy organization photo: the old rule, untouched */
    select count(*) into v_live from public.org_proof_photos p
      where p.org_id = v_user and p.tenant_id is null and p.deleted_at is null;
    if v_live <= 5 and exists (select 1 from public.org_verification_requests r
                                where r.org_id = v_user and r.tenant_id is null and r.status = 'pending' and r.deleted_at is null) then
      raise exception 'DanceOS is checking these now — add a replacement before you remove one';
    end if;
  end if;

  update public.org_proof_photos p
     set deleted_at = now(), updated_by = v_user
   where p.id = p_id;
end;
$$;
comment on function public.remove_org_proof_photo(uuid) is
  'Take one studio photo back. Refused when it is the studio''s LAST header picture (15 Sep 2026), and while a review is pending if it would drop the evidence below five (R16).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. A LISTED STUDIO'S PICTURES ARE PUBLIC TO READ — the row and the object
-- ─────────────────────────────────────────────────────────────────────────────

/* the row: anyone, for a studio that is on Discover; its own team as well, so
   a trainer sees the studio's home whole before it is listed */
drop policy if exists "a listed studio's pictures are public to read" on public.org_proof_photos;
create policy "a listed studio's pictures are public to read"
  on public.org_proof_photos for select
  to anon, authenticated
  using (
    deleted_at is null
    and tenant_id is not null
    and exists (
      select 1 from public.tenants t
       where t.id = org_proof_photos.tenant_id
         and t.deleted_at is null
         and (t.visibility = 'listed' or public.is_tenant_member(t.id))
    )
  );

/* the object: a signed URL is minted only for an object the caller may SELECT,
   so the storage policy says the same thing about the same rows. The path is
   the key — `path` on the row IS `name` on the object. */
drop policy if exists "a listed studio's pictures are signed for anyone" on storage.objects;
create policy "a listed studio's pictures are signed for anyone"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'org-proof'
    and exists (
      select 1 from public.org_proof_photos p
        join public.tenants t on t.id = p.tenant_id
       where p.path = storage.objects.name
         and p.deleted_at is null
         and t.deleted_at is null
         and (t.visibility = 'listed' or public.is_tenant_member(t.id))
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ONE QUESTION FOR A BUSINESS'S PAGE: what swipes across the top?
-- ─────────────────────────────────────────────────────────────────────────────

/** A business's header pictures, for whoever may read its page: a STUDIO's are
 *  the photos of its space; an ARTIST PAGE's are its owner's own header
 *  pictures, because the page and the person are one artist. Answers only for
 *  a tenant the caller could open — listed, or theirs — and returns paths with
 *  the bucket each lives in, so the reader knows which URL to build. The
 *  storage policy above is what lets a stranger then sign a proof path. */
create or replace function public.tenant_header_photos(p_tenant_id uuid)
returns table (id uuid, path text, bucket text)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_tenant public.tenants;
  v_owner uuid;
begin
  select * into v_tenant from public.tenants t where t.id = p_tenant_id and t.deleted_at is null;
  if not found then return; end if;
  if v_tenant.visibility <> 'listed' and not public.is_tenant_member(p_tenant_id) then return; end if;

  if v_tenant.type = 'studio' then
    return query
      select p.id, p.path, 'org-proof'::text
        from public.org_proof_photos p
       where p.tenant_id = p_tenant_id and p.deleted_at is null
       order by p.sort, p.created_at
       limit 10;
  elsif v_tenant.type = 'trainer_business' then
    v_owner := public.tenant_owner(p_tenant_id);
    if v_owner is null then return; end if;
    return query
      select g.id, g.path, 'media'::text
        from public.profile_photos g
       where g.user_id = v_owner and g.deleted_at is null
       order by g.sort, g.created_at
       limit 10;
  end if;
end;
$$;
comment on function public.tenant_header_photos(uuid) is
  'The pictures that swipe across the top of a business''s public page (15 Sep 2026): a studio''s proof photos, or an artist page''s owner''s header pictures. Empty for a tenant the caller could not open.';
revoke execute on function public.tenant_header_photos(uuid) from public;
grant execute on function public.tenant_header_photos(uuid) to anon, authenticated;
