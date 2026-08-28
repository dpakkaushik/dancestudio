-- Step 21 (Events, competitions, ticketing) ⚠ money-adjacent.
--
-- The prototype's event is one record with two sides (EVENT_STORE 912): the
-- people who come to DANCE — entries by format, solo / duet / crew, each format
-- its own price and its own places ("a solo dancer and a nine-person crew are
-- not the same product", 16070) — and the people who come to WATCH — spectator
-- tiers, each a name, a price and a number of seats. Three categories remain
-- (showcase · battle · tournament; auditions were removed, 2989), and a showcase
-- is WATCHED: its line-up is the host's to build, so it has no public entry.
--
-- Publishing has a rule, stated once (dosEventBlockers 3061): a venue, a city
-- and a map link; if tickets are on, at least one tier with seats; an entered
-- event needs at least one way in with places; a showcase must sell tickets.
-- `publish_event` is that rule, server-side, in the prototype's own sentences.
--
-- Money, honestly: Step 9's rail is class-shaped (`orders` carries class_id and
-- session_id) and has no Razorpay account behind it yet. So `book_event` books
-- FREE seats and FREE entries, and refuses a priced one with the sentence paid
-- classes already use — "payments aren't switched on yet" — rather than
-- pretending. Sold counts are COUNTED from bookings, never stored, so a
-- cancellation frees a seat by arithmetic and a later rail cannot drift from
-- the register. Extending `orders` to events is the follow-up that lands with
-- the account.

-- ── events ───────────────────────────────────────────────────────────────────
create table public.events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  cat text not null check (cat in ('showcase', 'battle', 'tournament')),
  -- a name has to fit on a card (EV_NAME_CHARS 64)
  title text not null check (length(trim(title)) between 1 and 64),
  -- one style, or the absence of the restriction ("All styles", 15948)
  style text not null default 'All styles',
  start_date date not null,
  end_date date not null,
  start_time time not null default '18:00',
  venue text not null check (length(trim(venue)) > 0),
  address text,
  city text not null check (length(trim(city)) > 0),
  maps_url text not null check (length(trim(maps_url)) > 0),
  about text,
  -- who competes / performs: the headline; the entry tiers are the truth
  entry_format text not null default 'none'
    check (entry_format in ('none', 'solo', 'duo', 'crew', 'all', 'mixed')),
  bracket integer not null default 0 check (bracket in (0, 8, 16, 32, 64)),
  rounds integer not null default 0 check (rounds between 0 and 5),
  prizes integer[] not null default '{}',
  tickets_on boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'published', 'completed')),
  share_slug text,
  poster text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz,
  constraint events_dates check (end_date >= start_date)
);

comment on table public.events is
  'A studio''s or artist business''s event: showcase, battle or tournament. Entries (by format) and spectator tickets (by tier) live in their own tables; sold counts are counted from event_bookings.';

create index events_tenant_idx on public.events (tenant_id, start_date) where deleted_at is null;
create index events_public_idx on public.events (status, start_date) where deleted_at is null;

-- the same public-link grammar classes use (Step 8), with /e/{slug} as the address
create or replace function public.generate_event_slug(p_title text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text;
  v_slug text;
begin
  v_base := left(
    regexp_replace(regexp_replace(lower(coalesce(p_title, '')), '[^a-z0-9]+', '-', 'g'), '(^-+)|(-+$)', '', 'g'),
    26);
  v_base := regexp_replace(v_base, '-+$', '');
  if v_base = '' then
    v_base := 'event';
  end if;
  loop
    v_slug := v_base || '-' || substr(md5(gen_random_uuid()::text), 1, 4);
    exit when not exists (select 1 from public.events e where e.share_slug = v_slug);
  end loop;
  return v_slug;
end;
$$;
revoke execute on function public.generate_event_slug(text) from public, anon, authenticated;

create or replace function public.events_fill_share_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.share_slug is null then
    new.share_slug := public.generate_event_slug(new.title);
  end if;
  return new;
end;
$$;
revoke execute on function public.events_fill_share_slug() from public, anon, authenticated;

create trigger events_fill_share_slug
  before insert on public.events
  for each row execute function public.events_fill_share_slug();

alter table public.events alter column share_slug set not null;
create unique index events_share_slug on public.events (share_slug);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- ── entry tiers — one row per format the event accepts ───────────────────────
create table public.event_entry_tiers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  format text not null check (format in ('solo', 'duo', 'crew')),
  fee_inr integer not null default 0 check (fee_inr between 0 and 999999),
  -- 0 means "up to the most" (EV_MAX_ENTRIES 500)
  capacity integer not null default 0 check (capacity between 0 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);
create unique index event_entry_tiers_live on public.event_entry_tiers (event_id, format) where deleted_at is null;
create trigger event_entry_tiers_set_updated_at
  before update on public.event_entry_tiers
  for each row execute function public.set_updated_at();

-- ── ticket tiers — the spectator side ────────────────────────────────────────
create table public.event_ticket_tiers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  price_inr integer not null default 0 check (price_inr between 0 and 999999),
  capacity integer not null check (capacity between 1 and 5000),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);
