-- ─────────────────────────────────────────────────────────────────────────────
-- THE DOORS THAT WERE NOT DOORS (11 Sep 2026)
-- ⚠ Rule 9: money + auth + RLS. Found by scripts/rls-proof-tenant-columns.ps1,
-- which was written to ask the question and answered it three times over.
--
-- This codebase has a rule it keeps well: a business is written through a
-- SECURITY DEFINER function, and the function validates. `update_tenant_profile`
-- caps About at 220 characters, insists a phone looks like a phone and a link
-- looks like a link, and stops at twelve links. `create_tenant_with_owner`
-- decides whether somebody may have a studio at all.
--
-- PostgREST is a door too. The policy "owners update own tenants" named no
-- columns, so an owner could PATCH `public.tenants` directly and walk past
-- every one of those checks. Three things were reachable that way, and the
-- first two are the serious ones:
--
--   1. `type`. A studio costs a verified organization AND its own ₹1,200-a-month
--      subscription. An artist page costs the ₹700 Artist plan. `type` is a
--      plain text column with a CHECK that allows both values, so PATCHing it
--      turned one into the other and bought neither — and because
--      `guard_tenant_visibility` gates only `new.type = 'studio'`, flipping a
--      studio to an artist page and THEN listing it put a business on Discover
--      for nothing at all. The two together were a complete way around the
--      subscription.
--
--   2. `socials`. The column's CHECK only asked that it be an array of at most
--      twelve; the rule that each entry is an http(s) address lived in the
--      function. A PATCH could therefore store `javascript:...` as a link — and
--      the app renders links as `href={l.url}` on the public studio page, the
--      public person page, AND the admin's verification queue. A business
--      applying to be verified could put a script URL in front of the admin
--      reviewing it. `public.profiles.socials` had the identical gap.
--
--   3. Every other validated column — About's length, the phone's shape — was
--      only ever held by a CHECK constraint that happened to exist. Where a
--      constraint existed the PATCH was refused; where the rule lived only in
--      the function it was not. That is the whole lesson: A RULE THE DATABASE
--      DOES NOT KEEP IS A RULE THAT HOLDS ONLY AT THE DOOR YOU WENT IN BY.
--
-- The fixes, in that spirit:
--   * the orphan policy goes. Nothing in this application updates `tenants`
--     through PostgREST — every write is one of create_tenant_with_owner,
--     update_tenant_profile, set_tenant_photo, admin_set_tenant_visibility,
--     and each is SECURITY DEFINER, so each keeps working. The policy existed
--     only as a way around them.
--   * `type` gets a guard trigger anyway, in the shape of `guard_profile_role`
--     — so that if a permissive policy is ever added back, the paid gate does
--     not silently reopen with it.
--   * the link rule moves INTO the column, on both tables, as the constraint it
--     should always have been — the same regex the two functions already use,
--     so nothing that was valid becomes invalid.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. the orphan policy ─────────────────────────────────────────────────────
drop policy if exists "owners update own tenants" on public.tenants;

comment on table public.tenants is
  'One business = one tenant. type: studio (one location each) | trainer_business. WRITES GO THROUGH THE DEFINER FUNCTIONS ONLY (11 Sep 2026): there is deliberately no update policy, because a column-less one let an owner PATCH past every check those functions make — the paid gate on `type` included. Add one back only with column privileges to match.';

-- ── 2. `type` is chosen when the business is created, and by a function ──────
create or replace function public.guard_tenant_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type is distinct from old.type
     and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role'
     and not public.is_platform_admin() then
    raise exception 'a studio and an artist page are bought separately — this cannot be switched';
  end if;
  return new;
end;
$$;
comment on function public.guard_tenant_type() is
  'A studio needs a verified organization and its own subscription; an artist page needs the Artist plan. Flipping `type` would buy neither, so only the service role or a platform admin may change it (11 Sep 2026).';
revoke execute on function public.guard_tenant_type() from public, anon, authenticated;

drop trigger if exists tenants_guard_type on public.tenants;
create trigger tenants_guard_type
  before update of type on public.tenants
  for each row execute function public.guard_tenant_type();

-- ── 3. a link is an http(s) address — in the column, not only in the function ─
-- A CHECK constraint may not contain a subquery, so the test is an IMMUTABLE
-- function. The regex is character-for-character the one update_tenant_profile
-- and update_my_profile already apply, so every row either function wrote is
-- already valid and nothing legitimate is rejected.
create or replace function public.socials_are_web_links(p_socials jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    bool_and(coalesce(e ->> 'url', '') ~* '^https?://[^[:space:]]+$'),
    true  -- an empty list has no bad link in it
  )
  from jsonb_array_elements(coalesce(p_socials, '[]'::jsonb)) e;
$$;
comment on function public.socials_are_web_links(jsonb) is
  'Every entry of a socials array carries an http(s) url (11 Sep 2026). Used as a CHECK on tenants.socials and profiles.socials so a `javascript:` link cannot be stored by any door, including a direct PATCH.';

-- Any link already stored that is not an http(s) address is a live payload on a
-- public page, so it is removed rather than kept: dropping the entry is the
-- remediation, and the count is announced rather than done quietly.
do $$
declare
  v_t integer := 0;
  v_p integer := 0;
begin
  with fixed as (
    select t.id,
           coalesce(jsonb_agg(e) filter (where coalesce(e ->> 'url', '') ~* '^https?://[^[:space:]]+$'), '[]'::jsonb) as clean
      from public.tenants t
      left join lateral jsonb_array_elements(t.socials) e on true
     where not public.socials_are_web_links(t.socials)
     group by t.id
  )
  update public.tenants t set socials = f.clean from fixed f where f.id = t.id;
  get diagnostics v_t = row_count;

  with fixed as (
    select p.id,
           coalesce(jsonb_agg(e) filter (where coalesce(e ->> 'url', '') ~* '^https?://[^[:space:]]+$'), '[]'::jsonb) as clean
      from public.profiles p
      left join lateral jsonb_array_elements(p.socials) e on true
     where not public.socials_are_web_links(p.socials)
     group by p.id
  )
  update public.profiles p set socials = f.clean from fixed f where f.id = p.id;
  get diagnostics v_p = row_count;

  if v_t > 0 or v_p > 0 then
    raise notice 'removed non-http links from % tenant row(s) and % profile row(s)', v_t, v_p;
  end if;
end $$;

alter table public.tenants
  drop constraint if exists tenants_socials_are_web_links;
alter table public.tenants
  add constraint tenants_socials_are_web_links check (public.socials_are_web_links(socials));

alter table public.profiles
  drop constraint if exists profiles_socials_are_web_links;
alter table public.profiles
  add constraint profiles_socials_are_web_links check (public.socials_are_web_links(socials));
