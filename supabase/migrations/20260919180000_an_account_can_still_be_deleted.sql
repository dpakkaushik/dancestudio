-- ⚠ AN ACCOUNT COULD NOT BE DELETED ONCE IT HAD MADE A ROUTINE OR A MEMBERSHIP
-- (19 Sep 2026) — and it is the 19 Sep crew-header lesson in a new coat, found
-- the same way: by auditing what this repo's OWN two newest migrations added.
--
-- Every table in this database has plain `uuid` audit columns. Two migrations
-- applied earlier today — `20260919160000_a_routine_is_a_song_and_a_video` and
-- `20260919170000_memberships` — gave theirs a FOREIGN KEY to `auth.users`
-- instead, with no `on delete` clause, which is NO ACTION: the delete is
-- REFUSED rather than cascaded or nulled.
--
-- That is only harmless where the referencing row is itself carried away by the
-- same delete. It is not, in two cases that a real account will hit:
--   * `memberships.created_by` — the owner who made it. `memberships.business_id`
--     cascades from BUSINESSES, and a business does not go when its owner's
--     account does, so the membership row stands and blocks the delete.
--   * `class_routines.created_by` — the artist who put a routine on somebody
--     else's class. The class stands, so the row stands, so the delete is refused.
-- `routines.*` and `membership_passes.*` and `membership_uses.*` happen to be
-- carried off by their own owner cascade today — which is luck, not a rule, and
-- one join away from not being true.
--
-- WHAT THIS DOES: drops the eight constraints and nothing else. No column moves,
-- no value changes, no policy, no grant, no function. The columns keep holding
-- the same uuids; they simply stop being a lock on somebody else's account, the
-- way every other audit column in this database already is.
--
-- Nothing in the app deletes an account, so today the refusal is reachable from
-- the admin API alone — which is where `demo-data.js wipe`, the e2e cleanups and
-- every proof script's `finally` live, so it would have started failing runs
-- rather than users.

alter table public.routines
  drop constraint if exists routines_created_by_fkey,
  drop constraint if exists routines_updated_by_fkey;

alter table public.class_routines
  drop constraint if exists class_routines_created_by_fkey,
  drop constraint if exists class_routines_updated_by_fkey;

alter table public.memberships
  drop constraint if exists memberships_created_by_fkey,
  drop constraint if exists memberships_updated_by_fkey;

alter table public.membership_passes
  drop constraint if exists membership_passes_created_by_fkey,
  drop constraint if exists membership_passes_updated_by_fkey;

alter table public.membership_uses
  drop constraint if exists membership_uses_created_by_fkey,
  drop constraint if exists membership_uses_updated_by_fkey;

comment on column public.memberships.created_by is
  'who made it. A plain uuid, like every other audit column here: it carried a foreign key to auth.users for a few hours on 19 Sep 2026, which made the maker''s account undeletable.';
comment on column public.routines.created_by is
  'who made it. A plain uuid — see memberships.created_by (19 Sep 2026).';
