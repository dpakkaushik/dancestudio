-- Step 5 (Discovery): PostGIS + city centroids + radius search.
-- Studios get lat/lng from their city's centroid until precise address entry
-- (Google Maps autocomplete) arrives; the search respects tenant visibility by
-- running under the caller's RLS (anon sees listed tenants only).

create extension if not exists postgis with schema extensions;

-- reference coordinates for the closed DOS_CITIES list (prototype line 157)
create table public.city_centroids (
  id uuid primary key default gen_random_uuid(),
  city text not null unique check (char_length(city) <= 120),
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'),
  updated_by uuid not null default coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'),
  deleted_at timestamptz
);

alter table public.city_centroids enable row level security;

create policy "anyone reads city centroids"
  on public.city_centroids for select
  to anon, authenticated
  using (deleted_at is null);

insert into public.city_centroids (city, lat, lng) values
  ('New Delhi', 28.6139, 77.2090),
  ('Gurgaon', 28.4595, 77.0266),
  ('Noida', 28.5355, 77.3910),
  ('Mumbai', 19.0760, 72.8777),
  ('Pune', 18.5204, 73.8567),
  ('Bengaluru', 12.9716, 77.5946),
  ('Hyderabad', 17.3850, 78.4867),
  ('Chennai', 13.0827, 80.2707),
  ('Jaipur', 26.9124, 75.7873),
  ('Chandigarh', 30.7333, 76.7794),
  ('Kolkata', 22.5726, 88.3639),
  ('Ahmedabad', 23.0225, 72.5714);

-- existing tenants: fill coordinates from their city. The set_updated_at trigger
-- stamps auth.uid(), which is null inside a migration — pause it for the backfill.
alter table public.tenants disable trigger tenants_set_updated_at;
update public.tenants t
set lat = c.lat, lng = c.lng
from public.city_centroids c
where t.lat is null and t.lng is null and t.city = c.city;
alter table public.tenants enable trigger tenants_set_updated_at;

-- spatial index for the radius search
create index tenants_geog_idx on public.tenants
  using gist ((extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography))
  where deleted_at is null and lat is not null and lng is not null;

-- new tenants pick up their city's centroid at creation (same signature, so the
-- app's repository call is unchanged; never edits the applied Step 2 migration)
create or replace function public.create_tenant_with_owner(
  p_name text,
  p_type text,
  p_area text default null,
  p_city text default null
) returns public.tenants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_tenant public.tenants;
  v_lat double precision;
  v_lng double precision;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_type not in ('studio', 'trainer_business') then
    raise exception 'invalid tenant type';
  end if;
  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'name is required';
  end if;

  select c.lat, c.lng into v_lat, v_lng
  from public.city_centroids c
  where c.city = nullif(trim(p_city), '') and c.deleted_at is null;

  insert into public.tenants (type, name, area, city, lat, lng, created_by, updated_by)
  values (p_type, trim(p_name), nullif(trim(p_area), ''), nullif(trim(p_city), ''), v_lat, v_lng, v_user, v_user)
  returning * into v_tenant;

  insert into public.tenant_members (tenant_id, user_id, member_role, created_by, updated_by)
  values (v_tenant.id, v_user, 'owner', v_user, v_user);

  return v_tenant;
end;
$$;

-- "Near me": tenants within a radius, nearest first. SECURITY INVOKER on purpose —
-- the caller's own RLS decides what is visible (anon: listed tenants only), so an
-- unlisted studio can never leak through discovery.
create or replace function public.nearby_tenants(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 25,
  p_type text default null
) returns table (
  id uuid,
  type text,
  name text,
  area text,
  city text,
  distance_km double precision
)
language sql
stable
as $$
  select t.id, t.type, t.name, t.area, t.city,
    round((extensions.st_distance(
      extensions.st_setsrid(extensions.st_makepoint(t.lng, t.lat), 4326)::extensions.geography,
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
    ) / 1000.0)::numeric, 1)::double precision as distance_km
  from public.tenants t
  where t.deleted_at is null
    and t.lat is not null and t.lng is not null
    and (p_type is null or t.type = p_type)
    and extensions.st_dwithin(
      extensions.st_setsrid(extensions.st_makepoint(t.lng, t.lat), 4326)::extensions.geography,
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
      p_radius_km * 1000.0
    )
  order by distance_km
  limit 50;
$$;

grant execute on function public.nearby_tenants(double precision, double precision, double precision, text) to anon, authenticated;
