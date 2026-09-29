-- CALLING OFF A CLASS GIVES THE MONEY BACK (30 Sep 2026)
--
-- ⚠⚠ THE APP HAS PROMISED THIS SINCE 29 Aug 2026 AND NOTHING EVER DID IT.
-- `ClassesManager`'s delete sheet reads, word for word:
--
--     "{class} · {n} enrolled students must be refunded — you'll settle each
--      refund on the next screen."
--
-- its button reads **"Delete & manage refunds"**, and pressing it navigates to
-- `/business/{id}/earnings` "so the refunds are settled from the money desk".
-- **No refund row is created by any of it.** The studio arrives at the money
-- desk and there is nothing there; the learner's seat stays `enrolled` on a
-- class that no longer exists, and their money stays where it was.
--
-- Measured on production before a line of this was written:
--     13 live `enrolled` seats on 13 soft-deleted classes, held by 10 people
--     6 paid orders worth ₹1,800 against classes that are gone
--
-- ⚠ WHY IT COULD NOT BE WIRED RATHER THAN BUILT: `cancel_class_booking_with_reason`
-- — which does all of this correctly — is scoped `where e.user_id = auth.uid()`.
-- It is the PAYER's door, by design (Step 9), so a studio has never been able to
-- call it for a learner. There was no door for a studio to cancel a seat at all.
--
-- ── WHAT THIS DOES ──────────────────────────────────────────────────────────
--   1. `_cancel_one_class_booking` — the money logic, MOVED out of the existing
--      function verbatim, gaining the two things a studio's cancel needs that a
--      learner's does not: who is ACTING and whose MONEY it is.
--   2. `cancel_class_booking_with_reason` — the payer's door, now a thin
--      ownership check in front of that core. ⚠ ZERO BEHAVIOUR CHANGE, and the
--      dry run proves it on both sides of the 48-hour window.
--   3. `cancel_class_bookings_for_class` — the new door: the business's OWNER
--      cancels every live seat on one class, each with its own refund.
--
-- ⚠⚠ THE CORE IS EXTRACTED, NOT RE-TYPED, AND THAT IS THE 28 Sep LESSON APPLIED
-- RATHER THAN RE-LEARNT: five of six re-typed live function bodies were wrong
-- that day, and this is the body that moves money. It is `pg_get_functiondef`'s
-- own text with the substitutions listed against each one below, and nothing
-- else. The 30 Sep `remove_business_owner` shape one table over: the cheapest
-- way not to differ from a function is not to write it twice.
--
-- ⚠ NO TRIGGER ON THE DELETE. Money moving as a side effect of a soft delete is
-- the kind of thing that surprises people, it cannot carry a reason, and it
-- cannot be refused. The delete path CALLS this, so the owner check happens
-- before anything is cancelled — which also means a manager pressing Delete is
-- refused with a sentence rather than silently, and nobody's seat is cancelled
-- for a delete that then does not happen.
--
-- ⚠ NOTHING IS BACKFILLED. The 13 seats and the ₹1,800 already on production are
-- real people's money and a decision about them is the owner's, not a
-- migration's — a migration that files thirteen refunds behind somebody's back
-- is the same mistake in the other direction. NEXT TO DO carries the list.

