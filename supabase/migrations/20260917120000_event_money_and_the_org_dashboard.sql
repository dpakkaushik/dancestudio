-- ─────────────────────────────────────────────────────────────────────────────
-- EVENT MONEY THROUGH THE RAIL, AND THE ORGANIZATION'S OWN FIGURES (17 Sep 2026)
-- ⚠ Rule 9: money. Every change below is to the ledger or to who may touch it.
--
-- The user, on being told event tickets were still free: "We have Cashfree
-- test — why aren't you recording money? Make sure there is a complete workflow
-- for Cashfree test transactions; we will later change the test API with live."
-- Step 21 (28 Aug) had refused a priced ticket "until the rail has an account" —
-- but the sandbox IS the account for now, and classes and subscriptions have
-- been paying through it for weeks. The only real blocker was shape: `orders`
-- knew a class session and nothing else.
--
-- ── 1. AN ORDER MAY NAME AN EVENT ─────────────────────────────────────────────
-- `orders.class_id` / `session_id` become nullable; `event_id` and
-- `event_booking_id` arrive; one CHECK says an order is about a class session
-- OR an event booking, never both and never neither. Every existing row is a
-- class order and satisfies it.
--
-- ── 2. A SEAT THAT IS WAITING FOR MONEY ───────────────────────────────────────
-- `event_bookings.status` gains `pending_payment`. It is the event's
-- "waitlisted": a row that exists so the payment has something to land on,
-- and HOLDS NO SEAT — every count in the app already filters `status =
-- 'booked'`, so a pending row is invisible to capacity, to the register, to the
-- public figures and to "your tickets". `book_event` writes one for a priced
-- tier instead of refusing; `create_event_payment_order` opens the order
-- against it; `apply_captured_payment` — the same RPC the class webhook lands
-- on — flips it to `booked` under the EVENT lock with the tier's capacity
-- re-checked, and refunds instead of over-selling, exactly as the class
-- branch does. The webhook route does not change.
--
-- ── 3. CANCELLING A PAID TICKET IS THE CLASS RULE ─────────────────────────────
-- The user chose "same as classes": 48 h or more before the event starts, the
-- refund is automatic (`pending`, the rail pays it back); inside 48 h it is
-- `requested` and the ORGANISER decides. `cancel_event_booking` returns the
-- money side the way `cancel_class_booking_with_reason` does, so the action
-- fires the same Cashfree refund. Who settles: `can_settle_refunds_for_order`
-- — the class rule for a class order, the host's OWNER for an event order —
-- and the three settling RPCs read it instead of the class-only test, which
-- returned false for an order with no class and would have locked every event
-- refund in `requested` for ever.
--
-- ── 4. THE ORGANIZATION'S FIGURES, COMBINED AND PER STUDIO ────────────────────
-- `my_org_stats()`: one row per business the caller OWNS — its studios and its
-- event-hosting row — with classes, sessions held, seats offered and taken,
-- bookings, gross and refunded rupees, this month's gross (IST), followers,
-- events, tickets and entries. Aggregate-only, SECURITY DEFINER, scoped to
-- auth.uid(), NO argument: you can ask about your own businesses and nobody
-- else's. The org row's money IS the event money, since an event's payment is
-- keyed on the host.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. an order may name an event ────────────────────────────────────────────
alter table public.orders
  alter column class_id drop not null,
  alter column session_id drop not null,
  add column if not exists event_id uuid references public.events (id) on delete cascade,
  add column if not exists event_booking_id uuid references public.event_bookings (id) on delete set null;

alter table public.orders drop constraint if exists orders_subject_check;
alter table public.orders add constraint orders_subject_check
  check (
    (class_id is not null and session_id is not null and event_id is null and event_booking_id is null)
    or (event_id is not null and class_id is null and session_id is null)
  );

create index if not exists orders_event_id_idx on public.orders (event_id) where event_id is not null and deleted_at is null;
create index if not exists orders_event_booking_id_idx on public.orders (event_booking_id) where event_booking_id is not null;

comment on column public.orders.event_id is
  'The event this order buys a ticket or an entry to (17 Sep 2026). An order names a class session OR an event, never both — orders_subject_check.';
comment on column public.orders.event_booking_id is
  'The pending_payment event booking this order pays for; apply_captured_payment flips it to booked when the money lands.';
comment on column public.orders.class_id is
  'The class this order buys a seat in — null on an event order (17 Sep 2026).';

-- ── 2. a seat that is waiting for money ──────────────────────────────────────
alter table public.event_bookings drop constraint event_bookings_status_check;
alter table public.event_bookings add constraint event_bookings_status_check
  check (status in ('pending_payment', 'booked', 'cancelled'));
comment on column public.event_bookings.status is
  'pending_payment (a priced seat or entry waiting for its Cashfree payment — holds NO seat; every count filters booked) | booked | cancelled. 17 Sep 2026.';

