-- Step 11 follow-up: a studio must be able to see its own team.
--
-- tenant_members SELECT was own-rows-only (Step 2), which is why the class
-- form's people pickers had nothing to offer: an owner could not read the
-- trainer sitting next to them. A tenant's people are visible to that tenant's
-- people now.
--
-- Rule this drags in (already learned once, Step 6): RLS is a ceiling, not a
-- scoping mechanism. `findMyTenants` used to lean on own-rows-only to mean "my
-- tenants" — with this policy that query would return every membership row of
-- every tenant I belong to, listing my own studio once per teammate. The
-- repository now filters `user_id = auth.uid()` explicitly, which is what it
-- should always have said.

create policy "members read own tenant memberships"
  on public.tenant_members for select
  to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.tenant_members mine
      where mine.tenant_id = tenant_members.tenant_id
        and mine.user_id = auth.uid()
        and mine.deleted_at is null
    )
  );