create unique index event_ticket_tiers_live on public.event_ticket_tiers (event_id, lower(name)) where deleted_at is null;
create trigger event_ticket_tiers_set_updated_at
  before update on public.event_ticket_tiers
  for each row execute function public.set_updated_at();

-- ── bookings — a seat, or an entry ───────────────────────────────────────────
create table public.event_bookings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- null for a walk-in the desk recorded by name
  user_id uuid references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('spectator', 'participant')),
  ticket_tier_id uuid references public.event_ticket_tiers (id) on delete cascade,
  entry_format text check (entry_format in ('solo', 'duo', 'crew')),
  qty integer not null default 1 check (qty between 1 and 20),
  -- what the register prints: the crew's name, "A & B" for a duet, a walk-in's name
  entrant_name text,
  partner_name text,
  amount_inr integer not null default 0 check (amount_inr >= 0),
  status text not null default 'booked' check (status in ('booked', 'cancelled')),
  checked_in_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz,
  constraint event_bookings_shape check (
    (kind = 'spectator' and ticket_tier_id is not null and entry_format is null)
    or (kind = 'participant' and ticket_tier_id is null and entry_format is not null and qty = 1)
  ),
  constraint event_bookings_named check (user_id is not null or entrant_name is not null)
);
create index event_bookings_event_idx on public.event_bookings (event_id) where deleted_at is null and status = 'booked';
create index event_bookings_user_idx on public.event_bookings (user_id) where deleted_at is null;
create trigger event_bookings_set_updated_at
  before update on public.event_bookings
  for each row execute function public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.events enable row level security;
alter table public.event_entry_tiers enable row level security;
alter table public.event_ticket_tiers enable row level security;
alter table public.event_bookings enable row level security;

-- members see everything of their tenant's, drafts included (no deleted_at filter — Step 3's lesson)
create policy "members read own events" on public.events for select to authenticated
  using (public.is_tenant_member(tenant_id));
-- anyone reads a LISTED tenant's published events — the public side of Discover
create policy "anyone reads published events of listed tenants" on public.events for select to anon, authenticated
  using (
    deleted_at is null and status = 'published'
    and exists (select 1 from public.tenants t where t.id = events.tenant_id and t.visibility = 'listed' and t.deleted_at is null)
  );

create policy "members read own entry tiers" on public.event_entry_tiers for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy "anyone reads public entry tiers" on public.event_entry_tiers for select to anon, authenticated
  using (
    deleted_at is null
    and exists (select 1 from public.events e where e.id = event_entry_tiers.event_id and e.status = 'published' and e.deleted_at is null
                  and exists (select 1 from public.tenants t where t.id = e.tenant_id and t.visibility = 'listed' and t.deleted_at is null))
  );

create policy "members read own ticket tiers" on public.event_ticket_tiers for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy "anyone reads public ticket tiers" on public.event_ticket_tiers for select to anon, authenticated
  using (
    deleted_at is null
    and exists (select 1 from public.events e where e.id = event_ticket_tiers.event_id and e.status = 'published' and e.deleted_at is null
                  and exists (select 1 from public.tenants t where t.id = e.tenant_id and t.visibility = 'listed' and t.deleted_at is null))
  );

