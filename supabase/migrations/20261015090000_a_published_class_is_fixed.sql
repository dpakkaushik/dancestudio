-- A PUBLISHED CLASS IS FIXED, AND ITS PEOPLE CLOSE WITH IT (11 Oct 2026)
--
-- The user, on two decisions put to them:
--   * "should not be able to edit a published class only delete it."
--   * the 53 requests left live on classes that were deleted: soft-delete them,
--     and stop it happening again.
--
-- Three things, no table, no column, no policy, no existing function touched:
--
-- 1. guard_published_class_fixed — BEFORE UPDATE on classes. Once a class is
--    published, what it IS (style, level, price, capacity, room, studio, pin,
--    the membership switches) does not move. Publishing it, deleting it and
--    changing its poster are untouched. The service role is exempt (the seeder,
--    the proofs and the shoots plant history), like every guard here.
-- 2. guard_published_session_fixed — BEFORE UPDATE OF starts_at, ends_at on
--    class_sessions: a published class's time does not move either.
-- 3. close_people_with_class — AFTER UPDATE OF deleted_at on classes: when a
--    class is deleted, every live class_people row on it is closed with the same
--    instant. Named so it fires after notify_class_called_off (AFTER triggers run
--    in name order). It writes deleted_at only, so notify_class_person (which
--    fires on status) says nothing.
--    ⚠ Stats count a claim's sessions up to the moment it closed
--    (20260918170000), and closing it at the class's own deletion instant keeps
--    every session that had already ended.
--
-- And one backfill: the 53 live rows on already-deleted classes, closed at their
-- class's deletion instant (all test, proof or demo rows, plus 8 of the owner's
-- own and 1 of Alisha Maini's — every one on a class already deleted).
--
-- ⚠ No begin/commit (Rule 18).

create or replace function public.guard_published_class_fixed()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role' then
    return new;
  end if;
  if old.status <> 'published' or new.status <> 'published' or new.deleted_at is not null then
    return new;
  end if;
  if row(new.style, new.level, new.price_inr, new.capacity, new.room, new.room_id,
         new.venue_business_id, new.lat, new.lng, new.maps_url,
         new.allows_studio_memberships, new.allows_artist_memberships)
     is distinct from
     row(old.style, old.level, old.price_inr, old.capacity, old.room, old.room_id,
         old.venue_business_id, old.lat, old.lng, old.maps_url,
         old.allows_studio_memberships, old.allows_artist_memberships) then
    raise exception 'A published class cannot be edited — delete it and add a new one';
  end if;
  return new;
end;
$$;

comment on function public.guard_published_class_fixed() is
  'A published class is fixed: what it is cannot change, only be deleted (11 Oct 2026). Service role exempt.';

create trigger classes_published_is_fixed
  before update on public.classes
  for each row execute function public.guard_published_class_fixed();

create or replace function public.guard_published_session_fixed()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role' then
    return new;
  end if;
  -- the same minute is not a move (the form's control is HH:MM — 30 Sep 2026)
  if date_trunc('minute', new.starts_at) = date_trunc('minute', old.starts_at)
     and date_trunc('minute', new.ends_at) = date_trunc('minute', old.ends_at) then
    return new;
  end if;
  if exists (
    select 1 from public.classes c
     where c.id = new.class_id and c.status = 'published' and c.deleted_at is null
  ) then
    raise exception 'A published class cannot be edited — delete it and add a new one';
  end if;
  return new;
end;
$$;

comment on function public.guard_published_session_fixed() is
  'A published class''s time does not move (11 Oct 2026). Service role exempt.';

create trigger class_sessions_published_is_fixed
  before update of starts_at, ends_at on public.class_sessions
  for each row execute function public.guard_published_session_fixed();

create or replace function public.close_people_with_class()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update public.class_people
       set deleted_at = new.deleted_at
     where class_id = new.id
       and deleted_at is null;
  end if;
  return null;
end;
$$;

comment on function public.close_people_with_class() is
  'When a class is deleted, the people asked onto it are closed with it (11 Oct 2026).';

create trigger zz_class_people_close_with_class
  after update of deleted_at on public.classes
  for each row execute function public.close_people_with_class();

revoke all on function public.guard_published_class_fixed() from public, anon, authenticated;
revoke all on function public.guard_published_session_fixed() from public, anon, authenticated;
revoke all on function public.close_people_with_class() from public, anon, authenticated;

-- the backfill: live rows on classes already deleted, closed at the class's instant
update public.class_people cp
   set deleted_at = c.deleted_at
  from public.classes c
 where c.id = cp.class_id
   and cp.deleted_at is null
   and c.deleted_at is not null;
