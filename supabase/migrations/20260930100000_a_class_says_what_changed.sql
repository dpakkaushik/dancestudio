-- 30 Sep 2026 — A CLASS SAYS WHAT CHANGED, AND CANNOT SHRINK BELOW ITS SEATS
--
-- Two gaps found by reading the whole class path end to end. Both are about a
-- class that ALREADY HAS PEOPLE ON IT, which is the only state where an edit
-- can cost somebody something.
--
-- 1. A CAPACITY CAN BE SET BELOW THE SEATS ALREADY TAKEN. `assert_room_ok` is
--    the one guard on capacity and it compares the number with the ROOM's
--    capacity and with nothing else, so a class with twenty people booked can
--    be set to five. Nothing refuses it, the register then reads "20 of 5
--    booked", and every screen that draws a fill bar draws one past 100%.
--    ⚠ The check goes ABOVE the `room_id is null` early return on purpose: an
--    artist's class at a map link has no room at all, so anything below that
--    return would guard a studio's classes and not theirs.
--
-- 2. NOBODY IS TOLD WHEN A CLASS MOVES OR IS CALLED OFF. `class_sessions` has
--    carried no notify trigger at all, and a soft delete of a published class
--    raises nothing — so a studio can move Saturday's class to Sunday, or take
--    it off the calendar entirely, and the twenty people holding a seat find
--    out by turning up. Every other consequential fact in this app is raised
--    where it happens (Step 24's rule, eight triggers); these two were missed
--    because they are UPDATEs on rows nobody thought of as events.
--
-- ⚠ WHAT THIS DELIBERATELY DOES NOT DO, so it is not re-proposed:
--   * NO `run_class_clock()` CRON. Nothing in this app has ever written
--     `classes.status = 'completed'` and the app now DERIVES the phase from the
--     session (`classPhaseAt`, 30 Sep 2026), so the shelves, the register's
--     tabs and the class page are already right. A cron would only make the
--     stored column agree with what every screen already says — worth doing one
--     day for anything reading the column directly, worth nothing today, and
--     not worth a scheduled job on a live database for that.
--   * NO AUTOMATIC REFUND when a class is called off. Deleting a published
--     class leaves its bookings live and creates no refund rows; the register's
--     own sheet says "N enrolled students must be refunded" and the studio does
--     that from its Refunds desk. Making a delete cancel-and-refund every seat
--     is a decision about somebody's money and belongs in its own slice with
--     its own approval — so the notification below says what happened and
--     PROMISES NOTHING about the money, rather than claiming a refund this
--     system does not make.
--
-- ⚠ NOTHING ELSE MOVES: no table, no column, no policy, no grant on anything
-- that exists, and no function's signature. `assert_room_ok` is replaced with
-- the catalog's own body plus one block; it is executable by no client role and
-- is reached only through the two constraint triggers that already call it.

-- ── 1. the capacity floor ─────────────────────────────────────────────────────
-- ⚠ THE BODY BELOW IS `20260918120000`'s VERBATIM, with exactly one block added
-- (marked). A re-typed function is one that can differ — five of six re-typed
-- bodies were wrong on 28 Sep — so this is copied rather than remembered.
create or replace function public.assert_room_ok(p_class_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class public.classes;
  v_room public.rooms;
  v_clash text;
  v_taken integer;
begin
  select * into v_class from public.classes c where c.id = p_class_id and c.deleted_at is null;
  if not found then
    return;
  end if;

  -- ⚠⚠ ADDED 30 Sep 2026 — A CLASS CANNOT BE MADE SMALLER THAN ITS OWN ROSTER.
  -- Above the room check on purpose: a class with no room (an artist's at a map
  -- link) never reaches the block below, and its seats are just as real.
  select count(*) into v_taken
    from public.class_bookings e
   where e.class_id = v_class.id
     and e.status = 'enrolled'
     and e.deleted_at is null;
  if v_class.capacity < v_taken then
    raise exception '% already hold a seat on this class — the capacity cannot go below that', v_taken;
  end if;

  if v_class.room_id is null then
    return;
  end if;
  select * into v_room from public.rooms r where r.id = v_class.room_id and r.deleted_at is null;
  if not found then
    raise exception 'that room no longer exists';
  end if;
  -- the class's own room, or its venue's (18 Sep 2026)
  if v_room.business_id <> v_class.business_id and v_room.business_id is distinct from v_class.venue_business_id then
    raise exception 'that room belongs to another studio';
  end if;
  if v_class.capacity > v_room.capacity then
    raise exception '% holds % — lower the capacity or pick a bigger room', v_room.name, v_room.capacity;
  end if;
  if v_class.status <> 'published' then
    return; -- a draft is not in any room yet
  end if;
  -- the clash check is by ROOM, whoever owns the classes in it: a studio can
  -- never publish into a slot an artist's accepted class already holds, nor the
  -- other way round
  select c2.title into v_clash
    from public.class_sessions s
    join public.classes c2 on c2.id = s.class_id
    join public.class_sessions s2 on s2.class_id = v_class.id
   where s.class_id <> v_class.id
     and c2.room_id = v_class.room_id
     and c2.status = 'published'
     and c2.deleted_at is null
     and s.deleted_at is null
     and s2.deleted_at is null
     and s.starts_at < s2.ends_at
     and s2.starts_at < s.ends_at
   limit 1;
  if v_clash is not null then
    raise exception '% is already booked then (%)', v_room.name, v_clash;
  end if;
end;
$$;

comment on function public.assert_room_ok(uuid) is
  'The room rules for one class: a capacity no smaller than the seats already '
  'taken (30 Sep 2026), a room that exists and belongs to this business or its '
  'venue, a capacity within that room, and no overlap with another published '
  'class in the same room. Called by the two constraint triggers on classes and '
  'class_sessions; executable by no client role.';

-- ── 2. the people holding a seat are told ─────────────────────────────────────
-- ⚠ `notify()` never raises (Step 24): a notification must never be the reason
-- an edit fails. Both of these return null and are AFTER triggers, so nothing
-- here can roll a legitimate change back.
-- ⚠ `user_id is not null` — a walk-in (29 Sep 2026) has no account to tell.
-- ⚠ The kind is 'class', which is what `notifications.kind`'s CHECK admits. The
-- venue-request trigger wrote 'classes' for eight days and every one of its
-- notifications was silently dropped (26 Sep 2026); the plural is the trap.

create or replace function public.notify_class_moved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class public.classes;
  r record;
begin
  if new.starts_at is not distinct from old.starts_at
     and new.ends_at is not distinct from old.ends_at then
    return null;
  end if;

  select * into v_class from public.classes c
    where c.id = new.class_id and c.deleted_at is null;
  -- a draft has nobody on it, and a deleted class has its own message below
  if not found or v_class.status <> 'published' then
    return null;
  end if;

  for r in
    select distinct e.user_id
      from public.class_bookings e
     where e.session_id = new.id
       and e.status in ('enrolled', 'waitlisted')
       and e.deleted_at is null
       and e.user_id is not null
  loop
    perform public.notify(
      r.user_id,
      'class',
      v_class.title || ' has moved',
      'It now starts ' ||
        to_char(new.starts_at at time zone 'Asia/Kolkata', 'Dy DD Mon') || ' at ' ||
        trim(to_char(new.starts_at at time zone 'Asia/Kolkata', 'HH12:MIam')) || '.',
      '/c/' || v_class.share_slug
    );
  end loop;
  return null;
end;
$$;

drop trigger if exists notify_class_moved on public.class_sessions;
create trigger notify_class_moved
  after update of starts_at, ends_at on public.class_sessions
  for each row execute function public.notify_class_moved();

create or replace function public.notify_class_called_off()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  -- the soft delete itself, and only the first time
  if old.deleted_at is not null or new.deleted_at is null then
    return null;
  end if;
  -- a draft was never on anybody's calendar
  if old.status <> 'published' then
    return null;
  end if;

  for r in
    select distinct e.user_id
      from public.class_bookings e
     where e.class_id = new.id
       and e.status in ('enrolled', 'waitlisted')
       and e.deleted_at is null
       and e.user_id is not null
  loop
    perform public.notify(
      r.user_id,
      'class',
      new.title || ' was called off',
      'The studio has taken this class off the calendar.',
      '/my-classes'
    );
  end loop;
  return null;
end;
$$;

drop trigger if exists notify_class_called_off on public.classes;
create trigger notify_class_called_off
  after update of deleted_at on public.classes
  for each row execute function public.notify_class_called_off();

revoke execute on function public.notify_class_moved() from public, anon, authenticated;
revoke execute on function public.notify_class_called_off() from public, anon, authenticated;

comment on function public.notify_class_moved() is
  'Tells everybody holding a live seat that the session moved (30 Sep 2026). '
  'Raised where the fact happens, which is the UPDATE on class_sessions.';
comment on function public.notify_class_called_off() is
  'Tells everybody holding a live seat that a published class was taken off the '
  'calendar (30 Sep 2026). Says nothing about money: taking a class down creates '
  'no refund rows, and the studio settles those from its own Refunds desk.';
