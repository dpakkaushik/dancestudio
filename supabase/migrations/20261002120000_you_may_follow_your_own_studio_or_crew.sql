-- YOU MAY FOLLOW YOUR OWN STUDIO OR CREW (2 Oct 2026, the user: "can remove
-- the rule for not following your own crew or studio from your user / artist
-- profiles").
--
-- Two refusals, one block each, and nothing else:
--   · set_follow       — "you already belong to this business": a member of a
--                        business's team (any seat) could not follow it;
--   · set_crew_follow  — "you are in this crew": the leader or a confirmed
--                        member could not follow it.
-- Both were written so a business's or a crew's own people would not inflate
-- its follower count. The user has decided that following is the person's own
-- act, from their own profile, whatever seat they also hold.
--
-- ⚠ CATALOG-DRIVEN, NOT RE-TYPED (the 28 Sep lesson: five of six re-typed live
-- bodies were wrong). Each function's live text is read with
-- `pg_get_functiondef`, the one block is cut out — asserted to occur EXACTLY
-- once, or the whole migration aborts — and the result is executed as the same
-- `create or replace`. Same signature, so not one grant moves.
--
-- ⚠ WHAT DOES NOT MOVE: the "not open to the public" refusal (an unlisted
-- studio still cannot be followed, yours included), "finish onboarding", the
-- count functions, every policy, every grant. No row changes.

do $$
declare
  v_def text;
  v_new text;
  v_block text;
begin
  -- 1 · set_follow
  select pg_get_functiondef('public.set_follow(uuid,boolean)'::regprocedure) into v_def;
  v_block := $b$  -- you are on this team: a member's follow would count the business's own people
  if exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id and m.user_id = v_user and m.deleted_at is null
  ) then
    raise exception 'you already belong to this business';
  end if;
$b$;
  v_block := replace(v_block, chr(13), '');
  if (length(v_def) - length(replace(v_def, v_block, ''))) / length(v_block) <> 1 then
    raise exception 'set_follow: the member refusal block was not found exactly once';
  end if;
  v_new := replace(v_def, v_block, $b$  -- a member may follow their own business from their own profile (2 Oct 2026)
$b$);
  execute v_new;

  -- 2 · set_crew_follow
  select pg_get_functiondef('public.set_crew_follow(uuid,boolean)'::regprocedure) into v_def;
  v_block := $b$  -- you are the crew: its leader, or a confirmed member
  if v_crew.leader_id = v_user or exists (
    select 1 from public.crew_members m
    where m.crew_id = p_crew_id and m.user_id = v_user and m.status = 'confirmed' and m.deleted_at is null
  ) then
    raise exception 'you are in this crew';
  end if;
$b$;
  v_block := replace(v_block, chr(13), '');
  if (length(v_def) - length(replace(v_def, v_block, ''))) / length(v_block) <> 1 then
    raise exception 'set_crew_follow: the member refusal block was not found exactly once';
  end if;
  v_new := replace(v_def, v_block, $b$  -- its leader and its members may follow it from their own profile (2 Oct 2026)
$b$);
  execute v_new;
end $$;

comment on function public.set_follow(uuid, boolean) is
  'Follow or unfollow a business (idempotent). Refuses an unlisted business; since 2 Oct 2026 a member of its team may follow it.';
comment on function public.set_crew_follow(uuid, boolean) is
  'Follow or unfollow a crew (idempotent). Since 2 Oct 2026 its leader and members may follow it.';
