-- NEAR ME WITHOUT GEOGRAPHY (10 Oct 2026, the user: "make sure app is fast and
-- smooth on every page").
--
-- WHAT WAS MEASURED. Discover's Studios tab is its default tab, and its one
-- radius search (`nearby_businesses`) took 460 ms in the app's own request log
-- while the query itself runs in about 1 ms. The difference is PostGIS: the
-- FIRST `::geography` calculation on a database connection costs 250–350 ms
-- (proven on fresh pooled connections: a geography call 248 ms first, 33 ms
-- after; a plain RLS read on the same connection 44 ms), and the API's
-- connections are recycled when idle, so a quiet app pays it on most visits.
-- That is what made Discover the slowest page on the live site.
--
-- WHAT CHANGES. The distance is computed with the haversine formula on a sphere
-- of radius 6371.0088 km — plain arithmetic, no extension, no first-call cost.
-- ⚠ It differs from PostGIS's spheroid distance by at most ~0.5 % (≈ 125 m at
-- 25 km); every distance is printed to 0.1 km and every radius is a round
-- number, so nothing a person sees changes in practice. The dry run compares
-- both answers for several cities and asserts the same studios come back.
--
-- WHAT DOES NOT CHANGE: the signature, `language sql stable`, SECURITY INVOKER
-- (the caller's own row security still decides what is found), the ordering
-- (distance, then name), the limit/offset clamps, the `located` column, and
-- every grant (`create or replace` keeps the ACL). No table, policy or row.
-- The GiST index on businesses stays; it simply has no reader now.

create or replace function public.nearby_businesses(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 25,
  p_type text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(id uuid, type text, name text, area text, city text, distance_km double precision, located boolean)
language sql
stable
as $function$
  with d as (
    select t.id, t.type, t.name, t.area, t.city, t.location_set_at,
      6371.0088 * 2 * asin(least(1.0, sqrt(
        power(sin(radians(t.lat - p_lat) / 2), 2)
        + cos(radians(p_lat)) * cos(radians(t.lat)) * power(sin(radians(t.lng - p_lng) / 2), 2)
      ))) as km
    from public.businesses t
    where t.deleted_at is null
      and t.lat is not null and t.lng is not null
      and (p_type is null or t.type = p_type)
      -- a latitude band first: one degree of latitude is ~111 km anywhere
      and t.lat between p_lat - (p_radius_km / 111.0) - 0.01 and p_lat + (p_radius_km / 111.0) + 0.01
  )
  select d.id, d.type, d.name, d.area, d.city,
    round(d.km::numeric, 1)::double precision as distance_km,
    d.location_set_at is not null as located
  from d
  where d.km <= p_radius_km
  order by distance_km, d.name
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
$function$;

comment on function public.nearby_businesses(double precision, double precision, double precision, text, integer, integer) is
  'Businesses within p_radius_km of a point, nearest first. Haversine on a sphere since 10 Oct 2026 (was PostGIS geography, whose first call per connection cost ~300 ms). SECURITY INVOKER: the caller''s RLS decides what is found.';
