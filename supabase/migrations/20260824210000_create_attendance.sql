-- Step 10 (Attendance + waitlist management): the attendance register and the
-- owner-side waitlist queue.
--
-- Model: an attendance row = "this booking was checked into the room". One live
-- row per enrollment (partial unique index); checking somebody out soft-deletes
-- the row, so history is never destroyed (Rule 3) and a re-check-in is a fresh
-- row. The clock owns the window, not a button (prototype decision, 12050-12063):
-- check-in opens 30 minutes before the session starts — doors open a little
-- early in the real world — and closes when it ends, after which the register
-- is final.
--
-- The waitlist queue closes Step 9's deliberate gap: a freed PAID seat goes
-- back on sale instead of auto-promoting, and the studio hands it out here —
-- give_spot is the owner's decision (a promoted learner on a priced class
-- settles at the desk until desk payments arrive with Step 13).

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  -- denormalised so register reads and RLS never join deep
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);

comment on table public.attendance is
  'One live row per enrollment = checked in. Check-out soft-deletes (history kept); re-check-in inserts anew. Written only via check_in/undo_check_in.';

create unique index attendance_one_live_per_enrollment
  on public.attendance (enrollment_id) where deleted_at is null;
create index attendance_session_idx on public.attendance (session_id) where deleted_at is null;
create index attendance_tenant_idx on public.attendance (tenant_id) where deleted_at is null;

create trigger attendance_set_updated_at
  before update on public.attendance
  for each row execute function public.set_updated_at();

alter table public.attendance enable row level security;

-- learners see their own check-ins (their attendance history is theirs)
create policy "users read own attendance"
  on public.attendance for select
  to authenticated
  using (user_id = auth.uid());

-- the studio's people read their register
create policy "members read tenant attendance"
  on public.attendance for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = attendance.tenant_id
        and m.user_id = auth.uid()
        and m.deleted_at is null
    )
  );

-- No insert/update/delete policies: the register moves only through the RPCs.

-- who may run a register: the tenant's owner or trainer (assistant claims
-- arrive with Step 11's people work)
create or replace function public.can_run_register(p_tenant_id uuid)
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
      and m.member_role in ('owner', 'trainer')
      and m.deleted_at is null
  );
$$;

-- ── check_in — mark a booking present, inside the clock's window ──────────────
create or replace function public.check_in(p_enrollment_id uuid)
returns public.attendance
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_enr public.enrollments;
  v_session public.class_sessions;
  v_row public.attendance;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select * into v_enr from public.enrollments e
    where e.id = p_enrollment_id and e.status = 'enrolled' and e.deleted_at is null;
  if not found then
    raise exception 'booking not found';
  end if;
  if not public.can_run_register(v_enr.tenant_id) then
    raise exception 'only the studio''s owner or trainer runs the register';
  end if;
  if not exists (select 1 from public.classes c
                 where c.id = v_enr.class_id and c.status = 'published' and c.deleted_at is null) then
    raise exception 'this class is not open';
  end if;

  select * into v_session from public.class_sessions s where s.id = v_enr.session_id;
  if now() < v_session.starts_at - interval '30 minutes' then
    raise exception 'check-in opens 30 minutes before the session';
  end if;
  if now() > v_session.ends_at then
    raise exception 'the session has ended — the register is final';
  end if;

  select * into v_row from public.attendance a
    where a.enrollment_id = p_enrollment_id and a.deleted_at is null;
  if found then
    return v_row; -- already in — checking in twice is a no-op
  end if;

  insert into public.attendance (enrollment_id, session_id, class_id, tenant_id, user_id,
                                 created_by, updated_by)
  values (v_enr.id, v_enr.session_id, v_enr.class_id, v_enr.tenant_id, v_enr.user_id,
          v_user, v_user)
  returning * into v_row;
  return v_row;
end;
$$;

-- ── undo_check_in — checked the wrong person: soft-delete the live row ────────
create or replace function public.undo_check_in(p_enrollment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.attendance;
  v_session public.class_sessions;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_row from public.attendance a
    where a.enrollment_id = p_enrollment_id and a.deleted_at is null;
  if not found then
    raise exception 'not checked in';
  end if;
  if not public.can_run_register(v_row.tenant_id) then
    raise exception 'only the studio''s owner or trainer runs the register';
  end if;
  select * into v_session from public.class_sessions s where s.id = v_row.session_id;
  if now() > v_session.ends_at then
    raise exception 'the session has ended — the register is final';
  end if;
  update public.attendance
    set deleted_at = now(), updated_by = v_user
    where id = v_row.id;
end;
$$;

-- ── give_spot — the owner hands a freed seat to someone waiting ───────────────
-- Works on paid classes too: it is the studio's seat to give (prototype 12090;
-- money for it is desk business until Step 13).
create or replace function public.give_spot(p_enrollment_id uuid)
returns public.enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_enr public.enrollments;
  v_class public.classes;
  v_taken integer;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_enr from public.enrollments e
    where e.id = p_enrollment_id and e.status = 'waitlisted' and e.deleted_at is null;
  if not found then
    raise exception 'that person is not on the waitlist';
  end if;
  if not public.can_run_register(v_enr.tenant_id) then
    raise exception 'only the studio''s owner or trainer manages the waitlist';
  end if;

  -- same lock discipline as enrolling: the class row serialises seat changes
  select * into v_class from public.classes c where c.id = v_enr.class_id for update;

  select count(*) into v_taken from public.enrollments e
    where e.session_id = v_enr.session_id and e.status = 'enrolled' and e.deleted_at is null;
  if v_taken >= v_class.capacity then
    raise exception 'free a spot first — the class is full';
  end if;

  update public.enrollments
    set status = 'enrolled', updated_by = v_user
    where id = v_enr.id
    returning * into v_enr;
  return v_enr;
end;
$$;

-- ── remove_from_waitlist — the owner clears a queue entry ─────────────────────
create or replace function public.remove_from_waitlist(p_enrollment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_enr public.enrollments;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_enr from public.enrollments e
    where e.id = p_enrollment_id and e.status = 'waitlisted' and e.deleted_at is null;
  if not found then
    raise exception 'that person is not on the waitlist';
  end if;
  if not public.can_run_register(v_enr.tenant_id) then
    raise exception 'only the studio''s owner or trainer manages the waitlist';
  end if;
  update public.enrollments
    set status = 'cancelled', updated_by = v_user
    where id = v_enr.id;
end;
$$;

-- ── grants ────────────────────────────────────────────────────────────────────
revoke execute on function public.can_run_register(uuid) from public, anon;
grant execute on function public.can_run_register(uuid) to authenticated;
revoke execute on function public.check_in(uuid) from public, anon;
grant execute on function public.check_in(uuid) to authenticated;
revoke execute on function public.undo_check_in(uuid) from public, anon;
grant execute on function public.undo_check_in(uuid) to authenticated;
revoke execute on function public.give_spot(uuid) from public, anon;
grant execute on function public.give_spot(uuid) to authenticated;
revoke execute on function public.remove_from_waitlist(uuid) from public, anon;
grant execute on function public.remove_from_waitlist(uuid) to authenticated;
