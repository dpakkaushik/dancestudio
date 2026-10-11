-- ═══════════════════════════════════════════════════════════════════════════
-- CLASSES, MADE FINAL (11 Oct 2026) — the database half of "this should be the
-- last time we are looking at classes and build it properly end to end".
--
-- The user's decisions (D) and the audits' bugs (B) this file carries:
--
--   D2  pay per class: `record_payout` already pays anybody confirmed on a class
--       (an outside artist too) once a rate is set; it now stops counting a
--       person whose place closed BEFORE the session started (a teacher who
--       stepped down is not owed for a class they did not take). A re-ask keeps
--       the previous row's rate (B5); the seat's rate is still the default.
--   D3  a closed draft is a RECORD: the 'draft-clock' cron is unscheduled and
--       `close_stale_drafts()` is dropped.
--   D4  `step_down_from_class(id, reason)` for a confirmed person on a class that
--       has not started. When the confirmed TEACHER of a published class leaves
--       for any reason (stepped down, withdrawn, taken off the team), a trigger
--       on class_people tells the runners and everybody booked, and every
--       booking door refuses "This class is waiting for a new teacher" until a
--       new teacher says yes (`class_waits_for_teacher`). `ask_class_person`
--       asks a new teacher on a published class only once the old one is gone.
--   D6  a pass's hours follow the studio's refund window: returned when the seat
--       is cancelled at least `refund_window_hours` before, or the class is
--       called off; KEPT inside the window.
--   D7  the VENUE studio's runners (owner/manager, venue accepted) run the door
--       of an artist's class held in their room — `can_run_register_for_class`
--       only; nothing that reads or moves money changes.
--   D8  an overlapping booking is refused in words at every booking door, and a
--       capture that would overlap is refunded.
--   D9  an ACCEPTED room request holds the room, draft or published.
--   D10 a self-made booking tells the runners and the confirmed teacher; a door
--       booking or a walk-in tells nobody.
--   D11 `class_sessions.reminded_at` + `remind_upcoming_sessions()`, every 15
--       minutes ('class-reminders'), once per session, two hours ahead.
--   B1  the capture applier refunds a seat on a deleted / unpublished / started /
--       deleted-session class, a teacherless one, to a person who runs it, or
--       one that would overlap — never seats it.
--   B2  a call-off tells every seat holder (free, pass and paid).
--   B3  `classes_publish_state` shows a teacher's no; a published class with no
--       teacher reads "This class is waiting for a new teacher".
--   B4  published → anything but published is refused (deleting is the way out).
--   B5  a re-ask carries the previous row's powers and rate, whoever asks.
--   B8  a pass is never offered for, nor spent on, a FREE class.
--   B12 an ask on a class that has started is refused.
--   B14 an answer reaches the runners AND the asker; a venue request the venue's
--       runners; a withdrawal the person asked; a publish the teacher and the
--       assistants; asks point at Classes, not the Inbox.
--   B22 cancelling a seat closes its attendance row.
--
-- Bodies are edited OUT OF THE CATALOG by asserted anchor (`_dos_swap`, dropped
-- at the end). No signature changes, so no ACL moves on any existing function.
-- No table is added and no policy is touched. No begin/commit (Rule 18).
-- ═══════════════════════════════════════════════════════════════════════════

create function public._dos_swap(p_def text, p_from text, p_to text, p_fn text, p_expect integer default 1) returns text
language plpgsql as $fn$
declare v_n integer;
begin
  -- a working copy checked out with CRLF must still match the catalog's LF
  p_from := replace(p_from, E'\r', '');
  p_to := replace(p_to, E'\r', '');
  v_n := (length(p_def) - length(replace(p_def, p_from, ''))) / length(p_from);
  if v_n <> p_expect then
    raise exception 'anchor found % times in %, expected %: %', v_n, p_fn, p_expect, left(p_from, 80);
  end if;
  return replace(p_def, p_from, p_to);
end;
$fn$;

-- ── new helpers ─────────────────────────────────────────────────────────────

-- the people who run a business (owner and managers), told as one
create function public.notify_business_runners(p_business_id uuid, p_kind text, p_title text, p_body text, p_href text, p_except uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user uuid;
begin
  for v_user in
    select distinct m.user_id from public.business_members m
     where m.business_id = p_business_id and m.member_role in ('owner', 'manager') and m.deleted_at is null
       and m.user_id is distinct from p_except
  loop
    perform public.notify(v_user, p_kind, p_title, p_body, p_href);
  end loop;
end;
$fn$;
comment on function public.notify_business_runners(uuid, text, text, text, text, uuid) is
  'Tells the owner and every manager of a business (11 Oct 2026). Never raises — notify() swallows.';
revoke all on function public.notify_business_runners(uuid, text, text, text, text, uuid) from public, anon, authenticated;

-- D4: a published class whose confirmed teacher LEFT (a closed confirmed artist
-- row) and has no confirmed teacher now
create function public.class_waits_for_teacher(p_class_id uuid)
returns boolean
language sql
stable security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.classes c
     where c.id = p_class_id and c.deleted_at is null and c.status = 'published'
       and not exists (select 1 from public.class_people cp
                        where cp.class_id = c.id and cp.kind = 'artist'
                          and cp.status = 'confirmed' and cp.deleted_at is null)
       and exists (select 1 from public.class_people cp
                    where cp.class_id = c.id and cp.kind = 'artist'
                      and cp.status = 'confirmed' and cp.deleted_at is not null)
  );
