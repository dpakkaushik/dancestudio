-- A WALK-IN HAS A NAME (29 Sep 2026) — shape 2 of the class door.
--
-- Shape 1 (`20260929120000`) books somebody who IS on DanceOS: the register
-- scans their profile code and seats them. This is the other half the user
-- chose — "both shapes, shape 1 first" — somebody who walks in off the street
-- with no account at all, recorded by NAME.
--
-- ⚠⚠ THIS IS THE ONE THING THE 28 Sep BACKLOG ROW SAID WAS "a much bigger
-- change", AND THE AUDIT IS WHY. `class_bookings.user_id` and
-- `attendance.user_id` are both NOT NULL references to `profiles`, and
-- THIRTY-ONE functions read those two tables. Every one was classified before
-- a line of this was written:
--
--   * 10 SAFE by construction — they either never name `user_id`, or they
--     filter `user_id = auth.uid()`, and NULL never equals anything. A walk-in
--     simply never counts as "mine", which is exactly right.
--   * 5 INSERT into one of the two tables. Four of them supply a real user
--     (`book_class_session`, `book_class_session_for_person`,
--     `book_with_membership`, `apply_captured_payment_classes_and_events`);
--     only `check_in` copies the booking's `user_id` through, and it is the one
--     that must tolerate NULL — which it does once the column allows it.
--   * 3 JOIN `public.profiles`, so a walk-in's row DROPS OUT of the answer.
--     ⚠ Correct in all three: `my_session_history` is a person's own history
--     and a walk-in has no person; `practice_people` is a crew's, nothing to do
--     with classes; `routine_students` lists the DANCERS who danced a routine
--     BY NAME, and an unnamed profile is not one. Said out loud because it
--     means a routine's dancer count does not include walk-ins.
--   * 13 read by eye, and none of them assumes a user exists.
--
-- ⚠⚠ AND THE AUDIT HAD A HOLE THAT COST NOTHING ONLY BECAUSE IT WAS FOUND: a
-- text search for the table names misses every TRIGGER function on those
-- tables, because a trigger says `new`/`old` and never names its table. Four
-- triggers sit on `class_bookings` and one on `attendance`. Of those:
--   * `guard_person_only` already returns early on a NULL id — the suspended
--     check simply does not apply to somebody who is not an account. Inherited.
--   * `return_membership_unit` and `set_updated_at` never touch `user_id`.
--   * ⚠ `notify_class_booking` DOES, and it is the one real defect this
--     migration would otherwise have shipped: it reads the booker's name out of
--     `profiles` and falls back to 'Somebody', so a studio would have been told
--     "Somebody booked Bollywood · Beginner" about a walk-in whose name is
--     sitting on the row. It is `create or replace`d below with ONE clause
--     added and everything else the catalog's own text.

-- ── 1. THE COLUMNS ──────────────────────────────────────────────────────────
alter table public.class_bookings
  alter column user_id drop not null,
  add column if not exists attendee_name text;

alter table public.attendance
  alter column user_id drop not null;

-- ⚠ NO `attendee_name` ON `attendance`, deliberately. `class_booking_id` is
-- NOT NULL there and unique per live row, so the name is always reachable
-- through the booking — and a name stored twice is a name that can disagree
-- with itself.
comment on column public.class_bookings.attendee_name is
  'A walk-in recorded at the door by name, with no DanceOS account (29 Sep 2026). '
  'Exactly one of user_id / attendee_name is set. attendance carries no copy: it '
  'reaches the name through class_booking_id, so there is one place it lives.';

alter table public.class_bookings
  add constraint class_bookings_one_attendee check (
    (user_id is not null and attendee_name is null)
    or (user_id is null and attendee_name is not null and char_length(btrim(attendee_name)) between 1 and 80)
  );

-- ── 2. THE INDEX THE OLD ONE STOPPED BEING ──────────────────────────────────
-- ⚠⚠ `class_bookings_one_live_per_session` is UNIQUE on (session_id, user_id)
-- where the row is live — and POSTGRES TREATS NULLS AS DISTINCT, so the moment
-- user_id can be NULL that index stops protecting walk-ins entirely: the same
-- person could be added at the door five times and nothing would object. This
-- is the walk-in's half of the same rule, keyed on the name instead.
create unique index if not exists class_bookings_one_live_walk_in_per_session
  on public.class_bookings (session_id, lower(btrim(attendee_name)))
  where attendee_name is not null
    and status in ('enrolled', 'waitlisted')
    and deleted_at is null;

-- ── 3. THE DOOR ─────────────────────────────────────────────────────────────
create or replace function public.add_class_walk_in(
  p_session_id uuid,
  p_name text
)
returns public.class_bookings
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_actor uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_session public.class_sessions;
  v_class public.classes;
  v_taken integer;
  v_row public.class_bookings;
