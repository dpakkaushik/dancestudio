-- ═══════════════════════════════════════════════════════════════════════════
-- A FINISHED CLASS IS FINAL (4 Oct 2026)
--
-- The user: "cancel / refund class should not be possible if class is over."
--
-- Until now the database refused neither half. A learner could cancel a booking
-- on a class that had already ENDED — straight through PostgREST, past any
-- screen — and it filed a refund row against a class they had danced (or not
-- turned up to). And a studio deleting a finished class called it off first,
-- which cancels every seat and refunds every PAID one automatically: money back
-- for a class that already happened. The app stopped offering both on the same
-- day this file was written; this is the database keeping the rule for every
-- other door.
--
-- ⚠ Rule 9 (refunds are money). What moves — TWO FUNCTION BODIES, nothing else:
--   1. `_cancel_one_class_booking` — the one core every seat cancel goes
--      through (the learner's `cancel_class_booking_with_reason`, the free
--      `cancel_class_booking` that wraps it, and the studio's call-off) —
--      refuses once the seat's session has ENDED, before the seat or any money
--      moves: "This class is over — it can no longer be cancelled or refunded".
--   2. `cancel_class_bookings_for_class` (what a class DELETE calls first)
--      refuses a class whose every live session has ended, in the same words —
--      after the owner check, so a manager is still told whose act it is.
--
-- What deliberately does NOT move:
--   · A class that has STARTED but not ended can still be cancelled or called
--     off: the rule is "over", and a live class is not.
--   · `decide_refund` / `settle_refund_offline` are untouched — a refund
--     REQUESTED before the class (inside the 48-hour window) is still the
--     studio's to decide after it; refusing that would strand money that was
--     asked for in time.
--   · `remove_class_walk_in` is untouched — a walk-in carries no payment.
--   · No table, column, row, policy or grant. Both bodies are edited OUT OF THE
--     CATALOG by asserted single-occurrence anchor (`_dos_swap`, as in
--     20261004160000), so a body that has drifted refuses the whole migration
--     instead of half-applying; `create or replace` keeps both signatures, so
--     no grant moves. Nothing here writes `begin;`/`commit;` (Rule 18).
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

do $migration$
declare
  v_def text;
  v_new text;
begin
  -- ── 1. the seat core: no cancel and no refund once the session has ended ──
  select pg_get_functiondef('public._cancel_one_class_booking(uuid, uuid, uuid, text, boolean)'::regprocedure) into v_def;
  v_new := public._dos_swap(v_def,
    E'  select * into v_session from public.class_sessions s where s.id = v_row.session_id;\n',
    E'  select * into v_session from public.class_sessions s where s.id = v_row.session_id;\n\n'
    || E'  -- 4 Oct 2026: a finished class is final — no cancel and no refund once its\n'
    || E'  -- session has ended (the user: "cancel / refund class should not be possible\n'
    || E'  -- if class is over"). Before the seat or any money moves.\n'
    || E'  if v_session.ends_at is not null and v_session.ends_at <= now() then\n'
    || E'    raise exception ''This class is over — it can no longer be cancelled or refunded'';\n'
    || E'  end if;\n',
    '_cancel_one_class_booking');
  execute v_new;

  -- ── 2. the call-off: a class whose every live session has ended stays ───────
  select pg_get_functiondef('public.cancel_class_bookings_for_class(uuid, text)'::regprocedure) into v_def;
  v_new := public._dos_swap(v_def,
    E'    raise exception ''Only the owner of this studio can call off its classes'';\n  end if;\n',
    E'    raise exception ''Only the owner of this studio can call off its classes'';\n  end if;\n\n'
    || E'  -- 4 Oct 2026: a finished class cannot be called off — that would cancel\n'
    || E'  -- every seat and refund every paid one for a class that already happened.\n'
    || E'  -- "Finished" is: it has a live session, and none of them is still to end.\n'
    || E'  if exists (select 1 from public.class_sessions s where s.class_id = p_class_id and s.deleted_at is null)\n'
    || E'     and not exists (select 1 from public.class_sessions s\n'
    || E'                      where s.class_id = p_class_id and s.deleted_at is null and s.ends_at > now()) then\n'
    || E'    raise exception ''This class is over — it can no longer be cancelled or refunded'';\n'
    || E'  end if;\n',
    'cancel_class_bookings_for_class');
  execute v_new;
end
$migration$;

drop function public._dos_swap(text, text, text, text, integer);