$fn$;
comment on function public.class_waits_for_teacher(uuid) is
  'True while a published class''s teacher has left and no new one has said yes — every booking door refuses then (11 Oct 2026).';
revoke all on function public.class_waits_for_teacher(uuid) from public, anon;
grant execute on function public.class_waits_for_teacher(uuid) to authenticated, service_role;

-- the reasons a seat cannot be given to this person on this session, as one
-- sentence or null: no teacher (D4), you run it, you are booked elsewhere then (D8)
create function public._class_booking_refusal(p_session_id uuid, p_user_id uuid)
returns text
language plpgsql
stable security definer
set search_path = ''
as $fn$
declare
  v_s public.class_sessions;
  v_c public.classes;
  v_clash text;
begin
  select * into v_s from public.class_sessions s where s.id = p_session_id and s.deleted_at is null;
  if not found then
    return 'session not found';
  end if;
  select * into v_c from public.classes c where c.id = v_s.class_id and c.deleted_at is null;
  if not found then
    return 'class is not open for booking';
  end if;
  if public.class_waits_for_teacher(v_c.id) then
    return 'This class is waiting for a new teacher';
  end if;
  if p_user_id is null then
    return null;
  end if;
  if exists (select 1 from public.business_members m
              where m.business_id = v_c.business_id and m.user_id = p_user_id
                and m.member_role in ('owner', 'manager') and m.deleted_at is null)
     or exists (select 1 from public.class_people cp
                 where cp.class_id = v_c.id and cp.user_id = p_user_id
                   and cp.status = 'confirmed' and cp.deleted_at is null) then
    return 'You run this class — it is not yours to book';
  end if;
  select c2.title into v_clash
    from public.class_bookings e
    join public.class_sessions s2 on s2.id = e.session_id and s2.deleted_at is null
    join public.classes c2 on c2.id = e.class_id and c2.deleted_at is null
   where e.user_id = p_user_id and e.status = 'enrolled' and e.deleted_at is null
     and e.session_id <> p_session_id
     and s2.starts_at < v_s.ends_at and v_s.starts_at < s2.ends_at
   limit 1;
  if v_clash is not null then
    return 'You''re booked into ' || v_clash || ' at that time';
  end if;
  return null;
end;
$fn$;
revoke all on function public._class_booking_refusal(uuid, uuid) from public, anon, authenticated;

create function public._assert_class_bookable(p_session_id uuid, p_user_id uuid)
returns void
language plpgsql
stable security definer
set search_path = ''
as $fn$
declare
  v_why text;
begin
  v_why := public._class_booking_refusal(p_session_id, p_user_id);
  if v_why is not null then
    raise exception '%', v_why;
  end if;
end;
$fn$;
revoke all on function public._assert_class_bookable(uuid, uuid) from public, anon, authenticated;

-- ── D3 · a closed draft is a record ─────────────────────────────────────────

do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'draft-clock') then
      perform cron.unschedule('draft-clock');
    end if;
  end if;
end
$do$;
drop function public.close_stale_drafts();

-- ── D8 / D4 / B8 · every booking door ───────────────────────────────────────

do $do$
declare d text;
begin
  select pg_get_functiondef('public.book_class_session(uuid,uuid)'::regprocedure) into d;
  d := public._dos_swap(d,
    $a$  select count(*) into v_taken from public.class_bookings e$a$,
    $a$  -- 11 Oct 2026: no teacher, or booked into another class then (D4, D8)
  perform public._assert_class_bookable(p_session_id, v_user);

  select count(*) into v_taken from public.class_bookings e$a$, 'book_class_session');
  execute d;

  select pg_get_functiondef('public.create_payment_order(uuid)'::regprocedure) into d;
  d := public._dos_swap(d,
    $a$  select count(*) into v_taken from public.class_bookings e$a$,
    $a$  -- 11 Oct 2026: no teacher, or booked into another class then (D4, D8)
  perform public._assert_class_bookable(p_session_id, v_user);

  select count(*) into v_taken from public.class_bookings e$a$, 'create_payment_order');
  execute d;

  select pg_get_functiondef('public.book_with_membership(uuid,uuid)'::regprocedure) into d;
  d := public._dos_swap(d,
    $a$    raise exception 'class is not open for booking';
  end if;$a$,
    $a$    raise exception 'class is not open for booking';
  end if;
  -- 11 Oct 2026 (B8): a pass is never spent on a free class
  if v_class.price_inr <= 0 then
    raise exception 'this class is free — book it without a pass';
  end if;$a$, 'book_with_membership');
  d := public._dos_swap(d,
    $a$  select count(*) into v_taken from public.class_bookings e$a$,
    $a$  -- 11 Oct 2026: no teacher, you run it, or booked into another class then (D4, D8)
  perform public._assert_class_bookable(p_session_id, v_user);

  select count(*) into v_taken from public.class_bookings e$a$, 'book_with_membership');
  execute d;

  select pg_get_functiondef('public.book_class_session_for_person(uuid,uuid)'::regprocedure) into d;
  d := public._dos_swap(d,
    $a$  select count(*) into v_taken from public.class_bookings e$a$,
    $a$  -- 11 Oct 2026: no teacher, or booked into another class then (D4, D8)
  perform public._assert_class_bookable(p_session_id, p_user_id);

  select count(*) into v_taken from public.class_bookings e$a$, 'book_class_session_for_person');
  execute d;

  select pg_get_functiondef('public.add_class_walk_in(uuid,text)'::regprocedure) into d;
  d := public._dos_swap(d,
    $a$  select count(*) into v_taken from public.class_bookings e$a$,
    $a$  -- 11 Oct 2026: a class waiting for a new teacher takes nobody (D4)
  perform public._assert_class_bookable(p_session_id, null);

  select count(*) into v_taken from public.class_bookings e$a$, 'add_class_walk_in');
  execute d;

  -- B8: a pass is not offered for a free class
  select pg_get_functiondef('public.passes_for_session(uuid)'::regprocedure) into d;
  d := public._dos_swap(d,
    $a$join public.classes c on c.id = se.class_id and c.deleted_at is null$a$,
    $a$join public.classes c on c.id = se.class_id and c.deleted_at is null and c.price_inr > 0$a$, 'passes_for_session');
  execute d;
