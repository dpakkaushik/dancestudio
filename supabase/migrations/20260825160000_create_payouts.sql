-- Step 13 (Earnings & payouts) ⚠ money: what a studio owes the people who taught,
-- and what it has settled.
--
-- THE PROTOTYPE'S OWN LIMIT, HONOURED: "S_payroll — a 133-line payroll desk,
-- removed with the feature. A studio pays its faculty; DanceOS is not the thing
-- that runs the payroll." So this is NOT a payroll engine. There are no pay
-- cycles, no salary structures, no payslips, no approval chains. There is one
-- write: the studio RECORDS a settlement it has already made. That single record
-- is what gives the prototype's earnings screen its data -- "WHO HAS PAID YOU:
-- EEE Dance Studio · July · paid 2 Aug · ₹12,600 done" and "Fusion Dance Center
-- · July · awaiting their cycle · ₹900 transit" (S_earn, dosEarnPayouts). Without
-- it, that half of the screen can only ever be fiction.
--
-- No money moves through code here. Step 9's rail is collection-only (one
-- platform key pair, so class fees land in the PLATFORM's Razorpay account), and
-- sending money to a third party needs a payout rail we do not have -- Route
-- (splits at capture) or RazorpayX (true payouts). Both need a Razorpay account
-- that does not exist yet. So a payout row carries a nullable provider_ref and
-- states that already match both the prototype's vocabulary and a real rail's
-- lifecycle, and switching a rail on later fills fields this ledger already has.

-- ── what the studio agreed to pay per session ─────────────────────────────────
-- The rate is the OWNER'S NUMBER, set per person per class -- an artist and an
-- assistant on the same class can be paid differently, and two classes can pay
-- differently. (The prototype's ₹900 and ₹1,300 are sample rows in S_earn, not
-- constants: the only thing lifted is the grammar "sessions × rate = amount".)
-- 0 is a real answer -- an owner teaching their own class is not owed anything.
alter table public.class_claims
  add column pay_per_session_inr integer not null default 0
  check (pay_per_session_inr between 0 and 200000);

comment on column public.class_claims.pay_per_session_inr is
  'What the studio pays this person for one session of this class, in whole rupees, set by the owner. Rides the claim so the person confirming the ask sees the number they are agreeing to.';

-- ── payouts — a settlement the studio made ────────────────────────────────────
create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- who was paid; profiles, so the ledger can name them
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount_inr integer not null check (amount_inr > 0),
  -- the prototype's three states plus one a real rail needs: done / transit /
  -- hold are its own words (dosEarnPayouts), failed is what a rail returns
  status text not null default 'done'
    check (status in ('done', 'in_transit', 'on_hold', 'failed')),
  method text not null default 'bank_transfer'
    check (method in ('bank_transfer', 'upi', 'cash', 'other')),
  -- the UTR the prototype prints ("28 Jul · UTR 4471"), or a rail's payout id
  provider_ref text check (provider_ref is null or char_length(trim(provider_ref)) between 1 and 120),
  paid_on date not null default current_date,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);

comment on table public.payouts is
  'Money a studio has settled to a person who taught for it. A RECORD of a transfer made outside DanceOS, not a payment instrument.';

create index payouts_tenant_idx on public.payouts (tenant_id, paid_on desc) where deleted_at is null;
create index payouts_user_idx on public.payouts (user_id, paid_on desc) where deleted_at is null;

create trigger payouts_set_updated_at
  before update on public.payouts
  for each row execute function public.set_updated_at();

alter table public.payouts enable row level security;

-- Pay is private between the studio and the person paid. NOT every member: a
-- trainer has no business reading what another trainer earns -- which is why
-- this differs from `leads`, where staff answer the phone so staff read the desk.
-- No deleted_at filter (Step 3's lesson: a soft-deleting role must be able to
-- SELECT the row it just deleted).
create policy "owner and payee read payouts"
  on public.payouts for select
  to authenticated
  using (public.is_tenant_owner(tenant_id) or user_id = auth.uid());

-- No insert/update/delete policies at all: money moves only through the RPCs
-- below, so the amount is always counted from sessions actually taught rather
-- than typed in by the client.