-- ────────────────────────────────────────────────────────────────────────────
-- 1 · THE CORE
-- ────────────────────────────────────────────────────────────────────────────
-- The body of `cancel_class_booking_with_reason` as the live catalog holds it,
-- with exactly four changes, each marked ⚠ CHANGED where it sits:
--
--   (a) the `e.user_id = v_user` ownership test moves OUT to the callers — this
--       is a helper no client role may execute, so it checks nothing itself;
--   (b) `updated_by` is the ACTOR (the person pressing the button);
--   (c) `refunds.user_id` is the PAYER (the person whose money it is) — ⚠⚠ THE
--       ONE SUBSTITUTION THAT WOULD HAVE BEEN A MONEY BUG IF IT HAD BEEN MISSED:
--       both were `v_user` before, because they were the same person, and filing
--       a learner's refund against the STUDIO OWNER would make it unreadable to
--       the person owed it and wrong on every ledger it reaches;
--   (d) `p_called_off` — one flag, two consequences that must not be settable
--       apart (see its comment).
create or replace function public._cancel_one_class_booking(
  p_class_booking_id uuid,
  p_actor uuid,
  p_payer uuid,
  p_reason text,
  -- ⚠ ONE FLAG, TWO CONSEQUENCES, BECAUSE THEY ARE ONE FACT. When the STUDIO
  -- calls the class off:
  --   · the refund is AUTOMATIC whatever the clock says. The 48-hour rule exists
  --     to stop a LEARNER cancelling at the last minute; making somebody wait
  --     for the studio to approve a refund for a class THE STUDIO cancelled is
  --     the rule pointed at the one person it was never about.
  --   · nobody is promoted off the waitlist. Enrolling somebody into a class
  --     that is being called off is a seat given and taken in one statement.
  p_called_off boolean
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.class_bookings;
  v_class public.classes;
  v_session public.class_sessions;
  v_order public.orders;
  v_payment public.payments;
  v_refund public.refunds;
  v_was_enrolled boolean;
begin
  -- ⚠ CHANGED (a): no `and e.user_id = …` — the callers own that test
  select * into v_row from public.class_bookings e
    where e.id = p_class_booking_id
      and e.status in ('enrolled', 'waitlisted') and e.deleted_at is null;
  if not found then
    raise exception 'booking not found';
  end if;

  -- lock the class first so cancel + promote can't race a concurrent enroll
  select * into v_class from public.classes c where c.id = v_row.class_id for update;
  select * into v_session from public.class_sessions s where s.id = v_row.session_id;

  v_was_enrolled := (v_row.status = 'enrolled');

  update public.class_bookings
    set status = 'cancelled', updated_by = p_actor   -- ⚠ CHANGED (b)
    where id = v_row.id
    returning * into v_row;

  -- a freed seat promotes only where the seat is free to take
  -- ⚠ CHANGED (d): and only when the class is not being called off
  if v_was_enrolled and v_class.price_inr = 0 and not p_called_off then
    update public.class_bookings
      set status = 'enrolled', updated_by = p_actor   -- ⚠ CHANGED (b)
      where id = (
        select e.id from public.class_bookings e
        where e.session_id = v_row.session_id
          and e.status = 'waitlisted' and e.deleted_at is null
        order by e.created_at
        limit 1
      );
  end if;

  -- the money side: only when this seat was actually paid for
  select * into v_order from public.orders o
    where o.class_booking_id = v_row.id and o.status = 'paid' and o.deleted_at is null
    order by o.created_at desc limit 1;
  if found then
    select * into v_payment from public.payments p
      where p.order_id = v_order.id and p.status = 'captured' and p.deleted_at is null
      order by p.created_at desc limit 1;
  end if;

  if v_payment.id is not null then
    insert into public.refunds (payment_id, order_id, business_id, user_id, provider, amount_inr,
                                reason, status, created_by, updated_by)
    values (v_payment.id, v_order.id, v_order.business_id,
            p_payer,                                   -- ⚠ CHANGED (c)
            v_order.provider, v_payment.amount_inr,
            p_reason,
            -- ⚠ CHANGED (d)
            case when p_called_off then 'pending'
                 when v_session.starts_at - now() >= interval '48 hours' then 'pending'
                 else 'requested' end,
            p_actor, p_actor)                          -- ⚠ CHANGED (b)
    returning * into v_refund;
    if v_refund.status = 'pending' then
      update public.orders set status = 'refund_pending', updated_by = p_actor   -- ⚠ CHANGED (b)
        where id = v_order.id;
    end if;
    return jsonb_build_object('status', 'cancelled', 'refund', jsonb_build_object(
      'id', v_refund.id, 'status', v_refund.status, 'amount_inr', v_refund.amount_inr,
      'provider', v_order.provider,
      'provider_order_id', v_order.provider_order_id,
      'provider_payment_id', v_payment.provider_payment_id));
  end if;

  return jsonb_build_object('status', 'cancelled', 'refund', null);
end;
$function$;

comment on function public._cancel_one_class_booking(uuid, uuid, uuid, text, boolean) is
  'Cancels ONE class booking and files its refund. A helper, never a door: it '
  'checks no authority, so every caller must. Executable by no client role. '
  'Extracted from cancel_class_booking_with_reason on 30 Sep 2026 so the '
  'studio''s call-off and the learner''s own cancel share one implementation '
  'of the money rules rather than two that can differ.';

-- ⚠ A HELPER, NOT A DOOR. It takes the payer as an ARGUMENT, so anything able to
-- execute it could file a refund against anybody.
revoke all on function public._cancel_one_class_booking(uuid, uuid, uuid, text, boolean) from public;
revoke all on function public._cancel_one_class_booking(uuid, uuid, uuid, text, boolean) from anon;
revoke all on function public._cancel_one_class_booking(uuid, uuid, uuid, text, boolean) from authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2 · THE PAYER'S DOOR — unchanged behaviour, now one ownership check deep
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠ `create or replace` with the SAME signature, so not one grant moves. What a
-- learner sees is byte-identical: the same refusal when the booking is not
-- theirs, the same 48-hour rule, the same promote on a free class, the same
-- jsonb back.
create or replace function public.cancel_class_booking_with_reason(p_class_booking_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  -- the ownership test that used to sit inside the query below: your own seat,
  -- and one that is still live
  if not exists (
    select 1 from public.class_bookings e
    where e.id = p_class_booking_id and e.user_id = v_user
      and e.status in ('enrolled', 'waitlisted') and e.deleted_at is null
  ) then
    raise exception 'booking not found';
  end if;

  -- you are both the actor and the payer; the class is not being called off, so
  -- the 48-hour rule and the waitlist promote both apply exactly as before
  return public._cancel_one_class_booking(p_class_booking_id, v_user, v_user, p_reason, false);
end;
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3 · THE STUDIO'S DOOR — the one that did not exist
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.cancel_class_bookings_for_class(p_class_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
  v_class public.classes;
  v_seat record;
  v_result jsonb;
  v_seats integer := 0;
  v_refunds integer := 0;
  v_rupees integer := 0;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select * into v_class from public.classes c where c.id = p_class_id and c.deleted_at is null;
  if not found then
    raise exception 'class not found';
  end if;

  -- ⚠ THE OWNER'S, LIKE THE DELETE IT STANDS IN FRONT OF. `classes` has admitted
  -- only the owner to UPDATE since 18 Sep 2026, and giving somebody's money back
  -- is not a smaller act than editing the class. A manager is refused HERE, in
  -- words, before one seat is touched — which is also what stops a refused
  -- delete from leaving a room full of cancelled seats behind it.
  if not public.is_business_owner(v_class.business_id) then
    raise exception 'Only the owner of this studio can call off its classes';
  end if;

  -- ⚠ `for update` on each seat, and the core takes the CLASS lock itself, so
  -- this cannot race somebody booking the last place while the class is being
  -- called off.
  for v_seat in
    select e.id, e.user_id
    from public.class_bookings e
    where e.class_id = p_class_id
      and e.status in ('enrolled', 'waitlisted')
      and e.deleted_at is null
    order by e.created_at
    for update
  loop
    -- ⚠ THE ACTOR IS THE OWNER AND THE PAYER IS THE SEAT'S OWN PERSON. The
    -- refund belongs to whoever paid for the seat, wherever the press came from.
    v_result := public._cancel_one_class_booking(v_seat.id, v_user, v_seat.user_id, p_reason, true);
    v_seats := v_seats + 1;
    if v_result -> 'refund' is not null and v_result -> 'refund' <> 'null'::jsonb then
      v_refunds := v_refunds + 1;
      v_rupees := v_rupees + coalesce((v_result -> 'refund' ->> 'amount_inr')::integer, 0);
    end if;
  end loop;

  return jsonb_build_object('seats', v_seats, 'refunds', v_refunds, 'amount_inr', v_rupees);
end;
$function$;

comment on function public.cancel_class_bookings_for_class(uuid, text) is
  'The owner calls off one class: every live seat cancelled, every paid one '
  'refunded AUTOMATICALLY whatever the clock says — the 48-hour rule is about a '
  'learner cancelling late, not about a class the studio itself called off. '
  'Nobody is promoted off the waitlist into a class that is ending. Returns '
  '{seats, refunds, amount_inr}. 30 Sep 2026: the delete sheet had promised this '
  'since 29 Aug 2026 and nothing did it.';

revoke all on function public.cancel_class_bookings_for_class(uuid, text) from public;
revoke all on function public.cancel_class_bookings_for_class(uuid, text) from anon;
grant execute on function public.cancel_class_bookings_for_class(uuid, text) to authenticated;
grant execute on function public.cancel_class_bookings_for_class(uuid, text) to service_role;
