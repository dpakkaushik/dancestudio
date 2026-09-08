-- Users · Organizations · platform admins (8 Sep 2026) ⚠ Rule 9: auth + RLS.
--
-- THE ROLE MODEL CHANGES, at the user's instruction (a deliberate deviation from
-- the prototype's dancer | trainer | studio, recorded in CLAUDE.md's deviations
-- table). Three words become two, and the third thing becomes a ROW:
--
--   dancer  -> user      everyone starts here
--   trainer -> user      "Pro" is an active artist_plans row, never a role again —
--                        the two UPDATEs that kept role and plan in step were the
--                        only thing keeping them in step, and they drifted (a plan
--                        that simply expired left 'trainer' on the row forever)
--   studio  -> org       an ORGANIZATION: the account that runs studios. One org,
--                        many studios, in one city or several — every studio it
--                        opens is a tenant it owns, exactly as before; what is new
--                        is that NOBODY ELSE may open one.
--
-- And a fourth kind of account that is not a role: PLATFORM ADMINS. An
-- organization asks to be verified; an admin reads its social links and says yes
-- or no; until yes, nothing the organization runs is public. Verification used
-- to be a bare timestamp only the service role could set, with no request, no
-- queue and no reviewer — here it becomes a state with a door.
--
-- Order matters inside this file: the role data moves BEFORE the guard that
-- freezes it exists, and the grandfathering runs with the verified_at guard
-- switched off, because a migration carries no JWT and the guard reads one.

-- ── 1. the role column: two words ───────────────────────────────────────────
-- the inline check from Step 1 was unnamed, so Postgres called it this
alter table public.profiles drop constraint profiles_role_check;
update public.profiles set role = 'user' where role in ('dancer', 'trainer');
update public.profiles set role = 'org' where role = 'studio';
alter table public.profiles add constraint profiles_role_check check (role in ('user', 'org'));
comment on table public.profiles is
  'One profile per auth user. role: user | org (8 Sep 2026 — was the prototype''s dancer | trainer | studio; "Pro" is an active artist_plans row, not a role).';
comment on column public.profiles.role is
  'user — a person; org — an organization that runs studios. Chosen once at onboarding; only DanceOS (service role or a platform admin) may change it afterwards.';

-- ── 2. platform admins ──────────────────────────────────────────────────────
-- Keyed on auth.users, not profiles, so an admin can be named before they have
-- finished onboarding (the first one is, below). Rule 3's audit columns and soft
-- delete are kept even on a table this small: ending somebody's admin access is
-- a fact worth keeping, not a row worth losing.
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);
comment on table public.platform_admins is
  'Who may verify organizations. Written by the service role only — there is no self-serve path to becoming an admin, by design.';

create trigger platform_admins_set_updated_at
  before update on public.platform_admins
  for each row execute function public.set_updated_at();

alter table public.platform_admins enable row level security;

/** the one question every admin surface asks; SECURITY DEFINER so the row it
 *  reads is not itself subject to the policy that calls it */
create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.platform_admins a
    where a.user_id = auth.uid() and a.deleted_at is null
  );
$$;
revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- an admin sees the list; nobody else sees that the table has rows at all
create policy "admins read the admin list"
  on public.platform_admins for select
  to authenticated
  using (deleted_at is null and public.is_platform_admin());
-- no insert / update / delete policies: the service role is the only writer

-- the first admin, named by the user on 8 Sep 2026; idempotent, and a no-op if
-- the address is not in auth.users yet
insert into public.platform_admins (user_id, note)
select u.id, 'first platform admin — named 8 Sep 2026'
from auth.users u
where lower(u.email) = 'ai@eeetaxi.com'
on conflict (user_id) do nothing;

-- ── 3. the role is chosen once ──────────────────────────────────────────────
-- Step 1's own-row UPDATE policy names no columns, so until now a person could
-- PATCH their role to anything the check allowed — the same hole
-- guard_verified_at closed for the tick. With "org" meaning "may open studios",
-- that hole is a door onto the whole business side of the app.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role'
     and not public.is_platform_admin() then
    raise exception 'who you are on DanceOS is chosen once, at onboarding — ask DanceOS to change it';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_profile_role() from public, anon, authenticated;

create trigger profiles_guard_role
  before update of role on public.profiles
  for each row execute function public.guard_profile_role();

