-- Step 18 (Inbox): enquiries + quotes. ⚠ money-adjacent.
--
-- The prototype's Inbox is two desks that count what is waiting on you:
-- Requests (asks to be put on a class or a team — rows that already exist here
-- as class_claims and tenant_invites) and ENQUIRIES — the five-type enquiry
-- system (ENQ_TYPES 4900-4923): celebrations, corporate, invite as judge,
-- private sessions, collaboration. Somebody sends one from a business's public
-- page; the business answers it with a QUOTE; the sender accepts or declines;
-- money follows.
--
-- The prototype's own correction is the design here (4939-4952): "A QUOTE IS A
-- CONVERSATION, NOT A FIELD. ENQ_QUOTES[id] used to hold ONE object, overwritten
-- on every send, and the only way it ever moved forward was the sender ticking
-- 'Mark advance paid' on their own screen. ... It is a LIST now, newest last,
-- and each entry carries its own status. Revising a price adds a quote rather
-- than erasing one." So quotes are rows, a revision SUPERSEDES the live one,
-- and the enquiry's stage is DERIVED from the live quote (enqStage 4977) rather
-- than typed twice.
--
-- What money does here, honestly: a quote is a number two parties agree on. The
-- advance and the balance are RECORDED as received by the business — the same
-- limit Step 13 draws for payouts ("DanceOS records it, it does not move the
-- money") — because the collecting rail (Razorpay) has no account yet. When it
-- does, the sender's "Pay the advance" becomes an order on Step 9's rail and
-- the capture stamps advance_paid_at itself; the columns are already here.

-- ── enquiries — one ask, from a person to a business ─────────────────────────
create table public.enquiries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  from_user_id uuid not null references public.profiles (id) on delete cascade,
  type_key text not null
    check (type_key in ('celebration', 'corporate', 'judge', 'private', 'collab')),
  -- the exact fields this type collects, as [label, value] pairs (ENQ_STORE 477)
  fields jsonb not null default '[]'::jsonb,
  dates date[] not null default '{}',
  where_text text,
  message text not null,
  -- how to reach the sender outside the app; optional, theirs to give
  mobile text,
  -- the manual stage the business sets (In talks, Lost); when a live quote
  -- exists the derived stage wins on screen (enqStage)
  status text not null default 'new'
    check (status in ('new', 'in_talks', 'quoted', 'advance_paid', 'confirmed', 'won', 'lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);

comment on table public.enquiries is
  'An enquiry sent from a public profile to a business: one of five types, the fields that type collects, dates, place, message. Answered with enquiry_quotes.';

create index enquiries_tenant_idx on public.enquiries (tenant_id, created_at desc) where deleted_at is null;
create index enquiries_sender_idx on public.enquiries (from_user_id, created_at desc) where deleted_at is null;

create trigger enquiries_set_updated_at
  before update on public.enquiries
  for each row execute function public.set_updated_at();

-- ── enquiry_quotes — the conversation about the price ─────────────────────────
create table public.enquiry_quotes (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- #1, #2 ... in the order sent; history is the point
  n integer not null check (n > 0),
  cost_inr integer not null check (cost_inr > 0),
  advance_pct integer not null default 0 check (advance_pct between 0 and 100),
  advance_inr integer not null default 0 check (advance_inr >= 0),
  status text not null default 'sent'
    check (status in ('sent', 'accepted', 'declined', 'superseded')),
  advance_paid_at timestamptz,
  full_paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);

comment on table public.enquiry_quotes is
  'A price put on an enquiry by the business. Revising supersedes the live quote instead of erasing it; the sender accepts or declines; advance and balance are recorded as received.';

create unique index enquiry_quotes_n on public.enquiry_quotes (enquiry_id, n);
create index enquiry_quotes_enquiry_idx on public.enquiry_quotes (enquiry_id) where deleted_at is null;

create trigger enquiry_quotes_set_updated_at
  before update on public.enquiry_quotes
  for each row execute function public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- The two ends of the enquiry read it: the person who sent it and the business
-- it went to. Nobody else — what somebody asked for and what they were quoted
-- is private business between them. No public policy; no direct writes.
alter table public.enquiries enable row level security;
alter table public.enquiry_quotes enable row level security;

create policy "senders read own enquiries"
  on public.enquiries for select
  to authenticated
  using (from_user_id = auth.uid());

create policy "members read their tenant's enquiries"
  on public.enquiries for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = enquiries.tenant_id
        and m.user_id = auth.uid()
        and m.deleted_at is null
    )
  );

create policy "both ends read the quotes"
  on public.enquiry_quotes for select
  to authenticated
  using (
    exists (
      select 1 from public.enquiries e
      where e.id = enquiry_quotes.enquiry_id
        and (
          e.from_user_id = auth.uid()
          or exists (
            select 1 from public.tenant_members m
            where m.tenant_id = e.tenant_id
              and m.user_id = auth.uid()
              and m.deleted_at is null
          )
        )
    )
  );

-- ── who may work an enquiry for a business ────────────────────────────────────
-- Every member: the enquiry desk is the studio's CRM and "staff answer the
-- phone" (Step 12's rule for leads). Payout approval is owner-only; quoting is
-- not a payout.
create or replace function public.is_enquiry_member(p_enquiry_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.enquiries e
    join public.tenant_members m on m.tenant_id = e.tenant_id
    where e.id = p_enquiry_id
      and e.deleted_at is null
      and m.user_id = auth.uid()
      and m.deleted_at is null
  );
$$;
revoke execute on function public.is_enquiry_member(uuid) from public, anon;
grant execute on function public.is_enquiry_member(uuid) to authenticated;

-- ── send_enquiry — from a public profile ──────────────────────────────────────
create or replace function public.send_enquiry(
  p_tenant_id uuid,
  p_type_key text,
  p_fields jsonb,
  p_dates date[],
  p_where text,
  p_message text,
  p_mobile text default null
)
returns public.enquiries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_tenant public.tenants;
  v_row public.enquiries;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user and p.deleted_at is null) then
    raise exception 'finish onboarding before sending an enquiry';
  end if;
  if p_type_key not in ('celebration', 'corporate', 'judge', 'private', 'collab') then
    raise exception 'unknown enquiry type';
  end if;
  if coalesce(array_length(p_dates, 1), 0) = 0 then
    raise exception 'add at least one date';
  end if;
  if length(trim(coalesce(p_message, ''))) = 0 then
    raise exception 'add a short message';
  end if;
  if jsonb_typeof(coalesce(p_fields, '[]'::jsonb)) <> 'array' then
    raise exception 'fields must be a list';
  end if;

  select * into v_tenant from public.tenants t where t.id = p_tenant_id and t.deleted_at is null;
  if not found then
    raise exception 'business not found';
  end if;
  if v_tenant.visibility <> 'listed' then
    raise exception 'this business is not open to the public';
  end if;
  -- "Invite as Judge" is a person's job (4934): offered to artists only
  if p_type_key = 'judge' and v_tenant.type <> 'trainer_business' then
    raise exception 'only an artist can be invited to judge';
  end if;
  -- you do not send yourself an enquiry
  if exists (
    select 1 from public.tenant_members m
    where m.tenant_id = p_tenant_id and m.user_id = v_user and m.deleted_at is null
  ) then
    raise exception 'you already belong to this business';
  end if;

  insert into public.enquiries (tenant_id, from_user_id, type_key, fields, dates, where_text, message, mobile, created_by, updated_by)
  values (p_tenant_id, v_user, p_type_key, coalesce(p_fields, '[]'::jsonb), p_dates,
          nullif(trim(coalesce(p_where, '')), ''), trim(p_message), nullif(trim(coalesce(p_mobile, '')), ''), v_user, v_user)
  returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.send_enquiry(uuid, text, jsonb, date[], text, text, text) from public, anon;