end
$do$;

-- ── B1 · a capture that cannot become a seat is refunded ────────────────────

do $do$
declare d text;
begin
  select pg_get_functiondef('public.apply_captured_payment_classes_and_events(text,text,bigint,text)'::regprocedure) into d;
  d := public._dos_swap(d,
    $a$  v_why text;
begin$a$,
    $a$  v_why text;
  v_cs public.class_sessions;
begin$a$, 'apply_captured_payment_classes_and_events');
  d := public._dos_swap(d,
    $a$  -- an existing live spot: enrolled twice → refund; waitlisted → they paid to$a$,
    $a$  -- 11 Oct 2026 (B1): money for a seat the class can no longer give is
  -- refunded, never seated — the same reasons every booking door refuses
  select * into v_cs from public.class_sessions s where s.id = v_order.session_id;
  v_why := case
    when v_class.id is null or v_class.deleted_at is not null then 'the class was called off before the payment landed'
    when v_class.status <> 'published' then 'the class was not open for booking when the payment landed'
    when v_cs.id is null or v_cs.deleted_at is not null then 'the session was taken off before the payment landed'
    when v_cs.starts_at <= now() then 'the class had started before the payment landed'
    else public._class_booking_refusal(v_order.session_id, v_order.user_id) end;
  if v_why is not null then
    insert into public.refunds (payment_id, order_id, business_id, user_id, provider, amount_inr,
                                reason, status, created_by, updated_by)
    values (v_payment.id, v_order.id, v_order.business_id, v_order.user_id, v_order.provider, v_amount_inr,
            v_why, 'pending', v_order.user_id, v_order.user_id)
    returning * into v_refund;
    update public.orders set status = 'refund_pending', updated_by = v_order.user_id
      where id = v_order.id;
    return jsonb_build_object('outcome', 'refund_pending',
      'refund_id', v_refund.id, 'provider_payment_id', p_provider_payment_id, 'reason', v_why);
  end if;

  -- an existing live spot: enrolled twice → refund; waitlisted → they paid to$a$, 'apply_captured_payment_classes_and_events');
  execute d;
end
$do$;

-- ── B2 · B22 · D6 · the one cancel core ─────────────────────────────────────

