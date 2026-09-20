-- AN ORGANIZATION FOLLOWS (20 Sep 2026)
--
-- The user: *"Organization and Studio still dont have Following section in
-- profile and home."* They are right, and until now there was nothing for that
-- section to count: R9 (8 Sep 2026) made an organization neither follow nor be
-- followed, and 20260919120000 opened only the second half — a PUBLIC
-- organization became followable while all three doors still refused it as the
-- CALLER, in three different sentences:
--
--   set_follow        'an organization does not follow — people follow its studios'
--   set_person_follow 'an organization does not follow people'
--   set_crew_follow   'an organization does not follow — people follow'
--
-- Asked which way to take it, the user chose to let an organization really
-- follow rather than draw a figure that could only ever read 0. So the three
-- refusals go, and nothing else moves.
--
-- ⚠ WHAT THIS DOES **NOT** TOUCH, said out loud because R11 is a wider rule than
-- this one clause. `guard_person_only` (20260909120000, extended 20260910120000)
-- keeps an organization out of the PERSON'S SEAT on eight tables —
-- class_bookings, orders, event_bookings, crews, crew_members, enquiries,
-- class_people and a non-owner business_members row. `follows` was never one of
-- them: the refusal lived in the RPC bodies alone, which is why this is three
-- `create or replace`s and no trigger change. An organization still books
-- nothing, dances in nothing and teaches nothing. It follows.
--
-- ⚠ A STUDIO STILL CANNOT FOLLOW, and that is not an omission. `follows.follower_id`
-- references `profiles`; a studio is a `businesses` row and has nothing to
-- follow WITH. Its pages print the following of the account that owns it,
-- labelled as that owner's, which is the honest reading of "who this studio
-- follows" without inventing a column.
--
-- Every other rule each door keeps is untouched and is why the bodies below are
-- copied from `pg_get_functiondef` rather than re-typed (this file's own
-- standing lesson — a re-typed body is one that can differ, and it has differed
-- five ways before now):
--   · you must have finished onboarding;
--   · a business must be LISTED and must not be one you belong to;
--   · a person must exist, must not be you, and an organization target must be
--     PUBLIC (`org_is_public`);
--   · a crew must exist and must not be one you lead or are confirmed in.
--
-- Same signatures, so `create or replace` KEEPS the ACL — no grant is restated
-- and none can be widened by accident (the 16 Sep lesson: a DROPPED function
-- comes back with Supabase's defaults, anon included; a replaced one does not).
-- No policy, no column, no row, no trigger. anon's executable set is unchanged.

-- ── a business ───────────────────────────────────────────────────────────────
create or replace function public.set_follow(p_business_id uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_business public.businesses;
  v_live uuid;
  v_count bigint;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user and p.deleted_at is null) then
    raise exception 'finish onboarding before following';
  end if;
  -- an organization follows since 20 Sep 2026 (the user's ask); it is still not
  -- a person anywhere guard_person_only reaches

  select * into v_business from public.businesses t
    where t.id = p_business_id and t.deleted_at is null;
  if not found then
    raise exception 'business not found';
  end if;
  -- a business that is not open to the public cannot be followed from outside
  if v_business.visibility <> 'listed' then
    raise exception 'this business is not open to the public';
  end if;
  -- you are on this team: a member's follow would count the business's own people
  if exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id and m.user_id = v_user and m.deleted_at is null
  ) then
    raise exception 'you already belong to this business';
  end if;

  select f.id into v_live from public.follows f
    where f.follower_id = v_user and f.business_id = p_business_id and f.deleted_at is null;

  if p_on and v_live is null then
    insert into public.follows (follower_id, business_id, created_by, updated_by)
    values (v_user, p_business_id, v_user, v_user);
  elsif not p_on and v_live is not null then
    update public.follows
      set deleted_at = now(), updated_by = v_user
      where id = v_live;
  end if;

  select count(*) into v_count from public.follows f
    where f.business_id = p_business_id and f.deleted_at is null;

  return jsonb_build_object('following', p_on, 'followers', v_count);
end;
$function$;

comment on function public.set_follow(uuid, boolean) is
  'Follow (true) or unfollow (false) a LISTED business you do not belong to. Idempotent. An organization may follow since 20 Sep 2026 — the owner of a studio still cannot follow that studio, because they belong to it.';

-- ── a person, or a public organization ───────────────────────────────────────
create or replace function public.set_person_follow(p_user_id uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
  -- an organization follows since 20 Sep 2026 (the user's ask)
  if p_user_id = v_user then
    raise exception 'you cannot follow yourself';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id and p.deleted_at is null) then
    raise exception 'that person is not on DanceOS';
  end if;
  -- an organization can be followed since 19 Sep 2026 — one that is PUBLIC
  if exists (select 1 from public.profiles p where p.id = p_user_id and p.role = 'org')
     and not public.org_is_public(p_user_id) then
    raise exception 'this organization is not open to the public';
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
$function$;

comment on function public.set_person_follow(uuid, boolean) is
  'Follow (true) or unfollow (false) a person, or a PUBLIC organization. Idempotent; refuses yourself, somebody not on DanceOS and a private organization. An organization may follow since 20 Sep 2026.';

-- ── a crew ───────────────────────────────────────────────────────────────────
create or replace function public.set_crew_follow(p_crew_id uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_crew public.crews;
  v_live uuid;
  v_count bigint;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user and p.deleted_at is null) then
    raise exception 'finish onboarding before following';
  end if;
  -- an organization follows since 20 Sep 2026 (the user's ask); it still cannot
  -- LEAD or JOIN a crew — guard_person_only keeps both, and this is neither
  select * into v_crew from public.crews c where c.id = p_crew_id and c.deleted_at is null;
  if not found then
    raise exception 'crew not found';
  end if;
  -- you are the crew: its leader, or a confirmed member
  if v_crew.leader_id = v_user or exists (
    select 1 from public.crew_members m
    where m.crew_id = p_crew_id and m.user_id = v_user and m.status = 'confirmed' and m.deleted_at is null
  ) then
    raise exception 'you are in this crew';
  end if;

  select f.id into v_live from public.follows f
    where f.follower_id = v_user and f.crew_id = p_crew_id and f.deleted_at is null;

  if p_on and v_live is null then
    insert into public.follows (follower_id, crew_id, created_by, updated_by)
    values (v_user, p_crew_id, v_user, v_user);
  elsif not p_on and v_live is not null then
    update public.follows set deleted_at = now(), updated_by = v_user where id = v_live;
  end if;

  select count(*) into v_count from public.follows f
    where f.crew_id = p_crew_id and f.deleted_at is null;

  return jsonb_build_object('following', p_on, 'followers', v_count);
end;
$function$;

comment on function public.set_crew_follow(uuid, boolean) is
  'Follow (true) or unfollow (false) a crew you are not in. Idempotent; refuses the crew''s leader and its confirmed members. An organization may follow since 20 Sep 2026.';
