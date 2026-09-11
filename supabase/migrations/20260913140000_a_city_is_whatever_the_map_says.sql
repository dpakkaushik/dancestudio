-- ─────────────────────────────────────────────────────────────────────────────
-- A CITY IS WHATEVER THE MAP SAYS (11 Sep 2026) — the user: "instead of
-- hardcoded city names I want to use APIs… nothing should be hardcoded,
-- everything should be based on API."
--
-- `DOS_CITIES` was twelve names in a TypeScript file, and `city_centroids` was
-- the same twelve seeded into a table. Between them they decided which cities
-- could exist: a studio in Kochi could not be created with its own city, and
-- Discover's chip could not offer one.
--
-- The obvious fix — let the geocoder say the city — has an obvious failure, and
-- it is the reason this migration is not just a DELETE. Discover groups by
-- EXACT CITY STRING: classes, events and crews are matched with `city = $1`. A
-- geocoder that answers "Bengaluru" today and "Bangalore" for a place mapped by
-- somebody else splits one city into two, and half a city's studios quietly
-- vanish from the other half's listing. The same is true of Gurgaon/Gurugram,
-- Bombay/Mumbai, Trivandrum/Thiruvananthapuram.
--
-- So a city is free-form AND canonical: whatever the map says, put through one
-- function that folds the known aliases together. Three pieces:
--
--   * `city_aliases` — alias → canonical. Seeded with the Indian renames that
--     actually collide, and an admin can add more without a deploy.
--   * `canonical_city(text)` — the one place the folding happens. Everything
--     that writes a city calls it; nothing writes a raw geocoder string.
--   * `remember_city(name, lat, lng)` — `city_centroids` stops being a fixed
--     list and becomes a REGISTRY that fills itself: the first studio in Kochi
--     puts Kochi on the map, with the coordinates the picker found.
--
-- And `discover_cities()` answers the chip with the cities that actually have
-- something in them, in the order of how much — which is a better list than
-- twelve names could ever be, because it is true.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. the aliases that actually collide ────────────────────────────────────
create table if not exists public.city_aliases (
  alias text primary key check (char_length(alias) between 1 and 120),
  city text not null check (char_length(city) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);
comment on table public.city_aliases is
  'alias -> canonical city (11 Sep 2026). The geocoder is not consistent about Indian city names and Discover groups by exact string, so every write folds through canonical_city(). Rows are lowercase aliases; the canonical side is the name people see.';

alter table public.city_aliases enable row level security;
drop policy if exists "anyone reads city aliases" on public.city_aliases;
create policy "anyone reads city aliases" on public.city_aliases
  for select to anon, authenticated using (deleted_at is null);
-- no write policy: an alias is added by a migration or by ops, never by a screen

drop trigger if exists city_aliases_set_updated_at on public.city_aliases;
create trigger city_aliases_set_updated_at
  before update on public.city_aliases
  for each row execute function public.set_updated_at();

insert into public.city_aliases (alias, city) values
  ('bangalore', 'Bengaluru'),
  ('bengaluru urban', 'Bengaluru'),
  ('bangalore urban', 'Bengaluru'),
  ('gurgaon', 'Gurugram'),
  ('bombay', 'Mumbai'),
  ('calcutta', 'Kolkata'),
  ('madras', 'Chennai'),
  ('poona', 'Pune'),
  ('trivandrum', 'Thiruvananthapuram'),
  ('cochin', 'Kochi'),
  ('mysore', 'Mysuru'),
  ('mangalore', 'Mangaluru'),
  ('baroda', 'Vadodara'),
  ('pondicherry', 'Puducherry'),
  ('new delhi', 'New Delhi'),
  ('delhi', 'New Delhi'),
  ('gurugram', 'Gurugram')
on conflict (alias) do update set city = excluded.city, updated_at = now();

-- ── 2. the one place a city name is folded ──────────────────────────────────
create or replace function public.canonical_city(p_name text)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select a.city from public.city_aliases a
      where a.alias = lower(btrim(p_name)) and a.deleted_at is null),
    nullif(btrim(p_name), '')
  );
$$;
comment on function public.canonical_city(text) is
  'The name a city is stored under (11 Sep 2026). Folds a known alias onto its canonical form and otherwise returns the trimmed input — so an unheard-of city is still allowed, it simply has no alias yet.';
grant execute on function public.canonical_city(text) to anon, authenticated;

-- fold what is already there, so today''s rows group with tomorrow''s
update public.tenants set city = public.canonical_city(city)
  where city is not null and city <> public.canonical_city(city);
update public.profiles set city = public.canonical_city(city)
  where city is not null and city <> public.canonical_city(city);
update public.events set city = public.canonical_city(city)
  where city is not null and city <> public.canonical_city(city);
update public.crews set city = public.canonical_city(city)
  where city is not null and city <> public.canonical_city(city);

-- the centroid registry follows the same rule
update public.city_centroids c set city = public.canonical_city(c.city)
  where c.city <> public.canonical_city(c.city)
    and not exists (select 1 from public.city_centroids d where d.city = public.canonical_city(c.city));
delete from public.city_centroids c
  where c.city <> public.canonical_city(c.city)
    and exists (select 1 from public.city_centroids d where d.city = public.canonical_city(c.city));