do $do$
declare d text;
begin
  select pg_get_functiondef('public._cancel_one_class_booking(uuid,uuid,uuid,text,boolean)'::regprocedure) into d;
  d := public._dos_swap(d,
    $a$  v_window integer;
begin$a$,
    $a$  v_window integer;
  v_pass boolean;
  v_paid boolean;
begin$a$, '_cancel_one_class_booking');
  d := public._dos_swap(d,
    $a$  update public.class_bookings
    set status = 'cancelled', updated_by = p_actor$a$,
    $a$  -- 11 Oct 2026 (D6): a pass's hours follow the refund window — the trigger
  -- that gives them back reads this; a call-off always gives them back
  perform set_config('dos.called_off', case when p_called_off then 'yes' else 'no' end, true);
  v_pass := exists (select 1 from public.membership_uses u
                     where u.class_booking_id = v_row.id and u.deleted_at is null);
  v_paid := exists (select 1 from public.orders o
                     where o.class_booking_id = v_row.id and o.status = 'paid' and o.deleted_at is null);

  update public.class_bookings
    set status = 'cancelled', updated_by = p_actor$a$, '_cancel_one_class_booking');
  d := public._dos_swap(d,
    $a$    returning * into v_row;

  -- 4 Oct 2026: no waitlist$a$,
    $a$    returning * into v_row;

  -- 11 Oct 2026 (B22): a cancelled seat is never counted as attended
  update public.attendance set deleted_at = now(), updated_by = p_actor
   where class_booking_id = v_row.id and deleted_at is null;

  -- 11 Oct 2026 (B2): a call-off tells the person who held the seat, whatever
  -- they paid with — the class is deleted only after its seats are cancelled,
  -- so notify_class_called_off finds nobody left to tell
  if p_called_off and v_row.user_id is not null then
    perform public.notify(v_row.user_id, 'class',
      coalesce(v_class.title, 'A class') || ' was called off',
      case when v_paid then 'The studio called it off — your money is on its way back.'
           when v_pass then 'The studio called it off — the hours are back on your pass.'
           else 'The studio has taken this class off the calendar.' end,
      '/my-classes');
  end if;

  -- 4 Oct 2026: no waitlist$a$, '_cancel_one_class_booking');
  execute d;

  select pg_get_functiondef('public.return_membership_unit()'::regprocedure) into d;
  d := public._dos_swap(d,
    $a$  if not found then
    return new;
  end if;
  update public.membership_uses set deleted_at = now() where id = v_use.id;$a$,
    $a$  if not found then
    return new;
  end if;
  -- 11 Oct 2026 (D6): inside the studio's refund window the hours are KEPT,
  -- unless the studio called the class off
  if coalesce(current_setting('dos.called_off', true), '') <> 'yes' and exists (
    select 1 from public.class_sessions s
      join public.classes c on c.id = s.class_id
      join public.businesses b on b.id = c.business_id
     where s.id = new.session_id
       and s.starts_at - now() < make_interval(hours => coalesce(b.refund_window_hours, 12))
  ) then
    return new;
  end if;
  update public.membership_uses set deleted_at = now() where id = v_use.id;$a$, 'return_membership_unit');
  execute d;
end
$do$;

-- ── B3 · the teacher's no, and a published class waiting for a teacher ──────

do $do$
declare d text;
begin
  select pg_get_functiondef('public.classes_publish_state(uuid)'::regprocedure) into d;
  d := public._dos_swap(d,
    $a$public.class_publish_blocker(v_type, c.venue_business_id, c.venue_status, c.lat, c.maps_url, c.capacity, cp.status = 'confirmed')$a$,
    $a$case when public.class_waits_for_teacher(c.id) then 'This class is waiting for a new teacher'
                else public.class_publish_blocker(v_type, c.venue_business_id, c.venue_status, c.lat, c.maps_url, c.capacity,
                       coalesce(cp.status = 'confirmed' and cp.deleted_at is null, false)) end$a$, 'classes_publish_state');
  d := public._dos_swap(d,
    $a$      left join public.class_people cp on cp.class_id = c.id and cp.kind = 'artist' and cp.deleted_at is null$a$,
    $a$      -- 11 Oct 2026 (B3): the live teacher row, else the latest closed one if it was a NO
      left join lateral (
        select x.user_id, x.status, x.deleted_at from (
          select k.user_id, k.status, k.deleted_at
            from public.class_people k
           where k.class_id = c.id and k.kind = 'artist'
           order by (k.deleted_at is null) desc, coalesce(k.deleted_at, k.updated_at) desc
           limit 1) x
         where x.deleted_at is null or x.status = 'rejected') cp on true$a$, 'classes_publish_state');
  execute d;
end
$do$;

-- ── B4 · a published class stays published ──────────────────────────────────

do $do$
declare d text;
begin
  select pg_get_functiondef('public.guard_published_class_fixed()'::regprocedure) into d;
  d := public._dos_swap(d,
    $a$  if old.status <> 'published' or new.status <> 'published' or new.deleted_at is not null then$a$,
    $a$  -- 11 Oct 2026 (B4): published is not undone — deleting it is the way out
  if old.status = 'published' and new.status is distinct from 'published' and new.deleted_at is null then
    raise exception 'A published class stays published — delete it to call it off';
  end if;
  if old.status <> 'published' or new.status <> 'published' or new.deleted_at is not null then$a$, 'guard_published_class_fixed');
  execute d;
end
$do$;

-- ── B5 · B12 · D4 · asking somebody onto a class ────────────────────────────

