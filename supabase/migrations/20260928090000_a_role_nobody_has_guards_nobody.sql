-- ════════════════════════════════════════════════════════════════════════════
-- A GUARD THAT REFUSES NOBODY (28 Sep 2026)
--
-- The user: "fix the other 2 you mentioned as well". The two I named were
-- `guard_person_only`'s dead `role = 'org'` branch (R52) and a missing
-- business-type check on `save_membership` (#0al). ⚠⚠ BOTH WERE READ OFF THE
-- LIVE CATALOG BEFORE A LINE WAS WRITTEN, and neither is what I said it was:
--
--   · `save_membership` ALREADY CARRIES ITS CHECK, and has for some time —
--       select b.type into v_type from public.businesses b where b.id = p_business_id …
--       if v_type not in ('studio', 'artist_page') then
--         raise exception 'a membership is a studio''s or an artist''s';
--     so #0al was closed in the database while the backlog row still said it was
--     owed. Nothing to do; the row is corrected rather than acted on.
--
--   · `guard_person_only` CANNOT BE RESTORED, because there is nothing left for
--     it to refuse. It asks `profiles.role = 'org'`, and R48 retired that role on
--     26 Sep: the live histogram is `user: 48` and nothing else, so the branch is
--     unreachable on every one of its eight triggers. And the rule that replaced
--     it — a studio or an organization does not book, a crew enters events only —
--     is about the profile you are ACTING AS, which is a URL parameter carried by
--     the entity bar's Discover link. The database has no notion of it and must
--     not grow one: the same human, pressing the same button from their own
--     profile, is genuinely entitled to that booking. It is a presentation gate
--     over nothing, because there is no longer anything underneath to gate.
--
-- ⚠ SO THIS REMOVES THE BRANCH RATHER THAN PRETENDING TO REPAIR IT. What is
-- being fixed is a FALSE PROMISE IN THE CATALOG: the function's own comment says
-- it "refuses a row that names an organization account where a person belongs",
-- and it refuses nothing of the sort. This project has now been bitten four
-- times by a value retired from one column leaving its readers quietly answering
-- the wrong question — the booking gate, a studio team row's href, "What you
-- run", and this. Leaving a dead branch in place is also how the OLD meaning
-- silently comes back if anybody ever re-introduces the word.
--
-- ⚠ ZERO BEHAVIOUR CHANGE ON EVERY REACHABLE INPUT, and that is checkable
-- rather than asserted. Walk the old body: the service-role exemption, the null
-- column, the SUSPENDED refusal (live, untouched, and the reason all eight
-- triggers stay), the `business_members` owner exemption — which existed ONLY to
-- let an organization ACCOUNT hold the one seat the branch below would have
-- refused — then the dead branch, then `return new`. With the branch gone the
-- exemption has nothing to jump over, so both leave together and every reachable
-- path ends exactly where it ended before.
--
-- ⚠ Rule 9: RLS/auth-adjacent — it is a trigger on eight tables, including
-- `orders`, `class_bookings` and `event_bookings`. It is `create or replace` with
-- the signature unchanged, so the oid is preserved, all eight triggers keep
-- binding, and the ACL (postgres, service_role — no client role) is untouched.
--
-- ⚠ THE EIGHT TRIGGERS ARE NOT RE-CREATED. Each passes two arguments and the
-- second is no longer read; re-creating them to drop it would be eight drops and
-- eight creates on live tables for a string nobody evaluates. They are left, and
-- their sentences stand as a record of what this guard used to refuse.
--
-- NOT TOUCHED, AND SAID SO RATHER THAN LEFT TO BE FOUND — the sweep of the whole
-- catalog for the same retired word found eight more readers, and every one of
-- them is dead-but-harmless, which is why none is rewritten here:
--   · `admin_dashboard`   — `orgs` and `verified_orgs` count 0 for ever. They are
--     ADDED to other figures in two screens (`users + orgs`), so the arithmetic is
--     already right; removing the keys would change a repository, a type and two
--     call sites for no visible difference.
--   · `ask_class_person`, `set_person_follow` — refusals nobody can trigger.
--   · `add_my_header_photo` — the `'org' → 10` cap is unreachable; an
--     organization's header pictures are its BUSINESS's `studio_photos` now.
--   · `search_dance_os`    — `role <> 'org'` excludes nobody, which is correct.
--   · `update_my_profile`  — the org branch is unreachable; everybody gets the
--     user branch, which is the right rule post-R48.
--   · `public_studio_team` — returns `is_org`, always false. The app stopped
--     reading it on 27 Sep. Fixing it means a RETURNS TABLE change, which is a
--     drop-and-recreate — the pattern that loses an ACL — for a column nothing
--     reads.
--   · the `profiles` SELECT policy — `role <> 'org'` is true for everybody, so it
--     admits every signed-in reader to every live profile, which is Step 1's own
--     rule and is correct.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.guard_person_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_col text := tg_argv[0];
  v_id uuid;
  v_suspended timestamptz;
begin
  -- the service role is exempt, like every guard in this project (the seeder,
  -- the webhook and every proof run as it)
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role' then
    return new;
  end if;
  v_id := (to_jsonb(new) ->> v_col)::uuid;
  if v_id is null then
    return new;
  end if;
  select p.suspended_at into v_suspended from public.profiles p where p.id = v_id;
  -- THE ONE RULE LEFT, AND THE REASON THE EIGHT TRIGGERS STAY: a suspended
  -- account takes no seat, no booking, no order, no crew and no enquiry.
  if v_suspended is not null then
    raise exception 'this account is suspended — write to DanceOS from your hub';
  end if;
  return new;
end;
$$;

comment on function public.guard_person_only() is
  'Trigger (9 Sep 2026; re-cut 28 Sep 2026): refuses a row on a person''s table — class bookings, orders, event bookings, crews, crew rosters, enquiries, class jobs, team seats — that names a SUSPENDED account. TG_ARGV[0] is the column that names the person; TG_ARGV[1] is kept on the triggers and no longer read. Service role exempt. ⚠ Its original job, keeping an organization ACCOUNT out of a person''s seat, ended with R48 on 26 Sep 2026: profiles.role is ''user'' for everybody, so that branch refused nobody and is gone. The rule that replaced it — a studio, an organization or a crew does not book from Discover — is about the profile being ACTED AS, which is a URL parameter this database has no notion of and should not grow one for.';

-- the grants are unchanged by `create or replace`; restated so the file says what
-- the function may be called by, which is nothing a client can reach
revoke execute on function public.guard_person_only() from public, anon, authenticated;
