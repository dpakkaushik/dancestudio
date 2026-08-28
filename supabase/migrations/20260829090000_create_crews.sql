-- Step 22 (Crews).
--
-- The prototype's crew is a RECORD, not a constant (CREWS 661-708): a name, a
-- city, a style, a leader and a roster, plus the battles it entered. Two
-- relationships, two lists (S_bizhub 2596-2603): the crews you LEAD, which have
-- a desk — members, roles, order, the battle record — and the crews you are
-- merely IN, which have a page you read. Auditions and the open call are gone
-- from the product (13520-13523, 13565-13573), so neither is here.
--
-- NOBODY IS PUT ON ANYTHING WITHOUT SAYING YES (1792-1812): a roster is a
-- public page, so being on one is a claim about a person. Adding somebody is an
-- ASK — a crew_members row in status 'asked' that only the person named can
-- confirm or reject; the desk prints "Waiting on them to confirm" until they
-- do, and the public page prints only the confirmed. The same rule the class
-- claims (Step 11) and team invites (Step 12b) already keep.
--
-- Two things Step 21 left waiting on this migration:
--   * a crew entry is made BY THE PERSON WHO LEADS THE CREW, from the crews they
--     lead, not a typed name (13397-13420) — `book_event` gains p_crew_id and
--     refuses a crew it is not the caller's to enter;
--   * the duet partner is a PERSON on DanceOS (13362-13395), asked, not
--     declared — p_partner_id, partner_status, and `respond_to_partner_ask`.
--     Unanswered, the entry still stands ("blocking here would only strand
--     money", 1815-1817): what changes is what the organiser sees.
--
-- A crew belongs to a person, not a business, so there is no tenant_id.

-- ── crews ────────────────────────────────────────────────────────────────────
create table public.crews (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 64),
  city text not null check (length(trim(city)) > 0),
  style text not null default 'All styles' check (length(trim(style)) between 1 and 40),
  leader_id uuid not null references public.profiles (id) on delete cascade,
  photo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);

comment on table public.crews is
  'A dance crew: a name, a city, a style and the person who leads it. The roster is crew_members; the battle record is the event_bookings that carry crew_id.';

create index crews_leader_idx on public.crews (leader_id) where deleted_at is null;
create index crews_city_idx on public.crews (city) where deleted_at is null;

create trigger crews_set_updated_at
  before update on public.crews
  for each row execute function public.set_updated_at();

-- ── crew_members — the roster, asked before shown ────────────────────────────
create table public.crew_members (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('leader', 'member', 'trainee')),
  status text not null default 'asked' check (status in ('asked', 'confirmed', 'rejected')),
  -- the public page prints the roster in this order (the desk's ↑ ↓)
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);

comment on table public.crew_members is
  'Who is on a crew. A row starts ASKED and only the person named can confirm it; the public roster is the confirmed rows. Leaving or removal soft-deletes.';

create unique index crew_members_live_unique on public.crew_members (crew_id, user_id) where deleted_at is null;
create index crew_members_user_idx on public.crew_members (user_id) where deleted_at is null;
create index crew_members_crew_idx on public.crew_members (crew_id, sort) where deleted_at is null;

create trigger crew_members_set_updated_at
  before update on public.crew_members
  for each row execute function public.set_updated_at();

-- ── who leads it (a helper the policies and the functions share) ─────────────
create or replace function public.is_crew_leader(p_crew_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.crews c
    where c.id = p_crew_id and c.leader_id = auth.uid() and c.deleted_at is null
  );
$$;
revoke execute on function public.is_crew_leader(uuid) from public, anon;
grant execute on function public.is_crew_leader(uuid) to authenticated;

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.crews enable row level security;
alter table public.crew_members enable row level security;

-- a crew is a public entity: Discover lists it, its page is anybody's to read
create policy "anyone reads live crews" on public.crews for select to anon, authenticated
  using (deleted_at is null);

-- the public roster is the CONFIRMED rows of a live crew
create policy "anyone reads confirmed crew members" on public.crew_members for select to anon, authenticated
  using (
    deleted_at is null and status = 'confirmed'
    and exists (select 1 from public.crews c where c.id = crew_members.crew_id and c.deleted_at is null)
  );
-- you read every row that names you — the ask waiting on you, and the one you left
create policy "people read own crew rows" on public.crew_members for select to authenticated
  using (user_id = auth.uid());
-- the leader reads the whole desk: asked, confirmed, rejected, left
create policy "leaders read their crew's rows" on public.crew_members for select to authenticated
  using (public.is_crew_leader(crew_id));

-- No insert/update/delete policies: every change goes through the functions below.

