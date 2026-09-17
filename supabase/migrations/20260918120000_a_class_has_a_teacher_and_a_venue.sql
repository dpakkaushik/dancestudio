-- A CLASS HAS A TEACHER WHO SAID YES, AND A PLACE THAT SAID YES (18 Sep 2026).
--
-- The user, on the class form, in one message and four answers:
--   * a STUDIO's class: WHERE is one of its own rooms; WHO IS TAKING IT is any
--     user or artist on DanceOS, ASKED; "all classes when submitting should only
--     go in drafts and can only be published once the who is taking the class
--     accepts". Only the OWNER creates and edits a studio's classes.
--   * an ARTIST's class: the artist is the teacher, so the form does not ask;
--     WHERE is either a STUDIO with one of its rooms — "should send a request to
--     the studio for accepting … should not be published till the studio accepts
--     the request" — or a MAP LINK, where the artist "should be able to set
--     capacity on their own and can publish directly". "An artist should not
--     create form on behalf of a studio."
--   * ASSISTANTS leave the form; "both teacher and studio can add assistants",
--     each addition an ask; "assistant approvals not required to publish".
--   * "an outsider teacher who accepts becomes Visiting Faculty in Team."
--   * the rule lives in the database and the tests are rewritten to match.
--
-- The Inbox has said "this class stays a draft until they confirm" since 28 Aug
-- and the notification to the person says the same; nothing enforced it. Now
-- the database does, for every door.
--
-- ⚠ Rule 9: RLS and consent. Two UPDATE policies are narrowed to the owner, two
-- SELECT policies are added for a venue's team, one CHECK gains a value, five
-- functions are replaced with their exact signatures, one is dropped and
-- recreated with four more defaulted arguments (Rule 4: never two overloads),
-- and four are new. Every grant is stated.

-- ── 1. where an artist's class happens ───────────────────────────────────────
alter table public.classes
  add column venue_business_id uuid references public.businesses (id) on delete set null,
  add column venue_status text check (venue_status is null or venue_status in ('requested', 'accepted', 'declined')),
  add column lat double precision,
  add column lng double precision,
  add column maps_url text check (maps_url is null or maps_url ~* '^https?://');

comment on column public.classes.venue_business_id is
  'An artist''s class held in a STUDIO''s room: that studio (18 Sep 2026). Null for a studio''s own class and for an artist''s class at a map link. room_id then points at one of the VENUE''s rooms.';
comment on column public.classes.venue_status is
  'The venue studio''s answer: requested → accepted | declined. A class with a venue cannot be published until it is accepted. Reset to requested when the venue or the room changes.';
comment on column public.classes.maps_url is
  'An artist''s class at a place of their own — the map link, with lat/lng. Such a class publishes without anybody''s yes.';

create index classes_venue_idx on public.classes (venue_business_id) where deleted_at is null and venue_business_id is not null;

-- ── 2. a fourth kind of team member ──────────────────────────────────────────
do $$
declare
  v_name text;
begin
  select conname into v_name
    from pg_constraint
   where conrelid = 'public.business_members'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%member_role%';
  if v_name is not null then
    execute format('alter table public.business_members drop constraint %I', v_name);
  end if;
end $$;
alter table public.business_members
  add constraint business_members_member_role_check
  check (member_role in ('owner', 'trainer', 'staff', 'visiting_faculty'));
comment on column public.business_members.member_role is
  'owner | trainer (the screen says Faculty) | staff | visiting_faculty — a person from outside the team who accepted a studio''s ask to teach one of its classes (18 Sep 2026). Never invited into directly; accepting the class seats them.';

create or replace function public.set_member_role(
  p_business_id uuid,
  p_user_id uuid,
  p_role text
) returns public.business_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_member public.business_members;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_business_owner(p_business_id) then
    raise exception 'only the studio owner changes what somebody may do';
  end if;
  if p_role not in ('trainer', 'staff', 'visiting_faculty') then
    raise exception 'a member may be faculty, visiting faculty or staff - owner cannot be granted';
  end if;
  select * into v_member from public.business_members m
   where m.business_id = p_business_id and m.user_id = p_user_id and m.deleted_at is null;
  if v_member.id is null then
    raise exception 'they are not on your team';
  end if;
  if v_member.member_role = 'owner' then
    raise exception 'an owner''s role cannot be changed here';
  end if;
  update public.business_members
     set member_role = p_role, updated_by = v_user
   where id = v_member.id
   returning * into v_member;
  return v_member;
