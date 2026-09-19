-- ============================================================================
-- 19 Sep 2026 — AN ORGANIZATION HAS A TEAM, AND ITS PAGE NAMES AN OWNER.
--
-- The user, on the profile-page list: "Organization: Owner (one of the users
-- added from team in organizations)", and when told an organization is one
-- login with no team table: "You add a user or artist in Team section for
-- organization to label them as owner."
--
-- So: `organization_members` — the people an ORGANIZATION account names as its
-- team, each ASKED and CONFIRMED the way every roster in this app is (a class
-- ask, a team invite, a crew ask: nobody is put on a public page without
-- saying yes). Two roles, `owner` and `member`, which are LABELS — a member of
-- an organization's team gains no power over its studios, its money or its
-- events by being here; those stay with the organization's one login and each
-- studio's own team desk. What the label does is put a person's name and face
-- under OWNER on `/org/{id}`, and let the organization's Team tile open a real
-- desk instead of the shrug.
--
-- Who reads what: the organization reads its whole desk (asked, confirmed,
-- rejected); a person reads every row that names them (the ask waiting on
-- them, the seat they hold); ANYONE — signed out included — reads the CONFIRMED
-- rows of a PUBLIC organization, through the policy and through the one definer
-- read the page uses (`public_organization_team`). A private organization's
-- team is nobody else's. No insert / update / delete policy anywhere: five
-- functions are the only doors. The audit columns are plain uuids — no foreign
-- key to auth.users (the 19 Sep lesson: that FK made a crew leader undeletable).
--
-- ⚠ Rule 9: what widens for a stranger is a public organization's confirmed
-- team — name, picture, the label, whether they hold the Artist plan — each a
-- person who said yes to being on that page.
-- ============================================================================

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.profiles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  status text not null default 'asked' check (status in ('asked', 'confirmed', 'rejected')),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);
comment on table public.organization_members is
  'The people an organization account names as its team (19 Sep 2026): asked -> confirmed like every roster; owner | member are LABELS for the public page, not powers.';

create unique index if not exists organization_members_live_pair on public.organization_members (org_id, user_id) where deleted_at is null;
create index if not exists organization_members_by_org on public.organization_members (org_id, status, sort) where deleted_at is null;
create index if not exists organization_members_by_user on public.organization_members (user_id, status) where deleted_at is null;

drop trigger if exists organization_members_set_updated_at on public.organization_members;
create trigger organization_members_set_updated_at
  before update on public.organization_members
  for each row execute function public.set_updated_at();

alter table public.organization_members enable row level security;

-- a new table arrives with Supabase's DEFAULT privileges — ALL to anon and
-- authenticated (the 19 Sep dry-run finding): a policy is not a grant, and a
-- grant is not a policy. Reads only, and the policies decide which rows.
revoke all on public.organization_members from public, anon, authenticated;
grant select on public.organization_members to anon, authenticated;

drop policy if exists "an organization reads its own team" on public.organization_members;
create policy "an organization reads its own team" on public.organization_members
  for select to authenticated
  using (org_id = (select auth.uid()));

drop policy if exists "people read their own organization rows" on public.organization_members;
create policy "people read their own organization rows" on public.organization_members
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "anyone reads a public organization's confirmed team" on public.organization_members;
create policy "anyone reads a public organization's confirmed team" on public.organization_members
  for select to anon, authenticated
  using (deleted_at is null and status = 'confirmed' and public.org_is_public(org_id));

-- ── the doors ────────────────────────────────────────────────────────────────

-- the caller as an ORGANIZATION account, or a refusal in words
create or replace function public.assert_caller_is_organization()
returns uuid
language plpgsql
stable
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
    raise exception 'only an organization has a team here';
  end if;
  return v_user;
end;
$$;
revoke execute on function public.assert_caller_is_organization() from public, anon, authenticated;

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
  if p_role not in ('owner', 'member') then
    raise exception 'a team member is an owner or a member';
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
revoke execute on function public.ask_organization_member(uuid, text) from public, anon;
grant execute on function public.ask_organization_member(uuid, text) to authenticated, service_role;
comment on function public.ask_organization_member(uuid, text) is
  'An organization asks a person onto its team as owner or member (19 Sep 2026). Asked, not added: the person confirms from their Inbox.';