-- ── create_crew — you are its leader; everyone you named is asked ────────────
create or replace function public.create_crew(p_name text, p_city text, p_style text, p_member_ids uuid[] default '{}')
returns public.crews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.crews;
  v_id uuid;
  v_sort integer := 1;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user and p.deleted_at is null) then
    raise exception 'finish onboarding before creating a crew';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'name your crew first';
  end if;
  if length(trim(coalesce(p_city, ''))) = 0 then
    raise exception 'a crew has a city';
  end if;

  insert into public.crews (name, city, style, leader_id, created_by, updated_by)
  values (trim(p_name), trim(p_city), coalesce(nullif(trim(p_style), ''), 'All styles'), v_user, v_user, v_user)
  returning * into v_row;

  -- the leader is on the roster from the first moment, confirmed by construction
  insert into public.crew_members (crew_id, user_id, role, status, sort, created_by, updated_by)
  values (v_row.id, v_user, 'leader', 'confirmed', 0, v_user, v_user);

  -- everyone you added is being put on a public roster — asked, not written
  foreach v_id in array coalesce(p_member_ids, '{}') loop
    if v_id is null or v_id = v_user then
      continue;
    end if;
    if not exists (select 1 from public.profiles p where p.id = v_id and p.deleted_at is null) then
      raise exception 'somebody you added is not on DanceOS';
    end if;
    if exists (select 1 from public.crew_members m where m.crew_id = v_row.id and m.user_id = v_id and m.deleted_at is null) then
      continue;
    end if;
    insert into public.crew_members (crew_id, user_id, role, status, sort, created_by, updated_by)
    values (v_row.id, v_id, 'member', 'asked', v_sort, v_user, v_user);
    v_sort := v_sort + 1;
  end loop;

  return v_row;
end;
$$;
revoke execute on function public.create_crew(text, text, text, uuid[]) from public, anon;
grant execute on function public.create_crew(text, text, text, uuid[]) to authenticated;

-- ── update_crew — the leader edits the record ────────────────────────────────
create or replace function public.update_crew(p_crew_id uuid, p_name text, p_city text, p_style text)
returns public.crews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.crews;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_crew_leader(p_crew_id) then
    raise exception 'only the crew''s leader can change it';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'name your crew first';
  end if;
  update public.crews set
    name = trim(p_name),
    city = coalesce(nullif(trim(p_city), ''), city),
    style = coalesce(nullif(trim(p_style), ''), style),
    updated_by = auth.uid()
  where id = p_crew_id
  returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.update_crew(uuid, text, text, text) from public, anon;
grant execute on function public.update_crew(uuid, text, text, text) to authenticated;

-- ── ask_crew_member — the leader asks somebody onto the roster ───────────────
create or replace function public.ask_crew_member(p_crew_id uuid, p_user_id uuid)
returns public.crew_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.crew_members;
  v_sort integer;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_crew_leader(p_crew_id) then
    raise exception 'only the crew''s leader adds members';
  end if;
  if p_user_id = v_user then
    raise exception 'you are already the leader';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id and p.deleted_at is null) then
    raise exception 'that person is not on DanceOS';
  end if;
  if exists (select 1 from public.crew_members m where m.crew_id = p_crew_id and m.user_id = p_user_id
               and m.deleted_at is null and m.status in ('asked', 'confirmed')) then
    raise exception 'they are already on the roster, or already asked';
  end if;
  -- asking again after a no or a withdrawal is a fresh ask
  update public.crew_members set deleted_at = now(), updated_by = v_user
    where crew_id = p_crew_id and user_id = p_user_id and deleted_at is null;

  select coalesce(max(m.sort), 0) + 1 into v_sort from public.crew_members m
    where m.crew_id = p_crew_id and m.deleted_at is null;

  insert into public.crew_members (crew_id, user_id, role, status, sort, created_by, updated_by)
  values (p_crew_id, p_user_id, 'member', 'asked', v_sort, v_user, v_user)
  returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.ask_crew_member(uuid, uuid) from public, anon;
grant execute on function public.ask_crew_member(uuid, uuid) to authenticated;

