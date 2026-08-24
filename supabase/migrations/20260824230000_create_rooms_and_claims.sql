-- Step 11 (Rooms & people): the studio's rooms, the class's people, and the two
-- fields the class form was still missing (room_id, poster).
--
-- Three things the prototype promises and this migration makes true:
--   * "Rooms cap class capacity · no double-booking (server-enforced) · the
--     calendar filters by room" (settings Rooms footnote, 18425). Capacity and
--     the room clash are enforced by triggers, so no insert path can dodge them.
--   * "A DRAFT IS NOT IN ANY ROOM YET" (9729) — only a PUBLISHED class holds its
--     room, so two drafts pencilled into the same slot never block each other.
--   * "An assistant used to be a bare name in a list. It is now a person with a
--     job" (81-91): a claim carries the attendance and refunds powers, and
--     "being on the team is what puts the session on your Assisting side".
--     Consent is real — a claim is ASKED and the person answers (15455: "They
--     are asked to confirm").

-- ── rooms — the studio's floors ───────────────────────────────────────────────
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  capacity integer not null default 20 check (capacity between 1 and 500),
  -- the fixed amenity vocabulary (prototype DOS_AMENITIES, 150-151); the exact
  -- strings are validated server-side by Zod so "AC" and "air conditioning"
  -- can never become two things
  amenities text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);

comment on table public.rooms is
  'A studio''s rooms. One studio = one location, so a room belongs to exactly one tenant. Capacity caps every class held in it.';

create index rooms_tenant_idx on public.rooms (tenant_id) where deleted_at is null;
create unique index rooms_one_live_name_per_tenant
  on public.rooms (tenant_id, lower(trim(name))) where deleted_at is null;

create trigger rooms_set_updated_at
  before update on public.rooms
  for each row execute function public.set_updated_at();

alter table public.rooms enable row level security;

-- members read their tenant's rooms. NO deleted_at filter: a soft-deleting role
-- must be able to SELECT the row it just deleted (Step 3's lesson — PostgREST's
-- internal RETURNING applies SELECT policies to the updated row).
create policy "members read own tenant rooms"
  on public.rooms for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = rooms.tenant_id and m.user_id = auth.uid() and m.deleted_at is null
    )
  );

-- anyone reads the live rooms of a LISTED tenant, so a public class page can say
-- what the room has in it (prototype AT THE STUDIO amenities, 12278-12354)
create policy "anyone reads listed tenant rooms"
  on public.rooms for select
  to anon, authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.tenants t
      where t.id = rooms.tenant_id and t.visibility = 'listed' and t.deleted_at is null
    )
  );

-- rooms are plain studio config, not a seat ledger: owners and trainers edit
-- them directly (no cross-row invariant needs an RPC)
create policy "owners and trainers insert rooms"
  on public.rooms for insert
  to authenticated
  with check (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = rooms.tenant_id and m.user_id = auth.uid()
        and m.member_role in ('owner', 'trainer') and m.deleted_at is null
    )
  );

create policy "owners and trainers update rooms"
  on public.rooms for update
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = rooms.tenant_id and m.user_id = auth.uid()
        and m.member_role in ('owner', 'trainer') and m.deleted_at is null
    )
  );

-- ── the class's new fields ────────────────────────────────────────────────────
alter table public.classes
  add column room_id uuid references public.rooms (id) on delete set null,
  -- a drawn poster design (prototype DOS_POSTERS, 128) or 'none'; null means
  -- "not chosen yet", which the UI answers with dosPosterAuto off the title
  add column poster text check (poster is null or poster in ('bold', 'split', 'quiet', 'none'));

create index classes_room_idx on public.classes (room_id) where deleted_at is null;

comment on column public.classes.room_id is
  'The studio room this class runs in. Resolved from the room name on write, so every insert path gets it. Only a published class holds its room (a draft is not in any room yet).';