end;
$$;

-- ── 3. a room may be the VENUE's ─────────────────────────────────────────────
-- The room-name resolver and the capacity/clash guard both assumed the room
-- belongs to the class's own business. An artist's class in a studio's room is
-- owned by the artist page and held in the studio: the room is the venue's.
create or replace function public.classes_room_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.room_id is null and new.room is not null and char_length(trim(new.room)) > 0 then
    select r.id into new.room_id from public.rooms r
      where r.business_id = coalesce(new.venue_business_id, new.business_id)
        and lower(trim(r.name)) = lower(trim(new.room))
        and r.deleted_at is null
      limit 1;
  end if;
  if new.room_id is not null then
    select r.name into new.room from public.rooms r where r.id = new.room_id;
  end if;
  return new;
end;
$$;

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
  -- the class's own room, or its venue's (18 Sep 2026)
  if v_room.business_id <> v_class.business_id and v_room.business_id is distinct from v_class.venue_business_id then
    raise exception 'that room belongs to another studio';
  end if;
  if v_class.capacity > v_room.capacity then
    raise exception '% holds % — lower the capacity or pick a bigger room', v_room.name, v_room.capacity;
  end if;
  if v_class.status <> 'published' then
    return; -- a draft is not in any room yet
  end if;
  -- the clash check is by ROOM, whoever owns the classes in it: a studio can
  -- never publish into a slot an artist's accepted class already holds, nor the
  -- other way round
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

-- moving a class to another room or studio is a new ask; a published class
-- comes off the calendar first
create or replace function public.classes_venue_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.venue_business_id is distinct from old.venue_business_id
     or (new.venue_business_id is not null and new.room_id is distinct from old.room_id) then
    if old.status = 'published' and new.status = 'published' then
      raise exception 'take the class off the calendar before moving it to another room or studio';
    end if;
    new.venue_status := case when new.venue_business_id is null then null else 'requested' end;
  end if;
  return new;
end;
$$;
revoke execute on function public.classes_venue_changes() from public, anon, authenticated;
create trigger classes_venue_changes_before
  before update of venue_business_id, room_id on public.classes
  for each row execute function public.classes_venue_changes();

-- ── 4. what stands between a class and Publish — ONE sentence ────────────────
create or replace function public.class_publish_blocker(
  p_type text,
  p_venue_business_id uuid,
  p_venue_status text,
  p_lat double precision,
  p_maps_url text,
  p_capacity integer,
  p_has_teacher boolean
) returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_venue text;
begin
  if p_type = 'studio' then
    if not coalesce(p_has_teacher, false) then
      return 'Publish waits for the teacher — nobody has accepted this class yet';
    end if;
    return null;
  end if;
  if p_type = 'artist_page' then
    if p_venue_business_id is not null then
      select b.name into v_venue from public.businesses b where b.id = p_venue_business_id;
      if p_venue_status = 'accepted' then
        return null;
      elsif p_venue_status = 'declined' then
        return coalesce(v_venue, 'The studio') || ' declined the room — pick another studio, or a place of your own';
      else
        return 'Publish waits for ' || coalesce(v_venue, 'the studio') || ' to accept the room';
      end if;
    end if;
    if p_lat is null and nullif(trim(coalesce(p_maps_url, '')), '') is null then
      return 'Say where it happens — a studio and its room, or a map link';
    end if;
    if coalesce(p_capacity, 0) < 1 then
      return 'Say how many people can book';
    end if;
    return null;
  end if;
  return null;
end;
$$;
revoke execute on function public.class_publish_blocker(text, uuid, text, double precision, text, integer, boolean) from public, anon, authenticated;

/** The sentence for a stored class, for a screen to print before Publish is
 *  pressed — null means "go ahead" (the why_no_event / why_no_class shape). */
