-- THE TEAM, BY THE PROFILE YOU ARE IN (20 Sep 2026).
-- ⚠ AUTH (Rule 9): one new door GRANTS A REAL OWNER SEAT on a studio. Read §3.
--
-- The user's list, kind by kind:
--   A. ORGANIZATION — Owner · Studio owner (naming which studio, and reflected
--      in that studio as Owner) · Event Team · Other Team Members
--   B. STUDIO — Owners · Faculty · Visiting Faculty (added automatically when
--      somebody outside the team accepts a class) · Assistants · Other Team
--      Members
--   C. ARTIST — Assistant · Other Team Members
--   D. CREW — Leader and Crew Members (already true since Step 22)
--   E. Everything except "Other Team Members" reflects onto the public page of
--      the person it names; for an artist and a user that is Crews, Studios
--      Associated With (the seat named) and Artists Associated With.
--
-- Two of their answers decided the shape:
--   * "Studio owner" is a REAL owner seat, not a label (§3).
--   * "Other team members" do NOT appear on somebody's public profile (§4).

-- ── 1. `assistant` IS A SEAT ─────────────────────────────────────────────────
-- A studio had Faculty · Visiting faculty · Staff, and an artist page called its
-- `staff` seat "Assistant" on the screen. The user's list wants BOTH on a studio
-- — Assistants AND Other Team Members — so the fifth value is real now and
-- `staff` becomes "Other team member" everywhere.
--
-- ⚠ THE CONSTRAINT IS FOUND BY PATTERN, NOT BY NAME (the 18 Sep technique): this
-- CHECK has been dropped and re-added twice already and its name is not
-- guaranteed.
do $$
declare v_name text;
begin
  select conname into v_name from pg_constraint
   where conrelid = 'public.business_members'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%member_role%';
  if v_name is not null then
    execute format('alter table public.business_members drop constraint %I', v_name);
  end if;
end $$;
alter table public.business_members
  add constraint business_members_member_role_check
  check (member_role in ('owner', 'trainer', 'staff', 'visiting_faculty', 'assistant'));
comment on column public.business_members.member_role is
  'owner | trainer (the screen says Faculty) | visiting_faculty (seated by accepting a class from outside the team) | assistant (20 Sep 2026) | staff (the screen says Other team member). What each word is CALLED depends on the profile handing it out — see rolesFor in types/staff.ts.';

-- ⚠ AND THE TABLE THAT FEEDS IT, IN THE SAME BREATH. The 19 Sep lesson, exactly
-- one day old: `visiting_faculty` was added to business_members and NOT to
-- business_invites, so the label was offered, accepted by the RPC and refused by
-- the table. A value added to one table's vocabulary does not reach the tables
-- that feed it.
do $$
declare v_name text;
begin
  select conname into v_name from pg_constraint
   where conrelid = 'public.business_invites'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%member_role%';
  if v_name is not null then
    execute format('alter table public.business_invites drop constraint %I', v_name);
  end if;
end $$;
alter table public.business_invites
  add constraint business_invites_member_role_check
  check (member_role in ('trainer', 'staff', 'visiting_faculty', 'assistant'));

-- and the three doors that name the seats (same signatures, so every ACL and
-- every caller is untouched)
create or replace function public.set_member_role(
  p_business_id uuid,
  p_user_id uuid,
  p_role text
) returns public.business_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_member public.business_members;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_business_owner(p_business_id) then
    raise exception 'only the studio owner changes what somebody may do';
  end if;
  if p_role not in ('trainer', 'staff', 'visiting_faculty', 'assistant') then
    raise exception 'a member may be faculty, visiting faculty, an assistant or other team - owner cannot be granted';
  end if;
  select * into v_member from public.business_members m
   where m.business_id = p_business_id and m.user_id = p_user_id and m.deleted_at is null;
  if v_member.id is null then
    raise exception 'they are not on your team';
  end if;
  update public.business_members
     set member_role = p_role, updated_by = v_user
   where id = v_member.id
  returning * into v_member;
  return v_member;
