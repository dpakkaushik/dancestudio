-- ═══════════════════════════════════════════════════════════════════════════
-- A CLASS REPEATS WEEKLY (11 Oct 2026, the user's three answers: "One session
-- at a time", "Until an end date, max 26 weeks", "Once for the whole series").
--
-- A SERIES IS ONE CLASS WITH MANY SESSIONS. That is the whole design, and it
-- is why this is small: consent already lives on the CLASS (the teacher's yes
-- in `class_people`, the venue's in `classes.venue_status`), so a teacher and a
-- studio say yes ONCE for every week; and a booking already names a SESSION
-- (`class_bookings.session_id`), so a learner books one week at a time. No
-- table and no column is added. What moves:
--
--   1. `add_weekly_sessions(class, until)` — the owner adds a session every
--      seven days after the class's last one, up to an IST date, at most 26
--      live sessions in all. NEW.
--   2. `create_class_series(…the 16 create args…, until)` — `create_class_with_
--      session` and then (1), in ONE transaction, so a series is never half-
--      made. NEW.
--   3. `cancel_class_session(session, reason)` — the owner calls off ONE week:
--      every seat on it cancelled and every paid one refunded exactly as a
--      call-off refunds (the same `_cancel_one_class_booking` core, `called_off`
--      true), the people on it told, the session soft-deleted. Refused for a
--      session that is over, and for the LAST one still to come (that is
--      calling the class off, which is the class's own Delete). NEW.
--   4. `update_class_with_session` — editing a class's time changes THIS AND
--      EVERY LATER session, never one that has ended: the sessions not yet over
--      are shifted by the same amount and given the new length. A class with
--      no session to come behaves exactly as before. EDITED by anchor.
--   5. `assert_room_ok` — the capacity floor counts the fullest SESSION, not
--      every seat across the weeks (twenty people on each of ten weeks is not
--      two hundred in the room). Identical for a one-session class. EDITED.
--   6. `cancel_class_bookings_for_class` (deleting a class) — cancels the seats
--      on sessions still to END only; a seat on a week that already ran is a
--      record, and the core refuses it anyway, which would have stopped the
--      whole call-off part-way. Identical for a one-session class. EDITED.
--
-- Bodies are edited OUT OF THE CATALOG by asserted single-line anchor
-- (`_dos_swap`, as in 20261011100000) — `create or replace` keeps every
-- signature, so no existing grant moves. Nothing is backfilled; every class
-- on record keeps its one session. Nothing here writes `begin;`/`commit;`
-- (Rule 18).
-- ═══════════════════════════════════════════════════════════════════════════

create function public._dos_swap(p_def text, p_from text, p_to text, p_fn text, p_expect integer default 1) returns text
language plpgsql as $fn$
declare v_n integer;
begin
  v_n := (length(p_def) - length(replace(p_def, p_from, ''))) / length(p_from);
  if v_n <> p_expect then
    raise exception 'anchor found % times in %, expected %: %', v_n, p_fn, p_expect, left(p_from, 80);
  end if;
  return replace(p_def, p_from, p_to);
end;
$fn$;

-- ── 1 · add_weekly_sessions ─────────────────────────────────────────────────
create function public.add_weekly_sessions(p_class_id uuid, p_until date)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user uuid := auth.uid();
  v_class public.classes;
  v_last public.class_sessions;
  v_live integer;
  v_added integer := 0;
  v_start timestamptz;
  v_len interval;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_class from public.classes c where c.id = p_class_id and c.deleted_at is null;
  if not found then
    raise exception 'class not found';
  end if;
  if not public.is_business_owner(v_class.business_id) then
    raise exception 'Only the owner of this class can repeat it';
  end if;
  if p_until is null then
    raise exception 'Pick the date the class runs until';
  end if;
  select * into v_last from public.class_sessions s
   where s.class_id = p_class_id and s.deleted_at is null
   order by s.starts_at desc limit 1;
  if not found then
    raise exception 'This class has no session to repeat';
  end if;

  select count(*) into v_live from public.class_sessions s where s.class_id = p_class_id and s.deleted_at is null;
  v_len := v_last.ends_at - v_last.starts_at;
  v_start := v_last.starts_at + interval '7 days';
  -- the end date is a DATE in India: a session on that day is in
  while (v_start at time zone 'Asia/Kolkata')::date <= p_until loop
    if v_live >= 26 then
      raise exception 'A class repeats for at most 26 weeks — pick an earlier end date';
    end if;
    insert into public.class_sessions (class_id, business_id, starts_at, ends_at, created_by, updated_by)
    values (p_class_id, v_class.business_id, v_start, v_start + v_len, v_user, v_user);
    v_live := v_live + 1;
    v_added := v_added + 1;
    v_start := v_start + interval '7 days';
  end loop;

  if v_added = 0 then
    raise exception 'The end date has to be at least a week after the last session';
  end if;
  return v_added;
end;
$fn$;

comment on function public.add_weekly_sessions(uuid, date) is
  'A class repeats weekly (13 Oct 2026): the owner adds a session every seven days after the last one, up to an IST date, at most 26 live sessions. The teacher''s and the venue''s yes are the CLASS''s, so they cover every week; a learner books one session at a time.';

revoke all on function public.add_weekly_sessions(uuid, date) from public, anon;
grant execute on function public.add_weekly_sessions(uuid, date) to authenticated, service_role;

-- ── 2 · create_class_series ─────────────────────────────────────────────────
create function public.create_class_series(
  p_business_id uuid, p_title text, p_style text, p_level text, p_room text,
  p_price_inr integer, p_capacity integer, p_status text,
  p_starts_at timestamptz, p_ends_at timestamptz,
  p_room_id uuid, p_poster text, p_venue_business_id uuid,
  p_lat double precision, p_lng double precision, p_maps_url text,
  p_repeat_until date)
returns public.classes
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_class public.classes;
begin
  -- every rule of creating a class is the create door's own, unchanged
  v_class := public.create_class_with_session(
    p_business_id => p_business_id, p_title => p_title, p_style => p_style, p_level => p_level,
    p_room => p_room, p_price_inr => p_price_inr, p_capacity => p_capacity, p_status => p_status,
    p_starts_at => p_starts_at, p_ends_at => p_ends_at, p_room_id => p_room_id, p_poster => p_poster,
    p_venue_business_id => p_venue_business_id, p_lat => p_lat, p_lng => p_lng, p_maps_url => p_maps_url);
  -- and the weeks after it, in the same transaction: a series is never half-made
  perform public.add_weekly_sessions(v_class.id, p_repeat_until);
  return v_class;
end;
$fn$;

comment on function public.create_class_series(uuid, text, text, text, text, integer, integer, text, timestamptz, timestamptz, uuid, text, uuid, double precision, double precision, text, date) is
  'A class that repeats weekly, made in one act (13 Oct 2026): create_class_with_session, then add_weekly_sessions to the end date.';

revoke all on function public.create_class_series(uuid, text, text, text, text, integer, integer, text, timestamptz, timestamptz, uuid, text, uuid, double precision, double precision, text, date) from public, anon;
grant execute on function public.create_class_series(uuid, text, text, text, text, integer, integer, text, timestamptz, timestamptz, uuid, text, uuid, double precision, double precision, text, date) to authenticated, service_role;

-- ── 3 · cancel_class_session ────────────────────────────────────────────────
create function public.cancel_class_session(p_session_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user uuid := auth.uid();
  v_s public.class_sessions;
  v_class public.classes;
  v_seat record;
  r record;
  v_result jsonb;
  v_seats integer := 0;
  v_refunds integer := 0;
  v_rupees integer := 0;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_s from public.class_sessions s where s.id = p_session_id and s.deleted_at is null;
  if not found then
    raise exception 'session not found';
  end if;
  select * into v_class from public.classes c where c.id = v_s.class_id and c.deleted_at is null;
  if not found then
    raise exception 'class not found';
  end if;
  -- the owner's, like calling the whole class off
  if not public.is_business_owner(v_class.business_id) then
    raise exception 'Only the owner of this studio can call off its classes';
  end if;
  if v_s.ends_at <= now() then
    raise exception 'This session is over — it can no longer be called off';
  end if;
  if not exists (select 1 from public.class_sessions x
                  where x.class_id = v_class.id and x.deleted_at is null
                    and x.ends_at > now() and x.id <> v_s.id) then
    raise exception 'This is the last session still to come — delete the class to call it off';
  end if;

  -- tell the people holding a seat, before the seats close
  if v_class.status = 'published' then
    for r in
      select distinct e.user_id from public.class_bookings e
       where e.session_id = v_s.id and e.status = 'enrolled'
         and e.deleted_at is null and e.user_id is not null
    loop
      perform public.notify(
        r.user_id, 'class',
        v_class.title || ' on ' || to_char(v_s.starts_at at time zone 'Asia/Kolkata', 'Dy DD Mon') || ' was called off',
        'The studio has called off this one session. If you paid for it, the money is on its way back.',
        '/c/' || v_class.share_slug);
    end loop;
  end if;

  -- every seat on THIS session, through the call-off's own core: the refund is
  -- automatic whatever the clock says, and filed against the person who paid
  for v_seat in
    select e.id, e.user_id from public.class_bookings e
     where e.session_id = v_s.id and e.status = 'enrolled' and e.deleted_at is null
     order by e.created_at
     for update
  loop
    v_result := public._cancel_one_class_booking(v_seat.id, v_user, v_seat.user_id, p_reason, true);
    v_seats := v_seats + 1;
    if v_result -> 'refund' is not null and v_result -> 'refund' <> 'null'::jsonb then
      v_refunds := v_refunds + 1;
      v_rupees := v_rupees + coalesce((v_result -> 'refund' ->> 'amount_inr')::integer, 0);
    end if;
  end loop;

  update public.class_sessions set deleted_at = now(), updated_by = v_user where id = v_s.id;

  return jsonb_build_object('seats', v_seats, 'refunds', v_refunds, 'amount_inr', v_rupees);
end;
$fn$;

comment on function public.cancel_class_session(uuid, text) is
  'The owner calls off ONE session of a class (13 Oct 2026): its seats cancelled and paid ones refunded as a call-off refunds, the people on it told, the session soft-deleted. Refused once over, and for the last session still to come.';

revoke all on function public.cancel_class_session(uuid, text) from public, anon;
grant execute on function public.cancel_class_session(uuid, text) to authenticated, service_role;

-- ── 4, 5, 6 · the three edited bodies ───────────────────────────────────────
do $migration$
declare
  v_def text;
begin
  -- 4 · editing a class moves this and every later session, never a past one
  select pg_get_functiondef('public.update_class_with_session(uuid, text, text, text, text, integer, integer, timestamptz, timestamptz, uuid, text, uuid, double precision, double precision, text, boolean, boolean)'::regprocedure) into v_def;
  v_def := public._dos_swap(v_def,
    '  where class_id = p_class_id and deleted_at is null;',
    '  where class_id = p_class_id and deleted_at is null
    -- 13 Oct 2026: only when there is no session still to come (a past class
    -- keeps its old behaviour exactly); otherwise the shift below
    and not exists (select 1 from public.class_sessions x
                     where x.class_id = p_class_id and x.deleted_at is null and x.ends_at > now());

  -- ⚠ A CLASS THAT REPEATS (13 Oct 2026): the form edits the session that is
  -- next — the first not yet over — and every session not yet over moves by the
  -- same amount and takes the new length. A week that already ran stays where it
  -- ran. For a one-session class this is exactly the update above.
  update public.class_sessions s set
    starts_at = s.starts_at + (p_starts_at - a.anchor_start),
    ends_at   = s.starts_at + (p_starts_at - a.anchor_start) + (p_ends_at - p_starts_at)
  from (select min(x.starts_at) as anchor_start
          from public.class_sessions x
         where x.class_id = p_class_id and x.deleted_at is null and x.ends_at > now()) a
  where s.class_id = p_class_id and s.deleted_at is null and s.ends_at > now()
    and a.anchor_start is not null;',
    'update_class_with_session');
  execute v_def;

  -- 5 · the capacity floor counts the fullest session
  select pg_get_functiondef('public.assert_room_ok(uuid)'::regprocedure) into v_def;
  v_def := public._dos_swap(v_def,
    '  select count(*) into v_taken',
    '  -- 13 Oct 2026: the FULLEST SESSION, not every week''s seats added together
  select coalesce(max(t.n), 0) into v_taken from (select count(*) as n',
    'assert_room_ok');
  v_def := public._dos_swap(v_def,
    '     and e.deleted_at is null;',
    '     and e.deleted_at is null
   group by e.session_id) t;',
    'assert_room_ok');
  execute v_def;

  -- 6 · calling a class off closes the seats on sessions still to end
  select pg_get_functiondef('public.cancel_class_bookings_for_class(uuid, text)'::regprocedure) into v_def;
  v_def := public._dos_swap(v_def,
    '      and e.deleted_at is null',
    '      and e.deleted_at is null
      -- 13 Oct 2026: a seat on a week that already ran is a record, not a seat
      and exists (select 1 from public.class_sessions s where s.id = e.session_id and s.ends_at > now())',
    'cancel_class_bookings_for_class');
  execute v_def;
end;
$migration$;

drop function public._dos_swap(text, text, text, text, integer);
