-- Step 9 (Razorpay payments): orders + payments + refunds + webhook_events, and
-- the RPCs that make enrollment paid.
--
-- Money rules from the build plan, enforced here:
--   * Payment-affecting state changes are driven by VERIFIED Razorpay events —
--     the webhook handler and the (server-verified) checkout handshake both call
--     the SAME idempotent apply_* functions, so a replayed event is a no-op.
--   * Every payment row is traceable to a tenant, a user, and the bookable
--     entity (class + session) — denormalised onto orders and payments.
--   * Refunds live in their own auditable table (status transitions), never as
--     a bare flag flip on the payment.
--   * No direct table writes: learners go through create_payment_order /
--     cancel_booking, the webhook goes through apply_* (service role only).
--
-- This migration also closes the free-booking hole payments open up:
--   * enroll_in_session now REJECTS a priced class with open seats (the pay
--     flow owns that path); joining the waitlist of a full class stays free.
--   * a freed seat auto-promotes the oldest waitlisted person ONLY on free
--     classes — on a paid class the seat goes back on sale (promoting someone
--     who has not paid would give a paid seat away).

-- ── orders — one row per attempt to buy a seat ────────────────────────────────
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  -- set when the seat is granted (payment captured while a seat was open)
  enrollment_id uuid references public.enrollments (id) on delete set null,
  -- price snapshot at order time, in whole rupees (paise only at the API edge)
  amount_inr integer not null check (amount_inr > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  razorpay_order_id text,
  status text not null default 'created'
    check (status in ('created', 'paid', 'refund_pending', 'refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);

comment on table public.orders is
  'An attempt to buy one seat in one class_session. Razorpay order is attached before checkout opens; status is driven by verified payment events.';

-- the idempotency spine for order lookups from webhook payloads
create unique index orders_razorpay_order_id
  on public.orders (razorpay_order_id) where razorpay_order_id is not null;
create index orders_user_idx on public.orders (user_id) where deleted_at is null;
create index orders_tenant_idx on public.orders (tenant_id) where deleted_at is null;
create index orders_session_idx on public.orders (session_id) where deleted_at is null;
create index orders_enrollment_idx on public.orders (enrollment_id) where enrollment_id is not null;

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ── payments — one row per Razorpay payment event ─────────────────────────────
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  razorpay_payment_id text not null,
  amount_inr integer not null check (amount_inr >= 0),
  method text,
  status text not null check (status in ('captured', 'failed', 'refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);

comment on table public.payments is
  'Razorpay payments as reported by verified events. razorpay_payment_id is unique: processing the same event twice cannot double-book or double-count.';

create unique index payments_razorpay_payment_id on public.payments (razorpay_payment_id);
create index payments_order_idx on public.payments (order_id);
create index payments_tenant_idx on public.payments (tenant_id) where deleted_at is null;
create index payments_user_idx on public.payments (user_id) where deleted_at is null;

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- ── refunds — the auditable money-back ledger ─────────────────────────────────
create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount_inr integer not null check (amount_inr >= 0),
  -- why the money is going back — the learner's reason or the system's
  reason text,
  razorpay_refund_id text,
  -- requested: inside the 48 h window, the studio decides (Step 13 queue)
  -- pending:   refund is due and initiated; waiting on Razorpay to process
  status text not null default 'pending'
    check (status in ('requested', 'pending', 'processed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);

comment on table public.refunds is
  'Every rupee going back, with why. Rows are created by cancel_booking (policy window decides requested vs pending) or by refund events arriving from Razorpay.';

create unique index refunds_razorpay_refund_id
  on public.refunds (razorpay_refund_id) where razorpay_refund_id is not null;
create index refunds_payment_idx on public.refunds (payment_id);
create index refunds_tenant_status_idx on public.refunds (tenant_id, status) where deleted_at is null;

create trigger refunds_set_updated_at
  before update on public.refunds
  for each row execute function public.set_updated_at();

-- ── webhook_events — exactly-once processing ledger ───────────────────────────
-- Machine-written by the webhook route (service role): created_by/updated_by are
-- nullable because there is no acting user behind a Razorpay delivery.
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

comment on table public.webhook_events is
  'One row per Razorpay webhook delivery (x-razorpay-event-id). The unique event_id makes redelivery a no-op; processed_at distinguishes handled from merely received.';

create unique index webhook_events_event_id on public.webhook_events (event_id);

create trigger webhook_events_set_updated_at
  before update on public.webhook_events
  for each row execute function public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.refunds enable row level security;
alter table public.webhook_events enable row level security; -- no policies: service role only

create policy "users read own orders" on public.orders for select
  to authenticated using (user_id = auth.uid());
create policy "members read tenant orders" on public.orders for select
  to authenticated using (
    exists (select 1 from public.tenant_members m
            where m.tenant_id = orders.tenant_id and m.user_id = auth.uid() and m.deleted_at is null));

create policy "users read own payments" on public.payments for select
  to authenticated using (user_id = auth.uid());
create policy "members read tenant payments" on public.payments for select
  to authenticated using (
    exists (select 1 from public.tenant_members m
            where m.tenant_id = payments.tenant_id and m.user_id = auth.uid() and m.deleted_at is null));

create policy "users read own refunds" on public.refunds for select
  to authenticated using (user_id = auth.uid());
create policy "members read tenant refunds" on public.refunds for select
  to authenticated using (
    exists (select 1 from public.tenant_members m
            where m.tenant_id = refunds.tenant_id and m.user_id = auth.uid() and m.deleted_at is null));

-- No insert/update/delete policies on any of these: money moves only through the
-- functions below, so the policy window, idempotency and capacity checks can
-- never be skipped.

-- ── create_payment_order — the learner starts a paid booking ──────────────────
create or replace function public.create_payment_order(p_session_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_session public.class_sessions;
  v_class public.classes;
  v_taken integer;
  v_row public.orders;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user and p.deleted_at is null) then
    raise exception 'finish onboarding before booking';
  end if;

  select * into v_session from public.class_sessions s
    where s.id = p_session_id and s.deleted_at is null;
  if not found then
    raise exception 'session not found';
  end if;
  if v_session.starts_at <= now() then
    raise exception 'this session has already started';
  end if;

  select * into v_class from public.classes c
    where c.id = v_session.class_id and c.deleted_at is null and c.status = 'published';
  if not found then
    raise exception 'class is not open for booking';
  end if;
  if v_class.price_inr <= 0 then
    raise exception 'this class is free — book it directly';
  end if;

  if exists (
    select 1 from public.enrollments e
    where e.session_id = p_session_id and e.user_id = v_user
      and e.status in ('enrolled', 'waitlisted') and e.deleted_at is null
  ) then
    raise exception 'you already have a spot in this class';
  end if;

  -- advisory (no lock — no seat is held by an order); the capture re-checks
  -- under the class lock and refunds if the class filled up meanwhile
  select count(*) into v_taken from public.enrollments e
    where e.session_id = p_session_id and e.status = 'enrolled' and e.deleted_at is null;
  if v_taken >= v_class.capacity then
    raise exception 'class is full — join the waitlist instead';
  end if;

  insert into public.orders (tenant_id, user_id, class_id, session_id, amount_inr)
  values (v_class.tenant_id, v_user, v_class.id, p_session_id, v_class.price_inr)
  returning * into v_row;
  return v_row;
end;
$$;

-- ── attach_razorpay_order — bind the Razorpay order id before checkout opens ──
create or replace function public.attach_razorpay_order(p_order_id uuid, p_razorpay_order_id text)
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
    set razorpay_order_id = p_razorpay_order_id, updated_by = auth.uid()
    where id = p_order_id and user_id = auth.uid()
      and status = 'created' and razorpay_order_id is null and deleted_at is null;
  if not found then
    raise exception 'order not found or already attached';
  end if;
end;
$$;

-- ── apply_captured_payment — a verified capture grants the seat ───────────────
-- Called by the webhook route AND the server-verified checkout handshake, with
-- amounts fetched from Razorpay itself (paise). Idempotent two ways: a repeated
-- razorpay_payment_id short-circuits, and a paid order never pays twice.
-- Lock order everywhere: class first, then the order row (matches enroll/cancel).
create or replace function public.apply_captured_payment(
  p_razorpay_order_id text,
  p_razorpay_payment_id text,
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
    where razorpay_order_id = p_razorpay_order_id and deleted_at is null;
  if not found then
    -- not ours (another product on the same account) — acknowledge and move on
    return jsonb_build_object('outcome', 'ignored', 'reason', 'unknown order');
  end if;

  -- canonical lock order: class first, then the order row
  select * into v_class from public.classes c where c.id = v_order.class_id for update;
  select * into v_order from public.orders where id = v_order.id for update;

  select * into v_payment from public.payments
    where razorpay_payment_id = p_razorpay_payment_id;
  if found then
    return jsonb_build_object('outcome', 'duplicate', 'order_status', v_order.status);
  end if;

  insert into public.payments (order_id, tenant_id, user_id, razorpay_payment_id,
                               amount_inr, method, status, created_by, updated_by)
  values (v_order.id, v_order.tenant_id, v_order.user_id, p_razorpay_payment_id,
          v_amount_inr, p_method, 'captured', v_order.user_id, v_order.user_id)
  returning * into v_payment;

  -- money arrived for a closed order, or the wrong amount arrived: never grant
  -- a seat off it — ledger a refund and flag the order
  if v_order.status <> 'created' or p_amount_paise <> v_order.amount_inr::bigint * 100 then
    insert into public.refunds (payment_id, order_id, tenant_id, user_id, amount_inr,
                                reason, status, created_by, updated_by)
    values (v_payment.id, v_order.id, v_order.tenant_id, v_order.user_id, v_amount_inr,
            case when v_order.status <> 'created' then 'payment landed on a closed order'
                 else 'amount did not match the order' end,
            'pending', v_order.user_id, v_order.user_id)
    returning * into v_refund;
    update public.orders set status = 'refund_pending', updated_by = v_order.user_id
      where id = v_order.id;
    return jsonb_build_object('outcome', 'refund_pending',
      'refund_id', v_refund.id, 'razorpay_payment_id', p_razorpay_payment_id);
  end if;

  -- an existing live spot: enrolled twice → refund; waitlisted → they paid to
  -- claim an open seat, promote them (still subject to the capacity check)
  select * into v_existing from public.enrollments e
    where e.session_id = v_order.session_id and e.user_id = v_order.user_id
      and e.status in ('enrolled', 'waitlisted') and e.deleted_at is null;

  if found and v_existing.status = 'enrolled' then
    insert into public.refunds (payment_id, order_id, tenant_id, user_id, amount_inr,
                                reason, status, created_by, updated_by)
    values (v_payment.id, v_order.id, v_order.tenant_id, v_order.user_id, v_amount_inr,
            'already enrolled in this session', 'pending', v_order.user_id, v_order.user_id)
    returning * into v_refund;
    update public.orders set status = 'refund_pending', updated_by = v_order.user_id
      where id = v_order.id;
    return jsonb_build_object('outcome', 'refund_pending',
      'refund_id', v_refund.id, 'razorpay_payment_id', p_razorpay_payment_id);
  end if;

  select count(*) into v_taken from public.enrollments e
    where e.session_id = v_order.session_id and e.status = 'enrolled' and e.deleted_at is null;

  if v_taken >= v_class.capacity then
    -- the class filled up between checkout opening and the money landing
    insert into public.refunds (payment_id, order_id, tenant_id, user_id, amount_inr,
                                reason, status, created_by, updated_by)
    values (v_payment.id, v_order.id, v_order.tenant_id, v_order.user_id, v_amount_inr,
            'class filled up before the payment landed', 'pending', v_order.user_id, v_order.user_id)
    returning * into v_refund;
    update public.orders set status = 'refund_pending', updated_by = v_order.user_id
      where id = v_order.id;
    return jsonb_build_object('outcome', 'refund_pending',
      'refund_id', v_refund.id, 'razorpay_payment_id', p_razorpay_payment_id);
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

-- ── apply_failed_payment — record the failure, keep the order retryable ───────
-- The failure reason stays in webhook_events.payload; the payment row is the tally.
create or replace function public.apply_failed_payment(
  p_razorpay_order_id text,
  p_razorpay_payment_id text
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
    where razorpay_order_id = p_razorpay_order_id and deleted_at is null;
  if not found then
    return jsonb_build_object('outcome', 'ignored', 'reason', 'unknown order');
  end if;
  if exists (select 1 from public.payments where razorpay_payment_id = p_razorpay_payment_id) then
    return jsonb_build_object('outcome', 'duplicate');
  end if;
  insert into public.payments (order_id, tenant_id, user_id, razorpay_payment_id,
                               amount_inr, method, status, created_by, updated_by)
  values (v_order.id, v_order.tenant_id, v_order.user_id, p_razorpay_payment_id,
          0, null, 'failed', v_order.user_id, v_order.user_id);
  return jsonb_build_object('outcome', 'recorded');
end;
$$;

-- ── apply_refund_update — a refund event lands (processed or failed) ──────────
create or replace function public.apply_refund_update(
  p_razorpay_payment_id text,
  p_razorpay_refund_id text,
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
    where razorpay_payment_id = p_razorpay_payment_id and deleted_at is null;
  if not found then
    return jsonb_build_object('outcome', 'ignored', 'reason', 'unknown payment');
  end if;

  -- match by refund id first (idempotent replay), else the oldest open row
  select * into v_refund from public.refunds
    where razorpay_refund_id = p_razorpay_refund_id and deleted_at is null;
  if not found then
    select * into v_refund from public.refunds
      where payment_id = v_payment.id and razorpay_refund_id is null
        and status in ('pending', 'requested') and deleted_at is null
      order by created_at limit 1;
  end if;

  if v_refund.id is null then
    -- initiated straight from the Razorpay dashboard — it still gets ledgered
    insert into public.refunds (payment_id, order_id, tenant_id, user_id, amount_inr,
                                reason, razorpay_refund_id, status, created_by, updated_by)
    values (v_payment.id, v_payment.order_id, v_payment.tenant_id, v_payment.user_id,
            (p_amount_paise / 100)::integer, 'initiated outside the app',
            p_razorpay_refund_id, v_status, v_payment.user_id, v_payment.user_id)
    returning * into v_refund;
  else
    update public.refunds
      set razorpay_refund_id = p_razorpay_refund_id, status = v_status,
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

-- ── attach_razorpay_refund — bind the id after the refund API call ────────────
create or replace function public.attach_razorpay_refund(p_refund_id uuid, p_razorpay_refund_id text)
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
    set razorpay_refund_id = p_razorpay_refund_id, updated_by = auth.uid()
    where id = p_refund_id and user_id = auth.uid()
      and razorpay_refund_id is null and deleted_at is null;
  if not found then
    raise exception 'refund not found or already attached';
  end if;
end;
$$;

-- ── cancel_booking — the seat now, the money by the policy window ─────────────
-- Replaces the Step 4 cancel logic as the single core: seat back immediately;
-- auto-promote the oldest waitlisted ONLY on free classes; a paid booking files
-- its refund row — 'pending' (full refund due, >= 48 h ahead) or 'requested'
-- (inside 48 h, the studio decides — the prototype policy line, S_class 12400).
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
    insert into public.refunds (payment_id, order_id, tenant_id, user_id, amount_inr,
                                reason, status, created_by, updated_by)
    values (v_payment.id, v_order.id, v_order.tenant_id, v_user, v_payment.amount_inr,
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
      'razorpay_payment_id', v_payment.razorpay_payment_id));
  end if;

  return jsonb_build_object('status', 'cancelled', 'refund', null);
end;
$$;

-- ── cancel_enrollment — same signature as Step 4, now a wrapper on the core ───
create or replace function public.cancel_enrollment(p_enrollment_id uuid)
returns public.enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.enrollments;
begin
  perform public.cancel_booking(p_enrollment_id, null);
  select * into v_row from public.enrollments where id = p_enrollment_id;
  return v_row;
end;
$$;

-- ── enroll_in_session — the free path closes for priced classes ───────────────
-- Same body as Step 4 with one new gate: open seats on a priced class must go
-- through the pay flow. A FULL priced class still waitlists free of charge.
create or replace function public.enroll_in_session(p_session_id uuid)
returns public.enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_session public.class_sessions;
  v_class public.classes;
  v_taken integer;
  v_row public.enrollments;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user and p.deleted_at is null) then
    raise exception 'finish onboarding before enrolling';
  end if;

  select * into v_session from public.class_sessions s
    where s.id = p_session_id and s.deleted_at is null;
  if not found then
    raise exception 'session not found';
  end if;
  if v_session.starts_at <= now() then
    raise exception 'this session has already started';
  end if;

  select * into v_class from public.classes c
    where c.id = v_session.class_id and c.deleted_at is null and c.status = 'published'
    for update;
  if not found then
    raise exception 'class is not open for booking';
  end if;

  if exists (
    select 1 from public.enrollments e
    where e.session_id = p_session_id and e.user_id = v_user
      and e.status in ('enrolled', 'waitlisted') and e.deleted_at is null
  ) then
    raise exception 'you already have a spot in this class';
  end if;

  select count(*) into v_taken from public.enrollments e
    where e.session_id = p_session_id and e.status = 'enrolled' and e.deleted_at is null;

  if v_taken < v_class.capacity and v_class.price_inr > 0 then
    raise exception 'this class takes payment — book it from its class page';
  end if;

  insert into public.enrollments (session_id, class_id, tenant_id, user_id, status, created_by, updated_by)
  values (p_session_id, v_class.id, v_class.tenant_id, v_user,
          case when v_taken < v_class.capacity then 'enrolled' else 'waitlisted' end,
          v_user, v_user)
  returning * into v_row;

  return v_row;
end;
$$;

-- ── grants ────────────────────────────────────────────────────────────────────
revoke execute on function public.create_payment_order(uuid) from public, anon;
grant execute on function public.create_payment_order(uuid) to authenticated;
revoke execute on function public.attach_razorpay_order(uuid, text) from public, anon;
grant execute on function public.attach_razorpay_order(uuid, text) to authenticated;
revoke execute on function public.cancel_booking(uuid, text) from public, anon;
grant execute on function public.cancel_booking(uuid, text) to authenticated;
revoke execute on function public.attach_razorpay_refund(uuid, text) from public, anon;
grant execute on function public.attach_razorpay_refund(uuid, text) to authenticated;

-- the verified-event appliers belong to the machine alone
revoke execute on function public.apply_captured_payment(text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.apply_captured_payment(text, text, bigint, text) to service_role;
revoke execute on function public.apply_failed_payment(text, text) from public, anon, authenticated;
grant execute on function public.apply_failed_payment(text, text) to service_role;
revoke execute on function public.apply_refund_update(text, text, bigint, boolean) from public, anon, authenticated;
grant execute on function public.apply_refund_update(text, text, bigint, boolean) to service_role;