do $do$
declare d text;
begin
  select pg_get_functiondef('public.ask_class_person(uuid,uuid,text,boolean,boolean,integer)'::regprocedure) into d;
  d := public._dos_swap(d,
    $a$  v_rate integer;
begin$a$,
    $a$  v_rate integer;
  v_prev_att boolean;
  v_prev_ref boolean;
  v_prev_rate integer;
begin$a$, 'ask_class_person');
  d := public._dos_swap(d,
    $a$    raise exception 'class not found';
  end if;
  v_owner := public.is_business_owner(v_class.business_id);$a$,
    $a$    raise exception 'class not found';
  end if;
  -- 11 Oct 2026 (B12): a class that has started takes no new people
  if exists (select 1 from public.class_sessions s
              where s.class_id = p_class_id and s.deleted_at is null and s.starts_at <= now()) then
    raise exception 'This class has started — it can no longer take anybody new';
  end if;
  -- 11 Oct 2026 (D4): a published class keeps its teacher; a new one is asked
  -- only once the old one has gone, and the teacher is never re-asked over
  if v_class.status = 'published' and exists (
    select 1 from public.class_people cp
     where cp.class_id = p_class_id and cp.kind = 'artist' and cp.status = 'confirmed' and cp.deleted_at is null
       and (p_kind = 'artist' or cp.user_id = p_user_id)) then
    raise exception 'This class already has its teacher';
  end if;
  v_owner := public.is_business_owner(v_class.business_id);$a$, 'ask_class_person');
  d := public._dos_swap(d,
    $a$  -- 11 Oct 2026: the rate is the SEAT's unless the owner names one on the ask
  v_rate := coalesce(nullif(p_pay_per_session_inr, 0), ($a$,
    $a$  -- 11 Oct 2026 (B5): a re-ask carries what this person's last row on this
  -- class held — its powers and its rate — whoever asks
  select k.can_attendance, k.can_refunds, k.pay_per_session_inr
    into v_prev_att, v_prev_ref, v_prev_rate
    from public.class_people k
   where k.class_id = p_class_id and k.user_id = p_user_id
   order by (k.deleted_at is null) desc, k.created_at desc
   limit 1;

  -- 11 Oct 2026: the rate is the owner's on the ask, else the last row's, else the SEAT's
  v_rate := coalesce(nullif(p_pay_per_session_inr, 0), nullif(v_prev_rate, 0), ($a$, 'ask_class_person');
  d := public._dos_swap(d,
    $a$          case when v_owner then coalesce(p_can_attendance, false) else false end,
          case when v_owner then coalesce(p_can_refunds, false) else false end,$a$,
    $a$          (v_owner and coalesce(p_can_attendance, false)) or coalesce(v_prev_att, false),
          (v_owner and coalesce(p_can_refunds, false)) or coalesce(v_prev_ref, false),$a$, 'ask_class_person');
  execute d;
end
$do$;

-- ── D4 · stepping down ──────────────────────────────────────────────────────

create function public.step_down_from_class(p_class_person_id uuid, p_reason text default null)
returns public.class_people
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user uuid := auth.uid();
  v_row public.class_people;
  v_class public.classes;
  v_type text;
  v_who text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if v_reason is not null and char_length(v_reason) > 300 then
    raise exception 'keep the reason under 300 characters';
  end if;
  select * into v_row from public.class_people cp
   where cp.id = p_class_person_id and cp.user_id = v_user and cp.deleted_at is null;
  if not found then
    raise exception 'that is not your place on a class';
  end if;
  if v_row.status <> 'confirmed' then
    raise exception 'you have not said yes to this class — decline the ask instead';
  end if;
  select * into v_class from public.classes c where c.id = v_row.class_id and c.deleted_at is null;
  if not found then
    raise exception 'class not found';
  end if;
  if exists (select 1 from public.class_sessions s
              where s.class_id = v_class.id and s.deleted_at is null and s.starts_at <= now()) then
    raise exception 'This class has started — you can no longer step down';
  end if;
  select b.type into v_type from public.businesses b where b.id = v_class.business_id;
  if v_type = 'artist_page' and v_row.kind = 'artist' and public.is_business_owner(v_class.business_id) then
    raise exception 'This is your own class — delete it instead';
  end if;

  -- the trigger on class_people reads these to say WHY the teacher left
  perform set_config('dos.step_down', 'yes', true);
  perform set_config('dos.step_down_reason', coalesce(v_reason, ''), true);
  update public.class_people
     set deleted_at = now(), updated_by = v_user
   where id = v_row.id
   returning * into v_row;

  -- the teacher of a published class: the trigger tells the runners and the
  -- people booked. Anybody else: the runners are told here.
  if not (v_row.kind = 'artist' and v_class.status = 'published') then
    select p.full_name into v_who from public.profiles p where p.id = v_user;
    perform public.notify_business_runners(v_class.business_id, 'people',
      coalesce(v_who, 'Somebody') || ' stepped down from ' || coalesce(v_class.title, 'a class'),
      coalesce(v_reason, case when v_row.kind = 'artist' then 'Ask somebody else to take it.'
                              else 'They will not assist on it.' end),
      '/c/' || coalesce(v_class.share_slug, ''), v_user);
  end if;
  return v_row;
end;
$fn$;
comment on function public.step_down_from_class(uuid, text) is
  'A confirmed teacher or assistant steps down from a class that has not started (11 Oct 2026). A published class''s teacher leaving pauses its booking.';
revoke all on function public.step_down_from_class(uuid, text) from public, anon;
grant execute on function public.step_down_from_class(uuid, text) to authenticated, service_role;

create function public.notify_class_teacher_gone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_class public.classes;
  v_who text;
  v_stepped boolean;
  v_reason text;
  r record;
begin
  if old.deleted_at is not null or new.deleted_at is null then
    return null;
  end if;
  if old.kind <> 'artist' or old.status <> 'confirmed' then
    return null;
  end if;
  select * into v_class from public.classes c where c.id = new.class_id;
  -- a deleted class has its own message; a draft has nobody booked
  if not found or v_class.deleted_at is not null or v_class.status <> 'published' then
    return null;
  end if;
  -- a class that has already ended needs nobody
  if not exists (select 1 from public.class_sessions s
                  where s.class_id = v_class.id and s.deleted_at is null and s.ends_at > now()) then
    return null;
  end if;
  if exists (select 1 from public.class_people cp
              where cp.class_id = v_class.id and cp.kind = 'artist'
                and cp.status = 'confirmed' and cp.deleted_at is null) then
    return null;
  end if;
  select p.full_name into v_who from public.profiles p where p.id = new.user_id;
  v_stepped := coalesce(current_setting('dos.step_down', true), '') = 'yes';
  v_reason := nullif(current_setting('dos.step_down_reason', true), '');

  perform public.notify_business_runners(v_class.business_id, 'class',
    coalesce(v_who, 'The teacher')
      || case when v_stepped then ' stepped down from ' else ' is no longer taking ' end
      || coalesce(v_class.title, 'a class'),
    coalesce(v_reason || ' — ', '') || 'Booking is paused until a new teacher says yes. Ask somebody from the class page, or call it off.',
    '/c/' || coalesce(v_class.share_slug, ''), new.user_id);

  for r in
    select distinct e.user_id
      from public.class_bookings e
      join public.class_sessions s on s.id = e.session_id and s.deleted_at is null and s.ends_at > now()
     where e.class_id = v_class.id and e.status = 'enrolled' and e.deleted_at is null and e.user_id is not null
  loop
    perform public.notify(r.user_id, 'class',
      coalesce(v_class.title, 'A class') || ' is waiting for a new teacher',
      'Your seat is kept. You will be told when a teacher says yes — or if the class is called off.',
      '/c/' || coalesce(v_class.share_slug, ''));
  end loop;
  return null;
end;
$fn$;
revoke all on function public.notify_class_teacher_gone() from public, anon, authenticated;

create trigger class_people_teacher_gone
  after update of deleted_at on public.class_people
  for each row execute function public.notify_class_teacher_gone();

-- ── B14 · who hears what ────────────────────────────────────────────────────

do $do$
declare d text;
begin
  select pg_get_functiondef('public.notify_class_person()'::regprocedure) into d;
  d := public._dos_swap(d,
    $a$  v_role text;
begin$a$,
    $a$  v_role text;
  v_title text;
  v_body text;
  v_href text;
begin$a$, 'notify_class_person');
  d := public._dos_swap(d,
    $a$'Your own studio, your own class — no confirmation needed. Publish it from the register.'$a$,
    $a$'Your own studio, your own class — no confirmation needed. Publish it from Classes.'$a$, 'notify_class_person');
  d := public._dos_swap(d,
    $a$'Confirm or reject it in your Inbox — it stays a draft until you do.', '/inbox');$a$,
    $a$case when v_class.status = 'published' and new.kind = 'artist' then 'Accept or decline it in Classes — booking waits for your answer.'
           when v_class.status = 'published' then 'Accept or decline it in Classes.'
           else 'Accept or decline it in Classes — it stays a draft until you do.' end,
      '/my-classes?tab=todo');$a$, 'notify_class_person');
  d := public._dos_swap(d,
    $a$    perform public.notify_business_owners(new.business_id, 'people',
      coalesce(v_who, 'Somebody') || (case new.status when 'confirmed' then ' confirmed ' else ' said no to ' end) || coalesce(v_class.title, 'a class'),
      case new.status when 'confirmed' then 'It can go on Discover now.' else 'Their name has been taken off it — assign somebody else.' end,
      '/c/' || coalesce(v_class.share_slug, ''));$a$,
    $a$    -- 11 Oct 2026 (B14): the runners AND whoever asked hear the answer
    v_title := coalesce(v_who, 'Somebody') || (case new.status when 'confirmed' then ' confirmed ' else ' said no to ' end) || coalesce(v_class.title, 'a class');
    v_body := case when new.status = 'rejected' then 'Their name has been taken off it — ask somebody else.'
                   when v_class.status = 'published' and new.kind = 'artist' then 'Booking is open again.'
                   when v_class.status = 'published' then 'They are on the class now.'
                   else 'It can go on Discover now.' end;
    v_href := '/c/' || coalesce(v_class.share_slug, '');
    perform public.notify_business_runners(new.business_id, 'people', v_title, v_body, v_href, new.user_id);
    if new.created_by is not null and new.created_by is distinct from new.user_id
       and not exists (select 1 from public.business_members m
                        where m.business_id = new.business_id and m.user_id = new.created_by
                          and m.member_role in ('owner', 'manager') and m.deleted_at is null) then
      perform public.notify(new.created_by, 'people', v_title, v_body, v_href);
    end if;
    -- 11 Oct 2026 (D4): a new teacher on a published class — booking resumes,
    -- and the people booked are told
    if new.status = 'confirmed' and new.kind = 'artist' and v_class.status = 'published' and v_class.deleted_at is null then
      perform public.notify(b.user_id, 'class',
        coalesce(v_class.title, 'A class') || ' has a teacher again',
        coalesce(v_who, 'A new teacher') || ' is taking it — your seat stands.', v_href)
        from (select distinct e.user_id
                from public.class_bookings e
                join public.class_sessions s on s.id = e.session_id and s.deleted_at is null and s.ends_at > now()
               where e.class_id = new.class_id and e.status = 'enrolled' and e.deleted_at is null
                 and e.user_id is not null) b;
    end if;$a$, 'notify_class_person');
  execute d;

  select pg_get_functiondef('public.withdraw_class_ask(uuid)'::regprocedure) into d;
  d := public._dos_swap(d,
    $a$  v_teacher boolean;
begin$a$,
    $a$  v_teacher boolean;
  v_title text;
begin$a$, 'withdraw_class_ask');
  d := public._dos_swap(d,
    $a$  update public.class_people
     set deleted_at = now(), updated_by = v_user
   where id = v_row.id;
end;$a$,
    $a$  update public.class_people
     set deleted_at = now(), updated_by = v_user
   where id = v_row.id;
  -- 11 Oct 2026 (B14): the person asked is told
  if v_row.user_id is distinct from v_user then
    select c.title into v_title from public.classes c where c.id = v_row.class_id;
    perform public.notify(v_row.user_id, 'people',
      case when v_row.status = 'confirmed' then 'You were taken off ' || coalesce(v_title, 'a class')
           else 'The ask for ' || coalesce(v_title, 'a class') || ' was withdrawn' end,
      null, '/my-classes?tab=todo');
  end if;
end;$a$, 'withdraw_class_ask');
  execute d;

  select pg_get_functiondef('public.notify_venue_request()'::regprocedure) into d;
  d := public._dos_swap(d,
    $a$m.member_role = 'owner' and m.deleted_at is null$a$,
    $a$m.member_role in ('owner', 'manager') and m.deleted_at is null$a$, 'notify_venue_request', 3);
  d := public._dos_swap(d,
    $a$'/my-classes?show=manage'$a$,
    $a$'/my-classes?tab=todo'$a$, 'notify_venue_request', 2);
  d := public._dos_swap(d,
    $a$Publish it from Your classes.$a$,
    $a$Publish it from Classes.$a$, 'notify_venue_request');
  d := public._dos_swap(d,
    $a$'Accept or decline it in your Inbox — the class stays a draft until you do.', '/inbox');$a$,
    $a$'Accept or decline it in Classes — the class stays a draft until you do.',
        '/business/' || new.venue_business_id::text || '/classes?tab=todo');$a$, 'notify_venue_request');
  execute d;