create or replace function public.why_no_publish(p_class_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_class public.classes;
  v_type text;
  v_teacher boolean;
begin
  select * into v_class from public.classes c where c.id = p_class_id and c.deleted_at is null;
  if not found then
    return 'That class does not exist';
  end if;
  if not public.is_business_member(v_class.business_id) then
    raise exception 'not your class';
  end if;
  select b.type into v_type from public.businesses b where b.id = v_class.business_id;
  v_teacher := exists (
    select 1 from public.class_people cp
     where cp.class_id = v_class.id and cp.kind = 'artist' and cp.status = 'confirmed' and cp.deleted_at is null);
  return public.class_publish_blocker(v_type, v_class.venue_business_id, v_class.venue_status, v_class.lat, v_class.maps_url, v_class.capacity, v_teacher);
end;
$$;
comment on function public.why_no_publish(uuid) is
  'The one sentence between a class and Publish, or null (18 Sep 2026): a studio''s class waits for its teacher''s yes; an artist''s class at a studio waits for the studio''s; an artist''s class at a map link needs the link and a capacity. The trigger classes_publish_needs_a_yes raises the same words.';
revoke execute on function public.why_no_publish(uuid) from public, anon;
grant execute on function public.why_no_publish(uuid) to authenticated;

/** THE RULE ITSELF. BEFORE INSERT OR UPDATE OF status: a row arriving published,
 *  or moving to published, is refused with the sentence above. A class already
 *  published is left alone, so an edit never unpublishes anything. A studio's
 *  class arriving published at INSERT can have no teacher yet — so the form
 *  saves drafts, as the user asked ("all classes when submitting should only go
 *  in drafts"). An artist's class at a map link may arrive published. */
create or replace function public.guard_class_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
  v_teacher boolean := false;
  v_why text;
begin
  if new.status <> 'published' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'published' then
    return new;
  end if;
  select b.type into v_type from public.businesses b where b.id = new.business_id;
  if tg_op = 'UPDATE' then
    v_teacher := exists (
      select 1 from public.class_people cp
       where cp.class_id = new.id and cp.kind = 'artist' and cp.status = 'confirmed' and cp.deleted_at is null);
  end if;
  v_why := public.class_publish_blocker(v_type, new.venue_business_id, new.venue_status, new.lat, new.maps_url, new.capacity, v_teacher);
  if v_why is not null then
    raise exception '%', v_why;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_class_publish() from public, anon, authenticated;
drop trigger if exists classes_publish_needs_a_yes on public.classes;
create trigger classes_publish_needs_a_yes
  before insert or update of status on public.classes
  for each row execute function public.guard_class_publish();

/** What the register draws on every row (18 Sep 2026): who was asked to teach
 *  and what they said, which studio was asked for its room and what it said,
 *  and the one sentence still in the way. One call for a whole business; the
 *  caller must be on its team. */
create or replace function public.classes_publish_state(p_business_id uuid)
returns table (
  class_id uuid,
  teacher_user_id uuid,
  teacher_name text,
  teacher_status text,
  venue_business_id uuid,
  venue_name text,
  venue_status text,
  why text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  if not public.is_business_member(p_business_id) then
    raise exception 'not your business';
  end if;
  select b.type into v_type from public.businesses b where b.id = p_business_id;
  return query
    select c.id,
           cp.user_id,
           p.full_name,
           cp.status,
           c.venue_business_id,
           vb.name,
           c.venue_status,
           public.class_publish_blocker(v_type, c.venue_business_id, c.venue_status, c.lat, c.maps_url, c.capacity, cp.status = 'confirmed')
      from public.classes c
      left join public.class_people cp on cp.class_id = c.id and cp.kind = 'artist' and cp.deleted_at is null
      left join public.profiles p on p.id = cp.user_id
      left join public.businesses vb on vb.id = c.venue_business_id
     where c.business_id = p_business_id and c.deleted_at is null;
end;
$$;
revoke execute on function public.classes_publish_state(uuid) from public, anon;
grant execute on function public.classes_publish_state(uuid) to authenticated;

-- ── 5. who creates, who is asked, who answers ────────────────────────────────
-- create_class_with_session: the OWNER alone; four new defaulted arguments (the
-- venue, the pin, the link); an artist's own class carries its teacher from
-- birth. Dropped and recreated — two overloads of one name is how PostgREST
-- stops finding either — every existing 10-to-12-argument caller still resolves.
drop function if exists public.create_class_with_session(
  uuid, text, text, text, text, integer, integer, text, timestamptz, timestamptz, uuid, text);

create or replace function public.create_class_with_session(
  p_business_id uuid,
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
  p_poster text default null,
  p_venue_business_id uuid default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_maps_url text default null
) returns public.classes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_class public.classes;
  v_type text;
  v_venue_type text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  -- WHO CREATES (18 Sep 2026): the owner alone. Until today a trainer could
  -- create a class on the studio's behalf; the user: "an artist should not
  -- create form on behalf of a studio".
  if not public.is_business_owner(p_business_id) then
    raise exception 'only the owner creates classes here';
  end if;
  select b.type into v_type from public.businesses b where b.id = p_business_id and b.deleted_at is null;
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

  if p_venue_business_id is not null then
    -- an ARTIST asks a STUDIO for one of its rooms; the class waits for the answer
    if v_type <> 'artist_page' then
      raise exception 'a studio holds its classes in its own rooms — a venue is for an artist''s class';
    end if;
    select b.type into v_venue_type from public.businesses b where b.id = p_venue_business_id and b.deleted_at is null;
    if v_venue_type is distinct from 'studio' then
      raise exception 'the venue has to be a studio';
    end if;
    if p_room_id is null or not exists (
      select 1 from public.rooms r where r.id = p_room_id and r.business_id = p_venue_business_id and r.deleted_at is null
    ) then
      raise exception 'pick one of the studio''s rooms';
    end if;
    if p_status <> 'draft' then
      raise exception 'a class at a studio is saved as a draft until the studio accepts the room';
    end if;
  elsif p_room_id is not null and not exists (
    select 1 from public.rooms r where r.id = p_room_id and r.business_id = p_business_id and r.deleted_at is null
  ) then
    raise exception 'that room belongs to another studio';
  end if;

  insert into public.classes (business_id, title, style, level, room, room_id, poster,
                              price_inr, capacity, status,
                              venue_business_id, venue_status, lat, lng, maps_url,
                              created_by, updated_by)
  values (p_business_id, trim(p_title), trim(p_style), p_level, nullif(trim(p_room), ''), p_room_id, p_poster,
          coalesce(p_price_inr, 0), p_capacity, p_status,
          p_venue_business_id, case when p_venue_business_id is null then null else 'requested' end,
          p_lat, p_lng, nullif(trim(coalesce(p_maps_url, '')), ''),
          v_user, v_user)
  returning * into v_class;

  insert into public.class_sessions (class_id, business_id, starts_at, ends_at, created_by, updated_by)
  values (v_class.id, p_business_id, p_starts_at, p_ends_at, v_user, v_user);

  -- AN ARTIST TEACHES THEIR OWN CLASS: the page's owner is its teacher, confirmed
  -- by construction, so the class page, the calendar's Teach side and the record
  -- all see a teacher without anybody being asked
  if v_type = 'artist_page' then
    insert into public.class_people (class_id, business_id, user_id, kind, status,
                                     can_attendance, can_refunds, pay_per_session_inr, created_by, updated_by)
    values (v_class.id, p_business_id, v_user, 'artist', 'confirmed', true, true, 0, v_user, v_user);
  end if;

  return v_class;
end;
$$;
revoke execute on function public.create_class_with_session(
  uuid, text, text, text, text, integer, integer, text, timestamptz, timestamptz, uuid, text, uuid, double precision, double precision, text) from public, anon;
grant execute on function public.create_class_with_session(
  uuid, text, text, text, text, integer, integer, text, timestamptz, timestamptz, uuid, text, uuid, double precision, double precision, text) to authenticated;

-- ask_class_person: the TEACHER is the owner's to choose, from anybody on
-- DanceOS (it used to be "your own team only"); an ASSISTANT is the owner's or
-- the teacher's to add. The jobs (attendance, refunds) and the pay stay the
-- owner's to hand out — a teacher's ask carries none.
create or replace function public.ask_class_person(
  p_class_id uuid,
  p_user_id uuid,
  p_kind text,
  p_can_attendance boolean default false,
  p_can_refunds boolean default false,
  p_pay_per_session_inr integer default 0
) returns public.class_people
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_class public.classes;
  v_row public.class_people;
  v_owner boolean;
  v_teacher boolean;
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
  v_owner := public.is_business_owner(v_class.business_id);
  v_teacher := exists (
    select 1 from public.class_people cp
     where cp.class_id = p_class_id and cp.user_id = v_user and cp.kind = 'artist'
       and cp.status = 'confirmed' and cp.deleted_at is null);
  if p_kind = 'artist' and not v_owner then
    raise exception 'only the owner chooses who takes a class';
  end if;
  if p_kind = 'assistant' and not (v_owner or v_teacher) then
    raise exception 'only the owner, or the person taking this class, adds assistants';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id and p.deleted_at is null) then
    raise exception 'that person has not finished onboarding';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_user_id and p.role = 'org') then
    raise exception 'an organization does not take a class — ask a person';
  end if;
  if p_kind = 'assistant' and exists (
    select 1 from public.class_people cp
     where cp.class_id = p_class_id and cp.user_id = p_user_id and cp.kind = 'artist'
       and cp.status = 'confirmed' and cp.deleted_at is null) then
    raise exception 'the person taking the class is not their own assistant';
  end if;
  if coalesce(p_pay_per_session_inr, 0) <> 0 and not v_owner then
    raise exception 'only the studio owner sets what a session pays';
  end if;

  -- asking again after a withdrawal or a no is a fresh ask
  update public.class_people
     set deleted_at = now(), updated_by = v_user
   where class_id = p_class_id and user_id = p_user_id and deleted_at is null;

  insert into public.class_people (class_id, business_id, user_id, kind, status,
                                   can_attendance, can_refunds, pay_per_session_inr,
                                   created_by, updated_by)
  values (p_class_id, v_class.business_id, p_user_id, p_kind, 'asked',
          case when v_owner then coalesce(p_can_attendance, false) else false end,
          case when v_owner then coalesce(p_can_refunds, false) else false end,
          coalesce(p_pay_per_session_inr, 0), v_user, v_user)
  returning * into v_row;
  return v_row;
