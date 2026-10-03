-- ⚠ Rule 9: RLS. It NARROWS who may read a business's students. 3 Oct 2026, the
-- user's decision: a visiting teacher or an assistant "should not be able to see
-- their studio student list".
--
-- Since 21 Sep (R44) and 28 Sep (R55) the APP has refused them the Students desk,
-- but that was a presentation gate: the four tables underneath admitted EVERY
-- member of the business — so a visiting teacher seated by one accepted class could
-- still read every booking, every check-in, every walk-in's number and every pass
-- the studio sold, straight through PostgREST.
--
-- THE RULE, ONE LINE: a business's rows as a whole are read by the people who RUN
-- it — the owner and the manager, the same two R55 gives the business to — and a
-- CLASS's own rows are read by whoever may run that class's register
-- (`can_run_register_for_class`, unchanged: the owner, a manager, a trainer, an
-- assistant handed attendance, a standing grant). So every register still opens
-- for exactly the people it opened for, and nobody else assembles a list from it.
--
-- What each table gets:
--   class_bookings, attendance — runs the business, OR may run THIS class's register
--   membership_uses            — runs the class's business, OR may run its register
--   membership_passes          — runs the business (a pass names no class)
--   leads (read, add, change)  — runs the business (the walk-ins the desk typed)
-- A person's OWN rows are untouched: everybody still reads their own bookings,
-- check-ins and passes. Definer functions (seat counts, the boards, the notify
-- triggers) do not run these policies and do not move.
--
-- ⚠ No begin/commit (Rule 18): db push wraps the file already.

create or replace function public.runs_business(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.member_role in ('owner', 'manager')
      and m.deleted_at is null
  );
$$;

comment on function public.runs_business(uuid) is
  'An owner or manager seat on this business (3 Oct 2026) — the database''s copy of the app''s runsTheBusiness (R55). Who may read a business''s students as a whole.';

revoke all on function public.runs_business(uuid) from public, anon;
grant execute on function public.runs_business(uuid) to authenticated, service_role;

-- ── class_bookings ──
drop policy "members read own business class_bookings" on public.class_bookings;
create policy "the people running it read a business's bookings"
  on public.class_bookings for select to authenticated
  using (public.runs_business(business_id) or public.can_run_register_for_class(class_id));

-- ── attendance ──
drop policy "members read business attendance" on public.attendance;
create policy "the people running it read a business's attendance"
  on public.attendance for select to authenticated
  using (public.runs_business(business_id) or public.can_run_register_for_class(class_id));

-- ── membership_uses ──
drop policy "a business reads uses on its own classes" on public.membership_uses;
create policy "the people running it read uses on its classes"
  on public.membership_uses for select to authenticated
  using (
    public.can_run_register_for_class(class_id)
    or exists (select 1 from public.classes c where c.id = membership_uses.class_id and public.runs_business(c.business_id))
  );

-- ── membership_passes ──
drop policy "a business reads the passes it sold" on public.membership_passes;
create policy "the people running it read the passes it sold"
  on public.membership_passes for select to authenticated
  using (public.runs_business(business_id));

-- ── leads ──
drop policy "members read own business leads" on public.leads;
drop policy "members insert own business leads" on public.leads;
drop policy "members update own business leads" on public.leads;
create policy "the people running it read its leads"
  on public.leads for select to authenticated
  using (public.runs_business(business_id));
create policy "the people running it add leads"
  on public.leads for insert to authenticated
  with check (public.runs_business(business_id));
create policy "the people running it change leads"
  on public.leads for update to authenticated
  using (public.runs_business(business_id));
