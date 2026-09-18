-- 18 Sep 2026: AN ORGANIZATION RUNS AT MOST FIFTEEN STUDIOS, AND DISCOVER HAS A
-- SECOND PAGE.
--
-- Two caps the user set on the same day. (1) "make 15 studios with one owner":
-- an organization may open at most FIFTEEN studios. The rule lives where every
-- studio is born — `why_no_studio()` is the ONE sentence the hub prints under a
-- disabled control AND the one `create_business_with_owner` raises, so the
-- screen cannot drift from the database (the 9 Sep pattern). Live data: the
-- most any owner holds today is 3. (2) "should give option for second page
-- after that": `nearby_businesses` answered the nearest 50 and stopped, with no
-- way to ask for the next 50 — a city past the cap simply ended there. It takes
-- an OFFSET now, so Discover can turn the page. Dropped and re-created because
-- a parameter is added (`create or replace` may not change a signature); no
-- policy or trigger depends on it. SECURITY INVOKER as before — the caller's
-- own RLS still decides which businesses are found.

-- ── 1. fifteen studios ───────────────────────────────────────────────────────
create or replace function public.why_no_studio()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_studios integer;
begin
  if v_user is null then return 'Sign in first.'; end if;
  select p.role into v_role from public.profiles p where p.id = v_user and p.deleted_at is null;
  if not found then return 'Finish onboarding first.'; end if;
  if v_role <> 'org' then return 'Only an organization can set up a studio.'; end if;
  -- the cap (18 Sep 2026): the live studios this organization owns
  select count(*) into v_studios
    from public.businesses t
    join public.business_members m on m.business_id = t.id
   where m.user_id = v_user and m.member_role = 'owner' and m.deleted_at is null
     and t.type = 'studio' and t.deleted_at is null;
  if v_studios >= 15 then
    return 'An organization runs at most 15 studios on DanceOS — this one already has ' || v_studios || '.';
  end if;
  return null;
end;
$$;

comment on function public.why_no_studio() is
  'Why the signed-in account may not open a studio right now — null when it may. Only an organization; at most 15 studios (18 Sep 2026). Printed by the hub and raised by create_business_with_owner.';

-- ── 2. a second page ─────────────────────────────────────────────────────────
drop function public.nearby_businesses(double precision, double precision, double precision, text, integer);

create function public.nearby_businesses(
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
as $$
  select t.id, t.type, t.name, t.area, t.city,
    round((extensions.st_distance(
      extensions.st_setsrid(extensions.st_makepoint(t.lng, t.lat), 4326)::extensions.geography,
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
    ) / 1000.0)::numeric, 1)::double precision as distance_km,
    t.location_set_at is not null as located
  from public.businesses t
  where t.deleted_at is null
    and t.lat is not null and t.lng is not null
    and (p_type is null or t.type = p_type)
    and extensions.st_dwithin(
      extensions.st_setsrid(extensions.st_makepoint(t.lng, t.lat), 4326)::extensions.geography,
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
      p_radius_km * 1000.0
    )
  order by distance_km, t.name
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- exactly the ACL it had: public, anon, authenticated, service_role (an INVOKER
-- function that reads only what the caller's RLS allows)
grant execute on function public.nearby_businesses(double precision, double precision, double precision, text, integer, integer) to public, anon, authenticated, service_role;

comment on function public.nearby_businesses(double precision, double precision, double precision, text, integer, integer) is
  'Businesses within p_radius_km of a point, nearest first, under the caller''s own RLS. p_limit (max 200) and p_offset (18 Sep 2026) page the shelf.';
