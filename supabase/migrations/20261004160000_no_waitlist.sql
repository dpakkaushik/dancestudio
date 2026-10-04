-- ═══════════════════════════════════════════════════════════════════════════
-- THERE IS NO WAITLIST (4 Oct 2026)
--
-- The user: "remove waitlist mechanism". A seat is booked or it is not; a full
-- class takes no more bookings, and a seat freed by a cancel goes back on sale
-- for anybody to book.
--
-- ⚠ Rule 9 (bookings are seats, and two doors touch money). What moves:
--   1. The 2 live `waitlisted` rows on production are CANCELLED — both demo
--      accounts (demo.sneha, demo.kabir) on one free class, with no order,
--      payment or membership use behind them. Counted before writing this.
--   2. `book_class_session` refuses a full class in words ("this class is
--      full") instead of filing a waitlist place, inserts `enrolled` only, and
--      refuses a PRICED class whether or not it is full (it used to let a
--      priced FULL class through to the waitlist, the one free path onto it).
--   3. `_cancel_one_class_booking` promotes nobody — its promotion block goes.
--      The money side (the 48-hour rule, the refund row) is untouched.
--   4. `book_with_membership` and `create_payment_order` stop telling a person
--      to "join the waitlist instead" — the refusal is "this class is full".
--   5. `book_class_session_for_person` (the register's door) loses its
--      "they are on the waitlist" branch — there is nobody on one to find.
--   6. `notify_class_booking` stops saying "joined the waitlist" and loses the
--      "a place opened" branch, which nothing can reach any more.
--   7. `give_spot(uuid)` and `remove_from_waitlist(uuid)` are DROPPED. The app
--      stopped calling both in the push that went BEFORE this apply.
--   8. `class_bookings_status_check` narrows to ('enrolled', 'cancelled').
--
-- What deliberately does NOT move: seven functions still read
-- `status in ('enrolled', 'waitlisted')` (add_class_walk_in,
-- apply_captured_payment_classes_and_events, cancel_class_booking_with_reason,
-- cancel_class_bookings_for_class, notify_class_moved, notify_class_called_off,
-- and the in-list inside the four bodies edited here). Once the CHECK refuses
-- the word, that half of each list matches nothing — so they are left alone
-- rather than re-typed, and the money applier in particular is not opened for
-- a change that changes nothing (the 28 Sep lesson: a re-typed body is one
-- that can differ).
--
-- Every body is edited OUT OF THE CATALOG by asserted single-occurrence anchor
-- (`_dos_swap`, as in 20260926090000), so a body that has drifted from what
-- this file expects refuses the whole migration instead of half-applying.
-- `create or replace` keeps every signature, so no grant moves. No table,
-- column, policy or grant is added. Nothing here writes `begin;`/`commit;`
-- (Rule 18 — `supabase db push` wraps the file itself).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. the two live waitlist places become cancelled seats ──────────────────
update public.class_bookings
   set status = 'cancelled'
 where status = 'waitlisted';

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

do $migration$
declare
  v_def text;
  v_new text;
begin
  -- ── 2. book_class_session: full is full, a priced class is the page's ────
  select pg_get_functiondef('public.book_class_session(uuid)'::regprocedure) into v_def;
  v_new := public._dos_swap(v_def,
    E'  if v_taken < v_class.capacity and v_class.price_inr > 0 then\n',
    E'  -- 4 Oct 2026: no waitlist — a full class takes no more bookings\n'
    || E'  if v_taken >= v_class.capacity then\n'
    || E'    raise exception ''this class is full'';\n'
    || E'  end if;\n\n'
    || E'  if v_class.price_inr > 0 then\n',
    'book_class_session');
  v_new := public._dos_swap(v_new,
    E'          case when v_taken < v_class.capacity then ''enrolled'' else ''waitlisted'' end,\n',
    E'          ''enrolled'',\n',
    'book_class_session');
  v_new := public._dos_swap(v_new,
    'and e.status in (''enrolled'', ''waitlisted'') and e.deleted_at is null',
    'and e.status = ''enrolled'' and e.deleted_at is null',
    'book_class_session');
  execute v_new;

  -- ── 3. _cancel_one_class_booking: a freed seat promotes nobody ───────────
  select pg_get_functiondef('public._cancel_one_class_booking(uuid, uuid, uuid, text, boolean)'::regprocedure) into v_def;
  v_new := public._dos_swap(v_def,
    E'  -- a freed seat promotes only where the seat is free to take\n'
    || E'  -- ⚠ CHANGED (d): and only when the class is not being called off\n'
    || E'  if v_was_enrolled and v_class.price_inr = 0 and not p_called_off then\n'
    || E'    update public.class_bookings\n'
    || E'      set status = ''enrolled'', updated_by = p_actor   -- ⚠ CHANGED (b)\n'
    || E'      where id = (\n'
    || E'        select e.id from public.class_bookings e\n'
    || E'        where e.session_id = v_row.session_id\n'
    || E'          and e.status = ''waitlisted'' and e.deleted_at is null\n'
    || E'        order by e.created_at\n'
    || E'        limit 1\n'
    || E'      );\n'
    || E'  end if;\n',
    E'  -- 4 Oct 2026: no waitlist — a freed seat goes back on sale and promotes nobody\n',
    '_cancel_one_class_booking');
  v_new := public._dos_swap(v_new,
    'and e.status in (''enrolled'', ''waitlisted'') and e.deleted_at is null',
    'and e.status = ''enrolled'' and e.deleted_at is null',
    '_cancel_one_class_booking');
  execute v_new;

  -- ── 4. the two money doors stop sending people to a waitlist ─────────────
  select pg_get_functiondef('public.book_with_membership(uuid, uuid)'::regprocedure) into v_def;
  v_new := public._dos_swap(v_def,
    'raise exception ''this class is full — join the waitlist instead'';',
    'raise exception ''this class is full'';',
    'book_with_membership');
  v_new := public._dos_swap(v_new,
    'and e.status in (''enrolled'', ''waitlisted'') and e.deleted_at is null',
    'and e.status = ''enrolled'' and e.deleted_at is null',
    'book_with_membership');
  execute v_new;

  select pg_get_functiondef('public.create_payment_order(uuid)'::regprocedure) into v_def;
  v_new := public._dos_swap(v_def,
    'raise exception ''class is full — join the waitlist instead'';',
    'raise exception ''this class is full'';',
    'create_payment_order');
  v_new := public._dos_swap(v_new,
    'and e.status in (''enrolled'', ''waitlisted'') and e.deleted_at is null',
    'and e.status = ''enrolled'' and e.deleted_at is null',
    'create_payment_order');
  execute v_new;

  -- ── 5. the register's door: nobody is on a waitlist to find ──────────────
  select pg_get_functiondef('public.book_class_session_for_person(uuid, uuid)'::regprocedure) into v_def;
  v_new := public._dos_swap(v_def,
    E'  elsif v_existing = ''waitlisted'' then\n'
    || E'    raise exception ''they are on the waitlist — give them the spot instead'';\n',
    '',
    'book_class_session_for_person');
  v_new := public._dos_swap(v_new,
    E'  -- already in, on the waitlist, or not booked. Collapsing the first two into\n'
    || E'  -- one refusal is what makes a door say the wrong thing.\n',
    E'  -- already in, or not booked (the waitlist went on 4 Oct 2026).\n',
    'book_class_session_for_person');
  v_new := public._dos_swap(v_new,
    'and e.status in (''enrolled'', ''waitlisted'') and e.deleted_at is null',
    'and e.status = ''enrolled'' and e.deleted_at is null',
    'book_class_session_for_person');
  execute v_new;

  -- ── 6. the booking notification: "booked", and no "a place opened" ───────
  select pg_get_functiondef('public.notify_class_booking()'::regprocedure) into v_def;
  v_new := public._dos_swap(v_def,
    '(case new.status when ''waitlisted'' then '' joined the waitlist for '' else '' booked '' end)',
    ''' booked ''',
    'notify_class_booking');
  v_new := public._dos_swap(v_new,
    E'  elsif tg_op = ''UPDATE'' and old.status = ''waitlisted'' and new.status = ''enrolled'' then\n'
    || E'    -- THE WAITLIST IS TOLD, OR IT IS NOT A WAITLIST (13647)\n'
    || E'    -- ⚠ `notify` takes a PERSON, and a walk-in is not one. It is never\n'
    || E'    -- waitlisted (both doors refuse a full class outright), so this branch\n'
    || E'    -- cannot be reached for one — and the guard says so rather than relying on\n'
    || E'    -- that staying true.\n'
    || E'    if new.user_id is not null then\n'
    || E'      perform public.notify(new.user_id, ''class'',\n'
    || E'        ''A place opened in '' || coalesce(v_class.title, ''a class''),\n'
    || E'        ''You were first on the waitlist and the seat is yours.'',\n'
    || E'        ''/c/'' || coalesce(v_class.share_slug, ''''));\n'
    || E'    end if;\n',
    '',
    'notify_class_booking');
  execute v_new;
end;
$migration$;

drop function public._dos_swap(text, text, text, text, integer);

-- ── 7. the two waitlist doors go ────────────────────────────────────────────
drop function public.give_spot(uuid);
drop function public.remove_from_waitlist(uuid);

-- ── 8. the word itself ──────────────────────────────────────────────────────
alter table public.class_bookings drop constraint class_bookings_status_check;
alter table public.class_bookings add constraint class_bookings_status_check
  check (status in ('enrolled', 'cancelled'));

comment on column public.class_bookings.status is
  'enrolled (a seat) or cancelled. There is no waitlist since 4 Oct 2026 — a full class takes no more bookings.';
