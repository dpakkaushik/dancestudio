-- A FRONT-DESK SEAT IS NOT PUBLIC, AT THE CEILING TOO (20 Sep 2026)
--
-- ⚠ Rule 9: RLS. Found by `scripts/stranger-smoke.ps1` on its first real run,
-- which is the whole reason that script was written today.
--
-- WHAT IS WRONG. The user's answer on the organization's four labels (R36) was
-- explicit: "Other team members do not appear on somebody's public profile." The
-- definer read keeps that promise exactly —
--
--     public_organization_team ... where m.role <> 'member'
--
-- — and the TABLE POLICY beside it does not:
--
--     "anyone reads a public organization's confirmed team"
--       USING (deleted_at is null AND status = 'confirmed' AND org_is_public(org_id))
--
-- So the page leaves a front-desk seat out and a plain
-- `GET /rest/v1/organization_members` hands it to a stranger, with the person's
-- user_id beside it. Production has one such row today. The promise was kept by
-- the SCREEN and not by the DATABASE, which is this file's oldest lesson in a new
-- coat: RLS IS THE CEILING, and a rule that lives only above it is a rule that
-- holds only at the door you went in by.
--
-- THE FIX is the one clause the definer read already has. Nothing else moves:
-- the organization still reads its whole team and a person still reads their own
-- rows (both `to authenticated`, both untouched), there is still no INSERT,
-- UPDATE or DELETE policy for anybody, and the grants are unchanged.
--
-- ⚠ It narrows what a stranger may read. Nothing in the app reads this table as
-- anon — every public surface goes through `public_organization_team` — so no
-- screen changes; what changes is that the API now says the same thing the
-- screen does.

drop policy if exists "anyone reads a public organization's confirmed team" on public.organization_members;

create policy "anyone reads a public organization's confirmed team"
  on public.organization_members
  for select
  to anon, authenticated
  using (
    deleted_at is null
    and status = 'confirmed'
    -- ⚠ the same exclusion public_organization_team makes, and for the same
    -- reason: `member` is the organization's OWN note about who works there
    and role <> 'member'
    and public.org_is_public(org_id)
  );

comment on table public.organization_members is
  'The people an organization NAMES on its public page. owner | studio_owner | event_team are published; `member` ("Other team member") is the organization''s own note and is read by the organization and that person only - in the definer read AND in the policy, since 20 Sep 2026.';
