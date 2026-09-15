-- A POLICY IS NOT A GRANT (15 Sep 2026) — the follow-up 20260915090000 needed.
--
-- That migration gave `org_proof_photos` a SELECT policy `to anon, authenticated`
-- so a stranger could read a LISTED studio's header pictures. Driven for real,
-- the signed-out guest still saw no header, and a bare REST probe said why:
-- anon got HTTP 401 on `org_proof_photos` while getting 200 on `tenants` with
-- the same headers. PostgREST answers 401 for `insufficient_privilege` (42501)
-- when the role is anon — and the table, created on 11 Sep with policies
-- `to authenticated` only, had never been GRANTed to anon at the table level.
-- RLS decides WHICH rows a role may see; the GRANT decides whether the role
-- may look at the table at all. A policy on a table the role cannot touch is
-- a policy that never runs. The storage policy's subquery on the same table
-- hit the same wall, which is why the signed URL was refused too.
--
-- ⚠ Rule 9: RLS-adjacent. The grant widens nothing on its own — the policies
-- from 20260915090000 still admit only a listed studio's live photos (and a
-- member's own studio); every other row stays exactly as invisible to anon as
-- before, because RLS is on and no other policy names anon.

grant select on table public.org_proof_photos to anon, authenticated;

/* the policy calls this to let a studio's team see an unlisted studio's
   photos; for anon it is simply false (auth.uid() is null), but it has to be
   CALLABLE for the policy to evaluate at all */
grant execute on function public.is_tenant_member(uuid) to anon, authenticated;

comment on table public.org_proof_photos is
  'The 5-10 photos of its space a studio shows DanceOS to be verified — AND, since 15 Sep 2026, its HEADER PICTURES: once the studio is listed they are readable by anyone (SELECT granted to anon; the policy admits listed studios'' live rows only). Objects live in the private org-proof bucket under proof/{org_id}/…; rows with a null tenant_id are legacy organization photos and stay private.';