end;
$$;

create or replace function public.invite_person_to_business(p_business_id uuid, p_user_id uuid, p_role text)
returns public.business_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_invite public.business_invites;
  v_name text;
  v_role text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not public.is_business_owner(p_business_id) then
    raise exception 'only an owner invites somebody onto the team';
  end if;
  v_role := coalesce(nullif(btrim(p_role), ''), 'staff');
  if v_role not in ('trainer', 'staff', 'visiting_faculty', 'assistant') then
    raise exception 'owner is not a seat that can be given away';
  end if;
  if p_user_id = v_user then raise exception 'you are already on this team'; end if;

  select p.full_name into v_name
    from public.profiles p
   where p.id = p_user_id and p.deleted_at is null and p.role = 'user';
  if not found then raise exception 'that is not somebody on DanceOS'; end if;

  if exists (
    select 1 from public.business_members m
     where m.business_id = p_business_id and m.user_id = p_user_id and m.deleted_at is null
  ) then
    raise exception 'they are already on this team';
  end if;

  update public.business_invites
     set deleted_at = now(), updated_by = v_user
   where business_id = p_business_id and user_id = p_user_id
     and status = 'pending' and deleted_at is null;

  insert into public.business_invites (business_id, name, email, user_id, member_role, created_by, updated_by)
  values (p_business_id, v_name, null, p_user_id, v_role, v_user, v_user)
  returning * into v_invite;
  return v_invite;
end;
$$;

-- ── 2. AN ORGANIZATION'S FOUR LABELS ─────────────────────────────────────────
do $$
declare v_name text;
begin
  select conname into v_name from pg_constraint
   where conrelid = 'public.organization_members'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%role%' and pg_get_constraintdef(oid) not ilike '%status%';
  if v_name is not null then
    execute format('alter table public.organization_members drop constraint %I', v_name);
  end if;
end $$;
alter table public.organization_members
  add constraint organization_members_role_check
  check (role in ('owner', 'studio_owner', 'event_team', 'member'));

-- WHICH studio a "Studio owner" owns. Null for every other label, and the CHECK
-- makes that exact: an organization runs several studios, so the label is
-- meaningless without naming one.
alter table public.organization_members
  add column if not exists business_id uuid references public.businesses (id) on delete cascade;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.organization_members'::regclass
       and conname = 'organization_members_studio_owner_names_a_studio'
  ) then
    alter table public.organization_members
      add constraint organization_members_studio_owner_names_a_studio
      check ((role = 'studio_owner') = (business_id is not null));
  end if;
end $$;

create index if not exists organization_members_by_business
  on public.organization_members (business_id)
  where deleted_at is null and business_id is not null;

comment on column public.organization_members.business_id is
  'The studio a "Studio owner" owns (20 Sep 2026). Set exactly when role = studio_owner, and the grant is REAL: the same RPC writes an owner seat for that person on that studio''s business_members.';

-- THE ASK LEARNS THE NEW LABELS — except `studio_owner`, on purpose.
-- ⚠ A studio-owner seat is REAL POWER over a studio, and you cannot give it to
-- somebody who has not said yes to being on the team at all. So the ask offers
-- owner | event_team | member, and `studio_owner` is set AFTERWARDS, on a
-- CONFIRMED member, by the door in §3 — which is also the only place that can
-- check the studio is one this organization owns.
-- ⚠ THE BODY BELOW IS 20260919140000's, VERBATIM, with ONE line changed — the
-- role list. It was first re-typed from memory here and differed in FIVE ways
-- (it lost the `default 'member'`, the `sort`, the re-ask-after-a-no, the
-- suspension check and the "asked or confirmed" narrowing). A re-typed function
-- is one that can differ, and this file has said so since 16 Sep.
create or replace function public.ask_organization_member(p_user_id uuid, p_role text default 'member')
returns public.organization_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.assert_caller_is_organization();
  v_row public.organization_members;
  v_sort integer;