end
$do$;

-- B14: a publish tells the teacher and the assistants
create function public.notify_class_published()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if old.status = 'published' or new.status <> 'published' or new.deleted_at is not null then
    return null;
  end if;
  perform public.notify(cp.user_id, 'class',
    coalesce(new.title, 'A class') || ' is published',
    'It is on Discover now — people can book it.',
    '/c/' || coalesce(new.share_slug, ''))
    from public.class_people cp
   where cp.class_id = new.id and cp.status = 'confirmed' and cp.deleted_at is null
     and cp.user_id is distinct from auth.uid();
  return null;
end;
$fn$;
revoke all on function public.notify_class_published() from public, anon, authenticated;

create trigger notify_class_published
  after update of status on public.classes
  for each row execute function public.notify_class_published();

-- ── D10 · a booking tells the runners and the teacher; the door tells nobody ─

do $do$
declare d text;
begin
  select pg_get_functiondef('public.notify_class_booking()'::regprocedure) into d;
  d := public._dos_swap(d,
    $a$  if tg_op = 'INSERT' then
    perform public.notify_business_owners(new.business_id, 'booking',
      coalesce(v_who, new.attendee_name, 'Somebody') || ' booked ' || coalesce(v_class.title, 'a class'),
      null, '/business/' || new.business_id::text || '/classes');
  end if;$a$,
    $a$  -- 11 Oct 2026 (D10): a seat somebody booked THEMSELVES tells the people who
  -- run the business and the confirmed teacher; a seat booked at the door, or a
  -- walk-in, tells nobody — they were standing there
  if tg_op = 'INSERT' and new.status = 'enrolled' and new.user_id is not null
     and new.created_by is not distinct from new.user_id then
    perform public.notify_business_runners(new.business_id, 'booking',
      coalesce(v_who, 'Somebody') || ' booked ' || coalesce(v_class.title, 'a class'),
      null, '/business/' || new.business_id::text || '/classes', null);
    perform public.notify(cp.user_id, 'booking',
      coalesce(v_who, 'Somebody') || ' booked ' || coalesce(v_class.title, 'a class'),
      null, '/c/' || coalesce(v_class.share_slug, ''))
      from public.class_people cp
     where cp.class_id = new.class_id and cp.kind = 'artist' and cp.status = 'confirmed' and cp.deleted_at is null
       and not exists (select 1 from public.business_members m
                        where m.business_id = new.business_id and m.user_id = cp.user_id
                          and m.member_role in ('owner', 'manager') and m.deleted_at is null);
  end if;$a$, 'notify_class_booking');
  execute d;
