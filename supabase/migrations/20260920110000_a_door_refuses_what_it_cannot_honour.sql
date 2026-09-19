-- A DOOR REFUSES WHAT IT CANNOT HONOUR (20 Sep 2026).
-- ⚠ AUTH (Rule 9): this is the door that grants a real owner seat on a studio.
--
-- Found by `rls-proof-org-team.ps1` check 4, written hours after the migration
-- it tests and run once — which is the point of writing it at all.
--
-- `set_organization_member_role(member, 'member', <a studio>)` SUCCEEDED, and
-- then quietly threw the studio away:
--
--   business_id = case when p_role = 'studio_owner' then p_business_id else null end
--
-- The stored row was never wrong — the CHECK makes naming a studio and being a
-- studio owner the same fact, and a direct INSERT of that pair is refused. What
-- was wrong is the ANSWER: a caller who said "make them a plain member of this
-- studio" was told yes and got something else. That is the same shape as a
-- field no screen reads, and only a call can find it.
--
-- One guard, and nothing else moves: same signature (so the ACL is kept by
-- `create or replace`), same body otherwise, 20260920100000's verbatim.
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
begin
  if p_role not in ('owner', 'studio_owner', 'event_team', 'member') then
    raise exception 'a team member is an owner, a studio owner, event team or a member';
  end if;
  -- ⚠ THE ADDITION (20 Sep 2026): only a studio owner owns a studio. Saying so
  -- out loud beats accepting the argument and silently dropping it.
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
comment on function public.set_organization_member_role(uuid, text, uuid) is
  'An organization labels one of its confirmed team (20 Sep 2026). ⚠ studio_owner is not a label: it writes a REAL owner seat on that studio''s business_members, and taking it away removes that seat while another owner remains. A studio may be named ONLY with studio_owner - any other label carrying one is refused rather than silently dropped (20 Sep 2026, found by rls-proof-org-team check 4).';
