-- 18 Sep 2026: AN ORGANIZATION HAS A PUBLIC PAGE, AND AN EVENT CARD SHOWS WHO
-- IS HOSTING IT, WITH THEIR PICTURE. ⚠ RLS: this widens what a stranger reads.
--
-- The user, on 18 Sep 2026: "[the eye] should show organization profile page,
-- and the same should reflect inside the event cards with photo." That amends
-- R9 (8 Sep 2026: "an organization is never a public entity") — by the user's
-- own decision, and only this far: an organization gets ONE public page, named
-- and pictured, listing the studios it runs and the events it hosts; and an
-- event card names its host with the host's picture. It is still not a person
-- (R11), still not in search's People, still neither follows nor is followed.
--
-- WHAT A STRANGER CAN NOW READ, exactly: for an organization that is PUBLIC —
-- one whose events may be public (a GST number or the legacy tick, not
-- suspended) OR that runs a LISTED studio — its name, city, logo, About, links,
-- whether it is verified, when it joined, and its hosting row's id (so its
-- published events can be read under the policy they already have). Nothing
-- else on the profiles row leaves: not the GST number, not the age or phone an
-- organization does not have anyway. The `profiles` policy is NOT changed; the
-- read goes through three SECURITY DEFINER functions that hand back exactly the
-- columns named here and refuse everything else with an empty set.

-- ── who counts as public ─────────────────────────────────────────────────────
create or replace function public.org_is_public(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_org_id and p.role = 'org' and p.deleted_at is null and p.suspended_at is null
      and (
        p.gstin_verified_at is not null or p.verified_at is not null
        or exists (
          select 1 from public.business_members m
          join public.businesses t on t.id = m.business_id
          where m.user_id = p.id and m.member_role = 'owner' and m.deleted_at is null
            and t.type = 'studio' and t.visibility = 'listed' and t.deleted_at is null
        )
      )
  );
$$;
revoke execute on function public.org_is_public(uuid) from public;
grant execute on function public.org_is_public(uuid) to anon, authenticated, service_role;

-- ── the page ─────────────────────────────────────────────────────────────────
create or replace function public.public_organization(p_org_id uuid)
returns table(id uuid, name text, city text, photo_path text, about text, socials jsonb, verified boolean, since timestamptz, host_business_id uuid)
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
           limit 1) as host_business_id
  from public.profiles p
  where p.id = p_org_id and public.org_is_public(p_org_id);
$$;
revoke execute on function public.public_organization(uuid) from public;
grant execute on function public.public_organization(uuid) to anon, authenticated, service_role;

-- the studios it runs, the ones that are on Discover
create or replace function public.public_organization_studios(p_org_id uuid)
returns table(id uuid, name text, area text, city text, photo_path text, verified_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.name, t.area, t.city, t.profile_photo_path, t.verified_at
  from public.businesses t
  join public.business_members m on m.business_id = t.id
  where m.user_id = p_org_id and m.member_role = 'owner' and m.deleted_at is null
    and t.type = 'studio' and t.visibility = 'listed' and t.deleted_at is null
    and public.org_is_public(p_org_id)
  order by t.name;
$$;
revoke execute on function public.public_organization_studios(uuid) from public;
grant execute on function public.public_organization_studios(uuid) to anon, authenticated, service_role;

-- ── the host on an event card ────────────────────────────────────────────────
-- For a list of hosting rows: who is hosting, in a name and a picture, and — for
-- an organization — the id of its page. Answers only for PUBLIC hosts, the same
-- test the events policy applies, so an unlisted studio's name cannot be fished
-- out through it (the 10 Sep `event_host_name` rule, kept).
create or replace function public.event_host_cards(p_business_ids uuid[])
returns table(business_id uuid, org_id uuid, name text, photo_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id,
         case when t.type = 'org' then p.id end as org_id,
         case when t.type = 'org' then p.full_name else t.name end as name,
         case when t.type = 'org' then p.profile_photo_path else t.profile_photo_path end as photo_path
  from public.businesses t
  left join lateral (
    select pr.id, pr.full_name, pr.profile_photo_path
    from public.business_members m
    join public.profiles pr on pr.id = m.user_id
    where m.business_id = t.id and m.member_role = 'owner' and m.deleted_at is null
    limit 1
  ) p on t.type = 'org'
  where t.id = any (p_business_ids) and t.deleted_at is null
    and public.event_host_is_public(t.id);
$$;
revoke execute on function public.event_host_cards(uuid[]) from public;
grant execute on function public.event_host_cards(uuid[]) to anon, authenticated, service_role;

comment on function public.public_organization(uuid) is
  'An organization''s public page (18 Sep 2026, amending R9): name, city, logo, About, links, verified, since, and its hosting row — for a public organization only; empty otherwise.';
comment on function public.event_host_cards(uuid[]) is
  'Who hosts each event, as a name and a picture (an organization''s own), for public hosts only — what an event card prints (18 Sep 2026).';
