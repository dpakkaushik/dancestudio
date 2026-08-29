-- ─────────────────────────────────────────────────────────────────────────────
-- Found by the e2e, not by reading: take the Artist plan (a month), end it, take
-- it again the same day — the new period ends on the SAME date as the ended one,
-- and my_artist_plan's `order by until desc limit 1` could hand back the ENDED
-- row, so the screen offered the pitch to somebody who had just subscribed. A
-- live period outranks an ended one whatever its date. Same signature, same
-- grants; the rows are untouched.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.my_artist_plan()
returns table (plan text, started_on date, until date, amount_inr integer, active boolean)
language sql
security invoker
set search_path = ''
as $$
  select p.plan, p.started_on, p.until, p.amount_inr,
         (p.until >= (now() at time zone 'Asia/Kolkata')::date and p.ended_at is null) as active
    from public.artist_plans p
   where p.user_id = auth.uid() and p.deleted_at is null
   order by (p.ended_at is null) desc, p.until desc
   limit 1;
$$;
