-- ⚠⚠ Rule 9: MONEY (additions are paid, a withdrawal can refund through Cashfree)
-- and RLS (two new tables, one SELECT policy each). 3 Oct 2026, the user:
--   "better way to manage enquiry — 1. send enquiry remains same. 2. accept or
--    reject enquiry and person who sent notified. 3. send quote — should have item
--    add name and quantity which gives price for the quote or full amount directly.
--    4. then it goes to the person to accept or reject or completely withdraw
--    enquiry … 5. now on going project — should be able to add to the current
--    quote … 6. option to complete project by both parties but gets closed only
--    after both have confirmed. 7. if asked for revised quote the history is
--    tracked. 8. advance logic remains the same."
-- and every answer that followed (the agreed spec, in order):
--   * the business ACCEPTS or DECLINES an enquiry; a decline carries a reason
--   * a quote is LINE ITEMS (name · whole quantity · whole-rupee unit price, up to
--     30) or ONE TOTAL, plus the advance % and a VALID UNTIL date (default 7 days);
--     an expired quote cannot be accepted — derived on read, no cron
--   * the sender ACCEPTS the whole quote, asks for a REVISION with a reason, or
--     WITHDRAWS; the history and every reason are kept
--   * ADDITIONS at any stage until completion, negative lines allowed but never
--     below what is already paid; accepted → its own payment, due at once;
--     declined with a reason → the business may send a revised one
--   * COMPLETION: either side marks it, the other confirms; it closes only when
--     both have, every due is paid and no addition is unanswered; no auto-close
--   * WITHDRAWAL / CALLING OFF: before any money, instant with a reason; after, a
--     REFUND PROPOSAL (full, part, none — capped at what was paid) the other side
--     accepts, counters or refuses; one open at a time; refused leaves it open.
--     The refund goes back online first, up to what was paid online, and the rest
--     is recorded by hand; a crew is always by hand
--   * statuses New → Accepted → Quoted → Ongoing → (Advance paid → Paid, read off
--     the money) → Completing → Completed; endings Declined · Withdrawn · Called off
--   * owners and managers work an enquiry (a crew's leader); every step tells the
--     other side
--
-- ⚠ No begin/commit (Rule 18): db push wraps the file already.
-- ⚠ Every new function's grants are stated at the foot (16 Sep 2026).

-- ═══ 1 · THE SHAPE ═══════════════════════════════════════════════════════════

-- the enquiry's stages: the new road and its three endings, with every legacy word
-- kept so the rows already closed under them still satisfy the CHECK
alter table public.enquiries drop constraint enquiries_status_check;
alter table public.enquiries add constraint enquiries_status_check check (status in (
  'new', 'accepted', 'quoted', 'ongoing', 'completing', 'completed',
  'declined', 'withdrawn', 'called_off',
  -- legacy, written by nothing from here on
  'in_talks', 'confirmed', 'advance_paid', 'paid', 'lost', 'cancelled'
));
alter table public.enquiries add column if not exists close_reason text
  check (close_reason is null or char_length(close_reason) between 1 and 500);
alter table public.enquiries add column if not exists complete_asked_side text
  check (complete_asked_side is null or complete_asked_side in ('sender', 'business'));
alter table public.enquiries add column if not exists complete_asked_by uuid;
alter table public.enquiries add column if not exists complete_asked_at timestamptz;
comment on column public.enquiries.close_reason is
  'Why it ended (3 Oct 2026): the business''s reason for declining, or the reason given when it was withdrawn or called off.';
comment on column public.enquiries.complete_asked_side is
  'Which side marked the project complete first (3 Oct 2026). The other side''s confirmation closes it. No foreign key on complete_asked_by — an audit column.';

-- the enquiries in flight move onto the new road. Counted on production before
-- writing this: in_talks 2, confirmed 1, advance_paid 7, paid 0 (all live).
update public.enquiries set status = 'accepted' where status = 'in_talks';
update public.enquiries set status = 'ongoing' where status in ('confirmed', 'advance_paid', 'paid');

-- a quote is the base QUOTE or an ADDITION to a project already on
alter table public.enquiry_quotes add column if not exists kind text not null default 'quote'
  check (kind in ('quote', 'addition'));
alter table public.enquiry_quotes add column if not exists valid_until date;
alter table public.enquiry_quotes add column if not exists note text
  check (note is null or char_length(note) between 1 and 300);
alter table public.enquiry_quotes add column if not exists answer_reason text
  check (answer_reason is null or char_length(answer_reason) between 1 and 500);
alter table public.enquiry_quotes add column if not exists answered_at timestamptz;
alter table public.enquiry_quotes add column if not exists revises uuid references public.enquiry_quotes (id) on delete set null;
-- the balance actually paid, stamped when it is — a discount can move it, so the
-- ledger must not re-derive it from the price later
alter table public.enquiry_quotes add column if not exists balance_paid_inr integer
  check (balance_paid_inr is null or balance_paid_inr >= 0);

alter table public.enquiry_quotes drop constraint enquiry_quotes_cost_inr_check;
alter table public.enquiry_quotes add constraint enquiry_quotes_cost_inr_check
  check ((kind = 'quote' and cost_inr > 0) or (kind = 'addition' and cost_inr <> 0));
alter table public.enquiry_quotes add constraint enquiry_quotes_addition_no_advance
  check (kind = 'quote' or (advance_pct = 0 and advance_inr = 0));
alter table public.enquiry_quotes drop constraint enquiry_quotes_status_check;
alter table public.enquiry_quotes add constraint enquiry_quotes_status_check
  check (status in ('sent', 'accepted', 'declined', 'superseded', 'cancelled'));

comment on column public.enquiry_quotes.kind is
  'quote: the price of the job (one live at a time). addition: something added to a project already on (3 Oct 2026) — may be negative (a reduction), is paid on its own, full_paid_at is when it was.';
comment on column public.enquiry_quotes.valid_until is
  'The last day the quote can be accepted (3 Oct 2026). Expiry is derived on read; null on quotes sent before it existed.';
comment on column public.enquiry_quotes.answer_reason is
  'The sender''s reason for asking for a revision (a quote) or declining (an addition).';

-- ── the lines a quote or an addition is built from ──
create table public.enquiry_quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.enquiry_quotes (id) on delete cascade,
  enquiry_id uuid not null references public.enquiries (id) on delete cascade,
  sort integer not null check (sort between 1 and 30),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  qty integer not null check (qty between 1 and 9999),
  unit_inr integer not null check (unit_inr <> 0 and unit_inr between -10000000 and 10000000),
  line_inr integer not null,
  constraint enquiry_quote_items_line check (line_inr = qty * unit_inr),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);
comment on table public.enquiry_quote_items is
  'A quote''s or an addition''s lines (3 Oct 2026): a name, a whole quantity and a whole-rupee unit price. A negative unit is a reduction, allowed on an addition only (the door decides). Written only by send_enquiry_quote / send_enquiry_addition.';
create unique index enquiry_quote_items_sort on public.enquiry_quote_items (quote_id, sort) where deleted_at is null;
create index enquiry_quote_items_enquiry_idx on public.enquiry_quote_items (enquiry_id) where deleted_at is null;
create trigger enquiry_quote_items_set_updated_at
  before update on public.enquiry_quote_items
  for each row execute function public.set_updated_at();

