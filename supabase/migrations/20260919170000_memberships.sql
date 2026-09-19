-- ═══════════════════════════════════════════════════════════════════════════
-- MEMBERSHIPS (19 Sep 2026) ⚠ money
--
-- The user: "Memberships can be created by just 4 things — Name, No. of hrs /
-- No. of classes, price, and total memberships count. Memberships should be
-- allowed in Class form and Policy section in Class Detail as well; from the
-- form should be able to toggle whether studio and artist memberships are
-- allowed or not. Users should be able to buy from Studio and Artist Profile
-- Pages and track from memberships section in tools. Artist should be able to
-- create and track usage of memberships they have created and memberships they
-- have purchased. Studio should be able to create memberships. Make sure able
-- to track memberships usage for class and student wise with progress bar for
-- completion. Should also be added to earnings for studio and artist."
--
-- FOUR TABLES' WORTH OF IDEA, IN THREE:
--   · `memberships`   — what a business SELLS. The four things and nothing
--     else: a name, a UNIT (classes or hours) with how many, a price, and how
--     many of it may be sold at all (`total_count`). A studio sells them; so
--     does an artist, through their own page.
--   · `membership_passes` — what a person BOUGHT. It snapshots the price and
--     the units, because a membership's price may change tomorrow and what
--     somebody paid for may not. `units_used` is the progress bar's numerator.
--   · `membership_uses` — one row per SPEND, naming the class booking it paid
--     for. This is what makes usage answerable BOTH WAYS — per class (who came
--     on a membership) and per student (how far through theirs they are) —
--     without either being a number somebody has to keep in step.
--
-- AND TWO COLUMNS ON `classes`: `allows_studio_memberships` and
-- `allows_artist_memberships`. The class form's two toggles, the Policy
-- section's two sentences, and the rule `book_class_session` enforces — one
-- fact, read in three places, so a screen cannot promise what the door refuses.
--
-- WHOSE MEMBERSHIP MAY BE SPENT WHERE. A pass is sold by a business; a class is
-- owned by a business and taught by a person. So:
--   · the OWNER's own pass is spent on its own class while `allows_studio_…`;
--   · the confirmed ARTIST's pass is spent on a class they teach anywhere while
--     `allows_artist_memberships` — which is what lets somebody buy ten classes
--     from an artist and spend them at whichever studio that artist teaches in.
-- A pass is never spent on a class its seller has nothing to do with.
--
-- THE MONEY IS THE RAIL WE ALREADY HAVE. `orders` learns a third subject, and
-- `apply_captured_payment` a third branch — so a membership sale writes the same
-- `payments` row a class seat does, against the same `business_id`, which is why
-- it appears in the studio's and the artist's earnings without one line of the
-- earnings desk changing. A FREE membership (₹0) is granted directly.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. what a business sells ────────────────────────────────────────────────
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- THE FOUR THINGS: a name, a unit and how many of it, a price, and how many may be sold
  unit text not null check (unit in ('classes', 'hours')),
  units numeric(6, 1) not null check (units > 0 and units <= 999),
  price_inr integer not null check (price_inr >= 0 and price_inr <= 1000000),
  total_count integer not null check (total_count > 0 and total_count <= 10000),
  status text not null default 'live' check (status in ('live', 'draft')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users (id),
  updated_by uuid not null default auth.uid() references auth.users (id),
  deleted_at timestamptz
);
comment on table public.memberships is
  'What a studio or an artist SELLS (19 Sep 2026): a name, a unit (classes or hours) with how many, a price, and how many of it may be sold. Four things, by the user''s own list.';
create index if not exists memberships_business_idx on public.memberships (business_id) where deleted_at is null;

-- ── 2. what a person bought ─────────────────────────────────────────────────
create table if not exists public.membership_passes (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- snapshots: what a membership costs and is worth may change; what somebody bought may not
  price_inr integer not null check (price_inr >= 0),
  unit text not null check (unit in ('classes', 'hours')),
  units_total numeric(6, 1) not null check (units_total > 0),
  units_used numeric(6, 1) not null default 0 check (units_used >= 0),
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'active', 'used_up', 'cancelled')),
  bought_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users (id),
  updated_by uuid not null default auth.uid() references auth.users (id),
  deleted_at timestamptz
);
comment on table public.membership_passes is
  'A membership somebody BOUGHT (19 Sep 2026). `pending_payment` holds no units — it is the row the money lands on, exactly as an event booking is; `units_used` is the progress bar''s numerator.';
