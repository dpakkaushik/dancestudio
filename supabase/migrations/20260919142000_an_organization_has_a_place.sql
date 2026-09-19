-- ============================================================================
-- 19 Sep 2026 — AN ORGANIZATION HAS A PLACE ON THE MAP.
--
-- The user: "locations should be the google map link for the particular
-- organization and studio." A studio has had a pin since 11 Sep 2026
-- (`set_business_location`, `location_set_at`) and its Location button opens
-- it since 19 Sep. An organization had only a city. It gets a pin of its own:
-- `lat` / `lng` / `location_set_at` on its profile row, set by the organization
-- alone through `set_my_place` (the same India check the studio's door makes;
-- a city is untouched — the organization's city is its own to type), and read
-- by a stranger through `public_organization`, which gains the two columns
-- (RETURNS TABLE → dropped and re-created, ACL restated). The page's Location
-- button opens the pin's Maps link when there is one, and Maps by name and city
-- when there is not.
--
-- ⚠ Rule 9: what widens is a public organization's own pin — a place it chose
-- to put on its page.
-- ============================================================================

alter table public.profiles
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists location_set_at timestamptz;
comment on column public.profiles.location_set_at is
  'When an ORGANIZATION placed itself on the map (19 Sep 2026) — the Location button opens the pin once this is set. A person''s row never carries one.';

create or replace function public.set_my_place(p_lat double precision, p_lng double precision)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_user and p.role = 'org' and p.deleted_at is null and p.suspended_at is null
  ) then
    raise exception 'only an organization has a place of its own here — a studio''s pin is set on the studio';
  end if;
  -- both empty clears the pin
  if p_lat is null and p_lng is null then
    update public.profiles set lat = null, lng = null, location_set_at = null, updated_by = v_user
     where id = v_user;
    return;
  end if;
  -- the numbers came from a browser (the studio door's rule): a point outside India is a bug or a joke
  if p_lat is null or p_lng is null
     or p_lat < 6 or p_lat > 37.5 or p_lng < 68 or p_lng > 97.5 then
    raise exception 'that point is not in India';
  end if;
  update public.profiles
     set lat = p_lat, lng = p_lng, location_set_at = now(), updated_by = v_user
   where id = v_user;
end;
$$;
revoke execute on function public.set_my_place(double precision, double precision) from public, anon;
grant execute on function public.set_my_place(double precision, double precision) to authenticated, service_role;
comment on function public.set_my_place(double precision, double precision) is
  'An organization puts itself on the map (19 Sep 2026): its own pin, checked to be in India; both null clears it. A person is refused.';

drop function public.public_organization(uuid);
create function public.public_organization(p_org_id uuid)
returns table(id uuid, name text, city text, photo_path text, about text, socials jsonb, verified boolean, since timestamptz, host_business_id uuid, phone text, contact_email text, lat double precision, lng double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.city, p.profile_photo_path, p.about, p.socials,
         (p.gstin_verified_at is not null or p.verified_at is not null) as verified,
         p.created_at,
         (select t.id from public.businesses t
            join public.business_members m on m.business_id = t.id
           where m.user_id = p.id and m.member_role = 'owner' and m.deleted_at is null
             and t.type = 'org' and t.deleted_at is null
           limit 1) as host_business_id,
         p.phone,
         p.contact_email,
         case when p.location_set_at is not null then p.lat end as lat,
         case when p.location_set_at is not null then p.lng end as lng
  from public.profiles p
  where p.id = p_org_id and public.org_is_public(p_org_id);
$$;
revoke execute on function public.public_organization(uuid) from public;
grant execute on function public.public_organization(uuid) to anon, authenticated, service_role;
comment on function public.public_organization(uuid) is
  'An organization''s public page (18 Sep 2026, amending R9): name, city, logo, About, links, verified, since, its hosting row, the phone (Call) and contact email (Mail) it published, and since 19 Sep 2026 its PIN — for a public organization only; empty otherwise.';
