-- A FOLLOW COUNTS ONLY WHAT IS STILL THERE (29 Sep 2026)
--
-- The user: "fix follow following list when it opens shows inaccurate details
-- and counts."
--
-- ⚠⚠ THE NUMBER AND THE LIST ARE TWO READS OF ONE FACT, AND THEY DISAGREED.
-- Soft delete is this app's rule (Rule 3), so deleting a studio or an account
-- leaves every `follows` row naming it live and pointing at a row carrying a
-- `deleted_at`. All three count functions count FOLLOW ROWS and look at the
-- follow's own `deleted_at` and nothing else — so a business whose followers
-- include six deleted accounts prints six followers it does not have, and the
-- sheet under the figure (which does read the person) draws fewer rows than the
-- header says. Measured on production the day this was written:
--
--     29 live follows · 8 naming a deleted business · 6 made by a deleted person
--
-- That is the prototype's own rule broken in the app's own numbers: "a number
-- and the list behind it are THE SAME NUMBER … the grid used to say 86 students
-- and open a list of five, which is how a figure stops being believed" (9950).
--
-- ⚠ THE APP SIDE LANDS IN THE SAME PUSH (`repositories/follows.ts`). Filtering
-- in one of the two places alone would widen the disagreement rather than close
-- it, which is why the migration and the reads are one change.
--
-- WHAT MOVES: three function BODIES, each `create or replace` with an
-- UNCHANGED signature — so no ACL is restated, no grant moves, anon's
-- executable set is untouched and not one policy is added, dropped or altered.
-- No table, no column, no row.
--
-- ⚠ WHAT IS DELIBERATELY NOT DONE: the stale rows themselves are left alone.
-- A follow of a deleted studio is a record of something that happened, and this
-- app does not rewrite history to make a figure tidy (Rule 9's neighbour: a
-- ledger does not forget). What changes is that nothing COUNTS them any more.
-- If the row is ever wanted gone it is a sweep, with its own approval.

begin;

-- ── 1 · A BUSINESS'S FOLLOWERS ─────────────────────────────────────────────
-- The business half was already right: the outer query drops a deleted one.
-- What it never checked is the FOLLOWER, which is where all six live cases are.
create or replace function public.follower_counts(p_business_ids uuid[])
returns table(business_id uuid, followers bigint)
language sql
stable
security definer
set search_path to ''
as $function$
  select t.id as business_id,
         (select count(*) from public.follows f
            join public.profiles p on p.id = f.follower_id and p.deleted_at is null
            where f.business_id = t.id and f.deleted_at is null) as followers
  from public.businesses t
  where t.id = any (p_business_ids)
    and t.deleted_at is null
    and (
      t.visibility = 'listed'
      or exists (
        select 1 from public.business_members m
        where m.business_id = t.id and m.user_id = auth.uid() and m.deleted_at is null
      )
    );
$function$;

comment on function public.follower_counts(uuid[]) is
  'Live follower count per business — a number, never a name. Counts only follows made by an account that still exists (29 Sep 2026), so the figure and the list under it agree.';

-- ── 2 · A PERSON'S FOLLOWERS AND FOLLOWING ─────────────────────────────────
-- ⚠ BOTH DIRECTIONS, and they are different joins: `followers` must check the
-- person doing the following, `following` must check the thing followed — and
-- the thing followed is one of THREE (a business, a person or a crew), which is
-- why that half is an `exists` over the row's own single object rather than one
-- join. `follows_one_object` (19 Sep 2026) guarantees exactly one is set.
create or replace function public.person_follower_counts(p_user_ids uuid[])
returns table(user_id uuid, followers bigint, following bigint)
language sql
stable
security definer
set search_path to ''
as $function$
  select p.id as user_id,
         (select count(*) from public.follows f
            join public.profiles fp on fp.id = f.follower_id and fp.deleted_at is null
            where f.followee_id = p.id and f.deleted_at is null) as followers,
         (select count(*) from public.follows f
            where f.follower_id = p.id and f.deleted_at is null
              and (
                exists (select 1 from public.businesses b
                         where b.id = f.business_id and b.deleted_at is null)
                or exists (select 1 from public.profiles fe
                            where fe.id = f.followee_id and fe.deleted_at is null)
                or exists (select 1 from public.crews c
                            where c.id = f.crew_id and c.deleted_at is null)
              )) as following
  from public.profiles p
  where p.id = any (p_user_ids) and p.deleted_at is null
    and (auth.uid() is not null or public.artist_plan_active(p.id) or public.org_is_public(p.id));
$function$;

comment on function public.person_follower_counts(uuid[]) is
  'A person''s follower and following counts. Both directions count only a live other party (29 Sep 2026) — a follow of a deleted studio is kept as a record and is not a number any more.';

-- ── 3 · A CREW'S FOLLOWERS ─────────────────────────────────────────────────
-- ⚠ The join moves into the `left join`'s ON, not a WHERE: this is a LEFT join
-- so that a crew with no followers still returns its row with 0. Putting the
-- liveness test in the WHERE would drop that crew from the result entirely and
-- `findCrewFollowerCount` would read it as "could not be read" — which draws no
-- figure at all (`FollowerFigure`'s null-is-not-zero rule).
create or replace function public.crew_follower_counts(p_crew_ids uuid[])
returns table(crew_id uuid, followers bigint)
language sql
stable
security definer
set search_path to ''
as $function$
  select c.id, count(f.id)
  from public.crews c
  left join public.follows f on f.crew_id = c.id and f.deleted_at is null
    and exists (select 1 from public.profiles p
                 where p.id = f.follower_id and p.deleted_at is null)
  where c.id = any (p_crew_ids) and c.deleted_at is null
  group by c.id;
$function$;

comment on function public.crew_follower_counts(uuid[]) is
  'Live follower count per crew. Counts only follows made by an account that still exists (29 Sep 2026); a crew with none still returns its row as 0, which is what makes the figure a measurement rather than an absence.';

commit;
