-- ⚠ Rule 9: MONEY (enquiry payments through the Cashfree rail) and RLS-adjacent
-- (four refusals on who may ask whom). 3 Oct 2026, the user:
--   "request and invite settings for inbox … when accepting or rejecting quote for
--    an enquiry should get option to resend again for the Revised Quote or Cancel
--    Enquiry completly to person who had sent the query. same closing enquiry
--    option should be with the person receiving it as well with option to do
--    completed status. payment for enquiry should connect to payments and take back
--    once payment is confirmed."
-- and their four answers: settings decide which kinds you ACCEPT (refused in the
-- database); the sender may Accept · Ask to revise · Cancel; the business closes as
-- Completed · Lost · Cancelled (Completed replaces Won); and payment is BOTH —
-- online through Cashfree, or recorded by hand as before.
--
-- ⚠ No begin/commit (Rule 18): db push wraps the file already.

-- ═══ 1 · INBOX SETTINGS ═══════════════════════════════════════════════════════
-- What is switched OFF is stored, so the default is "everything arrives" and a kind
-- added later arrives too until somebody turns it off.
alter table public.profiles add column if not exists inbox_off text[] not null default '{}';
alter table public.profiles add constraint profiles_inbox_off_shape
  check (inbox_off <@ array['teach', 'assist', 'team', 'crew']::text[]);
comment on column public.profiles.inbox_off is
  'The kinds of ask this person does not take (3 Oct 2026): teach / assist (a class), team (a business invite), crew (a crew ask). Empty = everything arrives. Refused at the row by guard_ask_switched_on.';

alter table public.businesses add column if not exists takes_room_requests boolean not null default true;
comment on column public.businesses.takes_room_requests is
  'Whether artists may ask this studio for a room (3 Oct 2026). Off refuses a new venue request in words; a request already made is untouched.';

