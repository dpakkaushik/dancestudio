-- Step 13b (part 1) ⚠ money: the refund requests a studio can finally answer.
--
-- THE HOLE THIS CLOSES. Step 9 files a refund inside the 48 h window as
-- 'requested' -- "the studio decides" -- and then nothing in the app could
-- decide it. The only writer of that row was apply_refund_update, which is
-- service_role only (the webhook). So a learner who cancelled inside the window
-- had their seat taken back and their money left in a queue nobody could reach.
-- That is the worst kind of gap: silent, and on the customer's side of the till.
--
-- What this adds is the prototype's own settle row (S_class 12247-12262):
-- Approve · Decline · Mark refunded · Reopen. Nothing more -- no new money path,
-- no new way to take money in.

-- ── 'declined' is a real outcome, not a failure ───────────────────────────────
-- A studio saying no inside its own policy window is a decision. Recording it as
-- 'failed' would have said the rail broke, which is a different fact entirely.
alter table public.refunds drop constraint if exists refunds_status_check;
alter table public.refunds add constraint refunds_status_check
  check (status in ('requested', 'pending', 'processed', 'failed', 'declined'));

alter table public.refunds
  add column decided_at timestamptz,
  add column decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  -- a cash refund handed over at the desk never touches Razorpay; saying so out
  -- loud is what keeps 'processed' from claiming the rail moved money it never saw
  add column settled_offline boolean not null default false;

comment on column public.refunds.settled_offline is
  'True when the studio settled this by hand (cash at the desk) rather than through the payment rail. Without it, a manually-closed refund would be indistinguishable from one Razorpay actually processed.';

-- ── who may settle a refund ───────────────────────────────────────────────────
-- The owner, or somebody holding the REFUNDS job on that class -- the prototype's
-- "Manages refunds · Sees refund requests against this class and settles them"
-- (12710). Note a plain trainer is NOT admitted: the job exists precisely because
-- settling money is not implied by being a trainer, and unlike payout approval
-- (owner-only, ungrantable, SS10.9) this one is grantable per class.
--
-- The membership re-check is in the claim branch FROM THE START -- 20260825140000
-- had to go back and add it to can_run_register_for_class after the fact, and the
-- lesson (put the test where the decision is made, not only where the grant is
-- revoked) is cheaper to apply than to relearn.
create or replace function public.can_settle_refunds_for_class(p_class_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.classes c
    join public.tenant_members m on m.tenant_id = c.tenant_id
    where c.id = p_class_id
      and m.user_id = auth.uid()
      and m.member_role = 'owner'
      and m.deleted_at is null
      and c.deleted_at is null
  ) or exists (
    select 1
    from public.class_claims cc
    join public.classes c on c.id = cc.class_id
    join public.tenant_members m
      on m.tenant_id = c.tenant_id and m.user_id = cc.user_id
    where cc.class_id = p_class_id
      and cc.user_id = auth.uid()
      and cc.status = 'confirmed'
      and cc.can_refunds = true
      and cc.deleted_at is null
      and c.deleted_at is null
      and m.deleted_at is null
  );
$$;

comment on function public.can_settle_refunds_for_class(uuid) is
  'Who may answer a refund request on a class: the studio owner, or a confirmed claim holding the refunds job WHILE still a live member. A trainer without the job is not admitted.';

revoke execute on function public.can_settle_refunds_for_class(uuid) from public, anon;
grant execute on function public.can_settle_refunds_for_class(uuid) to authenticated;

-- ── decide_refund — approve, decline, reopen ──────────────────────────────────
-- One function so the legal transitions live in one place. Approving does NOT
-- move money here: it moves the row to 'pending' and hands the caller the
-- payment id, and the server action fires the real Razorpay refund (the same
-- shape cancel_booking already uses). If that call fails or no keys are
-- configured, the row stays 'pending' and visible -- ledgered, not lost.
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
    'razorpay_payment_id', v_payment.razorpay_payment_id,
    'already_attached', v_refund.razorpay_refund_id is not null
  );
end;
$$;

revoke execute on function public.decide_refund(uuid, text, text) from public, anon;
grant execute on function public.decide_refund(uuid, text, text) to authenticated;

-- ── settle_refund_offline — the money went back by hand ───────────────────────
-- The prototype's "Mark refunded". Only legal when the rail was never involved:
-- if a razorpay_refund_id is attached, Razorpay owns the outcome and the webhook
-- is what closes the row.
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
  if v_refund.razorpay_refund_id is not null then
    raise exception 'this one is with Razorpay -- its own event closes it';
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

revoke execute on function public.settle_refund_offline(uuid, text) from public, anon;
grant execute on function public.settle_refund_offline(uuid, text) to authenticated;

-- ── attach_settled_refund_reference — the settler's side of the bind ──────────
-- attach_razorpay_refund is scoped to `user_id = auth.uid()`: the LEARNER's own
-- cancel path. A studio approving somebody else's refund could never use it, so
-- the same bind exists for whoever may settle the class.
create or replace function public.attach_settled_refund_reference(
  p_refund_id uuid,
  p_razorpay_refund_id text
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
    where r.id = p_refund_id and r.razorpay_refund_id is null and r.deleted_at is null;
  if not found then
    raise exception 'refund not found or already attached';
  end if;

  select * into v_order from public.orders o where o.id = v_refund.order_id;
  if not public.can_settle_refunds_for_class(v_order.class_id) then
    raise exception 'not yours to settle';
  end if;

  update public.refunds
    set razorpay_refund_id = p_razorpay_refund_id, updated_by = v_user
    where id = v_refund.id;
end;
$$;

revoke execute on function public.attach_settled_refund_reference(uuid, text) from public, anon;
grant execute on function public.attach_settled_refund_reference(uuid, text) to authenticated;