end;
$$;

-- respond_to_class_ask: only the person asked answers, as before — and an
-- outside TEACHER who says yes to a STUDIO's class joins its team as visiting
-- faculty, so the register they teach opens for them the way it opens for any
-- live member holding the job (can_run_register_for_class, 25 Aug 2026).
create or replace function public.respond_to_class_ask(p_class_person_id uuid, p_accept boolean)
returns public.class_people
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.class_people;
  v_type text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_row from public.class_people cp
   where cp.id = p_class_person_id and cp.user_id = v_user and cp.deleted_at is null;
  if not found then
    raise exception 'that ask is not yours to answer';
  end if;
  update public.class_people
     set status = case when p_accept then 'confirmed' else 'rejected' end, updated_by = v_user
   where id = v_row.id
   returning * into v_row;

  if p_accept and v_row.kind = 'artist' then
    select b.type into v_type from public.businesses b where b.id = v_row.business_id;
    if v_type = 'studio' and not exists (
      select 1 from public.business_members m
       where m.business_id = v_row.business_id and m.user_id = v_user and m.deleted_at is null
    ) then
      insert into public.business_members (business_id, user_id, member_role, created_by, updated_by)
      values (v_row.business_id, v_user, 'visiting_faculty', v_user, v_user);
    end if;
  end if;
  return v_row;
