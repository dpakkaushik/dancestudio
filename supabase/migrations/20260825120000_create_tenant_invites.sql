-- Step 12b (Staff invites): tenant_invites + membership management.
--
-- The prototype's settings footnote is the entire design in one line (18434):
-- "Payout approval is owner-only and can't be granted (§10.9) · attachments are
-- consent-based: invite -> accept." So an owner ASKS, the person ACCEPTS, and
-- 'owner' is never a role an invite can hand over.
--
-- The handle is an EMAIL, because email is what DanceOS authenticates on today
-- (Step 6 shipped the magic link; mobile OTP is parked at Step 26). An invite
-- therefore reaches its person two ways, and both end in the same consent:
--   1. it appears in-app for whoever signs in with that address
--      (my_pending_invites, matched on auth.users.email), and
--   2. the owner shares or shows the /join/{code} link -- the prototype's own
--      "invite by QR" arm (18435), the code being what the QR draws.
-- Possession of the link is NEVER enough on its own: accept_tenant_invite still
-- demands the signed-in email match the invite, so a link forwarded to the
-- wrong person cannot walk into a business that handles money.

create table public.tenant_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- what the desk types: who they are, and where to reach them
  name text not null check (char_length(trim(name)) between 1 and 120),
  -- normalised by invite_to_tenant; the check keeps that invariant real rather
  -- than trusting every future caller to remember it
  email text not null check (
    email = lower(trim(email))
    and char_length(email) between 5 and 254
    and position('@' in email) > 1
  ),
  -- 'owner' is absent on purpose: it cannot be granted by invite (§10.9)
  member_role text not null check (member_role in ('trainer', 'staff')),
  -- the shareable / scannable half: /join/{code}
  code text not null unique check (char_length(code) between 8 and 24),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'revoked')),
  accepted_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);

comment on table public.tenant_invites is
  'An owner asks somebody to join the business; they accept. Handle is an email (what we authenticate on); the code is the shareable /join link. Owner is never an invitable role.';

-- one live ask per person per studio: asking twice refreshes the first invite
-- instead of piling up a queue of identical asks
create unique index tenant_invites_one_pending
  on public.tenant_invites (tenant_id, email)
  where status = 'pending' and deleted_at is null;

-- the invitee's own lookup: "is anybody waiting for me?"
create index tenant_invites_email_idx
  on public.tenant_invites (email)
  where status = 'pending' and deleted_at is null;

create index tenant_invites_tenant_idx
  on public.tenant_invites (tenant_id) where deleted_at is null;

create trigger tenant_invites_set_updated_at
  before update on public.tenant_invites
  for each row execute function public.set_updated_at();

-- Row Level Security (mandatory)
alter table public.tenant_invites enable row level security;

