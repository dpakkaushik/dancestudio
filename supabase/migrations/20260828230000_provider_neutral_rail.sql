-- Rail swap (28 Aug 2026): the payment provider is Cashfree, and the ledger
-- stops naming a vendor. ⚠ money, ⚠ RLS-adjacent (security-definer functions
-- recreated; grants re-stated verbatim; no policy changes).
--
-- Step 9 built the money tables around Razorpay's ids — razorpay_order_id,
-- razorpay_payment_id, razorpay_refund_id — and the RPC parameters said so too.
-- The ledger itself was never Razorpay-shaped: an order, the payments the rail
-- reports against it, the refunds going back, an exactly-once webhook ledger.
-- So the columns become provider_* and every row says which `provider` wrote
-- it. The rows that already exist were Razorpay-shaped test ids and are
-- stamped 'razorpay'; everything from here on defaults to 'cashfree'.
--
-- A plpgsql body is text: renaming a column does not follow it into the
-- functions that read it, so every function touching these columns is
-- recreated here, in the same transaction. Where a PARAMETER is renamed the
-- function is dropped and recreated (Postgres refuses to rename a parameter
-- in place); where only the body changes, create or replace keeps the ACL.
-- Never edit the applied migrations (Rule 4).

-- ── the columns ───────────────────────────────────────────────────────────────
alter table public.orders rename column razorpay_order_id to provider_order_id;
alter index public.orders_razorpay_order_id rename to orders_provider_order_id;
alter table public.payments rename column razorpay_payment_id to provider_payment_id;
alter index public.payments_razorpay_payment_id rename to payments_provider_payment_id;
alter table public.refunds rename column razorpay_refund_id to provider_refund_id;
alter index public.refunds_razorpay_refund_id rename to refunds_provider_refund_id;

alter table public.orders add column provider text not null default 'razorpay'
  check (provider in ('razorpay', 'cashfree'));
alter table public.payments add column provider text not null default 'razorpay'
  check (provider in ('razorpay', 'cashfree'));
alter table public.refunds add column provider text not null default 'razorpay'
  check (provider in ('razorpay', 'cashfree'));
-- the rows that existed were Razorpay-shaped (stamped above); new rows are Cashfree's
alter table public.orders alter column provider set default 'cashfree';
alter table public.payments alter column provider set default 'cashfree';
alter table public.refunds alter column provider set default 'cashfree';

comment on table public.orders is
  'An attempt to buy one seat in one class_session. The provider''s order id is attached before checkout opens; status is driven by verified payment events from that provider.';
comment on table public.payments is
  'Payments as reported by verified provider events. provider_payment_id is unique: processing the same event twice cannot double-book or double-count.';
comment on table public.refunds is
  'Every rupee going back, with why. Rows are created by cancel_booking (policy window decides requested vs pending) or by refund events arriving from the provider.';
comment on table public.webhook_events is
  'One row per webhook delivery (the provider''s event id, or a hash of timestamp + body where the provider stamps none). The unique event_id makes redelivery a no-op; processed_at distinguishes handled from merely received.';