-- ── one room, one class at a time ─────────────────────────────────────────────
-- Guards capacity and the room clash for whichever row changed. Only PUBLISHED
-- classes hold a room, so drafts never collide.
create or replace function public.assert_room_ok(p_class_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class public.classes;
  v_room public.rooms;
  v_clash text;
begin
  select * into v_class from public.classes c where c.id = p_class_id and c.deleted_at is null;
  if not found or v_class.room_id is null then
    return;
  end if;

  select * into v_room from public.rooms r where r.id = v_class.room_id and r.deleted_at is null;
  if not found then
    raise exception 'that room no longer exists';
  end if;
  if v_class.tenant_id <> v_room.tenant_id then
    raise exception 'that room belongs to another studio';
  end if;
  if v_class.capacity > v_room.capacity then
    raise exception '% holds % — lower the capacity or pick a bigger room', v_room.name, v_room.capacity;
  end if;

  if v_class.status <> 'published' then
    return; -- a draft is not in any room yet
  end if;

  select c2.title into v_clash
  from public.class_sessions s
  join public.classes c2 on c2.id = s.class_id
  join public.class_sessions s2 on s2.class_id = v_class.id
  where s.class_id <> v_class.id
    and c2.room_id = v_class.room_id
    and c2.status = 'published'
    and c2.deleted_at is null
    and s.deleted_at is null
    and s2.deleted_at is null
    and s.starts_at < s2.ends_at
    and s2.starts_at < s.ends_at
  limit 1;

  if v_clash is not null then
    raise exception '% is already booked then (%)', v_room.name, v_clash;
  end if;
end;
$$;

create or replace function public.classes_room_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- resolve the room from its name when only the name was given (every insert
  -- path gets a room_id without rewriting the creation RPC — the same technique
  -- Step 8 used for share_slug)
  if new.room_id is null and new.room is not null and char_length(trim(new.room)) > 0 then
    select r.id into new.room_id from public.rooms r
      where r.tenant_id = new.tenant_id
        and lower(trim(r.name)) = lower(trim(new.room))
        and r.deleted_at is null
      limit 1;
  end if;
  -- and keep the denormalised name in step with the room actually chosen
  if new.room_id is not null then
    select r.name into new.room from public.rooms r where r.id = new.room_id;
  end if;
  return new;
end;
$$;

create trigger classes_room_guard_before
  before insert or update of room, room_id, capacity, status on public.classes
  for each row execute function public.classes_room_guard();

create or replace function public.classes_room_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_room_ok(new.id);
  return null;
end;
$$;

create constraint trigger classes_room_check_after
  after insert or update of room_id, capacity, status on public.classes
  deferrable initially immediate
  for each row execute function public.classes_room_check();

create or replace function public.sessions_room_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_room_ok(new.class_id);
  return null;
end;
$$;

create constraint trigger sessions_room_check_after
  after insert or update of starts_at, ends_at on public.class_sessions
  deferrable initially immediate
  for each row execute function public.sessions_room_check();

-- ── class_claims — the people on a class, and what they may do ────────────────
create table public.class_claims (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- the person being claimed; profiles, so the page can name them
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('artist', 'assistant')),
  status text not null default 'asked' check (status in ('asked', 'confirmed', 'rejected')),
  -- the jobs an assistant may hold (prototype dosTeamOne, 89-90)
  can_attendance boolean not null default false,
  can_refunds boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);

comment on table public.class_claims is
  'Who is on a class and what they may do. A claim is ASKED and the person answers — a class does not name anybody publicly until they confirm.';

create unique index class_claims_one_live_per_person
  on public.class_claims (class_id, user_id) where deleted_at is null;
-- one artist per class: the person taking it
create unique index class_claims_one_live_artist
  on public.class_claims (class_id) where kind = 'artist' and deleted_at is null;
create index class_claims_user_idx on public.class_claims (user_id) where deleted_at is null;
create index class_claims_tenant_idx on public.class_claims (tenant_id) where deleted_at is null;

create trigger class_claims_set_updated_at
  before update on public.class_claims
  for each row execute function public.set_updated_at();

alter table public.class_claims enable row level security;

-- the person asked reads their own claims (no deleted_at filter — same lesson)
create policy "users read own claims"
  on public.class_claims for select
  to authenticated
  using (user_id = auth.uid());

-- the studio's people read their tenant's claims
create policy "members read own tenant claims"
  on public.class_claims for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = class_claims.tenant_id and m.user_id = auth.uid() and m.deleted_at is null
    )
  );

-- anyone reads CONFIRMED claims on a published class of a listed tenant, so the
-- public page can print the artist and the assistants — and nobody else's name
create policy "anyone reads confirmed claims on public classes"
  on public.class_claims for select
  to anon, authenticated
  using (
    deleted_at is null
    and status = 'confirmed'
    and exists (
      select 1 from public.classes c
      join public.tenants t on t.id = c.tenant_id
      where c.id = class_claims.class_id
        and c.status = 'published'
        and c.deleted_at is null
        and t.visibility = 'listed'
        and t.deleted_at is null
    )
  );

-- No direct writes: asking, answering and withdrawing go through the RPCs, so
-- consent can never be forged (nobody may confirm their own claim on behalf of
-- someone else, and nobody may hand themselves a job).