end
$do$;

-- ── D7 · the venue's runners run the door ───────────────────────────────────

do $do$
declare d text;
begin
  select pg_get_functiondef('public.can_run_register_for_class(uuid)'::regprocedure) into d;
  d := public._dos_swap(d,
    $a$      and m.can_attendance = true
      and m.deleted_at is null
      and c.deleted_at is null
  );$a$,
    $a$      and m.can_attendance = true
      and m.deleted_at is null
      and c.deleted_at is null
  ) or exists (
    -- 11 Oct 2026 (D7): the people who run the studio whose room an artist's
    -- class is held in run its door — the register only, never its money
    select 1
    from public.classes c
    where c.id = p_class_id
      and c.deleted_at is null
      and c.venue_business_id is not null
      and c.venue_status = 'accepted'
      and public.runs_business(c.venue_business_id)
  );$a$, 'can_run_register_for_class');
  execute d;
end
$do$;

-- ── D9 · an accepted room request holds the room ────────────────────────────

do $do$
declare d text;
begin
  select pg_get_functiondef('public.assert_room_ok(uuid)'::regprocedure) into d;
  d := public._dos_swap(d,
    $a$  if v_class.status <> 'published' then
    return; -- a draft is not in any room yet
  end if;$a$,
    $a$  -- 11 Oct 2026 (D9): a published class holds its room, and so does a draft
  -- whose room request the studio ACCEPTED
  if v_class.status <> 'published'
     and not (v_class.venue_business_id is not null and v_class.venue_status = 'accepted') then
    return; -- a draft is not in any room yet
  end if;$a$, 'assert_room_ok');
  d := public._dos_swap(d,
    $a$     and c2.status = 'published'$a$,
    $a$     and (c2.status = 'published' or (c2.venue_business_id is not null and c2.venue_status = 'accepted'))$a$, 'assert_room_ok');
  execute d;
