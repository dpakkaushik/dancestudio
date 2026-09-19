-- ═══════════════════════════════════════════════════════════════════════════
-- EIGHT CITIES, AND NOTHING ELSE (19 Sep 2026)
--
-- The user: "keep only these cities in database — Gurugram, New Delhi,
-- Bengaluru, Hyderabad, Pune, Mumbai, Kolkata, Chennai — and nothing else.
-- Gurgaon and Gurugram are same so merge data for them. Nothing should be
-- without a city."
--
-- On 11 Sep 2026 the city list was opened up ("a city is whatever the map
-- says"): any city Google named was allowed, folded through `canonical_city`
-- and registered on the way in. Today the user closes it again — DanceOS
-- serves eight cities, and a row is in one of them or it is not saved. So:
--
--   1. `cities` holds exactly the eight, each with a real centre; every other
--      row is soft-deleted (Noida, Faridabad, Chandigarh, Jaipur, Ahmedabad …).
--   2. `city_aliases` folds the names people actually type onto the eight —
--      Gurgaon → Gurugram, Delhi → New Delhi, Bangalore → Bengaluru, Bombay →
--      Mumbai, Calcutta → Kolkata, Madras → Chennai, Poona → Pune — and the
--      NCR and satellite towns onto their metro (Faridabad, Noida, Ghaziabad →
--      New Delhi; Navi Mumbai, Thane → Mumbai; Secunderabad → Hyderabad;
--      Howrah → Kolkata). Aliases onto cities not served are soft-deleted.
--   3. `canonical_city(text)` answers ONE OF THE EIGHT or NULL — it no longer
--      hands back an unheard-of name as if it were fine. `remember_city` and
--      `set_business_location` already treat a null as "leave the city alone".
--   4. EVERY ROW THAT CARRIES A CITY IS IN ONE OF THE EIGHT: a BEFORE trigger
--      on profiles, businesses, crews and events folds the name on the way in
--      and REFUSES one that is not served — in words that name the eight. The
--      rows already there are folded first; a row in a city that cannot be
--      folded (a proof leftover in Ahmedabad or Chandigarh — see the probe in
--      the CLAUDE.md record) is moved to New Delhi and COUNTED in a NOTICE,
--      because "nothing should be without a city" and there is no honest
--      alias for it.
--
-- No policy changes, no grant changes: `canonical_city` and `discover_cities`
-- keep their grants (anon + authenticated); the trigger function is executable
-- by nobody. `discover_cities()` already reads only live `cities` rows, so the
-- dropdown everywhere is the eight from the moment this applies.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. the eight, with real centres ─────────────────────────────────────────
insert into public.cities (city, lat, lng) values
  ('Gurugram',  28.4595, 77.0266),
  ('New Delhi', 28.6139, 77.2090),
  ('Bengaluru', 12.9716, 77.5946),
  ('Hyderabad', 17.3850, 78.4867),
  ('Pune',      18.5204, 73.8567),
  ('Mumbai',    19.0760, 72.8777),
  ('Kolkata',   22.5726, 88.3639),
  ('Chennai',   13.0827, 80.2707)
on conflict (city) do update
  set lat = case when public.cities.lat = 0 and public.cities.lng = 0 then excluded.lat else public.cities.lat end,
      lng = case when public.cities.lat = 0 and public.cities.lng = 0 then excluded.lng else public.cities.lng end,
      deleted_at = null;

update public.cities
   set deleted_at = coalesce(deleted_at, now())
 where city not in ('Gurugram', 'New Delhi', 'Bengaluru', 'Hyderabad', 'Pune', 'Mumbai', 'Kolkata', 'Chennai');

-- ── 2. the names people type, folded onto the eight ─────────────────────────
insert into public.city_aliases (alias, city) values
  ('gurgaon', 'Gurugram'), ('gurugram', 'Gurugram'), ('gurgaon haryana', 'Gurugram'),
  ('delhi', 'New Delhi'), ('new delhi', 'New Delhi'), ('faridabad', 'New Delhi'), ('noida', 'New Delhi'),
  ('greater noida', 'New Delhi'), ('ghaziabad', 'New Delhi'), ('delhi ncr', 'New Delhi'), ('ncr', 'New Delhi'),
  ('bangalore', 'Bengaluru'), ('bengaluru urban', 'Bengaluru'), ('bangalore urban', 'Bengaluru'), ('banglore', 'Bengaluru'),
  ('hyderabad', 'Hyderabad'), ('secunderabad', 'Hyderabad'), ('ghyderabad', 'Hyderabad'),
  ('pune', 'Pune'), ('poona', 'Pune'), ('pimpri-chinchwad', 'Pune'), ('pimpri chinchwad', 'Pune'),
  ('mumbai', 'Mumbai'), ('bombay', 'Mumbai'), ('navi mumbai', 'Mumbai'), ('thane', 'Mumbai'),
  ('kolkata', 'Kolkata'), ('calcutta', 'Kolkata'), ('howrah', 'Kolkata'),
  ('chennai', 'Chennai'), ('madras', 'Chennai')
on conflict (alias) do update set city = excluded.city, deleted_at = null, updated_at = now();

update public.city_aliases
   set deleted_at = coalesce(deleted_at, now())
 where city not in ('Gurugram', 'New Delhi', 'Bengaluru', 'Hyderabad', 'Pune', 'Mumbai', 'Kolkata', 'Chennai');

-- ── 3. the one place a city name is folded: one of the eight, or nothing ────
create or replace function public.canonical_city(p_name text)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select a.city from public.city_aliases a
      where a.alias = lower(btrim(p_name)) and a.deleted_at is null
        and exists (select 1 from public.cities c where c.city = a.city and c.deleted_at is null)),
    (select c.city from public.cities c
      where lower(c.city) = lower(btrim(p_name)) and c.deleted_at is null)
  );
