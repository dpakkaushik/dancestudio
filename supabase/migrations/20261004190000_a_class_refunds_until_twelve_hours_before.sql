-- ═══════════════════════════════════════════════════════════════════════════
-- A CLASS REFUNDS UNTIL TWELVE HOURS BEFORE (4 Oct 2026)
--
-- The user: "refund policy by default 12hrs before … for classes."
--
-- Since Step 9 (24 Aug 2026) a learner who cancelled a paid class seat 48 hours
-- or more before it started was refunded AUTOMATICALLY ('pending', sent through
-- the rail), and inside 48 hours the refund was filed as 'requested' for the
-- studio to decide. The window is 12 hours now: cancel 12 hours or more ahead and
-- the money comes back by itself; later than that, the studio decides.
--
-- ⚠ Rule 9 (refunds are money). What moves — ONE LINE OF ONE FUNCTION BODY:
--   `_cancel_one_class_booking`, the one core every class seat cancel goes
--   through: `interval '48 hours'` → `interval '12 hours'`. Edited OUT OF THE
--   CATALOG by asserted single-occurrence anchor (`_dos_swap`, as in
--   20261004170000), so a body that has drifted refuses the whole migration
--   instead of half-applying; `create or replace` keeps the signature, so no
--   grant moves.
--
-- What deliberately does NOT move:
--   · A studio calling a class off still refunds every paid seat automatically,
--     whatever the clock says (`p_called_off`, 30 Sep 2026).
--   · A finished class is still final (20261004170000).
--   · Refunds already filed keep the status they were filed with — nothing is
--     backfilled; a 'requested' refund from yesterday is still the studio's to
--     decide.
--   · Event tickets: there are no events (29 Sep 2026); their tables are
--     tombstones and nothing can book one.
--   · No table, column, row, policy or grant. Nothing here writes
--     `begin;`/`commit;` (Rule 18).
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
begin
  select pg_get_functiondef('public._cancel_one_class_booking(uuid, uuid, uuid, text, boolean)'::regprocedure) into v_def;
  execute public._dos_swap(v_def,
    E'when v_session.starts_at - now() >= interval ''48 hours'' then ''pending''',
    E'when v_session.starts_at - now() >= interval ''12 hours'' then ''pending''',
    '_cancel_one_class_booking');
end
$migration$;

drop function public._dos_swap(text, text, text, text, integer);