create index if not exists membership_passes_user_idx on public.membership_passes (user_id) where deleted_at is null;
create index if not exists membership_passes_business_idx on public.membership_passes (business_id) where deleted_at is null;

-- ── 3. one row per spend — usage, both ways ─────────────────────────────────
create table if not exists public.membership_uses (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid not null references public.membership_passes (id) on delete cascade,
  membership_id uuid not null references public.memberships (id) on delete cascade,
  class_booking_id uuid not null references public.class_bookings (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  units numeric(6, 1) not null check (units > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users (id),
  updated_by uuid not null default auth.uid() references auth.users (id),
  deleted_at timestamptz
);
comment on table public.membership_uses is
  'One spend of a membership, naming the class booking it paid for (19 Sep 2026). Usage per CLASS and per STUDENT is counted from these rows, so neither is a number anybody has to keep in step.';
create unique index if not exists membership_uses_booking_idx on public.membership_uses (class_booking_id) where deleted_at is null;
create index if not exists membership_uses_pass_idx on public.membership_uses (pass_id) where deleted_at is null;
create index if not exists membership_uses_class_idx on public.membership_uses (class_id) where deleted_at is null;

-- ── 4. a class says which memberships it takes ──────────────────────────────
alter table public.classes
  add column if not exists allows_studio_memberships boolean not null default true,
  add column if not exists allows_artist_memberships boolean not null default false;
comment on column public.classes.allows_studio_memberships is
  'Whether a membership sold by the business that OWNS this class may be spent on it (19 Sep 2026) — the class form''s first toggle and the Policy section''s first line.';
comment on column public.classes.allows_artist_memberships is
  'Whether a membership sold by this class''s confirmed ARTIST may be spent on it (19 Sep 2026) — which is what lets somebody buy ten classes from an artist and spend them wherever that artist teaches.';

do $$
declare t text;
begin
  foreach t in array array['memberships', 'membership_passes', 'membership_uses'] loop
    execute format('drop trigger if exists %I_updated_at on public.%I', t, t);
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end;
$$;

-- ── who may see what ────────────────────────────────────────────────────────
alter table public.memberships enable row level security;
alter table public.membership_passes enable row level security;
alter table public.membership_uses enable row level security;
-- a new table arrives with Supabase's DEFAULT privileges — ALL to anon and
-- authenticated. A policy is not a grant (19 Sep). Reads only.
revoke all on public.memberships from public, anon, authenticated;
revoke all on public.membership_passes from public, anon, authenticated;
revoke all on public.membership_uses from public, anon, authenticated;
grant select on public.memberships to anon, authenticated;
grant select on public.membership_passes to authenticated;
grant select on public.membership_uses to authenticated;

-- what is ON SALE is public: it is a price on a profile page anybody may read
drop policy if exists "anyone reads a live membership of a public business" on public.memberships;
create policy "anyone reads a live membership of a public business" on public.memberships
  for select to anon, authenticated
  using (
    deleted_at is null and status = 'live'
    and exists (
      select 1 from public.businesses b
       where b.id = business_id and b.deleted_at is null and b.visibility = 'listed'
    )
  );
drop policy if exists "a business reads its own memberships" on public.memberships;
create policy "a business reads its own memberships" on public.memberships
  for select to authenticated
  using (public.is_business_member(business_id));

-- a pass is the buyer's and the seller's, and nobody else's
drop policy if exists "people read their own passes" on public.membership_passes;
create policy "people read their own passes" on public.membership_passes
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "a business reads the passes it sold" on public.membership_passes;
create policy "a business reads the passes it sold" on public.membership_passes
  for select to authenticated using (public.is_business_member(business_id));
drop policy if exists "people read their own uses" on public.membership_uses;
create policy "people read their own uses" on public.membership_uses
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "a business reads uses on its own classes" on public.membership_uses;
create policy "a business reads uses on its own classes" on public.membership_uses
  for select to authenticated
  using (exists (select 1 from public.classes c where c.id = class_id and public.is_business_member(c.business_id)));

-- ── the doors: a business writes its own memberships ────────────────────────
create or replace function public.save_membership(
  p_membership_id uuid,
  p_business_id uuid,
  p_name text,
  p_unit text,
  p_units numeric,
  p_price_inr integer,
  p_total_count integer,
  p_status text
)
returns public.memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_type text;
  v_row public.memberships;
  v_sold integer;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.business_members m
     where m.business_id = p_business_id and m.user_id = v_user
       and m.member_role = 'owner' and m.deleted_at is null
  ) then
    raise exception 'only an owner sells a membership';
  end if;
  -- AN ORGANIZATION'S HOSTING ROW SELLS NOTHING (R15): it runs events, and a
  -- membership is spent on CLASSES, which that row can never carry (why_no_class)
  select b.type into v_type from public.businesses b where b.id = p_business_id and b.deleted_at is null;
  if v_type not in ('studio', 'artist_page') then
    raise exception 'a membership is a studio''s or an artist''s';
  end if;
  if p_name is null or char_length(btrim(p_name)) < 1 then
    raise exception 'name the membership';
  end if;
  if p_unit not in ('classes', 'hours') then
    raise exception 'a membership is so many classes, or so many hours';
  end if;
  if p_units is null or p_units <= 0 then
    raise exception 'say how many';
  end if;
  if p_price_inr is null or p_price_inr < 0 then
    raise exception 'a price is zero or more';
  end if;
  if p_total_count is null or p_total_count < 1 then
    raise exception 'say how many of these may be sold';
  end if;
  if p_status not in ('live', 'draft') then
    raise exception 'invalid status';
  end if;

  if p_membership_id is null then
    insert into public.memberships (business_id, name, unit, units, price_inr, total_count, status)
    values (p_business_id, btrim(p_name), p_unit, p_units, p_price_inr, p_total_count, p_status)
    returning * into v_row;
    return v_row;
  end if;

  -- what is already sold is a floor under the count: a cap cannot be dropped
  -- below the passes that exist, or the number would be a lie about the past
  select count(*) into v_sold from public.membership_passes p
    where p.membership_id = p_membership_id and p.status <> 'cancelled' and p.deleted_at is null;
  if p_total_count < v_sold then
    raise exception 'already sold % of these — the count cannot go below that', v_sold;
  end if;

  update public.memberships
     set name = btrim(p_name), unit = p_unit, units = p_units,
         price_inr = p_price_inr, total_count = p_total_count, status = p_status,
         updated_by = v_user
   where id = p_membership_id and business_id = p_business_id and deleted_at is null
  returning * into v_row;
  if v_row.id is null then
    raise exception 'that membership is not this business''s';
  end if;
  return v_row;
end;
$$;
revoke execute on function public.save_membership(uuid, uuid, text, text, numeric, integer, integer, text) from public, anon;
grant execute on function public.save_membership(uuid, uuid, text, text, numeric, integer, integer, text) to authenticated, service_role;

create or replace function public.delete_membership(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.memberships;
begin
  select * into v_row from public.memberships where id = p_membership_id and deleted_at is null;
  if not found then
    raise exception 'that membership no longer exists';
  end if;
  if not exists (
    select 1 from public.business_members m
     where m.business_id = v_row.business_id and m.user_id = v_user
       and m.member_role = 'owner' and m.deleted_at is null
  ) then
    raise exception 'only an owner removes a membership';
  end if;
  -- TAKING IT OFF SALE IS NOT TAKING IT BACK: every pass already bought keeps
  -- its units and keeps working. This is the same promise a cancelled
  -- subscription makes — what was paid for stands.
  update public.memberships set deleted_at = now(), updated_by = v_user where id = p_membership_id;
end;
$$;
revoke execute on function public.delete_membership(uuid) from public, anon;
grant execute on function public.delete_membership(uuid) to authenticated, service_role;

-- ── buying one ──────────────────────────────────────────────────────────────
-- the sentence between somebody and a membership, so a screen can say it
create or replace function public.why_no_membership(p_membership_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_m public.memberships;
  v_sold integer;
begin
  select * into v_m from public.memberships where id = p_membership_id and deleted_at is null;
  if not found then
    return 'that membership is no longer on sale';
  end if;
  if v_m.status <> 'live' then
    return 'that membership is not on sale yet';
  end if;
  if not exists (select 1 from public.businesses b where b.id = v_m.business_id and b.deleted_at is null and b.visibility = 'listed') then
    return 'that business is not open to the public';
  end if;
  if exists (select 1 from public.business_members m where m.business_id = v_m.business_id and m.user_id = auth.uid() and m.deleted_at is null) then
    return 'you are on this team — a membership is for the people who come to dance';
  end if;
  select count(*) into v_sold from public.membership_passes p
    where p.membership_id = p_membership_id and p.status <> 'cancelled' and p.deleted_at is null;
  if v_sold >= v_m.total_count then
    return 'all ' || v_m.total_count || ' of these have been taken';
  end if;
  if exists (
    select 1 from public.membership_passes p
     where p.membership_id = p_membership_id and p.user_id = auth.uid()
       and p.status = 'active' and p.units_used < p.units_total and p.deleted_at is null
  ) then
    return 'you already hold one of these — use it up first';
  end if;
  return null;
end;
$$;
grant execute on function public.why_no_membership(uuid) to authenticated;
revoke execute on function public.why_no_membership(uuid) from public, anon;

create or replace function public.buy_membership(p_membership_id uuid)
returns public.membership_passes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_m public.memberships;
  v_why text;
  v_row public.membership_passes;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user and p.role = 'user' and p.deleted_at is null) then
    -- guard_person_only's rule, said in this door's own words
    raise exception 'a membership is bought by a person';
  end if;
  -- lock the membership: the cap is a race otherwise, exactly as a seat is
  select * into v_m from public.memberships where id = p_membership_id and deleted_at is null for update;
  v_why := public.why_no_membership(p_membership_id);
  if v_why is not null then
    raise exception '%', v_why;
  end if;

  insert into public.membership_passes (membership_id, business_id, user_id, price_inr, unit, units_total, status, bought_at)
  values (p_membership_id, v_m.business_id, v_user, v_m.price_inr, v_m.unit, v_m.units,
          case when v_m.price_inr = 0 then 'active' else 'pending_payment' end,
          case when v_m.price_inr = 0 then now() else null end)
  returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.buy_membership(uuid) from public, anon;
grant execute on function public.buy_membership(uuid) to authenticated;

-- ── the money: a third subject on an order ──────────────────────────────────
alter table public.orders
  add column if not exists membership_id uuid references public.memberships (id) on delete cascade,
  add column if not exists membership_pass_id uuid references public.membership_passes (id) on delete set null;

alter table public.orders drop constraint if exists orders_subject_check;
alter table public.orders add constraint orders_subject_check
  check (
    (class_id is not null and session_id is not null and event_id is null and membership_id is null)
    or (event_id is not null and class_id is null and session_id is null and membership_id is null)
    or (membership_id is not null and class_id is null and session_id is null and event_id is null)
  );
create index if not exists orders_membership_idx on public.orders (membership_id) where membership_id is not null and deleted_at is null;

create or replace function public.create_membership_payment_order(p_pass_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_pass public.membership_passes;
  v_row public.orders;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_pass from public.membership_passes
    where id = p_pass_id and user_id = v_user and deleted_at is null;
  if not found then
    raise exception 'that membership is not yours to pay for';
  end if;
  if v_pass.status <> 'pending_payment' then
    raise exception 'that membership is already paid for';
  end if;
  -- ⚠ THE AMOUNT IS THE PASS'S, NEVER THE CLIENT'S (Step 9's rule)
  insert into public.orders (business_id, user_id, membership_id, membership_pass_id, amount_inr, status, created_by, updated_by)
  values (v_pass.business_id, v_user, v_pass.membership_id, v_pass.id, v_pass.price_inr, 'created', v_user, v_user)
  returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.create_membership_payment_order(uuid) from public, anon;
grant execute on function public.create_membership_payment_order(uuid) to authenticated;

-- ── spending one ────────────────────────────────────────────────────────────
-- WHICH PASSES THIS SESSION WILL TAKE, and what each would cost — the one
-- question the booking sheet asks, answered where the rule lives.
create or replace function public.passes_for_session(p_session_id uuid)
returns table (pass_id uuid, membership_name text, business_name text, unit text, units_total numeric, units_used numeric, units_needed numeric, enough boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select se.id, se.class_id, se.starts_at, se.ends_at, c.business_id, c.allows_studio_memberships, c.allows_artist_memberships
      from public.class_sessions se
      join public.classes c on c.id = se.class_id and c.deleted_at is null
     where se.id = p_session_id and se.deleted_at is null
  )
  select p.id, m.name, b.name, p.unit, p.units_total, p.units_used,
         case when p.unit = 'hours'
              then round(extract(epoch from (s.ends_at - s.starts_at)) / 3600.0, 1)
              else 1 end,
         (p.units_total - p.units_used) >=
           case when p.unit = 'hours'
                then round(extract(epoch from (s.ends_at - s.starts_at)) / 3600.0, 1)
                else 1 end
    from s
    join public.membership_passes p
      on p.user_id = auth.uid() and p.status = 'active' and p.deleted_at is null
    join public.memberships m on m.id = p.membership_id
    join public.businesses b on b.id = p.business_id
   where (
     -- the studio's own pass, on its own class
     (p.business_id = s.business_id and s.allows_studio_memberships)
     -- the artist's pass, on a class that artist is confirmed to teach
     or (s.allows_artist_memberships and exists (
           select 1 from public.class_people k
             join public.businesses ab on ab.id = p.business_id and ab.type = 'artist_page'
            where k.class_id = s.class_id and k.kind = 'artist' and k.status = 'confirmed' and k.deleted_at is null
              and k.user_id = public.business_owner(p.business_id)
         ))
   )
   order by 8 desc, 2;
$$;
revoke execute on function public.passes_for_session(uuid) from public, anon;
grant execute on function public.passes_for_session(uuid) to authenticated;

-- book a seat WITH a membership: one door, so the seat and the spend are one act
create or replace function public.book_with_membership(p_session_id uuid, p_pass_id uuid)
returns public.class_bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_session public.class_sessions;
  v_class public.classes;
  v_pass public.membership_passes;
  v_need numeric(6, 1);
  v_taken integer;
  v_ok boolean;
  v_row public.class_bookings;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_session from public.class_sessions s where s.id = p_session_id and s.deleted_at is null;
  if not found then
    raise exception 'session not found';
  end if;
  if v_session.starts_at <= now() then
    raise exception 'this session has already started';
  end if;
  select * into v_class from public.classes c
    where c.id = v_session.class_id and c.deleted_at is null and c.status = 'published' for update;
  if not found then
    raise exception 'class is not open for booking';
  end if;
  -- the pass, locked: two bookings at once must not spend the same last unit
  select * into v_pass from public.membership_passes p
    where p.id = p_pass_id and p.user_id = v_user and p.deleted_at is null for update;
  if not found then
    raise exception 'that membership is not yours';
  end if;
  if v_pass.status <> 'active' then
    raise exception 'that membership is not active';
  end if;

  select exists (select 1 from public.passes_for_session(p_session_id) f where f.pass_id = p_pass_id) into v_ok;
  if not v_ok then
    raise exception 'this class does not take that membership';
  end if;

  v_need := case when v_pass.unit = 'hours'
                 then round(extract(epoch from (v_session.ends_at - v_session.starts_at)) / 3600.0, 1)
                 else 1 end;
  if v_pass.units_total - v_pass.units_used < v_need then
    raise exception 'not enough left on that membership';
  end if;

  if exists (
    select 1 from public.class_bookings e
     where e.session_id = p_session_id and e.user_id = v_user
       and e.status in ('enrolled', 'waitlisted') and e.deleted_at is null
  ) then
    raise exception 'you already have a spot in this class';
  end if;

  select count(*) into v_taken from public.class_bookings e
    where e.session_id = p_session_id and e.status = 'enrolled' and e.deleted_at is null;
  if v_taken >= v_class.capacity then
    raise exception 'this class is full — join the waitlist instead';
  end if;

  insert into public.class_bookings (session_id, class_id, business_id, user_id, status, created_by, updated_by)
  values (p_session_id, v_class.id, v_class.business_id, v_user, 'enrolled', v_user, v_user)
  returning * into v_row;

  insert into public.membership_uses (pass_id, membership_id, class_booking_id, class_id, session_id, user_id, units)
  values (v_pass.id, v_pass.membership_id, v_row.id, v_class.id, p_session_id, v_user, v_need);

  update public.membership_passes
     set units_used = units_used + v_need,
         status = case when units_used + v_need >= units_total then 'used_up' else 'active' end,
         updated_by = v_user
   where id = v_pass.id;

  return v_row;
end;
$$;
revoke execute on function public.book_with_membership(uuid, uuid) from public, anon;
grant execute on function public.book_with_membership(uuid, uuid) to authenticated;

-- ⚠ CANCELLING A MEMBERSHIP SEAT PUTS THE UNIT BACK. `cancel_class_booking_with_reason`
-- is Step 9's own money path and is left alone; this trigger is what keeps the
-- pass honest whichever door cancels the seat — a unit spent on a class nobody
-- attended is a unit the person still owns.
create or replace function public.return_membership_unit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_use public.membership_uses;
begin
  if new.status <> 'cancelled' or old.status = 'cancelled' then
    return new;
  end if;
  select * into v_use from public.membership_uses u
    where u.class_booking_id = new.id and u.deleted_at is null;
  if not found then
    return new;
  end if;
  update public.membership_uses set deleted_at = now() where id = v_use.id;
  update public.membership_passes
     set units_used = greatest(units_used - v_use.units, 0),
         status = case when status = 'used_up' then 'active' else status end
   where id = v_use.pass_id;
  return new;
end;
$$;
revoke execute on function public.return_membership_unit() from public, anon, authenticated;
drop trigger if exists class_bookings_return_membership on public.class_bookings;
create trigger class_bookings_return_membership after update of status on public.class_bookings
  for each row execute function public.return_membership_unit();

-- ── the desks ───────────────────────────────────────────────────────────────
-- what a business sells, and how each is going: sold of the count, the units
-- bought and the units actually danced (the progress bar's two numbers)
create or replace function public.business_memberships(p_business_id uuid)
returns table (
  id uuid, name text, unit text, units numeric, price_inr integer, total_count integer, status text,
  sold integer, active integer, units_sold numeric, units_used numeric, revenue_inr integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.name, m.unit, m.units, m.price_inr, m.total_count, m.status,
         coalesce(p.n, 0), coalesce(p.n_active, 0),
         coalesce(p.units_total, 0), coalesce(p.units_used, 0), coalesce(p.paid, 0)
    from public.memberships m
    left join lateral (
      select count(*)::integer as n,
             count(*) filter (where x.status = 'active')::integer as n_active,
             sum(x.units_total) as units_total,
             sum(x.units_used) as units_used,
             sum(x.price_inr) filter (where x.status in ('active', 'used_up'))::integer as paid
        from public.membership_passes x
       where x.membership_id = m.id and x.status <> 'cancelled' and x.deleted_at is null
    ) p on true
   where m.business_id = p_business_id
     and m.deleted_at is null
     and public.is_business_member(p_business_id)
   order by m.created_at desc;
$$;
revoke execute on function public.business_memberships(uuid) from public, anon;
grant execute on function public.business_memberships(uuid) to authenticated;

-- the people holding one of a business's memberships, and how far through they are
create or replace function public.membership_holders(p_membership_id uuid)
returns table (pass_id uuid, user_id uuid, full_name text, profile_photo_path text, unit text, units_total numeric, units_used numeric, status text, bought_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.user_id, pr.full_name, pr.profile_photo_path, p.unit, p.units_total, p.units_used, p.status, p.bought_at
    from public.membership_passes p
    join public.memberships m on m.id = p.membership_id
    join public.profiles pr on pr.id = p.user_id
   where p.membership_id = p_membership_id
     and p.deleted_at is null and p.status <> 'pending_payment'
     and public.is_business_member(m.business_id)
   order by p.bought_at desc nulls last;
$$;
revoke execute on function public.membership_holders(uuid) from public, anon;
grant execute on function public.membership_holders(uuid) to authenticated;

-- CLASS-WISE USAGE: which classes a membership has actually been spent on
create or replace function public.membership_class_usage(p_membership_id uuid)
returns table (class_id uuid, share_slug text, style text, level text, business_name text, uses integer, units numeric, people integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.share_slug, c.style, c.level, b.name,
         count(*)::integer, sum(u.units), count(distinct u.user_id)::integer
    from public.membership_uses u
    join public.classes c on c.id = u.class_id
    join public.businesses b on b.id = c.business_id
    join public.memberships m on m.id = u.membership_id
   where u.membership_id = p_membership_id
     and u.deleted_at is null
     and (public.is_business_member(m.business_id) or u.user_id = auth.uid())
   group by c.id, c.share_slug, c.style, c.level, b.name
   order by 6 desc;
$$;
revoke execute on function public.membership_class_usage(uuid) from public, anon;
grant execute on function public.membership_class_usage(uuid) to authenticated;

-- what the signed-in person HOLDS — the Memberships tile's own list
create or replace function public.my_memberships()
returns table (
  pass_id uuid, membership_id uuid, name text, business_id uuid, business_name text, business_type text,
  unit text, units_total numeric, units_used numeric, status text, price_inr integer, bought_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.membership_id, m.name, p.business_id, b.name, b.type,
         p.unit, p.units_total, p.units_used, p.status, p.price_inr, p.bought_at
    from public.membership_passes p
    join public.memberships m on m.id = p.membership_id
    join public.businesses b on b.id = p.business_id
   where p.user_id = auth.uid() and p.deleted_at is null
   order by p.created_at desc;
$$;
revoke execute on function public.my_memberships() from public, anon;
grant execute on function public.my_memberships() to authenticated;

-- every session a pass has been spent on — the holder's own history
create or replace function public.pass_uses(p_pass_id uuid)
returns table (class_id uuid, share_slug text, style text, level text, business_name text, starts_at timestamptz, units numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.share_slug, c.style, c.level, b.name, s.starts_at, u.units
    from public.membership_uses u
    join public.classes c on c.id = u.class_id
    join public.class_sessions s on s.id = u.session_id
    join public.businesses b on b.id = c.business_id
    join public.membership_passes p on p.id = u.pass_id
   where u.pass_id = p_pass_id and u.deleted_at is null
     and (p.user_id = auth.uid() or public.is_business_member(p.business_id))
   order by s.starts_at desc;
$$;
revoke execute on function public.pass_uses(uuid) from public, anon;
grant execute on function public.pass_uses(uuid) to authenticated;

-- what a business sells, for its PUBLIC page (anon reads a listed business's live ones)
create or replace function public.public_memberships(p_business_id uuid)
returns table (id uuid, name text, unit text, units numeric, price_inr integer, total_count integer, left_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.name, m.unit, m.units, m.price_inr, m.total_count,
         greatest(m.total_count - coalesce((
           select count(*)::integer from public.membership_passes p
            where p.membership_id = m.id and p.status <> 'cancelled' and p.deleted_at is null
         ), 0), 0)
    from public.memberships m
    join public.businesses b on b.id = m.business_id
   where m.business_id = p_business_id
     and m.deleted_at is null and m.status = 'live'
     and b.deleted_at is null and b.visibility = 'listed'
   order by m.price_inr, m.name;
$$;
comment on function public.public_memberships(uuid) is
  'What a listed studio or artist page has ON SALE (19 Sep 2026), with how many are left. A price on a public page is public; who holds one is not.';
grant execute on function public.public_memberships(uuid) to anon, authenticated;

-- ── the payment: a membership branch on the one applier ─────────────────────
-- Same shape as the event branch (17 Sep 2026): lock the subject, refuse to
-- hand out what is no longer there, and ledger a refund rather than keep money
-- for something the buyer did not get.
create or replace function public.apply_membership_payment(p_order_id uuid, p_payment_id uuid, p_amount_paise bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_pass public.membership_passes;
  v_m public.memberships;
  v_sold integer;
  v_why text := null;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  select * into v_m from public.memberships m where m.id = v_order.membership_id for update;
  select * into v_pass from public.membership_passes p where p.id = v_order.membership_pass_id for update;

  if v_order.status <> 'created' then
    v_why := 'payment landed on a closed order';
  elsif p_amount_paise <> v_order.amount_inr::bigint * 100 then
    v_why := 'amount did not match the order';
  elsif v_pass.id is null or v_pass.deleted_at is not null then
    v_why := 'the membership no longer exists';
  elsif v_pass.status = 'active' or v_pass.status = 'used_up' then
    v_why := 'already paid for';
  elsif v_pass.status = 'cancelled' then
    v_why := 'the membership was cancelled before the payment landed';
  else
    select count(*) into v_sold from public.membership_passes p
      where p.membership_id = v_m.id and p.status <> 'cancelled' and p.deleted_at is null and p.id <> v_pass.id;
    if v_sold >= v_m.total_count then
      v_why := 'all of these were taken before the payment landed';
    end if;
  end if;

  if v_why is not null then
    update public.orders set status = 'refund_pending', updated_by = v_order.user_id where id = v_order.id;
    insert into public.refunds (order_id, payment_id, business_id, user_id, amount_inr, status, reason, created_by, updated_by)
    values (v_order.id, p_payment_id, v_order.business_id, v_order.user_id, v_order.amount_inr, 'pending', v_why, v_order.user_id, v_order.user_id);
    return jsonb_build_object('outcome', 'refunded', 'reason', v_why);
  end if;

  update public.membership_passes set status = 'active', bought_at = now(), updated_by = v_order.user_id where id = v_pass.id;
  update public.orders set status = 'paid', updated_by = v_order.user_id where id = v_order.id;
  return jsonb_build_object('outcome', 'granted', 'pass_id', v_pass.id);
end;
$$;
revoke execute on function public.apply_membership_payment(uuid, uuid, bigint) from public, anon, authenticated;

-- ⚠ THE ONE APPLIER GAINS A THIRD BRANCH WITHOUT ITS OTHER TWO BEING RE-TYPED.
-- `create or replace` replaces the WHOLE body, and the class and event branches
-- are 200 lines of money logic that has been proven twice (Step 9, 17 Sep) — a
-- re-typed function is one that can differ, and a difference here is a wrong
-- refund. So the live definition is read out of the catalog and re-created under
-- a second name, exactly as the 16 Sep rename did, and the function the webhook
-- calls becomes a dispatcher: memberships here, everything else through the
-- body that already worked.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'apply_captured_payment'
     and pg_get_function_identity_arguments(p.oid) = 'p_provider_order_id text, p_provider_payment_id text, p_amount_paise bigint, p_method text';
  if v_def is null then
    raise exception 'apply_captured_payment not found — nothing to carry forward';
  end if;
  if position('apply_captured_payment_classes_and_events' in v_def) > 0 then
    raise exception 'the applier has already been split';
  end if;
  execute replace(v_def, 'FUNCTION public.apply_captured_payment(', 'FUNCTION public.apply_captured_payment_classes_and_events(');
end;
$$;
revoke execute on function public.apply_captured_payment_classes_and_events(text, text, bigint, text) from public, anon, authenticated;

create or replace function public.apply_captured_payment(p_provider_order_id text, p_provider_payment_id text, p_amount_paise bigint, p_method text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;
revoke execute on function public.apply_captured_payment(text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.apply_captured_payment(text, text, bigint, text) to service_role;
