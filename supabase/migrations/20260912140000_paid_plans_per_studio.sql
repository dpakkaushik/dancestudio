-- SUBSCRIPTIONS, THE WAY REAL APPS DO THEM (10 Sep 2026, the user's decisions)
-- ⚠ Rule 9: money + auth + RLS.
--
-- The user's words: "two pro subscriptions — one for an org (₹1,200, per
-- studio: two studios need two subscriptions, each linked to a studio) and one
-- for a user upgrading to an artist (₹700). Link the gateway. Keep the amounts
-- dynamic — admin changes them in the admin console. Make sure this follows the
-- standard approach, how it is dealt with in real apps."
--
-- THE STANDARD, and what it means here:
--
--   * A subscription is a RECURRING MANDATE, not a prepaid month. The customer
--     authorises once (UPI AutoPay / a tokenised card) through Cashfree
--     Subscriptions; the authorisation TAKES THE FIRST PERIOD'S FEE, and every
--     later period is charged automatically with the pre-debit notice the RBI
--     requires. Nobody has to remember to pay.
--   * ONE ROW IS THE TRUTH about a subscription: `subscriptions` — its status,
--     the current period, whether it renews, what the provider says. Stripe
--     calls this object the same thing. Charges are rows in `payments` that
--     point at it; that is the billing history.
--   * STATUS is a small machine: pending_auth → active → (past_due) → expired,
--     with `cancel_at_period_end` for "stop renewing, keep what I paid for".
--     A failed renewal does not cut access on the day: three days of grace,
--     the provider retries, the owner is told. Cancelling keeps access to the
--     end of the period already paid for — the opposite of the "End now" that
--     used to lock the tools the moment it was pressed.
--   * PRICES are rows an admin edits (`plan_catalog`). A change applies to the
--     NEXT subscriber; whoever already subscribed keeps the price they agreed
--     to — Cashfree plans carry a fixed amount, so a new price is a new
--     provider plan, and existing mandates stay on the old one.
--   * PER STUDIO. An organization's studios are subscribed one by one: a studio
--     is created by any verified organization and is born UNLISTED; it goes on
--     Discover the moment its own subscription is authorised. A payment needs a
--     studio id to attach to, which is why the studio exists first.
--   * COMPING IS STILL A DECISION. An admin can grant a period for free; the row
--     says `granted` and `price_inr = 0`, it is audited, and it simply does not
--     renew — the owner is reminded before it ends.
--
-- What is UNTOUCHED: the class-booking rail (`orders`, `apply_captured_payment`)
-- — a subscription charge is not an order and does not pretend to be one. And a
-- plan payment is NEVER a studio's income: its payments row carries no tenant.

-- ── 1. the price list ───────────────────────────────────────────────────────
create table public.plan_catalog (
  key text primary key check (key ~ '^[a-z_]{3,40}$'),
  kind text not null check (kind in ('artist', 'studio')),
  period text not null check (period in ('monthly', 'yearly')),
  label text not null check (char_length(label) between 1 and 80),
  price_inr integer not null check (price_inr >= 0 and price_inr <= 1000000),
  active boolean not null default true,
  sort integer not null default 0,
  -- the Cashfree plan that carries THIS price; a price change makes a new one
  provider_plan_id text,
  provider_plan_price_inr integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
  updated_by uuid not null default coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
  deleted_at timestamptz
);
comment on table public.plan_catalog is
  'What a plan costs, as rows an admin edits (10 Sep 2026). Screens print these; a new subscription is priced from them and keeps that price. provider_plan_id is the Cashfree plan carrying the current price — a price change creates a new one, and existing mandates stay on theirs.';

create trigger plan_catalog_set_updated_at
  before update on public.plan_catalog
  for each row execute function public.set_updated_at();

alter table public.plan_catalog enable row level security;
create policy "signed-in read the price list" on public.plan_catalog
  for select to authenticated using (deleted_at is null);

insert into public.plan_catalog (key, kind, period, label, price_inr, sort)
values
  ('artist_monthly', 'artist', 'monthly', 'DanceOS Pro · Artist', 700, 10),
  ('studio_monthly', 'studio', 'monthly', 'DanceOS Pro · Studio', 1200, 20);

create or replace function public.plan_months(p_period text)
returns integer
language sql
immutable
as $$ select case when p_period = 'yearly' then 12 else 1 end; $$;

-- ── 2. the subscription ─────────────────────────────────────────────────────
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('artist', 'studio')),
  -- the payer: the person for an artist plan, the owning organization for a studio's
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- the studio, for kind = 'studio'
  tenant_id uuid references public.tenants (id) on delete cascade,
  plan_key text not null references public.plan_catalog (key),
  -- the price THIS subscription renews at — set when it starts, never rewritten
  price_inr integer not null check (price_inr >= 0),
  period text not null check (period in ('monthly', 'yearly')),
  status text not null default 'pending_auth'
    check (status in ('pending_auth', 'active', 'past_due', 'canceled', 'expired')),
  current_period_start date,
  current_period_end date,
  -- "stop renewing, keep what I paid for": access runs to current_period_end
  cancel_at_period_end boolean not null default false,
  -- an admin's comp: no mandate, no renewal, reminded before it ends
  granted boolean not null default false,
  granted_by uuid references auth.users (id),
  note text check (note is null or char_length(note) <= 300),
  -- the provider's side
  provider text not null default 'cashfree' check (provider in ('cashfree')),
  provider_subscription_id text,
  cf_subscription_id text,
  provider_plan_id text,
  provider_status text,
  auth_status text,
  next_charge_on date,
  last_payment_at timestamptz,
  failure_reason text,
  attempt integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
  updated_by uuid not null default coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
  deleted_at timestamptz,
  constraint subscriptions_subject_check check (
       (kind = 'artist' and tenant_id is null)
    or (kind = 'studio' and tenant_id is not null)
  )
);
comment on table public.subscriptions is
  'ONE row per subscription and the truth about it (10 Sep 2026): status machine pending_auth → active → past_due → expired, cancel_at_period_end, the current period, the price it renews at, the Cashfree mandate. An artist plan is a user''s; a studio''s is its organization''s and names the studio.';

-- one live subscription per subject
create unique index subscriptions_one_live_artist
  on public.subscriptions (user_id) where kind = 'artist' and status <> 'expired' and deleted_at is null;
create unique index subscriptions_one_live_studio
  on public.subscriptions (tenant_id) where kind = 'studio' and status <> 'expired' and deleted_at is null;
create unique index subscriptions_provider_idx
  on public.subscriptions (provider_subscription_id) where provider_subscription_id is not null;
create index subscriptions_cf_idx on public.subscriptions (cf_subscription_id) where cf_subscription_id is not null;
create index subscriptions_user_idx on public.subscriptions (user_id) where deleted_at is null;

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create or replace function public.guard_subscription_subject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'studio' and not exists (
    select 1 from public.tenants t where t.id = new.tenant_id and t.type = 'studio' and t.deleted_at is null
  ) then
    raise exception 'a studio subscription belongs to a studio';
  end if;
  if new.kind = 'artist' and not exists (
    select 1 from public.profiles p where p.id = new.user_id and p.role = 'user' and p.deleted_at is null
  ) then
    raise exception 'the Artist plan is a person''s';
  end if;
  return new;
end;
$$;
create trigger subscriptions_subject
  before insert or update of kind, user_id, tenant_id on public.subscriptions
  for each row execute function public.guard_subscription_subject();

alter table public.subscriptions enable row level security;
create policy "people read their own subscriptions" on public.subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy "admins read every subscription" on public.subscriptions
  for select to authenticated using (public.is_platform_admin());
-- no insert/update/delete policies: the functions below are the only doors

/** Does this subscription grant access RIGHT NOW? Paid through the current
 *  period, with three days of grace while a renewal is being retried. */
create or replace function public.subscription_has_access(s public.subscriptions)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select s.deleted_at is null
     and s.status in ('active', 'past_due', 'canceled')
     and s.current_period_end is not null
     and (s.current_period_end + case when s.status = 'past_due' then 3 else 0 end) >= (now() at time zone 'Asia/Kolkata')::date;