end;
$$;

-- withdraw_class_ask: the owner's, or the teacher's for an assistant they asked
create or replace function public.withdraw_class_ask(p_class_person_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.class_people;
  v_teacher boolean;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_row from public.class_people cp
   where cp.id = p_class_person_id and cp.deleted_at is null;
  if not found then
    raise exception 'claim not found';
  end if;
  v_teacher := exists (
    select 1 from public.class_people cp
     where cp.class_id = v_row.class_id and cp.user_id = v_user and cp.kind = 'artist'
       and cp.status = 'confirmed' and cp.deleted_at is null);
  if not (public.is_business_owner(v_row.business_id) or (v_teacher and v_row.kind = 'assistant')) then
    raise exception 'only the owner — or the teacher, for an assistant — withdraws an ask';
  end if;
  update public.class_people
     set deleted_at = now(), updated_by = v_user
   where id = v_row.id;
end;
$$;

-- set_class_person_powers: the jobs are the OWNER's to hand out
create or replace function public.set_class_person_powers(
  p_class_person_id uuid,
  p_can_attendance boolean,
  p_can_refunds boolean
) returns public.class_people
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.class_people;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_row from public.class_people cp
   where cp.id = p_class_person_id and cp.deleted_at is null;
  if not found then
    raise exception 'claim not found';
  end if;
  if not public.is_business_owner(v_row.business_id) then
    raise exception 'only the owner hands out jobs on a class';
  end if;
  update public.class_people
     set can_attendance = coalesce(p_can_attendance, false),
         can_refunds = coalesce(p_can_refunds, false),
         updated_by = v_user
   where id = v_row.id
   returning * into v_row;
  return v_row;
end;
$$;

-- ── 6. the venue's answer ────────────────────────────────────────────────────
create or replace function public.respond_to_venue_request(p_class_id uuid, p_accept boolean)
returns public.classes
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
  select * into v_class from public.classes c
   where c.id = p_class_id and c.deleted_at is null and c.venue_business_id is not null;
  if not found then
    raise exception 'no room was asked for on that class';
  end if;
  if not public.is_business_owner(v_class.venue_business_id) then
    raise exception 'only the studio''s owner answers for its rooms';
  end if;
  if v_class.venue_status <> 'requested' then
    raise exception 'this request has already been answered';
  end if;
  update public.classes
     set venue_status = case when p_accept then 'accepted' else 'declined' end, updated_by = v_user
   where id = v_class.id
   returning * into v_class;
  return v_class;
end;
$$;
comment on function public.respond_to_venue_request(uuid, boolean) is
  'The venue studio''s OWNER accepts or declines an artist''s ask for one of its rooms (18 Sep 2026). Accepted lets the artist publish; declined sends them to pick another studio or a place of their own.';
revoke execute on function public.respond_to_venue_request(uuid, boolean) from public, anon;
grant execute on function public.respond_to_venue_request(uuid, boolean) to authenticated;

-- the ask reaches the studio's owners; the answer reaches the artist (the
-- notifications pattern of 28 Aug: raised where the fact happens, never fatal)
create or replace function public.notify_venue_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_venue text;
  v_artist text;
  v_label text;
