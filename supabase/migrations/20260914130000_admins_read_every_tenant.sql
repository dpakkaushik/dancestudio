-- AN ADMIN READS EVERY STUDIO, LISTED OR NOT (14 Sep 2026).
--
-- Found by the first e2e run after verification moved to the studio, and it
-- would have met the user first: the admin's verification queue drew a card
-- that said "run by E2E Owner · No links published · No photos of the space"
-- for a studio that had just submitted a link and five photos.
--
-- `tenants` had two SELECT policies — "members read own tenants" and "anyone
-- reads listed tenants" — and a platform admin is neither a member of the
-- studio it is reviewing nor looking at a listed one: a studio under review is
-- UNLISTED by definition; that is what the review is for. So PostgREST's
-- embedded read of the studio came back empty, the card fell back to the
-- organization's name, and its links and photos (keyed by the studio) were
-- nowhere to be found. The Approved tab hit the same wall: a studio wearing
-- the badge but not yet subscribed is unlisted too, and would not have been
-- listed there either.
--
-- The admin desks that were built earlier never noticed because they read
-- through SECURITY DEFINER RPCs (`admin_businesses`, `admin_accounts`). The
-- verification desk reads the table directly, under RLS, which is the right
-- way to read — and RLS now says what was always true: a platform admin
-- moderates every business on the platform, so it reads every one.
--
-- `(select …)` rather than a bare call, so the check is one InitPlan per
-- query and not one function call per row — the rule 20260913090000 applied
-- to every other policy in this schema.

drop policy if exists "admins read every tenant" on public.tenants;
create policy "admins read every tenant"
  on public.tenants for select
  to authenticated
  using ((select public.is_platform_admin()));

comment on policy "admins read every tenant" on public.tenants is
  'A platform admin moderates every business on the platform, so it reads every one — listed or not (14 Sep 2026). Without this the verification queue could not show the studio it was asked to verify.';