-- ── a withdrawal or call-off after money has moved: the terms of the refund ──
create table public.enquiry_endings (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries (id) on delete cascade,
  -- what the enquiry becomes if these terms are accepted — the ORIGINAL initiator's
  -- word, carried through every counter
  outcome text not null check (outcome in ('withdrawn', 'called_off')),
  side text not null check (side in ('sender', 'business')),
  proposed_by uuid not null,
  refund_inr integer not null check (refund_inr >= 0),
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'accepted', 'countered', 'refused', 'retracted')),
  counter_of uuid references public.enquiry_endings (id) on delete set null,
  answered_by uuid,
  answered_at timestamptz,
  answer_reason text check (answer_reason is null or char_length(answer_reason) between 1 and 500),
  -- set when accepted: how the refund went back
  refund_online_inr integer check (refund_online_inr is null or refund_online_inr >= 0),
  refund_hand_inr integer check (refund_hand_inr is null or refund_hand_inr >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);
comment on table public.enquiry_endings is
  'Proposed terms for ending an enquiry after money moved (3 Oct 2026): how much goes back. The other side accepts, counters (a new row, counter_of) or refuses. One open at a time. Accepted: the online part is refund rows on the enquiry''s orders, the rest refund_hand_inr, recorded as handed back. No foreign keys on the people — audit columns.';
create unique index enquiry_endings_one_open on public.enquiry_endings (enquiry_id) where status = 'open' and deleted_at is null;
create index enquiry_endings_enquiry_idx on public.enquiry_endings (enquiry_id, created_at) where deleted_at is null;
create trigger enquiry_endings_set_updated_at
  before update on public.enquiry_endings
  for each row execute function public.set_updated_at();

-- ── RLS: the two ends read; nobody writes directly ──
alter table public.enquiry_quote_items enable row level security;
alter table public.enquiry_endings enable row level security;
create policy "both ends read the lines"
  on public.enquiry_quote_items for select to authenticated
  using (exists (select 1 from public.enquiries e where e.id = enquiry_quote_items.enquiry_id
                   and (e.from_user_id = auth.uid() or public.is_enquiry_member(e.id))));
create policy "both ends read the endings"
  on public.enquiry_endings for select to authenticated
  using (exists (select 1 from public.enquiries e where e.id = enquiry_endings.enquiry_id
                   and (e.from_user_id = auth.uid() or public.is_enquiry_member(e.id))));
revoke all on table public.enquiry_quote_items from public, anon, authenticated;
revoke all on table public.enquiry_endings from public, anon, authenticated;
grant select on table public.enquiry_quote_items to authenticated;
grant select on table public.enquiry_endings to authenticated;
grant all on table public.enquiry_quote_items to service_role;
grant all on table public.enquiry_endings to service_role;

-- an addition may be paid online too
alter table public.orders drop constraint if exists orders_enquiry_part_check;
alter table public.orders add constraint orders_enquiry_part_check
  check (enquiry_part is null or enquiry_part in ('advance', 'balance', 'full', 'addition'));

-- ═══ 2 · HELPERS ═════════════════════════════════════════════════════════════

-- who may WORK an enquiry: a business's owners and managers, or a crew's leader.
-- (Reading it is still every member — is_enquiry_member — as before.)
create or replace function public.can_work_enquiry(p_enquiry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.enquiries e
     where e.id = p_enquiry_id and e.deleted_at is null
       and ((e.business_id is not null and public.runs_business(e.business_id))
         or (e.crew_id is not null and exists (
              select 1 from public.crews c where c.id = e.crew_id and c.leader_id = auth.uid() and c.deleted_at is null)))
  );
$$;

-- which end the caller is on: 'sender', 'business', or null
create or replace function public.enquiry_side(p_enquiry_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.enquiries e where e.id = p_enquiry_id and e.deleted_at is null and e.from_user_id = auth.uid()) then 'sender'
    when public.can_work_enquiry(p_enquiry_id) then 'business'
  end;
$$;