$$;
comment on function public.canonical_city(text) is
  'The name a city is stored under (19 Sep 2026): one of the cities DanceOS serves — an alias folded onto it, or the name itself in its own spelling — and NULL for anything else. Until today an unheard-of name was handed back as if it were fine; the list is closed now.';

-- ── 4. every row is in one of the eight ─────────────────────────────────────
create or replace function public.city_must_be_served()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_city text;
begin
  v_city := public.canonical_city(new.city);
  if v_city is null then
    raise exception 'DanceOS is in Gurugram, New Delhi, Bengaluru, Hyderabad, Pune, Mumbai, Kolkata and Chennai — pick one of those';
  end if;
  new.city := v_city;
  return new;
end;
$$;
comment on function public.city_must_be_served() is
  'A row that carries a city carries one of the eight DanceOS serves (19 Sep 2026): the name is folded on the way in and anything else is refused in words.';
revoke execute on function public.city_must_be_served() from public, anon, authenticated;

-- fold what is already there; what cannot be folded goes to New Delhi, counted
do $$
declare
  v_n integer;
  v_t text;
begin
  foreach v_t in array array['profiles', 'businesses', 'crews', 'events'] loop
    execute format('update public.%I set city = public.canonical_city(city) where city is not null and public.canonical_city(city) is not null and city <> public.canonical_city(city)', v_t);
    execute format('with moved as (update public.%I set city = ''New Delhi'' where city is null or public.canonical_city(city) is null returning 1) select count(*) from moved', v_t) into v_n;
    raise notice 'eight cities: % rows of % had no served city and were moved to New Delhi', v_n, v_t;
  end loop;
end;
$$;

drop trigger if exists profiles_city_served on public.profiles;
create trigger profiles_city_served before insert or update of city on public.profiles
  for each row execute function public.city_must_be_served();
drop trigger if exists businesses_city_served on public.businesses;
create trigger businesses_city_served before insert or update of city on public.businesses
  for each row execute function public.city_must_be_served();
drop trigger if exists crews_city_served on public.crews;
create trigger crews_city_served before insert or update of city on public.crews
  for each row execute function public.city_must_be_served();
drop trigger if exists events_city_served on public.events;
create trigger events_city_served before insert or update of city on public.events
  for each row execute function public.city_must_be_served();