-- ── respond_to_crew_ask — only the person asked can answer ───────────────────
create or replace function public.respond_to_crew_ask(p_member_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.crew_members;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_row from public.crew_members m where m.id = p_member_id and m.deleted_at is null;
  if not found or v_row.user_id <> v_user then
    raise exception 'request not found';
  end if;
  if v_row.status <> 'asked' then
    raise exception 'this request was already answered';
  end if;
  update public.crew_members
    set status = case when p_accept then 'confirmed' else 'rejected' end, updated_by = v_user
    where id = p_member_id;
end;
$$;
revoke execute on function public.respond_to_crew_ask(uuid, boolean) from public, anon;
grant execute on function public.respond_to_crew_ask(uuid, boolean) to authenticated;

-- ── withdraw_crew_ask — the leader takes an unanswered ask back ──────────────
create or replace function public.withdraw_crew_ask(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.crew_members;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_row from public.crew_members m where m.id = p_member_id and m.deleted_at is null;
  if not found or not public.is_crew_leader(v_row.crew_id) then
    raise exception 'request not found';
  end if;
  if v_row.status <> 'asked' then
    raise exception 'only an unanswered ask can be withdrawn';
  end if;
  update public.crew_members set deleted_at = now(), updated_by = v_user where id = p_member_id;
end;
$$;
revoke execute on function public.withdraw_crew_ask(uuid) from public, anon;
grant execute on function public.withdraw_crew_ask(uuid) to authenticated;

-- ── remove_crew_member — the leader removes, or a member leaves ──────────────
create or replace function public.remove_crew_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.crew_members;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_row from public.crew_members m where m.id = p_member_id and m.deleted_at is null;
  if not found then
    raise exception 'member not found';
  end if;
  if v_row.role = 'leader' then
    raise exception 'the leader cannot leave — hand the crew to somebody first';
  end if;
  if v_row.user_id <> v_user and not public.is_crew_leader(v_row.crew_id) then
    raise exception 'only the crew''s leader removes members';
  end if;
  update public.crew_members set deleted_at = now(), updated_by = v_user where id = p_member_id;
end;
$$;
revoke execute on function public.remove_crew_member(uuid) from public, anon;
grant execute on function public.remove_crew_member(uuid) to authenticated;

-- ── set_crew_member_role — Promote, or Make leader (16382-16388) ─────────────
-- "Make leader" hands the crew over: the old leader becomes a member, the crew's
-- leader_id moves. A row only offers what it can actually change — the leader's
-- own row is never offered this, and an unconfirmed person cannot be promoted.
create or replace function public.set_crew_member_role(p_member_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.crew_members;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_role not in ('leader', 'member', 'trainee') then
    raise exception 'invalid role';
  end if;
  select * into v_row from public.crew_members m where m.id = p_member_id and m.deleted_at is null;
  if not found or not public.is_crew_leader(v_row.crew_id) then
    raise exception 'only the crew''s leader changes roles';
  end if;
  if v_row.status <> 'confirmed' then
    raise exception 'they have not confirmed yet';
  end if;
  if v_row.role = 'leader' then
    raise exception 'pick somebody else to lead first';
  end if;
  if p_role = 'leader' then
    update public.crew_members set role = 'member', updated_by = v_user
      where crew_id = v_row.crew_id and role = 'leader' and deleted_at is null;
    update public.crews set leader_id = v_row.user_id, updated_by = v_user where id = v_row.crew_id;
  end if;
  update public.crew_members set role = p_role, updated_by = v_user where id = p_member_id;
end;
$$;
revoke execute on function public.set_crew_member_role(uuid, text) from public, anon;
grant execute on function public.set_crew_member_role(uuid, text) to authenticated;

-- ── reorder_crew_members — the roster's order is the leader's (16400-16410) ──
create or replace function public.reorder_crew_members(p_crew_id uuid, p_member_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_i integer := 0;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_crew_leader(p_crew_id) then
    raise exception 'only the crew''s leader arranges the roster';
  end if;
  foreach v_id in array coalesce(p_member_ids, '{}') loop
    update public.crew_members set sort = v_i, updated_by = v_user
      where id = v_id and crew_id = p_crew_id and deleted_at is null;
    v_i := v_i + 1;
  end loop;
end;
$$;
revoke execute on function public.reorder_crew_members(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_crew_members(uuid, uuid[]) to authenticated;

-- ── crew_member_counts — the confirmed roster's size, for the cards ──────────
create or replace function public.crew_member_counts(p_crew_ids uuid[])
returns table (crew_id uuid, members bigint)
language sql
security definer
set search_path = ''
stable
as $$
  select c.id as crew_id,
         (select count(*) from public.crew_members m
            where m.crew_id = c.id and m.status = 'confirmed' and m.deleted_at is null) as members
  from public.crews c
  where c.id = any (p_crew_ids) and c.deleted_at is null;
$$;
revoke execute on function public.crew_member_counts(uuid[]) from public;
grant execute on function public.crew_member_counts(uuid[]) to anon, authenticated;

-- ── the two things Step 21 left waiting ──────────────────────────────────────
alter table public.event_bookings
  add column crew_id uuid references public.crews (id) on delete set null,
  add column partner_id uuid references public.profiles (id) on delete set null,
  add column partner_status text check (partner_status is null or partner_status in ('asked', 'confirmed', 'rejected'));

comment on column public.event_bookings.crew_id is
  'The crew a crew entry is for — entered by the person who leads it. entrant_name carries the crew''s name at the time of entry.';
comment on column public.event_bookings.partner_id is
  'The duet partner as a person on DanceOS. They are ASKED (partner_status); the entry stands either way — an unanswered partner changes what the organiser sees, not whether the entry holds.';

create index event_bookings_crew_idx on public.event_bookings (crew_id) where deleted_at is null and status = 'booked';
create index event_bookings_partner_idx on public.event_bookings (partner_id) where deleted_at is null;

-- the partner reads the entry that names them (the Requests desk's ask)
create policy "partners read bookings naming them" on public.event_bookings for select to authenticated
  using (partner_id = auth.uid());
-- a crew's entries into published events are its public battle record (16437)
create policy "anyone reads a crew's entries" on public.event_bookings for select to anon, authenticated
  using (
    crew_id is not null and status = 'booked' and deleted_at is null
    and exists (select 1 from public.events e where e.id = event_bookings.event_id and e.status in ('published', 'completed') and e.deleted_at is null
                  and exists (select 1 from public.tenants t where t.id = e.tenant_id and t.visibility = 'listed' and t.deleted_at is null))
  );

-- book_event, with the crew you lead and the partner as a person
drop function if exists public.book_event(uuid, text, uuid, integer, text, text, text);

create or replace function public.book_event(
  p_event_id uuid,
  p_kind text,
  p_ticket_tier_id uuid default null,
  p_qty integer default 1,
  p_format text default null,
  p_entrant_name text default null,
  p_partner_name text default null,
  p_crew_id uuid default null,
  p_partner_id uuid default null
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
  if not exists (select 1 from public.tenants t where t.id = v.tenant_id and t.visibility = 'listed' and t.deleted_at is null) then
    raise exception 'this event is not open to the public';
  end if;
  -- the people who run it do not book it (prototype: "Studios can't book", 13273)
  if exists (select 1 from public.tenant_members m where m.tenant_id = v.tenant_id and m.user_id = v_user and m.deleted_at is null) then
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
    if v_price > 0 then
      raise exception 'payments aren''t switched on yet — this tier costs money';
    end if;
    insert into public.event_bookings (event_id, tenant_id, user_id, kind, ticket_tier_id, qty, amount_inr, created_by, updated_by)
    values (v.id, v.tenant_id, v_user, 'spectator', v_tier.id, p_qty, 0, v_user, v_user)
    returning * into v_row;
    return v_row;
  end if;

  if p_kind = 'participant' then
    -- a showcase is watched: the host builds the line-up (13245)
    if v.cat = 'showcase' then
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
    if v_entry.fee_inr > 0 then
      raise exception 'payments aren''t switched on yet — this entry costs money';
    end if;
    v_name := case when p_format = 'crew' then v_crew.name
                   else nullif(trim(coalesce(p_entrant_name, '')), '') end;
    insert into public.event_bookings (event_id, tenant_id, user_id, kind, entry_format, qty, entrant_name, partner_name, partner_id, partner_status, crew_id, amount_inr, created_by, updated_by)
    values (v.id, v.tenant_id, v_user, 'participant', p_format, 1, v_name,
            case when p_format = 'duo' then v_partner_name else nullif(trim(coalesce(p_partner_name, '')), '') end,
            case when p_format = 'duo' then p_partner_id else null end,
            case when p_format = 'duo' then 'asked' else null end,
            case when p_format = 'crew' then v_crew.id else null end,
            0, v_user, v_user)
    returning * into v_row;
    return v_row;
  end if;

  raise exception 'unknown booking kind';
end;
$$;
revoke execute on function public.book_event(uuid, text, uuid, integer, text, text, text, uuid, uuid) from public, anon;
grant execute on function public.book_event(uuid, text, uuid, integer, text, text, text, uuid, uuid) to authenticated;

-- ── respond_to_partner_ask — only the partner named can answer ───────────────
create or replace function public.respond_to_partner_ask(p_booking_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  b public.event_bookings;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into b from public.event_bookings x where x.id = p_booking_id and x.deleted_at is null;
  if not found or b.partner_id is null or b.partner_id <> v_user then
    raise exception 'request not found';
  end if;
  if b.status <> 'booked' then
    raise exception 'this entry was cancelled';
  end if;
  if b.partner_status <> 'asked' then
    raise exception 'this request was already answered';
  end if;
  update public.event_bookings
    set partner_status = case when p_accept then 'confirmed' else 'rejected' end, updated_by = v_user
    where id = p_booking_id;
end;
$$;
revoke execute on function public.respond_to_partner_ask(uuid, boolean) from public, anon;
grant execute on function public.respond_to_partner_ask(uuid, boolean) to authenticated;
