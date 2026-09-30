-- EDITING A CLASS IS ONE ACT (30 Sep 2026)
--
-- ⚠ `updateClassDetails` has always been TWO updates with nothing joining them:
--
--     update classes       set style, level, room, price, capacity, venue, …
--     update class_sessions set starts_at, ends_at
--
-- They are two round trips from the app, so there is no transaction around
-- them. Anything between the two — a dropped connection, a refused second
-- statement, a timeout — leaves a class whose STYLE, PRICE and CAPACITY have
-- moved and whose TIME has not, with nothing to say so. The form reports the
-- failure, but the first write has already landed and cannot be taken back.
--
-- ⚠ It is not a hypothetical shape: the second update is the one most likely to
-- be refused, because `class_sessions` carries `sessions_room_check_after` (the
-- room clash guard, and the capacity floor added this morning), so moving a
-- class into an hour another class already holds fails AFTER the class row has
-- already taken the new style, price and capacity.
--
-- A plpgsql function body is one statement to the caller, so both updates land
-- or neither does. That is the whole of this migration.
--
-- ── WHAT IT DOES ────────────────────────────────────────────────────────────
--   One new door, `update_class_with_session`, which is the two updates the
--   repository already makes, in the same order, with the same values.
--
-- ⚠ NO TRIGGER, NO POLICY AND NO COLUMN CHANGES. Every guard that fires today
-- fires unchanged and in the same order: `classes_publish_needs_a_yes`,
-- `classes_room_guard_before`, `classes_venue_changes_before` (which still
-- refuses to move a PUBLISHED class's venue), `classes_room_check_after`,
-- `notify_venue_request`, then on the session `notify_class_moved` and
-- `sessions_room_check_after`. The order is the app's own, kept deliberately.
--
-- ⚠⚠ AND IT RE-CHECKS AUTHORITY ITSELF, BECAUSE A DEFINER FUNCTION BYPASSES RLS.
-- Today the app's first UPDATE is guarded by the `classes` UPDATE policy — the
-- OWNER's alone since 18 Sep 2026 — and reads its own result back to turn a
-- silent refusal into a sentence. Inside a definer function that policy does not
-- run at all, so the ownership test is explicit and raises the SAME sentence the
-- repository raises today, which is what keeps the form's message unchanged.

create or replace function public.update_class_with_session(
  p_class_id uuid,
  p_title text,
  p_style text,
  p_level text,
  p_room text,
  p_price_inr integer,
  p_capacity integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_room_id uuid,
  p_poster text,
  p_venue_business_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_maps_url text,
  p_allows_studio_memberships boolean,
  p_allows_artist_memberships boolean
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_class public.classes;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_class from public.classes c
    where c.id = p_class_id and c.deleted_at is null;
  if not found then
    raise exception 'Class not found or not yours to edit';
  end if;

  -- ⚠ THE SAME SENTENCE FOR "NO SUCH CLASS" AND "NOT YOURS", DELIBERATELY. It is
  -- what the repository already raises for both, and telling a stranger which of
  -- the two it was would say whether a class id exists.
  if not public.is_business_owner(v_class.business_id) then
    raise exception 'Class not found or not yours to edit';
  end if;

  update public.classes set
    title                     = p_title,
    style                     = p_style,
    level                     = p_level,
    room                      = p_room,
    room_id                   = p_room_id,
    poster                    = p_poster,
    price_inr                 = p_price_inr,
    capacity                  = p_capacity,
    venue_business_id         = p_venue_business_id,
    lat                       = p_lat,
    lng                       = p_lng,
    maps_url                  = p_maps_url,
    allows_studio_memberships = p_allows_studio_memberships,
    allows_artist_memberships = p_allows_artist_memberships
  where id = p_class_id and deleted_at is null;

  -- ⚠ `updated_by` is left to `classes_set_updated_at` / `class_sessions_set_updated_at`,
  -- exactly as the two loose updates leave it: the trigger coalesces auth.uid(),
  -- and a definer function changes the ROLE, never the JWT claims, so auth.uid()
  -- is still the person who pressed Save.
  update public.class_sessions set
    starts_at = p_starts_at,
    ends_at   = p_ends_at
  where class_id = p_class_id and deleted_at is null;
end;
$function$;

comment on function public.update_class_with_session(uuid, text, text, text, text, integer, integer, timestamptz, timestamptz, uuid, text, uuid, double precision, double precision, text, boolean, boolean) is
  'Edits a class and moves its session in ONE act. The repository made these as '
  'two round trips with no transaction between them, so a refused second write '
  'left a class edited and its time not — and the second is the likelier to be '
  'refused, because the session carries the room-clash guard. Owner only, and '
  'it says so itself: a definer function bypasses the RLS policy that used to '
  'be the guard. 30 Sep 2026.';

revoke all on function public.update_class_with_session(uuid, text, text, text, text, integer, integer, timestamptz, timestamptz, uuid, text, uuid, double precision, double precision, text, boolean, boolean) from public;
revoke all on function public.update_class_with_session(uuid, text, text, text, text, integer, integer, timestamptz, timestamptz, uuid, text, uuid, double precision, double precision, text, boolean, boolean) from anon;
grant execute on function public.update_class_with_session(uuid, text, text, text, text, integer, integer, timestamptz, timestamptz, uuid, text, uuid, double precision, double precision, text, boolean, boolean) to authenticated;
grant execute on function public.update_class_with_session(uuid, text, text, text, text, integer, integer, timestamptz, timestamptz, uuid, text, uuid, double precision, double precision, text, boolean, boolean) to service_role;