-- The studio's own people read their own desk. No deleted_at filter, so a row
-- stays selectable by whoever just closed it (Step 3's soft-delete lesson).
--
-- There is deliberately NO public policy and NO policy for the invitee: an
-- invite carries somebody's email address, so the table is business-private.
-- The person being asked sees their own invite through the definer functions
-- below, which hand back one invite and never the list.
create policy "members read own tenant invites"
  on public.tenant_invites for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

-- No insert / update / delete policies at all: every write goes through the
-- RPCs below, which is where "only the owner asks" and "only you answer" live.

-- ── helpers ──────────────────────────────────────────────────────────────────

create or replace function public.is_tenant_owner(p_tenant_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.tenant_members m
    where m.tenant_id = p_tenant_id
      and m.user_id = auth.uid()
      and m.member_role = 'owner'
      and m.deleted_at is null
  );
$$;

revoke execute on function public.is_tenant_owner(uuid) from public, anon;
grant execute on function public.is_tenant_owner(uuid) to authenticated;

-- the caller's own sign-in address, normalised. Reveals nothing they don't
-- already know about themselves, and is how an emailed invite finds its person.
create or replace function public.my_auth_email()
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select lower(trim(u.email)) from auth.users u where u.id = auth.uid();
$$;

revoke execute on function public.my_auth_email() from public, anon;
grant execute on function public.my_auth_email() to authenticated;

-- ── the owner's side: ask, and un-ask ────────────────────────────────────────

create or replace function public.invite_to_tenant(
  p_tenant_id uuid,
  p_name text,
  p_email text,
  p_role text
) returns public.tenant_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_existing_user uuid;
  v_invite public.tenant_invites;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_tenant_owner(p_tenant_id) then
    raise exception 'only the studio owner invites people';
  end if;
  if p_role not in ('trainer', 'staff') then
    raise exception 'an invite offers trainer or staff only - owner cannot be granted';
  end if;
  if v_name = '' then
    raise exception 'who is it?';
  end if;
  if position('@' in v_email) < 2 or char_length(v_email) < 5 then
    raise exception 'that is not an email address';
  end if;

  -- already on the team? then there is nothing left to ask them.
  select u.id into v_existing_user
  from auth.users u where lower(u.email) = v_email limit 1;

  if v_existing_user is not null and exists (
    select 1 from public.tenant_members m
    where m.tenant_id = p_tenant_id
      and m.user_id = v_existing_user
      and m.deleted_at is null
  ) then
    raise exception 'they are already on your team';
  end if;

  -- asking a second time refreshes the standing ask (name / role), keeping the
  -- same code so a link already sent still works
  select * into v_invite from public.tenant_invites i
  where i.tenant_id = p_tenant_id
    and i.email = v_email
    and i.status = 'pending'
    and i.deleted_at is null;

  if v_invite.id is not null then
    update public.tenant_invites
      set name = v_name, member_role = p_role, updated_by = v_user
      where id = v_invite.id
      returning * into v_invite;
    return v_invite;
  end if;

  insert into public.tenant_invites
    (tenant_id, name, email, member_role, code, created_by, updated_by)
  values
    (p_tenant_id, v_name, v_email, p_role,
     substr(md5(gen_random_uuid()::text), 1, 10), v_user, v_user)
  returning * into v_invite;

  return v_invite;
end;
$$;

revoke execute on function public.invite_to_tenant(uuid, text, text, text) from public, anon;
grant execute on function public.invite_to_tenant(uuid, text, text, text) to authenticated;

create or replace function public.revoke_tenant_invite(p_invite_id uuid)
returns public.tenant_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_invite public.tenant_invites;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select * into v_invite from public.tenant_invites i
  where i.id = p_invite_id and i.deleted_at is null;
  if v_invite.id is null then
    raise exception 'invite not found';
  end if;
  if not public.is_tenant_owner(v_invite.tenant_id) then
    raise exception 'only the studio owner withdraws an invite';
  end if;
  if v_invite.status <> 'pending' then
    raise exception 'that invite has already been answered';
  end if;

  update public.tenant_invites
    set status = 'revoked', updated_by = v_user
    where id = v_invite.id
    returning * into v_invite;

  return v_invite;
end;
$$;

revoke execute on function public.revoke_tenant_invite(uuid) from public, anon;
grant execute on function public.revoke_tenant_invite(uuid) to authenticated;

-- ── the invited person's side: see it, and answer it ─────────────────────────

-- "is anybody waiting for me?" — matched on the address they sign in with, so
-- an invite arrives in-app without anybody copying a link around.
create or replace function public.my_pending_invites()
returns table (
  invite_id uuid,
  tenant_id uuid,
  tenant_name text,
  tenant_type text,
  member_role text,
  code text,
  invited_name text,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select i.id, i.tenant_id, t.name, t.type, i.member_role, i.code, i.name, i.created_at
  from public.tenant_invites i
  join public.tenants t on t.id = i.tenant_id
  where i.email = public.my_auth_email()
    and i.status = 'pending'
    and i.deleted_at is null
    and t.deleted_at is null
  order by i.created_at desc
  limit 20;
$$;

revoke execute on function public.my_pending_invites() from public, anon;
grant execute on function public.my_pending_invites() to authenticated;

-- What the /join/{code} screen may say. Whoever holds the code learns only who
-- is asking and for what — the address is masked, because a forwarded link must
-- not hand out somebody else's email.
create or replace function public.preview_tenant_invite(p_code text)
returns table (
  tenant_id uuid,
  tenant_name text,
  member_role text,
  invited_name text,
  status text,
  email_hint text,
  is_for_me boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    i.tenant_id,
    t.name,
    i.member_role,
    i.name,
    i.status,
    left(i.email, 1) || '***@' || split_part(i.email, '@', 2),
    i.email = public.my_auth_email()
  from public.tenant_invites i
  join public.tenants t on t.id = i.tenant_id
  where i.code = p_code
    and i.deleted_at is null
    and t.deleted_at is null;
$$;

revoke execute on function public.preview_tenant_invite(text) from public, anon;
grant execute on function public.preview_tenant_invite(text) to authenticated;

create or replace function public.accept_tenant_invite(p_code text)
returns public.tenant_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text := public.my_auth_email();
  v_invite public.tenant_invites;
  v_member public.tenant_members;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select * into v_invite from public.tenant_invites i
  where i.code = p_code and i.deleted_at is null;
  if v_invite.id is null then
    raise exception 'that invite link is not valid';
  end if;
  if v_invite.status <> 'pending' then
    raise exception 'that invite has already been answered';
  end if;
  -- consent is tied to identity, not to holding the link
  if v_invite.email is distinct from v_email then
    raise exception 'this invite was sent to a different email address';
  end if;
  if not exists (
    select 1 from public.profiles p where p.id = v_user and p.deleted_at is null
  ) then
    raise exception 'finish setting up your profile first';
  end if;

  -- a person who was removed and asked back rejoins the same seat
  insert into public.tenant_members (tenant_id, user_id, member_role, created_by, updated_by)
  values (v_invite.tenant_id, v_user, v_invite.member_role, v_user, v_user)
  on conflict (tenant_id, user_id) do update
    set member_role = excluded.member_role,
        deleted_at = null,
        updated_by = v_user
  returning * into v_member;

  update public.tenant_invites
    set status = 'accepted', accepted_by = v_user, accepted_at = now(), updated_by = v_user
    where id = v_invite.id;

  return v_member;
end;
$$;

revoke execute on function public.accept_tenant_invite(text) from public, anon;
grant execute on function public.accept_tenant_invite(text) to authenticated;

create or replace function public.decline_tenant_invite(p_code text)
returns public.tenant_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_invite public.tenant_invites;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select * into v_invite from public.tenant_invites i
  where i.code = p_code and i.deleted_at is null;
  if v_invite.id is null then
    raise exception 'that invite link is not valid';
  end if;
  if v_invite.status <> 'pending' then
    raise exception 'that invite has already been answered';
  end if;
  if v_invite.email is distinct from public.my_auth_email() then
    raise exception 'this invite was sent to a different email address';
  end if;

  update public.tenant_invites
    set status = 'declined', updated_by = v_user
    where id = v_invite.id
    returning * into v_invite;

  return v_invite;
end;
$$;

revoke execute on function public.decline_tenant_invite(text) from public, anon;
grant execute on function public.decline_tenant_invite(text) to authenticated;

-- ── managing the people already on the team ──────────────────────────────────

create or replace function public.set_member_role(
  p_tenant_id uuid,
  p_user_id uuid,
  p_role text
) returns public.tenant_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_member public.tenant_members;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_tenant_owner(p_tenant_id) then
    raise exception 'only the studio owner changes what somebody may do';
  end if;
  if p_role not in ('trainer', 'staff') then
    raise exception 'a member may be trainer or staff - owner cannot be granted';
  end if;

  select * into v_member from public.tenant_members m
  where m.tenant_id = p_tenant_id and m.user_id = p_user_id and m.deleted_at is null;
  if v_member.id is null then
    raise exception 'they are not on your team';
  end if;
  -- the owner's own seat is not editable here: payout approval rides on it
  if v_member.member_role = 'owner' then
    raise exception 'an owner''s role cannot be changed here';
  end if;

  update public.tenant_members
    set member_role = p_role, updated_by = v_user
    where id = v_member.id
    returning * into v_member;

  return v_member;
end;
$$;

revoke execute on function public.set_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;

-- Removing somebody takes their POWERS with them, in one act. Step 11's
-- can_run_register_for_class has a second branch that reads a confirmed
-- assistant claim WITHOUT re-checking membership -- so a removed assistant who
-- still held an attendance claim would keep running the register. Closing their
-- live claims here is what makes "removed" actually mean removed.
create or replace function public.remove_tenant_member(
  p_tenant_id uuid,
  p_user_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_member public.tenant_members;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_tenant_owner(p_tenant_id) then
    raise exception 'only the studio owner removes somebody';
  end if;

  select * into v_member from public.tenant_members m
  where m.tenant_id = p_tenant_id and m.user_id = p_user_id and m.deleted_at is null;
  if v_member.id is null then
    raise exception 'they are not on your team';
  end if;
  -- refusing every owner row covers "not yourself" and "never the last owner"
  -- in one rule, so a business can never end up with nobody who owns it
  if v_member.member_role = 'owner' then
    raise exception 'an owner cannot be removed from their own business';
  end if;

  update public.tenant_members
    set deleted_at = now(), updated_by = v_user
    where id = v_member.id;

  -- their claims on this studio's classes go with the seat
  update public.class_claims
    set deleted_at = now(), updated_by = v_user
    where tenant_id = p_tenant_id
      and user_id = p_user_id
      and deleted_at is null;
end;
$$;

revoke execute on function public.remove_tenant_member(uuid, uuid) from public, anon;
grant execute on function public.remove_tenant_member(uuid, uuid) to authenticated;
