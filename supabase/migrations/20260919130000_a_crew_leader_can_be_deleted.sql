-- ============================================================================
-- A CREW LEADER'S ACCOUNT COULD NOT BE DELETED ONCE THEIR CREW HAD HEADER
-- PICTURES (19 Sep 2026) — found by rls-proof-profile-pages.ps1's own cleanup
-- within the hour of 20260919124000 landing.
--
-- Deleting the leader's auth.users row answered 500:
--   insert or update on table "crew_header_photos" violates foreign key
--   constraint "crew_header_photos_crew_id_fkey" — Key is not present in "crews"
--
-- WHY. `crew_header_photos` was the ONE table in this schema whose audit
-- columns carried a foreign key to auth.users (`created_by / updated_by …
-- references auth.users (id) on delete set null`). Every other table since
-- Step 1 holds created_by / updated_by as plain uuids (Rule 3's audit columns
-- are a record of who, not a reference that reaches back). So deleting a user
-- who leads a crew with pictures fires TWO referential actions on the SAME
-- rows: the crews cascade (leader_id → profiles → crews → crew_header_photos)
-- that DELETEs them, and the SET NULL on created_by / updated_by that UPDATEs
-- them — and the UPDATE runs against a crews row the cascade has already
-- removed, so its crew_id check has nothing to stand on. The rows were going
-- either way; the UPDATE is what breaks the statement.
--
-- Proven on production before this was written: with the header rows deleted
-- first, the same leader's account deleted cleanly.
--
-- THE FIX is the shape every other table already has — no foreign key from
-- the audit columns to auth.users. No policy, no grant, no row moves; the
-- columns keep their values. A rolled-back dry run reproduces the 500 with
-- the constraints in place and the clean delete without them.
-- ============================================================================

alter table public.crew_header_photos drop constraint if exists crew_header_photos_created_by_fkey;
alter table public.crew_header_photos drop constraint if exists crew_header_photos_updated_by_fkey;

comment on column public.crew_header_photos.created_by is
  'Who added the picture — a record, not a reference: the audit columns carry no foreign key to auth.users, like every other table (19 Sep 2026: the FK made a crew leader''s account undeletable).';