begin
  if p_role not in ('owner', 'event_team', 'member') then
    raise exception 'ask somebody as an owner, event team or a member - a studio owner is named once they have said yes';
  end if;
  if p_user_id = v_org then
    raise exception 'you are the organization';
  end if;
  -- a PERSON — an organization is not on anybody's team (R11)
  if not exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.role = 'user' and p.deleted_at is null and p.suspended_at is null
  ) then
    raise exception 'that person is not on DanceOS';
  end if;
  if exists (
    select 1 from public.organization_members m
    where m.org_id = v_org and m.user_id = p_user_id and m.deleted_at is null and m.status in ('asked', 'confirmed')
  ) then
    raise exception 'they are already on the team, or already asked';
  end if;
  -- asking again after a no or a withdrawal is a fresh ask (the crews rule)
  update public.organization_members set deleted_at = now(), updated_by = v_org
    where org_id = v_org and user_id = p_user_id and deleted_at is null;

  select coalesce(max(m.sort), 0) + 1 into v_sort from public.organization_members m
    where m.org_id = v_org and m.deleted_at is null;

  insert into public.organization_members (org_id, user_id, role, status, sort, created_by, updated_by)
  values (v_org, p_user_id, p_role, 'asked', v_sort, v_org, v_org)
  returning * into v_row;
  return v_row;
end;
$$;

