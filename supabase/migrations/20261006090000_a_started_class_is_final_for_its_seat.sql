-- ⚠ Rule 9 (refunds are money). 6 Oct 2026, the user's decision 1: a class that
-- has STARTED is final for the person holding the seat.
--
-- Until today a learner could cancel a class ten minutes into it (the 4 Oct rule
-- was "over", and a live class is not over), and inside the 12-hour window that
-- filed a refund REQUEST the studio then had to decide about a seat that had
-- already been danced in. The user chose: once the session starts, the seat
-- cannot be handed back.
--
-- THE WHOLE OF IT: one block in `_cancel_one_class_booking`, the core every
-- learner's cancel goes through (`cancel_class_booking_with_reason` and the
-- free wrapper `cancel_class_booking`). It refuses a session whose start has
-- passed — before the seat or any money moves — unless the class is being
-- CALLED OFF by its studio (`p_called_off`), which is a different act: a studio
-- calling a live class off still refunds every paid seat, exactly as before.
--
-- Edited out of the catalog by asserted single-occurrence anchor (the
-- 20261004190000 pattern); `create or replace`, same signature, so no grant
-- moves. No table, column, row, policy or grant changes; nothing backfilled. No
-- `begin;`/`commit;` (Rule 18).

create function public._dos_swap(p_def text, p_from text, p_to text, p_fn text, p_expect integer default 1)
returns text
language plpgsql
as $$
declare
  v_n integer := (length(p_def) - length(replace(p_def, p_from, ''))) / greatest(length(p_from), 1);
begin
  if v_n <> p_expect then
    raise exception '% : expected % occurrence(s) of the anchor, found %', p_fn, p_expect, v_n;
  end if;
  return replace(p_def, p_from, p_to);
end;
$$;

do $$
declare
  v text := pg_get_functiondef('public._cancel_one_class_booking(uuid, uuid, uuid, text, boolean)'::regprocedure);
begin
  v := public._dos_swap(v,
$a$  v_was_enrolled := (v_row.status = 'enrolled');$a$,
$b$  -- 6 Oct 2026: a STARTED class is final for the person holding the seat (the
  -- user's decision 1). A studio calling the class off is a different act and
  -- still refunds every paid seat, so it is the one caller let through.
  if not p_called_off and v_session.starts_at is not null and v_session.starts_at <= now() then
    raise exception 'This class has started — it can no longer be cancelled';
  end if;

  v_was_enrolled := (v_row.status = 'enrolled');$b$,
    '_cancel_one_class_booking');
  execute v;
end;
$$;

drop function public._dos_swap(text, text, text, text, integer);