-- ── claim_person — the studio asks somebody onto the class ────────────────────
create or replace function public.claim_person(
  p_class_id uuid,
  p_user_id uuid,
  p_kind text,
  p_can_attendance boolean default false,
  p_can_refunds boolean default false
)
returns public.class_claims
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_class public.classes;
  v_row public.class_claims;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_kind not in ('artist', 'assistant') then
    raise exception 'invalid kind';
  end if;

  select * into v_class from public.classes c where c.id = p_class_id and c.deleted_at is null;
  if not found then
    raise exception 'class not found';
  end if;
  if not exists (
    select 1 from public.tenant_members m
    where m.tenant_id = v_class.tenant_id and m.user_id = v_user
      and m.member_role in ('owner', 'trainer') and m.deleted_at is null
  ) then
    raise exception 'only the studio''s owner or trainer puts people on a class';
  end if;
  -- you can only claim your own team: consent starts from a real relationship
  if not exists (
    select 1 from public.tenant_members m
    where m.tenant_id = v_class.tenant_id and m.user_id = p_user_id and m.deleted_at is null
  ) then
    raise exception 'that person is not on your team';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id and p.deleted_at is null) then
    raise exception 'that person has not finished onboarding';
  end if;

  -- asking again after a withdrawal or a no is a fresh ask
  update public.class_claims
    set deleted_at = now(), updated_by = v_user
    where class_id = p_class_id and user_id = p_user_id and deleted_at is null;

  insert into public.class_claims (class_id, tenant_id, user_id, kind, status,
                                   can_attendance, can_refunds, created_by, updated_by)
  values (p_class_id, v_class.tenant_id, p_user_id, p_kind, 'asked',
          coalesce(p_can_attendance, false), coalesce(p_can_refunds, false), v_user, v_user)
  returning * into v_row;
  return v_row;
end;
$$;

-- ── respond_to_claim — only the person asked can answer ───────────────────────
create or replace function public.respond_to_claim(p_claim_id uuid, p_accept boolean)
returns public.class_claims
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.class_claims;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_row from public.class_claims cc
    where cc.id = p_claim_id and cc.user_id = v_user and cc.deleted_at is null;
  if not found then
    raise exception 'that ask is not yours to answer';
  end if;
  update public.class_claims
    set status = case when p_accept then 'confirmed' else 'rejected' end, updated_by = v_user
    where id = v_row.id
    returning * into v_row;
  return v_row;
end;
$$;