create or replace function public.set_my_inbox_off(p_off text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text[];
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select coalesce(array_agg(distinct k order by k), '{}') into v from unnest(coalesce(p_off, '{}')) k;
  if not (v <@ array['teach', 'assist', 'team', 'crew']::text[]) then
    raise exception 'unknown kind of ask';
  end if;
  update public.profiles set inbox_off = v where id = auth.uid() and deleted_at is null;
  if not found then
    raise exception 'finish onboarding first';
  end if;
  return v;
end;
$$;

create or replace function public.set_room_requests(p_business_id uuid, p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_business_owner(p_business_id) then
    raise exception 'only the owner decides whether the studio takes room requests';
  end if;
  update public.businesses set takes_room_requests = coalesce(p_on, true)
   where id = p_business_id and deleted_at is null and type = 'studio';
  if not found then
    raise exception 'only a studio has rooms to ask for';
  end if;
  return coalesce(p_on, true);
end;
$$;

-- ONE GUARD FOR THE THREE TABLES AN ASK IS A ROW ON. A trigger rather than a
-- clause in each door, so every path that asks — an RPC, a re-ask, a crew made
-- with members named — meets the same refusal. The service role (seeders, proofs,
-- migrations) is exempt, and nobody is ever refused asking THEMSELVES.
create or replace function public.guard_ask_switched_on()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_to uuid;
  v_kind text;
  v_off text[];
  v_name text;
  v_by_email boolean := false;
begin
  if v_me is null then
    return new;
  end if;
  if tg_table_name = 'class_people' then
    if new.status <> 'asked' then
      return new;
    end if;
    if tg_op = 'UPDATE' and old.status = 'asked' and old.kind = new.kind and old.user_id = new.user_id then
      return new;
    end if;
    v_to := new.user_id;
    v_kind := case new.kind when 'artist' then 'teach' else 'assist' end;
  elsif tg_table_name = 'crew_members' then
    if new.status <> 'asked' then
      return new;
    end if;
    if tg_op = 'UPDATE' and old.status = 'asked' and old.user_id = new.user_id then
      return new;
    end if;
    v_to := new.user_id;
    v_kind := 'crew';
  elsif tg_table_name = 'business_invites' then
    if coalesce(new.status, 'pending') <> 'pending' then
      return new;
    end if;
    if tg_op = 'UPDATE' and old.status = 'pending' then
      return new;
    end if;
    v_to := new.user_id;
    if v_to is null and new.email is not null then
      v_by_email := true;
      select u.id into v_to from auth.users u where lower(u.email) = lower(new.email) limit 1;
    end if;
    v_kind := 'team';
  else
    return new;
  end if;

  if v_to is null or v_to = v_me then
    return new;
  end if;
  select p.inbox_off, p.full_name into v_off, v_name from public.profiles p where p.id = v_to and p.deleted_at is null;
  if v_off is null or not (v_kind = any (v_off)) then
    return new;
  end if;
  -- ⚠ an invite typed as an ADDRESS never learns the name behind it
  raise exception '% is not taking % right now',
    case when v_by_email then 'The person at that address' else coalesce(v_name, 'This person') end,
    case v_kind
      when 'teach' then 'asks to take a class'
      when 'assist' then 'asks to assist on a class'
      when 'team' then 'invitations to join a team'
      else 'invitations to join a crew'
    end;
end;
$$;

create trigger class_people_ask_switched_on
  before insert or update of status, kind, user_id on public.class_people
  for each row execute function public.guard_ask_switched_on();
create trigger crew_members_ask_switched_on
  before insert or update of status, user_id on public.crew_members
  for each row execute function public.guard_ask_switched_on();
create trigger business_invites_ask_switched_on
  before insert or update of status on public.business_invites
  for each row execute function public.guard_ask_switched_on();

-- A studio that takes no room requests. ⚠ The NAME orders it after
-- `classes_venue_changes_before`, which is what sets venue_status on a move —
-- BEFORE triggers on one event fire in name order.
create or replace function public.guard_room_requests_open()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.venue_business_id is null or new.venue_status is distinct from 'requested' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.venue_business_id is not distinct from new.venue_business_id
     and old.venue_status is not distinct from 'requested' then
    return new;
  end if;
  select b.name into v_name from public.businesses b where b.id = new.venue_business_id and not b.takes_room_requests;
  if found then
    raise exception '% is not taking room requests right now', coalesce(v_name, 'That studio');
  end if;
  return new;
end;
$$;

create trigger classes_venue_takes_requests
  before insert or update of venue_business_id, room_id, venue_status on public.classes
  for each row execute function public.guard_room_requests_open();

-- ═══ 2 · AN ENQUIRY CLOSES, AND COMPLETED REPLACES WON ════════════════════════
alter table public.enquiries drop constraint enquiries_status_check;
update public.enquiries set status = 'completed' where status = 'won';
alter table public.enquiries add constraint enquiries_status_check
  check (status in ('new', 'in_talks', 'quoted', 'confirmed', 'advance_paid', 'paid', 'completed', 'lost', 'cancelled'));
alter table public.enquiries add column if not exists closed_at timestamptz;
alter table public.enquiries add column if not exists closed_by uuid;
update public.enquiries set closed_at = updated_at, closed_by = updated_by
 where status in ('completed', 'lost') and closed_at is null;
comment on column public.enquiries.closed_by is
  'Who closed it (3 Oct 2026) — the sender (cancelled) or somebody on the business''s side. No foreign key: an audit column (19 Sep 2026).';

alter table public.enquiry_quotes add column if not exists revision_asked_at timestamptz;
comment on column public.enquiry_quotes.revision_asked_at is
  'Set when the person quoted declined this quote and asked for a revised one (3 Oct 2026). The enquiry stays open.';

-- who to tell on the receiving end: a crew's leader, or a business's owners
create or replace function public.tell_enquiry_receiver(p_enquiry_id uuid, p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enq public.enquiries;
  v_leader uuid;
begin
  select * into v_enq from public.enquiries e where e.id = p_enquiry_id;
  if v_enq.crew_id is not null then
    select c.leader_id into v_leader from public.crews c where c.id = v_enq.crew_id;
    if v_leader is not null then
      perform public.notify(v_leader, 'enquiry', p_title, p_body, '/inbox/enquiries/' || p_enquiry_id::text);
    end if;
  elsif v_enq.business_id is not null then
    perform public.notify_business_owners(v_enq.business_id, 'enquiry', p_title, p_body, '/inbox/enquiries/' || p_enquiry_id::text);
  end if;
end;
$$;

-- the sender answers a quote: accept it, or decline it and ASK FOR A REVISION —
-- which keeps the enquiry open (it closed as lost until today)
create or replace function public.answer_enquiry_quote(p_quote_id uuid, p_accept boolean)
 returns public.enquiry_quotes
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
  v_q public.enquiry_quotes;
  v_enq public.enquiries;
  v_who text;
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
  if v_enq.status in ('completed', 'lost', 'cancelled') then
    raise exception 'this enquiry is closed';
  end if;
  if v_q.status <> 'sent' then
    raise exception 'this quote is no longer open';
  end if;
  select p.full_name into v_who from public.profiles p where p.id = v_user;

  if p_accept then
    update public.enquiry_quotes set status = 'accepted', updated_by = v_user
     where id = p_quote_id returning * into v_q;
    update public.enquiries set status = 'confirmed', updated_by = v_user where id = v_enq.id;
    perform public.tell_enquiry_receiver(v_enq.id,
      coalesce(v_who, 'They') || ' accepted your quote of ₹' || v_q.cost_inr::text,
      case when v_q.advance_inr > 0 then '₹' || v_q.advance_inr::text || ' is due to start.' else 'Nothing is due up front.' end);
  else
    update public.enquiry_quotes set status = 'declined', revision_asked_at = now(), updated_by = v_user
     where id = p_quote_id returning * into v_q;
    update public.enquiries set status = 'in_talks', updated_by = v_user where id = v_enq.id;
    perform public.tell_enquiry_receiver(v_enq.id,
      coalesce(v_who, 'They') || ' asked for a revised quote',
      'Your quote of ₹' || v_q.cost_inr::text || ' was declined — send a revised one from the enquiry.');
  end if;
  return v_q;
end;
$function$;

-- the business's hand moves: only New and In talks now (reopening a closed
-- enquiry too, unless the sender cancelled it). Closing is close_enquiry.
create or replace function public.set_enquiry_status(p_enquiry_id uuid, p_status text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_enq public.enquiries;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_status not in ('new', 'in_talks') then
    raise exception 'close an enquiry as completed, lost or cancelled — the rest of its stages follow the quote';
  end if;
  if not public.is_enquiry_member(p_enquiry_id) then
    raise exception 'only the business this enquiry went to can move it';
  end if;
  select * into v_enq from public.enquiries e where e.id = p_enquiry_id and e.deleted_at is null;
  if v_enq.status = 'cancelled' and v_enq.closed_by = v_enq.from_user_id then
    raise exception 'they cancelled this enquiry — it cannot be reopened';
  end if;
  update public.enquiries
    set status = p_status, closed_at = null, closed_by = null, updated_by = auth.uid()
    where id = p_enquiry_id and deleted_at is null;
end;
$function$;

-- EITHER END CLOSES IT. The sender may only cancel, and only before any money has
-- changed hands; the business closes as completed, lost or cancelled.
create or replace function public.close_enquiry(p_enquiry_id uuid, p_outcome text)
returns public.enquiries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_enq public.enquiries;
  v_member boolean;
  v_paid boolean;
  v_who text;
  v_biz text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_outcome not in ('completed', 'lost', 'cancelled') then
    raise exception 'an enquiry closes as completed, lost or cancelled';
  end if;
  select * into v_enq from public.enquiries e where e.id = p_enquiry_id and e.deleted_at is null for update;
  if not found then
    raise exception 'enquiry not found';
  end if;
  v_member := public.is_enquiry_member(p_enquiry_id);
  if not v_member and v_enq.from_user_id <> v_user then
    raise exception 'only the two ends of an enquiry can close it';
  end if;
  if v_enq.status in ('completed', 'lost', 'cancelled') then
    raise exception 'this enquiry is already closed';
  end if;
  if not v_member then
    if p_outcome <> 'cancelled' then
      raise exception 'you can cancel your enquiry — completing it or closing it as lost is theirs';
    end if;
    select exists (
      select 1 from public.enquiry_quotes q
       where q.enquiry_id = p_enquiry_id and q.deleted_at is null
         and (q.advance_paid_at is not null or q.full_paid_at is not null)
    ) into v_paid;
    if v_paid then
      raise exception 'a payment has been made on this enquiry — ask them to close it';
    end if;
  end if;

  -- a quote still waiting on an answer cannot be accepted once the enquiry is closed
  update public.enquiry_quotes set status = 'superseded', updated_by = v_user
   where enquiry_id = p_enquiry_id and status = 'sent' and deleted_at is null;
  update public.enquiries
     set status = p_outcome, closed_at = now(), closed_by = v_user, updated_by = v_user
   where id = p_enquiry_id
   returning * into v_enq;

  if v_member then
    if v_enq.crew_id is not null then
      select c.name into v_biz from public.crews c where c.id = v_enq.crew_id;
    else
      select b.name into v_biz from public.businesses b where b.id = v_enq.business_id;
    end if;
    perform public.notify(v_enq.from_user_id, 'enquiry',
      coalesce(v_biz, 'They') || case p_outcome
        when 'completed' then ' marked your enquiry completed'
        when 'lost' then ' closed your enquiry'
        else ' cancelled your enquiry' end,
      'It is under Completed in your Inbox.', '/inbox/enquiries/' || p_enquiry_id::text);
  else
    select p.full_name into v_who from public.profiles p where p.id = v_user;
    perform public.tell_enquiry_receiver(p_enquiry_id, coalesce(v_who, 'They') || ' cancelled their enquiry',
      'It is under Completed in your Inbox.');
  end if;
  return v_enq;
end;
$$;

-- a revision is refused only once the enquiry is CLOSED (its three words now)
create or replace function public.send_enquiry_quote(p_enquiry_id uuid, p_cost_inr integer, p_advance_pct integer)
 returns public.enquiry_quotes
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
  if v_enq.status in ('completed', 'lost', 'cancelled') then
    raise exception 'this enquiry is closed';
  end if;

  -- an older quote is not deleted, it is SUPERSEDED — the history is the point
  update public.enquiry_quotes
    set status = 'superseded', updated_by = v_user
    where enquiry_id = p_enquiry_id and status = 'sent' and deleted_at is null;

  select coalesce(max(q.n), 0) + 1 into v_n from public.enquiry_quotes q where q.enquiry_id = p_enquiry_id;

  insert into public.enquiry_quotes (enquiry_id, business_id, crew_id, n, cost_inr, advance_pct, advance_inr, created_by, updated_by)
  values (p_enquiry_id, v_enq.business_id, v_enq.crew_id, v_n, p_cost_inr, p_advance_pct,
          round(p_cost_inr * p_advance_pct / 100.0)::integer, v_user, v_user)
  returning * into v_row;

  update public.enquiries set status = 'quoted', updated_by = v_user where id = p_enquiry_id;
  return v_row;
end;
$function$;

-- the quote notification names all three answers now
create or replace function public.notify_enquiry_quote()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_enq public.enquiries;
  v_name text;
begin
  select * into v_enq from public.enquiries e where e.id = new.enquiry_id;
  if v_enq.crew_id is not null then
    select c.name into v_name from public.crews c where c.id = v_enq.crew_id;
  else
    select t.name into v_name from public.businesses t where t.id = v_enq.business_id;
  end if;
  if new.status = 'sent' then
    perform public.notify(v_enq.from_user_id, 'enquiry',
      coalesce(v_name, case when v_enq.crew_id is not null then 'A crew' else 'A studio' end)
        || case when new.n > 1 then ' sent a revised quote · ₹' else ' quoted ₹' end || new.cost_inr::text,
      'Accept it, ask for a revised quote, or cancel the enquiry.', '/inbox/enquiries/' || v_enq.id::text);
  end if;
  return null;
end;
$function$;

-- money recorded BY HAND (cash, bank) stays the business's. Paid in full is now
-- PAID — Completed is the business's own word for the job being done.
create or replace function public.record_enquiry_payment(p_quote_id uuid, p_part text)
 returns public.enquiry_quotes
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
  v_q public.enquiry_quotes;
  v_enq public.enquiries;
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
  select * into v_enq from public.enquiries e where e.id = v_q.enquiry_id;
  if v_enq.status in ('lost', 'cancelled') then
    raise exception 'this enquiry is closed';
  end if;

  if p_part = 'advance' then
    if v_q.advance_inr <= 0 then
      raise exception 'this quote asks for no advance';
    end if;
    if v_q.advance_paid_at is not null then
      raise exception 'the advance is already recorded';
    end if;
    -- an advance of the whole price IS the whole price
    update public.enquiry_quotes
      set advance_paid_at = now(),
          full_paid_at = case when advance_inr >= cost_inr then now() else full_paid_at end,
          updated_by = v_user
      where id = p_quote_id returning * into v_q;
    update public.enquiries
       set status = case when status = 'completed' then 'completed'
                         when v_q.full_paid_at is not null then 'paid' else 'advance_paid' end,
           updated_by = v_user
     where id = v_q.enquiry_id;
  else
    if v_q.full_paid_at is not null then
      raise exception 'this quote is already settled in full';
    end if;
    update public.enquiry_quotes
      set full_paid_at = now(), advance_paid_at = coalesce(advance_paid_at, now()), updated_by = v_user
      where id = p_quote_id returning * into v_q;
    update public.enquiries
       set status = case when status = 'completed' then 'completed' else 'paid' end, updated_by = v_user
     where id = v_q.enquiry_id;
  end if;
  return v_q;
end;
$function$;

-- ═══ 3 · AN ENQUIRY IS PAID THROUGH THE RAIL ══════════════════════════════════
alter table public.orders add column if not exists enquiry_quote_id uuid references public.enquiry_quotes (id) on delete cascade;
alter table public.orders add column if not exists enquiry_part text check (enquiry_part in ('advance', 'balance', 'full'));
alter table public.orders drop constraint orders_subject_check;
alter table public.orders add constraint orders_subject_check check (
  (class_id is not null and session_id is not null and event_id is null and membership_id is null and enquiry_quote_id is null)
  or (event_id is not null and class_id is null and session_id is null and membership_id is null and enquiry_quote_id is null)
  or (membership_id is not null and class_id is null and session_id is null and event_id is null and enquiry_quote_id is null)
  or (enquiry_quote_id is not null and enquiry_part is not null and class_id is null and session_id is null and event_id is null and membership_id is null)
);
create index if not exists orders_enquiry_quote_idx on public.orders (enquiry_quote_id) where enquiry_quote_id is not null;
comment on column public.orders.enquiry_quote_id is
  'An enquiry order (3 Oct 2026): the accepted quote being paid, and enquiry_part which half — advance, balance, or the whole price when there is no advance.';

-- ⚠ THE AMOUNT AND THE PART ARE THE QUOTE'S, NEVER THE CLIENT'S (Step 9's rule).
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
  if v_enq.status in ('lost', 'cancelled') then
    raise exception 'this enquiry is closed';
  end if;
  if v_q.status <> 'accepted' then
    raise exception 'accept the quote before paying it';
  end if;
  if v_enq.business_id is null then
    raise exception 'a crew is paid directly — settle with them and they will record it';
  end if;
  if v_q.full_paid_at is not null then
    raise exception 'this quote is already paid in full';
  end if;
  if v_q.advance_inr > 0 and v_q.advance_paid_at is null then
    v_part := 'advance';
    v_amount := v_q.advance_inr;
  elsif v_q.advance_paid_at is not null then
    v_part := 'balance';
    v_amount := v_q.cost_inr - v_q.advance_inr;
  else
    v_part := 'full';
    v_amount := v_q.cost_inr;
  end if;
  if v_amount <= 0 then
    raise exception 'nothing is left to pay on this quote';
  end if;
  insert into public.orders (business_id, user_id, enquiry_quote_id, enquiry_part, amount_inr, status, created_by, updated_by)
  values (v_enq.business_id, v_user, v_q.id, v_part, v_amount, 'created', v_user, v_user)
  returning * into v_row;
  return v_row;
end;
$$;

-- the capture's applier: under the quote's lock, re-check everything, and refund
-- rather than mark a part paid twice or pay a quote that stopped being the one
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
  v_full boolean;
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
    v_why := 'the quote stopped being the accepted one before the payment landed';
  elsif v_enq.status in ('lost', 'cancelled') then
    v_why := 'the enquiry was closed before the payment landed';
  elsif v_order.enquiry_part = 'advance' and v_q.advance_paid_at is not null then
    v_why := 'the advance was already paid';
  elsif v_order.enquiry_part <> 'advance' and v_q.full_paid_at is not null then
    v_why := 'this quote was already paid in full';
  end if;

  if v_why is not null then
    update public.orders set status = 'refund_pending', updated_by = v_order.user_id where id = v_order.id;
    insert into public.refunds (order_id, payment_id, business_id, user_id, amount_inr, status, reason, created_by, updated_by)
    values (v_order.id, p_payment_id, v_order.business_id, v_order.user_id, v_order.amount_inr, 'pending', v_why, v_order.user_id, v_order.user_id)
    returning id into v_refund;
    return jsonb_build_object('outcome', 'refund_pending', 'reason', v_why, 'refund_id', v_refund);
  end if;

  if v_order.enquiry_part = 'advance' then
    v_full := v_q.advance_inr >= v_q.cost_inr;
    update public.enquiry_quotes
       set advance_paid_at = now(), full_paid_at = case when v_full then now() else full_paid_at end, updated_by = v_order.user_id
     where id = v_q.id;
  else
    v_full := true;
    update public.enquiry_quotes
       set full_paid_at = now(), advance_paid_at = coalesce(advance_paid_at, now()), updated_by = v_order.user_id
     where id = v_q.id;
  end if;
  update public.enquiries
     set status = case when status = 'completed' then 'completed' when v_full then 'paid' else 'advance_paid' end,
         updated_by = v_order.user_id
   where id = v_enq.id;
  update public.orders set status = 'paid', updated_by = v_order.user_id where id = v_order.id;

  select p.full_name into v_who from public.profiles p where p.id = v_order.user_id;
  perform public.tell_enquiry_receiver(v_enq.id,
    coalesce(v_who, 'They') || ' paid ₹' || v_order.amount_inr::text
      || case v_order.enquiry_part when 'advance' then ' — the advance' when 'balance' then ' — the balance' else '' end,
    'Paid online through DanceOS.');
  return jsonb_build_object('outcome', 'paid', 'quote_id', v_q.id, 'enquiry_id', v_enq.id);
end;
$$;

-- the dispatcher the webhook and the checkout confirm both call: one branch more,
-- the membership branch and the classes body exactly as they were
create or replace function public.apply_captured_payment(p_provider_order_id text, p_provider_payment_id text, p_amount_paise bigint, p_method text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_order public.orders;
  v_payment public.payments;
  v_out jsonb;
begin
  select * into v_order from public.orders
    where provider_order_id = p_provider_order_id and deleted_at is null;
  if not found then
    return jsonb_build_object('outcome', 'ignored', 'reason', 'unknown order');
  end if;

  -- ═══ AN ENQUIRY ORDER (3 Oct 2026) ════════════════════════════════════════
  if v_order.enquiry_quote_id is not null then
    select * into v_order from public.orders where id = v_order.id for update;
    select * into v_payment from public.payments where provider_payment_id = p_provider_payment_id;
    if found then
      return jsonb_build_object('outcome', 'duplicate', 'order_status', v_order.status);
    end if;
    insert into public.payments (order_id, business_id, user_id, provider, provider_payment_id,
                                 amount_inr, method, status, created_by, updated_by)
    values (v_order.id, v_order.business_id, v_order.user_id, v_order.provider, p_provider_payment_id,
            (p_amount_paise / 100)::integer, p_method, 'captured', v_order.user_id, v_order.user_id)
    returning * into v_payment;
    return public.apply_enquiry_payment(v_order.id, v_payment.id, p_amount_paise);
  end if;

  -- ═══ A MEMBERSHIP ORDER (19 Sep 2026) ═════════════════════════════════════
  if v_order.membership_id is not null then
    select * into v_order from public.orders where id = v_order.id for update;
    select * into v_payment from public.payments where provider_payment_id = p_provider_payment_id;
    if found then
      return jsonb_build_object('outcome', 'duplicate', 'order_status', v_order.status);
    end if;
    insert into public.payments (order_id, business_id, user_id, provider, provider_payment_id,
                                 amount_inr, method, status, created_by, updated_by)
    values (v_order.id, v_order.business_id, v_order.user_id, v_order.provider, p_provider_payment_id,
            (p_amount_paise / 100)::integer, p_method, 'captured', v_order.user_id, v_order.user_id)
    returning * into v_payment;
    v_out := public.apply_membership_payment(v_order.id, v_payment.id, p_amount_paise);
    return v_out;
  end if;

  -- every other subject is unchanged: the class and event branches are the body
  -- that has always run them, carried forward under its own name above
  return public.apply_captured_payment_classes_and_events(p_provider_order_id, p_provider_payment_id, p_amount_paise, p_method);
end;
$function$;

-- ═══ 4 · GRANTS ══════════════════════════════════════════════════════════════
-- a new function arrives with the database's default privileges (anon included,
-- 16 Sep 2026) — every one is stated here
revoke all on function public.set_my_inbox_off(text[]) from public, anon;
revoke all on function public.set_room_requests(uuid, boolean) from public, anon;
revoke all on function public.close_enquiry(uuid, text) from public, anon;
revoke all on function public.create_enquiry_payment_order(uuid) from public, anon;
grant execute on function public.set_my_inbox_off(text[]) to authenticated, service_role;
grant execute on function public.set_room_requests(uuid, boolean) to authenticated, service_role;
grant execute on function public.close_enquiry(uuid, text) to authenticated, service_role;
grant execute on function public.create_enquiry_payment_order(uuid) to authenticated, service_role;

revoke all on function public.apply_enquiry_payment(uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.apply_enquiry_payment(uuid, uuid, bigint) to service_role;

revoke all on function public.tell_enquiry_receiver(uuid, text, text) from public, anon, authenticated;
revoke all on function public.guard_ask_switched_on() from public, anon, authenticated;
revoke all on function public.guard_room_requests_open() from public, anon, authenticated;
