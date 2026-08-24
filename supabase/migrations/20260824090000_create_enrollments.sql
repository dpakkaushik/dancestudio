-- Step 4 (Enrollment): enrollments + enroll/cancel RPCs.
-- A learner takes a spot in a class_session. Capacity is enforced atomically;
-- a full session waitlists (prototype: "join the waitlist and we'll tell you if
-- one opens", DanceOSApp.jsx:12420); a cancellation hands the freed spot to the
-- first person waiting (13648-13656). Payments are stubbed until Phase 2.

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  -- denormalised so the studio's roster RLS never joins two tables deep
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- references profiles (not auth.users) so the roster can name the learner;
  -- enrolling therefore requires a completed onboarding profile
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'enrolled' check (status in ('enrolled', 'waitlisted', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);

comment on table public.enrollments is
  'A learner''s spot (or waitlist place) in one class_session. No payment fields until Phase 2 (Razorpay).';

-- one live spot per learner per session; a cancelled row does not block re-enrolling
create unique index enrollments_one_live_per_session
  on public.enrollments (session_id, user_id)
  where status in ('enrolled', 'waitlisted') and deleted_at is null;

create index enrollments_session_idx on public.enrollments (session_id) where deleted_at is null;
create index enrollments_tenant_idx on public.enrollments (tenant_id) where deleted_at is null;
create index enrollments_user_idx on public.enrollments (user_id) where deleted_at is null;

create trigger enrollments_set_updated_at
  before update on public.enrollments
  for each row execute function public.set_updated_at();

alter table public.enrollments enable row level security;

-- learners see their own bookings (any status — a cancelled row is their history)
create policy "users read own enrollments"
  on public.enrollments for select
  to authenticated
  using (user_id = auth.uid());

-- the studio's people see their roster
create policy "members read own tenant enrollments"
  on public.enrollments for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = enrollments.tenant_id
        and m.user_id = auth.uid()
        and m.deleted_at is null
    )
  );

-- No insert/update/delete policies: enrolling and cancelling go ONLY through the
-- RPCs below, so the capacity check and the waitlist promotion can never be skipped.

-- Enroll: capacity checked under a row lock on the class, full → waitlisted.
create or replace function public.enroll_in_session(p_session_id uuid)
returns public.enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_session public.class_sessions;
  v_class public.classes;
  v_taken integer;
  v_row public.enrollments;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user and p.deleted_at is null) then
    raise exception 'finish onboarding before enrolling';
  end if;

  select * into v_session from public.class_sessions s
    where s.id = p_session_id and s.deleted_at is null;
  if not found then
    raise exception 'session not found';
  end if;
  if v_session.starts_at <= now() then
    raise exception 'this session has already started';
  end if;

  -- lock the class row: two people grabbing the last spot queue up here
  select * into v_class from public.classes c
    where c.id = v_session.class_id and c.deleted_at is null and c.status = 'published'
    for update;
  if not found then
    raise exception 'class is not open for booking';
  end if;

  if exists (
    select 1 from public.enrollments e
    where e.session_id = p_session_id and e.user_id = v_user
      and e.status in ('enrolled', 'waitlisted') and e.deleted_at is null
  ) then
    raise exception 'you already have a spot in this class';
  end if;

  select count(*) into v_taken from public.enrollments e
    where e.session_id = p_session_id and e.status = 'enrolled' and e.deleted_at is null;

  insert into public.enrollments (session_id, class_id, tenant_id, user_id, status, created_by, updated_by)
  values (p_session_id, v_class.id, v_class.tenant_id, v_user,
          case when v_taken < v_class.capacity then 'enrolled' else 'waitlisted' end,
          v_user, v_user)
  returning * into v_row;

  return v_row;
end;
$$;

-- Cancel: your own spot only; a freed seat goes to the first person on the waitlist.
create or replace function public.cancel_enrollment(p_enrollment_id uuid)
returns public.enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.enrollments;
  v_was_enrolled boolean;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  -- lock the class first so cancel + promote can't race a concurrent enroll
  select * into v_row from public.enrollments e
    where e.id = p_enrollment_id and e.user_id = v_user
      and e.status in ('enrolled', 'waitlisted') and e.deleted_at is null;
  if not found then
    raise exception 'booking not found';
  end if;
  perform 1 from public.classes c where c.id = v_row.class_id for update;

  v_was_enrolled := (v_row.status = 'enrolled');

  update public.enrollments
    set status = 'cancelled', updated_by = v_user
    where id = v_row.id
    returning * into v_row;

  if v_was_enrolled then
    update public.enrollments
      set status = 'enrolled', updated_by = v_user
      where id = (
        select e.id from public.enrollments e
        where e.session_id = v_row.session_id
          and e.status = 'waitlisted' and e.deleted_at is null
        order by e.created_at
        limit 1
      );
  end if;

  return v_row;
end;
$$;

-- Seat counts for listings — aggregates only, never who. Readable by anyone so the
-- public class cards can say "N spots left".
create or replace function public.session_seat_counts(p_session_ids uuid[])
returns table (session_id uuid, enrolled bigint)
language sql
security definer
set search_path = ''
stable
as $$
  select e.session_id, count(*) as enrolled
  from public.enrollments e
  where e.session_id = any (p_session_ids)
    and e.status = 'enrolled'
    and e.deleted_at is null
  group by e.session_id;
$$;

revoke execute on function public.enroll_in_session(uuid) from public, anon;
grant execute on function public.enroll_in_session(uuid) to authenticated;
revoke execute on function public.cancel_enrollment(uuid) from public, anon;
grant execute on function public.cancel_enrollment(uuid) to authenticated;
revoke execute on function public.session_seat_counts(uuid[]) from public;
grant execute on function public.session_seat_counts(uuid[]) to anon, authenticated;
