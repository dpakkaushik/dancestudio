-- A GRANT REMEMBERS WHAT IT REPLACED (20 Sep 2026)
--
-- The user, on "relabelling away from Studio owner silently takes the seat back":
-- "Fix in best way." Saying it out loud in the toast was half the fix. This is the
-- other half, and it is the part that loses data.
--
-- ⚠ Rule 9: this is the door that hands out a REAL OWNER SEAT on a studio.
--
-- WHAT IS WRONG TODAY. `set_organization_member_role` grants the seat by UPDATING
-- whatever `business_members` row that person already has on that studio:
--
--     update public.business_members set member_role = 'owner', deleted_at = null ...
--
-- which is right - it is the only way to avoid seating somebody twice, since that
-- table has no unique index on (business_id, user_id) for an ON CONFLICT to target.
-- But the REVOKE half assumes the grant created the row, and soft-deletes it:
--
--     update public.business_members set deleted_at = now() ...
--
-- So a studio's FACULTY who is named Studio owner and later moved to Event team
-- does not go back to being faculty - THEY FALL OFF THE STUDIO'S TEAM ALTOGETHER.
-- Their classes, their register and their pay history are all still there; what is
-- gone is the seat that let them reach any of it, and nothing on any screen said a
-- second thing had happened. An organization relabelling somebody on its own page
-- has no reason to expect it to end a studio's employment.
--
-- THE FIX: the grant writes down what it overwrote, and the revoke puts it back.
-- `organization_members.prior_member_role` is null when the grant CREATED the seat
-- - and then the revoke still takes the whole row away, which is correct, because
-- the seat only ever existed as the label's shadow.
--
-- Nothing else moves: same signature, so `create or replace` keeps the ACL, and
-- the four labels, the checks and the never-the-last-owner rule are 20260920110000's
-- body verbatim with the two blocks above changed.

alter table public.organization_members
  add column if not exists prior_member_role text;

comment on column public.organization_members.prior_member_role is
  'What this person''s business_members seat said before a studio_owner grant overwrote it. Null means the grant created the seat, so revoking it takes the whole seat away. Set and cleared only by set_organization_member_role.';

create or replace function public.set_organization_member_role(p_member_id uuid, p_role text, p_business_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.assert_caller_is_organization();
  v_row public.organization_members;
  v_owners integer;
  v_seat public.business_members;
  v_prior text := null;
begin
  if p_role not in ('owner', 'studio_owner', 'event_team', 'member') then
    raise exception 'a team member is an owner, a studio owner, event team or a member';
  end if;
  -- ⚠ only a studio owner owns a studio. Saying so out loud beats accepting the
  -- argument and silently dropping it (20260920110000).
  if p_role <> 'studio_owner' and p_business_id is not null then
    raise exception 'only a studio owner names a studio';
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
    select * into v_seat from public.business_members m
     where m.business_id = p_business_id and m.user_id = v_row.user_id;
    if found then
      -- ⚠ REMEMBER WHAT IS BEING OVERWRITTEN, so moving them off this label can
      -- put them back rather than ending their seat. A LIVE non-owner seat is the
      -- only thing worth remembering: an already-deleted row is not a seat, and an
      -- owner who is already an owner had nothing taken from them.
      if v_seat.deleted_at is null and v_seat.member_role <> 'owner' then
        v_prior := v_seat.member_role;
      end if;
      update public.business_members
         set member_role = 'owner', deleted_at = null, updated_by = v_org
       where business_id = p_business_id and user_id = v_row.user_id;
    else
      insert into public.business_members (business_id, user_id, member_role, created_by, updated_by)
      values (p_business_id, v_row.user_id, 'owner', v_org, v_org);
    end if;
  end if;

  -- MOVING OFF studio_owner takes the seat back, but never the last owner - and
  -- PUTS BACK whatever the grant overwrote rather than ending the seat outright.
  if v_row.role = 'studio_owner' and v_row.business_id is not null
     and (p_role <> 'studio_owner' or p_business_id is distinct from v_row.business_id) then
    select count(*) into v_owners from public.business_members m
     where m.business_id = v_row.business_id and m.member_role = 'owner' and m.deleted_at is null;
    if v_owners > 1 then
      if v_row.prior_member_role is not null then
        update public.business_members
           set member_role = v_row.prior_member_role, updated_by = v_org
         where business_id = v_row.business_id and user_id = v_row.user_id
           and member_role = 'owner' and deleted_at is null;
      else
        update public.business_members
           set deleted_at = now(), updated_by = v_org
         where business_id = v_row.business_id and user_id = v_row.user_id
           and member_role = 'owner' and deleted_at is null;
      end if;
    end if;
  end if;

  update public.organization_members
     set role = p_role,
         business_id = case when p_role = 'studio_owner' then p_business_id else null end,
         prior_member_role = case when p_role = 'studio_owner' then v_prior else null end,
         updated_by = v_org
   where id = p_member_id;
end;
$$;

comment on function public.set_organization_member_role(uuid, text, uuid) is
  'Relabel a confirmed organization team member. studio_owner names one of this organization''s studios and grants a REAL owner seat on it; moving off it restores whatever seat the grant overwrote (prior_member_role), or ends the seat when the grant created it, and never removes the last owner.';