-- ── 4. the tick: the service role OR a platform admin ───────────────────────
-- same function, same two triggers (tenants and profiles); one more allowed hand
create or replace function public.guard_verified_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.verified_at is distinct from old.verified_at
     and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role'
     and not public.is_platform_admin() then
    raise exception 'verification is DanceOS''s to give — it cannot be changed here';
  end if;
  return new;
end;
$$;

-- ── 5. verification requests: a state with a door ───────────────────────────
create table public.org_verification_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  -- the admin's reason, read back by the organization on a rejection
  note text check (note is null or char_length(note) <= 300),
  decided_at timestamptz,
  decided_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);
comment on table public.org_verification_requests is
  'An organization asking DanceOS to check its social links. One pending request at a time; a decision closes it and moves profiles.verified_at and the visibility of every studio the organization owns.';

create index org_verification_requests_org_idx on public.org_verification_requests (org_id) where deleted_at is null;
create index org_verification_requests_status_idx on public.org_verification_requests (status) where deleted_at is null;
-- one open question per organization
create unique index org_verification_requests_one_pending
  on public.org_verification_requests (org_id) where status = 'pending' and deleted_at is null;

create trigger org_verification_requests_set_updated_at
  before update on public.org_verification_requests
  for each row execute function public.set_updated_at();

alter table public.org_verification_requests enable row level security;

create policy "an organization reads its own requests"
  on public.org_verification_requests for select
  to authenticated
  using (org_id = auth.uid());

create policy "admins read every request"
  on public.org_verification_requests for select
  to authenticated
  using (public.is_platform_admin());
-- no insert / update / delete policies: the two functions below are the only writes

/** THE ASK. Only an organization asks; only one with something to check asks —
 *  the links are mandatory for an organization precisely because they are what
 *  the admin verifies. Asking twice returns the open request rather than a
 *  second one. Onboarding calls this when an organization finishes; the hub
 *  offers it again after a rejection. */
create or replace function public.request_org_verification()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_socials jsonb;
  v_verified timestamptz;
  v_id uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select p.role, p.socials, p.verified_at into v_role, v_socials, v_verified
    from public.profiles p where p.id = v_user and p.deleted_at is null;
  if not found then raise exception 'finish onboarding first'; end if;
  if v_role <> 'org' then raise exception 'only an organization asks to be verified'; end if;
  if v_verified is not null then raise exception 'this organization is already verified'; end if;
  if jsonb_array_length(coalesce(v_socials, '[]'::jsonb)) = 0 then
    raise exception 'add at least one social link first — DanceOS verifies an organization by its public presence';
  end if;
  select r.id into v_id from public.org_verification_requests r
    where r.org_id = v_user and r.status = 'pending' and r.deleted_at is null;
  if found then return v_id; end if;
  insert into public.org_verification_requests (org_id, created_by, updated_by)
    values (v_user, v_user, v_user)
    returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.request_org_verification() from public, anon;
grant execute on function public.request_org_verification() to authenticated;

/** THE ANSWER, and everything that follows from it. Approving stamps the
 *  organization's tick and lists every studio it owns; rejecting (or revoking a
 *  verification given earlier) clears the tick and unlists them. Keyed on the
 *  organization rather than on a request, so an admin can also revoke a
 *  grandfathered verification that never had a request. The tenants UPDATE
 *  passes guard_tenant_visibility because the tick is set first. */
create or replace function public.decide_org_verification(p_org_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
begin
  if v_admin is null then raise exception 'not authenticated'; end if;
  if not public.is_platform_admin() then raise exception 'admins only'; end if;
  if p_note is not null and char_length(p_note) > 300 then raise exception 'a note is at most 300 characters'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_org_id and p.role = 'org' and p.deleted_at is null) then
    raise exception 'that is not an organization';
  end if;

  update public.org_verification_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         note = nullif(btrim(coalesce(p_note, '')), ''),
         decided_at = now(),
         decided_by = v_admin,
         updated_by = v_admin
   where org_id = p_org_id and status = 'pending' and deleted_at is null;

  if p_approve then
    update public.profiles set verified_at = coalesce(verified_at, now()), updated_by = v_admin
     where id = p_org_id;
    update public.tenants t set visibility = 'listed', updated_by = v_admin
     where t.type = 'studio' and t.deleted_at is null and t.visibility = 'unlisted'
       and exists (select 1 from public.tenant_members m
                    where m.tenant_id = t.id and m.user_id = p_org_id and m.member_role = 'owner' and m.deleted_at is null);
  else
    update public.profiles set verified_at = null, updated_by = v_admin
     where id = p_org_id and verified_at is not null;
    update public.tenants t set visibility = 'unlisted', updated_by = v_admin
     where t.type = 'studio' and t.deleted_at is null and t.visibility = 'listed'
       and exists (select 1 from public.tenant_members m
                    where m.tenant_id = t.id and m.user_id = p_org_id and m.member_role = 'owner' and m.deleted_at is null);
  end if;