-- who booked what is the ticket holder's and the organiser's business, nobody else's
create policy "holders read own event bookings" on public.event_bookings for select to authenticated
  using (user_id = auth.uid());
create policy "members read their event bookings" on public.event_bookings for select to authenticated
  using (public.is_tenant_member(tenant_id));

-- No insert/update/delete policies anywhere: every change goes through the functions below.

-- ── who may run an event: a live owner or trainer of the tenant ──────────────
create or replace function public.can_run_events(p_tenant_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.tenant_members m
    where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
      and m.member_role in ('owner', 'trainer') and m.deleted_at is null
  );
$$;
revoke execute on function public.can_run_events(uuid) from public, anon;
grant execute on function public.can_run_events(uuid) to authenticated;

-- ── save_event — create, or edit in place ────────────────────────────────────
-- Tiers are reconciled, not replaced: a tier that still has its id stays (its
-- bookings stay with it), one that is gone is soft-deleted, a new one is inserted.
create or replace function public.save_event(p_tenant_id uuid, p_event_id uuid, p_event jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid := p_event_id;
  v_row public.events;
  v_t jsonb;
  v_keep uuid[] := '{}';
  v_tid uuid;
  v_fmt text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not public.can_run_events(p_tenant_id) then
    raise exception 'only the studio''s owner or a trainer can run events';
  end if;

  if v_id is null then
    insert into public.events (tenant_id, cat, title, style, start_date, end_date, start_time, venue, address, city, maps_url, about,
                               entry_format, bracket, rounds, prizes, tickets_on, created_by, updated_by)
    values (p_tenant_id,
            p_event->>'cat', trim(p_event->>'title'), coalesce(nullif(trim(p_event->>'style'), ''), 'All styles'),
            (p_event->>'start_date')::date, (p_event->>'end_date')::date, coalesce((p_event->>'start_time')::time, '18:00'),
            trim(p_event->>'venue'), nullif(trim(coalesce(p_event->>'address', '')), ''), trim(p_event->>'city'), trim(p_event->>'maps_url'),
            nullif(trim(coalesce(p_event->>'about', '')), ''),
            coalesce(p_event->>'entry_format', 'none'), coalesce((p_event->>'bracket')::integer, 0), coalesce((p_event->>'rounds')::integer, 0),
            coalesce((select array_agg((x)::integer) from jsonb_array_elements_text(coalesce(p_event->'prizes', '[]'::jsonb)) x), '{}'),
            coalesce((p_event->>'tickets_on')::boolean, true), v_user, v_user)
    returning * into v_row;
    v_id := v_row.id;
  else
    select * into v_row from public.events e where e.id = v_id and e.tenant_id = p_tenant_id and e.deleted_at is null;
    if not found then
      raise exception 'event not found';
    end if;
    update public.events set
      title = trim(p_event->>'title'), style = coalesce(nullif(trim(p_event->>'style'), ''), 'All styles'),
      start_date = (p_event->>'start_date')::date, end_date = (p_event->>'end_date')::date,
      start_time = coalesce((p_event->>'start_time')::time, start_time),
      venue = trim(p_event->>'venue'), address = nullif(trim(coalesce(p_event->>'address', '')), ''), city = trim(p_event->>'city'),
      maps_url = trim(p_event->>'maps_url'), about = nullif(trim(coalesce(p_event->>'about', '')), ''),
      entry_format = coalesce(p_event->>'entry_format', entry_format),
      bracket = coalesce((p_event->>'bracket')::integer, bracket), rounds = coalesce((p_event->>'rounds')::integer, rounds),
      prizes = coalesce((select array_agg((x)::integer) from jsonb_array_elements_text(coalesce(p_event->'prizes', '[]'::jsonb)) x), '{}'),
      tickets_on = coalesce((p_event->>'tickets_on')::boolean, tickets_on),
      updated_by = v_user
      where id = v_id;
  end if;

  -- entry tiers: {format, fee_inr, capacity}
  v_keep := '{}';
  for v_t in select * from jsonb_array_elements(coalesce(p_event->'entry_tiers', '[]'::jsonb)) loop
    v_fmt := v_t->>'format';
    select id into v_tid from public.event_entry_tiers where event_id = v_id and format = v_fmt and deleted_at is null;
    if v_tid is null then
      insert into public.event_entry_tiers (event_id, tenant_id, format, fee_inr, capacity, created_by, updated_by)
      values (v_id, p_tenant_id, v_fmt, coalesce((v_t->>'fee_inr')::integer, 0), coalesce((v_t->>'capacity')::integer, 0), v_user, v_user)
      returning id into v_tid;
    else
      update public.event_entry_tiers set fee_inr = coalesce((v_t->>'fee_inr')::integer, 0),
        capacity = coalesce((v_t->>'capacity')::integer, 0), updated_by = v_user where id = v_tid;
    end if;
    v_keep := v_keep || v_tid;
  end loop;
  update public.event_entry_tiers set deleted_at = now(), updated_by = v_user
    where event_id = v_id and deleted_at is null and not (id = any (v_keep));

  -- ticket tiers: {id?, name, price_inr, capacity, sort}
  v_keep := '{}';
  for v_t in select * from jsonb_array_elements(coalesce(p_event->'ticket_tiers', '[]'::jsonb)) loop
    v_tid := null;
    if coalesce(v_t->>'id', '') <> '' then
      select id into v_tid from public.event_ticket_tiers where id = (v_t->>'id')::uuid and event_id = v_id and deleted_at is null;
    end if;
    if v_tid is null then
      insert into public.event_ticket_tiers (event_id, tenant_id, name, price_inr, capacity, sort, created_by, updated_by)
      values (v_id, p_tenant_id, trim(v_t->>'name'), coalesce((v_t->>'price_inr')::integer, 0), (v_t->>'capacity')::integer,
              coalesce((v_t->>'sort')::integer, 0), v_user, v_user)
      returning id into v_tid;
    else
      update public.event_ticket_tiers set name = trim(v_t->>'name'), price_inr = coalesce((v_t->>'price_inr')::integer, 0),
        capacity = (v_t->>'capacity')::integer, sort = coalesce((v_t->>'sort')::integer, 0), updated_by = v_user where id = v_tid;
    end if;
    v_keep := v_keep || v_tid;
  end loop;
  update public.event_ticket_tiers set deleted_at = now(), updated_by = v_user
    where event_id = v_id and deleted_at is null and not (id = any (v_keep));

  return v_id;
end;
$$;
revoke execute on function public.save_event(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_event(uuid, uuid, jsonb) to authenticated;

-- ── what an event still owes Discover (dosEventBlockers 3061) ───────────────
create or replace function public.event_blockers(p_event_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v public.events;
  out text[] := '{}';
  v_tiers integer;
  v_entries integer;
  v_no_cap text;
begin
  select * into v from public.events e where e.id = p_event_id and e.deleted_at is null;
  if not found then
    return array['Nothing to publish'];
  end if;
  select count(*) into v_tiers from public.event_ticket_tiers t where t.event_id = v.id and t.deleted_at is null;
  if v.tickets_on and v_tiers = 0 then
    out := out || 'Add a ticket tier, or turn spectator tickets off';
  end if;
  if v.cat in ('battle', 'tournament') then
    select count(*) into v_entries from public.event_entry_tiers t where t.event_id = v.id and t.deleted_at is null;
    if v_entries = 0 then
      out := out || 'Open at least one way in — solo, duet or crew';
    end if;
    for v_no_cap in
      select case t.format when 'solo' then 'Solo' when 'duo' then 'Duet' else 'Crew' end
      from public.event_entry_tiers t where t.event_id = v.id and t.deleted_at is null and t.capacity = 0
    loop
      out := out || (v_no_cap || ' entries have no places — say how many');
    end loop;
  else
    if not (v.tickets_on and v_tiers > 0) then
      out := out || 'A showcase is watched — put tickets on sale before publishing';
    end if;
  end if;
  return out;
end;
$$;
revoke execute on function public.event_blockers(uuid) from public, anon;
grant execute on function public.event_blockers(uuid) to authenticated;

-- ── publish_event / set_event_status / delete_event ──────────────────────────
create or replace function public.publish_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.events;
  v_blockers text[];
begin
  select * into v from public.events e where e.id = p_event_id and e.deleted_at is null;
  if not found then
    raise exception 'event not found';
  end if;
  if not public.can_run_events(v.tenant_id) then
    raise exception 'only the studio''s owner or a trainer can publish';
  end if;
  v_blockers := public.event_blockers(p_event_id);
  if coalesce(array_length(v_blockers, 1), 0) > 0 then
    raise exception '%', v_blockers[1];
  end if;
  update public.events set status = 'published', updated_by = auth.uid() where id = p_event_id;
end;
$$;
revoke execute on function public.publish_event(uuid) from public, anon;
grant execute on function public.publish_event(uuid) to authenticated;

create or replace function public.set_event_status(p_event_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.events;
begin
  if p_status not in ('draft', 'completed') then
    raise exception 'use publish_event to publish';
  end if;
  select * into v from public.events e where e.id = p_event_id and e.deleted_at is null;
  if not found then
    raise exception 'event not found';
  end if;
  if not public.can_run_events(v.tenant_id) then
    raise exception 'only the studio''s owner or a trainer can change this';
  end if;
  update public.events set status = p_status, updated_by = auth.uid() where id = p_event_id;
end;
$$;
revoke execute on function public.set_event_status(uuid, text) from public, anon;
grant execute on function public.set_event_status(uuid, text) to authenticated;

create or replace function public.delete_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.events;
begin
  select * into v from public.events e where e.id = p_event_id and e.deleted_at is null;
  if not found then
    raise exception 'event not found';
  end if;
  if not public.can_run_events(v.tenant_id) then
    raise exception 'only the studio''s owner or a trainer can delete this';
  end if;
  update public.events set deleted_at = now(), updated_by = auth.uid() where id = p_event_id;
end;
$$;
revoke execute on function public.delete_event(uuid) from public, anon;
grant execute on function public.delete_event(uuid) to authenticated;

-- ── event_counts — how full each side is, for anybody (a number, never a name) ─
create or replace function public.event_counts(p_event_ids uuid[])
returns table (event_id uuid, ticket_tier_id uuid, entry_format text, kind text, n bigint)
language sql
security definer
set search_path = ''
stable
as $$
  select b.event_id, b.ticket_tier_id, b.entry_format, b.kind, sum(b.qty)::bigint as n
  from public.event_bookings b
  join public.events e on e.id = b.event_id
  where b.event_id = any (p_event_ids)
    and b.status = 'booked' and b.deleted_at is null and e.deleted_at is null
    and (
      (e.status = 'published' and exists (select 1 from public.tenants t where t.id = e.tenant_id and t.visibility = 'listed' and t.deleted_at is null))
      or public.is_tenant_member(e.tenant_id)
    )
  group by b.event_id, b.ticket_tier_id, b.entry_format, b.kind;
$$;
revoke execute on function public.event_counts(uuid[]) from public;
grant execute on function public.event_counts(uuid[]) to anon, authenticated;

-- ── book_event — a seat or an entry, free for now ────────────────────────────
create or replace function public.book_event(
  p_event_id uuid,
  p_kind text,
  p_ticket_tier_id uuid default null,
  p_qty integer default 1,
  p_format text default null,
  p_entrant_name text default null,
  p_partner_name text default null
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
  v_sold integer;
  v_cap integer;
  v_price integer;
  v_name text;
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
    if p_format = 'duo' and length(trim(coalesce(p_partner_name, ''))) = 0 then
      raise exception 'a duet needs your partner';
    end if;
    if p_format = 'crew' and length(trim(coalesce(p_entrant_name, ''))) = 0 then
      raise exception 'name the crew you are entering';
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
    v_name := case when p_format = 'crew' then trim(p_entrant_name)
                   when p_format = 'duo' then trim(coalesce(p_entrant_name, '')) else nullif(trim(coalesce(p_entrant_name, '')), '') end;
    insert into public.event_bookings (event_id, tenant_id, user_id, kind, entry_format, qty, entrant_name, partner_name, amount_inr, created_by, updated_by)
    values (v.id, v.tenant_id, v_user, 'participant', p_format, 1, v_name, nullif(trim(coalesce(p_partner_name, '')), ''), 0, v_user, v_user)
    returning * into v_row;
    return v_row;
  end if;

  raise exception 'unknown booking kind';
end;
$$;
revoke execute on function public.book_event(uuid, text, uuid, integer, text, text, text) from public, anon;
grant execute on function public.book_event(uuid, text, uuid, integer, text, text, text) to authenticated;

-- ── cancel_event_booking — your own, while the event is still to come ────────
create or replace function public.cancel_event_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  b public.event_bookings;
  v public.events;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into b from public.event_bookings x where x.id = p_booking_id and x.deleted_at is null;
  if not found or b.user_id <> v_user then
    raise exception 'booking not found';
  end if;
  if b.status <> 'booked' then
    return;
  end if;
  select * into v from public.events e where e.id = b.event_id;
  if v.end_date < (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'this event is over';
  end if;
  update public.event_bookings set status = 'cancelled', cancelled_at = now(), updated_by = v_user where id = p_booking_id;
end;
$$;
revoke execute on function public.cancel_event_booking(uuid) from public, anon;
grant execute on function public.cancel_event_booking(uuid) to authenticated;

-- ── the desk: check in, and record a walk-in by name ─────────────────────────
create or replace function public.check_in_event_booking(p_booking_id uuid, p_in boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.event_bookings;
begin
  select * into b from public.event_bookings x where x.id = p_booking_id and x.deleted_at is null;
  if not found then
    raise exception 'booking not found';
  end if;
  if not public.is_tenant_member(b.tenant_id) then
    raise exception 'only the event''s people run the door';
  end if;
  update public.event_bookings set checked_in_at = case when p_in then now() else null end, updated_by = auth.uid()
    where id = p_booking_id;
end;
$$;
revoke execute on function public.check_in_event_booking(uuid, boolean) from public, anon;
grant execute on function public.check_in_event_booking(uuid, boolean) to authenticated;

-- a walk-in is recorded, not asked (prototype: "the person is standing at the
-- desk … the organiser is recording what already happened", 14208)
create or replace function public.add_event_walk_in(p_event_id uuid, p_kind text, p_name text, p_ticket_tier_id uuid default null, p_format text default null)
returns public.event_bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.events;
  v_row public.event_bookings;
begin
  select * into v from public.events e where e.id = p_event_id and e.deleted_at is null;
  if not found then
    raise exception 'event not found';
  end if;
  if not public.is_tenant_member(v.tenant_id) then
    raise exception 'only the event''s people run the door';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'who is it?';
  end if;
  if p_kind = 'spectator' then
    if not exists (select 1 from public.event_ticket_tiers t where t.id = p_ticket_tier_id and t.event_id = v.id and t.deleted_at is null) then
      raise exception 'pick the tier they are sitting in';
    end if;
    insert into public.event_bookings (event_id, tenant_id, user_id, kind, ticket_tier_id, qty, entrant_name, amount_inr, checked_in_at, created_by, updated_by)
    values (v.id, v.tenant_id, null, 'spectator', p_ticket_tier_id, 1, trim(p_name), 0, now(), auth.uid(), auth.uid())
    returning * into v_row;
  elsif p_kind = 'participant' then
    if p_format not in ('solo', 'duo', 'crew') then
      raise exception 'pick what they are entering as';
    end if;
    insert into public.event_bookings (event_id, tenant_id, user_id, kind, entry_format, qty, entrant_name, amount_inr, checked_in_at, created_by, updated_by)
    values (v.id, v.tenant_id, null, 'participant', p_format, 1, trim(p_name), 0, case when v.cat = 'showcase' then null else now() end, auth.uid(), auth.uid())
    returning * into v_row;
  else
    raise exception 'unknown booking kind';
  end if;
  return v_row;
end;
$$;
revoke execute on function public.add_event_walk_in(uuid, text, text, uuid, text) from public, anon;
grant execute on function public.add_event_walk_in(uuid, text, text, uuid, text) to authenticated;
