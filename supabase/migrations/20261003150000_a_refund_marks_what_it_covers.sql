-- ⚠ Rule 9 (money labels). A REFUND MARKS WHAT IT COVERS, AND NOTHING MORE
-- (3 Oct 2026, the user's "do it" on option A — "the label follows the money").
--
-- Found by scripts/shots/shoot-enquiry-money.js: ₹300 refunded of a ₹500 enquiry
-- advance, and the payment AND the order read `refunded`. That was always right
-- for a class (a refund is the whole seat) and has been wrong since enquiry
-- endings made a refund PARTIAL. The payer's and the business's Invoices read the
-- payment's status, so a ₹500 receipt was filed under Refunded with ₹200 kept.
-- ⚠ No figure was ever wrong: Earnings, income and enquiry_money subtract the
-- refund ROWS, never the status.
--
-- And a second inconsistency, the other way round: settle_refund_offline (a refund
-- handed back at the desk) marked the ORDER refunded and never the PAYMENT, so a
-- class refund settled in person still read "Paid" on the receipt.
--
-- What changes, and nothing else:
--   * apply_refund_update — the two status UPDATEs fire only once the processed
--     refunds on that payment (order) are at least what was paid.
--   * settle_refund_offline — the same test, and it now marks the PAYMENT too.
-- Both bodies are the live catalog's own (pg_get_functiondef, 3 Oct 2026) with
-- only those statements edited. Same signatures, so `create or replace` keeps
-- every grant (apply_refund_update: service_role; settle_refund_offline:
-- authenticated + service_role). No table, column, policy or row is touched;
-- nothing is backfilled (0 payments on production are `refunded`, counted first).
-- A payment covered by its refunds is one where
--   sum(refunds.amount_inr where payment_id = it and status = 'processed') >= amount_inr
-- (every refunds row names its payment — the column is NOT NULL — and no order on
-- production carries more than one live payment).

create or replace function public.apply_refund_update(p_provider_payment_id text, p_provider_refund_id text, p_amount_paise bigint, p_succeeded boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_payment public.payments;
  v_refund public.refunds;
  v_status text := case when p_succeeded then 'processed' else 'failed' end;
begin
  select * into v_payment from public.payments
    where provider_payment_id = p_provider_payment_id and deleted_at is null;
  if not found then
    return jsonb_build_object('outcome', 'ignored', 'reason', 'unknown payment');
  end if;

  -- match by refund id first (idempotent replay), else the oldest open row
  select * into v_refund from public.refunds
    where provider_refund_id = p_provider_refund_id and deleted_at is null;
  if not found then
    select * into v_refund from public.refunds
      where payment_id = v_payment.id and provider_refund_id is null
        and status in ('pending', 'requested') and deleted_at is null
      order by created_at limit 1;
  end if;

  if v_refund.id is null then
    -- initiated straight from the provider''s dashboard — it still gets ledgered
    insert into public.refunds (payment_id, order_id, business_id, user_id, provider, amount_inr,
                                reason, provider_refund_id, status, created_by, updated_by)
    values (v_payment.id, v_payment.order_id, v_payment.business_id, v_payment.user_id, v_payment.provider,
            (p_amount_paise / 100)::integer, 'initiated outside the app',
            p_provider_refund_id, v_status, v_payment.user_id, v_payment.user_id)
    returning * into v_refund;
  else
    update public.refunds
      set provider_refund_id = p_provider_refund_id, status = v_status,
          updated_by = v_payment.user_id
      where id = v_refund.id
      returning * into v_refund;
  end if;

  if p_succeeded then
    -- ⚠ CHANGED 3 Oct 2026: only once the processed refunds cover what was paid —
    -- a partial refund (an enquiry ending) leaves the payment and its order paid
    update public.payments set status = 'refunded', updated_by = v_payment.user_id
      where id = v_payment.id
        and (select coalesce(sum(r.amount_inr), 0) from public.refunds r
              where r.payment_id = v_payment.id and r.status = 'processed' and r.deleted_at is null)
            >= v_payment.amount_inr;
    update public.orders o set status = 'refunded', updated_by = v_payment.user_id
      where o.id = v_payment.order_id
        and (select coalesce(sum(r.amount_inr), 0) from public.refunds r
              where r.order_id = o.id and r.status = 'processed' and r.deleted_at is null)
            >= (select coalesce(sum(p.amount_inr), 0) from public.payments p
                 where p.order_id = o.id and p.status <> 'failed' and p.deleted_at is null);
  end if;

  return jsonb_build_object('outcome', v_status, 'refund_id', v_refund.id);
end;
$function$;

create or replace function public.settle_refund_offline(p_refund_id uuid, p_note text default null::text)
 returns refunds
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
  v_refund public.refunds;
  v_order public.orders;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_refund from public.refunds r
    where r.id = p_refund_id and r.deleted_at is null;
  if not found then
    raise exception 'refund not found';
  end if;

  select * into v_order from public.orders o where o.id = v_refund.order_id;
  if not public.can_settle_refunds_for_order(v_order.id) then
    raise exception 'only the owner, or somebody holding refunds on this class, settles it';
  end if;
  if v_refund.status not in ('requested', 'pending') then
    raise exception 'that refund is already closed';
  end if;
  if v_refund.provider_refund_id is not null then
    raise exception 'this one is with the payment rail -- its own event closes it';
  end if;

  update public.refunds
    set status = 'processed',
        settled_offline = true,
        decided_at = now(),
        decision_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), decision_note),
        updated_by = v_user
    where id = v_refund.id
    returning * into v_refund;

  -- ⚠ CHANGED 3 Oct 2026: the PAYMENT is marked too (Invoices reads it, and a
  -- class refund settled at the desk read "Paid" on the receipt), and both only
  -- once the processed refunds cover what was paid
  update public.payments p
    set status = 'refunded', updated_by = v_user
    where p.id = v_refund.payment_id and p.status = 'captured'
      and (select coalesce(sum(r.amount_inr), 0) from public.refunds r
            where r.payment_id = p.id and r.status = 'processed' and r.deleted_at is null)
          >= p.amount_inr;

  update public.orders o
    set status = 'refunded', updated_by = v_user
    where o.id = v_refund.order_id and o.status <> 'refunded'
      and (select coalesce(sum(r.amount_inr), 0) from public.refunds r
            where r.order_id = o.id and r.status = 'processed' and r.deleted_at is null)
          >= (select coalesce(sum(p.amount_inr), 0) from public.payments p
               where p.order_id = o.id and p.status <> 'failed' and p.deleted_at is null);

  return v_refund;
end;
$function$;