$$;

create or replace function public.studio_plan_active(p_tenant_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (select 1 from public.subscriptions s
                  where s.kind = 'studio' and s.tenant_id = p_tenant_id and public.subscription_has_access(s));
$$;
comment on function public.studio_plan_active(uuid) is
  'True while THIS studio''s subscription grants access. With the owner''s tick, the whole of what lets a studio be public.';
revoke execute on function public.studio_plan_active(uuid) from public;
grant execute on function public.studio_plan_active(uuid) to anon, authenticated;

create or replace function public.artist_plan_active(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (select 1 from public.subscriptions s
                  where s.kind = 'artist' and s.user_id = p_user_id and public.subscription_has_access(s));
$$;
revoke execute on function public.artist_plan_active(uuid) from public;
grant execute on function public.artist_plan_active(uuid) to anon, authenticated;

-- ── 3. what exists today becomes subscriptions ──────────────────────────────
-- Live artist plans (all granted at ₹0 — the pilot) become granted, active
-- subscriptions ending on the same date. Live org_plans (yesterday's
-- organization-wide grants) become one granted studio subscription per studio
-- the organization owns. Nothing anybody has today is shortened.
insert into public.subscriptions (kind, user_id, tenant_id, plan_key, price_inr, period, status,
                                  current_period_start, current_period_end, granted, note, created_by, updated_by)
select 'artist', a.user_id, null, 'artist_monthly', 0, a.plan, 'active',
       a.started_on, a.until, true,
       'Carried over from the pilot''s free artist plan (10 Sep 2026)',
       a.user_id, a.user_id
from public.artist_plans a
join public.profiles p on p.id = a.user_id and p.role = 'user' and p.deleted_at is null
where a.deleted_at is null and a.ended_at is null
  and a.until >= (now() at time zone 'Asia/Kolkata')::date
  and a.id = (select a2.id from public.artist_plans a2
               where a2.user_id = a.user_id and a2.deleted_at is null and a2.ended_at is null
               order by a2.until desc limit 1);

insert into public.subscriptions (kind, user_id, tenant_id, plan_key, price_inr, period, status,
                                  current_period_start, current_period_end, granted, granted_by, note, created_by, updated_by)
select 'studio', o.org_id, t.id, 'studio_monthly', 0, 'monthly', 'active',
       o.started_on, o.until, true, o.granted_by,
       coalesce(o.note, 'Carried over from the organization-wide grant (10 Sep 2026)'),
       o.org_id, o.org_id
from public.org_plans o
join public.tenant_members m on m.user_id = o.org_id and m.member_role = 'owner' and m.deleted_at is null
join public.tenants t on t.id = m.tenant_id and t.type = 'studio' and t.deleted_at is null
where o.deleted_at is null and o.ended_at is null
  and o.until >= (now() at time zone 'Asia/Kolkata')::date;

drop function if exists public.admin_grant_org_subscription(uuid, integer, text);
drop function if exists public.admin_end_org_subscription(uuid, text);
drop function if exists public.admin_org_standing(uuid[]);
drop function if exists public.org_subscription_active(uuid);
drop table public.org_plans;

-- artist_plans is HISTORY from here: nothing writes it any more, every reader
-- below reads subscriptions. Kept so nothing that references it breaks.
comment on table public.artist_plans is
  'The pilot''s free artist-plan periods, kept as history (10 Sep 2026). Nothing writes here any more: the Artist plan is a row in subscriptions, paid through Cashfree or granted by an admin.';

-- ── 4. subscription charges are payments, not orders ────────────────────────
alter table public.payments alter column order_id drop not null;
alter table public.payments alter column tenant_id drop not null;
alter table public.payments
  add column subscription_id uuid references public.subscriptions (id) on delete set null,
  add column kind text not null default 'order' check (kind in ('order', 'subscription_auth', 'subscription_charge'));
alter table public.payments add constraint payments_subject_check check (
     (kind = 'order' and order_id is not null and subscription_id is null)
  or (kind <> 'order' and order_id is null and subscription_id is not null)
);
comment on column public.payments.kind is
  'order: a class seat (the original rail). subscription_auth: the mandate authorisation that also pays the first period. subscription_charge: a renewal (10 Sep 2026). Subscription payments carry no tenant — they are DanceOS''s revenue, never a studio''s income.';
alter table public.refunds alter column tenant_id drop not null;

-- ── 5. starting a subscription: the row first, the mandate second ───────────
/** Open (or reopen) the subscription row for a plan. The server then creates
 *  the Cashfree subscription against it and the customer authorises in the
 *  checkout; nothing is active until the provider says the mandate is. */
create or replace function public.subscribe(p_plan_key text, p_tenant_id uuid default null)
returns public.subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_verified timestamptz;
  v_plan public.plan_catalog;
  v_row public.subscriptions;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select p.role, p.verified_at into v_role, v_verified
    from public.profiles p where p.id = v_user and p.deleted_at is null;
  if not found then raise exception 'finish onboarding first'; end if;
  if exists (select 1 from public.profiles p where p.id = v_user and p.suspended_at is not null) then
    raise exception 'this account is suspended — write to DanceOS from your hub';
  end if;
  select * into v_plan from public.plan_catalog c where c.key = p_plan_key and c.active and c.deleted_at is null;
  if not found then raise exception 'that plan is not on offer'; end if;
  if v_plan.price_inr <= 0 then
    raise exception 'this plan is free right now — take it with Start, there is nothing to pay';
  end if;

  if v_plan.kind = 'artist' then
    if v_role <> 'user' then raise exception 'the Artist plan is a person''s — an organization subscribes its studios'; end if;
    if p_tenant_id is not null then raise exception 'an artist plan is not for a studio'; end if;
  else
    if v_role <> 'org' then raise exception 'only an organization subscribes a studio'; end if;
    if p_tenant_id is null then raise exception 'which studio is this for?'; end if;
    if not exists (select 1 from public.tenants t where t.id = p_tenant_id and t.type = 'studio' and t.deleted_at is null) then
      raise exception 'no such studio';
    end if;
    if not exists (select 1 from public.tenant_members m
                    where m.tenant_id = p_tenant_id and m.user_id = v_user and m.member_role = 'owner' and m.deleted_at is null) then
      raise exception 'that studio is not yours to subscribe';
    end if;
    if v_verified is null then
      raise exception 'DanceOS has not verified your organization yet — the studio cannot go public until it has, so there is nothing to pay for yet';
    end if;
  end if;

  -- the live row for this subject, if there is one
  select * into v_row from public.subscriptions s
   where s.kind = v_plan.kind and s.deleted_at is null and s.status <> 'expired'
     and ((v_plan.kind = 'artist' and s.user_id = v_user) or (v_plan.kind = 'studio' and s.tenant_id = p_tenant_id))
   limit 1;
  if found then
    if v_row.status = 'pending_auth' then
      -- an earlier attempt that was never authorised: reuse the row, new provider id
      update public.subscriptions s
         set plan_key = v_plan.key, price_inr = v_plan.price_inr, period = v_plan.period,
             attempt = s.attempt + 1, provider_subscription_id = null, cf_subscription_id = null,
             provider_status = null, auth_status = null, updated_by = v_user
       where s.id = v_row.id
       returning * into v_row;
      return v_row;
    end if;
    if v_row.granted then
      raise exception 'DanceOS granted this until % — you can set up payment once that period ends', to_char(v_row.current_period_end, 'FMDD FMMonth YYYY');
    end if;
    if v_row.status = 'canceled' or v_row.cancel_at_period_end then
      raise exception 'this subscription runs until % and then stops — subscribe again after that', to_char(v_row.current_period_end, 'FMDD FMMonth YYYY');
    end if;
    raise exception 'already subscribed — it renews on its own until you cancel';
  end if;

  insert into public.subscriptions (kind, user_id, tenant_id, plan_key, price_inr, period, status, created_by, updated_by)
  values (v_plan.kind, v_user, p_tenant_id, v_plan.key, v_plan.price_inr, v_plan.period, 'pending_auth', v_user, v_user)
  returning * into v_row;
  return v_row;
end;
$$;
comment on function public.subscribe(text, uuid) is
  'Open the subscription row for a plan at the catalog''s current price (kept for its life). Reuses an unauthorised attempt; refuses when a live one exists. The server creates the Cashfree mandate against it next (10 Sep 2026).';
revoke execute on function public.subscribe(text, uuid) from public, anon;
grant execute on function public.subscribe(text, uuid) to authenticated;

/** The server records the Cashfree subscription it just created for the row. */
create or replace function public.attach_provider_subscription(
  p_id uuid, p_provider_subscription_id text, p_cf_subscription_id text, p_provider_plan_id text, p_provider_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.subscriptions s
     set provider_subscription_id = p_provider_subscription_id,
         cf_subscription_id = p_cf_subscription_id,
         provider_plan_id = p_provider_plan_id,
         provider_status = p_provider_status,
         updated_by = auth.uid()
   where s.id = p_id and s.user_id = auth.uid() and s.status = 'pending_auth' and s.deleted_at is null;
  if not found then raise exception 'subscription not found or already authorised'; end if;
end;
$$;
revoke execute on function public.attach_provider_subscription(uuid, text, text, text, text) from public, anon;
grant execute on function public.attach_provider_subscription(uuid, text, text, text, text) to authenticated;

-- ── 6. the provider speaks: one applier for every subscription event ────────
/** Service role only. Idempotent: a payment is keyed on the provider's payment
 *  id, a status change on the status itself. Maps Cashfree's words onto the
 *  small machine above and does the one thing each event means:
 *    AUTH ok / first payment → active, first period starts, studio goes public;
 *    CHARGE ok              → the next period, from where the last one ended;
 *    payment FAILED         → past_due (three days' grace; the provider retries);
 *    CANCELLED / EXPIRED    → stop renewing; access runs to the period's end. */
create or replace function public.apply_subscription_event(
  p_type text,
  p_provider_subscription_id text,
  p_cf_subscription_id text,
  p_provider_status text,
  p_auth_status text,
  p_payment_id text,
  p_cf_payment_id text,
  p_payment_type text,
  p_payment_status text,
  p_amount_paise bigint,
  p_method text,
  p_failure_reason text,
  p_next_schedule_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_months integer;
  v_start date;
  v_end date;
  v_amount_inr integer := coalesce((p_amount_paise / 100)::integer, 0);
  v_key text;
  v_name text;
  v_is_payment boolean := p_type in ('SUBSCRIPTION_PAYMENT_SUCCESS', 'SUBSCRIPTION_PAYMENT_FAILED', 'SUBSCRIPTION_PAYMENT_CANCELLED');
  v_paid boolean := false;
begin
  select * into s from public.subscriptions x
   where (p_provider_subscription_id is not null and x.provider_subscription_id = p_provider_subscription_id)
      or (p_cf_subscription_id is not null and x.cf_subscription_id = p_cf_subscription_id)
   order by x.created_at desc limit 1 for update;
  if not found then
    return jsonb_build_object('outcome', 'ignored', 'reason', 'unknown subscription');
  end if;
  v_months := public.plan_months(s.period);

  if p_provider_status is not null then
    update public.subscriptions set provider_status = p_provider_status where id = s.id;
  end if;
  if p_cf_subscription_id is not null and s.cf_subscription_id is null then
    update public.subscriptions set cf_subscription_id = p_cf_subscription_id where id = s.id;
  end if;

  -- ── money landed: the authorisation (first period) or a renewal ──
  if (v_is_payment and p_payment_status = 'SUCCESS')
     or (p_type = 'SUBSCRIPTION_AUTH_STATUS' and p_auth_status = 'ACTIVE' and v_amount_inr > 0) then
    -- the AUTHORISATION is keyed on the subscription, whichever of the two
    -- events (PAYMENT_SUCCESS with payment_type AUTH, or AUTH_STATUS ACTIVE)
    -- reaches us first or second — one first period, never two; a renewal is
    -- keyed on the provider's payment id
    v_key := case when coalesce(p_payment_type, 'AUTH') = 'AUTH'
                  then 'sub_auth_' || coalesce(p_cf_subscription_id, s.cf_subscription_id, s.id::text)
                  else coalesce(p_cf_payment_id, 'sub_pay_' || s.id::text || '_' || to_char(now(), 'YYYYMMDD')) end;
    if exists (select 1 from public.payments p where p.provider_payment_id = v_key) then
      return jsonb_build_object('outcome', 'duplicate', 'subscription_id', s.id, 'status', s.status);
    end if;
    insert into public.payments (order_id, subscription_id, kind, tenant_id, user_id, provider, provider_payment_id,
                                 amount_inr, method, status, created_by, updated_by)
    values (null, s.id, case when coalesce(p_payment_type, 'AUTH') = 'AUTH' then 'subscription_auth' else 'subscription_charge' end,
            null, s.user_id, s.provider, v_key, v_amount_inr, p_method, 'captured', s.user_id, s.user_id);
    -- the period this payment buys starts where the last one ended, never sooner
    v_start := greatest(coalesce(s.current_period_end, v_today), v_today);
    if s.status = 'pending_auth' or s.current_period_end is null then v_start := v_today; end if;
    v_end := (v_start + (v_months || ' months')::interval)::date;
    update public.subscriptions
       set status = 'active', granted = false,
           current_period_start = v_start, current_period_end = v_end,
           next_charge_on = coalesce(p_next_schedule_date, v_end),
           last_payment_at = now(), failure_reason = null,
           auth_status = coalesce(p_auth_status, auth_status), updated_by = s.user_id
     where id = s.id
     returning * into s;
    v_paid := true;
  elsif p_type = 'SUBSCRIPTION_AUTH_STATUS' and p_auth_status = 'ACTIVE' then
    -- a mandate authorised with no money on it (a ₹0 auth): active from today
    update public.subscriptions
       set status = 'active', current_period_start = coalesce(current_period_start, v_today),
           current_period_end = coalesce(current_period_end, (v_today + (v_months || ' months')::interval)::date),
           auth_status = 'ACTIVE', updated_by = s.user_id
     where id = s.id returning * into s;
  elsif p_type = 'SUBSCRIPTION_AUTH_STATUS' and p_auth_status = 'FAILED' then
    update public.subscriptions set auth_status = 'FAILED', failure_reason = p_failure_reason where id = s.id returning * into s;
  elsif v_is_payment and p_payment_status in ('FAILED', 'CANCELLED') then
    if s.status in ('active', 'past_due') then
      update public.subscriptions set status = 'past_due', failure_reason = p_failure_reason, updated_by = s.user_id
       where id = s.id returning * into s;
      perform public.notify(s.user_id, 'money',
        case when s.kind = 'studio' then 'A studio renewal did not go through' else 'Your Artist plan renewal did not go through' end,
        coalesce(p_failure_reason, 'The bank declined the charge.') || ' Cashfree will try again; you keep access for three days after the period ends. Update the card or UPI mandate if it keeps failing.',
        case when s.kind = 'studio' then '/business' else '/subscription' end);
    end if;
  elsif p_type = 'SUBSCRIPTION_STATUS_CHANGED' then
    if p_provider_status in ('CANCELLED', 'CUSTOMER_CANCELLED', 'CUSTOMER_PAUSED', 'EXPIRED', 'COMPLETED', 'LINK_EXPIRED', 'CARD_EXPIRED') then
      if s.status = 'pending_auth' then
        update public.subscriptions set status = 'expired', updated_by = s.user_id where id = s.id returning * into s;
      elsif s.status in ('active', 'past_due') then
        -- the mandate is gone: what was paid for stands, nothing renews
        update public.subscriptions set cancel_at_period_end = true, status = 'canceled', updated_by = s.user_id
         where id = s.id returning * into s;
      end if;
    elsif p_provider_status = 'ACTIVE' and s.status = 'past_due' then
      update public.subscriptions set status = 'active', failure_reason = null, updated_by = s.user_id where id = s.id returning * into s;
    end if;
    if p_next_schedule_date is not null then
      update public.subscriptions set next_charge_on = p_next_schedule_date where id = s.id;
    end if;
  end if;

  -- a paid, verified studio is public — this is the moment it goes on Discover
  if v_paid and s.kind = 'studio' then
    update public.tenants t set visibility = 'listed', updated_by = s.user_id
     where t.id = s.tenant_id and t.visibility = 'unlisted' and t.deleted_at is null
       and public.tenant_owner_verified(t.id)
       and not exists (select 1 from public.tenant_members m join public.profiles p on p.id = m.user_id
                        where m.tenant_id = t.id and m.member_role = 'owner' and m.deleted_at is null and p.suspended_at is not null);
    select t.name into v_name from public.tenants t where t.id = s.tenant_id;
    perform public.notify(s.user_id, 'money',
      coalesce(v_name, 'Your studio') || case when coalesce(p_payment_type, 'AUTH') = 'AUTH' then ' is subscribed' else ' renewed' end,
      'Paid ₹' || v_amount_inr || ' · until ' || to_char(s.current_period_end, 'FMDD FMMonth YYYY') || '. It renews on its own; cancel any time from your business hub.',
      '/business');
  elsif v_paid then
    perform public.notify(s.user_id, 'money',
      case when coalesce(p_payment_type, 'AUTH') = 'AUTH' then 'Artist tools are on' else 'Your Artist plan renewed' end,
      'Paid ₹' || v_amount_inr || ' · until ' || to_char(s.current_period_end, 'FMDD FMMonth YYYY') || '. It renews on its own; cancel any time from Subscription.',
      '/subscription');
  end if;

  return jsonb_build_object('outcome', case when v_paid then 'subscribed' else 'noted' end,
                            'subscription_id', s.id, 'kind', s.kind, 'status', s.status,
                            'tenant_id', s.tenant_id, 'until', s.current_period_end);
end;
$$;
comment on function public.apply_subscription_event(text, text, text, text, text, text, text, text, text, bigint, text, text, date) is
  'The one place a Cashfree Subscriptions event lands (service role only). Idempotent on the provider payment id. Authorisation pays the first period and puts a studio on Discover; a charge buys the next period; a failure is three days of grace; a cancellation keeps what was paid for.';
revoke execute on function public.apply_subscription_event(text, text, text, text, text, text, text, text, text, bigint, text, text, date) from public, anon, authenticated;

-- ── 7. the customer's two moves: cancel, and the free plan ──────────────────
/** Stop renewing. Access runs to the end of the period already paid for — the
 *  standard, and the opposite of the old "End now". The server tells Cashfree
 *  to cancel the mandate so no further charge is raised. */
create or replace function public.cancel_my_subscription(p_id uuid)
returns public.subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into s from public.subscriptions x where x.id = p_id and x.user_id = auth.uid() and x.deleted_at is null for update;
  if not found then raise exception 'no such subscription'; end if;
  if s.status = 'pending_auth' then
    update public.subscriptions set status = 'expired', updated_by = auth.uid() where id = s.id returning * into s;
    return s;
  end if;
  if s.status = 'expired' then raise exception 'that subscription has already ended'; end if;
  update public.subscriptions
     set cancel_at_period_end = true,
         status = case when granted then 'canceled' else status end,
         updated_by = auth.uid()
   where id = s.id returning * into s;
  return s;
end;
$$;
comment on function public.cancel_my_subscription(uuid) is
  'Stop a subscription renewing. What was paid for stays until current_period_end (10 Sep 2026).';
revoke execute on function public.cancel_my_subscription(uuid) from public, anon;
grant execute on function public.cancel_my_subscription(uuid) to authenticated;

/** The FREE path: only while the catalog price is zero. */
create or replace function public.activate_artist_plan(p_plan text)
returns table (plan text, until date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_key text := 'artist_' || p_plan;
  v_plan public.plan_catalog;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_until date;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_plan not in ('monthly', 'yearly') then raise exception 'a plan is monthly or yearly'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_user and p.role = 'user' and p.deleted_at is null) then
    raise exception 'the Artist plan is a person''s — finish onboarding as a user first';
  end if;
  select * into v_plan from public.plan_catalog c where c.key = v_key and c.active and c.deleted_at is null;
  if not found then raise exception 'that plan is not on offer'; end if;
  if v_plan.price_inr > 0 then
    raise exception 'this plan costs ₹% — pay for it with Subscribe', v_plan.price_inr;
  end if;
  if public.artist_plan_active(v_user) then raise exception 'your Artist plan is already active'; end if;
  v_until := (v_today + (public.plan_months(v_plan.period) || ' months')::interval)::date;
  insert into public.subscriptions (kind, user_id, plan_key, price_inr, period, status, current_period_start, current_period_end,
                                    granted, note, created_by, updated_by)
  values ('artist', v_user, v_key, 0, v_plan.period, 'active', v_today, v_until, true,
          'free plan — the catalog price was zero', v_user, v_user);
  return query select p_plan, v_until;
end;
$$;
comment on function public.activate_artist_plan(text) is
  'Take a FREE artist plan. Refuses, naming the price, when the catalog says the plan costs money (10 Sep 2026).';

create or replace function public.end_artist_plan()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select s.id into v_id from public.subscriptions s
   where s.kind = 'artist' and s.user_id = v_user and s.status <> 'expired' and s.deleted_at is null limit 1;
  if v_id is null then return; end if;
  perform public.cancel_my_subscription(v_id);
end;
$$;
comment on function public.end_artist_plan() is
  'Since 10 Sep 2026: stop renewing (cancel at period end) — the tools stay on until the period paid for is over.';

-- the readers every badge and gate use, now on subscriptions
create or replace function public.my_artist_plan()
returns table (plan text, started_on date, until date, amount_inr integer, active boolean)
language sql
set search_path = ''
as $$
  select s.period, s.current_period_start, s.current_period_end, s.price_inr,
         public.subscription_has_access(s) as active
    from public.subscriptions s
   where s.kind = 'artist' and s.user_id = auth.uid() and s.deleted_at is null
     and s.current_period_end is not null
   order by public.subscription_has_access(s) desc, s.current_period_end desc
   limit 1;
$$;

create or replace function public.artist_ids(p_ids uuid[])
returns setof uuid
language sql
security definer
set search_path = ''
stable
as $$
  select distinct s.user_id from public.subscriptions s
   where s.kind = 'artist' and s.user_id = any (p_ids) and public.subscription_has_access(s);
$$;

-- ── 8. the gates ────────────────────────────────────────────────────────────
create or replace function public.why_no_studio()
returns text
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_verified timestamptz;
  v_photos integer;
  v_pending boolean;
begin
  if v_user is null then return 'Sign in first.'; end if;
  select p.role, p.verified_at into v_role, v_verified
    from public.profiles p where p.id = v_user and p.deleted_at is null;
  if not found then return 'Finish onboarding first.'; end if;
  if v_role <> 'org' then return 'Only an organization can set up a studio.'; end if;
  if v_verified is null then
    select count(*) into v_photos from public.org_proof_photos where org_id = v_user and deleted_at is null;
    select exists (select 1 from public.org_verification_requests r
                    where r.org_id = v_user and r.status = 'pending' and r.deleted_at is null) into v_pending;
    if v_photos < 5 then
      return 'DanceOS needs at least 5 photos of your space before it can verify you — ' || v_photos || ' so far.';
    end if;
    if v_pending then
      return 'A DanceOS admin is checking your organization. Studios open the moment you are verified.';
    end if;
    return 'Ask DanceOS to verify your organization first — studios open when the tick lands.';
  end if;
  return null;
end;
$$;
comment on function public.why_no_studio() is
  'The sentence between this organization and CREATING a studio, or null. Verification alone since 10 Sep 2026; each studio''s own subscription decides whether it is PUBLIC.';

create or replace function public.why_not_public(p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_tenant public.tenants;
  s public.subscriptions;
  v_price integer;
begin
  select * into v_tenant from public.tenants t where t.id = p_tenant_id and t.deleted_at is null;
  if not found then return 'No such studio.'; end if;
  if v_tenant.type <> 'studio' then return null; end if;
  if not public.tenant_owner_verified(p_tenant_id) then
    return 'It goes public once DanceOS has verified your organization.';
  end if;
  if not public.studio_plan_active(p_tenant_id) then
    select * into s from public.subscriptions x where x.kind = 'studio' and x.tenant_id = p_tenant_id and x.deleted_at is null
      order by x.created_at desc limit 1;
    select c.price_inr into v_price from public.plan_catalog c where c.key = 'studio_monthly' and c.active and c.deleted_at is null;
    if s.id is not null and s.status = 'pending_auth' then
      return 'The subscription was started but not authorised — finish it to put the studio on Discover.';
    end if;
    if s.id is not null and s.current_period_end is not null then
      return 'Its subscription ended on ' || to_char(s.current_period_end, 'FMDD FMMonth') || ' — subscribe again to put the studio back on Discover.';
    end if;
    return 'Each studio has its own subscription' || case when v_price is not null then ' — ₹' || v_price || ' a month, renewing on its own' else '' end || '. Subscribe to put it on Discover.';
  end if;
  if v_tenant.visibility <> 'listed' then
    return 'DanceOS took this studio off Discover — your notifications say why, and Message DanceOS is the door.';
  end if;
  return null;
end;
$$;
revoke execute on function public.why_not_public(uuid) from public, anon;
grant execute on function public.why_not_public(uuid) to authenticated;

-- a studio is born UNLISTED: it goes public when its own subscription is authorised
create or replace function public.create_tenant_with_owner(
  p_name text,
  p_type text,
  p_area text default null,
  p_city text default null
) returns public.tenants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_tenant public.tenants;
  v_lat double precision;
  v_lng double precision;
  v_role text;
  v_why text;
  v_visibility text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_type not in ('studio', 'trainer_business') then raise exception 'invalid tenant type'; end if;
  if p_name is null or char_length(trim(p_name)) = 0 then raise exception 'name is required'; end if;
  select p.role into v_role from public.profiles p where p.id = v_user and p.deleted_at is null;
  if not found then raise exception 'finish onboarding first'; end if;

  if p_type = 'studio' then
    v_why := public.why_no_studio();
    if v_why is not null then raise exception '%', v_why; end if;
    v_visibility := 'unlisted';
  else
    if v_role <> 'user' then raise exception 'an artist page belongs to a person — an organization sets up studios'; end if;
    if not public.artist_plan_active(v_user) then raise exception 'the Artist plan unlocks your artist page'; end if;
    if exists (select 1 from public.tenants t join public.tenant_members m on m.tenant_id = t.id
                where m.user_id = v_user and m.member_role = 'owner' and m.deleted_at is null
                  and t.type = 'trainer_business' and t.deleted_at is null) then
      raise exception 'you already have an artist page';
    end if;
    v_visibility := 'listed';
  end if;

  select c.lat, c.lng into v_lat, v_lng from public.city_centroids c
   where c.city = nullif(trim(p_city), '') and c.deleted_at is null;

  insert into public.tenants (type, name, area, city, lat, lng, visibility, created_by, updated_by)
  values (p_type, trim(p_name), nullif(trim(p_area), ''), nullif(trim(p_city), ''), v_lat, v_lng, v_visibility, v_user, v_user)
  returning * into v_tenant;
  insert into public.tenant_members (tenant_id, user_id, member_role, created_by, updated_by)
  values (v_tenant.id, v_user, 'owner', v_user, v_user);
  return v_tenant;
end;
$$;

create or replace function public.guard_tenant_visibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.visibility = 'listed' and new.visibility is distinct from old.visibility
     and new.type = 'studio'
     and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' then
    if not public.tenant_owner_verified(new.id) then
      raise exception 'a studio goes public once DanceOS has verified its organization';
    end if;
    if not public.studio_plan_active(new.id) then
      raise exception 'a studio goes public once its own subscription is active';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.decide_org_verification(p_org_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
begin
  if v_admin is null then raise exception 'not authenticated'; end if;
  if not public.is_platform_admin() then raise exception 'admins only'; end if;
  if p_note is not null and char_length(p_note) > 300 then raise exception 'a note is at most 300 characters'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_org_id and p.role = 'org' and p.deleted_at is null) then
    raise exception 'that is not an organization';
  end if;
  update public.org_verification_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         note = nullif(btrim(coalesce(p_note, '')), ''), decided_at = now(), decided_by = v_admin, updated_by = v_admin
   where org_id = p_org_id and status = 'pending' and deleted_at is null;
  if p_approve then
    update public.profiles set verified_at = coalesce(verified_at, now()), updated_by = v_admin where id = p_org_id;
    update public.tenants t set visibility = 'listed', updated_by = v_admin
     where t.type = 'studio' and t.deleted_at is null and t.visibility = 'unlisted'
       and public.studio_plan_active(t.id)
       and exists (select 1 from public.tenant_members m
                    where m.tenant_id = t.id and m.user_id = p_org_id and m.member_role = 'owner' and m.deleted_at is null);
  else
    update public.profiles set verified_at = null, updated_by = v_admin where id = p_org_id and verified_at is not null;
    update public.tenants t set visibility = 'unlisted', updated_by = v_admin
     where t.type = 'studio' and t.deleted_at is null and t.visibility = 'listed'
       and exists (select 1 from public.tenant_members m
                    where m.tenant_id = t.id and m.user_id = p_org_id and m.member_role = 'owner' and m.deleted_at is null);
  end if;
end;
$$;

create or replace function public.admin_unsuspend_account(p_account_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  select p.full_name into v_name from public.profiles p where p.id = p_account_id and p.deleted_at is null;
  if v_name is null then raise exception 'no such account'; end if;
  update public.profiles set suspended_at = null, suspended_reason = null, updated_by = auth.uid() where id = p_account_id;
  update public.tenants t set visibility = 'listed', updated_by = auth.uid()
   where t.deleted_at is null and t.type = 'studio' and t.visibility = 'unlisted'
     and public.tenant_owner_verified(t.id) and public.studio_plan_active(t.id)
     and exists (select 1 from public.tenant_members m
                  where m.tenant_id = t.id and m.user_id = p_account_id and m.member_role = 'owner' and m.deleted_at is null);
  perform public.notify(p_account_id, 'people', 'Your account is active again',
    coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Everything works as before.'), '/');
  perform public.log_admin_action('account.unsuspend', 'profile', p_account_id, v_name, p_note, '{}'::jsonb);
end;
$$;

create or replace function public.admin_set_tenant_visibility(p_tenant_id uuid, p_visibility text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant public.tenants;
  v_owner uuid;
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  if p_visibility not in ('listed', 'unlisted') then raise exception 'a business is listed or unlisted'; end if;
  select * into v_tenant from public.tenants t where t.id = p_tenant_id and t.deleted_at is null;
  if not found then raise exception 'no such business'; end if;
  if p_visibility = 'listed' and v_tenant.type = 'studio' and not public.tenant_owner_verified(p_tenant_id) then
    raise exception 'that studio''s organization is not verified — verify it first, or its studios cannot be public';
  end if;
  if p_visibility = 'listed' and v_tenant.type = 'studio' and not public.studio_plan_active(p_tenant_id) then
    raise exception 'that studio has no active subscription — grant one first, or its owner subscribes';
  end if;
  if p_visibility = 'unlisted' and (p_reason is null or char_length(btrim(p_reason)) < 3) then
    raise exception 'say why in a sentence — the owner reads it, and so does the log';
  end if;
  update public.tenants t set visibility = p_visibility, updated_by = auth.uid() where t.id = p_tenant_id;
  select m.user_id into v_owner from public.tenant_members m
   where m.tenant_id = p_tenant_id and m.member_role = 'owner' and m.deleted_at is null limit 1;
  if v_owner is not null then
    perform public.notify(v_owner, 'people',
      case when p_visibility = 'listed' then v_tenant.name || ' is public again' else v_tenant.name || ' has been taken off Discover' end,
      case when p_visibility = 'listed' then 'It is back on Discover and in search.'
           else btrim(coalesce(p_reason, '')) || ' — write to DanceOS from your hub if you want to discuss it.' end,
      '/business');
  end if;
  perform public.log_admin_action(
    case when p_visibility = 'listed' then 'business.list' else 'business.unlist' end,
    'tenant', p_tenant_id, v_tenant.name, p_reason,
    jsonb_build_object('type', v_tenant.type, 'city', v_tenant.city, 'was', v_tenant.visibility));
end;
$$;

-- ── 9. the admin's decisions: prices, comps, and ending one ─────────────────
create or replace function public.admin_set_plan_price(p_key text, p_price_inr integer, p_active boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.plan_catalog;
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  if p_price_inr is null or p_price_inr < 0 or p_price_inr > 1000000 then
    raise exception 'a price is between ₹0 and ₹10,00,000';
  end if;
  select * into v_old from public.plan_catalog c where c.key = p_key and c.deleted_at is null;
  if not found then raise exception 'no such plan'; end if;
  update public.plan_catalog c
     set price_inr = p_price_inr, active = coalesce(p_active, c.active), updated_by = auth.uid()
   where c.key = p_key;
  perform public.log_admin_action('plan.price', 'request', null, v_old.label,
    'Price ₹' || v_old.price_inr || ' → ₹' || p_price_inr
      || case when coalesce(p_active, v_old.active) <> v_old.active then (case when p_active then ' · put on offer' else ' · taken off offer' end) else '' end,
    jsonb_build_object('key', p_key, 'was_inr', v_old.price_inr, 'now_inr', p_price_inr, 'was_active', v_old.active, 'now_active', coalesce(p_active, v_old.active)));
end;
$$;
comment on function public.admin_set_plan_price(text, integer, boolean) is
  'Change what a plan costs, or take it on or off offer. Audited with the old and new price. Existing subscriptions keep the price they started at (10 Sep 2026).';
revoke execute on function public.admin_set_plan_price(text, integer, boolean) from public, anon;
grant execute on function public.admin_set_plan_price(text, integer, boolean) to authenticated;

/** The server stores the Cashfree plan it created for a price (service role). */
create or replace function public.set_provider_plan(p_key text, p_provider_plan_id text, p_price_inr integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'service role only';
  end if;
  update public.plan_catalog set provider_plan_id = p_provider_plan_id, provider_plan_price_inr = p_price_inr where key = p_key;
end;
$$;
revoke execute on function public.set_provider_plan(text, text, integer) from public, anon, authenticated;

/** Comp a period: a studio's or a person's. The row is granted, renews nothing,
 *  and the owner is reminded three days before it ends. */
create or replace function public.admin_grant_subscription(p_kind text, p_subject_id uuid, p_months integer, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions;
  v_user uuid;
  v_tenant uuid;
  v_label text;
  v_key text;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_start date;
  v_end date;
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  if p_months is null or p_months < 1 or p_months > 36 then raise exception 'between one month and three years'; end if;
  if p_kind = 'studio' then
    select m.user_id, t.name into v_user, v_label from public.tenants t
      join public.tenant_members m on m.tenant_id = t.id and m.member_role = 'owner' and m.deleted_at is null
     where t.id = p_subject_id and t.type = 'studio' and t.deleted_at is null limit 1;
    if v_user is null then raise exception 'no such studio, or it has no owner'; end if;
    v_tenant := p_subject_id; v_key := 'studio_monthly';
  elsif p_kind = 'artist' then
    select p.full_name into v_label from public.profiles p where p.id = p_subject_id and p.role = 'user' and p.deleted_at is null;
    if v_label is null then raise exception 'the Artist plan is a person''s'; end if;
    v_user := p_subject_id; v_tenant := null; v_key := 'artist_monthly';
  else
    raise exception 'a plan is artist or studio';
  end if;

  select * into s from public.subscriptions x
   where x.kind = p_kind and x.deleted_at is null and x.status <> 'expired'
     and ((p_kind = 'artist' and x.user_id = v_user) or (p_kind = 'studio' and x.tenant_id = v_tenant))
   limit 1 for update;
  if found and s.status <> 'pending_auth' then
    -- extend from where the current period ends, never sooner
    v_start := greatest(coalesce(s.current_period_end, v_today), v_today);
    v_end := (v_start + (p_months || ' months')::interval)::date;
    update public.subscriptions
       set current_period_end = v_end, status = 'active', failure_reason = null,
           note = coalesce(p_note, note), granted_by = auth.uid(), updated_by = auth.uid()
     where id = s.id;
  else
    if found then
      -- an unauthorised attempt gives way to the grant
      update public.subscriptions set status = 'expired', updated_by = auth.uid() where id = s.id;
    end if;
    v_start := v_today;
    v_end := (v_today + (p_months || ' months')::interval)::date;
    insert into public.subscriptions (kind, user_id, tenant_id, plan_key, price_inr, period, status,
                                      current_period_start, current_period_end, granted, granted_by, note, created_by, updated_by)
    values (p_kind, v_user, v_tenant, v_key, 0, 'monthly', 'active', v_start, v_end, true, auth.uid(), p_note, v_user, v_user);
  end if;

  if p_kind = 'studio' then
    update public.tenants t set visibility = 'listed', updated_by = auth.uid()
     where t.id = v_tenant and t.visibility = 'unlisted' and t.deleted_at is null and public.tenant_owner_verified(t.id);
    perform public.notify(v_user, 'money', v_label || ' is subscribed',
      'DanceOS set it up until ' || to_char(v_end, 'FMDD FMMonth YYYY') || ' — nothing was charged. It is on Discover now.', '/business');
    perform public.log_admin_action('subscription.grant', 'tenant', v_tenant, v_label, p_note,
      jsonb_build_object('months', p_months, 'until', v_end, 'amount_inr', 0));
  else
    perform public.notify(v_user, 'money', 'Artist tools are on',
      'DanceOS switched them on until ' || to_char(v_end, 'FMDD FMMonth YYYY') || ' — nothing was charged.', '/subscription');
    perform public.log_admin_action('plan.grant', 'profile', v_user, v_label, p_note,
      jsonb_build_object('months', p_months, 'until', v_end, 'amount_inr', 0));
  end if;
end;
$$;
comment on function public.admin_grant_subscription(text, uuid, integer, text) is
  'Comp a studio or a person N months, free, audited. Extends a live period rather than shortening it; the row renews nothing (10 Sep 2026).';
revoke execute on function public.admin_grant_subscription(text, uuid, integer, text) from public, anon;
grant execute on function public.admin_grant_subscription(text, uuid, integer, text) to authenticated;

/** End a subscription NOW, as a sanction — the one case where access does not
 *  run to the period's end. The owner reads the reason. */
create or replace function public.admin_end_subscription(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions;
  v_label text;
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'say why in a sentence — they read it, and so does the log';
  end if;
  select * into s from public.subscriptions x where x.id = p_id and x.deleted_at is null for update;
  if not found then raise exception 'no such subscription'; end if;
  if s.status = 'expired' then raise exception 'that subscription has already ended'; end if;
  update public.subscriptions set status = 'expired', cancel_at_period_end = true, updated_by = auth.uid() where id = s.id;
  if s.kind = 'studio' then
    select t.name into v_label from public.tenants t where t.id = s.tenant_id;
    update public.tenants t set visibility = 'unlisted', updated_by = auth.uid() where t.id = s.tenant_id and t.visibility = 'listed';
    perform public.notify(s.user_id, 'money', coalesce(v_label, 'Your studio') || '''s subscription has ended',
      btrim(p_reason) || ' — the studio is off Discover until it is subscribed again. Nothing in it is lost.', '/business');
    perform public.log_admin_action('subscription.end', 'tenant', s.tenant_id, v_label, p_reason, jsonb_build_object('subscription_id', s.id));
  else
    select p.full_name into v_label from public.profiles p where p.id = s.user_id;
    perform public.notify(s.user_id, 'money', 'Your Artist plan has ended',
      btrim(p_reason) || ' — the artist tools are locked; your profile stays.', '/subscription');
    perform public.log_admin_action('plan.end', 'profile', s.user_id, v_label, p_reason, jsonb_build_object('subscription_id', s.id));
  end if;
end;
$$;
comment on function public.admin_end_subscription(uuid, text) is
  'End a subscription immediately, with a reason its owner reads. A sanction, audited; the provider mandate is cancelled by the server (10 Sep 2026).';
revoke execute on function public.admin_end_subscription(uuid, text) from public, anon;
grant execute on function public.admin_end_subscription(uuid, text) to authenticated;

-- ── 10. the panel reads the new shape ───────────────────────────────────────
create or replace function public.admin_accounts(p_q text default null, p_limit integer default 50)
returns table (id uuid, email text, full_name text, role text, city text, avatar_path text, verified_at timestamptz,
               suspended_at timestamptz, suspended_reason text, is_admin boolean, has_plan boolean, owns integer,
               created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  return query
    select p.id, u.email::text, p.full_name, p.role, p.city, p.avatar_path,
           p.verified_at, p.suspended_at, p.suspended_reason,
           exists (select 1 from public.platform_admins a where a.user_id = p.id and a.deleted_at is null),
           public.artist_plan_active(p.id),
           (select count(*)::int from public.tenant_members m join public.tenants t on t.id = m.tenant_id
             where m.user_id = p.id and m.member_role = 'owner' and m.deleted_at is null and t.deleted_at is null and t.type <> 'org'),
           p.created_at, u.last_sign_in_at
    from public.profiles p
    left join auth.users u on u.id = p.id
    where p.deleted_at is null
      and (p_q is null or btrim(p_q) = ''
           or p.full_name ilike '%' || btrim(p_q) || '%'
           or coalesce(u.email::text, '') ilike '%' || btrim(p_q) || '%'
           or coalesce(p.city, '') ilike '%' || btrim(p_q) || '%')
    order by p.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

drop function public.admin_businesses(text, integer);
create function public.admin_businesses(p_q text default null, p_limit integer default 50)
returns table (
  id uuid, type text, name text, city text, area text, visibility text, photo_path text, verified_at timestamptz,
  owner_id uuid, owner_name text, owner_role text, owner_verified boolean, owner_suspended boolean,
  rooms integer, classes integer, events integer, followers integer, created_at timestamptz,
  subscription_id uuid, sub_status text, sub_until date, sub_granted boolean, sub_renews boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  select t.id, t.type, t.name, t.city, t.area, t.visibility, t.photo_path, t.verified_at,
         o.id, o.full_name, o.role, o.verified_at is not null, o.suspended_at is not null,
         (select count(*)::integer from public.rooms r where r.tenant_id = t.id and r.deleted_at is null),
         (select count(*)::integer from public.classes c where c.tenant_id = t.id and c.deleted_at is null),
         (select count(*)::integer from public.events e where e.tenant_id = t.id and e.deleted_at is null),
         (select count(*)::integer from public.follows f where f.tenant_id = t.id and f.deleted_at is null),
         t.created_at,
         s.id, s.status, s.current_period_end, s.granted, (s.status = 'active' and not s.cancel_at_period_end and not s.granted)
  from public.tenants t
  left join lateral (
    select p.id, p.full_name, p.role, p.verified_at, p.suspended_at
    from public.tenant_members m join public.profiles p on p.id = m.user_id
    where m.tenant_id = t.id and m.member_role = 'owner' and m.deleted_at is null and p.deleted_at is null
    limit 1
  ) o on true
  left join lateral (
    select x.id, x.status, x.current_period_end, x.granted, x.cancel_at_period_end
    from public.subscriptions x
    where x.kind = 'studio' and x.tenant_id = t.id and x.deleted_at is null and x.status <> 'expired'
    order by x.created_at desc limit 1
  ) s on true
  where t.deleted_at is null and t.type <> 'org' and public.is_platform_admin()
    and (p_q is null or btrim(p_q) = ''
         or t.name ilike '%' || btrim(p_q) || '%'
         or coalesce(t.city, '') ilike '%' || btrim(p_q) || '%'
         or coalesce(o.full_name, '') ilike '%' || btrim(p_q) || '%')
  order by t.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;
revoke execute on function public.admin_businesses(text, integer) from public, anon;
grant execute on function public.admin_businesses(text, integer) to authenticated;

create function public.admin_org_standing(p_org_ids uuid[])
returns table (org_id uuid, proof_photos integer, studios integer, subscribed_studios integer)
language sql
security definer
set search_path = ''
stable
as $$
  select p.id,
         (select count(*)::integer from public.org_proof_photos f where f.org_id = p.id and f.deleted_at is null),
         (select count(*)::integer from public.tenant_members m join public.tenants t on t.id = m.tenant_id
           where m.user_id = p.id and m.member_role = 'owner' and m.deleted_at is null and t.type = 'studio' and t.deleted_at is null),
         (select count(*)::integer from public.tenant_members m join public.tenants t on t.id = m.tenant_id
           where m.user_id = p.id and m.member_role = 'owner' and m.deleted_at is null and t.type = 'studio' and t.deleted_at is null
             and public.studio_plan_active(t.id))
  from public.profiles p
  where p.id = any (p_org_ids) and p.role = 'org' and p.deleted_at is null and public.is_platform_admin();
$$;
revoke execute on function public.admin_org_standing(uuid[]) from public, anon;
grant execute on function public.admin_org_standing(uuid[]) to authenticated;

create or replace function public.admin_plan_catalog()
returns setof public.plan_catalog
language sql
security definer
set search_path = ''
stable
as $$
  select * from public.plan_catalog c where c.deleted_at is null and public.is_platform_admin() order by c.sort, c.key;
$$;
revoke execute on function public.admin_plan_catalog() from public, anon;
grant execute on function public.admin_plan_catalog() to authenticated;

/** Every subscription, for the admin's money view — who, what, status, period. */
create or replace function public.admin_subscriptions(p_status text default null, p_limit integer default 100)
returns table (id uuid, kind text, status text, user_id uuid, user_name text, tenant_id uuid, tenant_name text,
               plan_key text, price_inr integer, period text, current_period_end date, cancel_at_period_end boolean,
               granted boolean, provider_status text, next_charge_on date, failure_reason text, created_at timestamptz)
language sql
security definer
set search_path = ''
stable
as $$
  select s.id, s.kind, s.status, s.user_id, p.full_name, s.tenant_id, t.name,
         s.plan_key, s.price_inr, s.period, s.current_period_end, s.cancel_at_period_end,
         s.granted, s.provider_status, s.next_charge_on, s.failure_reason, s.created_at
  from public.subscriptions s
  join public.profiles p on p.id = s.user_id
  left join public.tenants t on t.id = s.tenant_id
  where s.deleted_at is null and public.is_platform_admin()
    and (p_status is null or s.status = p_status)
  order by s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;
revoke execute on function public.admin_subscriptions(text, integer) from public, anon;
grant execute on function public.admin_subscriptions(text, integer) to authenticated;

create or replace function public.admin_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v jsonb;
  v_week timestamptz := now() - interval '7 days';
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  select jsonb_build_object(
    'waiting', jsonb_build_object(
      'verifications', (select count(*) from public.org_verification_requests r where r.status = 'pending' and r.deleted_at is null),
      'threads', (select count(*) from public.support_threads t where t.status = 'open' and t.deleted_at is null
                   and exists (select 1 from public.support_messages m where m.thread_id = t.id and m.deleted_at is null
                                and not m.from_admin and m.created_at > coalesce(t.admin_read_at, '-infinity'::timestamptz))),
      'reports', (select count(*) from public.reports r where r.status = 'open' and r.deleted_at is null),
      'past_due', (select count(*) from public.subscriptions s where s.status = 'past_due' and s.deleted_at is null),
      'refunds', (select count(*) from public.refunds r where r.status in ('requested', 'pending') and r.deleted_at is null),
      'stuck_webhooks', (select count(*) from public.webhook_events w where w.processed_at is null)
    ),
    'accounts', jsonb_build_object(
      'users', (select count(*) from public.profiles p where p.role = 'user' and p.deleted_at is null and p.suspended_at is null),
      'orgs', (select count(*) from public.profiles p where p.role = 'org' and p.deleted_at is null and p.suspended_at is null),
      'artists', (select count(*) from public.subscriptions s where s.kind = 'artist' and public.subscription_has_access(s)),
      'verified_orgs', (select count(*) from public.profiles p where p.role = 'org' and p.verified_at is not null and p.deleted_at is null),
      'suspended', (select count(*) from public.profiles p where p.suspended_at is not null and p.deleted_at is null),
      'admins', (select count(*) from public.platform_admins a where a.deleted_at is null),
      'new_this_week', (select count(*) from public.profiles p where p.created_at >= v_week and p.deleted_at is null)
    ),
    'businesses', jsonb_build_object(
      'studios', (select count(*) from public.tenants t where t.type = 'studio' and t.deleted_at is null),
      'artist_pages', (select count(*) from public.tenants t where t.type = 'trainer_business' and t.deleted_at is null),
      'listed', (select count(*) from public.tenants t where t.visibility = 'listed' and t.type <> 'org' and t.deleted_at is null),
      'unlisted', (select count(*) from public.tenants t where t.visibility = 'unlisted' and t.type <> 'org' and t.deleted_at is null),
      'subscribed_studios', (select count(*) from public.tenants t where t.type = 'studio' and t.deleted_at is null and public.studio_plan_active(t.id)),
      'rooms', (select count(*) from public.rooms r where r.deleted_at is null)
    ),
    'subscriptions', jsonb_build_object(
      'active', (select count(*) from public.subscriptions s where s.status = 'active' and s.deleted_at is null),
      'renewing', (select count(*) from public.subscriptions s where s.status = 'active' and not s.granted and not s.cancel_at_period_end and s.deleted_at is null),
      'granted', (select count(*) from public.subscriptions s where s.granted and public.subscription_has_access(s)),
      'canceling', (select count(*) from public.subscriptions s where s.cancel_at_period_end and public.subscription_has_access(s)),
      'past_due', (select count(*) from public.subscriptions s where s.status = 'past_due' and s.deleted_at is null),
      'mrr_inr', (select coalesce(sum(case when s.period = 'yearly' then s.price_inr / 12 else s.price_inr end), 0)
                   from public.subscriptions s where s.status = 'active' and not s.granted and not s.cancel_at_period_end and s.deleted_at is null)
    ),
    'activity', jsonb_build_object(
      'classes_live', (select count(*) from public.classes c where c.status = 'published' and c.deleted_at is null),
      'events_live', (select count(*) from public.events e where e.status = 'published' and e.deleted_at is null),
      'crews', (select count(*) from public.crews c where c.deleted_at is null),
      'bookings_week', (select count(*) from public.enrollments e where e.created_at >= v_week and e.deleted_at is null),
      'event_bookings_week', (select count(*) from public.event_bookings b where b.created_at >= v_week and b.status = 'booked' and b.deleted_at is null),
      'enquiries_open', (select count(*) from public.enquiries e where e.status not in ('won', 'lost') and e.deleted_at is null)
    ),
    'money', jsonb_build_object(
      'captured_week_inr', (select coalesce(sum(pm.amount_inr), 0) from public.payments pm where pm.status = 'captured' and pm.created_at >= v_week and pm.deleted_at is null),
      'captured_all_inr', (select coalesce(sum(pm.amount_inr), 0) from public.payments pm where pm.status = 'captured' and pm.deleted_at is null),
      'plans_all_inr', (select coalesce(sum(pm.amount_inr), 0) from public.payments pm where pm.status = 'captured' and pm.kind <> 'order' and pm.deleted_at is null),
      'refunded_all_inr', (select coalesce(sum(r.amount_inr), 0) from public.refunds r where r.status = 'processed' and r.deleted_at is null),
      'payouts_pending', (select count(*) from public.payouts p where p.status in ('in_transit', 'on_hold') and p.deleted_at is null),
      'orders_unpaid', (select count(*) from public.orders o where o.status = 'created' and o.created_at < now() - interval '1 hour' and o.deleted_at is null)
    )
  ) into v;
  return v;
end;
$$;
revoke execute on function public.admin_dashboard() from public, anon;
grant execute on function public.admin_dashboard() to authenticated;

-- ── 11. the clock: expiries, and the reminders that come before them ────────
create or replace function public.run_subscription_clock()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  n_expired integer := 0;
  n_reminded integer := 0;
  v_name text;
begin
  -- 1. anything whose access has run out is over: studios come off Discover
  for r in
    select s.* from public.subscriptions s
    where s.deleted_at is null and s.status in ('active', 'past_due', 'canceled')
      and not public.subscription_has_access(s)
  loop
    update public.subscriptions set status = 'expired' where id = r.id;
    if r.kind = 'studio' then
      select t.name into v_name from public.tenants t where t.id = r.tenant_id;
      update public.tenants set visibility = 'unlisted', updated_by = r.user_id where id = r.tenant_id and visibility = 'listed';
      perform public.notify(r.user_id, 'money',
        coalesce(v_name, 'Your studio') || ' is off Discover — its subscription ended',
        case when r.status = 'past_due' then 'The renewal kept failing. ' else '' end
          || 'Subscribe again from your business hub and the studio is back the same minute. Nothing in it is lost.',
        '/business');
    else
      perform public.notify(r.user_id, 'money', 'Your Artist plan has ended',
        'The artist tools are locked; your profile, followers and stats stay. Subscribe again from Subscription.', '/subscription');
    end if;
    n_expired := n_expired + 1;
  end loop;

  -- 2. three days before a NON-renewing period ends (a grant, or a cancellation),
  --    the owner is told once — a renewing one is charged, not reminded
  for r in
    select s.* from public.subscriptions s
    where s.deleted_at is null and s.status in ('active', 'canceled')
      and (s.granted or s.cancel_at_period_end)
      and s.current_period_end = v_today + 3
  loop
    if r.kind = 'studio' then
      select t.name into v_name from public.tenants t where t.id = r.tenant_id;
      perform public.notify(r.user_id, 'money',
        coalesce(v_name, 'Your studio') || '''s subscription ends in three days',
        'It ends on ' || to_char(r.current_period_end, 'FMDD FMMonth') || ' and will not renew on its own. Subscribe from your business hub to keep it on Discover.',
        '/business');
    else
      perform public.notify(r.user_id, 'money', 'Your Artist plan ends in three days',
        'It ends on ' || to_char(r.current_period_end, 'FMDD FMMonth') || ' and will not renew on its own. Subscribe to keep the tools on.',
        '/subscription');
    end if;
    n_reminded := n_reminded + 1;
  end loop;

  return jsonb_build_object('expired', n_expired, 'reminded', n_reminded);
end;
$$;
comment on function public.run_subscription_clock() is
  'Nightly: expire what has run out (studios come off Discover, owners are told) and remind, three days ahead, whoever is on a period that will not renew. Returns the counts (10 Sep 2026).';
revoke execute on function public.run_subscription_clock() from public, anon, authenticated;

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron could not be created here (%): schedule run_subscription_clock() from the dashboard', sqlerrm;
    return;
  end;
  -- 21:00 UTC is 02:30 IST — once the day a period ended has fully passed in India
  perform cron.schedule('subscription-clock', '0 21 * * *', $job$ select public.run_subscription_clock(); $job$);
exception when others then
  raise notice 'the nightly job could not be scheduled (%): call run_subscription_clock() from the dashboard', sqlerrm;
end $$;
