-- A REJECTED STUDIO GETS ITS FIRST MONTH BACK (6 Oct 2026, decision 2 of the
-- eight put to the user on 5 Oct, "resolve all as you mentioned apart from
-- point 5"). ⚠ Rule 9: money.
--
-- Since R51 (27 Sep 2026) a studio pays at creation and is verified after, so a
-- studio DanceOS then refuses has paid ₹1,200 for a month it could never use.
-- The verification desk already offers "End its subscription too" on a reject
-- (27 Sep), which stops the NEXT charge; the first period stayed taken. When
-- that box is ticked, the first period now goes back too.
--
-- The money moves at CASHFREE, through its Subscriptions refund API
-- (`POST /pg/subscriptions/{id}/refunds`, the authorisation payment's own
-- `payment_id`, read back off the sandbox before a line was written). This file
-- is only the RECORD of a refund Cashfree has accepted:
--
--   `admin_record_first_period_refund(p_subscription_id, p_provider_refund_id, p_reason)`
--     * a platform admin's alone (`is_platform_admin()` inside; authenticated only);
--     * finds the subscription's captured AUTHORISATION payment — the first
--       period — and refuses in words when there is none (a comped plan) or it
--       is already refunded, so it can never be recorded twice;
--     * marks THAT payment `refunded` (the CHECK has admitted the word since
--       10 Sep), tells the payer in words, and writes `subscription.refund` to
--       the audit log with the amount and Cashfree's refund id.
--
-- ⚠ Not a `refunds` row: that table is a CLASS-ORDER ledger (`order_id` and
-- `payment_id` both NOT NULL, `order_id` → orders), and a subscription payment
-- has no order (`payments_subject_check`). Inventing an order to hang it on
-- would put a fake sale in every ledger that reads orders.
-- ⚠ The renewal charges are untouched: only the first period was never usable.
--
-- No table, column, policy or grant on anything existing. No `begin;`/`commit;`.

create or replace function public.admin_record_first_period_refund(
  p_subscription_id uuid,
  p_provider_refund_id text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  s public.subscriptions;
  v_pay public.payments;
  v_label text;
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'say why in a sentence — they read it, and so does the log';
  end if;
  if p_provider_refund_id is null or char_length(btrim(p_provider_refund_id)) < 3 then
    raise exception 'a refund is recorded with the rail''s own refund id';
  end if;
  select * into s from public.subscriptions x where x.id = p_subscription_id and x.deleted_at is null;
  if not found then raise exception 'no such subscription'; end if;

  select * into v_pay from public.payments p
   where p.subscription_id = s.id and p.kind = 'subscription_auth' and p.deleted_at is null
   order by p.created_at desc
   limit 1
   for update;
  if not found then
    raise exception 'nothing was paid for the first period — there is nothing to refund';
  end if;
  if v_pay.status = 'refunded' then
    raise exception 'the first period is already refunded';
  end if;
  if v_pay.status <> 'captured' then
    raise exception 'the first period''s payment did not go through — there is nothing to refund';
  end if;

  update public.payments set status = 'refunded', updated_by = auth.uid() where id = v_pay.id;

  if s.kind in ('studio', 'org') then
    select t.name into v_label from public.businesses t where t.id = s.business_id;
  else
    select p.full_name into v_label from public.profiles p where p.id = s.user_id;
  end if;

  perform public.notify(s.user_id, 'money',
    '₹' || to_char(v_pay.amount_inr, 'FM9,99,99,999') || ' for ' || coalesce(v_label, 'your subscription') || ' is coming back',
    btrim(p_reason) || ' — the first month is refunded to where it was paid from, in a few working days.',
    '/invoices');
  perform public.log_admin_action('subscription.refund',
    case when s.kind in ('studio', 'org') then 'business' else 'profile' end,
    coalesce(s.business_id, s.user_id), v_label, p_reason,
    jsonb_build_object('subscription_id', s.id, 'payment_id', v_pay.id, 'amount_inr', v_pay.amount_inr,
                       'provider_refund_id', btrim(p_provider_refund_id)));

  return jsonb_build_object('payment_id', v_pay.id, 'amount_inr', v_pay.amount_inr);
end;
$function$;

revoke all on function public.admin_record_first_period_refund(uuid, text, text) from public, anon;
grant execute on function public.admin_record_first_period_refund(uuid, text, text) to authenticated, service_role;

comment on function public.admin_record_first_period_refund(uuid, text, text) is
  'Records that Cashfree accepted the refund of a subscription''s FIRST period (its authorisation payment) — used when a studio is rejected at verification with "End its subscription too". Marks that payment refunded, tells the payer, audits subscription.refund. A platform admin''s alone; refuses a comped plan, a failed payment and a second refund.';