end
$do$;

-- the studio's yes is the moment a room is taken, so the check runs on it too
drop trigger classes_room_check_after on public.classes;
create constraint trigger classes_room_check_after
  after insert or update of room_id, capacity, status, venue_status on public.classes
  deferrable initially immediate
  for each row execute function public.classes_room_check();

-- ── D2 · a payout counts a place only while it was open ─────────────────────

do $do$
declare d text;
begin
  select pg_get_functiondef('public.record_payout(uuid,uuid,uuid[],text,text,text,date,text)'::regprocedure) into d;
  d := public._dos_swap(d,
    $a$        and cc.status = 'confirmed'
      order by cc.deleted_at nulls first, cc.created_at desc$a$,
    $a$        and cc.status = 'confirmed'
        -- 11 Oct 2026: a place that closed before the session started was not
        -- the person's when it ran (a teacher who stepped down is not owed)
        and (cc.deleted_at is null or cc.deleted_at > v_session.starts_at)
      order by cc.deleted_at nulls first, cc.created_at desc$a$, 'record_payout');
  execute d;
end
$do$;

-- ── D11 · a reminder two hours before ───────────────────────────────────────

alter table public.class_sessions add column reminded_at timestamptz;
comment on column public.class_sessions.reminded_at is
  'When the two-hours-before reminder went out for this session (11 Oct 2026); null until it has. Written by remind_upcoming_sessions() only.';

create function public.remind_upcoming_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  r record;
  v_when text;
  n integer := 0;
begin
  for r in
    select s.id, s.starts_at, c.id as class_id, c.title, c.share_slug
      from public.class_sessions s
      join public.classes c on c.id = s.class_id
     where s.deleted_at is null and s.reminded_at is null
       and s.starts_at > now() and s.starts_at <= now() + interval '2 hours'
       and c.deleted_at is null and c.status = 'published'
     for update of s skip locked
  loop
    update public.class_sessions set reminded_at = now() where id = r.id;
    v_when := trim(to_char(r.starts_at at time zone 'Asia/Kolkata', 'HH12:MIam'));
    perform public.notify(u.user_id, 'class',
      coalesce(r.title, 'Your class') || ' starts at ' || v_when,
      'In about two hours — see you on the floor.',
      '/c/' || coalesce(r.share_slug, ''))
      from (select e.user_id from public.class_bookings e
             where e.session_id = r.id and e.status = 'enrolled' and e.deleted_at is null and e.user_id is not null
            union
            select cp.user_id from public.class_people cp
             where cp.class_id = r.class_id and cp.status = 'confirmed' and cp.deleted_at is null) u;
    n := n + 1;
  end loop;
  return n;
end;
$fn$;
comment on function public.remind_upcoming_sessions() is
  'Tells everybody booked, the teacher and the assistants two hours before a session, once (11 Oct 2026). Run every 15 minutes by class-reminders.';
revoke all on function public.remind_upcoming_sessions() from public, anon, authenticated;

do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'class-reminders') then
      perform cron.schedule('class-reminders', '*/15 * * * *', 'select public.remind_upcoming_sessions()');
    end if;
  end if;
end
$do$;

drop function public._dos_swap(text, text, text, text, integer);

notify pgrst, 'reload schema';