begin
  if v_actor is null then
    raise exception 'not authenticated';
  end if;
  if char_length(v_name) < 1 then
    raise exception 'give the walk-in a name';
  end if;
  if char_length(v_name) > 80 then
    raise exception 'that name is too long';
  end if;

  select * into v_session from public.class_sessions s
    where s.id = p_session_id and s.deleted_at is null;
  if not found then
    raise exception 'session not found';
  end if;

  select * into v_class from public.classes c
    where c.id = v_session.class_id and c.deleted_at is null and c.status = 'published'
    for update;
  if not found then
    raise exception 'this class is not open';
  end if;

  if not public.can_run_register_for_class(v_class.id) then
    raise exception 'only the studio''s owner, trainer, or an assistant holding attendance runs the register';
  end if;

  -- the register's own window, exactly as shape 1 and `check_in`
  if now() < v_session.starts_at - interval '30 minutes' then
    raise exception 'the door opens 30 minutes before the session';
  end if;
  if now() > v_session.ends_at then
    raise exception 'the session has ended — the register is final';
  end if;

  if exists (
    select 1 from public.class_bookings e
    where e.session_id = p_session_id
      and e.attendee_name is not null
      and lower(btrim(e.attendee_name)) = lower(v_name)
      and e.status in ('enrolled', 'waitlisted')
      and e.deleted_at is null
  ) then
    raise exception 'somebody of that name is already in';
  end if;

  select count(*) into v_taken from public.class_bookings e
    where e.session_id = p_session_id and e.status = 'enrolled' and e.deleted_at is null;
  if v_taken >= v_class.capacity then
    raise exception 'this class is full — free a seat first';
  end if;

  insert into public.class_bookings
    (session_id, class_id, business_id, user_id, attendee_name, status, created_by, updated_by)
  values
    (p_session_id, v_class.id, v_class.business_id, null, v_name, 'enrolled', v_actor, v_actor)
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.add_class_walk_in(uuid, text) is
  'A walk-in with no DanceOS account, recorded at the door by name (29 Sep 2026). '
  'Same gate, window and capacity as book_class_session_for_person; a priced '
  'class is booked at zero and the money is collected at the door.';

revoke all on function public.add_class_walk_in(uuid, text) from public;
revoke all on function public.add_class_walk_in(uuid, text) from anon;
grant execute on function public.add_class_walk_in(uuid, text) to authenticated;
grant execute on function public.add_class_walk_in(uuid, text) to service_role;

-- ── 4. AND A WAY TO UNDO ONE ────────────────────────────────────────────────
-- ⚠⚠ WITHOUT THIS THE DOOR WOULD BE ONE-WAY, AND THAT ASYMMETRY WOULD BE NEW.
-- A real learner's booking is cancelled by the learner (`cancel_class_booking`
-- is `user_id = auth.uid()`), so a studio has never needed to remove one. A
-- walk-in has NO account to do it, so a name typed wrongly at a door would
-- otherwise hold a seat for ever.
--
-- ⚠ It is deliberately narrow: it refuses anything with a `user_id`, so it can
-- never touch a real person's booking. Undoing a real seat stays the learner's.
create or replace function public.remove_class_walk_in(p_class_booking_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.class_bookings;
begin
  if v_actor is null then
    raise exception 'not authenticated';
  end if;

  select * into v_row from public.class_bookings e
    where e.id = p_class_booking_id and e.deleted_at is null;
  if not found then
    raise exception 'booking not found';
  end if;
  if v_row.attendee_name is null then
    raise exception 'that is somebody''s own booking — only they can cancel it';
  end if;
  if not public.can_run_register_for_class(v_row.class_id) then
    raise exception 'only the studio''s owner, trainer, or an assistant holding attendance runs the register';
  end if;

  -- the attendance row goes with the seat, or the register would keep counting
  -- somebody who was never here
  update public.attendance
     set deleted_at = now(), updated_by = v_actor
   where class_booking_id = p_class_booking_id and deleted_at is null;

  update public.class_bookings
     set deleted_at = now(), updated_by = v_actor, status = 'cancelled'
   where id = p_class_booking_id;
end;
$$;

comment on function public.remove_class_walk_in(uuid) is
  'Undo a walk-in recorded by name (29 Sep 2026). Refuses any booking that has a '
  'user_id: a real person''s seat is theirs to cancel.';

revoke all on function public.remove_class_walk_in(uuid) from public;
revoke all on function public.remove_class_walk_in(uuid) from anon;
grant execute on function public.remove_class_walk_in(uuid) to authenticated;
grant execute on function public.remove_class_walk_in(uuid) to service_role;

-- ── 5. THE ONE LIVE FUNCTION THIS TOUCHES ───────────────────────────────────
-- ⚠ THE BODY IS THE CATALOG'S OWN, with ONE clause changed: the name now falls
-- back to the walk-in's before it falls back to 'Somebody'. Re-typing a live
-- function is how five of them silently differed on 28 Sep, so this was copied
-- out of `pg_get_functiondef` and edited by hand. Signature and grants
-- unchanged, so no ACL moves.
create or replace function public.notify_class_booking()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_class public.classes;
  v_who text;
begin
  select * into v_class from public.classes c where c.id = new.class_id;
  select p.full_name into v_who from public.profiles p where p.id = new.user_id;

  if tg_op = 'INSERT' then
    perform public.notify_business_owners(new.business_id, 'booking',
      coalesce(v_who, new.attendee_name, 'Somebody') || (case new.status when 'waitlisted' then ' joined the waitlist for ' else ' booked ' end) || coalesce(v_class.title, 'a class'),
      null, '/business/' || new.business_id::text || '/classes');
  elsif tg_op = 'UPDATE' and old.status = 'waitlisted' and new.status = 'enrolled' then
    -- THE WAITLIST IS TOLD, OR IT IS NOT A WAITLIST (13647)
    -- ⚠ `notify` takes a PERSON, and a walk-in is not one. It is never
    -- waitlisted (both doors refuse a full class outright), so this branch
    -- cannot be reached for one — and the guard says so rather than relying on
    -- that staying true.
    if new.user_id is not null then
      perform public.notify(new.user_id, 'class',
        'A place opened in ' || coalesce(v_class.title, 'a class'),
        'You were first on the waitlist and the seat is yours.',
        '/c/' || coalesce(v_class.share_slug, ''));
    end if;
  end if;
  return null;
end;
$$;