-- book_event: a priced tier or entry is no longer refused — it becomes a
-- pending_payment booking the checkout pays for. Same signature, same grants.
create or replace function public.book_event(
  p_event_id uuid, p_kind text, p_ticket_tier_id uuid default null, p_qty integer default 1,
  p_format text default null, p_entrant_name text default null, p_partner_name text default null,
  p_crew_id uuid default null, p_partner_id uuid default null
)
returns public.event_bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v public.events;
  v_tier public.event_ticket_tiers;
  v_entry public.event_entry_tiers;
  v_crew public.crews;
  v_sold integer;
  v_cap integer;
  v_price integer;
  v_name text;
  v_partner_name text;
  v_row public.event_bookings;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user and p.deleted_at is null) then
    raise exception 'finish onboarding before booking';
  end if;
  select * into v from public.events e where e.id = p_event_id and e.deleted_at is null for update;
  if not found or v.status <> 'published' then
    raise exception 'this event is not open for booking';
  end if;
  if v.end_date < (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'this event is over';
  end if;
  -- R15 (9 Sep 2026): an ORGANIZATION hosts its own events and its hosting row
  -- is unlisted for ever, so "is the host listed" is the wrong question now.
  -- event_host_is_public asks the right one: a studio or artist page while it
  -- is LISTED, an organization while it is VERIFIED and not suspended.
  if not public.event_host_is_public(v.business_id) then
    raise exception 'this event is not open to the public';
  end if;
  -- the people who run it do not book it (prototype: "Studios can't book", 13273)
  if exists (select 1 from public.business_members m where m.business_id = v.business_id and m.user_id = v_user and m.deleted_at is null) then
    raise exception 'you run this event — the register is yours, not a ticket';
  end if;

  if p_kind = 'spectator' then
    if not v.tickets_on then
      raise exception 'this event sells no tickets';
    end if;
    select * into v_tier from public.event_ticket_tiers t where t.id = p_ticket_tier_id and t.event_id = v.id and t.deleted_at is null;
    if not found then
      raise exception 'that ticket tier is not on sale';
    end if;
    if p_qty is null or p_qty < 1 or p_qty > 20 then
      raise exception 'between 1 and 20 tickets at a time';
    end if;
    select coalesce(sum(b.qty), 0) into v_sold from public.event_bookings b
      where b.ticket_tier_id = v_tier.id and b.status = 'booked' and b.deleted_at is null;
    if v_sold + p_qty > v_tier.capacity then
      raise exception 'only % left in %', greatest(0, v_tier.capacity - v_sold), v_tier.name;
    end if;
    v_price := v_tier.price_inr * p_qty;
    -- A PRICED TIER IS A PENDING BOOKING (17 Sep 2026): the checkout pays for it
    -- and the capture books it. An earlier attempt on the same tier that never
    -- paid is closed first, so abandoned checkouts do not pile up.
    if v_price > 0 then
      update public.event_bookings set status = 'cancelled', cancelled_at = now(), updated_by = v_user
        where event_id = v.id and user_id = v_user and kind = 'spectator' and ticket_tier_id = v_tier.id
          and status = 'pending_payment' and deleted_at is null;
    end if;
    insert into public.event_bookings (event_id, business_id, user_id, kind, ticket_tier_id, qty, amount_inr, status, created_by, updated_by)
    values (v.id, v.business_id, v_user, 'spectator', v_tier.id, p_qty, v_price,
            case when v_price > 0 then 'pending_payment' else 'booked' end, v_user, v_user)
    returning * into v_row;
    return v_row;
  end if;

  if p_kind = 'participant' then
    -- a showcase is watched: the host builds the line-up (13245)
    if v.category = 'showcase' then
      raise exception 'a showcase is invite-only — the host builds the line-up';
    end if;
    select * into v_entry from public.event_entry_tiers t where t.event_id = v.id and t.format = p_format and t.deleted_at is null;
    if not found then
      raise exception 'this event does not take % entries', coalesce(p_format, 'that kind of');
    end if;

    -- A DUET IS TWO PEOPLE (13362-13395): the partner is a person on DanceOS,
    -- named here and asked; they cannot confirm from outside it
    if p_format = 'duo' then
      if p_partner_id is null then
        raise exception 'a duet needs your partner — pick them from DanceOS';
      end if;
      if p_partner_id = v_user then
        raise exception 'your partner is somebody else';
      end if;
      select p.full_name into v_partner_name from public.profiles p where p.id = p_partner_id and p.deleted_at is null;
      if v_partner_name is null then
        raise exception 'that partner is not on DanceOS';
      end if;
    end if;

    -- A CREW IS ENTERED BY THE PERSON WHO LEADS IT (13397-13420)
    if p_format = 'crew' then
      if p_crew_id is null then
        raise exception 'pick the crew you are entering — only its leader can put it forward';
      end if;
      select * into v_crew from public.crews c where c.id = p_crew_id and c.deleted_at is null;
      if not found then
        raise exception 'that crew no longer exists';
      end if;
      if v_crew.leader_id <> v_user then
        raise exception 'only the person who leads % can enter it', v_crew.name;
      end if;
      if exists (select 1 from public.event_bookings b where b.event_id = v.id and b.crew_id = v_crew.id
                   and b.status = 'booked' and b.deleted_at is null) then
        raise exception '% has already entered', v_crew.name;
      end if;
    end if;

    -- one entry per person per format
    if exists (select 1 from public.event_bookings b where b.event_id = v.id and b.user_id = v_user and b.kind = 'participant'
                 and b.entry_format = p_format and b.status = 'booked' and b.deleted_at is null) then
      raise exception 'you have already entered';
    end if;
    select count(*) into v_sold from public.event_bookings b
      where b.event_id = v.id and b.kind = 'participant' and b.entry_format = p_format and b.status = 'booked' and b.deleted_at is null;
    v_cap := case when v_entry.capacity = 0 then 500 else v_entry.capacity end;
    if v_sold >= v_cap then
      raise exception 'the % places are full', p_format;
    end if;
    v_name := case when p_format = 'crew' then v_crew.name
                   else nullif(trim(coalesce(p_entrant_name, '')), '') end;
    if v_entry.fee_inr > 0 then
      update public.event_bookings set status = 'cancelled', cancelled_at = now(), updated_by = v_user
        where event_id = v.id and user_id = v_user and kind = 'participant' and entry_format = p_format
          and status = 'pending_payment' and deleted_at is null;
    end if;
    insert into public.event_bookings (event_id, business_id, user_id, kind, entry_format, qty, entrant_name, partner_name, partner_id, partner_status, crew_id, amount_inr, status, created_by, updated_by)
    values (v.id, v.business_id, v_user, 'participant', p_format, 1, v_name,
            case when p_format = 'duo' then v_partner_name else nullif(trim(coalesce(p_partner_name, '')), '') end,
            case when p_format = 'duo' then p_partner_id else null end,
            case when p_format = 'duo' then 'asked' else null end,
            case when p_format = 'crew' then v_crew.id else null end,
            v_entry.fee_inr,
            case when v_entry.fee_inr > 0 then 'pending_payment' else 'booked' end,
            v_user, v_user)
    returning * into v_row;
    return v_row;
  end if;

  raise exception 'unknown booking kind';
end;
$$;
comment on function public.book_event(uuid, text, uuid, integer, text, text, text, uuid, uuid) is
  'Book a seat or enter a format. FREE books at once; PRICED (17 Sep 2026) returns a pending_payment booking that holds no seat until apply_captured_payment lands the money. Refuses a member of the host, a second entry in one format, and a host that is not public (a verified organization or a listed studio / artist page).';

-- the order a pending event booking is paid through — the mirror of create_payment_order
create or replace function public.create_event_payment_order(p_event_booking_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_b public.event_bookings;
  v public.events;
  v_sold integer;
  v_cap integer;
  v_row public.orders;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_b from public.event_bookings b
    where b.id = p_event_booking_id and b.user_id = v_user and b.deleted_at is null;
  if not found then
    raise exception 'booking not found';
  end if;
  if v_b.status <> 'pending_payment' then
    raise exception 'this booking is not waiting for a payment';
  end if;
  if v_b.amount_inr <= 0 then
    raise exception 'this booking is free — confirm it directly';
  end if;
  select * into v from public.events e where e.id = v_b.event_id and e.deleted_at is null;
  if not found or v.status <> 'published' then
    raise exception 'this event is not open for booking';
  end if;
  if v.end_date < (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'this event is over';
  end if;
  if not public.event_host_is_public(v.business_id) then
    raise exception 'this event is not open to the public';
  end if;
  -- advisory (no lock — no seat is held by an order); the capture re-checks
  -- under the event lock and refunds if the tier filled up meanwhile
  if v_b.kind = 'spectator' then
    select coalesce(sum(b.qty), 0), max(t.capacity) into v_sold, v_cap
      from public.event_ticket_tiers t
      left join public.event_bookings b on b.ticket_tier_id = t.id and b.status = 'booked' and b.deleted_at is null
      where t.id = v_b.ticket_tier_id and t.deleted_at is null
      group by t.id;
    if v_cap is null then
      raise exception 'that ticket tier is not on sale';
    end if;
    if v_sold + v_b.qty > v_cap then
      raise exception 'only % left in that tier', greatest(0, v_cap - v_sold);
    end if;
  end if;

  insert into public.orders (business_id, user_id, event_id, event_booking_id, amount_inr)
  values (v.business_id, v_user, v.id, v_b.id, v_b.amount_inr)
  returning * into v_row;
  return v_row;
end;
$$;
comment on function public.create_event_payment_order(uuid) is
  'Open the order a pending_payment event booking is paid through (17 Sep 2026). The amount is the booking''s — the tier''s price at booking — never the client''s. No seat is held by an order; the capture re-checks the tier.';
revoke execute on function public.create_event_payment_order(uuid) from public, anon;
grant execute on function public.create_event_payment_order(uuid) to authenticated;

-- apply_captured_payment: the event branch. Same signature, same grants
-- (service role only). The class branch is untouched.
create or replace function public.apply_captured_payment(p_provider_order_id text, p_provider_payment_id text, p_amount_paise bigint, p_method text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_payment public.payments;
  v_class public.classes;
  v_existing public.class_bookings;
  v_class_booking_id uuid;
  v_taken integer;
  v_refund public.refunds;
  v_amount_inr integer := (p_amount_paise / 100)::integer;
  -- the event branch (17 Sep 2026)
  v_event public.events;
  v_eb public.event_bookings;
  v_tier public.event_ticket_tiers;
  v_entry public.event_entry_tiers;
  v_sold integer;
  v_cap integer;
  v_why text;
begin
  select * into v_order from public.orders
    where provider_order_id = p_provider_order_id and deleted_at is null;
  if not found then
    -- not ours (another product on the same account) — acknowledge and move on
    return jsonb_build_object('outcome', 'ignored', 'reason', 'unknown order');
  end if;

  -- ═══ AN EVENT ORDER ═══════════════════════════════════════════════════════
  if v_order.event_id is not null then
    -- canonical lock order: the event first, then the order row
    select * into v_event from public.events e where e.id = v_order.event_id for update;
    select * into v_order from public.orders where id = v_order.id for update;

    select * into v_payment from public.payments
      where provider_payment_id = p_provider_payment_id;
    if found then
      return jsonb_build_object('outcome', 'duplicate', 'order_status', v_order.status);
    end if;

    insert into public.payments (order_id, business_id, user_id, provider, provider_payment_id,
                                 amount_inr, method, status, created_by, updated_by)
    values (v_order.id, v_order.business_id, v_order.user_id, v_order.provider, p_provider_payment_id,
            v_amount_inr, p_method, 'captured', v_order.user_id, v_order.user_id)
    returning * into v_payment;

    select * into v_eb from public.event_bookings b where b.id = v_order.event_booking_id for update;

    -- the reasons money cannot become a seat, each ledgered as a refund
    v_why := null;
    if v_order.status <> 'created' then
      v_why := 'payment landed on a closed order';
    elsif p_amount_paise <> v_order.amount_inr::bigint * 100 then
      v_why := 'amount did not match the order';
    elsif v_eb.id is null or v_eb.deleted_at is not null then
      v_why := 'the booking no longer exists';
    elsif v_eb.status = 'booked' then
      v_why := 'already booked';
    elsif v_eb.status = 'cancelled' then
      v_why := 'the booking was cancelled before the payment landed';
    elsif v_event.status <> 'published' or v_event.deleted_at is not null
          or v_event.end_date < (now() at time zone 'Asia/Kolkata')::date then
      v_why := 'the event closed before the payment landed';
    elsif v_eb.kind = 'spectator' then
      select * into v_tier from public.event_ticket_tiers t where t.id = v_eb.ticket_tier_id and t.deleted_at is null;
      select coalesce(sum(b.qty), 0) into v_sold from public.event_bookings b
        where b.ticket_tier_id = v_eb.ticket_tier_id and b.status = 'booked' and b.deleted_at is null;
      if v_tier.id is null then
        v_why := 'that ticket tier is no longer on sale';
      elsif v_sold + v_eb.qty > v_tier.capacity then
        v_why := 'the tier filled up before the payment landed';
      end if;
    else
      select * into v_entry from public.event_entry_tiers t where t.event_id = v_event.id and t.format = v_eb.entry_format and t.deleted_at is null;
      select count(*) into v_sold from public.event_bookings b
        where b.event_id = v_event.id and b.kind = 'participant' and b.entry_format = v_eb.entry_format
          and b.status = 'booked' and b.deleted_at is null;
      v_cap := case when coalesce(v_entry.capacity, 0) = 0 then 500 else v_entry.capacity end;
      if v_entry.id is null then
        v_why := 'that format is no longer open';
      elsif v_sold >= v_cap then
        v_why := 'the places filled up before the payment landed';
      elsif exists (select 1 from public.event_bookings b where b.event_id = v_event.id and b.user_id = v_eb.user_id
                      and b.kind = 'participant' and b.entry_format = v_eb.entry_format and b.status = 'booked' and b.deleted_at is null) then
        v_why := 'already entered';
      elsif v_eb.crew_id is not null and exists (select 1 from public.event_bookings b where b.event_id = v_event.id
                      and b.crew_id = v_eb.crew_id and b.status = 'booked' and b.deleted_at is null) then
        v_why := 'that crew has already entered';
      end if;
    end if;

    if v_why is not null then
      insert into public.refunds (payment_id, order_id, business_id, user_id, provider, amount_inr,
                                  reason, status, created_by, updated_by)
      values (v_payment.id, v_order.id, v_order.business_id, v_order.user_id, v_order.provider, v_amount_inr,
              v_why, 'pending', v_order.user_id, v_order.user_id)
      returning * into v_refund;
      update public.orders set status = 'refund_pending', updated_by = v_order.user_id
        where id = v_order.id;
      return jsonb_build_object('outcome', 'refund_pending',
        'refund_id', v_refund.id, 'provider_payment_id', p_provider_payment_id);
    end if;

    update public.event_bookings set status = 'booked', updated_by = v_order.user_id
      where id = v_eb.id;
    update public.orders set status = 'paid', updated_by = v_order.user_id
      where id = v_order.id;
    return jsonb_build_object('outcome', 'enrolled', 'kind', 'event', 'event_booking_id', v_eb.id);
  end if;

  -- ═══ A CLASS ORDER (Step 9, unchanged) ════════════════════════════════════
  -- canonical lock order: class first, then the order row
  select * into v_class from public.classes c where c.id = v_order.class_id for update;
  select * into v_order from public.orders where id = v_order.id for update;

  select * into v_payment from public.payments
    where provider_payment_id = p_provider_payment_id;
  if found then
    return jsonb_build_object('outcome', 'duplicate', 'order_status', v_order.status);
  end if;

  insert into public.payments (order_id, business_id, user_id, provider, provider_payment_id,
                               amount_inr, method, status, created_by, updated_by)
  values (v_order.id, v_order.business_id, v_order.user_id, v_order.provider, p_provider_payment_id,
          v_amount_inr, p_method, 'captured', v_order.user_id, v_order.user_id)
  returning * into v_payment;

  -- money arrived for a closed order, or the wrong amount arrived: never grant
  -- a seat off it — ledger a refund and flag the order
  if v_order.status <> 'created' or p_amount_paise <> v_order.amount_inr::bigint * 100 then
    insert into public.refunds (payment_id, order_id, business_id, user_id, provider, amount_inr,
                                reason, status, created_by, updated_by)
    values (v_payment.id, v_order.id, v_order.business_id, v_order.user_id, v_order.provider, v_amount_inr,
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
  select * into v_existing from public.class_bookings e
    where e.session_id = v_order.session_id and e.user_id = v_order.user_id
      and e.status in ('enrolled', 'waitlisted') and e.deleted_at is null;

  if found and v_existing.status = 'enrolled' then
    insert into public.refunds (payment_id, order_id, business_id, user_id, provider, amount_inr,
                                reason, status, created_by, updated_by)
    values (v_payment.id, v_order.id, v_order.business_id, v_order.user_id, v_order.provider, v_amount_inr,
            'already enrolled in this session', 'pending', v_order.user_id, v_order.user_id)
    returning * into v_refund;
    update public.orders set status = 'refund_pending', updated_by = v_order.user_id
      where id = v_order.id;
    return jsonb_build_object('outcome', 'refund_pending',
      'refund_id', v_refund.id, 'provider_payment_id', p_provider_payment_id);
  end if;

  select count(*) into v_taken from public.class_bookings e
    where e.session_id = v_order.session_id and e.status = 'enrolled' and e.deleted_at is null;

  if v_taken >= v_class.capacity then
    -- the class filled up between checkout opening and the money landing
    insert into public.refunds (payment_id, order_id, business_id, user_id, provider, amount_inr,
                                reason, status, created_by, updated_by)
    values (v_payment.id, v_order.id, v_order.business_id, v_order.user_id, v_order.provider, v_amount_inr,
            'class filled up before the payment landed', 'pending', v_order.user_id, v_order.user_id)
    returning * into v_refund;
    update public.orders set status = 'refund_pending', updated_by = v_order.user_id
      where id = v_order.id;
    return jsonb_build_object('outcome', 'refund_pending',
      'refund_id', v_refund.id, 'provider_payment_id', p_provider_payment_id);
  end if;

  if v_existing.id is not null then
    update public.class_bookings set status = 'enrolled', updated_by = v_order.user_id
      where id = v_existing.id;
    v_class_booking_id := v_existing.id;
  else
    insert into public.class_bookings (session_id, class_id, business_id, user_id, status,
                                    created_by, updated_by)
    values (v_order.session_id, v_order.class_id, v_order.business_id, v_order.user_id,
            'enrolled', v_order.user_id, v_order.user_id)
    returning id into v_class_booking_id;
  end if;

  update public.orders
    set status = 'paid', class_booking_id = v_class_booking_id, updated_by = v_order.user_id
    where id = v_order.id;

  return jsonb_build_object('outcome', 'enrolled', 'class_booking_id', v_class_booking_id);
end;
$$;
comment on function public.apply_captured_payment(text, text, bigint, text) is
  'Service role only — the webhook and the server-side confirm land here. Idempotent on the provider payment id. A class order books the seat under the class lock; an event order (17 Sep 2026) flips the pending_payment booking to booked under the event lock. Money that cannot become a seat is ledgered as a pending refund, never a seat.';

-- ── 3. cancelling a paid ticket is the class rule ────────────────────────────
-- Returns the money side now (it returned nothing), so the signature changes:
-- dropped and re-created, grants re-stated.
drop function if exists public.cancel_event_booking(uuid);
create function public.cancel_event_booking(p_booking_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  b public.event_bookings;
  v public.events;
  v_order public.orders;
  v_payment public.payments;
  v_refund public.refunds;
  v_starts timestamptz;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into b from public.event_bookings x where x.id = p_booking_id and x.deleted_at is null for update;
  if not found or b.user_id <> v_user then
    raise exception 'booking not found';
  end if;
  if b.status = 'cancelled' then
    return jsonb_build_object('status', 'cancelled', 'refund', null);
  end if;
  select * into v from public.events e where e.id = b.event_id;
  -- a booking still waiting for its money is simply closed; nothing was taken
  if b.status = 'pending_payment' then
    update public.event_bookings set status = 'cancelled', cancelled_at = now(), updated_by = v_user where id = b.id;
    return jsonb_build_object('status', 'cancelled', 'refund', null);
  end if;
  if v.end_date < (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'this event is over';
  end if;
  update public.event_bookings set status = 'cancelled', cancelled_at = now(), updated_by = v_user where id = b.id;

  -- the money side: only when this seat was actually paid for
  select * into v_order from public.orders o
    where o.event_booking_id = b.id and o.status = 'paid' and o.deleted_at is null
    order by o.created_at desc limit 1;
  if found then
    select * into v_payment from public.payments p
      where p.order_id = v_order.id and p.status = 'captured' and p.deleted_at is null
      order by p.created_at desc limit 1;
  end if;
  if v_payment.id is null then
    return jsonb_build_object('status', 'cancelled', 'refund', null);
  end if;

  -- THE 48-HOUR RULE, the class one (the user's choice, 17 Sep 2026): measured
  -- to the moment the event starts, in India
  v_starts := (v.start_date + v.start_time) at time zone 'Asia/Kolkata';
  insert into public.refunds (payment_id, order_id, business_id, user_id, provider, amount_inr,
                              reason, status, created_by, updated_by)
  values (v_payment.id, v_order.id, v_order.business_id, v_user, v_order.provider, v_payment.amount_inr,
          p_reason,
          case when v_starts - now() >= interval '48 hours' then 'pending' else 'requested' end,
          v_user, v_user)
  returning * into v_refund;
  if v_refund.status = 'pending' then
    update public.orders set status = 'refund_pending', updated_by = v_user where id = v_order.id;
  end if;
  return jsonb_build_object('status', 'cancelled', 'refund', jsonb_build_object(
    'id', v_refund.id, 'status', v_refund.status, 'amount_inr', v_refund.amount_inr,
    'provider', v_order.provider,
    'provider_order_id', v_order.provider_order_id,
    'provider_payment_id', v_payment.provider_payment_id));
end;
$$;
comment on function public.cancel_event_booking(uuid, text) is
  'Cancel your own ticket or entry; the seat goes back on sale by arithmetic. A PAID one files a refund by the class rule (17 Sep 2026): 48 h or more before the event starts it is automatic (pending), inside that the organiser decides (requested). Returns the money side so the action can fire the rail.';
revoke execute on function public.cancel_event_booking(uuid, text) from public, anon;
grant execute on function public.cancel_event_booking(uuid, text) to authenticated;

-- who settles a refund on THIS order: the class rule for a class order, the
-- host's owner for an event order
create or replace function public.can_settle_refunds_for_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when o.class_id is not null then public.can_settle_refunds_for_class(o.class_id)
    else exists (
      select 1 from public.business_members m
       where m.business_id = o.business_id and m.user_id = auth.uid()
         and m.member_role = 'owner' and m.deleted_at is null
    )
  end
  from public.orders o
  where o.id = p_order_id;
$$;
comment on function public.can_settle_refunds_for_order(uuid) is
  'Who may answer a refund on an order (17 Sep 2026): a class order follows can_settle_refunds_for_class; an event order is the HOST''s owner''s — the organization that put the event on.';
revoke execute on function public.can_settle_refunds_for_order(uuid) from public, anon;
grant execute on function public.can_settle_refunds_for_order(uuid) to authenticated;

create or replace function public.decide_refund(p_refund_id uuid, p_decision text, p_note text default null)
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
  if not public.can_settle_refunds_for_order(v_order.id) then
    raise exception 'only the owner, or somebody holding refunds on this class, settles it';
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

  update public.orders
    set status = 'refunded', updated_by = v_user
    where id = v_refund.order_id and status <> 'refunded';

  return v_refund;
end;
$$;

create or replace function public.attach_settled_refund_reference(p_refund_id uuid, p_provider_refund_id text)
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
  if not public.can_settle_refunds_for_order(v_order.id) then
    raise exception 'not yours to settle';
  end if;

  update public.refunds
    set provider_refund_id = p_provider_refund_id, updated_by = v_user
    where id = v_refund.id;
end;
$$;

-- the notifications name the event, and the organiser hears about a BOOKED
-- seat — not about money that has not arrived yet
create or replace function public.notify_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class public.classes;
  v_event public.events;
  v_who text;
  v_what text;
  v_biz_href text;
begin
  select c.* into v_class from public.classes c
    join public.orders o on o.class_id = c.id where o.id = new.order_id;
  select e.* into v_event from public.events e
    join public.orders o on o.event_id = e.id where o.id = new.order_id;
  select p.full_name into v_who from public.profiles p where p.id = new.user_id;
  v_what := coalesce(v_class.title, v_event.title, 'A booking');
  v_biz_href := case when v_event.id is not null
                     then '/business/' || new.business_id::text || '/events/' || v_event.id::text
                     else '/c/' || coalesce(v_class.share_slug, '') end;

  if tg_op = 'INSERT' then
    if new.status = 'requested' then
      -- inside the policy window: the business decides, so the business is told
      perform public.notify_business_owners(new.business_id, 'money',
        coalesce(v_who, 'Somebody') || ' asked for a refund — ₹' || new.amount_inr::text,
        v_what || ' · your call, inside the policy window.',
        v_biz_href);
    elsif new.status = 'pending' then
      -- outside it: the policy already decided, and the payer hears that
      perform public.notify(new.user_id, 'money',
        'Refund on its way — ₹' || new.amount_inr::text,
        v_what || ' · cancelled outside the policy window, so it goes back automatically.',
        '/my-classes');
      perform public.notify_business_owners(new.business_id, 'money',
        coalesce(v_who, 'Somebody') || ' cancelled — ₹' || new.amount_inr::text || ' refunding',
        v_what || ' · automatic, outside the policy window.',
        v_biz_href);
    end if;
  elsif tg_op = 'UPDATE' and old.status <> new.status and new.status in ('pending', 'processed', 'declined') then
    perform public.notify(new.user_id, 'money',
      case new.status
        when 'declined' then 'Refund declined — ₹' || new.amount_inr::text
        when 'processed' then 'Refund paid — ₹' || new.amount_inr::text
        else 'Refund approved — ₹' || new.amount_inr::text end,
      v_what || case new.status when 'pending' then ' · on its way back to you.' else '' end,
      '/my-classes');
  end if;
  return null;
end;
$$;

create or replace function public.notify_event_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_who text;
  v_booked_now boolean;
begin
  select * into v_event from public.events e where e.id = new.event_id;
  select p.full_name into v_who from public.profiles p where p.id = new.user_id;

  -- a seat is announced when it is BOOKED: at insert for a free one, at the
  -- capture for a priced one (pending_payment → booked). Money that has not
  -- landed is not a booking anybody needs to hear about.
  v_booked_now := (tg_op = 'INSERT' and new.status = 'booked')
               or (tg_op = 'UPDATE' and old.status = 'pending_payment' and new.status = 'booked');

  if v_booked_now then
    perform public.notify_business_owners(new.business_id, 'event',
      case new.kind
        when 'spectator' then coalesce(v_who, 'Somebody') || ' booked ' || new.qty::text || (case when new.qty = 1 then ' ticket — ' else ' tickets — ' end) || coalesce(v_event.title, 'your event')
                              || case when new.amount_inr > 0 then ' · ₹' || new.amount_inr::text else '' end
        else coalesce(new.entrant_name, v_who, 'Somebody') || ' entered ' || coalesce(v_event.title, 'your event')
             || case when new.amount_inr > 0 then ' · ₹' || new.amount_inr::text else '' end end,
      null, '/business/' || new.business_id::text || '/events/' || new.event_id::text);
    -- the duet partner is asked, and the entry stands either way (Step 22)
    if new.partner_id is not null and new.partner_status = 'asked' then
      perform public.notify(new.partner_id, 'event',
        coalesce(v_who, 'Somebody') || ' entered ' || coalesce(v_event.title, 'an event') || ' with you',
        'Their entry holds either way — this decides whether the organiser sees you as confirmed.', '/inbox');
    end if;
  elsif tg_op = 'UPDATE' and coalesce(old.partner_status, '') = 'asked' and new.partner_status in ('confirmed', 'rejected') then
    select p.full_name into v_who from public.profiles p where p.id = new.partner_id;
    perform public.notify(new.user_id, 'event',
      coalesce(v_who, 'Your partner') || (case new.partner_status when 'confirmed' then ' confirmed your duet' else ' cannot dance the duet' end),
      coalesce(v_event.title, 'The event') || case new.partner_status when 'rejected' then ' — find another partner.' else '' end,
      '/e/' || coalesce(v_event.share_slug, ''));
  end if;
  return null;
end;
$$;
drop trigger if exists notify_event_booking on public.event_bookings;
create trigger notify_event_booking
  after insert or update of partner_status, status on public.event_bookings
  for each row execute function public.notify_event_booking();

-- ── 4. the organization's figures ────────────────────────────────────────────
create or replace function public.my_org_stats()
returns table (
  business_id uuid, name text, type text, visibility text, verified_at timestamptz,
  classes integer, sessions_held integer, seats_offered integer, seats_taken integer,
  bookings integer, gross_inr bigint, refunded_inr bigint, month_gross_inr bigint,
  followers integer, events integer, tickets_sold integer, entries integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select b.id, b.name, b.type, b.visibility, b.verified_at, b.created_at
      from public.business_members m
      join public.businesses b on b.id = m.business_id
     where m.user_id = auth.uid() and m.member_role = 'owner' and m.deleted_at is null
       and b.deleted_at is null
  ),
  ist_month as (
    -- the instant this IST calendar month began
    select (date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata') as t
  )
  select
    mine.id, mine.name, mine.type, mine.visibility, mine.verified_at,
    (select count(*) from public.classes c
      where c.business_id = mine.id and c.deleted_at is null)::integer,
    (select count(*) from public.class_sessions s join public.classes c on c.id = s.class_id
      where s.business_id = mine.id and s.deleted_at is null and c.deleted_at is null
        and c.status <> 'draft' and s.ends_at < now())::integer,
    (select coalesce(sum(c.capacity), 0) from public.class_sessions s join public.classes c on c.id = s.class_id
      where s.business_id = mine.id and s.deleted_at is null and c.deleted_at is null
        and c.status <> 'draft' and s.ends_at < now())::integer,
    (select count(*) from public.class_bookings k join public.class_sessions s on s.id = k.session_id
      where k.business_id = mine.id and k.status = 'enrolled' and k.deleted_at is null and s.ends_at < now())::integer,
    (select count(*) from public.class_bookings k
      where k.business_id = mine.id and k.status = 'enrolled' and k.deleted_at is null)::integer,
    -- gross = what came in (a refunded payment still came in; the refund is its own line)
    (select coalesce(sum(p.amount_inr), 0) from public.payments p
      where p.business_id = mine.id and p.kind = 'order' and p.status in ('captured', 'refunded') and p.deleted_at is null)::bigint,
    (select coalesce(sum(r.amount_inr), 0) from public.refunds r
      where r.business_id = mine.id and r.status = 'processed' and r.deleted_at is null)::bigint,
    (select coalesce(sum(p.amount_inr), 0) from public.payments p, ist_month
      where p.business_id = mine.id and p.kind = 'order' and p.status in ('captured', 'refunded') and p.deleted_at is null
        and p.created_at >= ist_month.t)::bigint,
    (select count(*) from public.follows f where f.business_id = mine.id and f.deleted_at is null)::integer,
    (select count(*) from public.events e where e.business_id = mine.id and e.deleted_at is null)::integer,
    (select coalesce(sum(b.qty), 0) from public.event_bookings b
      where b.business_id = mine.id and b.kind = 'spectator' and b.status = 'booked' and b.deleted_at is null)::integer,
    (select count(*) from public.event_bookings b
      where b.business_id = mine.id and b.kind = 'participant' and b.status = 'booked' and b.deleted_at is null)::integer
  from mine
  order by case mine.type when 'studio' then 0 when 'artist_page' then 1 else 2 end, mine.created_at;
$$;
comment on function public.my_org_stats() is
  'The caller''s own businesses, one row each, with the figures an organization''s dashboard prints — classes, sessions held, seats offered/taken, bookings, gross and refunded rupees, this IST month''s gross, followers, events, tickets, entries (17 Sep 2026). Aggregate-only and scoped to auth.uid(); there is no argument, so nobody can ask about another organization. The org hosting row''s money is the event money.';
revoke execute on function public.my_org_stats() from public, anon;
grant execute on function public.my_org_stats() to authenticated;

-- ── the guard: the shapes this file promised ─────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_subject_check' and conrelid = 'public.orders'::regclass) then
    raise exception 'orders_subject_check is missing';
  end if;
  if exists (select 1 from public.orders where class_id is not null and event_id is not null) then
    raise exception 'an order names both a class and an event';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'cancel_event_booking' and p.pronargs = 2) then
    raise exception 'cancel_event_booking(uuid, text) is missing';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              where n.nspname = 'public' and p.proname in ('create_event_payment_order', 'cancel_event_booking', 'can_settle_refunds_for_order', 'my_org_stats')
                and a.grantee in (0, (select oid from pg_roles where rolname = 'anon'))) then
    raise exception 'a new authenticated-only function is executable by anon or public';
  end if;
  raise notice 'event money: orders may name an event, a priced booking waits for its payment, refunds follow the class rule, my_org_stats() answers the owner';
end $$;

notify pgrst, 'reload schema';