end;
$$;
revoke execute on function public.decide_org_verification(uuid, boolean, text) from public, anon;
grant execute on function public.decide_org_verification(uuid, boolean, text) to authenticated;

-- the queue is told, or it is not a queue (Step 24's rule, applied to admins)
create or replace function public.notify_platform_admins(p_kind text, p_title text, p_body text, p_href text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  for v_user in select a.user_id from public.platform_admins a where a.deleted_at is null loop
    perform public.notify(v_user, p_kind, p_title, p_body, p_href);
  end loop;
end;
$$;
revoke execute on function public.notify_platform_admins(text, text, text, text) from public, anon, authenticated;

-- raised where the fact happens: the ask reaches the admins, the answer reaches
-- the organization. Kind 'people' — the existing bucket for asks and answers —
-- rather than a seventh kind nobody asked for.
create or replace function public.notify_org_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  select p.full_name into v_name from public.profiles p where p.id = new.org_id;
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.notify_platform_admins('people',
      coalesce(v_name, 'An organization') || ' asked to be verified',
      'Check its social links, then approve or reject it in the verification queue.',
      '/admin/verifications');
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('approved', 'rejected') then
    perform public.notify(new.org_id, 'people',
      case when new.status = 'approved' then 'Your organization is verified' else 'Your verification was not approved' end,
      case when new.status = 'approved'
           then 'Your studios are live on Discover now.'
           else coalesce(nullif(btrim(coalesce(new.note, '')), ''), 'Update your links and ask again from your organization hub.') end,
      '/business');
  end if;
  return null;
end;
$$;
revoke execute on function public.notify_org_verification() from public, anon, authenticated;

create trigger notify_org_verification
  after insert or update of status on public.org_verification_requests
  for each row execute function public.notify_org_verification();

-- ── 6. a studio is public only under a verified organization ────────────────
create or replace function public.tenant_owner_verified(p_tenant_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.tenant_members m
    join public.profiles p on p.id = m.user_id
    where m.tenant_id = p_tenant_id and m.member_role = 'owner' and m.deleted_at is null
      and p.deleted_at is null and p.verified_at is not null
  );
$$;
revoke execute on function public.tenant_owner_verified(uuid) from public, anon;
grant execute on function public.tenant_owner_verified(uuid) to authenticated;

-- Every public policy and function in this schema hinges on visibility = 'listed'
-- (eight policies, nine functions — inventoried 8 Sep 2026), and Step 2's
-- "owners update own tenants" names no columns, so without this an owner could
-- PATCH their studio public. The service role is exempt (ops), an artist page is
-- not gated (Pro is not verified), and unlisting is always allowed.
create or replace function public.guard_tenant_visibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.visibility = 'listed' and new.visibility is distinct from old.visibility
     and new.type = 'studio'
     and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role'
     and not public.tenant_owner_verified(new.id) then
    raise exception 'a studio goes public once DanceOS has verified its organization';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_tenant_visibility() from public, anon, authenticated;

create trigger tenants_guard_visibility
  before update of visibility on public.tenants
  for each row execute function public.guard_tenant_visibility();

-- ── 7. who may open what ────────────────────────────────────────────────────
-- Same signature as Step 5's version, so every caller is unchanged. What changes
-- is the door: a studio needs an ORGANIZATION (and is born unlisted until that
-- organization is verified); an artist page needs a PERSON with an active plan,
-- and there is one per person.
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
  v_role text;
  v_verified timestamptz;
  v_visibility text;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
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

  select p.role, p.verified_at into v_role, v_verified
    from public.profiles p where p.id = v_user and p.deleted_at is null;
  if not found then
    raise exception 'finish onboarding first';
  end if;

  if p_type = 'studio' then
    if v_role <> 'org' then
      raise exception 'only an organization can set up a studio';
    end if;
    v_visibility := case when v_verified is not null then 'listed' else 'unlisted' end;
  else
    if v_role <> 'user' then
      raise exception 'an artist page belongs to a person — an organization sets up studios';
    end if;
    if not exists (select 1 from public.artist_plans ap
                    where ap.user_id = v_user and ap.deleted_at is null and ap.ended_at is null and ap.until >= v_today) then
      raise exception 'the Artist plan unlocks your artist page';
    end if;
    if exists (select 1 from public.tenants t
                join public.tenant_members m on m.tenant_id = t.id
                where m.user_id = v_user and m.member_role = 'owner' and m.deleted_at is null
                  and t.type = 'trainer_business' and t.deleted_at is null) then
      raise exception 'you already have an artist page';
    end if;
    v_visibility := 'listed';
  end if;

  select c.lat, c.lng into v_lat, v_lng
  from public.city_centroids c
  where c.city = nullif(trim(p_city), '') and c.deleted_at is null;

  insert into public.tenants (type, name, area, city, lat, lng, visibility, created_by, updated_by)
  values (p_type, trim(p_name), nullif(trim(p_area), ''), nullif(trim(p_city), ''), v_lat, v_lng, v_visibility, v_user, v_user)
  returning * into v_tenant;

  insert into public.tenant_members (tenant_id, user_id, member_role, created_by, updated_by)
  values (v_tenant.id, v_user, 'owner', v_user, v_user);

  return v_tenant;
end;
$$;
revoke execute on function public.create_tenant_with_owner(text, text, text, text) from public, anon;
grant execute on function public.create_tenant_with_owner(text, text, text, text) to authenticated;

-- ── 8. the plan stops writing the role ──────────────────────────────────────
-- bodies identical to 20260830150000 minus the one UPDATE each
create or replace function public.activate_artist_plan(p_plan text)
returns table (plan text, until date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_base date;
  v_until date;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_plan not in ('monthly', 'yearly') then raise exception 'a plan is monthly or yearly'; end if;
  if not exists (select 1 from public.profiles where id = v_user and deleted_at is null) then
    raise exception 'finish onboarding first';
  end if;
  select greatest(max(p.until), v_today) into v_base
    from public.artist_plans p where p.user_id = v_user and p.deleted_at is null and p.ended_at is null;
  v_base := coalesce(v_base, v_today);
  v_until := case when p_plan = 'yearly' then v_base + interval '1 year' else v_base + interval '1 month' end;
  insert into public.artist_plans (user_id, plan, started_on, until, amount_inr, created_by, updated_by)
    values (v_user, p_plan, v_today, v_until, 0, v_user, v_user);
  -- the toolset is on the same profile (8850): a plan makes you an artist — and
  -- the plan ROW is what says so now; the role stays 'user'
  return query select p_plan, v_until;
end;
$$;
revoke execute on function public.activate_artist_plan(text) from public, anon;
grant execute on function public.activate_artist_plan(text) to authenticated;

create or replace function public.end_artist_plan()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update public.artist_plans set ended_at = now(), updated_by = v_user
   where user_id = v_user and deleted_at is null and ended_at is null;
end;
$$;
revoke execute on function public.end_artist_plan() from public, anon;
grant execute on function public.end_artist_plan() to authenticated;

-- ── 9. who, among these people, is an artist right now ──────────────────────
-- Aggregate-only in the follower_counts pattern: ids in, the subset with a live
-- plan out. artist_plans is own-rows under RLS, so the badge beside somebody
-- ELSE's name needs this definer. Nothing about the plan itself is returned.
create or replace function public.artist_ids(p_ids uuid[])
returns setof uuid
language sql
security definer
set search_path = ''
stable
as $$
  select distinct ap.user_id
  from public.artist_plans ap
  where ap.user_id = any (p_ids)
    and ap.deleted_at is null and ap.ended_at is null
    and ap.until >= (now() at time zone 'Asia/Kolkata')::date;
$$;
revoke execute on function public.artist_ids(uuid[]) from public;
grant execute on function public.artist_ids(uuid[]) to anon, authenticated;

-- ── 10. the search box's second line ────────────────────────────────────────
-- body identical to 20260829210000 except the People section: its sub-line
-- read the three old words off the role (the artist word comes off the plan
-- now), and an ORGANIZATION is not a result at all — to everyone else it does
-- not exist; its studios do, each on its own row above
create or replace function public.search_dance_os(p_q text, p_limit integer default 3)
returns table (kind text, id uuid, name text, sub text, href text)
language sql
security invoker
set search_path = ''
stable
as $$
  with q as (
    select lower(trim(coalesce(p_q, ''))) as term,
           greatest(1, least(coalesce(p_limit, 3), 10)) as lim
  ),
  studios as (
    select 'studio'::text as kind, t.id, t.name,
           'Studio · ' || coalesce(t.city, '—') as sub,
           '/studio/' || t.id::text as href
    from public.tenants t, q
    where t.deleted_at is null and t.type = 'studio' and q.term <> ''
      and (lower(t.name) like q.term || '%' or lower(t.name) like '% ' || q.term || '%')
    order by t.name
    limit (select lim from q)
  ),
  artists as (
    select 'artist'::text as kind, t.id, t.name,
           'Artist · ' || coalesce(t.city, '—') as sub,
           '/artist/' || t.id::text as href
    from public.tenants t, q
    where t.deleted_at is null and t.type = 'trainer_business' and q.term <> ''
      and (lower(t.name) like q.term || '%' or lower(t.name) like '% ' || q.term || '%')
    order by t.name
    limit (select lim from q)
  ),
  crews as (
    select 'crew'::text as kind, c.id, c.name,
           'Crew · ' || c.city as sub,
           '/crew/' || c.id::text as href
    from public.crews c, q
    where c.deleted_at is null and q.term <> ''
      and (lower(c.name) like q.term || '%' or lower(c.name) like '% ' || q.term || '%')
    order by c.name
    limit (select lim from q)
  ),
  events as (
    select 'event'::text as kind, e.id, e.title as name,
           case e.cat when 'showcase' then 'Showcase' when 'battle' then 'Battle' else 'Tournament' end
             || ' · ' || e.venue as sub,
           '/e/' || e.share_slug as href
    from public.events e
    join public.tenants t on t.id = e.tenant_id, q
    where e.deleted_at is null and q.term <> ''
      and (lower(e.title) like q.term || '%' or lower(e.title) like '% ' || q.term || '%'
           or lower(t.name) like q.term || '%' or lower(t.name) like '% ' || q.term || '%')
    order by e.start_date
    limit (select lim from q)
  ),
  people as (
    select 'person'::text as kind, p.id, p.full_name as name,
           (case when exists (select 1 from public.artist_ids(array[p.id])) then 'Artist'
                 else 'User' end)
             || ' · ' || coalesce(p.city, '—') as sub,
           '/person/' || p.id::text as href
    from public.profiles p, q
    where p.deleted_at is null and p.role <> 'org' and q.term <> ''
      and (lower(p.full_name) like q.term || '%' or lower(p.full_name) like '% ' || q.term || '%')
    order by p.full_name
    limit (select lim from q)
  )
  select * from studios
  union all select * from artists
  union all select * from crews
  union all select * from events
  union all select * from people;
$$;
comment on function public.search_dance_os(text, integer) is
  'Discover''s one search box: studios, artists, crews, events and PEOPLE whose name starts with the term or has a word that does, at most p_limit per kind. SECURITY INVOKER — the caller''s RLS decides, so a stranger finds no people (profiles are signed-in only). An organization is never a result: it is not a public entity — its studios are.';
revoke execute on function public.search_dance_os(text, integer) from public;
grant execute on function public.search_dance_os(text, integer) to anon, authenticated;

-- ── 10b. an organization neither follows nor is followed ────────────────────
-- The user's rule (8 Sep 2026): to everyone else an organization does not
-- exist — its studios do, each on its own page, and only the organization sees
-- them under one hood. Following is a person's act and a person's list: an
-- organization following a studio would print ORGANIZATION in that studio's
-- Followers sheet, and following a person would put it in theirs. So both
-- follow doors refuse an organization as the caller, set_person_follow refuses
-- one as the target, and every live follow that names one (the old studio
-- accounts followed people and businesses) is closed the way an unfollow
-- closes it — soft-deleted, kept on record. The bodies are 20260828120000's
-- and 20260829210000's with the one check added each.
create or replace function public.set_follow(p_tenant_id uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_tenant public.tenants;
  v_live uuid;
  v_count bigint;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user and p.deleted_at is null) then
    raise exception 'finish onboarding before following';
  end if;
  -- an organization is not a person: it follows nothing (8 Sep 2026)
  if exists (select 1 from public.profiles p where p.id = v_user and p.role = 'org') then
    raise exception 'an organization does not follow — people follow its studios';
  end if;

  select * into v_tenant from public.tenants t
    where t.id = p_tenant_id and t.deleted_at is null;
  if not found then
    raise exception 'business not found';
  end if;
  -- a business that is not open to the public cannot be followed from outside
  if v_tenant.visibility <> 'listed' then
    raise exception 'this business is not open to the public';
  end if;
  -- you are on this team: a member's follow would count the business's own people
  if exists (
    select 1 from public.tenant_members m
    where m.tenant_id = p_tenant_id and m.user_id = v_user and m.deleted_at is null
  ) then
    raise exception 'you already belong to this business';
  end if;

  select f.id into v_live from public.follows f
    where f.follower_id = v_user and f.tenant_id = p_tenant_id and f.deleted_at is null;

  if p_on and v_live is null then
    insert into public.follows (follower_id, tenant_id, created_by, updated_by)
    values (v_user, p_tenant_id, v_user, v_user);
  elsif not p_on and v_live is not null then
    update public.follows
      set deleted_at = now(), updated_by = v_user
      where id = v_live;
  end if;

  select count(*) into v_count from public.follows f
    where f.tenant_id = p_tenant_id and f.deleted_at is null;

  return jsonb_build_object('following', p_on, 'followers', v_count);
end;
$$;
comment on function public.set_follow(uuid, boolean) is
  'Follow (true) or unfollow (false) a listed business you do not belong to. Idempotent; returns the new state and the live follower count. An organization account cannot follow (8 Sep 2026).';
revoke execute on function public.set_follow(uuid, boolean) from public, anon;
grant execute on function public.set_follow(uuid, boolean) to authenticated;

create or replace function public.set_person_follow(p_user_id uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_live uuid;
  v_count bigint;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user and p.deleted_at is null) then
    raise exception 'finish onboarding before following';
  end if;
  -- an organization is not a person: it follows nobody (8 Sep 2026)
  if exists (select 1 from public.profiles p where p.id = v_user and p.role = 'org') then
    raise exception 'an organization does not follow people';
  end if;
  if p_user_id = v_user then
    raise exception 'you cannot follow yourself';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id and p.deleted_at is null) then
    raise exception 'that person is not on DanceOS';
  end if;
  -- and it is not a person to follow: its studios are
  if exists (select 1 from public.profiles p where p.id = p_user_id and p.role = 'org') then
    raise exception 'that is an organization, not a person — follow its studios';
  end if;

  select f.id into v_live from public.follows f
    where f.follower_id = v_user and f.followee_id = p_user_id and f.deleted_at is null;

  if p_on and v_live is null then
    insert into public.follows (follower_id, followee_id, created_by, updated_by)
    values (v_user, p_user_id, v_user, v_user);
  elsif not p_on and v_live is not null then
    update public.follows set deleted_at = now(), updated_by = v_user where id = v_live;
  end if;

  select count(*) into v_count from public.follows f
    where f.followee_id = p_user_id and f.deleted_at is null;

  return jsonb_build_object('following', p_on, 'followers', v_count);
end;
$$;
comment on function public.set_person_follow(uuid, boolean) is
  'Follow (true) or unfollow (false) a person. Idempotent; refuses yourself, somebody who is not on DanceOS, and an organization on either side (8 Sep 2026). Returns the new state and the live follower count.';
revoke execute on function public.set_person_follow(uuid, boolean) from public, anon;
grant execute on function public.set_person_follow(uuid, boolean) to authenticated;

-- the live follows that already name an organization, on either side, are closed
update public.follows f
   set deleted_at = now()
 where f.deleted_at is null
   and (exists (select 1 from public.profiles p where p.id = f.follower_id and p.role = 'org')
     or exists (select 1 from public.profiles p where p.id = f.followee_id and p.role = 'org'));

-- ── 11. grandfathering (user's decision, 8 Sep 2026) ────────────────────────
-- Every organization that already owns a live tenant is verified as of now, so
-- nothing on Discover disappears. A migration carries no JWT, so the guard would
-- refuse this — it is switched off for exactly these rows and switched back on.
-- An admin can revoke any of these from the queue.
alter table public.profiles disable trigger profiles_guard_verified_at;
update public.profiles p
   set verified_at = now()
 where p.role = 'org' and p.deleted_at is null and p.verified_at is null
   and exists (select 1 from public.tenant_members m
                join public.tenants t on t.id = m.tenant_id
                where m.user_id = p.id and m.member_role = 'owner' and m.deleted_at is null and t.deleted_at is null);
alter table public.profiles enable trigger profiles_guard_verified_at;