grant execute on function public.send_enquiry(uuid, text, jsonb, date[], text, text, text) to authenticated;

-- ── set_enquiry_status — the business moves the stage by hand ─────────────────
create or replace function public.set_enquiry_status(p_enquiry_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_status not in ('new', 'in_talks', 'quoted', 'advance_paid', 'confirmed', 'won', 'lost') then
    raise exception 'unknown stage';
  end if;
  if not public.is_enquiry_member(p_enquiry_id) then
    raise exception 'only the business this enquiry went to can move it';
  end if;
  update public.enquiries
    set status = p_status, updated_by = auth.uid()
    where id = p_enquiry_id and deleted_at is null;
end;
$$;
revoke execute on function public.set_enquiry_status(uuid, text) from public, anon;
grant execute on function public.set_enquiry_status(uuid, text) to authenticated;

-- ── send_enquiry_quote — a price, or a revised one ───────────────────────────
create or replace function public.send_enquiry_quote(p_enquiry_id uuid, p_cost_inr integer, p_advance_pct integer)
returns public.enquiry_quotes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_enq public.enquiries;
  v_n integer;
  v_row public.enquiry_quotes;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_enquiry_member(p_enquiry_id) then
    raise exception 'only the business this enquiry went to can quote it';
  end if;
  if p_cost_inr is null or p_cost_inr <= 0 then
    raise exception 'the cost must be a positive amount';
  end if;
  if p_advance_pct is null or p_advance_pct < 0 or p_advance_pct > 100 then
    raise exception 'the advance is a percentage';
  end if;
  select * into v_enq from public.enquiries e where e.id = p_enquiry_id and e.deleted_at is null;
  if v_enq.status in ('won', 'lost') then
    raise exception 'this enquiry is closed';
  end if;

  -- an older quote is not deleted, it is SUPERSEDED — the history is the point
  update public.enquiry_quotes
    set status = 'superseded', updated_by = v_user
    where enquiry_id = p_enquiry_id and status = 'sent' and deleted_at is null;

  select coalesce(max(q.n), 0) + 1 into v_n from public.enquiry_quotes q where q.enquiry_id = p_enquiry_id;

  insert into public.enquiry_quotes (enquiry_id, tenant_id, n, cost_inr, advance_pct, advance_inr, created_by, updated_by)
  values (p_enquiry_id, v_enq.tenant_id, v_n, p_cost_inr, p_advance_pct,
          round(p_cost_inr * p_advance_pct / 100.0)::integer, v_user, v_user)
  returning * into v_row;

  update public.enquiries set status = 'quoted', updated_by = v_user where id = p_enquiry_id;
  return v_row;
end;
$$;
revoke execute on function public.send_enquiry_quote(uuid, integer, integer) from public, anon;
grant execute on function public.send_enquiry_quote(uuid, integer, integer) to authenticated;

-- ── answer_enquiry_quote — only the person who was quoted can say yes ────────
create or replace function public.answer_enquiry_quote(p_quote_id uuid, p_accept boolean)
returns public.enquiry_quotes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_q public.enquiry_quotes;
  v_enq public.enquiries;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_q from public.enquiry_quotes q where q.id = p_quote_id and q.deleted_at is null;
  if not found then
    raise exception 'quote not found';
  end if;
  select * into v_enq from public.enquiries e where e.id = v_q.enquiry_id and e.deleted_at is null;
  if v_enq.from_user_id <> v_user then
    raise exception 'only the person who was quoted can answer it';
  end if;
  if v_q.status <> 'sent' then
    raise exception 'this quote is no longer open';
  end if;

  update public.enquiry_quotes
    set status = case when p_accept then 'accepted' else 'declined' end, updated_by = v_user
    where id = p_quote_id
    returning * into v_q;
  update public.enquiries
    set status = case when p_accept then 'confirmed' else 'lost' end, updated_by = v_user
    where id = v_enq.id;
  return v_q;
end;
$$;
revoke execute on function public.answer_enquiry_quote(uuid, boolean) from public, anon;
grant execute on function public.answer_enquiry_quote(uuid, boolean) to authenticated;

-- ── record_enquiry_payment — the business records what it received ───────────
-- ⚠ money. An advance or a balance received outside the app, recorded here by
-- the business — the same act as Step 13's "record a payout". When the rail is
-- switched on the capture will stamp these columns itself.
create or replace function public.record_enquiry_payment(p_quote_id uuid, p_part text)
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
  if p_part not in ('advance', 'balance', 'full') then
    raise exception 'unknown part';
  end if;
  select * into v_q from public.enquiry_quotes q where q.id = p_quote_id and q.deleted_at is null;
  if not found then
    raise exception 'quote not found';
  end if;
  if not public.is_enquiry_member(v_q.enquiry_id) then
    raise exception 'only the business can record what it received';
  end if;
  if v_q.status <> 'accepted' then
    raise exception 'only an accepted quote can be paid';
  end if;

  if p_part = 'advance' then
    if v_q.advance_inr <= 0 then
      raise exception 'this quote asks for no advance';
    end if;
    if v_q.advance_paid_at is not null then
      raise exception 'the advance is already recorded';
    end if;
    update public.enquiry_quotes
      set advance_paid_at = now(), updated_by = v_user where id = p_quote_id returning * into v_q;
    update public.enquiries set status = 'advance_paid', updated_by = v_user where id = v_q.enquiry_id;
  else
    if v_q.full_paid_at is not null then
      raise exception 'this quote is already settled in full';
    end if;
    update public.enquiry_quotes
      set full_paid_at = now(), advance_paid_at = coalesce(advance_paid_at, now()), updated_by = v_user
      where id = p_quote_id returning * into v_q;
    update public.enquiries set status = 'won', updated_by = v_user where id = v_q.enquiry_id;
  end if;
  return v_q;
end;
$$;
revoke execute on function public.record_enquiry_payment(uuid, text) from public, anon;
grant execute on function public.record_enquiry_payment(uuid, text) to authenticated;
