-- Fix: the team-read policy added minutes ago recursed.
--
-- "members read own tenant memberships" asked tenant_members whether the caller
-- is a member of this row's tenant — which re-evaluates tenant_members' own
-- SELECT policies, forever: 42P17 infinite recursion. Any query that reads
-- tenant_members inside another table's policy (rooms INSERT, class_claims,
-- enrollments…) hit it too, so this broke more than the team list.
--
-- The membership test moves into a SECURITY DEFINER function, which runs as the
-- table owner and therefore does not re-enter RLS. Same rule, no cycle.
--
-- Lesson for any future policy: a policy on table X must never contain a
-- subquery against X. Put the test in a security-definer function.

drop policy if exists "members read own tenant memberships" on public.tenant_members;

create or replace function public.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.tenant_members m
    where m.tenant_id = p_tenant_id
      and m.user_id = auth.uid()
      and m.deleted_at is null
  );
$$;

revoke execute on function public.is_tenant_member(uuid) from public, anon;
grant execute on function public.is_tenant_member(uuid) to authenticated;

create policy "members read own tenant memberships"
  on public.tenant_members for select
  to authenticated
  using (deleted_at is null and public.is_tenant_member(tenant_members.tenant_id));
