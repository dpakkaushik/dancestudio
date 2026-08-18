-- Fix: soft delete was impossible through PostgREST. Every update runs with an
-- internal RETURNING, and RETURNING applies SELECT policies to the NEW row — so
-- setting deleted_at produced a row the member could no longer select, and the
-- whole update was refused (403). Members now read their tenant's class rows
-- regardless of deleted_at; the app's queries filter live rows, and the public
-- policies keep their strict deleted_at + published checks.

drop policy "members read own classes" on public.classes;
create policy "members read own classes"
  on public.classes for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = classes.tenant_id
        and m.user_id = auth.uid()
        and m.deleted_at is null
    )
  );

drop policy "members read own sessions" on public.class_sessions;
create policy "members read own sessions"
  on public.class_sessions for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = class_sessions.tenant_id
        and m.user_id = auth.uid()
        and m.deleted_at is null
    )
  );