create or replace function public.respond_to_organization_ask(p_member_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.organization_members;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_row from public.organization_members m where m.id = p_member_id and m.deleted_at is null;
  if not found or v_row.user_id <> v_user then
    raise exception 'request not found';
  end if;
  if v_row.status <> 'asked' then
    raise exception 'this request was already answered';
  end if;
  update public.organization_members
    set status = case when p_accept then 'confirmed' else 'rejected' end, updated_by = v_user
    where id = p_member_id;
end;
$$;
revoke execute on function public.respond_to_organization_ask(uuid, boolean) from public, anon;
grant execute on function public.respond_to_organization_ask(uuid, boolean) to authenticated, service_role;

create or replace function public.withdraw_organization_ask(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.assert_caller_is_organization();
  v_row public.organization_members;
begin
  select * into v_row from public.organization_members m where m.id = p_member_id and m.deleted_at is null;
  if not found or v_row.org_id <> v_org then
    raise exception 'request not found';
  end if;
  if v_row.status <> 'asked' then
    raise exception 'only an unanswered ask can be withdrawn';
  end if;
  update public.organization_members set deleted_at = now(), updated_by = v_org where id = p_member_id;
end;
$$;
revoke execute on function public.withdraw_organization_ask(uuid) from public, anon;
grant execute on function public.withdraw_organization_ask(uuid) to authenticated, service_role;

-- the organization removes, or the person leaves
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
  update public.organization_members set deleted_at = now(), updated_by = v_user where id = p_member_id;
end;
$$;
revoke execute on function public.remove_organization_member(uuid) from public, anon;
grant execute on function public.remove_organization_member(uuid) to authenticated, service_role;

-- the LABEL: owner or member, on a confirmed seat
create or replace function public.set_organization_member_role(p_member_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.assert_caller_is_organization();
  v_row public.organization_members;
begin
  if p_role not in ('owner', 'member') then
    raise exception 'a team member is an owner or a member';
  end if;
  select * into v_row from public.organization_members m where m.id = p_member_id and m.deleted_at is null;
  if not found or v_row.org_id <> v_org then
    raise exception 'member not found';
  end if;
  if v_row.status <> 'confirmed' then
    raise exception 'they have not said yes yet';
  end if;
  update public.organization_members set role = p_role, updated_by = v_org where id = p_member_id;
end;
$$;
revoke execute on function public.set_organization_member_role(uuid, text) from public, anon;
grant execute on function public.set_organization_member_role(uuid, text) to authenticated, service_role;

-- ── the public read the page draws: owners first, then the rest ──────────────
create or replace function public.public_organization_team(p_org_id uuid)
returns table(member_id uuid, user_id uuid, role text, full_name text, photo_path text, city text, is_artist boolean, sort integer)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.user_id, m.role, p.full_name, p.profile_photo_path, p.city,
         public.artist_plan_active(p.id) as is_artist, m.sort
  from public.organization_members m
  join public.profiles p on p.id = m.user_id and p.deleted_at is null and p.suspended_at is null
  where m.org_id = p_org_id and m.status = 'confirmed' and m.deleted_at is null
    and public.org_is_public(p_org_id)
  order by (m.role = 'owner') desc, m.sort, m.created_at;
$$;
revoke execute on function public.public_organization_team(uuid) from public;
grant execute on function public.public_organization_team(uuid) to anon, authenticated, service_role;
comment on function public.public_organization_team(uuid) is
  'A public organization''s confirmed team for its page (19 Sep 2026): owners first, each a name, a picture and whether they hold the Artist plan; empty for a private organization.';

-- ── the notifications — where the fact happens (Step 24's rule) ──────────────
create or replace function public.notify_organization_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_name text;
  v_who text;
begin
  select p.full_name into v_org_name from public.profiles p where p.id = new.org_id;
  select p.full_name into v_who from public.profiles p where p.id = new.user_id;
  if tg_op = 'INSERT' and new.status = 'asked' then
    perform public.notify(new.user_id, 'people',
      coalesce(v_org_name, 'An organization') || ' wants you on its team as ' || new.role,
      'Its public page names you — confirm it in your Inbox.', '/inbox');
  elsif tg_op = 'UPDATE' and old.status = 'asked' and new.status in ('confirmed', 'rejected') then
    perform public.notify(new.org_id, 'people',
      coalesce(v_who, 'Somebody') || (case new.status when 'confirmed' then ' joined your team' else ' said no to your team' end),
      null, '/business/team');
  end if;
  return null;
end;
$$;
revoke execute on function public.notify_organization_member() from public, anon, authenticated;
drop trigger if exists organization_members_notify on public.organization_members;
create trigger organization_members_notify
  after insert or update of status on public.organization_members
  for each row execute function public.notify_organization_member();
