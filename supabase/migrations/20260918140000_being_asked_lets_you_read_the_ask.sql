-- ⚠ THE ASK WAS INVISIBLE TO THE PERSON ASKED (18 Sep 2026, reported by the user:
-- "when studio creating class request not going to artist in inbox").
--
-- 20260918120000 opened the teacher's seat to ANYONE on DanceOS - the user's own
-- rule: "who is taking class should be any user or artist and should send a
-- request to the user or artist for accepting" - and left a hole underneath it.
--
-- A new class is a DRAFT, and the only people who may read a draft are the
-- business's own members (Step 3's policy) and, since this week, the venue's. The
-- person being ASKED is neither. So:
--   * the trigger raised their notification (it is SECURITY DEFINER, so it fired),
--   * `class_people` handed them their own row (own-rows policy), and
--   * the embed `classes (...)` on it came back NULL, because they may not read
--     the class - and `findMyPendingClaims` drops a row whose class it cannot
--     read (`.filter((r) => r.classes)`).
-- The result: a bell that says a studio wants them, and an Inbox with nothing in
-- it. The same hole hid the studio's NAME when the studio is unlisted, and made
-- /c/{slug} a 404 for the one person who most needs to open it.
--
-- ⚠ WHY THE E2E DID NOT CATCH IT, which is the lesson: the happy path asks a
-- trainer who accepted a team invite two steps earlier, so they could read the
-- draft as a MEMBER. The story tested the one case that cannot fail. It now asks
-- somebody off the team as well, and rls-proof-rooms-people proves the rule.
--
-- THE FIX: being asked is what grants the read, and it lasts exactly as long as
-- the ask does - withdraw it (a soft delete) and the read goes with it.
--
-- ⚠ Both helpers are SECURITY DEFINER on purpose. A policy on `classes` that
-- queried `class_people` directly would recurse, because `class_people`'s own
-- policies read `classes` (42P17 - the Step 11 lesson that cost this repo a
-- migration: "a policy on table X must never contain a subquery against X", and
-- here it is the same loop one table further out). A definer function is not
-- subject to RLS, so the loop cannot form.
--
-- RLS impact: three SELECT policies added, none changed, nothing else touched.
-- No write path anywhere gains anything.

create or replace function public.is_asked_onto_class(p_class_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.class_people cp
     where cp.class_id = p_class_id
       and cp.user_id = auth.uid()
       and cp.deleted_at is null
  );
$$;
comment on function public.is_asked_onto_class(uuid) is
  'True while the caller has a live row on this class - asked, confirmed or rejected. What lets somebody read the class they are being asked onto (18 Sep 2026). SECURITY DEFINER so a policy on classes cannot recurse through class_people.';
revoke execute on function public.is_asked_onto_class(uuid) from public, anon;
grant execute on function public.is_asked_onto_class(uuid) to authenticated;

create or replace function public.has_been_asked_by_business(p_business_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.class_people cp
     where cp.business_id = p_business_id
       and cp.user_id = auth.uid()
       and cp.deleted_at is null
  );
$$;
comment on function public.has_been_asked_by_business(uuid) is
  'True while the caller has a live class ask from this business. Lets the person asked read WHO is asking, even when the studio is not listed yet (18 Sep 2026).';
revoke execute on function public.has_been_asked_by_business(uuid) from public, anon;
grant execute on function public.has_been_asked_by_business(uuid) to authenticated;

drop policy if exists "people asked onto a class read it" on public.classes;
create policy "people asked onto a class read it"
  on public.classes for select
  to authenticated
  using (deleted_at is null and public.is_asked_onto_class(id));

drop policy if exists "people asked onto a class read its sessions" on public.class_sessions;
create policy "people asked onto a class read its sessions"
  on public.class_sessions for select
  to authenticated
  using (deleted_at is null and public.is_asked_onto_class(class_id));

drop policy if exists "people asked onto a class read who asked" on public.businesses;
create policy "people asked onto a class read who asked"
  on public.businesses for select
  to authenticated
  using (deleted_at is null and public.has_been_asked_by_business(id));
