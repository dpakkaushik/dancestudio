-- ─────────────────────────────────────────────────────────────────────────────
-- THE FOUNDER CAN TAKE IT BACK (30 Sep 2026)
--
-- The user, in one message: "main person who created the studio should be able
-- to remove the other owner. same applies for crew when 2 or more crew leaders
-- are there."
--
-- ⚠⚠ TWO DEADLOCKS, AND THE SECOND ONE IS NOT THE SHAPE THE ASK ASSUMED.
--
-- 1. A BUSINESS CAN HAVE SEVERAL OWNERS AND NOBODY CAN REMOVE ONE.
--    `set_member_role` has handed the owner seat out from a studio's own desk
--    since 20 Sep 2026 (R39), and `remove_business_member` refuses EVERY owner
--    row: "an owner cannot be removed from their own business" — one rule that
--    covered "not yourself" and "never the last owner" at a time when there
--    could only ever be one. So the moment a studio names a second owner,
--    neither can remove the other and the seat can never be taken back.
--
-- 2. A CREW CANNOT HAVE TWO LEADERS AT ALL — so "when 2 or more crew leaders
--    are there" describes a state this database cannot reach.
--    `set_crew_member_role(_, 'leader')` is a HAND-OVER: it demotes every
--    existing leader row to 'member' and moves `crews.leader_id` in the same
--    statement, and `remove_crew_member` refuses anybody whose role is 'leader'.
--    ⚠ What IS true is worse, and is the real equivalent of (1): handing a crew
--    over is a ONE-WAY DOOR. The founder becomes a plain member, `is_crew_leader`
--    answers false for them, and they can never take it back, remove the new
--    leader, or hand it on. `reclaim_crew` is that door made two-way.
--
-- ⚠ WHO "THE MAIN PERSON WHO CREATED IT" IS, and it is not the same column in
--   both halves, because the two tables do not carry the same history:
--   · A CREW has `crews.created_by`, stamped at creation and never moved by a
--     hand-over (only `leader_id` moves), so it names the founder exactly.
--   · A BUSINESS has `businesses.created_by` too — and it is NOT safe to use.
--     `scripts/shift-studio-owner.js` moves a studio between people by rewriting
--     the owner seat's `user_id`, and the 26 Sep organization retirement
--     soft-deleted the accounts that created many live studios. So `created_by`
--     can name somebody who is no longer an owner, or no longer exists, and a
--     studio whose founder is gone would have NOBODY able to remove an owner —
--     the very deadlock this migration exists to end.
--     The PRINCIPAL OWNER is the oldest live owner SEAT instead. At birth that
--     is the creator (`create_business_with_owner` makes exactly one), it
--     survives a shift (the shift moves `user_id` on that same row, so the new
--     holder inherits the seat they were handed), and it can never strand: if
--     the principal steps down, the next-oldest becomes principal.
--
-- ⚠⚠ AND NOT ONE LIVE FUNCTION BODY IS RE-TYPED, which is this file's own
--   hardest-learned rule (28 Sep: "I re-typed six live function bodies and got
--   five of them wrong" — a lost join, two loosened regexes, four reworded
--   errors). `remove_business_member` is UNTOUCHED. The new door demotes and
--   then calls it, so the seat removal, the `class_people` cascade that goes
--   with it and every audit column stay exactly whatever that one function
--   does — and if the removal refuses, the transaction takes the demotion back
--   with it. ONE removal path, not two that can drift.
--
-- Nothing is backfilled. No table, no column, no policy, no grant on anything
-- that already exists.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. who the principal owner of a business is ──────────────────────────────
create or replace function public.business_principal_owner(p_business_id uuid)
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select m.user_id
  from public.business_members m
  where m.business_id = p_business_id
    and m.member_role = 'owner'
    and m.deleted_at is null
  -- `id` only breaks a tie between two seats written in the same instant, which
  -- `now()` inside one transaction makes possible (27 Sep's own finding)
  order by m.created_at asc, m.id asc
  limit 1;
$$;

comment on function public.business_principal_owner(uuid) is
  'The oldest live owner seat — the person who created the business, or whoever was handed that seat since. Used only to decide who may remove ANOTHER owner.';

revoke execute on function public.business_principal_owner(uuid) from public, anon;
grant execute on function public.business_principal_owner(uuid) to authenticated;

-- ── 2. the principal owner removes another owner ─────────────────────────────
create or replace function public.remove_business_owner(
  p_business_id uuid,
  p_user_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_member public.business_members;
  v_owners integer;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select * into v_member from public.business_members m
   where m.business_id = p_business_id and m.user_id = p_user_id and m.deleted_at is null;
  if v_member.id is null then
    raise exception 'they are not on your team';
  end if;

  -- this door is for OWNERS; everybody else is `remove_business_member`'s, and
  -- pointing them at it keeps one rule in one place
  if v_member.member_role <> 'owner' then
    raise exception 'they are not an owner — remove them from the team desk';
  end if;

  if p_user_id = v_user then
    raise exception 'you cannot remove yourself - make somebody else an owner first';
  end if;

  if public.business_principal_owner(p_business_id) is distinct from v_user then
    raise exception 'only the person who set this business up can remove another owner';
  end if;

  -- the guard `set_member_role` already keeps, restated here because this door
  -- reaches the same seat by a different route
  select count(*) into v_owners from public.business_members m
   where m.business_id = p_business_id and m.member_role = 'owner' and m.deleted_at is null;
  if v_owners <= 1 then
    raise exception 'this is the only owner - make somebody else an owner first';
  end if;

  -- ⚠ DEMOTE, THEN REUSE THE ONE REMOVAL PATH. `remove_business_member` refuses
  -- an owner by design and that refusal is KEPT — it is what stops a plain
  -- owner-on-owner removal — so the seat is stepped down to `staff` first and
  -- the existing door does the rest: the soft delete, `updated_by`, and the
  -- `class_people` rows that go with the seat (25 Aug's hardening, which nothing
  -- here re-implements). A refusal inside it rolls this demotion back with it.
  update public.business_members
     set member_role = 'staff',
         can_attendance = false,
         can_refunds = false,
         updated_by = v_user
   where id = v_member.id;

  perform public.remove_business_member(p_business_id, p_user_id);
end;
$$;

comment on function public.remove_business_owner(uuid, uuid) is
  'The principal owner (the oldest live owner seat) removes ANOTHER owner. Never themselves, never the last owner. Demotes and then calls remove_business_member, so there is one removal path.';

revoke execute on function public.remove_business_owner(uuid, uuid) from public, anon;
grant execute on function public.remove_business_owner(uuid, uuid) to authenticated;

-- ── 3. the crew's founder takes it back ──────────────────────────────────────
create or replace function public.reclaim_crew(p_crew_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_crew public.crews;
  v_mine public.crew_members;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select * into v_crew from public.crews c where c.id = p_crew_id and c.deleted_at is null;
  if not found then
    raise exception 'crew not found';
  end if;

  if v_crew.created_by is distinct from v_user then
    raise exception 'only the person who created this crew can take it back';
  end if;

  if v_crew.leader_id = v_user then
    raise exception 'you already lead this crew';
  end if;

  -- ⚠ THEY HAVE TO STILL BE ON IT. A founder who left, or was removed by the
  -- person they handed it to, does not get to walk back in — `created_by` is a
  -- record of who started it, not a standing key to it.
  select * into v_mine from public.crew_members m
   where m.crew_id = p_crew_id and m.user_id = v_user
     and m.status = 'confirmed' and m.deleted_at is null;
  if not found then
    raise exception 'you are not on this crew any more';
  end if;

  -- the same two statements `set_crew_member_role` uses to hand a crew over,
  -- pointing the other way: exactly one 'leader' row at any moment
  update public.crew_members set role = 'member', updated_by = v_user
   where crew_id = p_crew_id and role = 'leader' and deleted_at is null;
  update public.crew_members set role = 'leader', updated_by = v_user
   where id = v_mine.id;
  update public.crews set leader_id = v_user, updated_by = v_user
   where id = p_crew_id;
end;
$$;

comment on function public.reclaim_crew(uuid) is
  'The crew''s founder (crews.created_by) takes the crew back from whoever they handed it to. Handing over was a one-way door until this. They must still be a confirmed member.';

revoke execute on function public.reclaim_crew(uuid) from public, anon;
grant execute on function public.reclaim_crew(uuid) to authenticated;