-- ── 3. the registry fills itself ────────────────────────────────────────────
create or replace function public.remember_city(p_name text, p_lat double precision, p_lng double precision)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_city text := public.canonical_city(p_name);
begin
  if v_city is null then
    return null;
  end if;
  -- a point outside India is a bug or a joke; the NAME is still remembered, the
  -- coordinates are not, so one bad pin cannot move a whole city's centre
  if p_lat is null or p_lng is null
     or p_lat < 6 or p_lat > 37.5 or p_lng < 68 or p_lng > 97.5 then
    insert into public.city_centroids (city, lat, lng)
    values (v_city, 0, 0)
    on conflict (city) do nothing;
    return v_city;
  end if;

  insert into public.city_centroids (city, lat, lng)
  values (v_city, p_lat, p_lng)
  on conflict (city) do nothing;
  return v_city;
end;
$$;
comment on function public.remember_city(text, double precision, double precision) is
  'Puts a city on the map the first time somebody is in it (11 Sep 2026) — city_centroids is a registry that fills itself now, not a fixed list of twelve. An existing city keeps its centre: the first pin defines it, so one mistyped studio cannot drag a city across the country.';
revoke execute on function public.remember_city(text, double precision, double precision) from public, anon;
grant execute on function public.remember_city(text, double precision, double precision) to authenticated;

-- ── 4. an owner may name any city, and naming it registers it ───────────────
create or replace function public.set_tenant_location(
  p_tenant_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_area text default null,
  p_city text default null
)
returns public.tenants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_tenant public.tenants;
  v_city text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.tenant_members m
     where m.tenant_id = p_tenant_id and m.user_id = v_user
       and m.member_role = 'owner' and m.deleted_at is null
  ) then
    raise exception 'only an owner says where a business is';
  end if;

  -- the numbers came from a browser, so the server checks them rather than
  -- trusting them: a point outside India is a bug or a joke, and either way it
  -- would put a studio in the sea on somebody's Discover
  if p_lat is null or p_lng is null
     or p_lat < 6 or p_lat > 37.5 or p_lng < 68 or p_lng > 97.5 then
    raise exception 'that point is not in India';
  end if;

  if p_area is not null and char_length(btrim(p_area)) > 140 then
    raise exception 'an area is at most 140 characters';
  end if;
  if p_city is not null and char_length(btrim(p_city)) > 120 then
    raise exception 'a city name is at most 120 characters';
  end if;

  -- ⚠ THE CLOSED LIST IS GONE (11 Sep 2026). This used to look the city up in
  -- `city_centroids` and DROP IT if it was not one of the twelve seeded there,
  -- which meant a studio in a city DanceOS had not thought of kept whatever
  -- city it was created with — usually the wrong one, silently. Any city the
  -- map names is allowed now; it is folded onto its canonical form so
  -- Bengaluru and Bangalore stay one city, and remembering it puts it on the
  -- registry Discover's own list is built from.
  v_city := public.canonical_city(p_city);
  if v_city is not null then
    perform public.remember_city(v_city, p_lat, p_lng);
  end if;

  update public.tenants t
     set lat = p_lat,
         lng = p_lng,
         area = coalesce(nullif(btrim(p_area), ''), t.area),
         city = coalesce(v_city, t.city),
         location_set_at = now(),
         updated_by = v_user
   where t.id = p_tenant_id and t.deleted_at is null
  returning * into v_tenant;

  if v_tenant.id is null then
    raise exception 'that business no longer exists';
  end if;
  return v_tenant;
end;
$$;
comment on function public.set_tenant_location(uuid, double precision, double precision, text, text) is
  'An owner places their business on the map (11 Sep 2026). Checks ownership and refuses a point outside India. ANY city the map names is accepted — folded through canonical_city so aliases group together, and registered in city_centroids so Discover can offer it. Stamps location_set_at, which is what separates a chosen point from the city centroid it started as.';
revoke execute on function public.set_tenant_location(uuid, double precision, double precision, text, text) from public, anon;
grant execute on function public.set_tenant_location(uuid, double precision, double precision, text, text) to authenticated;

-- ── 5. the city list is the cities that have something in them ──────────────
create or replace function public.discover_cities()
returns table (city text, lat double precision, lng double precision, businesses integer)
language sql
stable
set search_path = ''
as $$
  with live as (
    select t.city, count(*)::integer as n
      from public.tenants t
     where t.deleted_at is null
       and t.city is not null
       and t.type in ('studio', 'trainer_business')
       and t.visibility = 'listed'
     group by t.city
  )
  select c.city,
         c.lat,
         c.lng,
         coalesce(l.n, 0) as businesses
    from public.city_centroids c
    left join live l on l.city = c.city
   where c.deleted_at is null
     and (coalesce(l.n, 0) > 0 or c.lat <> 0)
   order by coalesce(l.n, 0) desc, c.city;
$$;
comment on function public.discover_cities() is
  'The cities Discover offers (11 Sep 2026): every city with a listed business, busiest first, then the rest of the registry. Replaces the hardcoded DOS_CITIES — a list of twelve names that could not grow and was wrong the moment somebody opened a studio in a thirteenth city. SECURITY INVOKER: it counts only what the caller could see anyway.';
grant execute on function public.discover_cities() to anon, authenticated;

-- the chip and the grouping both read city, so it is worth an index
create index if not exists tenants_city_listed_idx
  on public.tenants (city) where deleted_at is null and visibility = 'listed';