-- ── attach_provider_order — bind the provider''s order id before checkout opens ─
drop function if exists public.attach_razorpay_order(uuid, text);
create or replace function public.attach_provider_order(p_order_id uuid, p_provider_order_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.orders
    set provider_order_id = p_provider_order_id, updated_by = auth.uid()
    where id = p_order_id and user_id = auth.uid()
      and status = 'created' and provider_order_id is null and deleted_at is null;
  if not found then
    raise exception 'order not found or already attached';
  end if;
end;
$$;
revoke execute on function public.attach_provider_order(uuid, text) from public, anon;
grant execute on function public.attach_provider_order(uuid, text) to authenticated;

-- ── apply_captured_payment — a verified capture grants the seat ───────────────
-- Same body as Step 9 with the provider''s names; a payment or refund row it
-- writes inherits the order''s provider.
drop function if exists public.apply_captured_payment(text, text, bigint, text);
create or replace function public.apply_captured_payment(
  p_provider_order_id text,
  p_provider_payment_id text,
  p_amount_paise bigint,
  p_method text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_payment public.payments;
  v_class public.classes;
  v_existing public.enrollments;
  v_enrollment_id uuid;
  v_taken integer;
  v_refund public.refunds;
  v_amount_inr integer := (p_amount_paise / 100)::integer;
begin
  select * into v_order from public.orders
    where provider_order_id = p_provider_order_id and deleted_at is null;
  if not found then
    -- not ours (another product on the same account) — acknowledge and move on
    return jsonb_build_object('outcome', 'ignored', 'reason', 'unknown order');
  end if;

  -- canonical lock order: class first, then the order row
  select * into v_class from public.classes c where c.id = v_order.class_id for update;
  select * into v_order from public.orders where id = v_order.id for update;

  select * into v_payment from public.payments
    where provider_payment_id = p_provider_payment_id;
  if found then
    return jsonb_build_object('outcome', 'duplicate', 'order_status', v_order.status);
  end if;

  insert into public.payments (order_id, tenant_id, user_id, provider, provider_payment_id,
                               amount_inr, method, status, created_by, updated_by)
  values (v_order.id, v_order.tenant_id, v_order.user_id, v_order.provider, p_provider_payment_id,
          v_amount_inr, p_method, 'captured', v_order.user_id, v_order.user_id)
  returning * into v_payment;

  -- money arrived for a closed order, or the wrong amount arrived: never grant
  -- a seat off it — ledger a refund and flag the order
  if v_order.status <> 'created' or p_amount_paise <> v_order.amount_inr::bigint * 100 then
    insert into public.refunds (payment_id, order_id, tenant_id, user_id, provider, amount_inr,
                                reason, status, created_by, updated_by)
    values (v_payment.id, v_order.id, v_order.tenant_id, v_order.user_id, v_order.provider, v_amount_inr,
            case when v_order.status <> 'created' then 'payment landed on a closed order'
                 else 'amount did not match the order' end,
            'pending', v_order.user_id, v_order.user_id)
    returning * into v_refund;
    update public.orders set status = 'refund_pending', updated_by = v_order.user_id
      where id = v_order.id;
    return jsonb_build_object('outcome', 'refund_pending',
      'refund_id', v_refund.id, 'provider_payment_id', p_provider_payment_id);
  end if;

  -- an existing live spot: enrolled twice → refund; waitlisted → they paid to
  -- claim an open seat, promote them (still subject to the capacity check)
  select * into v_existing from public.enrollments e
    where e.session_id = v_order.session_id and e.user_id = v_order.user_id
      and e.status in ('enrolled', 'waitlisted') and e.deleted_at is null;

  if found and v_existing.status = 'enrolled' then
    insert into public.refunds (payment_id, order_id, tenant_id, user_id, provider, amount_inr,
                                reason, status, created_by, updated_by)
    values (v_payment.id, v_order.id, v_order.tenant_id, v_order.user_id, v_order.provider, v_amount_inr,
            'already enrolled in this session', 'pending', v_order.user_id, v_order.user_id)
    returning * into v_refund;
    update public.orders set status = 'refund_pending', updated_by = v_order.user_id
      where id = v_order.id;
    return jsonb_build_object('outcome', 'refund_pending',
      'refund_id', v_refund.id, 'provider_payment_id', p_provider_payment_id);
  end if;

  select count(*) into v_taken from public.enrollments e
    where e.session_id = v_order.session_id and e.status = 'enrolled' and e.deleted_at is null;

  if v_taken >= v_class.capacity then
    -- the class filled up between checkout opening and the money landing
    insert into public.refunds (payment_id, order_id, tenant_id, user_id, provider, amount_inr,
                                reason, status, created_by, updated_by)
    values (v_payment.id, v_order.id, v_order.tenant_id, v_order.user_id, v_order.provider, v_amount_inr,
            'class filled up before the payment landed', 'pending', v_order.user_id, v_order.user_id)
    returning * into v_refund;
    update public.orders set status = 'refund_pending', updated_by = v_order.user_id
      where id = v_order.id;
    return jsonb_build_object('outcome', 'refund_pending',
      'refund_id', v_refund.id, 'provider_payment_id', p_provider_payment_id);
  end if;

  if v_existing.id is not null then
    update public.enrollments set status = 'enrolled', updated_by = v_order.user_id
      where id = v_existing.id;
    v_enrollment_id := v_existing.id;
  else
    insert into public.enrollments (session_id, class_id, tenant_id, user_id, status,
                                    created_by, updated_by)
    values (v_order.session_id, v_order.class_id, v_order.tenant_id, v_order.user_id,
            'enrolled', v_order.user_id, v_order.user_id)
    returning id into v_enrollment_id;
  end if;

  update public.orders
    set status = 'paid', enrollment_id = v_enrollment_id, updated_by = v_order.user_id
    where id = v_order.id;

  return jsonb_build_object('outcome', 'enrolled', 'enrollment_id', v_enrollment_id);
end;
$$;
revoke execute on function public.apply_captured_payment(text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.apply_captured_payment(text, text, bigint, text) to service_role;

-- ── apply_failed_payment — record the failure, keep the order retryable ───────
drop function if exists public.apply_failed_payment(text, text);
create or replace function public.apply_failed_payment(
  p_provider_order_id text,
  p_provider_payment_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders
    where provider_order_id = p_provider_order_id and deleted_at is null;
  if not found then
    return jsonb_build_object('outcome', 'ignored', 'reason', 'unknown order');
  end if;
  if exists (select 1 from public.payments where provider_payment_id = p_provider_payment_id) then
    return jsonb_build_object('outcome', 'duplicate');
  end if;
  insert into public.payments (order_id, tenant_id, user_id, provider, provider_payment_id,
                               amount_inr, method, status, created_by, updated_by)
  values (v_order.id, v_order.tenant_id, v_order.user_id, v_order.provider, p_provider_payment_id,
          0, null, 'failed', v_order.user_id, v_order.user_id);
  return jsonb_build_object('outcome', 'recorded');
end;
$$;
revoke execute on function public.apply_failed_payment(text, text) from public, anon, authenticated;
grant execute on function public.apply_failed_payment(text, text) to service_role;

-- ── apply_refund_update — a refund event lands (processed or failed) ──────────
drop function if exists public.apply_refund_update(text, text, bigint, boolean);
create or replace function public.apply_refund_update(
  p_provider_payment_id text,
  p_provider_refund_id text,
  p_amount_paise bigint,
  p_succeeded boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
    insert into public.refunds (payment_id, order_id, tenant_id, user_id, provider, amount_inr,
                                reason, provider_refund_id, status, created_by, updated_by)
    values (v_payment.id, v_payment.order_id, v_payment.tenant_id, v_payment.user_id, v_payment.provider,
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
    update public.payments set status = 'refunded', updated_by = v_payment.user_id
      where id = v_payment.id;
    update public.orders set status = 'refunded', updated_by = v_payment.user_id
      where id = v_payment.order_id;
  end if;

  return jsonb_build_object('outcome', v_status, 'refund_id', v_refund.id);
end;
$$;
revoke execute on function public.apply_refund_update(text, text, bigint, boolean) from public, anon, authenticated;
grant execute on function public.apply_refund_update(text, text, bigint, boolean) to service_role;

-- ── attach_provider_refund — the payer binds the id after the refund API call ─
drop function if exists public.attach_razorpay_refund(uuid, text);
create or replace function public.attach_provider_refund(p_refund_id uuid, p_provider_refund_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.refunds
    set provider_refund_id = p_provider_refund_id, updated_by = auth.uid()
    where id = p_refund_id and user_id = auth.uid()
      and provider_refund_id is null and deleted_at is null;
  if not found then
    raise exception 'refund not found or already attached';
  end if;
end;
$$;
revoke execute on function public.attach_provider_refund(uuid, text) from public, anon;
grant execute on function public.attach_provider_refund(uuid, text) to authenticated;

-- ── cancel_booking — same signature; the money side now names the provider ───
create or replace function public.cancel_booking(p_enrollment_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.enrollments;
  v_class public.classes;
  v_session public.class_sessions;
  v_order public.orders;
  v_payment public.payments;
  v_refund public.refunds;
  v_was_enrolled boolean;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select * into v_row from public.enrollments e
    where e.id = p_enrollment_id and e.user_id = v_user
      and e.status in ('enrolled', 'waitlisted') and e.deleted_at is null;
  if not found then
    raise exception 'booking not found';
  end if;

  -- lock the class first so cancel + promote can't race a concurrent enroll
  select * into v_class from public.classes c where c.id = v_row.class_id for update;
  select * into v_session from public.class_sessions s where s.id = v_row.session_id;

  v_was_enrolled := (v_row.status = 'enrolled');

  update public.enrollments
    set status = 'cancelled', updated_by = v_user
    where id = v_row.id
    returning * into v_row;

  -- a freed seat promotes only where the seat is free to take
  if v_was_enrolled and v_class.price_inr = 0 then
    update public.enrollments
      set status = 'enrolled', updated_by = v_user
      where id = (
        select e.id from public.enrollments e
        where e.session_id = v_row.session_id
          and e.status = 'waitlisted' and e.deleted_at is null
        order by e.created_at
        limit 1
      );
  end if;

  -- the money side: only when this seat was actually paid for
  select * into v_order from public.orders o
    where o.enrollment_id = v_row.id and o.status = 'paid' and o.deleted_at is null
    order by o.created_at desc limit 1;
  if found then
    select * into v_payment from public.payments p
      where p.order_id = v_order.id and p.status = 'captured' and p.deleted_at is null
      order by p.created_at desc limit 1;
  end if;

  if v_payment.id is not null then
    insert into public.refunds (payment_id, order_id, tenant_id, user_id, provider, amount_inr,
                                reason, status, created_by, updated_by)
    values (v_payment.id, v_order.id, v_order.tenant_id, v_user, v_order.provider, v_payment.amount_inr,
            p_reason,
            case when v_session.starts_at - now() >= interval '48 hours'
                 then 'pending' else 'requested' end,
            v_user, v_user)
    returning * into v_refund;
    if v_refund.status = 'pending' then
      update public.orders set status = 'refund_pending', updated_by = v_user
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
$$;

-- ── decide_refund — same signature; hands the settler the provider''s ids ────
create or replace function public.decide_refund(
  p_refund_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_refund public.refunds;
  v_order public.orders;
  v_payment public.payments;
  v_next text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_decision not in ('approve', 'decline', 'reopen') then
    raise exception 'invalid decision';
  end if;

  select * into v_refund from public.refunds r
    where r.id = p_refund_id and r.deleted_at is null;
  if not found then
    raise exception 'refund not found';
  end if;

  select * into v_order from public.orders o where o.id = v_refund.order_id;
  if not public.can_settle_refunds_for_class(v_order.class_id) then
    raise exception 'only the studio owner, or somebody holding refunds on this class, settles it';
  end if;

  -- the transitions, stated once
  if p_decision = 'approve' then
    if v_refund.status <> 'requested' then
      raise exception 'only a request can be approved';
    end if;
    v_next := 'pending';
  elsif p_decision = 'decline' then
    if v_refund.status <> 'requested' then
      raise exception 'only a request can be declined';
    end if;
    v_next := 'declined';
  else
    if v_refund.status <> 'declined' then
      raise exception 'only a declined request can be reopened';
    end if;
    v_next := 'requested';
  end if;

  update public.refunds
    set status = v_next,
        decided_at = now(),
        decision_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), decision_note),
        updated_by = v_user
    where id = v_refund.id
    returning * into v_refund;

  select * into v_payment from public.payments p where p.id = v_refund.payment_id;

  return jsonb_build_object(
    'id', v_refund.id,
    'status', v_refund.status,
    'amount_inr', v_refund.amount_inr,
    'provider', v_order.provider,
    'provider_order_id', v_order.provider_order_id,
    'provider_payment_id', v_payment.provider_payment_id,
    'already_attached', v_refund.provider_refund_id is not null
  );
end;
$$;

-- ── settle_refund_offline — same signature; the rail''s id is what closes the door
create or replace function public.settle_refund_offline(p_refund_id uuid, p_note text default null)
returns public.refunds
language plpgsql
security definer
set search_path = ''
as $$
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
  if not public.can_settle_refunds_for_class(v_order.class_id) then
    raise exception 'only the studio owner, or somebody holding refunds on this class, settles it';
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

  update public.orders
    set status = 'refunded', updated_by = v_user
    where id = v_refund.order_id and status <> 'refunded';

  return v_refund;
end;
$$;

-- ── attach_settled_refund_reference — the settler''s bind, renamed parameter ──
drop function if exists public.attach_settled_refund_reference(uuid, text);
create or replace function public.attach_settled_refund_reference(
  p_refund_id uuid,
  p_provider_refund_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_refund public.refunds;
  v_order public.orders;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_refund from public.refunds r
    where r.id = p_refund_id and r.provider_refund_id is null and r.deleted_at is null;
  if not found then
    raise exception 'refund not found or already attached';
  end if;

  select * into v_order from public.orders o where o.id = v_refund.order_id;
  if not public.can_settle_refunds_for_class(v_order.class_id) then
    raise exception 'not yours to settle';
  end if;

  update public.refunds
    set provider_refund_id = p_provider_refund_id, updated_by = v_user
    where id = v_refund.id;
end;
$$;
revoke execute on function public.attach_settled_refund_reference(uuid, text) from public, anon;
grant execute on function public.attach_settled_refund_reference(uuid, text) to authenticated;