-- ── payout_lines — which sessions a payout covers, at what rate ───────────────
-- This is the integrity spine. A line SNAPSHOTS the rate that was paid, so a
-- later rate change can never rewrite what was already settled, and the unique
-- index makes paying the same session twice impossible rather than merely
-- unlikely.
create table public.payout_lines (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.payouts (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  kind text not null check (kind in ('artist', 'assistant')),
  rate_inr integer not null check (rate_inr >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);

comment on table public.payout_lines is
  'The sessions one payout covered, each with the rate actually paid. One live line per (session, person) — a session can never be paid twice.';

create unique index payout_lines_one_live_per_session_person
  on public.payout_lines (session_id, user_id) where deleted_at is null;
create index payout_lines_payout_idx on public.payout_lines (payout_id) where deleted_at is null;
create index payout_lines_user_idx on public.payout_lines (user_id) where deleted_at is null;

create trigger payout_lines_set_updated_at
  before update on public.payout_lines
  for each row execute function public.set_updated_at();

alter table public.payout_lines enable row level security;

create policy "owner and payee read payout lines"
  on public.payout_lines for select
  to authenticated
  using (public.is_tenant_owner(tenant_id) or user_id = auth.uid());

-- ── claim_person — now carries the agreed rate ────────────────────────────────
-- Dropped and recreated rather than overloaded (Step 11's lesson), so there is
-- still exactly ONE creation path. The new argument has a default, so every
-- existing five-argument caller keeps working and simply agrees ₹0.
drop function if exists public.claim_person(uuid, uuid, text, boolean, boolean);

create or replace function public.claim_person(
  p_class_id uuid,
  p_user_id uuid,
  p_kind text,
  p_can_attendance boolean default false,
  p_can_refunds boolean default false,
  p_pay_per_session_inr integer default 0
)
returns public.class_claims
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_class public.classes;
  v_row public.class_claims;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_kind not in ('artist', 'assistant') then
    raise exception 'invalid kind';
  end if;

  select * into v_class from public.classes c where c.id = p_class_id and c.deleted_at is null;
  if not found then
    raise exception 'class not found';
  end if;
  if not exists (
    select 1 from public.tenant_members m
    where m.tenant_id = v_class.tenant_id and m.user_id = v_user
      and m.member_role in ('owner', 'trainer') and m.deleted_at is null
  ) then
    raise exception 'only the studio''s owner or trainer puts people on a class';
  end if;
  -- you can only claim your own team: consent starts from a real relationship
  if not exists (
    select 1 from public.tenant_members m
    where m.tenant_id = v_class.tenant_id and m.user_id = p_user_id and m.deleted_at is null
  ) then
    raise exception 'that person is not on your team';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id and p.deleted_at is null) then
    raise exception 'that person has not finished onboarding';
  end if;
  -- only the owner decides money. A trainer may still put somebody on a class,
  -- but cannot attach a rate to it (the prototype's SS10.9 spirit: pay is the
  -- owner's alone and is not delegable).
  if coalesce(p_pay_per_session_inr, 0) <> 0 and not public.is_tenant_owner(v_class.tenant_id) then
    raise exception 'only the studio owner sets what a session pays';
  end if;

  -- asking again after a withdrawal or a no is a fresh ask
  update public.class_claims
    set deleted_at = now(), updated_by = v_user
    where class_id = p_class_id and user_id = p_user_id and deleted_at is null;

  insert into public.class_claims (class_id, tenant_id, user_id, kind, status,
                                   can_attendance, can_refunds, pay_per_session_inr,
                                   created_by, updated_by)
  values (p_class_id, v_class.tenant_id, p_user_id, p_kind, 'asked',
          coalesce(p_can_attendance, false), coalesce(p_can_refunds, false),
          coalesce(p_pay_per_session_inr, 0), v_user, v_user)
  returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.claim_person(uuid, uuid, text, boolean, boolean, integer) from public, anon;
grant execute on function public.claim_person(uuid, uuid, text, boolean, boolean, integer) to authenticated;

-- ── set_claim_pay — the owner changes the rate ────────────────────────────────
-- Separate from set_claim_powers on purpose: attendance and refunds are jobs an
-- owner OR trainer hands out, but what a session pays is the owner's alone.
-- Changing it moves only sessions not yet settled -- paid ones are frozen by
-- their payout_line snapshot.
create or replace function public.set_claim_pay(p_claim_id uuid, p_pay_per_session_inr integer)
returns public.class_claims
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.class_claims;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_pay_per_session_inr is null or p_pay_per_session_inr < 0 or p_pay_per_session_inr > 200000 then
    raise exception 'that is not a rate';
  end if;
  select * into v_row from public.class_claims cc
    where cc.id = p_claim_id and cc.deleted_at is null;
  if not found then
    raise exception 'claim not found';
  end if;
  if not public.is_tenant_owner(v_row.tenant_id) then
    raise exception 'only the studio owner sets what a session pays';
  end if;

  update public.class_claims
    set pay_per_session_inr = p_pay_per_session_inr, updated_by = v_user
    where id = v_row.id
    returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.set_claim_pay(uuid, integer) from public, anon;
grant execute on function public.set_claim_pay(uuid, integer) to authenticated;

-- ── record_payout — the one write that moves the ledger ───────────────────────
-- The owner names the person and the sessions; the AMOUNT is counted here from
-- the rates on record, never accepted from the client (Step 9's rule: the amount
-- always comes from the database).
create or replace function public.record_payout(
  p_tenant_id uuid,
  p_user_id uuid,
  p_session_ids uuid[],
  p_method text default 'bank_transfer',
  p_status text default 'done',
  p_provider_ref text default null,
  p_paid_on date default null,
  p_note text default null
)
returns public.payouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_payout public.payouts;
  v_sid uuid;
  v_session public.class_sessions;
  v_claim public.class_claims;
  v_total integer := 0;
  -- lines are gathered before the payout row exists, so the amount is right the
  -- first time it is written rather than patched afterwards
  v_lines jsonb := '[]'::jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_tenant_owner(p_tenant_id) then
    raise exception 'only the studio owner records a payout';
  end if;
  if p_session_ids is null or array_length(p_session_ids, 1) is null then
    raise exception 'a payout has to cover at least one session';
  end if;
  if p_status not in ('done', 'in_transit', 'on_hold', 'failed') then
    raise exception 'invalid status';
  end if;
  if p_method not in ('bank_transfer', 'upi', 'cash', 'other') then
    raise exception 'invalid method';
  end if;

  -- distinct, so a doubled id in the array cannot become two lines
  for v_sid in select distinct unnest(p_session_ids) loop
    select s.* into v_session
      from public.class_sessions s
      join public.classes c on c.id = s.class_id
      where s.id = v_sid and c.tenant_id = p_tenant_id and c.deleted_at is null;
    if not found then
      raise exception 'that session is not this studio''s';
    end if;
    if v_session.ends_at > now() then
      raise exception 'that session has not happened yet';
    end if;

    -- The claim is read REGARDLESS of deleted_at: somebody taken off the team is
    -- still owed for the sessions they taught, and Step 12b's removal closes
    -- their claims. The work happened; the money is owed.
    select * into v_claim
      from public.class_claims cc
      where cc.class_id = v_session.class_id
        and cc.user_id = p_user_id
        and cc.status = 'confirmed'
      order by cc.deleted_at nulls first, cc.created_at desc
      limit 1;
    if not found then
      raise exception 'they were never confirmed on that class';
    end if;

    v_lines := v_lines || jsonb_build_object(
      'session_id', v_sid, 'class_id', v_session.class_id,
      'kind', v_claim.kind, 'rate_inr', v_claim.pay_per_session_inr);
    v_total := v_total + v_claim.pay_per_session_inr;
  end loop;

  if v_total <= 0 then
    raise exception 'those sessions add up to nothing -- set what they pay first';
  end if;

  insert into public.payouts (tenant_id, user_id, amount_inr, status, method,
                              provider_ref, paid_on, note, created_by, updated_by)
  values (p_tenant_id, p_user_id, v_total, p_status, p_method,
          nullif(trim(coalesce(p_provider_ref, '')), ''),
          coalesce(p_paid_on, current_date), nullif(trim(coalesce(p_note, '')), ''),
          v_user, v_user)
  returning * into v_payout;

  insert into public.payout_lines (payout_id, tenant_id, user_id, session_id,
                                   class_id, kind, rate_inr, created_by, updated_by)
  select v_payout.id, p_tenant_id, p_user_id,
         (l->>'session_id')::uuid, (l->>'class_id')::uuid,
         l->>'kind', (l->>'rate_inr')::integer, v_user, v_user
  from jsonb_array_elements(v_lines) as l;

  return v_payout;
end;
$$;

revoke execute on function public.record_payout(uuid, uuid, uuid[], text, text, text, date, text) from public, anon;
grant execute on function public.record_payout(uuid, uuid, uuid[], text, text, text, date, text) to authenticated;

-- ── set_payout_status / void_payout — fixing the record ──────────────────────
create or replace function public.set_payout_status(
  p_payout_id uuid,
  p_status text,
  p_provider_ref text default null
)
returns public.payouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.payouts;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_status not in ('done', 'in_transit', 'on_hold', 'failed') then
    raise exception 'invalid status';
  end if;
  select * into v_row from public.payouts p where p.id = p_payout_id and p.deleted_at is null;
  if not found then
    raise exception 'payout not found';
  end if;
  if not public.is_tenant_owner(v_row.tenant_id) then
    raise exception 'only the studio owner changes a payout';
  end if;

  update public.payouts
    set status = p_status,
        provider_ref = coalesce(nullif(trim(coalesce(p_provider_ref, '')), ''), provider_ref),
        updated_by = v_user
    where id = v_row.id
    returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.set_payout_status(uuid, text, text) from public, anon;
grant execute on function public.set_payout_status(uuid, text, text) to authenticated;

-- Voiding a mis-recorded payout releases its sessions so they can be settled
-- again. Soft delete on both sides, so the mistake stays readable.
create or replace function public.void_payout(p_payout_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.payouts;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_row from public.payouts p where p.id = p_payout_id and p.deleted_at is null;
  if not found then
    raise exception 'payout not found';
  end if;
  if not public.is_tenant_owner(v_row.tenant_id) then
    raise exception 'only the studio owner voids a payout';
  end if;

  update public.payout_lines
    set deleted_at = now(), updated_by = v_user
    where payout_id = v_row.id and deleted_at is null;
  update public.payouts
    set deleted_at = now(), updated_by = v_user
    where id = v_row.id;
end;
$$;

revoke execute on function public.void_payout(uuid) from public, anon;
grant execute on function public.void_payout(uuid) to authenticated;
