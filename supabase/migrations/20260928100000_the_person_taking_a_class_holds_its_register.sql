-- THE PERSON TAKING A CLASS HOLDS ITS REGISTER (28 Sep 2026)
--
-- The user: "user should also see manage tab in classes as studios can add them
-- as the person taking the class ... and give rights when confirmed the invite."
--
-- The Manage tab is app-side and shipped. This is the other half, and it is the
-- database's, because `check_in` asks `can_run_register_for_class` and nothing
-- the app draws can widen that: a tab drawn over a refusal is worse than no tab.
--
-- ⚠⚠ WHAT IS BROKEN, COUNTED RATHER THAN ASSERTED. `can_run_register_for_class`
-- (20260920130000) admits three people: an owner or trainer of the business, a
-- CONFIRMED `class_people` row holding `can_attendance` whatever its kind, and a
-- standing `business_members.can_attendance`. `ask_class_person` defaults
-- `can_attendance` to FALSE and lets only an owner pass true. An outside teacher
-- who accepts is seated `visiting_faculty` — which is neither owner nor trainer —
-- so unless the studio remembered to tick a box the person taking the class
-- cannot open its door.
--
-- On production today: 54 live artist claims, 49 confirmed, and **20** holding
-- attendance. So 29 people are down to take a class whose register they cannot
-- run. That is the user's report, in rows.
--
-- ⚠ IT IS A DEFAULT, NOT A GRANT — the same reading of the same word the
-- assistant got on 20 Sep (20260920170000). Admitting `kind = 'artist'`
-- unconditionally inside `can_run_register_for_class` would make the power
-- ungrantable-away, which is what R38 refused for an owner ("a switch that
-- cannot be turned off is not a switch"). The row starts with it and an owner
-- may still take it back through `set_class_person_powers`.
--
-- ⚠ AND IT IS A TRIGGER ON THE ROW, NOT A LINE IN `ask_class_person`, for the
-- reason this repo has learned three times (the register's membership test
-- 25 Aug; the door that dropped an argument 20 Sep; the assistant default):
-- put the rule where the DECISION is made. An artist claim can arrive from
-- `ask_class_person`, from `create_class_with_session` seating an owner as their
-- own class's teacher, and from any door added later, and each would otherwise
-- have to remember.
--
-- ⚠ IT FIRES ON THE KIND, NOT ON THE POWERS. `before insert or update OF kind`
-- fires only when that column is in the UPDATE's SET list, and
-- `set_class_person_powers` sets `can_attendance` / `can_refunds` / `updated_by`
-- and never `kind` — so an owner switching a teacher's attendance OFF is not
-- overruled a moment later. The guard on `old.kind is distinct from new.kind`
-- means re-saving an unchanged kind does not silently switch it back on either.
--
-- ⚠ ATTENDANCE ONLY, NEVER REFUNDS. Running the door is what taking the class
-- IS; deciding refunds is money, and money stays the owner's to hand out one
-- person at a time (20260920130000's own line).
--
-- ⚠ NOTHING ELSE MOVES: no table, no column, no policy, no grant, no function's
-- signature or ACL. `can_run_register_for_class` is not touched at all — what
-- changes is the value a row is born with, which that function already reads.

create or replace function public.artist_starts_with_attendance()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- only when the row BECOMES the person taking the class; never on an
  -- ordinary powers update, which does not set `kind` at all
  if new.kind = 'artist'
     and (tg_op = 'INSERT' or old.kind is distinct from new.kind) then
    new.can_attendance := true;
  end if;
  return new;
end;
$function$;

revoke all on function public.artist_starts_with_attendance() from public, anon, authenticated;

comment on function public.artist_starts_with_attendance() is
  'The person taking a class holds its register by default (28 Sep 2026). A DEFAULT, not a grant: set_class_person_powers may still take it away, and never sets kind, so this cannot overrule it.';

drop trigger if exists artist_starts_with_attendance on public.class_people;
create trigger artist_starts_with_attendance
  before insert or update of kind on public.class_people
  for each row execute function public.artist_starts_with_attendance();

-- ⚠⚠ AND THE 29 ALREADY STANDING IN FRONT OF A CLASS ARE GIVEN IT TOO, which is
-- a decision rather than housekeeping and is safe for one measurable reason:
-- `false` on an artist row can only ever mean "never granted" here, never "taken
-- away". No screen in this app has ever offered an owner the two power chips for
-- an ARTIST claim — `AssistantControls` renders for `kind === 'assistant'` alone
-- — so the only way a false could be deliberate is a hand-written PostgREST call
-- nobody has made. Without this the fix would reach the next class asked and
-- none of the ones people are already teaching, which is not what was asked for.
update public.class_people
   set can_attendance = true
 where kind = 'artist'
   and can_attendance = false
   and deleted_at is null;