-- the name each side is called by in the other's notifications
create or replace function public.enquiry_party_name(p_enquiry_id uuid, p_side text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_enq public.enquiries;
  v text;
begin
  select * into v_enq from public.enquiries e where e.id = p_enquiry_id;
  if p_side = 'sender' then
    select p.full_name into v from public.profiles p where p.id = v_enq.from_user_id;
    return coalesce(v, 'They');
  end if;
  if v_enq.crew_id is not null then
    select c.name into v from public.crews c where c.id = v_enq.crew_id;
  else
    select b.name into v from public.businesses b where b.id = v_enq.business_id;
  end if;
  return coalesce(v, 'They');
end;
$$;

-- tell the side that is NOT p_from
create or replace function public.tell_enquiry_other(p_enquiry_id uuid, p_from text, p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_to uuid;
begin
  if p_from = 'business' then
    select e.from_user_id into v_to from public.enquiries e where e.id = p_enquiry_id;
    perform public.notify(v_to, 'enquiry', left(p_title, 160), left(p_body, 300), '/inbox/enquiries/' || p_enquiry_id::text);
  else
    perform public.tell_enquiry_receiver(p_enquiry_id, left(p_title, 160), left(p_body, 300));
  end if;
end;
$$;

-- the accepted base quote
create or replace function public.enquiry_base_quote(p_enquiry_id uuid)
returns public.enquiry_quotes
language sql
stable
security definer
set search_path = ''
as $$
  select q.* from public.enquiry_quotes q
   where q.enquiry_id = p_enquiry_id and q.kind = 'quote' and q.status = 'accepted' and q.deleted_at is null
   order by q.n desc limit 1;
$$;

-- what the base still asks for after the advance: price − advance + every accepted
-- REDUCTION. With no advance it is the whole price after reductions.
create or replace function public.enquiry_base_balance(p_enquiry_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select q.cost_inr - q.advance_inr from public.enquiry_quotes q
                    where q.enquiry_id = p_enquiry_id and q.kind = 'quote' and q.status = 'accepted' and q.deleted_at is null
                    order by q.n desc limit 1), 0)
       + coalesce((select sum(a.cost_inr)::integer from public.enquiry_quotes a
                    where a.enquiry_id = p_enquiry_id and a.kind = 'addition' and a.status = 'accepted'
                      and a.cost_inr < 0 and a.deleted_at is null), 0);
$$;

-- THE MONEY OF ONE ENQUIRY, in one place, so a screen and every door agree
create or replace function public.enquiry_money(p_enquiry_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b public.enquiry_quotes;
  v_neg integer := 0;
  v_pos integer := 0;
  v_pos_paid integer := 0;
  v_sent integer := 0;
  v_bal integer := 0;
  v_paid integer := 0;
  v_total integer := 0;
  v_online integer := 0;
  v_adv_due integer := 0;
  v_bal_paid boolean := false;
begin
  if auth.uid() is not null and public.enquiry_side(p_enquiry_id) is null and not public.is_enquiry_member(p_enquiry_id) then
    raise exception 'not your enquiry';
  end if;
  b := public.enquiry_base_quote(p_enquiry_id);
  select coalesce(sum(cost_inr) filter (where cost_inr < 0), 0),
         coalesce(sum(cost_inr) filter (where cost_inr > 0), 0),
         coalesce(sum(cost_inr) filter (where cost_inr > 0 and full_paid_at is not null), 0)
    into v_neg, v_pos, v_pos_paid
    from public.enquiry_quotes
   where enquiry_id = p_enquiry_id and kind = 'addition' and status = 'accepted' and deleted_at is null;
  select count(*) into v_sent from public.enquiry_quotes
   where enquiry_id = p_enquiry_id and kind = 'addition' and status = 'sent' and deleted_at is null;
  if b.id is not null then
    v_bal := b.cost_inr - b.advance_inr + v_neg;
    v_bal_paid := b.full_paid_at is not null;
    v_adv_due := case when b.advance_inr > 0 and b.advance_paid_at is null then b.advance_inr else 0 end;
    v_paid := case when b.advance_paid_at is not null then b.advance_inr else 0 end
            + case when v_bal_paid then coalesce(b.balance_paid_inr, greatest(b.cost_inr - b.advance_inr, 0)) else 0 end;
    v_total := b.cost_inr + v_neg + v_pos;
  end if;
  v_paid := v_paid + v_pos_paid;
  -- what DanceOS still holds online for this enquiry: captured payments on its
  -- orders less every refund already filed against them
  select coalesce(sum(p.amount_inr - coalesce((
           select sum(r.amount_inr) from public.refunds r
            where r.payment_id = p.id and r.status not in ('declined', 'failed') and r.deleted_at is null), 0)), 0)
    into v_online
    from public.payments p
    join public.orders o on o.id = p.order_id
    join public.enquiry_quotes q on q.id = o.enquiry_quote_id
   where q.enquiry_id = p_enquiry_id and p.status <> 'failed' and p.deleted_at is null;
  return jsonb_build_object(
    'base_quote_id', b.id,
    'total_inr', v_total,
    'paid_inr', v_paid,
    'outstanding_inr', greatest(v_total - v_paid, 0),
    'advance_due_inr', v_adv_due,
    'balance_inr', v_bal,
    'balance_paid', v_bal_paid,
    'additions_due_inr', v_pos - v_pos_paid,
    'additions_waiting', v_sent,
    'online_held_inr', greatest(v_online, 0),
    'ready_to_complete', (b.id is not null and v_bal_paid and v_pos = v_pos_paid and v_sent = 0)
  );
end;
$$;

-- validates a list of lines and returns its total (raises in words)
create or replace function public.enquiry_lines_total(p_items jsonb, p_allow_negative boolean)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_n integer;
  v_total bigint := 0;
  r record;
begin
  if p_items is null or p_items = 'null'::jsonb then
    return null;
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'the lines must be a list';
  end if;
  v_n := jsonb_array_length(p_items);
  if v_n = 0 then
    return null;
  end if;
  if v_n > 30 then
    raise exception 'a quote takes up to 30 lines';
  end if;
  for r in select * from jsonb_to_recordset(p_items) as x(name text, qty integer, unit_inr integer) loop
    if r.name is null or char_length(btrim(r.name)) not between 1 and 80 then
      raise exception 'every line needs a name (up to 80 characters)';
    end if;
    if r.qty is null or r.qty not between 1 and 9999 then
      raise exception 'a quantity is a whole number from 1 to 9999';
    end if;
    if r.unit_inr is null or r.unit_inr = 0 or abs(r.unit_inr) > 10000000 then
      raise exception 'every line needs a price in whole rupees';
    end if;
    if r.unit_inr < 0 and not p_allow_negative then
      raise exception 'a quote''s lines are prices — a reduction belongs on an addition';
    end if;
    v_total := v_total + r.qty::bigint * r.unit_inr;
  end loop;
  if abs(v_total) > 100000000 then
    raise exception 'that total is over ₹10 crore';
  end if;
  return v_total::integer;
end;
$$;

create or replace function public.enquiry_lines_write(p_quote_id uuid, p_enquiry_id uuid, p_items jsonb, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return;
  end if;
  insert into public.enquiry_quote_items (quote_id, enquiry_id, sort, name, qty, unit_inr, line_inr, created_by, updated_by)
  select p_quote_id, p_enquiry_id, x.ord::integer, btrim(x.name), x.qty, x.unit_inr, x.qty * x.unit_inr, p_actor, p_actor
    from rows from (jsonb_to_recordset(p_items) as (name text, qty integer, unit_inr integer))
         with ordinality as x(name, qty, unit_inr, ord);
end;
$$;

-- the IST day, for valid-until
create or replace function public.ist_today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'Asia/Kolkata')::date; $$;

-- what an ending does to the open things on an enquiry
create or replace function public.enquiry_close_loose_ends(p_enquiry_id uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.enquiry_quotes set status = 'superseded', updated_by = p_actor
   where enquiry_id = p_enquiry_id and kind = 'quote' and status = 'sent' and deleted_at is null;
  update public.enquiry_quotes set status = 'cancelled', updated_by = p_actor
   where enquiry_id = p_enquiry_id and kind = 'addition' and status = 'sent' and deleted_at is null;
end;
$$;

-- ⚠ MONEY: send up to p_amount back ONLINE, newest payment first, as refund rows
-- the app then puts on the rail (services/refundRail). Returns what it allocated.
-- refunds.user_id is the PAYER and created_by the ACTOR (30 Sep 2026).
create or replace function public.refund_enquiry_online(p_enquiry_id uuid, p_amount integer, p_reason text, p_actor uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_left integer := greatest(coalesce(p_amount, 0), 0);
  v_done integer := 0;
  v_take integer;
  r record;
begin
  for r in
    select p.id, p.order_id, p.business_id, p.user_id, p.provider,
           p.amount_inr - coalesce((select sum(x.amount_inr) from public.refunds x
                                     where x.payment_id = p.id and x.status not in ('declined', 'failed') and x.deleted_at is null), 0) as room
      from public.payments p
      join public.orders o on o.id = p.order_id
      join public.enquiry_quotes q on q.id = o.enquiry_quote_id
     where q.enquiry_id = p_enquiry_id and p.status <> 'failed' and p.deleted_at is null
     order by p.created_at desc
  loop
    exit when v_left <= 0;
    continue when r.room <= 0;
    v_take := least(r.room, v_left);
    insert into public.refunds (payment_id, order_id, business_id, user_id, provider, amount_inr, reason, status, created_by, updated_by)
    values (r.id, r.order_id, r.business_id, r.user_id, r.provider, v_take, left(p_reason, 500), 'pending', p_actor, p_actor);
    v_left := v_left - v_take;
    v_done := v_done + v_take;
  end loop;
  return v_done;
end;
$$;

-- ═══ 3 · THE DOORS ═══════════════════════════════════════════════════════════

-- the old doors whose shapes changed are dropped, not overloaded (Step 11)
drop function if exists public.answer_enquiry_quote(uuid, boolean);
drop function if exists public.send_enquiry_quote(uuid, integer, integer);
drop function if exists public.close_enquiry(uuid, text);
drop function if exists public.set_enquiry_status(uuid, text);

-- step 2 — the business accepts the enquiry or declines it with a reason
create or replace function public.respond_to_enquiry(p_enquiry_id uuid, p_accept boolean, p_reason text default null)
returns public.enquiries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_enq public.enquiries;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_name text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not public.can_work_enquiry(p_enquiry_id) then
    raise exception 'only its owners and managers can answer this enquiry';
  end if;
  select * into v_enq from public.enquiries e where e.id = p_enquiry_id and e.deleted_at is null for update;
  if v_enq.status <> 'new' then
    raise exception 'this enquiry has already been answered';
  end if;
  v_name := public.enquiry_party_name(p_enquiry_id, 'business');
  if coalesce(p_accept, false) then
    update public.enquiries set status = 'accepted', updated_by = v_user where id = p_enquiry_id returning * into v_enq;
    perform public.tell_enquiry_other(p_enquiry_id, 'business', v_name || ' accepted your enquiry', 'A quote follows from them.');
  else
    if v_reason is null then
      raise exception 'say why you are declining';
    end if;
    if char_length(v_reason) > 500 then
      raise exception 'keep the reason under 500 characters';
    end if;
    update public.enquiries
       set status = 'declined', close_reason = v_reason, closed_at = now(), closed_by = v_user, updated_by = v_user
     where id = p_enquiry_id returning * into v_enq;
    perform public.tell_enquiry_other(p_enquiry_id, 'business', v_name || ' declined your enquiry', v_reason);
  end if;
  return v_enq;
end;
$$;

-- step 3 — a quote: lines or one total, the advance, a valid-until date
create or replace function public.send_enquiry_quote(
  p_enquiry_id uuid,
  p_items jsonb,
  p_lump_inr integer,
  p_advance_pct integer,
  p_valid_until date default null,
  p_note text default null
)
returns public.enquiry_quotes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_enq public.enquiries;
  v_lines integer;
  v_cost integer;
  v_valid date;
  v_n integer;
  v_row public.enquiry_quotes;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not public.can_work_enquiry(p_enquiry_id) then
    raise exception 'only its owners and managers can quote this enquiry';
  end if;
  select * into v_enq from public.enquiries e where e.id = p_enquiry_id and e.deleted_at is null for update;
  if v_enq.status in ('ongoing', 'completing') then
    raise exception 'the project is on — send an addition instead of a new quote';
  end if;
  if v_enq.status not in ('new', 'accepted', 'quoted') then
    raise exception 'this enquiry is closed';
  end if;
  v_lines := public.enquiry_lines_total(p_items, false);
  if v_lines is not null and p_lump_inr is not null then
    raise exception 'a quote is its lines or one total, not both';
  end if;
  v_cost := coalesce(v_lines, p_lump_inr);
  if v_cost is null then
    raise exception 'add a line or a total';
  end if;
  if v_cost <= 0 then
    raise exception 'the total must be a positive amount';
  end if;
  if v_cost > 100000000 then
    raise exception 'that total is over ₹10 crore';
  end if;
  if p_advance_pct is null or p_advance_pct < 0 or p_advance_pct > 100 then
    raise exception 'the advance is a percentage';
  end if;
  v_valid := coalesce(p_valid_until, public.ist_today() + 7);
  if v_valid < public.ist_today() then
    raise exception 'a quote cannot be valid until a day that has passed';
  end if;
  if v_valid > public.ist_today() + 90 then
    raise exception 'a quote can stay open for 90 days at most';
  end if;
  if v_note is not null and char_length(v_note) > 300 then
    raise exception 'keep the note under 300 characters';
  end if;

  -- the waiting quote is SUPERSEDED, never erased — the history is the point
  update public.enquiry_quotes set status = 'superseded', updated_by = v_user
   where enquiry_id = p_enquiry_id and kind = 'quote' and status = 'sent' and deleted_at is null;
  select coalesce(max(q.n), 0) + 1 into v_n from public.enquiry_quotes q where q.enquiry_id = p_enquiry_id;
  insert into public.enquiry_quotes (enquiry_id, business_id, crew_id, n, kind, cost_inr, advance_pct, advance_inr,
                                     valid_until, note, created_by, updated_by)
  values (p_enquiry_id, v_enq.business_id, v_enq.crew_id, v_n, 'quote', v_cost, p_advance_pct,
          round(v_cost * p_advance_pct / 100.0)::integer, v_valid, v_note, v_user, v_user)
  returning * into v_row;
  perform public.enquiry_lines_write(v_row.id, p_enquiry_id, case when v_lines is null then null else p_items end, v_user);
  update public.enquiries set status = 'quoted', updated_by = v_user where id = p_enquiry_id;
  return v_row;
end;
$$;

-- step 5 — something added to a project already on (a reduction is a negative one)
create or replace function public.send_enquiry_addition(
  p_enquiry_id uuid,
  p_items jsonb,
  p_lump_inr integer,
  p_note text default null,
  p_revises uuid default null
)
returns public.enquiry_quotes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_enq public.enquiries;
  v_base public.enquiry_quotes;
  v_lines integer;
  v_cost integer;
  v_n integer;
  v_row public.enquiry_quotes;
  v_prev public.enquiry_quotes;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not public.can_work_enquiry(p_enquiry_id) then
    raise exception 'only its owners and managers can add to this project';
  end if;
  select * into v_enq from public.enquiries e where e.id = p_enquiry_id and e.deleted_at is null for update;
  if v_enq.status not in ('ongoing', 'completing') then
    raise exception 'an addition is for a project that is on — this one is not';
  end if;
  if exists (select 1 from public.enquiry_endings x where x.enquiry_id = p_enquiry_id and x.status = 'open' and x.deleted_at is null) then
    raise exception 'an ending is being agreed — settle that first';
  end if;
  v_lines := public.enquiry_lines_total(p_items, true);
  if v_lines is not null and p_lump_inr is not null then
    raise exception 'an addition is its lines or one amount, not both';
  end if;
  v_cost := coalesce(v_lines, p_lump_inr);
  if v_cost is null or v_cost = 0 then
    raise exception 'add a line or an amount';
  end if;
  if abs(v_cost) > 100000000 then
    raise exception 'that amount is over ₹10 crore';
  end if;
  if v_cost < 0 then
    v_base := public.enquiry_base_quote(p_enquiry_id);
    if v_base.full_paid_at is not null then
      raise exception 'the project is already paid in full — a reduction now would mean a refund';
    end if;
    if public.enquiry_base_balance(p_enquiry_id) + v_cost < 0 then
      raise exception 'that reduction is more than is left to pay (₹%)', public.enquiry_base_balance(p_enquiry_id);
    end if;
  end if;
  if p_revises is not null then
    select * into v_prev from public.enquiry_quotes q
     where q.id = p_revises and q.enquiry_id = p_enquiry_id and q.kind = 'addition' and q.deleted_at is null;
    if not found or v_prev.status <> 'declined' then
      raise exception 'only a declined addition can be revised';
    end if;
    if exists (select 1 from public.enquiry_quotes q where q.revises = p_revises and q.deleted_at is null) then
      raise exception 'that addition has already been revised';
    end if;
  end if;
  if v_note is not null and char_length(v_note) > 300 then
    raise exception 'keep the note under 300 characters';
  end if;

  select coalesce(max(q.n), 0) + 1 into v_n from public.enquiry_quotes q where q.enquiry_id = p_enquiry_id;
  insert into public.enquiry_quotes (enquiry_id, business_id, crew_id, n, kind, cost_inr, advance_pct, advance_inr,
                                     note, revises, created_by, updated_by)
  values (p_enquiry_id, v_enq.business_id, v_enq.crew_id, v_n, 'addition', v_cost, 0, 0, v_note, p_revises, v_user, v_user)
  returning * into v_row;
  perform public.enquiry_lines_write(v_row.id, p_enquiry_id, case when v_lines is null then null else p_items end, v_user);
  -- an unanswered addition means it cannot be complete: a completion mark lapses
  update public.enquiries
     set status = 'ongoing', complete_asked_side = null, complete_asked_by = null, complete_asked_at = null, updated_by = v_user
   where id = p_enquiry_id;
  return v_row;
end;
$$;

-- the business takes back an addition nobody has answered
create or replace function public.cancel_enquiry_addition(p_quote_id uuid)
returns public.enquiry_quotes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_q public.enquiry_quotes;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_q from public.enquiry_quotes q where q.id = p_quote_id and q.deleted_at is null for update;
  if not found or v_q.kind <> 'addition' then
    raise exception 'addition not found';
  end if;
  if not public.can_work_enquiry(v_q.enquiry_id) then
    raise exception 'only its owners and managers can take an addition back';
  end if;
  if v_q.status <> 'sent' then
    raise exception 'only an addition still waiting for an answer can be taken back';
  end if;
  update public.enquiry_quotes set status = 'cancelled', answered_at = now(), updated_by = v_user
   where id = p_quote_id returning * into v_q;
  perform public.tell_enquiry_other(v_q.enquiry_id, 'business',
    public.enquiry_party_name(v_q.enquiry_id, 'business') || ' took back an addition',
    'The ₹' || abs(v_q.cost_inr)::text || ' they proposed is withdrawn.');
  return v_q;
end;
$$;

-- step 4 — the sender answers a quote (accept · revise) or an addition (accept · decline)
create or replace function public.answer_enquiry_quote(p_quote_id uuid, p_answer text, p_reason text default null)
returns public.enquiry_quotes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_q public.enquiry_quotes;
  v_enq public.enquiries;
  v_base public.enquiry_quotes;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_who text;
  v_left integer;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_q from public.enquiry_quotes q where q.id = p_quote_id and q.deleted_at is null for update;
  if not found then
    raise exception 'quote not found';
  end if;
  select * into v_enq from public.enquiries e where e.id = v_q.enquiry_id and e.deleted_at is null for update;
  if v_enq.from_user_id <> v_user then
    raise exception 'only the person who was quoted can answer it';
  end if;
  if v_q.status <> 'sent' then
    raise exception 'this is no longer waiting for an answer';
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'keep the reason under 500 characters';
  end if;
  v_who := public.enquiry_party_name(v_enq.id, 'sender');

  if v_q.kind = 'quote' then
    if v_enq.status <> 'quoted' then
      raise exception 'this enquiry is closed';
    end if;
    if p_answer = 'accept' then
      if v_q.valid_until is not null and v_q.valid_until < public.ist_today() then
        raise exception 'this quote expired on % — ask for a revised one', to_char(v_q.valid_until, 'DD Mon');
      end if;
      update public.enquiry_quotes set status = 'accepted', answered_at = now(), updated_by = v_user
       where id = p_quote_id returning * into v_q;
      update public.enquiries set status = 'ongoing', updated_by = v_user where id = v_enq.id;
      perform public.tell_enquiry_other(v_enq.id, 'sender', v_who || ' accepted your quote of ₹' || v_q.cost_inr::text,
        case when v_q.advance_inr > 0 then 'The project is on. ₹' || v_q.advance_inr::text || ' is due as the advance.'
             else 'The project is on. Nothing is due up front.' end);
    elsif p_answer = 'revise' then
      if v_reason is null then
        raise exception 'say what should change';
      end if;
      update public.enquiry_quotes
         set status = 'declined', revision_asked_at = now(), answer_reason = v_reason, answered_at = now(), updated_by = v_user
       where id = p_quote_id returning * into v_q;
      update public.enquiries set status = 'accepted', updated_by = v_user where id = v_enq.id;
      perform public.tell_enquiry_other(v_enq.id, 'sender', v_who || ' asked for a revised quote', v_reason);
    else
      raise exception 'a quote is accepted, or a revision asked for';
    end if;
  else
    if v_enq.status not in ('ongoing', 'completing') then
      raise exception 'this project is not on any more';
    end if;
    if p_answer = 'accept' then
      if v_q.cost_inr < 0 then
        v_base := public.enquiry_base_quote(v_enq.id);
        if v_base.full_paid_at is not null then
          raise exception 'the project is already paid in full — a reduction now would mean a refund';
        end if;
        v_left := public.enquiry_base_balance(v_enq.id) + v_q.cost_inr;
        if v_left < 0 then
          raise exception 'that reduction is more than is left to pay';
        end if;
      end if;
      update public.enquiry_quotes set status = 'accepted', answered_at = now(), updated_by = v_user
       where id = p_quote_id returning * into v_q;
      -- a reduction that takes the balance to nothing settles it, once the advance is in
      if v_q.cost_inr < 0 and v_left = 0 and (v_base.advance_inr = 0 or v_base.advance_paid_at is not null) then
        update public.enquiry_quotes
           set full_paid_at = now(), advance_paid_at = coalesce(advance_paid_at, now()), balance_paid_inr = 0, updated_by = v_user
         where id = v_base.id;
      end if;
      perform public.tell_enquiry_other(v_enq.id, 'sender',
        v_who || case when v_q.cost_inr > 0 then ' accepted the addition of ₹' || v_q.cost_inr::text
                      else ' accepted the reduction of ₹' || abs(v_q.cost_inr)::text end,
        case when v_q.cost_inr > 0 then 'It is due now — online or recorded by hand.' else 'The balance is lower by that much.' end);
    elsif p_answer = 'decline' then
      if v_reason is null then
        raise exception 'say why you are declining';
      end if;
      update public.enquiry_quotes set status = 'declined', answer_reason = v_reason, answered_at = now(), updated_by = v_user
       where id = p_quote_id returning * into v_q;
      perform public.tell_enquiry_other(v_enq.id, 'sender', v_who || ' declined the addition of ₹' || abs(v_q.cost_inr)::text, v_reason);
    else
      raise exception 'an addition is accepted or declined';
    end if;
  end if;
  return v_q;
end;
$$;

-- step 6 — either side marks the project complete; the other confirms
create or replace function public.mark_enquiry_complete(p_enquiry_id uuid)
returns public.enquiries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_side text;
  v_enq public.enquiries;
  m jsonb;
  v_name text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  v_side := public.enquiry_side(p_enquiry_id);
  if v_side is null then
    raise exception 'only the two ends of an enquiry can complete it';
  end if;
  select * into v_enq from public.enquiries e where e.id = p_enquiry_id and e.deleted_at is null for update;
  if v_enq.status not in ('ongoing', 'completing') then
    raise exception 'only a project that is on can be completed';
  end if;
  if exists (select 1 from public.enquiry_endings x where x.enquiry_id = p_enquiry_id and x.status = 'open' and x.deleted_at is null) then
    raise exception 'an ending is being agreed — settle that first';
  end if;
  m := public.enquiry_money(p_enquiry_id);
  if (m ->> 'additions_waiting')::integer > 0 then
    raise exception 'an addition is still waiting for an answer';
  end if;
  if not (m ->> 'balance_paid')::boolean then
    raise exception 'the balance is still due (₹%) — completion waits for it', (m ->> 'outstanding_inr');
  end if;
  if (m ->> 'additions_due_inr')::integer > 0 then
    raise exception 'an addition is still unpaid (₹%)', (m ->> 'additions_due_inr');
  end if;
  v_name := public.enquiry_party_name(p_enquiry_id, v_side);

  if v_enq.status = 'ongoing' then
    update public.enquiries
       set status = 'completing', complete_asked_side = v_side, complete_asked_by = v_user, complete_asked_at = now(), updated_by = v_user
     where id = p_enquiry_id returning * into v_enq;
    perform public.tell_enquiry_other(p_enquiry_id, v_side, v_name || ' marked the project complete', 'Confirm it to close the project.');
  else
    if v_enq.complete_asked_side = v_side then
      raise exception 'you marked it complete — it is waiting for them to confirm';
    end if;
    update public.enquiries
       set status = 'completed', closed_at = now(), closed_by = v_user, updated_by = v_user
     where id = p_enquiry_id returning * into v_enq;
    perform public.tell_enquiry_other(p_enquiry_id, v_side, v_name || ' confirmed — the project is complete', 'It is under Completed in your Inbox.');
  end if;
  return v_enq;
end;
$$;

-- the other side says not yet (with a reason), or the side that marked it takes it back
create or replace function public.decline_enquiry_completion(p_enquiry_id uuid, p_reason text default null)
returns public.enquiries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_side text;
  v_enq public.enquiries;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_name text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  v_side := public.enquiry_side(p_enquiry_id);
  if v_side is null then
    raise exception 'only the two ends of an enquiry can answer this';
  end if;
  select * into v_enq from public.enquiries e where e.id = p_enquiry_id and e.deleted_at is null for update;
  if v_enq.status <> 'completing' then
    raise exception 'nobody has marked this project complete';
  end if;
  if v_enq.complete_asked_side <> v_side and v_reason is null then
    raise exception 'say what is not finished';
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'keep the reason under 500 characters';
  end if;
  update public.enquiries
     set status = 'ongoing', complete_asked_side = null, complete_asked_by = null, complete_asked_at = null, updated_by = v_user
   where id = p_enquiry_id returning * into v_enq;
  v_name := public.enquiry_party_name(p_enquiry_id, v_side);
  perform public.tell_enquiry_other(p_enquiry_id, v_side,
    case when v_reason is null then v_name || ' took back the completion' else v_name || ' says the project is not finished' end,
    coalesce(v_reason, 'The project is on again.'));
  return v_enq;
end;
$$;

-- withdraw (the sender) or call off (the business). Before money: instant. After:
-- the terms of the refund are proposed.
create or replace function public.end_enquiry(p_enquiry_id uuid, p_reason text, p_refund_inr integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_side text;
  v_enq public.enquiries;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_outcome text;
  v_paid integer;
  v_end public.enquiry_endings;
  v_name text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  v_side := public.enquiry_side(p_enquiry_id);
  if v_side is null then
    raise exception 'only the two ends of an enquiry can end it';
  end if;
  if v_reason is null then
    raise exception 'say why';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'keep the reason under 500 characters';
  end if;
  select * into v_enq from public.enquiries e where e.id = p_enquiry_id and e.deleted_at is null for update;
  if v_enq.status not in ('new', 'accepted', 'quoted', 'ongoing', 'completing') then
    raise exception 'this enquiry is already closed';
  end if;
  if v_side = 'business' and v_enq.status = 'new' then
    raise exception 'decline it instead — it has not been accepted yet';
  end if;
  if exists (select 1 from public.enquiry_endings x where x.enquiry_id = p_enquiry_id and x.status = 'open' and x.deleted_at is null) then
    raise exception 'an ending is already proposed — answer that one';
  end if;
  v_outcome := case v_side when 'sender' then 'withdrawn' else 'called_off' end;
  v_name := public.enquiry_party_name(p_enquiry_id, v_side);
  v_paid := (public.enquiry_money(p_enquiry_id) ->> 'paid_inr')::integer;

  if v_paid = 0 then
    perform public.enquiry_close_loose_ends(p_enquiry_id, v_user);
    update public.enquiries
       set status = v_outcome, close_reason = v_reason, closed_at = now(), closed_by = v_user,
           complete_asked_side = null, complete_asked_by = null, complete_asked_at = null, updated_by = v_user
     where id = p_enquiry_id;
    perform public.tell_enquiry_other(p_enquiry_id, v_side,
      v_name || case v_outcome when 'withdrawn' then ' withdrew the enquiry' else ' called off the enquiry' end, v_reason);
    return jsonb_build_object('closed', true, 'outcome', v_outcome);
  end if;

  if p_refund_inr is null or p_refund_inr < 0 or p_refund_inr > v_paid then
    raise exception 'the refund is between ₹0 and the ₹% paid', v_paid;
  end if;
  insert into public.enquiry_endings (enquiry_id, outcome, side, proposed_by, refund_inr, reason, created_by, updated_by)
  values (p_enquiry_id, v_outcome, v_side, v_user, p_refund_inr, v_reason, v_user, v_user)
  returning * into v_end;
  perform public.tell_enquiry_other(p_enquiry_id, v_side,
    v_name || case v_outcome when 'withdrawn' then ' wants to withdraw' else ' wants to call off the project' end,
    '₹' || p_refund_inr::text || ' back of the ₹' || v_paid::text || ' paid — accept, counter or refuse. ' || v_reason);
  return jsonb_build_object('closed', false, 'ending_id', v_end.id, 'outcome', v_outcome);
end;
$$;

-- the other side answers the terms: accept, counter with a new refund, or refuse
create or replace function public.answer_enquiry_ending(p_ending_id uuid, p_answer text, p_refund_inr integer default null, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_end public.enquiry_endings;
  v_enq public.enquiries;
  v_side text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_paid integer;
  v_online integer;
  v_hand integer;
  v_new public.enquiry_endings;
  v_name text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_end from public.enquiry_endings x where x.id = p_ending_id and x.deleted_at is null for update;
  if not found then
    raise exception 'not found';
  end if;
  select * into v_enq from public.enquiries e where e.id = v_end.enquiry_id and e.deleted_at is null for update;
  v_side := public.enquiry_side(v_enq.id);
  if v_side is null then
    raise exception 'only the two ends of an enquiry can answer this';
  end if;
  if v_end.status <> 'open' then
    raise exception 'these terms are no longer open';
  end if;
  if v_side = v_end.side then
    raise exception 'you proposed these terms — it is waiting for them';
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'keep the reason under 500 characters';
  end if;
  v_name := public.enquiry_party_name(v_enq.id, v_side);
  v_paid := (public.enquiry_money(v_enq.id) ->> 'paid_inr')::integer;

  if p_answer = 'accept' then
    -- ⚠ MONEY: online first, up to what DanceOS holds online; the rest by hand
    v_online := public.refund_enquiry_online(v_enq.id,
      least(v_end.refund_inr, (public.enquiry_money(v_enq.id) ->> 'online_held_inr')::integer),
      case v_end.outcome when 'withdrawn' then 'Enquiry withdrawn — agreed refund' else 'Project called off — agreed refund' end,
      v_user);
    v_hand := v_end.refund_inr - v_online;
    update public.enquiry_endings
       set status = 'accepted', answered_by = v_user, answered_at = now(), answer_reason = v_reason,
           refund_online_inr = v_online, refund_hand_inr = v_hand, updated_by = v_user
     where id = p_ending_id;
    perform public.enquiry_close_loose_ends(v_enq.id, v_user);
    update public.enquiries
       set status = v_end.outcome, close_reason = v_end.reason, closed_at = now(), closed_by = v_user,
           complete_asked_side = null, complete_asked_by = null, complete_asked_at = null, updated_by = v_user
     where id = v_enq.id;
    perform public.tell_enquiry_other(v_enq.id, v_side, v_name || ' agreed — the enquiry is closed',
      case when v_end.refund_inr = 0 then 'No refund.'
           else '₹' || v_end.refund_inr::text || ' goes back'
                || case when v_online > 0 then ' — ₹' || v_online::text || ' online' else '' end
                || case when v_hand > 0 then case when v_online > 0 then ', ₹' else ' — ₹' end || v_hand::text || ' by hand' else '' end
                || '.' end);
    return jsonb_build_object('closed', true, 'outcome', v_end.outcome, 'refund_online_inr', v_online, 'refund_hand_inr', v_hand);
  elsif p_answer = 'counter' then
    if p_refund_inr is null or p_refund_inr < 0 or p_refund_inr > v_paid then
      raise exception 'the refund is between ₹0 and the ₹% paid', v_paid;
    end if;
    update public.enquiry_endings set status = 'countered', answered_by = v_user, answered_at = now(), updated_by = v_user
     where id = p_ending_id;
    insert into public.enquiry_endings (enquiry_id, outcome, side, proposed_by, refund_inr, reason, counter_of, created_by, updated_by)
    values (v_enq.id, v_end.outcome, v_side, v_user, p_refund_inr, coalesce(v_reason, v_end.reason), v_end.id, v_user, v_user)
    returning * into v_new;
    perform public.tell_enquiry_other(v_enq.id, v_side, v_name || ' proposed different terms',
      '₹' || p_refund_inr::text || ' back of the ₹' || v_paid::text || ' paid — accept, counter or refuse.');
    return jsonb_build_object('closed', false, 'ending_id', v_new.id);
  elsif p_answer = 'refuse' then
    if v_reason is null then
      raise exception 'say why you are refusing';
    end if;
    update public.enquiry_endings
       set status = 'refused', answered_by = v_user, answered_at = now(), answer_reason = v_reason, updated_by = v_user
     where id = p_ending_id;
    perform public.tell_enquiry_other(v_enq.id, v_side, v_name || ' refused the terms — the project stays open',
      v_reason || ' If you cannot agree, message DanceOS from Settings.');
    return jsonb_build_object('closed', false, 'refused', true);
  else
    raise exception 'terms are accepted, countered or refused';
  end if;
end;
$$;

-- the side that proposed the terms takes them back
create or replace function public.retract_enquiry_ending(p_ending_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_end public.enquiry_endings;
  v_side text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_end from public.enquiry_endings x where x.id = p_ending_id and x.deleted_at is null for update;
  if not found then
    raise exception 'not found';
  end if;
  v_side := public.enquiry_side(v_end.enquiry_id);
  if v_side is null or v_side <> v_end.side then
    raise exception 'only the side that proposed these terms can take them back';
  end if;
  if v_end.status <> 'open' then
    raise exception 'these terms are no longer open';
  end if;
  update public.enquiry_endings set status = 'retracted', answered_by = v_user, answered_at = now(), updated_by = v_user
   where id = p_ending_id;
  perform public.tell_enquiry_other(v_end.enquiry_id, v_side,
    public.enquiry_party_name(v_end.enquiry_id, v_side) || ' took back their proposal to end it', 'The project carries on.');
end;
$$;

-- ═══ 4 · MONEY: ORDERS, CAPTURES, HAND RECORDS ═══════════════════════════════

-- ⚠ THE AMOUNT AND THE PART ARE THE DATABASE'S, NEVER THE CLIENT'S (Step 9)
create or replace function public.create_enquiry_payment_order(p_quote_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_q public.enquiry_quotes;
  v_enq public.enquiries;
  v_part text;
  v_amount integer;
  v_row public.orders;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_q from public.enquiry_quotes q where q.id = p_quote_id and q.deleted_at is null;
  if not found then
    raise exception 'quote not found';
  end if;
  select * into v_enq from public.enquiries e where e.id = v_q.enquiry_id and e.deleted_at is null;
  if v_enq.from_user_id is distinct from v_user then
    raise exception 'only the person who asked pays for an enquiry';
  end if;
  if v_enq.status not in ('ongoing', 'completing') then
    raise exception 'only a project that is on is paid for';
  end if;
  if exists (select 1 from public.enquiry_endings x where x.enquiry_id = v_enq.id and x.status = 'open' and x.deleted_at is null) then
    raise exception 'an ending is being agreed — settle that first';
  end if;
  if v_enq.business_id is null then
    raise exception 'a crew is paid directly — settle with them and they will record it';
  end if;
  if v_q.status <> 'accepted' then
    raise exception 'only an accepted quote or addition is paid';
  end if;
  if v_q.kind = 'addition' then
    if v_q.cost_inr <= 0 then
      raise exception 'a reduction is not paid — it lowers the balance';
    end if;
    if v_q.full_paid_at is not null then
      raise exception 'this addition is already paid';
    end if;
    v_part := 'addition';
    v_amount := v_q.cost_inr;
  else
    if v_q.full_paid_at is not null then
      raise exception 'this quote is already paid in full';
    end if;
    if v_q.advance_inr > 0 and v_q.advance_paid_at is null then
      v_part := 'advance';
      v_amount := v_q.advance_inr;
    else
      v_part := case when v_q.advance_inr > 0 then 'balance' else 'full' end;
      v_amount := public.enquiry_base_balance(v_enq.id);
    end if;
  end if;
  if v_amount <= 0 then
    raise exception 'nothing is left to pay on this';
  end if;
  insert into public.orders (business_id, user_id, enquiry_quote_id, enquiry_part, amount_inr, status, created_by, updated_by)
  values (v_enq.business_id, v_user, v_q.id, v_part, v_amount, 'created', v_user, v_user)
  returning * into v_row;
  return v_row;
end;
$$;

-- marks a part paid; shared by the capture and the hand record
create or replace function public.enquiry_mark_paid(p_quote_id uuid, p_part text, p_amount integer, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_q public.enquiry_quotes;
begin
  select * into v_q from public.enquiry_quotes where id = p_quote_id;
  if p_part = 'addition' then
    update public.enquiry_quotes set full_paid_at = now(), updated_by = p_actor where id = p_quote_id;
  elsif p_part = 'advance' then
    -- the advance settles the whole thing when nothing is left after it
    update public.enquiry_quotes
       set advance_paid_at = now(),
           full_paid_at = case when public.enquiry_base_balance(v_q.enquiry_id) <= 0 then now() else full_paid_at end,
           balance_paid_inr = case when public.enquiry_base_balance(v_q.enquiry_id) <= 0 then 0 else balance_paid_inr end,
           updated_by = p_actor
     where id = p_quote_id;
  else
    update public.enquiry_quotes
       set full_paid_at = now(), advance_paid_at = coalesce(advance_paid_at, now()), balance_paid_inr = p_amount, updated_by = p_actor
     where id = p_quote_id;
  end if;
end;
$$;

-- the capture's applier: under the locks, re-check everything; refund rather than
-- mark a part paid twice or take an amount the money no longer asks for
create or replace function public.apply_enquiry_payment(p_order_id uuid, p_payment_id uuid, p_amount_paise bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_q public.enquiry_quotes;
  v_enq public.enquiries;
  v_why text := null;
  v_refund uuid;
  v_who text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  select * into v_q from public.enquiry_quotes q where q.id = v_order.enquiry_quote_id for update;
  select * into v_enq from public.enquiries e where e.id = v_q.enquiry_id for update;

  if v_order.status <> 'created' then
    v_why := 'payment landed on a closed order';
  elsif p_amount_paise <> v_order.amount_inr::bigint * 100 then
    v_why := 'amount did not match the order';
  elsif v_q.id is null or v_q.deleted_at is not null or v_enq.deleted_at is not null then
    v_why := 'the quote no longer exists';
  elsif v_q.status <> 'accepted' then
    v_why := 'it stopped being accepted before the payment landed';
  elsif v_enq.status not in ('ongoing', 'completing') then
    v_why := 'the enquiry was closed before the payment landed';
  elsif v_order.enquiry_part = 'addition' and v_q.full_paid_at is not null then
    v_why := 'this addition was already paid';
  elsif v_order.enquiry_part = 'advance' and v_q.advance_paid_at is not null then
    v_why := 'the advance was already paid';
  elsif v_order.enquiry_part in ('balance', 'full') and v_q.full_paid_at is not null then
    v_why := 'this quote was already paid in full';
  elsif v_order.enquiry_part in ('balance', 'full') and v_order.amount_inr <> public.enquiry_base_balance(v_enq.id) then
    v_why := 'the amount due changed before the payment landed';
  end if;

  if v_why is not null then
    update public.orders set status = 'refund_pending', updated_by = v_order.user_id where id = v_order.id;
    insert into public.refunds (order_id, payment_id, business_id, user_id, amount_inr, status, reason, created_by, updated_by)
    values (v_order.id, p_payment_id, v_order.business_id, v_order.user_id, v_order.amount_inr, 'pending', v_why, v_order.user_id, v_order.user_id)
    returning id into v_refund;
    return jsonb_build_object('outcome', 'refund_pending', 'reason', v_why, 'refund_id', v_refund);
  end if;

  perform public.enquiry_mark_paid(v_q.id, v_order.enquiry_part, v_order.amount_inr, v_order.user_id);
  update public.orders set status = 'paid', updated_by = v_order.user_id where id = v_order.id;

  select p.full_name into v_who from public.profiles p where p.id = v_order.user_id;
  perform public.tell_enquiry_receiver(v_enq.id,
    coalesce(v_who, 'They') || ' paid ₹' || v_order.amount_inr::text
      || case v_order.enquiry_part when 'advance' then ' — the advance' when 'balance' then ' — the balance'
                                   when 'addition' then ' — an addition' else '' end,
    'Paid online through DanceOS.');
  return jsonb_build_object('outcome', 'paid', 'quote_id', v_q.id, 'enquiry_id', v_enq.id);
end;
$$;

-- money received BY HAND (cash, bank) — the business records it; the payer is told
create or replace function public.record_enquiry_payment(p_quote_id uuid, p_part text)
returns public.enquiry_quotes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_q public.enquiry_quotes;
  v_enq public.enquiries;
  v_amount integer;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_part not in ('advance', 'balance', 'full', 'addition') then
    raise exception 'unknown part';
  end if;
  select * into v_q from public.enquiry_quotes q where q.id = p_quote_id and q.deleted_at is null for update;
  if not found then
    raise exception 'quote not found';
  end if;
  if not public.can_work_enquiry(v_q.enquiry_id) then
    raise exception 'only its owners and managers record what was received';
  end if;
  if v_q.status <> 'accepted' then
    raise exception 'only an accepted quote or addition can be paid';
  end if;
  select * into v_enq from public.enquiries e where e.id = v_q.enquiry_id for update;
  if v_enq.status not in ('ongoing', 'completing') then
    raise exception 'only a project that is on is paid for';
  end if;

  if p_part = 'addition' then
    if v_q.kind <> 'addition' or v_q.cost_inr <= 0 then
      raise exception 'that is not an addition to be paid';
    end if;
    if v_q.full_paid_at is not null then
      raise exception 'this addition is already recorded';
    end if;
    v_amount := v_q.cost_inr;
  elsif v_q.kind <> 'quote' then
    raise exception 'record an addition as an addition';
  elsif p_part = 'advance' then
    if v_q.advance_inr <= 0 then
      raise exception 'this quote asks for no advance';
    end if;
    if v_q.advance_paid_at is not null then
      raise exception 'the advance is already recorded';
    end if;
    v_amount := v_q.advance_inr;
  else
    if v_q.full_paid_at is not null then
      raise exception 'this quote is already settled in full';
    end if;
    if v_q.advance_inr > 0 and v_q.advance_paid_at is null and p_part = 'balance' then
      raise exception 'record the advance first';
    end if;
    -- 'full' on a quote with an unpaid advance records both at once
    v_amount := public.enquiry_base_balance(v_enq.id)
              + case when v_q.advance_inr > 0 and v_q.advance_paid_at is null then v_q.advance_inr else 0 end;
    if v_amount <= 0 then
      raise exception 'nothing is left to pay on this quote';
    end if;
  end if;

  perform public.enquiry_mark_paid(p_quote_id, p_part, case when p_part in ('balance', 'full') then public.enquiry_base_balance(v_enq.id) else v_amount end, v_user);
  select * into v_q from public.enquiry_quotes where id = p_quote_id;
  perform public.tell_enquiry_other(v_enq.id, 'business',
    public.enquiry_party_name(v_enq.id, 'business') || ' recorded ₹' || v_amount::text || ' received',
    case p_part when 'advance' then 'The advance.' when 'balance' then 'The balance.' when 'addition' then 'An addition.' else 'The full amount.' end);
  return v_q;
end;
$$;

-- the quote notification: a quote names its validity; an addition says what it adds
create or replace function public.notify_enquiry_quote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_revised boolean;
begin
  if new.status <> 'sent' then
    return null;
  end if;
  v_name := public.enquiry_party_name(new.enquiry_id, 'business');
  if new.kind = 'addition' then
    perform public.tell_enquiry_other(new.enquiry_id, 'business',
      v_name || case when new.cost_inr > 0 then ' asked to add ₹' || new.cost_inr::text || ' to the project'
                     else ' offered ₹' || abs(new.cost_inr)::text || ' off the project' end,
      'Accept it, or decline it with a reason.');
  else
    select exists (select 1 from public.enquiry_quotes q where q.enquiry_id = new.enquiry_id and q.kind = 'quote' and q.n < new.n)
      into v_revised;
    perform public.tell_enquiry_other(new.enquiry_id, 'business',
      v_name || case when v_revised then ' sent a revised quote · ₹' else ' sent a quote · ₹' end || new.cost_inr::text,
      'Accept it, ask for a revision, or withdraw'
        || case when new.valid_until is not null then ' — valid until ' || to_char(new.valid_until, 'DD Mon') else '' end || '.');
  end if;
  return null;
end;
$$;

-- ═══ 5 · GRANTS ══════════════════════════════════════════════════════════════
-- a new function arrives with the database's default privileges (anon included,
-- 16 Sep 2026): every one is stated. The doors are authenticated's; the helpers
-- and the money internals no client role's.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.respond_to_enquiry(uuid, boolean, text)',
    'public.send_enquiry_quote(uuid, jsonb, integer, integer, date, text)',
    'public.send_enquiry_addition(uuid, jsonb, integer, text, uuid)',
    'public.cancel_enquiry_addition(uuid)',
    'public.answer_enquiry_quote(uuid, text, text)',
    'public.mark_enquiry_complete(uuid)',
    'public.decline_enquiry_completion(uuid, text)',
    'public.end_enquiry(uuid, text, integer)',
    'public.answer_enquiry_ending(uuid, text, integer, text)',
    'public.retract_enquiry_ending(uuid)',
    'public.enquiry_money(uuid)',
    'public.create_enquiry_payment_order(uuid)',
    'public.record_enquiry_payment(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.can_work_enquiry(uuid)',
    'public.enquiry_side(uuid)',
    'public.enquiry_party_name(uuid, text)',
    'public.tell_enquiry_other(uuid, text, text, text)',
    'public.enquiry_base_quote(uuid)',
    'public.enquiry_base_balance(uuid)',
    'public.enquiry_lines_total(jsonb, boolean)',
    'public.enquiry_lines_write(uuid, uuid, jsonb, uuid)',
    'public.ist_today()',
    'public.enquiry_close_loose_ends(uuid, uuid)',
    'public.refund_enquiry_online(uuid, integer, text, uuid)',
    'public.enquiry_mark_paid(uuid, text, integer, uuid)',
    'public.apply_enquiry_payment(uuid, uuid, bigint)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
