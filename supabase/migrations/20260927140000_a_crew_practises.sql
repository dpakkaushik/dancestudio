-- ══════════════════════════════════════════════════════════════════════════════
-- A CREW PRACTISES (27 Sep 2026) — ⚠ NOT APPLIED; the list goes in front of the
-- user before any `db push`, every time (this file's standing rule).
--
-- The user: *"crew should also get an option on home tab called Practice —
-- which allows crew leader to create practice which sends invite to members and
-- leader can mange attendace like how its done class for the same. practice
-- also get added to calendar. crews should also have a calendar tab."* And,
-- asked whose practice appears on a person's home: *"Only their crews'
-- practices."*
--
-- ⚠⚠ A PRACTICE IS NOT A CLASS, AND THAT IS THE WHOLE OF THE DESIGN.
--   · A class is SOLD — it has a price, a room the database defends against
--     double-booking, an artist who is paid per session, seats, a waitlist, a
--     refund window and a Cashfree order behind it. A practice has none of that:
--     it is a crew's own people in a room they arranged themselves.
--   · So this does NOT ride on `classes`. Reusing that table would mean a class
--     with a null price, a null venue, no capacity and a `status` that means
--     something else — and every one of the twenty-odd functions that read
--     `classes` would then have to learn to skip it. `class_bookings`,
--     `assert_room_ok`, `session_seat_counts`, `why_no_publish`, the earnings
--     reads and the register all assume a class is a class.
--   · What it DOES borrow is the app's own grammar for consent and attendance:
--     asked → confirmed (nobody is put on anything without saying yes, 1792),
--     and one live attendance row per person per occasion, soft-deleted to
--     check out, which is exactly `attendance`'s rule (Step 10).
--
-- ⚠ IT IS NOT PUBLIC. A crew's page prints its roster and its battle record; a
-- rehearsal schedule is the crew's own business, so there is no anon policy on
-- any of the three tables and no public read function.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. the practice itself ───────────────────────────────────────────────────
create table public.crew_practices (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  /* where, in the crew's own words — a practice is held wherever the crew found
     a floor, so this is free text and NOT a `rooms` reference: a room belongs to
     a studio, and a crew that books one is that studio's guest, not its tenant */
  place text not null,
  note text,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  /* ⚠ PLAIN UUIDs, NO FOREIGN KEY INTO auth.users — the 19 Sep defect that made
     an account undeletable on two tables, and the same shape `20260927110000`
     is still waiting to undo on four admin columns. Every other audit column in
     this database is a bare uuid and so are these. */
  created_by uuid not null default auth.uid(),
  updated_by uuid,
  deleted_at timestamptz,
  constraint crew_practices_ends_after_start check (ends_at > starts_at),
  constraint crew_practices_place_shape check (char_length(btrim(place)) between 1 and 120),
  constraint crew_practices_note_shape check (note is null or char_length(note) <= 280)
);

comment on table public.crew_practices is
  'A crew rehearsal: when, where, and a note. The leader creates it; every confirmed member is ASKED. Not public — a crew page shows its roster and its battle record, never its schedule.';

create index crew_practices_crew_idx on public.crew_practices (crew_id, starts_at) where deleted_at is null;

create trigger crew_practices_set_updated_at
  before update on public.crew_practices
  for each row execute function public.set_updated_at();

-- ── 2. who was asked, and what they said ─────────────────────────────────────
create table public.crew_practice_people (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.crew_practices (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'asked' check (status in ('asked', 'confirmed', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid,
  deleted_at timestamptz
);

comment on table public.crew_practice_people is
  'The invitation to one practice. Starts ASKED; only the person named answers. A no is a real answer and stays on the row — the leader needs to know who is not coming.';

create unique index crew_practice_people_live_unique on public.crew_practice_people (practice_id, user_id) where deleted_at is null;
create index crew_practice_people_user_idx on public.crew_practice_people (user_id) where deleted_at is null;

create trigger crew_practice_people_set_updated_at
  before update on public.crew_practice_people
  for each row execute function public.set_updated_at();

-- ── 3. who turned up ─────────────────────────────────────────────────────────
-- One LIVE row per person per practice = present; checking out soft-deletes, so
-- the history is never destroyed (Step 10's rule, verbatim).
create table public.crew_practice_attendance (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.crew_practices (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid,
  deleted_at timestamptz
);

comment on table public.crew_practice_attendance is
  'Who turned up to a practice. One live row per person = present; undoing soft-deletes rather than erasing, exactly as class attendance does.';

create unique index crew_practice_attendance_live_unique on public.crew_practice_attendance (practice_id, user_id) where deleted_at is null;

create trigger crew_practice_attendance_set_updated_at
  before update on public.crew_practice_attendance
  for each row execute function public.set_updated_at();

-- ── a helper both the policies and the functions share ───────────────────────
-- ⚠ SECURITY DEFINER, like `is_crew_leader`: a policy on `crew_practices` that
-- queried `crew_members` directly would recurse through that table's own
-- policies (42P17, the Step 11 lesson, met on `class_people` and again here).
create or replace function public.is_on_crew(p_crew_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.crews c
    where c.id = p_crew_id and c.deleted_at is null
      and (c.leader_id = auth.uid()
           or exists (
             select 1 from public.crew_members m
             where m.crew_id = c.id and m.user_id = auth.uid()
               and m.status = 'confirmed' and m.deleted_at is null))
  );
$$;
comment on function public.is_on_crew(uuid) is
  'Is the caller the leader of this crew, or a confirmed member of it? The read behind every practice policy.';
revoke execute on function public.is_on_crew(uuid) from public, anon;
grant execute on function public.is_on_crew(uuid) to authenticated;

-- ⚠ the leader of the crew a PRACTICE belongs to — one hop, so the functions
-- below do not each re-type the join
create or replace function public.leads_practice(p_practice_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.crew_practices p
    join public.crews c on c.id = p.crew_id
    where p.id = p_practice_id and p.deleted_at is null
      and c.deleted_at is null and c.leader_id = auth.uid()
  );
$$;
revoke execute on function public.leads_practice(uuid) from public, anon;
grant execute on function public.leads_practice(uuid) to authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.crew_practices enable row level security;
alter table public.crew_practice_people enable row level security;
alter table public.crew_practice_attendance enable row level security;

-- ⚠ NO ANON POLICY ANYWHERE BELOW, and no table grant to anon: a rehearsal
-- schedule is the crew's own. `select` only for `authenticated`; every change
-- goes through the functions.
revoke all on public.crew_practices from anon, authenticated;
revoke all on public.crew_practice_people from anon, authenticated;
revoke all on public.crew_practice_attendance from anon, authenticated;
grant select on public.crew_practices to authenticated;
grant select on public.crew_practice_people to authenticated;
grant select on public.crew_practice_attendance to authenticated;

create policy "the crew reads its practices" on public.crew_practices for select to authenticated
  using (deleted_at is null and public.is_on_crew(crew_id));

-- you read the invitation that names you, always — even after you have left the
-- crew, because "you said you were coming" is a fact about you
create policy "people read their own practice rows" on public.crew_practice_people for select to authenticated
  using (user_id = auth.uid());
create policy "the crew reads who is coming" on public.crew_practice_people for select to authenticated
  using (
    exists (
      select 1 from public.crew_practices p
      where p.id = crew_practice_people.practice_id and p.deleted_at is null and public.is_on_crew(p.crew_id)
    )
  );

create policy "people read their own practice attendance" on public.crew_practice_attendance for select to authenticated
  using (user_id = auth.uid());
create policy "the crew reads who turned up" on public.crew_practice_attendance for select to authenticated
  using (
    exists (
      select 1 from public.crew_practices p
      where p.id = crew_practice_attendance.practice_id and p.deleted_at is null and public.is_on_crew(p.crew_id)
    )
  );

-- No insert/update/delete policies on any of the three: the functions are the
-- only doors, exactly as `crews` and `crew_members` have been since Step 22.

-- ── save_crew_practice — create or edit; creating ASKS the roster ─────────────
create or replace function public.save_crew_practice(
  p_crew_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_place text,
  p_note text default null,
  p_practice_id uuid default null
)
returns public.crew_practices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.crew_practices;
begin
  if not public.is_crew_leader(p_crew_id) then
    raise exception 'only the person who leads this crew can arrange a practice';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'a practice ends after it starts';
  end if;

  if p_practice_id is null then
    insert into public.crew_practices (crew_id, starts_at, ends_at, place, note)
    values (p_crew_id, p_starts_at, p_ends_at, btrim(p_place), nullif(btrim(coalesce(p_note, '')), ''))
    returning * into v_row;

    /* ⚠ EVERY CONFIRMED MEMBER IS ASKED, AND THE LEADER IS NOT. The leader
       arranged it — asking them whether they are coming to their own practice is
       a question with one answer. They are counted present by the register like
       anybody else. */
    insert into public.crew_practice_people (practice_id, user_id)
    select v_row.id, m.user_id
    from public.crew_members m
    where m.crew_id = p_crew_id and m.status = 'confirmed' and m.deleted_at is null
      and m.user_id <> auth.uid();
  else
    if not public.leads_practice(p_practice_id) then
      raise exception 'only the person who leads this crew can change its practice';
    end if;
    /* ⚠ MOVING A PRACTICE DOES NOT RE-ASK ANYBODY. A class re-opens its venue
       request when it moves (18 Sep) because the STUDIO has to agree again; a
       crew member who said they were coming to Tuesday's practice has not
       withdrawn that because it moved an hour. They are told, by the trigger. */
    update public.crew_practices
    set starts_at = p_starts_at,
        ends_at = p_ends_at,
        place = btrim(p_place),
        note = nullif(btrim(coalesce(p_note, '')), '')
    where id = p_practice_id and deleted_at is null
    returning * into v_row;
  end if;

  return v_row;
end;
$$;
comment on function public.save_crew_practice(uuid, timestamptz, timestamptz, text, text, uuid) is
  'The leader arranges or moves a practice. Creating it asks every confirmed member; moving it re-asks nobody.';
revoke execute on function public.save_crew_practice(uuid, timestamptz, timestamptz, text, text, uuid) from public, anon;
grant execute on function public.save_crew_practice(uuid, timestamptz, timestamptz, text, text, uuid) to authenticated;

-- ── cancel_crew_practice — the leader's, and it is a STATUS, not a delete ────
create or replace function public.cancel_crew_practice(p_practice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.leads_practice(p_practice_id) then
    raise exception 'only the person who leads this crew can call off its practice';
  end if;
  /* cancelled rather than deleted: the people who said they were coming need to
     see that it is off, and a row that vanishes tells nobody anything */
  update public.crew_practices set status = 'cancelled' where id = p_practice_id and deleted_at is null;
end;
$$;
revoke execute on function public.cancel_crew_practice(uuid) from public, anon;
grant execute on function public.cancel_crew_practice(uuid) to authenticated;

-- ── respond_to_practice — the person asked, and only them ────────────────────
create or replace function public.respond_to_practice(p_practice_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update public.crew_practice_people
  set status = case when p_accept then 'confirmed' else 'rejected' end
  where practice_id = p_practice_id and user_id = auth.uid() and deleted_at is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'you have not been asked to this practice';
  end if;
end;
$$;
comment on function public.respond_to_practice(uuid, boolean) is
  'Only the person asked answers — the same rule class asks, crew asks and team invites keep.';
revoke execute on function public.respond_to_practice(uuid, boolean) from public, anon;
grant execute on function public.respond_to_practice(uuid, boolean) to authenticated;

-- ── the register — the leader's, exactly as a class register is ──────────────
create or replace function public.check_in_practice(p_practice_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.leads_practice(p_practice_id) then
    raise exception 'only the person who leads this crew runs its register';
  end if;
  if not exists (
    select 1 from public.crew_practices p
    join public.crews c on c.id = p.crew_id
    where p.id = p_practice_id and p.deleted_at is null
      and (c.leader_id = p_user_id
           or exists (select 1 from public.crew_members m
                      where m.crew_id = c.id and m.user_id = p_user_id
                        and m.status = 'confirmed' and m.deleted_at is null))
  ) then
    raise exception 'that person is not on this crew';
  end if;
  /* idempotent, like `check_in`: pressing twice is one attendance */
  insert into public.crew_practice_attendance (practice_id, user_id)
  values (p_practice_id, p_user_id)
  on conflict do nothing;
end;
$$;
revoke execute on function public.check_in_practice(uuid, uuid) from public, anon;
grant execute on function public.check_in_practice(uuid, uuid) to authenticated;

create or replace function public.undo_practice_check_in(p_practice_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.leads_practice(p_practice_id) then
    raise exception 'only the person who leads this crew runs its register';
  end if;
  update public.crew_practice_attendance set deleted_at = now()
  where practice_id = p_practice_id and user_id = p_user_id and deleted_at is null;
end;
$$;
revoke execute on function public.undo_practice_check_in(uuid, uuid) from public, anon;
grant execute on function public.undo_practice_check_in(uuid, uuid) to authenticated;

-- ── what a person's Practice tile and every calendar read ────────────────────
-- ⚠ ONLY THEIR CREWS' PRACTICES (the user's own answer): a practice always
-- belongs to a crew, so there is no solo practice and nothing here is keyed on a
-- person alone. Aggregate-shaped and scoped to auth.uid() inside — there is no
-- p_user_id to aim at anybody else.
create or replace function public.my_crew_practices(p_from timestamptz default null, p_to timestamptz default null)
returns table (
  practice_id uuid,
  crew_id uuid,
  crew_name text,
  crew_style text,
  starts_at timestamptz,
  ends_at timestamptz,
  place text,
  note text,
  status text,
  i_lead boolean,
  my_status text,
  going integer,
  asked integer
)
language sql
security definer
set search_path = ''
stable
as $$
  select p.id,
         c.id,
         c.name,
         c.style,
         p.starts_at,
         p.ends_at,
         p.place,
         p.note,
         p.status,
         (c.leader_id = auth.uid()),
         /* the leader is not asked, so their own answer is "you arranged it" */
         coalesce(pp.status, case when c.leader_id = auth.uid() then 'leader' else 'asked' end),
         (select count(*)::integer from public.crew_practice_people x
          where x.practice_id = p.id and x.status = 'confirmed' and x.deleted_at is null),
         (select count(*)::integer from public.crew_practice_people x
          where x.practice_id = p.id and x.deleted_at is null)
  from public.crew_practices p
  join public.crews c on c.id = p.crew_id and c.deleted_at is null
  left join public.crew_practice_people pp
    on pp.practice_id = p.id and pp.user_id = auth.uid() and pp.deleted_at is null
  where p.deleted_at is null
    and (p_from is null or p.starts_at >= p_from)
    and (p_to is null or p.starts_at <= p_to)
    and (
      c.leader_id = auth.uid()
      or exists (select 1 from public.crew_members m
                 where m.crew_id = c.id and m.user_id = auth.uid()
                   and m.status = 'confirmed' and m.deleted_at is null)
    )
  order by p.starts_at;
$$;
comment on function public.my_crew_practices(timestamptz, timestamptz) is
  'Every practice of every crew the caller leads or is confirmed on. The Practice tile, the crew calendar and a person''s calendar all read this.';
revoke execute on function public.my_crew_practices(timestamptz, timestamptz) from public, anon;
grant execute on function public.my_crew_practices(timestamptz, timestamptz) to authenticated;

-- ── the register's own read: who was asked, what they said, who turned up ────
create or replace function public.practice_people(p_practice_id uuid)
returns table (
  user_id uuid,
  full_name text,
  avatar_path text,
  status text,
  is_leader boolean,
  present boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  with practice as (
    select p.id, p.crew_id, c.leader_id
    from public.crew_practices p
    join public.crews c on c.id = p.crew_id and c.deleted_at is null
    where p.id = p_practice_id and p.deleted_at is null
      and public.is_on_crew(p.crew_id)
  ),
  people as (
    /* the leader first — they arranged it and are never in the asked list */
    select pr.leader_id as uid, 'leader'::text as st, true as lead
    from practice pr
    union all
    select pp.user_id, pp.status, false
    from public.crew_practice_people pp
    join practice pr on pr.id = pp.practice_id
    where pp.deleted_at is null
  )
  select pe.uid,
         pf.full_name,
         pf.profile_photo_path,
         pe.st,
         pe.lead,
         exists (select 1 from public.crew_practice_attendance a
                 where a.practice_id = p_practice_id and a.user_id = pe.uid and a.deleted_at is null)
  from people pe
  join public.profiles pf on pf.id = pe.uid and pf.deleted_at is null
  order by pe.lead desc, pf.full_name;
$$;
comment on function public.practice_people(uuid) is
  'The practice register: who is on it, what they said, and who turned up. Readable by the crew; empty for anybody else.';
revoke execute on function public.practice_people(uuid) from public, anon;
grant execute on function public.practice_people(uuid) to authenticated;

-- ── the two notifications, raised WHERE THE FACT HAPPENS (Step 24's rule) ────
create or replace function public.notify_practice_person()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_crew text;
  v_when timestamptz;
  v_leader uuid;
  v_who text;
begin
  select c.name, p.starts_at, c.leader_id into v_crew, v_when, v_leader
  from public.crew_practices p join public.crews c on c.id = p.crew_id
  where p.id = new.practice_id;

  if tg_op = 'INSERT' then
    perform public.notify(new.user_id, 'people',
      coalesce(v_crew, 'Your crew') || ' has a practice',
      to_char(v_when at time zone 'Asia/Kolkata', 'Dy DD Mon, HH12:MIam') || ' — say whether you are coming.',
      '/crews');
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status in ('confirmed', 'rejected') then
    select pf.full_name into v_who from public.profiles pf where pf.id = new.user_id;
    perform public.notify(v_leader, 'people',
      coalesce(v_who, 'Somebody') || (case when new.status = 'confirmed' then ' is coming' else ' cannot make it' end),
      coalesce(v_crew, 'Your crew') || ' · ' || to_char(v_when at time zone 'Asia/Kolkata', 'Dy DD Mon'),
      '/crews');
  end if;
  return new;
end;
$$;
revoke execute on function public.notify_practice_person() from public, anon, authenticated;

create trigger crew_practice_people_notify
  after insert or update of status on public.crew_practice_people
  for each row execute function public.notify_practice_person();

-- ⚠ AND THE MOVE IS TOLD, which is why moving does not re-ask: the people who
-- said yes are informed rather than asked again.
create or replace function public.notify_practice_moved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_crew text;
begin
  if old.starts_at = new.starts_at and old.place = new.place and old.status = new.status then
    return new;
  end if;
  select c.name into v_crew from public.crews c where c.id = new.crew_id;
  perform public.notify(pp.user_id, 'people',
    case when new.status = 'cancelled' then coalesce(v_crew, 'Your crew') || ' called off a practice'
         else coalesce(v_crew, 'Your crew') || ' moved a practice' end,
    to_char(new.starts_at at time zone 'Asia/Kolkata', 'Dy DD Mon, HH12:MIam') || ' · ' || new.place,
    '/crews')
  from public.crew_practice_people pp
  where pp.practice_id = new.id and pp.deleted_at is null and pp.status <> 'rejected';
  return new;
end;
$$;
revoke execute on function public.notify_practice_moved() from public, anon, authenticated;

create trigger crew_practices_notify_moved
  after update on public.crew_practices
  for each row execute function public.notify_practice_moved();