begin
  if new.venue_business_id is null then
    return null;
  end if;
  v_label := coalesce(new.title, 'a class');
  select b.name into v_venue from public.businesses b where b.id = new.venue_business_id;
  select b.name into v_artist from public.businesses b where b.id = new.business_id;
  if (tg_op = 'INSERT' and new.venue_status = 'requested')
     or (tg_op = 'UPDATE' and new.venue_status = 'requested' and old.venue_status is distinct from 'requested') then
    for v_owner in
      select m.user_id from public.business_members m
       where m.business_id = new.venue_business_id and m.member_role = 'owner' and m.deleted_at is null
    loop
      perform public.notify(v_owner, 'classes',
        coalesce(v_artist, 'An artist') || ' asks to hold ' || v_label || ' in ' || coalesce(new.room, 'a room') || ' at ' || coalesce(v_venue, 'your studio'),
        'Accept or decline it in your Inbox — the class stays a draft until you do.', '/inbox');
    end loop;
  elsif tg_op = 'UPDATE' and old.venue_status = 'requested' and new.venue_status in ('accepted', 'declined') then
    for v_owner in
      select m.user_id from public.business_members m
       where m.business_id = new.business_id and m.member_role = 'owner' and m.deleted_at is null
    loop
      perform public.notify(v_owner, 'classes',
        coalesce(v_venue, 'The studio') || (case new.venue_status when 'accepted' then ' accepted ' else ' declined ' end) || v_label || ' in ' || coalesce(new.room, 'their room'),
        case new.venue_status when 'accepted' then 'You can publish it now.' else 'Pick another studio, or a place of your own.' end,
        '/my-classes?show=manage');
    end loop;
  end if;
  return null;
end;
$$;
revoke execute on function public.notify_venue_request() from public, anon, authenticated;
drop trigger if exists notify_venue_request on public.classes;
create trigger notify_venue_request
  after insert or update on public.classes
  for each row execute function public.notify_venue_request();

-- ── 7. RLS: the owner edits; the venue's team reads ──────────────────────────
-- Only the OWNER updates a class or its session now (publish, reschedule, the
-- poster, soft delete). Trainers lose it, as the user asked.
drop policy if exists "owners and trainers update own classes" on public.classes;
create policy "owners update own classes"
  on public.classes for update
  to authenticated
  using (deleted_at is null and public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

drop policy if exists "owners and trainers update own sessions" on public.class_sessions;
create policy "owners update own sessions"
  on public.class_sessions for update
  to authenticated
  using (deleted_at is null and public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

-- A studio whose room an artist asked for reads that class and its sessions:
-- the request in its Inbox, the class on its calendar and its public schedule,
-- the room held against double booking.
create policy "venue members read classes hosted at their studio"
  on public.classes for select
  to authenticated
  using (deleted_at is null and venue_business_id is not null and public.is_business_member(venue_business_id));

create policy "venue members read sessions of classes hosted at their studio"
  on public.class_sessions for select
  to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.classes c
       where c.id = class_sessions.class_id
         and c.venue_business_id is not null
         and public.is_business_member(c.venue_business_id)
    )
  );
