-- 26 Sep 2026: AN ORGANIZATION IS A BUSINESS A PERSON OPENS — THE SEPARATE
-- LOGIN GOES AWAY.
--
-- The user, in three messages: "make organization a tab on home for artist and
-- users and mechanism to create and open an organization similar to studios and
-- managing subscription also the same way for organization. organization should
-- not be able to create studios and all associated ones should be deleted.
-- separate login for organization also goes away as it now gets created like
-- studios. verification process remains same for organization." Then:
-- "organization can also be added in the profile switcher." Then, on the three
-- questions put to them: "delete all studios linked to organizations owned
-- studios. delete all existing organizations just give one verified one to
-- artist deepak kaushik. organization subscription price rs.5000".
--
-- WHAT AN ORGANIZATION IS FROM HERE: a `businesses` row of type `org`, opened by
-- a USER or an ARTIST from Home's Organizations tile, owned through the same
-- owner seat a studio is, run from the profile switcher, with its own home, its
-- own Settings, its events, its team (`organization_members`), a GST number OF
-- ITS OWN, and a ₹5,000-a-month mandate exactly as a studio has its ₹1,200 one.
-- ⚠ THE ROW ALREADY EXISTED: since R15 (9 Sep) every organization LOGIN carried
-- one hosting row of type `org` for its events. What changes is who owns it — a
-- person, through a seat — and what hangs off it: the GST number, the team, the
-- public page, the follows and the subscription, all of which were keyed on the
-- organization's PROFILE and are keyed on the business now.
--
-- WHAT IS PUBLIC. An organization is public — its page readable, its events
-- bookable, its team printed, followable — when its GST number is verified AND
-- its own subscription is live (`org_is_public`), which is the studio's rule
-- (badge, then mandate) said for an organization (GST, then mandate). The GST
-- check itself is unchanged: the placeholder shape `verify_gstin` has kept since
-- 11 Sep, now on the business row (`verify_business_gstin`).
--
-- WHAT IT IS NOT. An organization runs NO STUDIOS — a studio is a person's since
-- `20260926090000` — so `public_organization_studios` is dropped and the
-- `studio_owner` label is refused. The `profiles.role = 'org'` LOGIN is retired:
-- onboarding no longer offers it, the trigger that gave one a hosting row is
-- dropped, and every existing organization login is soft-deleted by
-- `scripts/retire-organization-logins.js` (its list in front of the user first),
-- which also opens the one verified organization for Deepak Kaushik. The CHECK
-- on `profiles.role` keeps the word so the soft-deleted rows stay valid history.
--
-- RLS impact (Rule 9): two policies re-created on `organization_members` (the
-- organization's own read is by owner seat now); two SELECT policies on
-- `studio_photos` and one on `storage.objects` widened to a PUBLIC
-- organization's pictures; one FK re-pointed. No table grant changes. Functions:
-- seven DROPPED (their signature or their subject changed) and re-created with
-- their ACLs restated, the rest edited in place. The dry run asserts anon's
-- executable set and the ACL multiset of every kept function.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. THE PRICE, AND A THIRD KIND OF SUBSCRIPTION
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.plans drop constraint plans_kind_check;
alter table public.plans add constraint plans_kind_check check (kind in ('artist', 'studio', 'org'));
alter table public.subscriptions drop constraint subscriptions_kind_check;
alter table public.subscriptions add constraint subscriptions_kind_check check (kind in ('artist', 'studio', 'org'));
alter table public.subscriptions drop constraint subscriptions_subject_check;
alter table public.subscriptions add constraint subscriptions_subject_check
  check ((kind = 'artist' and business_id is null) or (kind in ('studio', 'org') and business_id is not null));
create unique index if not exists subscriptions_one_live_org
  on public.subscriptions (business_id) where kind = 'org' and status <> 'expired' and deleted_at is null;

insert into public.plans (key, kind, period, label, price_inr, active, sort)
values ('org_monthly', 'org', 'monthly', 'DanceOS Pro · Organization', 5000, true, 3)
on conflict (key) do update set kind = 'org', period = 'monthly', label = excluded.label, price_inr = 5000, active = true, deleted_at = null;

create or replace function public.org_plan_active(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.subscriptions s
                  where s.kind = 'org' and s.business_id = p_business_id and public.subscription_has_access(s));
$$;
revoke execute on function public.org_plan_active(uuid) from public;
grant execute on function public.org_plan_active(uuid) to anon, authenticated, service_role;
comment on function public.org_plan_active(uuid) is
  'Whether an organization''s own ₹5,000 mandate is live (26 Sep 2026) — the studio_plan_active pattern for the third kind.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. THE GST NUMBER IS THE BUSINESS'S
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.businesses add column if not exists gstin text;
alter table public.businesses add column if not exists gstin_verified_at timestamptz;
alter table public.businesses add constraint businesses_gstin_shape check (gstin is null or public.gstin_shape(gstin));
alter table public.businesses add constraint businesses_gstin_verified_needs_number check (gstin_verified_at is null or gstin is not null);
create unique index if not exists businesses_gstin_idx on public.businesses (gstin) where gstin is not null and deleted_at is null;
comment on column public.businesses.gstin is 'An ORGANIZATION''s GST number (26 Sep 2026) — moved off the retired organization login. Set through verify_business_gstin only.';

drop function if exists public.verify_gstin(text);
drop function if exists public.clear_gstin();

create function public.verify_business_gstin(p_business_id uuid, p_gstin text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_clean text;
  v_when timestamptz := now();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.type = 'org' and b.deleted_at is null) then
    raise exception 'a GST number belongs to an organization';
  end if;
  if not public.is_business_owner(p_business_id) then
    raise exception 'only the owner enters an organization''s GST number';
  end if;
  v_clean := upper(regexp_replace(coalesce(p_gstin, ''), '[^0-9A-Za-z]', '', 'g'));
  if v_clean = '' then
    raise exception 'Enter the GST number.';
  end if;
  if v_clean !~ '^[A-Z]{3}[0-9]{5}$' then
    raise exception 'That is not a GST number — it is three letters then five digits, like ABC12345.';
  end if;
  if exists (select 1 from public.businesses b where b.gstin = v_clean and b.id <> p_business_id and b.deleted_at is null) then
    raise exception 'That GST number is already on another organization.';
  end if;
  update public.businesses set gstin = v_clean, gstin_verified_at = v_when, updated_by = v_user where id = p_business_id;
  return v_when;
end;
$$;
revoke execute on function public.verify_business_gstin(uuid, text) from public, anon;
grant execute on function public.verify_business_gstin(uuid, text) to authenticated, service_role;
comment on function public.verify_business_gstin(uuid, text) is
  'The owner verifies an organization''s GST number (26 Sep 2026) — the same placeholder check verify_gstin kept since 11 Sep, on the business row. The government API lands inside this function later.';

create function public.clear_business_gstin(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not public.is_business_owner(p_business_id) then
    raise exception 'only the owner removes an organization''s GST number';
  end if;
  update public.businesses set gstin = null, gstin_verified_at = null, updated_by = v_user
   where id = p_business_id and deleted_at is null;
end;
$$;
revoke execute on function public.clear_business_gstin(uuid) from public, anon;
grant execute on function public.clear_business_gstin(uuid) to authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. WHAT IS PUBLIC, KEYED ON THE BUSINESS
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.org_is_public(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = p_org_id and b.type = 'org' and b.deleted_at is null
      and b.gstin_verified_at is not null
      and public.org_plan_active(b.id)
      and exists (
        select 1 from public.business_members m
        join public.profiles p on p.id = m.user_id
        where m.business_id = b.id and m.member_role = 'owner' and m.deleted_at is null
          and p.deleted_at is null and p.suspended_at is null
      )
  );
$$;
comment on function public.org_is_public(uuid) is
  'Whether an ORGANIZATION BUSINESS is open to the public (26 Sep 2026): its GST number verified AND its own subscription live, with a live owner — the studio''s badge-then-mandate rule for the third kind. Takes a business id since the organization login was retired.';

create or replace function public.event_host_is_public(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when t.type = 'org' then public.org_is_public(t.id)
    else t.visibility = 'listed'
  end
  from public.businesses t
  where t.id = p_tenant_id and t.deleted_at is null;
$$;

create or replace function public.event_host_cards(p_business_ids uuid[])
returns table (business_id uuid, org_id uuid, name text, photo_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id,
         case when t.type = 'org' then t.id end as org_id,
         t.name,
         t.profile_photo_path
  from public.businesses t
  where t.id = any (p_business_ids) and t.deleted_at is null
    and public.event_host_is_public(t.id);
$$;

create or replace function public.public_organization(p_org_id uuid)
returns table (id uuid, name text, city text, photo_path text, socials jsonb, verified boolean, since timestamptz,
               host_business_id uuid, phone text, contact_email text, lat double precision, lng double precision, member_no bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.name, b.city, b.profile_photo_path, b.socials,
         (b.gstin_verified_at is not null) as verified,
         b.created_at,
         b.id as host_business_id,
         b.phone,
         b.contact_email,
         case when b.location_set_at is not null then b.lat end as lat,
         case when b.location_set_at is not null then b.lng end as lng,
         b.member_no
  from public.businesses b
  where b.id = p_org_id and public.org_is_public(p_org_id);
$$;

drop function if exists public.public_organization_studios(uuid);

-- the pictures of a PUBLIC organization read like a listed studio's.
-- ⚠ THROUGH A DEFINER HELPER, NOT A SUBQUERY IN THE POLICY — found by the dry
-- run: a policy's own `exists (select … from businesses)` runs under the
-- CALLER's RLS on `businesses`, and anon reads listed rows only, so an
-- organization's row (never listed) vanished inside the policy and its pictures
-- read as none. A definer function sees the row and answers the question.
create or replace function public.business_pictures_are_public(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.businesses t
     where t.id = p_business_id and t.deleted_at is null
       and (t.visibility = 'listed' or public.is_business_member(t.id) or (t.type = 'org' and public.org_is_public(t.id)))
  );
$$;
revoke execute on function public.business_pictures_are_public(uuid) from public;
grant execute on function public.business_pictures_are_public(uuid) to anon, authenticated, service_role;
comment on function public.business_pictures_are_public(uuid) is
  'Whether a business''s header pictures are readable by the caller (26 Sep 2026): a listed studio''s by anyone, a member''s own, a PUBLIC organization''s by anyone. Definer, because a policy subquery on businesses runs under the caller''s RLS.';

drop policy if exists "a listed studio's pictures are public to read" on public.studio_photos;
create policy "a listed studio's pictures are public to read"
  on public.studio_photos for select
  to anon, authenticated
  using (deleted_at is null and business_id is not null and public.business_pictures_are_public(business_id));
drop policy if exists "a listed studio's pictures are signed for anyone" on storage.objects;
create policy "a listed studio's pictures are signed for anyone"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'org-proof'
    and exists (
      select 1 from public.studio_photos p
       where p.path = storage.objects.name
         and p.deleted_at is null
         and public.business_pictures_are_public(p.business_id)
    )
  );

create or replace function public.business_header_photos(p_business_id uuid)
returns table (id uuid, path text, bucket text)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_business public.businesses;
  v_owner uuid;
begin
  select * into v_business from public.businesses t where t.id = p_business_id and t.deleted_at is null;
  if not found then return; end if;
  if v_business.visibility <> 'listed'
     and not public.is_business_member(p_business_id)
     and not (v_business.type = 'org' and public.org_is_public(p_business_id)) then
    return;
  end if;

  if v_business.type in ('studio', 'org') then
    return query
      select p.id, p.path, 'org-proof'::text
        from public.studio_photos p
       where p.business_id = p_business_id and p.deleted_at is null
       order by p.sort, p.created_at
       limit 10;
  elsif v_business.type = 'artist_page' then
    v_owner := public.business_owner(p_business_id);
    if v_owner is null then return; end if;
    return query
      select g.id, g.path, 'media'::text
        from public.profile_header_photos g
       where g.user_id = v_owner and g.deleted_at is null
       order by g.sort, g.created_at
       limit 10;
  end if;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. THE DOOR: a person opens an organization
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.why_no_organization()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_n integer;
begin
  if v_user is null then return 'Sign in first.'; end if;
  select p.role into v_role from public.profiles p where p.id = v_user and p.deleted_at is null;
  if not found then return 'Finish onboarding first.'; end if;
  if v_role <> 'user' then return 'An organization is opened by a person.'; end if;
  select count(*) into v_n
    from public.businesses t
    join public.business_members m on m.business_id = t.id
   where m.user_id = v_user and m.member_role = 'owner' and m.deleted_at is null
     and t.type = 'org' and t.deleted_at is null;
  if v_n >= 15 then
    return 'One account runs at most 15 organizations on DanceOS — this one already has ' || v_n || '.';
  end if;
  return null;
end;
$$;
revoke execute on function public.why_no_organization() from public, anon;
grant execute on function public.why_no_organization() to authenticated, service_role;
comment on function public.why_no_organization() is
  'Why the signed-in person may not open an organization right now — null when they may (26 Sep 2026). The hub prints it and create_business_with_owner raises it.';

create or replace function public.create_business_with_owner(p_name text, p_type text, p_area text default null, p_city text default null, p_styles text[] default null)
returns public.businesses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_business public.businesses;
  v_lat double precision;
  v_lng double precision;
  v_role text;
  v_why text;
  v_visibility text;
  v_styles text[];
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_type not in ('studio', 'artist_page', 'org') then raise exception 'invalid business type'; end if;
  if p_name is null or char_length(trim(p_name)) = 0 then raise exception 'name is required'; end if;
  select p.role into v_role from public.profiles p where p.id = v_user and p.deleted_at is null;
  if not found then raise exception 'finish onboarding first'; end if;

  select array_agg(s order by n) into v_styles
    from (select distinct on (btrim(x)) btrim(x) s, min(i) n
            from unnest(coalesce(p_styles, '{}'::text[])) with ordinality as u(x, i)
           where btrim(x) <> ''
           group by btrim(x)) d;
  v_styles := coalesce(v_styles, '{}');

  if p_type = 'studio' then
    v_why := public.why_no_studio();
    if v_why is not null then raise exception '%', v_why; end if;
    -- ⚠ 19 Sep 2026: a studio says what is danced there before it exists
    if coalesce(array_length(v_styles, 1), 0) = 0 then
      raise exception 'a studio says at least one dance style';
    end if;
    v_visibility := 'unlisted';
  elsif p_type = 'org' then
    -- 26 Sep 2026: an ORGANIZATION is a business a person opens, born private;
    -- its GST number and its own mandate are what make it public (org_is_public)
    v_why := public.why_no_organization();
    if v_why is not null then raise exception '%', v_why; end if;
    if nullif(trim(coalesce(p_city, '')), '') is null then raise exception 'an organization needs a city'; end if;
    v_visibility := 'unlisted';
  else
    if v_role <> 'user' then raise exception 'an artist page belongs to a person'; end if;
    if not public.artist_plan_active(v_user) then raise exception 'the Artist plan unlocks your artist page'; end if;
    if exists (select 1 from public.businesses t join public.business_members m on m.business_id = t.id
                where m.user_id = v_user and m.member_role = 'owner' and m.deleted_at is null
                  and t.type = 'artist_page' and t.deleted_at is null) then
      raise exception 'you already have an artist page';
    end if;
    v_visibility := 'listed';
  end if;

  select c.lat, c.lng into v_lat, v_lng from public.cities c
   where c.city = nullif(trim(p_city), '') and c.deleted_at is null;

  insert into public.businesses (type, name, area, city, lat, lng, visibility, styles, created_by, updated_by)
  values (p_type, trim(p_name), nullif(trim(p_area), ''), nullif(trim(p_city), ''), v_lat, v_lng, v_visibility, v_styles, v_user, v_user)
  returning * into v_business;
  insert into public.business_members (business_id, user_id, member_role, sort, created_by, updated_by)
  values (v_business.id, v_user, 'owner', 0, v_user, v_user);
  return v_business;
end;
$$;

-- the hosting row was made for a login; there is no such login any more
drop trigger if exists profiles_make_org_business on public.profiles;
drop function if exists public.make_org_business_on_signup();
drop function if exists public.my_org_business();
drop function if exists public.ensure_org_business(uuid);
drop function if exists public.set_my_place(double precision, double precision);

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. EVENTS NEED THE ORGANIZATION'S OWN GST NUMBER
-- ═════════════════════════════════════════════════════════════════════════════
drop function if exists public.why_no_event(uuid);
create function public.why_no_event(p_business_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_business public.businesses;
begin
  if p_business_id is null then return 'Which organization is this event for?'; end if;
  select * into v_business from public.businesses b where b.id = p_business_id and b.deleted_at is null;
  if not found then return 'No such organization.'; end if;
  if v_business.type <> 'org' then return 'Only an organization puts on an event.'; end if;
  if v_business.gstin_verified_at is null then
    return case
      when v_business.gstin is null
        then 'Add the organization''s GST number to put on events — it is how DanceOS knows the business behind the ticket.'
      else 'The organization''s GST number has not been verified yet — open it and press Verify.'
    end;
  end if;
  return null;
end;
$$;
revoke execute on function public.why_no_event(uuid) from public, anon;
grant execute on function public.why_no_event(uuid) to authenticated, service_role;
comment on function public.why_no_event(uuid) is
  'The one sentence between an ORGANIZATION BUSINESS and an event, or null (26 Sep 2026): its own GST number, verified. Printed by the events desk and raised by the insert trigger.';

create or replace function public.guard_event_needs_gstin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_why text;
begin
  v_why := public.why_no_event(new.business_id);
  if v_why is not null then
    raise exception '%', v_why;
  end if;
  return new;
end;
$$;

create or replace function public.can_run_events(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id and m.user_id = auth.uid()
      and m.member_role in ('owner', 'trainer') and m.deleted_at is null
  ) or exists (
    -- THE ORGANIZATION'S EVENT TEAM (20 Sep 2026), keyed on the business since 26 Sep
    select 1
    from public.organization_members om
    where om.org_id = p_business_id
      and om.user_id = auth.uid()
      and om.role in ('owner', 'event_team')
      and om.status = 'confirmed'
      and om.deleted_at is null
  );
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. THE TEAM HANGS OFF THE BUSINESS
-- ═════════════════════════════════════════════════════════════════════════════
-- ⚠ every existing row named an organization LOGIN, and every login is being
-- retired; the rows are proof and demo leftovers (four live) and are ERASED
-- rather than soft-deleted because the foreign key underneath them changes.
delete from public.organization_members;
alter table public.organization_members drop constraint organization_members_org_id_fkey;
alter table public.organization_members
  add constraint organization_members_org_id_fkey foreign key (org_id) references public.businesses (id) on delete cascade;
comment on column public.organization_members.org_id is 'The ORGANIZATION BUSINESS (26 Sep 2026) — a businesses row of type org, not a profile.';

drop policy if exists "an organization reads its own team" on public.organization_members;
create policy "an organization's owner reads its team"
  on public.organization_members for select
  to authenticated
  using (public.is_business_owner(org_id));

drop function if exists public.assert_caller_is_organization();
create function public.assert_caller_owns_organization(p_org_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.businesses b where b.id = p_org_id and b.type = 'org' and b.deleted_at is null) then
    raise exception 'no such organization';
  end if;
  if not public.is_business_owner(p_org_id) then
    raise exception 'only the organization''s owner runs its team';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_user and p.suspended_at is not null) then
    raise exception 'this account is suspended';
  end if;
  return v_user;
end;
$$;
revoke execute on function public.assert_caller_owns_organization(uuid) from public, anon, authenticated;

drop function if exists public.ask_organization_member(uuid, text);
create function public.ask_organization_member(p_org_id uuid, p_user_id uuid, p_role text default 'member')
returns public.organization_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.assert_caller_owns_organization(p_org_id);
  v_row public.organization_members;
  v_sort integer;
begin
  if p_role not in ('owner', 'event_team', 'member') then
    raise exception 'ask somebody as an owner, event team or a member';
  end if;
  if p_user_id = v_user then
    raise exception 'you own this organization';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.role = 'user' and p.deleted_at is null and p.suspended_at is null
  ) then
    raise exception 'that person is not on DanceOS';
  end if;
  if exists (
    select 1 from public.organization_members m
    where m.org_id = p_org_id and m.user_id = p_user_id and m.deleted_at is null and m.status in ('asked', 'confirmed')
  ) then
    raise exception 'they are already on the team, or already asked';
  end if;
  update public.organization_members set deleted_at = now(), updated_by = v_user
    where org_id = p_org_id and user_id = p_user_id and deleted_at is null;
  select coalesce(max(m.sort), 0) + 1 into v_sort from public.organization_members m
    where m.org_id = p_org_id and m.deleted_at is null;
  insert into public.organization_members (org_id, user_id, role, status, sort, created_by, updated_by)
  values (p_org_id, p_user_id, p_role, 'asked', v_sort, v_user, v_user)
  returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.ask_organization_member(uuid, uuid, text) from public, anon;
grant execute on function public.ask_organization_member(uuid, uuid, text) to authenticated, service_role;

create or replace function public.withdraw_organization_ask(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.organization_members;
  v_user uuid;
begin
  select * into v_row from public.organization_members m where m.id = p_member_id and m.deleted_at is null;
  if not found then raise exception 'request not found'; end if;
  v_user := public.assert_caller_owns_organization(v_row.org_id);
  if v_row.status <> 'asked' then
    raise exception 'only an unanswered ask can be withdrawn';
  end if;
  update public.organization_members set deleted_at = now(), updated_by = v_user where id = p_member_id;
end;
$$;

create or replace function public.remove_organization_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.organization_members;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_row from public.organization_members m where m.id = p_member_id and m.deleted_at is null;
  if not found then raise exception 'member not found'; end if;
  if v_row.user_id <> v_user and not public.is_business_owner(v_row.org_id) then
    raise exception 'only the organization''s owner removes its team';
  end if;
  update public.organization_members set deleted_at = now(), updated_by = v_user where id = p_member_id;
end;
$$;

create or replace function public.set_organization_member_role(p_member_id uuid, p_role text, p_business_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.organization_members;
  v_user uuid;
begin
  if p_role not in ('owner', 'event_team', 'member') then
    -- 26 Sep 2026: an organization runs no studios, so there is no studio to own
    raise exception 'a team member is an owner, event team or a member';
  end if;
  if p_business_id is not null then
    raise exception 'only a studio owner names a studio';
  end if;
  select * into v_row from public.organization_members m where m.id = p_member_id and m.deleted_at is null;
  if not found then raise exception 'member not found'; end if;
  v_user := public.assert_caller_owns_organization(v_row.org_id);
  if v_row.status <> 'confirmed' then
    raise exception 'they have not said yes yet';
  end if;
  update public.organization_members
     set role = p_role, business_id = null, prior_member_role = null, updated_by = v_user
   where id = p_member_id;
end;
$$;

create or replace function public.notify_organization_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_name text;
  v_who text;
  v_owner uuid;
begin
  select b.name into v_org_name from public.businesses b where b.id = new.org_id;
  select p.full_name into v_who from public.profiles p where p.id = new.user_id;
  if tg_op = 'INSERT' and new.status = 'asked' then
    perform public.notify(new.user_id, 'people',
      coalesce(v_org_name, 'An organization') || ' wants you on its team as ' || new.role,
      'Its public page names you — confirm it in your Inbox.', '/inbox');
  elsif tg_op = 'UPDATE' and old.status = 'asked' and new.status in ('confirmed', 'rejected') then
    for v_owner in
      select m.user_id from public.business_members m
       where m.business_id = new.org_id and m.member_role = 'owner' and m.deleted_at is null
    loop
      perform public.notify(v_owner, 'people',
        coalesce(v_who, 'Somebody') || (case new.status when 'confirmed' then ' joined the team of ' else ' said no to the team of ' end) || coalesce(v_org_name, 'your organization'),
        null, '/business/' || new.org_id::text || '/team');
    end loop;
  end if;
  return null;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. FOLLOWING AN ORGANIZATION FOLLOWS THE BUSINESS
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.my_followed_organizations()
returns table (follow_id uuid, org_id uuid, name text, city text, photo_path text, followed_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, b.id, b.name, b.city, b.profile_photo_path, f.created_at
  from public.follows f
  join public.businesses b on b.id = f.business_id and b.type = 'org' and b.deleted_at is null
  where f.follower_id = auth.uid() and f.deleted_at is null
  order by f.created_at desc;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 8. LINE EDITS OUT OF THE CATALOG (never re-typed): subscribe, set_follow,
--    the public-blocker sentence, the applier, the clock, the admin list
-- ═════════════════════════════════════════════════════════════════════════════
create function public._dos_swap(p_def text, p_from text, p_to text, p_fn text, p_expect integer default 1) returns text
language plpgsql as $fn$
declare v_n integer;
begin
  v_n := (length(p_def) - length(replace(p_def, p_from, ''))) / length(p_from);
  if v_n <> p_expect then
    raise exception 'anchor found % times in %, expected %: %', v_n, p_fn, p_expect, left(p_from, 80);
  end if;
  return replace(p_def, p_from, p_to);
end;
$fn$;

do $migration$
declare
  v_def text;
  v_new text;
begin
  -- subscribe: a third branch, and the live-row lookup covers it
  select pg_get_functiondef('public.subscribe(text, uuid)'::regprocedure) into v_def;
  v_new := public._dos_swap(v_def,
    E'  else\n    if p_business_id is null then raise exception ''which studio is this for?''; end if;',
    E'  elsif v_plan.kind = ''org'' then\n'
    || E'    -- 26 Sep 2026: an ORGANIZATION''s own mandate — the owner, once its GST number is verified\n'
    || E'    if p_business_id is null then raise exception ''which organization is this for?''; end if;\n'
    || E'    if not exists (select 1 from public.businesses t where t.id = p_business_id and t.type = ''org'' and t.deleted_at is null) then\n'
    || E'      raise exception ''no such organization'';\n'
    || E'    end if;\n'
    || E'    if not public.is_business_owner(p_business_id) then raise exception ''that organization is not yours to subscribe''; end if;\n'
    || E'    if not exists (select 1 from public.businesses t where t.id = p_business_id and t.gstin_verified_at is not null) then\n'
    || E'      raise exception ''verify the organization''''s GST number first — then the subscription puts it in front of the public'';\n'
    || E'    end if;\n'
    || E'  else\n    if p_business_id is null then raise exception ''which studio is this for?''; end if;',
    'subscribe');
  v_new := public._dos_swap(v_new,
    '(v_plan.kind = ''studio'' and s.business_id = p_business_id)',
    '(v_plan.kind in (''studio'', ''org'') and s.business_id = p_business_id)',
    'subscribe');
  execute v_new;

  -- set_follow: a PUBLIC organization may be followed though its row is never listed
  select pg_get_functiondef('public.set_follow(uuid, boolean)'::regprocedure) into v_def;
  v_new := public._dos_swap(v_def,
    E'  if v_business.visibility <> ''listed'' then\n    raise exception ''this business is not open to the public'';',
    E'  if v_business.visibility <> ''listed''\n     and not (v_business.type = ''org'' and public.org_is_public(v_business.id)) then -- 26 Sep 2026: a public organization\n    raise exception ''this business is not open to the public'';',
    'set_follow');
  execute v_new;

  -- why_no_studio(uuid): the sentence between an ORGANIZATION and the public
  select pg_get_functiondef('public.why_no_studio(uuid)'::regprocedure) into v_def;
  v_new := public._dos_swap(v_def,
    E'  if v_business.type <> ''studio'' then return null; end if;',
    E'  if v_business.type = ''org'' then\n'
    || E'    -- 26 Sep 2026: an organization''s two steps — its GST number, then its own mandate\n'
    || E'    if v_business.gstin_verified_at is null then\n'
    || E'      return ''Verify the organization''''s GST number in its Settings — that is what DanceOS checks for an organization.'';\n'
    || E'    end if;\n'
    || E'    if not public.org_plan_active(p_business_id) then\n'
    || E'      select c.price_inr into v_price from public.plans c where c.key = ''org_monthly'' and c.active and c.deleted_at is null limit 1;\n'
    || E'      select * into s from public.subscriptions x where x.kind = ''org'' and x.business_id = p_business_id and x.deleted_at is null order by x.created_at desc limit 1;\n'
    || E'      if s.id is not null and s.status = ''pending_auth'' then\n'
    || E'        return ''The subscription was started but not authorised — finish it to put the organization in front of the public.'';\n'
    || E'      end if;\n'
    || E'      if s.id is not null and s.current_period_end is not null then\n'
    || E'        return ''Its subscription ended on '' || to_char(s.current_period_end, ''FMDD FMMonth'') || '' — subscribe again to put the organization back in front of the public.'';\n'
    || E'      end if;\n'
    || E'      return ''An organization has its own subscription'' || case when v_price is not null then '' — ₹'' || v_price || '' a month, renewing on its own'' else '''' end || ''. Subscribe to put it and its events in front of the public.'';\n'
    || E'    end if;\n'
    || E'    return null;\n'
    || E'  end if;\n'
    || E'  if v_business.type <> ''studio'' then return null; end if;',
    'why_no_studio(uuid)');
  execute v_new;

  -- the applier's failure note, and the clock, name the third kind
  -- resolved by NAME: it has one overload, and its thirteen-argument signature is
  -- not worth spelling out to get wrong
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'apply_subscription_event';
  if v_def is null then raise exception 'apply_subscription_event not found'; end if;
  v_new := public._dos_swap(v_def,
    'case when s.kind = ''studio'' then ''A studio renewal did not go through'' else',
    'case when s.kind = ''studio'' then ''A studio renewal did not go through'' when s.kind = ''org'' then ''An organization renewal did not go through'' else',
    'apply_subscription_event');
  execute v_new;

  select pg_get_functiondef('public.run_subscription_clock()'::regprocedure) into v_def;
  v_new := public._dos_swap(v_def, E'    if r.kind = ''studio'' then', E'    if r.kind in (''studio'', ''org'') then', 'run_subscription_clock', 2);
  v_new := public._dos_swap(v_new, 'coalesce(v_name, ''Your studio'') || '' is off Discover — its subscription ended''', 'coalesce(v_name, ''Your business'') || '' is no longer in front of the public — its subscription ended''', 'run_subscription_clock');
  v_new := public._dos_swap(v_new, 'coalesce(v_name, ''Your studio'') || ''''''s subscription ends in three days''', 'coalesce(v_name, ''Your business'') || ''''''s subscription ends in three days''', 'run_subscription_clock');
  execute v_new;

  -- the admin's Businesses desk lists organizations too now, with their mandate
  select pg_get_functiondef('public.admin_businesses(text, integer)'::regprocedure) into v_def;
  v_new := public._dos_swap(v_def, 'where t.deleted_at is null and t.type <> ''org'' and public.is_platform_admin()', 'where t.deleted_at is null and public.is_platform_admin()', 'admin_businesses');
  v_new := public._dos_swap(v_new, 'where x.kind = ''studio'' and x.business_id = t.id', 'where x.kind in (''studio'', ''org'') and x.business_id = t.id', 'admin_businesses');
  execute v_new;
end
$migration$;

drop function public._dos_swap(text, text, text, text, integer);

-- ═════════════════════════════════════════════════════════════════════════════
-- 9. A CREW HAS STYLES AND LINKS, LIKE EVERY OTHER PROFILE
-- ═════════════════════════════════════════════════════════════════════════════
-- The user: "all profiles should have both dance style edits and social media
-- edit options and option to add multiple." A crew carried ONE `style` and no
-- links at all — the only kind without either. `styles` is the list (the single
-- `style` stays in step as its first entry, because the crew card, the board and
-- the search print it); `socials` is the same shape as a person's and a
-- business's, under the same web-links CHECK. Two leader-only doors, because
-- `update_crew` is a seven-argument signature that would have to be dropped and
-- re-created to learn two more.
alter table public.crews add column if not exists styles text[] not null default '{}';
alter table public.crews add column if not exists socials jsonb not null default '[]'::jsonb;
alter table public.crews add constraint crews_styles_check check (cardinality(styles) <= 12);
alter table public.crews add constraint crews_socials_check check (jsonb_typeof(socials) = 'array' and jsonb_array_length(socials) <= 12);
alter table public.crews add constraint crews_socials_are_web_links check (public.socials_are_web_links(socials));
update public.crews set styles = array[style] where cardinality(styles) = 0 and style is not null and btrim(style) <> '';
-- a crew made through the seven-argument doors still names ONE style; the list follows it
create or replace function public.crews_styles_follow_style()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if cardinality(new.styles) = 0 and new.style is not null and btrim(new.style) <> '' then
    new.styles := array[new.style];
  end if;
  return new;
end;
$$;
revoke execute on function public.crews_styles_follow_style() from public, anon, authenticated;
drop trigger if exists crews_styles_follow_style on public.crews;
create trigger crews_styles_follow_style
  before insert or update of style on public.crews
  for each row execute function public.crews_styles_follow_style();
comment on column public.crews.styles is 'The styles a crew dances, in the leader''s order (26 Sep 2026); `style` is kept equal to the first for the card, the board and the search.';
comment on column public.crews.socials is 'A crew''s links, the same list a person''s and a business''s carry (26 Sep 2026).';

create function public.set_crew_styles(p_crew_id uuid, p_styles text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_styles text[];
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not public.is_crew_leader(p_crew_id) then raise exception 'only the leader changes what a crew dances'; end if;
  select array_agg(s order by n) into v_styles
    from (select distinct on (btrim(x)) btrim(x) s, min(i) n
            from unnest(coalesce(p_styles, '{}'::text[])) with ordinality as u(x, i)
           where btrim(x) <> '' group by btrim(x)) d;
  v_styles := coalesce(v_styles, '{}');
  if coalesce(array_length(v_styles, 1), 0) = 0 then raise exception 'a crew dances at least one style'; end if;
  if array_length(v_styles, 1) > 12 then raise exception 'at most twelve dance styles'; end if;
  update public.crews set styles = v_styles, style = v_styles[1], updated_by = v_user
   where id = p_crew_id and deleted_at is null;
end;
$$;
revoke execute on function public.set_crew_styles(uuid, text[]) from public, anon;
grant execute on function public.set_crew_styles(uuid, text[]) to authenticated, service_role;

create function public.set_crew_socials(p_crew_id uuid, p_socials jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_item jsonb;
  v_url text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not public.is_crew_leader(p_crew_id) then raise exception 'only the leader changes a crew''s links'; end if;
  if p_socials is null or jsonb_typeof(p_socials) <> 'array' or jsonb_array_length(p_socials) > 12 then
    raise exception 'links must be a list of at most 12';
  end if;
  for v_item in select * from jsonb_array_elements(p_socials) loop
    v_url := btrim(v_item ->> 'url');
    if coalesce(btrim(v_item ->> 'platform'), '') = '' or v_url is null or v_url !~* '^https?://[^[:space:]]+$' then
      raise exception 'a link is a platform and a web address starting with http:// or https://';
    end if;
  end loop;
  update public.crews set socials = p_socials, updated_by = v_user where id = p_crew_id and deleted_at is null;
end;
$$;
revoke execute on function public.set_crew_socials(uuid, jsonb) from public, anon;
grant execute on function public.set_crew_socials(uuid, jsonb) to authenticated, service_role;

comment on function public.subscribe(text, uuid) is
  'The OWNER subscribes a studio (₹1,200) or an organization (₹5,000, since 26 Sep 2026) once DanceOS has verified it — the badge for a studio, the GST number for an organization; the Artist plan is a person''s.';
comment on function public.why_no_studio(uuid) is
  'The one sentence between a studio (badge → subscription → listed) or an organization (GST → subscription, since 26 Sep 2026) and the public, or null.';
