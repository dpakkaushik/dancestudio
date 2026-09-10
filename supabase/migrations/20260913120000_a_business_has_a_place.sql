-- ─────────────────────────────────────────────────────────────────────────────
-- A BUSINESS HAS A PLACE, NOT A CITY (11 Sep 2026)
--
-- `tenants` has carried `lat` and `lng` since Step 5, and nothing has ever
-- written a real one. `create_tenant_with_owner` copies the CITY CENTROID:
--
--     select c.lat, c.lng into v_lat, v_lng
--       from public.city_centroids c
--      where c.city = nullif(trim(p_city), '');
--
-- Step 5's own comment said "until precise address entry", and precise address
-- entry never arrived. So every studio in Pune sits on exactly the same point,
-- and the consequence is not cosmetic: `nearby_tenants` measures from the
-- picked city's centroid to the studio's centroid, which is the SAME NUMBER for
-- every studio in that city. Discover's "Studios near you", its distance chips
-- and its "nearest first" ordering have all been decorative. A 25 km radius
-- either returns the whole city or none of it.
--
-- This is the door that lets an owner say where they actually are. The picker
-- is `features/geo/components/LocationPicker.tsx`; the geocoding is
-- OpenStreetMap's, through the app's own server.
--
-- `location_set_at` is the part worth keeping: it is how anything downstream
-- can tell a point somebody CHOSE from a centroid we defaulted to. Without it
-- the two are indistinguishable — both are just numbers — and no screen could
-- ever ask the studios that have not done it yet.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tenants
  add column if not exists location_set_at timestamptz;

comment on column public.tenants.location_set_at is
  'When an owner placed this business on the map (11 Sep 2026). NULL means lat/lng are still the city centroid create_tenant_with_owner defaulted to — a guess, not an address.';

-- studios that have said where they are, for the radius search and for asking
-- the ones that have not
create index if not exists tenants_located_idx
  on public.tenants (city) where deleted_at is null and location_set_at is not null;

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

  -- CITY IS A CLOSED LIST and stays one. A city we do not list is not written,
  -- and the business keeps the city it had — being quietly moved to a city the
  -- app cannot show is worse than not being updated.
  v_city := null;
  if p_city is not null and btrim(p_city) <> '' then
    select c.city into v_city
      from public.city_centroids c
     where lower(c.city) = lower(btrim(p_city)) and c.deleted_at is null;
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
  'An owner places their business on the map (11 Sep 2026). Checks ownership, refuses a point outside India, and will only ever write a city that is on the closed list — anything else leaves the city alone. Stamps location_set_at, which is what separates a chosen point from the city centroid it started as.';
revoke execute on function public.set_tenant_location(uuid, double precision, double precision, text, text) from public, anon;
grant execute on function public.set_tenant_location(uuid, double precision, double precision, text, text) to authenticated;

-- ── the radius search can say whether a distance is real ─────────────────────
-- Same name, same arguments, same grants — one more column, so no caller
-- breaks. `located` lets a card draw "2.4 km" as a fact when the studio placed
-- itself and stay quiet when the number is only the city talking to itself.
drop function if exists public.nearby_tenants(double precision, double precision, double precision, text);
create or replace function public.nearby_tenants(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 25,
  p_type text default null,
  p_limit integer default 50
) returns table (
  id uuid,
  type text,
  name text,
  area text,
  city text,
  distance_km double precision,
  located boolean
)
language sql
stable
as $$
  select t.id, t.type, t.name, t.area, t.city,
    round((extensions.st_distance(
      extensions.st_setsrid(extensions.st_makepoint(t.lng, t.lat), 4326)::extensions.geography,
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
    ) / 1000.0)::numeric, 1)::double precision as distance_km,
    t.location_set_at is not null as located
  from public.tenants t
  where t.deleted_at is null
    and t.lat is not null and t.lng is not null
    and (p_type is null or t.type = p_type)
    and extensions.st_dwithin(
      extensions.st_setsrid(extensions.st_makepoint(t.lng, t.lat), 4326)::extensions.geography,
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
      p_radius_km * 1000.0
    )
  order by distance_km, t.name
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;
comment on function public.nearby_tenants(double precision, double precision, double precision, text, integer) is
  'Tenants within a radius, nearest first — SECURITY INVOKER, so the caller''s own RLS decides what is visible. `located` says whether the distance is measured to a point the business CHOSE or to its city''s centroid (11 Sep 2026); the 50-row cap is now a parameter, because a city has more than fifty studios in it eventually.';
grant execute on function public.nearby_tenants(double precision, double precision, double precision, text, integer) to anon, authenticated;