-- ── withdraw_claim / set_claim_powers — the studio's side ─────────────────────
create or replace function public.withdraw_claim(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.class_claims;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_row from public.class_claims cc
    where cc.id = p_claim_id and cc.deleted_at is null;
  if not found then
    raise exception 'claim not found';
  end if;
  if not exists (
    select 1 from public.tenant_members m
    where m.tenant_id = v_row.tenant_id and m.user_id = v_user
      and m.member_role in ('owner', 'trainer') and m.deleted_at is null
  ) then
    raise exception 'only the studio''s owner or trainer manages the class team';
  end if;
  update public.class_claims
    set deleted_at = now(), updated_by = v_user
    where id = v_row.id;
end;
$$;

create or replace function public.set_claim_powers(
  p_claim_id uuid,
  p_can_attendance boolean,
  p_can_refunds boolean
)
returns public.class_claims
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.class_claims;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_row from public.class_claims cc
    where cc.id = p_claim_id and cc.deleted_at is null;
  if not found then
    raise exception 'claim not found';
  end if;
  if not exists (
    select 1 from public.tenant_members m
    where m.tenant_id = v_row.tenant_id and m.user_id = v_user
      and m.member_role in ('owner', 'trainer') and m.deleted_at is null
  ) then
    raise exception 'only the studio''s owner or trainer hands out jobs';
  end if;
  update public.class_claims
    set can_attendance = coalesce(p_can_attendance, false),
        can_refunds = coalesce(p_can_refunds, false),
        updated_by = v_user
    where id = v_row.id
    returning * into v_row;
  return v_row;
end;
$$;

-- ── an assistant handed attendance gets the register ──────────────────────────
-- Step 10 left this note in place: can_run_register admitted owner|trainer only,
-- "assistant claims arrive with Step 11's people work". They have arrived. The
-- register now also opens for a CONFIRMED claim holding the attendance job —
-- per class, which is exactly how the prototype scopes it (12390: "you hold
-- attendance"). Same signature, so check_in/undo_check_in/give_spot pick it up
-- for free; those pass the tenant, so the class-scoped variant is used here.
create or replace function public.can_run_register_for_class(p_class_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.classes c
    join public.tenant_members m on m.tenant_id = c.tenant_id
    where c.id = p_class_id
      and m.user_id = auth.uid()
      and m.member_role in ('owner', 'trainer')
      and m.deleted_at is null
      and c.deleted_at is null
  ) or exists (
    select 1 from public.class_claims cc
    where cc.class_id = p_class_id
      and cc.user_id = auth.uid()
      and cc.status = 'confirmed'
      and cc.can_attendance = true
      and cc.deleted_at is null
  );
$$;

-- check_in / undo_check_in / give_spot / remove_from_waitlist re-pointed at the
-- class-scoped check. Bodies are otherwise unchanged from Step 10.
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
  if not public.can_run_register_for_class(v_enr.class_id) then
    raise exception 'only the studio''s owner, trainer, or an assistant holding attendance runs the register';
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
    return v_row;
  end if;

  insert into public.attendance (enrollment_id, session_id, class_id, tenant_id, user_id,
                                 created_by, updated_by)
  values (v_enr.id, v_enr.session_id, v_enr.class_id, v_enr.tenant_id, v_enr.user_id,
          v_user, v_user)
  returning * into v_row;
  return v_row;
end;
$$;

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
  if not public.can_run_register_for_class(v_row.class_id) then
    raise exception 'only the studio''s owner, trainer, or an assistant holding attendance runs the register';
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
  if not public.can_run_register_for_class(v_enr.class_id) then
    raise exception 'only the studio''s owner, trainer, or an assistant holding attendance manages the waitlist';
  end if;

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
  if not public.can_run_register_for_class(v_enr.class_id) then
    raise exception 'only the studio''s owner, trainer, or an assistant holding attendance manages the waitlist';
  end if;
  update public.enrollments
    set status = 'cancelled', updated_by = v_user
    where id = v_enr.id;
end;
$$;

-- ── creation takes the room and the poster ────────────────────────────────────
-- The two new parameters DEFAULT to null, so the ten-argument callers that
-- already exist (the earlier proof scripts, the webhook e2e) keep working
-- against the one creation path.
drop function if exists public.create_class_with_session(
  uuid, text, text, text, text, integer, integer, text, timestamptz, timestamptz);

create or replace function public.create_class_with_session(
  p_tenant_id uuid,
  p_title text,
  p_style text,
  p_level text,
  p_room text,
  p_price_inr integer,
  p_capacity integer,
  p_status text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_room_id uuid default null,
  p_poster text default null
) returns public.classes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_class public.classes;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.tenant_members m
    where m.tenant_id = p_tenant_id
      and m.user_id = v_user
      and m.member_role in ('owner', 'trainer')
      and m.deleted_at is null
  ) then
    raise exception 'not allowed for this tenant';
  end if;
  if p_title is null or char_length(trim(p_title)) = 0 then
    raise exception 'title is required';
  end if;
  if p_status not in ('draft', 'published') then
    raise exception 'invalid status';
  end if;
  if p_level not in ('all', 'beginner', 'intermediate', 'professional') then
    raise exception 'invalid level';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'invalid schedule';
  end if;
  if p_poster is not null and p_poster not in ('bold', 'split', 'quiet', 'none') then
    raise exception 'invalid poster';
  end if;
  if p_room_id is not null and not exists (
    select 1 from public.rooms r
    where r.id = p_room_id and r.tenant_id = p_tenant_id and r.deleted_at is null
  ) then
    raise exception 'that room belongs to another studio';
  end if;

  insert into public.classes (tenant_id, title, style, level, room, room_id, poster,
                              price_inr, capacity, status, created_by, updated_by)
  values (p_tenant_id, trim(p_title), trim(p_style), p_level, nullif(trim(p_room), ''),
          p_room_id, p_poster, coalesce(p_price_inr, 0), p_capacity, p_status, v_user, v_user)
  returning * into v_class;

  insert into public.class_sessions (class_id, tenant_id, starts_at, ends_at, created_by, updated_by)
  values (v_class.id, p_tenant_id, p_starts_at, p_ends_at, v_user, v_user);

  return v_class;
end;
$$;

-- ── grants ────────────────────────────────────────────────────────────────────
revoke execute on function public.create_class_with_session(
  uuid, text, text, text, text, integer, integer, text, timestamptz, timestamptz, uuid, text) from public, anon;
grant execute on function public.create_class_with_session(
  uuid, text, text, text, text, integer, integer, text, timestamptz, timestamptz, uuid, text) to authenticated;

revoke execute on function public.claim_person(uuid, uuid, text, boolean, boolean) from public, anon;
grant execute on function public.claim_person(uuid, uuid, text, boolean, boolean) to authenticated;
revoke execute on function public.respond_to_claim(uuid, boolean) from public, anon;
grant execute on function public.respond_to_claim(uuid, boolean) to authenticated;
revoke execute on function public.withdraw_claim(uuid) from public, anon;
grant execute on function public.withdraw_claim(uuid) to authenticated;
revoke execute on function public.set_claim_powers(uuid, boolean, boolean) from public, anon;
grant execute on function public.set_claim_powers(uuid, boolean, boolean) to authenticated;
revoke execute on function public.can_run_register_for_class(uuid) from public, anon;
grant execute on function public.can_run_register_for_class(uuid) to authenticated;
revoke execute on function public.assert_room_ok(uuid) from public, anon, authenticated;
