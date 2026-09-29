-- A CLASS HAS A DOOR (29 Sep 2026)
--
-- The user, 28 Sep: "walk in only for classes and events inside their
-- attendance tab", and "no need for the lead process for walk in".
--
-- Classes have had no walk-in of any kind. The register grew a scanner on
-- 28 Sep and the one thing it cannot do is the obvious one: somebody stands at
-- the door, holds up their own profile code, and the sheet says "not booked"
-- and stops. This is the door that sentence needs.
--
-- ⚠ THIS IS SHAPE 1 OF TWO, AND THE USER CHOSE THE ORDER. It books a person
-- who IS on DanceOS. Somebody with no account is shape 2 -- nullable
-- `user_id` + `attendee_name` on both `class_bookings` and `attendance` --
-- which is a much bigger change (30 functions read those two tables) and is
-- its own slice. Nothing here blocks it or prejudges it.
--
-- ⚠⚠ AND IT REVERSES A DELIBERATE NON-FEATURE, WHICH IS THE WHOLE OF THE RISK.
-- Step 12 (25 Aug 2026) wrote: "a studio CANNOT book a seat for somebody.
-- Enrolling is the learner's own act ... faking an enrollment here would have
-- put a name on a roster that never agreed to it." That reasoning is right for
-- a studio sitting at a desk inventing bookings, and it is wrong for a door:
-- the person is standing there and has handed over their own code, which is
-- consent in person rather than consent by proxy.
--
-- ⚠ SO THE WINDOW IS WHAT KEEPS THE REVERSAL SMALL, and it is deliberately the
-- REGISTER'S OWN, copied from `check_in` rather than invented: from thirty
-- minutes before the session until the moment it ends. Outside that window a
-- studio still cannot book anybody for anything -- so this door can only ever
-- be used while the class it belongs to is actually happening, which is the
-- only circumstance the consent argument above covers.
--
-- WHAT IT DOES NOT DO, each of them a decision the user took rather than an
-- omission:
--   * CAPACITY IS REAL. A full class refuses. `assert_room_ok` caps a class by
--     its room, and a door that can overfill a room is a fire-safety claim this
--     app should not make. Free a seat, or give a waitlisted person the spot
--     (`give_spot`), then add.
--   * NO MONEY. A priced class books at zero and the money is collected at the
--     door -- DanceOS does not move it (Step 13's standing limit). ⚠ The class's
--     Earnings tab will therefore show a seat with no payment against it, which
--     is true and is the cost of the chosen answer.
--     ⚠ Note this is the one rule it does NOT share with `book_class_session`,
--     which refuses a priced class outright ("book it from its class page") so
--     the seat goes through Cashfree. At a door there is no window to open.
--   * NO LEADS ROW. A walk-in does not become a student on the Students desk.
--     R44 defines a student through `attendance.user_id`, which this row does
--     have -- so a person booked at the door and checked in DOES appear there,
--     by the existing rule and with no help from this migration.
--   * NO WAITLISTING. At a door, putting the person in front of you on a list
--     is not an answer, so a full class is refused in words instead.
--
-- ⚠ NOTHING ELSE MOVES. No table, no column, no policy, no grant on anything
-- that already exists, and not one existing function is touched. `class_bookings`
-- has no INSERT policy and never had one -- every write to it is an RPC -- so
-- this adds a door beside `book_class_session` and `book_with_membership`
-- rather than widening anything.
--
-- ⚠ TWO TRIGGERS FIRE ON THE INSERT AND BOTH ARE LEFT ALONE, ON PURPOSE:
--   * `class_bookings_person_only` -> `guard_person_only`, which refuses a
--     SUSPENDED account. Inherited exactly as every other booking path has it;
--     there is nothing to re-implement here.
--   * `notify_class_booking`, which tells the business's owners
--     "{name} booked {class}". The verb is the desk's rather than the person's,
--     and the FACT is right -- a seat was taken -- so it is better than silence.
--     Rewriting a live notify function for a wording nuance would put the
--     ordinary booking path at risk for nothing (Rule 4's spirit).

create or replace function public.book_class_session_for_person(
  p_session_id uuid,
  p_user_id uuid
)
returns public.class_bookings
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_actor uuid := auth.uid();
  v_session public.class_sessions;
  v_class public.classes;
  v_existing text;
  v_taken integer;
  v_row public.class_bookings;
begin
  if v_actor is null then
    raise exception 'not authenticated';
  end if;
  if p_user_id is null then
    raise exception 'name somebody to book';
  end if;

  select * into v_session from public.class_sessions s
    where s.id = p_session_id and s.deleted_at is null;
  if not found then
    raise exception 'session not found';
  end if;

  -- the class row is the capacity lock, exactly as in `book_class_session`
  select * into v_class from public.classes c
    where c.id = v_session.class_id and c.deleted_at is null and c.status = 'published'
    for update;
  if not found then
    raise exception 'this class is not open';
  end if;

  -- THE GATE IS THE REGISTER'S. Whoever may run the door may open it for
  -- somebody; nobody else may. Same function, same refusal, as `check_in`.
  if not public.can_run_register_for_class(v_class.id) then
    raise exception 'only the studio''s owner, trainer, or an assistant holding attendance runs the register';
  end if;

  -- THE REGISTER'S OWN WINDOW, and its own words (Step 10, `check_in`).
  if now() < v_session.starts_at - interval '30 minutes' then
    raise exception 'the door opens 30 minutes before the session';
  end if;
  if now() > v_session.ends_at then
    raise exception 'the session has ended — the register is final';
  end if;

  if not exists (
    select 1 from public.profiles p where p.id = p_user_id and p.deleted_at is null
  ) then
    raise exception 'that person is not on DanceOS';
  end if;

  -- ⚠ THE THREE ANSWERS THE DOOR HAS TO TELL APART (the scanner's own, 28 Sep):
  -- already in, on the waitlist, or not booked. Collapsing the first two into
  -- one refusal is what makes a door say the wrong thing.
  select e.status into v_existing from public.class_bookings e
    where e.session_id = p_session_id and e.user_id = p_user_id
      and e.status in ('enrolled', 'waitlisted') and e.deleted_at is null;
  if v_existing = 'enrolled' then
    raise exception 'they already have a spot in this class';
  elsif v_existing = 'waitlisted' then
    raise exception 'they are on the waitlist — give them the spot instead';
  end if;

  -- FULL IS FULL (the user's own answer). Counted under the lock taken above.
  select count(*) into v_taken from public.class_bookings e
    where e.session_id = p_session_id and e.status = 'enrolled' and e.deleted_at is null;
  if v_taken >= v_class.capacity then
    raise exception 'this class is full — free a seat first';
  end if;

  -- ⚠ `user_id` is the person who now holds the seat; `created_by` is whoever
  -- opened the door for them. The row therefore records that this was a walk-in
  -- and who let them in, without a column saying so.
  insert into public.class_bookings
    (session_id, class_id, business_id, user_id, status, created_by, updated_by)
  values
    (p_session_id, v_class.id, v_class.business_id, p_user_id, 'enrolled', v_actor, v_actor)
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.book_class_session_for_person(uuid, uuid) is
  'The class door (29 Sep 2026). Whoever may run the register may book a person '
  'who is standing in front of them, from 30 minutes before the session until it '
  'ends. Capacity is real, a priced class books at zero and the money is '
  'collected at the door, and nobody is waitlisted. Shape 1 of two: somebody '
  'with no DanceOS account needs a nullable user_id and is its own slice.';

-- ⚠ A NEW FUNCTION ARRIVES WITH SUPABASE'S DEFAULT PRIVILEGES -- execute to
-- PUBLIC, which is anon as well (the 16 Sep lesson, where 45 authenticated-only
-- RPCs silently became callable by anon). Revoke first, then grant exactly the
-- set the rest of this family carries.
revoke all on function public.book_class_session_for_person(uuid, uuid) from public;
revoke all on function public.book_class_session_for_person(uuid, uuid) from anon;
grant execute on function public.book_class_session_for_person(uuid, uuid) to authenticated;
grant execute on function public.book_class_session_for_person(uuid, uuid) to service_role;