-- ── 3. ⚠ THE ONE DOOR THAT GRANTS A REAL OWNER SEAT ──────────────────────────
-- The user, asked whether "Studio owner" should be a label or the thing itself:
-- *a real owner seat* — they can create and edit classes, run payouts, edit the
-- studio, invite people.
--
-- ⚠ WHY THIS IS A NEW, NARROWER DOOR AND NOT A LOOSENED OLD ONE. Three guards
-- refuse to hand out `owner` — `invite_to_business`, `invite_person_to_business`
-- and `set_member_role` — and ALL THREE STAY EXACTLY AS THEY ARE. "An invite
-- cannot grant owner" is still true, and its proof still passes. What this adds
-- is a different act with a different gate: an ORGANIZATION naming one of its
-- OWN confirmed team on one of its OWN studios. It is not reachable by an
-- invite, by a studio's owner, or by the person receiving it.
--
-- ⚠ AND IT NEVER LEAVES A STUDIO OWNERLESS: taking the label away removes the
-- seat only while another live owner remains.
drop function if exists public.set_organization_member_role(uuid, text);
create function public.set_organization_member_role(p_member_id uuid, p_role text, p_business_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.assert_caller_is_organization();
  v_row public.organization_members;
  v_owners integer;
begin
  if p_role not in ('owner', 'studio_owner', 'event_team', 'member') then
    raise exception 'a team member is an owner, a studio owner, event team or a member';
  end if;
  select * into v_row from public.organization_members m where m.id = p_member_id and m.deleted_at is null;
  if not found or v_row.org_id <> v_org then
    raise exception 'member not found';
  end if;
  if v_row.status <> 'confirmed' then
    raise exception 'they have not said yes yet';
  end if;

  if p_role = 'studio_owner' then
    if p_business_id is null then
      raise exception 'a studio owner owns one of your studios - say which';
    end if;
    -- the studio must be a STUDIO, and one THIS organization owns
    if not exists (
      select 1 from public.businesses b
       join public.business_members m on m.business_id = b.id and m.user_id = v_org
        and m.member_role = 'owner' and m.deleted_at is null
       where b.id = p_business_id and b.deleted_at is null and b.type = 'studio'
    ) then
      raise exception 'that is not one of your studios';
    end if;
    -- THE GRANT: a real owner seat on that studio.
    -- ⚠ EXPLICIT rather than `on conflict do nothing`: `business_members` has no
    -- unique index on (business_id, user_id) to target, so a bare ON CONFLICT
    -- would not fire and a second call would leave the person seated TWICE.
    if exists (
      select 1 from public.business_members m
       where m.business_id = p_business_id and m.user_id = v_row.user_id
    ) then
      update public.business_members
         set member_role = 'owner', deleted_at = null, updated_by = v_org
       where business_id = p_business_id and user_id = v_row.user_id;
    else
      insert into public.business_members (business_id, user_id, member_role, created_by, updated_by)
      values (p_business_id, v_row.user_id, 'owner', v_org, v_org);
    end if;
  end if;

  -- MOVING OFF studio_owner takes the seat back, but never the last owner
  if v_row.role = 'studio_owner' and v_row.business_id is not null
     and (p_role <> 'studio_owner' or p_business_id is distinct from v_row.business_id) then
    select count(*) into v_owners from public.business_members m
     where m.business_id = v_row.business_id and m.member_role = 'owner' and m.deleted_at is null;
    if v_owners > 1 then
      update public.business_members
         set deleted_at = now(), updated_by = v_org
       where business_id = v_row.business_id and user_id = v_row.user_id
         and member_role = 'owner' and deleted_at is null;
    end if;
  end if;

  update public.organization_members
     set role = p_role,
         business_id = case when p_role = 'studio_owner' then p_business_id else null end,
         updated_by = v_org
   where id = p_member_id;
end;
$$;
revoke execute on function public.set_organization_member_role(uuid, text, uuid) from public, anon;
grant execute on function public.set_organization_member_role(uuid, text, uuid) to authenticated, service_role;
comment on function public.set_organization_member_role(uuid, text, uuid) is
  'An organization labels one of its confirmed team (20 Sep 2026). ⚠ studio_owner is not a label: it writes a REAL owner seat on that studio''s business_members, and taking it away removes that seat while another owner remains. The three invite/role doors that refuse `owner` are untouched.';

-- taking somebody OFF the team takes any granted seat with them.
-- ⚠ 20260919140000's body verbatim; the only addition is the seat clean-up.
create or replace function public.remove_organization_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.organization_members;
  v_owners integer;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_row from public.organization_members m where m.id = p_member_id and m.deleted_at is null;
  if not found then
    raise exception 'member not found';
  end if;
  if v_row.user_id <> v_user and v_row.org_id <> v_user then
    raise exception 'only the organization removes its team';
  end if;
  if v_row.role = 'studio_owner' and v_row.business_id is not null then
    select count(*) into v_owners from public.business_members m
     where m.business_id = v_row.business_id and m.member_role = 'owner' and m.deleted_at is null;
    if v_owners > 1 then
      update public.business_members
         set deleted_at = now(), updated_by = v_user
       where business_id = v_row.business_id and user_id = v_row.user_id
         and member_role = 'owner' and deleted_at is null;
    end if;
  end if;
  update public.organization_members set deleted_at = now(), updated_by = v_user where id = p_member_id;
end;
$$;

-- ── 4. WHAT EACH PAGE READS ──────────────────────────────────────────────────
-- a studio's public team gains its ASSISTANTS (same signature, ACL untouched)
create or replace function public.public_studio_team(p_business_id uuid)
returns table(user_id uuid, member_role text, full_name text, photo_path text, is_org boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, m.member_role, p.full_name, p.profile_photo_path, (p.role = 'org') as is_org
  from public.business_members m
  join public.profiles p on p.id = m.user_id and p.deleted_at is null
  join public.businesses b on b.id = m.business_id
  where m.business_id = p_business_id and m.deleted_at is null
    and m.member_role in ('owner', 'trainer', 'visiting_faculty', 'assistant')
    and b.deleted_at is null and b.type = 'studio'
    and (b.visibility = 'listed' or public.is_business_member(p_business_id))
  order by case m.member_role
             when 'owner' then 0 when 'trainer' then 1
             when 'visiting_faculty' then 2 else 3 end,
           m.sort, p.full_name;
$$;
comment on function public.public_studio_team(uuid) is
  'A listed studio''s public team, in the order the studio arranged: Owner, Faculty, Visiting faculty, Assistants. ⚠ `staff` is NOT here (20 Sep 2026) — the user''s rule E: everything except Other Team Members reflects onto a public page.';

-- an organization's public team gains WHICH studio a studio owner owns, and
-- stops printing its "Other team members" (rule E)
drop function if exists public.public_organization_team(uuid);
create function public.public_organization_team(p_org_id uuid)
returns table(member_id uuid, user_id uuid, role text, full_name text, photo_path text, city text, is_artist boolean, sort integer, business_id uuid, business_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.user_id, m.role, p.full_name, p.profile_photo_path, p.city,
         public.artist_plan_active(p.id) as is_artist, m.sort,
         m.business_id, b.name
  from public.organization_members m
  join public.profiles p on p.id = m.user_id and p.deleted_at is null and p.suspended_at is null
  left join public.businesses b on b.id = m.business_id and b.deleted_at is null
  where m.org_id = p_org_id and m.status = 'confirmed' and m.deleted_at is null
    and m.role <> 'member'
    and public.org_is_public(p_org_id)
  order by case m.role when 'owner' then 0 when 'studio_owner' then 1 else 2 end, m.sort, m.created_at;
$$;
revoke execute on function public.public_organization_team(uuid) from public;
grant execute on function public.public_organization_team(uuid) to anon, authenticated, service_role;
comment on function public.public_organization_team(uuid) is
  'A public organization''s confirmed team for its page: Owner, then Studio owners with the studio each owns, then Event team. ⚠ "Other team members" are NOT returned (20 Sep 2026, the user''s rule E).';

-- ── 5. THE OTHER SIDE OF THE SAME FACT: what a PERSON's page says ────────────
-- "Studios Associated With" and "Artists Associated With" — the seats this
-- person holds, from the businesses' side. ⚠ `staff` is left out for the same
-- reason it is left off an organization's page: a front-desk or admin seat is
-- not something somebody's public profile announces.
--
-- Only a LISTED business is named, so an unlisted studio never appears on
-- somebody else's page — the same rule `person_teaches_at` has always kept.
create or replace function public.person_associations(p_user_id uuid)
returns table(business_id uuid, business_type text, business_name text, city text, photo_path text, member_role text, owner_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  -- ⚠ the OWNER rides along so an artist page's row can open the PERSON behind
  -- it in one hop: /artist/{id} only redirects to /person/{owner} (18 Sep 2026),
  -- and a redirect-only URL in somebody's history is what makes back loop.
  select b.id, b.type, b.name, b.city, b.profile_photo_path, m.member_role, public.business_owner(b.id)
  from public.business_members m
  join public.businesses b on b.id = m.business_id
  where m.user_id = p_user_id
    and m.deleted_at is null
    and m.member_role in ('owner', 'trainer', 'visiting_faculty', 'assistant')
    and b.deleted_at is null
    and b.visibility = 'listed'
    and b.type in ('studio', 'artist_page')
    and (auth.uid() is not null or public.artist_plan_active(p_user_id))
  order by b.type, case m.member_role
             when 'owner' then 0 when 'trainer' then 1
             when 'visiting_faculty' then 2 else 3 end, b.name;
$$;
revoke execute on function public.person_associations(uuid) from public;
grant execute on function public.person_associations(uuid) to anon, authenticated, service_role;
comment on function public.person_associations(uuid) is
  'Where a person is seated, for their public page (20 Sep 2026): listed studios and artist pages where they are Owner, Faculty, Visiting faculty or Assistant. ⚠ `staff` is left out (rule E), an unlisted business is never named, and a stranger is answered only for an ARTIST — the same gate person_teaches_at keeps.';
