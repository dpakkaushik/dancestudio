-- ═══════════════════════════════════════════════════════════════════════════
-- CLASSES, MADE SIMPLER (11 Oct 2026) — the database half of the user's
-- answers to "ask me questions with suggestions for all and lets solve it".
--
-- What the user chose, and what each costs here:
--
--   1. AUTO-PUBLISH. `classes.auto_publish` (default on) and
--      `publish_class_if_ready(class)`: the moment the last yes lands — the
--      teacher's, or the studio's for its room — a draft that is ready
--      publishes itself and the owners are told. Fired from class_people
--      (a confirmed artist) and from classes (an accepted venue), and at the
--      end of creating or editing. A refusal (the room is busy, the capacity
--      is over the room's) never breaks the yes: it is caught and said.
--   2. ONE CLOSED STATE. `respond_to_class_ask` refuses a yes once the class
--      has started ("the request is closed"); a no is soft-deleted as well as
--      marked, so a closed ask is a closed ask. `close_stale_drafts()` on a
--      nightly cron deletes a draft seven days after its date, telling the
--      owner.
--   3. THE SMALL FIXES. venue_status can only reach accepted/declined through
--      the studio's own answer (`guard_venue_answer`); the people who run a
--      class cannot book a seat on it (`guard_not_own_class` + the two booking
--      doors say so first); money rows are read by the people RUNNING the
--      business, not every seat; a session is at most five hours by CHECK.
--   4. THE REGISTER FROM THE CLASS ROW ALONE. A confirmed teacher or assistant
--      holding the power runs the door whatever seat they hold — no
--      `visiting_faculty` seat is made on accept any more.
--   5. A MANAGER RUNS CLASSES. `runs_business` replaces `is_business_owner`
--      on creating, editing, publishing (the UPDATE policies), deleting,
--      naming a teacher, withdrawing an ask, answering a room request and the
--      Taking-requests switch. Powers and pay stay the owner's.
--   6. PAY PER SESSION OFF THE ASK. `business_members.pay_per_session_inr`
--      (the owner's, `set_member_pay`); an ask with no rate takes the seat's.
--   7. ONE BOOKING DOOR. `book_class_session(session, pass default null)` —
--      free, or with a membership; `book_with_membership` stays as the pass
--      path it always was. `book_at_the_door(session, user, name)` is the
--      register's one action: a scanned person or a typed name.
--   8. A STUDIO'S OWN REFUND WINDOW. `businesses.refund_window_hours`
--      (default 12, `set_refund_window`), read by `_cancel_one_class_booking`.
--
-- Bodies are edited OUT OF THE CATALOG by asserted anchor (`_dos_swap`) where
-- the signature stands; `create_class_with_session`, `update_class_with_session`
-- and `book_class_session` are dropped and re-created because they gain an
-- argument, with every grant restated. Nothing is backfilled: the two live
-- seats a runner holds on their own class stay (a record); the seven live
-- visiting_faculty seats stay (a seat is a seat). No begin/commit (Rule 18).
-- ═══════════════════════════════════════════════════════════════════════════

create function public._dos_swap(p_def text, p_from text, p_to text, p_fn text, p_expect integer default 1) returns text
language plpgsql as $fn$
declare v_n integer;
begin
  v_n := (length(p_def) - length(replace(p_def, p_from, ''))) / length(p_from);
  if v_n <> p_expect then
    raise exception 'anchor found % times in %, expected %: %', v_n, p_fn, p_expect, left(p_from, 80);
  end if;
  return replace(p_def, p_from, p_to);
end;
$fn$;

-- ── columns and checks ──────────────────────────────────────────────────────

alter table public.classes
  add column auto_publish boolean not null default true;
comment on column public.classes.auto_publish is
  'Publish as soon as everyone says yes (11 Oct 2026). Off = the owner publishes by hand.';

alter table public.business_members
  add column pay_per_session_inr integer not null default 0
    constraint business_members_pay_check check (pay_per_session_inr between 0 and 200000);
comment on column public.business_members.pay_per_session_inr is
  'What a session pays this person at this business, the owner''s number (11 Oct 2026). An ask with no rate of its own takes it.';

alter table public.businesses
  add column refund_window_hours smallint not null default 12
    constraint businesses_refund_window_check check (refund_window_hours between 0 and 168);
comment on column public.businesses.refund_window_hours is
  'A learner cancelling at least this many hours before a class is refunded automatically; later, the studio decides (11 Oct 2026). Default 12.';

-- a session is at most five hours — the form''s rule since 3 Oct 2026, kept at the row now
alter table public.class_sessions
  add constraint class_sessions_length_check
  check (deleted_at is not null or ends_at <= starts_at + interval '5 hours');

-- ── 1 · auto-publish ────────────────────────────────────────────────────────

create function public.publish_class_if_ready(p_class_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_class public.classes;
  v_type text;
  v_teacher boolean;
  v_why text;
begin
  select * into v_class from public.classes c
   where c.id = p_class_id and c.deleted_at is null and c.status = 'draft' and c.auto_publish
   for update;
  if not found then
    return false;
  end if;
  -- a class with no session still ahead has nothing to publish
  if not exists (select 1 from public.class_sessions s
                  where s.class_id = v_class.id and s.deleted_at is null and s.starts_at > now()) then
    return false;
  end if;
  select b.type into v_type from public.businesses b where b.id = v_class.business_id;
  v_teacher := exists (
    select 1 from public.class_people cp
     where cp.class_id = v_class.id and cp.kind = 'artist' and cp.status = 'confirmed' and cp.deleted_at is null);
  v_why := public.class_publish_blocker(v_type, v_class.venue_business_id, v_class.venue_status,
                                        v_class.lat, v_class.maps_url, v_class.capacity, v_teacher);
  if v_why is not null then
    return false;
  end if;

  begin
    update public.classes set status = 'published' where id = v_class.id;
    perform public.notify_business_owners(v_class.business_id, 'class',
      coalesce(v_class.title, 'Your class') || ' is on Discover',
      'The last yes came in and it published itself.',
      '/c/' || coalesce(v_class.share_slug, ''));
    return true;
  exception
    -- the room is busy, the capacity is over the room''s: the yes stands, the
    -- publish does not, and the owner is told why in the database''s own words
    when others then
      perform public.notify_business_owners(v_class.business_id, 'class',
        coalesce(v_class.title, 'Your class') || ' could not publish itself',
        left(sqlerrm, 280),
        '/c/' || coalesce(v_class.share_slug, ''));
      return false;
  end;
end;
$fn$;
comment on function public.publish_class_if_ready(uuid) is
  'Publishes a ready draft whose auto_publish is on; tells the owners either way (11 Oct 2026). Executable by no client role.';
revoke all on function public.publish_class_if_ready(uuid) from public, anon, authenticated;

create function public.publish_when_person_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.status = 'confirmed' and new.kind = 'artist' and new.deleted_at is null then
    perform public.publish_class_if_ready(new.class_id);
  end if;
  return null;
end;
$fn$;
revoke all on function public.publish_when_person_confirmed() from public, anon, authenticated;

create trigger zz_publish_when_person_confirmed
  after insert or update of status on public.class_people
  for each row execute function public.publish_when_person_confirmed();

create function public.publish_when_venue_accepted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.venue_status = 'accepted' and old.venue_status is distinct from 'accepted' then
    perform public.publish_class_if_ready(new.id);
  end if;
  return null;
end;
$fn$;
revoke all on function public.publish_when_venue_accepted() from public, anon, authenticated;

create trigger zz_publish_when_venue_accepted
  after update of venue_status on public.classes
  for each row execute function public.publish_when_venue_accepted();

-- ── 2 · one closed state ────────────────────────────────────────────────────

create or replace function public.respond_to_class_ask(p_class_person_id uuid, p_accept boolean)
returns public.class_people
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user uuid := auth.uid();
  v_row public.class_people;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_row from public.class_people cp
   where cp.id = p_class_person_id and cp.user_id = v_user and cp.deleted_at is null;
  if not found then
    raise exception 'that ask is not yours to answer';
  end if;
  if v_row.status <> 'asked' then
    raise exception 'this ask has already been answered';
  end if;
  -- 11 Oct 2026: a class whose date has passed is closed — a late yes is refused
  if p_accept and exists (
    select 1 from public.class_sessions s
     where s.class_id = v_row.class_id and s.deleted_at is null and s.starts_at <= now()
  ) and not exists (
    select 1 from public.class_sessions s
     where s.class_id = v_row.class_id and s.deleted_at is null and s.starts_at > now()
  ) then
    raise exception 'This class has already started — the request is closed';
  end if;
  update public.class_people
     set status = case when p_accept then 'confirmed' else 'rejected' end,
         -- a no is a closed ask, so it is closed (11 Oct 2026)
         deleted_at = case when p_accept then null else now() end,
         updated_by = v_user
   where id = v_row.id
   returning * into v_row;
  -- 11 Oct 2026: no visiting_faculty seat any more — the register is read off the class row
  return v_row;
end;
$fn$;

create function public.close_stale_drafts()
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  r record;
  n integer := 0;
begin
  for r in
    select c.id, c.title, c.business_id, c.share_slug
      from public.classes c
     where c.deleted_at is null and c.status = 'draft'
       and exists (select 1 from public.class_sessions s where s.class_id = c.id and s.deleted_at is null)
       and not exists (select 1 from public.class_sessions s
                        where s.class_id = c.id and s.deleted_at is null
                          and s.starts_at > now() - interval '7 days')
  loop
    perform public.notify_business_owners(r.business_id, 'class',
      coalesce(r.title, 'A draft') || ' was closed',
      'Its date passed a week ago without it being published, so it has been taken off your list.',
      '/my-classes');
    update public.classes set deleted_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$fn$;
comment on function public.close_stale_drafts() is
  'Deletes a draft seven days after its date passed, telling the owner (11 Oct 2026). Run nightly by draft-clock.';
revoke all on function public.close_stale_drafts() from public, anon, authenticated;

do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'draft-clock') then
      perform cron.schedule('draft-clock', '15 21 * * *', 'select public.close_stale_drafts()');
    end if;
  end if;
end
$do$;

-- ── 3 · the small fixes ─────────────────────────────────────────────────────

-- (a) venue_status reaches accepted / declined only through the studio's answer
create function public.guard_venue_answer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.venue_status is distinct from old.venue_status
     and new.venue_status in ('accepted', 'declined')
     and coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role'
     and coalesce(current_setting('dos.venue_answer', true), '') <> 'yes'
     -- a changed venue or room is reset by classes_venue_changes, never answered here
     and new.venue_business_id is not distinct from old.venue_business_id
     and new.room_id is not distinct from old.room_id then
    raise exception 'only the studio answers for its rooms';
  end if;
  return new;
end;
$fn$;
revoke all on function public.guard_venue_answer() from public, anon, authenticated;

create trigger classes_venue_answer_is_the_studios
  before update of venue_status on public.classes
  for each row execute function public.guard_venue_answer();

do $do$
declare d text;
begin
  select pg_get_functiondef('public.respond_to_venue_request(uuid,boolean)'::regprocedure) into d;
  d := public._dos_swap(d,
    $a$  if not public.is_business_owner(v_class.venue_business_id) then
    raise exception 'only the studio''s owner answers for its rooms';
  end if;$a$,
    $a$  if not public.runs_business(v_class.venue_business_id) then
    raise exception 'only the people who run the studio answer for its rooms';
  end if;$a$, 'respond_to_venue_request');
  d := public._dos_swap(d,
    $a$  update public.classes
     set venue_status = case when p_accept then 'accepted' else 'declined' end, updated_by = v_user$a$,
    $a$  perform set_config('dos.venue_answer', 'yes', true);
  update public.classes
     set venue_status = case when p_accept then 'accepted' else 'declined' end, updated_by = v_user$a$, 'respond_to_venue_request');
  execute d;
end
$do$;

-- (b) the people who run a class do not book a seat on it
create function public.guard_not_own_class()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role' then
    return new;
  end if;
  if new.user_id is null then
    return new;
  end if;
  if exists (
    select 1 from public.classes c
      join public.business_members m on m.business_id = c.business_id
     where c.id = new.class_id and m.user_id = new.user_id
       and m.member_role in ('owner', 'manager') and m.deleted_at is null
  ) or exists (
    select 1 from public.class_people cp
     where cp.class_id = new.class_id and cp.user_id = new.user_id
       and cp.status = 'confirmed' and cp.deleted_at is null
  ) then
    raise exception 'You run this class — it is not yours to book';
  end if;
  return new;
end;
$fn$;
revoke all on function public.guard_not_own_class() from public, anon, authenticated;

create trigger class_bookings_not_own_class
  before insert on public.class_bookings
  for each row execute function public.guard_not_own_class();

do $do$
declare d text;
begin
  select pg_get_functiondef('public.create_payment_order(uuid)'::regprocedure) into d;
  d := public._dos_swap(d,
    $a$  if v_class.price_inr <= 0 then
    raise exception 'this class is free — book it directly';
  end if;$a$,
    $a$  if v_class.price_inr <= 0 then
    raise exception 'this class is free — book it directly';
  end if;
  if public.runs_business(v_class.business_id) or exists (
    select 1 from public.class_people cp
     where cp.class_id = v_class.id and cp.user_id = v_user and cp.status = 'confirmed' and cp.deleted_at is null
  ) then
    raise exception 'You run this class — it is not yours to book';
  end if;$a$, 'create_payment_order');
  execute d;
end
$do$;

-- (c) money is read by the people running the business, and by whoever settles a class's refunds
drop policy "members read business orders" on public.orders;
drop policy "members read business payments" on public.payments;
drop policy "members read business refunds" on public.refunds;

create policy "the people running it read a business's orders"
  on public.orders for select to authenticated
  using (
    public.runs_business(business_id)
    or (class_id is not null and public.can_settle_refunds_for_class(class_id))
  );

create policy "the people running it read a business's payments"
  on public.payments for select to authenticated
  using (
    business_id is not null and (
      public.runs_business(business_id)
      or exists (select 1 from public.orders o
                  where o.id = payments.order_id and o.class_id is not null
                    and public.can_settle_refunds_for_class(o.class_id))
    )
  );

create policy "the people running it read a business's refunds"
  on public.refunds for select to authenticated
  using (
    public.runs_business(business_id)
    or exists (select 1 from public.orders o
                where o.id = refunds.order_id and o.class_id is not null
                  and public.can_settle_refunds_for_class(o.class_id))
  );

-- ── 4 · the register from the class row alone ───────────────────────────────

create or replace function public.can_run_register_for_class(p_class_id uuid)
returns boolean
language sql
stable security definer
set search_path = ''
as $fn$
  -- the studio's own: an owner, manager or trainer of the business that owns the class
  select exists (
    select 1 from public.classes c
    join public.business_members m on m.business_id = c.business_id
    where c.id = p_class_id
      and m.user_id = auth.uid()
      and m.member_role in ('owner', 'manager', 'trainer')
      and m.deleted_at is null
      and c.deleted_at is null
  ) or exists (
    -- 11 Oct 2026: a confirmed person on THIS class holding attendance, whatever
    -- seat they hold or do not hold — the class row alone decides
    select 1
    from public.class_people cc
    join public.classes c on c.id = cc.class_id
    where cc.class_id = p_class_id
      and cc.user_id = auth.uid()
      and cc.status = 'confirmed'
      and cc.can_attendance = true
      and cc.deleted_at is null
      and c.deleted_at is null
  ) or exists (
    -- THE STANDING GRANT (20 Sep 2026)
    select 1
    from public.classes c
    join public.business_members m on m.business_id = c.business_id
    where c.id = p_class_id
      and m.user_id = auth.uid()
      and m.can_attendance = true
      and m.deleted_at is null
      and c.deleted_at is null
  );
$fn$;

create or replace function public.can_settle_refunds_for_class(p_class_id uuid)
returns boolean
language sql
stable security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.classes c
    join public.business_members m on m.business_id = c.business_id
    where c.id = p_class_id
      and m.user_id = auth.uid()
      and m.member_role = 'owner'
      and m.deleted_at is null
      and c.deleted_at is null
  ) or exists (
    -- 11 Oct 2026: the class row alone
    select 1
    from public.class_people cc
    join public.classes c on c.id = cc.class_id
    where cc.class_id = p_class_id
      and cc.user_id = auth.uid()
      and cc.status = 'confirmed'
      and cc.can_refunds = true
      and cc.deleted_at is null
      and c.deleted_at is null
  ) or exists (
    -- THE STANDING GRANT (20 Sep 2026)
    select 1
    from public.classes c
    join public.business_members m on m.business_id = c.business_id
    where c.id = p_class_id
      and m.user_id = auth.uid()
      and m.can_refunds = true
      and m.deleted_at is null
      and c.deleted_at is null
  );
$fn$;

-- ── 5 · a manager runs classes ──────────────────────────────────────────────

drop policy "owners update own classes" on public.classes;
create policy "the people running it update a business's classes"
  on public.classes for update to authenticated
  using (deleted_at is null and public.runs_business(business_id))
  with check (public.runs_business(business_id));

drop policy "owners update own sessions" on public.class_sessions;
create policy "the people running it update a business's sessions"
  on public.class_sessions for update to authenticated
  using (deleted_at is null and public.runs_business(business_id))
  with check (public.runs_business(business_id));

do $do$
declare d text;
begin
  select pg_get_functiondef('public.withdraw_class_ask(uuid)'::regprocedure) into d;
  d := public._dos_swap(d,
    $a$public.is_business_owner(v_row.business_id)$a$,
    $a$public.runs_business(v_row.business_id)$a$, 'withdraw_class_ask');
  d := public._dos_swap(d,
    $a$'only the owner — or the teacher, for an assistant — withdraws an ask'$a$,
    $a$'only the people who run the business — or the teacher, for an assistant — withdraw an ask'$a$, 'withdraw_class_ask');
  execute d;

  select pg_get_functiondef('public.cancel_class_bookings_for_class(uuid,text)'::regprocedure) into d;
  d := public._dos_swap(d,
    $a$  if not public.is_business_owner(v_class.business_id) then
    raise exception 'Only the owner of this studio can call off its classes';
  end if;$a$,
    $a$  if not public.runs_business(v_class.business_id) then
    raise exception 'Only the people who run this studio can call off its classes';
  end if;$a$, 'cancel_class_bookings_for_class');
  execute d;

  select pg_get_functiondef('public.can_set_class_routines(uuid)'::regprocedure) into d;
  d := public._dos_swap(d,
    $a$m.member_role = 'owner'$a$,
    $a$m.member_role in ('owner', 'manager')$a$, 'can_set_class_routines');
  execute d;

  select pg_get_functiondef('public.set_room_requests(uuid,boolean)'::regprocedure) into d;
  d := public._dos_swap(d,
    $a$  if not public.is_business_owner(p_business_id) then
    raise exception 'only the owner decides whether the studio takes room requests';
  end if;$a$,
    $a$  if not public.runs_business(p_business_id) then
    raise exception 'only the people who run the studio decide whether it takes requests';
  end if;$a$, 'set_room_requests');
  execute d;

  select pg_get_functiondef('public.classes_venue_changes()'::regprocedure) into d;
  d := public._dos_swap(d,
    $a$when public.is_business_owner(new.venue_business_id) then 'accepted'$a$,
    $a$when public.runs_business(new.venue_business_id) then 'accepted'$a$, 'classes_venue_changes');
  execute d;
end
$do$;

-- ── 6 · pay per session on the seat ─────────────────────────────────────────

create function public.set_member_pay(p_business_id uuid, p_user_id uuid, p_rate integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_business_owner(p_business_id) then
    raise exception 'only the owner sets what a session pays';
  end if;
  if p_rate is null or p_rate < 0 or p_rate > 200000 then
    raise exception 'a session pays between 0 and 2,00,000';
  end if;
  update public.business_members
     set pay_per_session_inr = p_rate, updated_by = auth.uid()
   where business_id = p_business_id and user_id = p_user_id and deleted_at is null;
  if not found then
    raise exception 'they are not on your team';
  end if;
  return p_rate;
end;
$fn$;
comment on function public.set_member_pay(uuid, uuid, integer) is
  'The owner sets what a session pays a team member; an ask with no rate takes it (11 Oct 2026).';
revoke all on function public.set_member_pay(uuid, uuid, integer) from public, anon;
grant execute on function public.set_member_pay(uuid, uuid, integer) to authenticated, service_role;

create or replace function public.ask_class_person(p_class_id uuid, p_user_id uuid, p_kind text, p_can_attendance boolean default false, p_can_refunds boolean default false, p_pay_per_session_inr integer default 0)
returns public.class_people
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user uuid := auth.uid();
  v_class public.classes;
  v_row public.class_people;
  v_owner boolean;
  v_runs boolean;
  v_teacher boolean;
  v_rate integer;
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
  -- 11 Oct 2026: a manager names the teacher too; powers and pay stay the owner's
  v_runs := public.runs_business(v_class.business_id);
  v_teacher := exists (
    select 1 from public.class_people cp
     where cp.class_id = p_class_id and cp.user_id = v_user and cp.kind = 'artist'
       and cp.status = 'confirmed' and cp.deleted_at is null);
  if p_kind = 'artist' and not v_runs then
    raise exception 'only the people who run the business choose who takes a class';
  end if;
  if p_kind = 'assistant' and not (v_runs or v_teacher) then
    raise exception 'only the people who run the business, or the person taking this class, add assistants';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id and p.deleted_at is null) then
    raise exception 'that person has not finished onboarding';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_user_id and p.role = 'org') then
    raise exception 'an organization does not take a class — ask a person';
  end if;
  if coalesce(p_pay_per_session_inr, 0) <> 0 and not v_owner then
    raise exception 'only the studio owner sets what a session pays';
  end if;

  -- 4 Oct 2026: an ASSISTANT comes from the asker's own team or crews, and
  -- nobody else. The same three sources as the app's picker.
  if p_kind = 'assistant' and not (
       exists (select 1 from public.business_members m
                where m.business_id = v_class.business_id and m.user_id = p_user_id
                  and m.deleted_at is null)
    or exists (select 1 from public.business_members mine
                 join public.businesses b on b.id = mine.business_id
                                         and b.type = 'artist_page' and b.deleted_at is null
                 join public.business_members m on m.business_id = mine.business_id
                                               and m.user_id = p_user_id and m.deleted_at is null
                where mine.user_id = v_user and mine.member_role = 'owner'
                  and mine.deleted_at is null)
    or exists (select 1 from public.crew_members mine
                 join public.crews cr on cr.id = mine.crew_id and cr.deleted_at is null
                 join public.crew_members m on m.crew_id = mine.crew_id and m.user_id = p_user_id
                                           and m.status = 'confirmed' and m.deleted_at is null
                where mine.user_id = v_user and mine.status = 'confirmed'
                  and mine.deleted_at is null)
  ) then
    raise exception 'Only people on your team or in your crews can be asked to assist.';
  end if;

  -- 11 Oct 2026: the rate is the SEAT's unless the owner names one on the ask
  v_rate := coalesce(nullif(p_pay_per_session_inr, 0), (
    select m.pay_per_session_inr from public.business_members m
     where m.business_id = v_class.business_id and m.user_id = p_user_id and m.deleted_at is null
     limit 1), 0);

  -- asking again after a withdrawal, a no, or in a different role is a FRESH ASK
  update public.class_people
     set deleted_at = now(), updated_by = v_user
   where class_id = p_class_id and user_id = p_user_id and deleted_at is null;

  insert into public.class_people (class_id, business_id, user_id, kind, status,
                                   can_attendance, can_refunds, pay_per_session_inr,
                                   created_by, updated_by)
  values (p_class_id, v_class.business_id, p_user_id, p_kind,
          -- somebody naming THEMSELVES has nobody to ask — born confirmed
          case when p_user_id = v_user and v_runs then 'confirmed' else 'asked' end,
          case when v_owner then coalesce(p_can_attendance, false) else false end,
          case when v_owner then coalesce(p_can_refunds, false) else false end,
          v_rate, v_user, v_user)
  returning * into v_row;
  return v_row;
end;
$fn$;

-- ── 8 · a studio's own refund window ────────────────────────────────────────

create function public.set_refund_window(p_business_id uuid, p_hours integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_business_owner(p_business_id) then
    raise exception 'only the owner sets the refund window';
  end if;
  if p_hours is null or p_hours < 0 or p_hours > 168 then
    raise exception 'the refund window is between 0 and 168 hours';
  end if;
  update public.businesses set refund_window_hours = p_hours
   where id = p_business_id and deleted_at is null;
  if not found then
    raise exception 'business not found';
  end if;
  return p_hours;
end;
$fn$;
comment on function public.set_refund_window(uuid, integer) is
  'The owner sets how many hours before a class a cancellation is still refunded automatically (11 Oct 2026).';
revoke all on function public.set_refund_window(uuid, integer) from public, anon;
grant execute on function public.set_refund_window(uuid, integer) to authenticated, service_role;

do $do$
declare d text;
begin
  select pg_get_functiondef('public._cancel_one_class_booking(uuid,uuid,uuid,text,boolean)'::regprocedure) into d;
  d := public._dos_swap(d,
    $a$  v_was_enrolled boolean;
begin$a$,
    $a$  v_was_enrolled boolean;
  v_window integer;
begin$a$, '_cancel_one_class_booking');
  d := public._dos_swap(d,
    $a$  select * into v_session from public.class_sessions s where s.id = v_row.session_id;$a$,
    $a$  select * into v_session from public.class_sessions s where s.id = v_row.session_id;
  -- 11 Oct 2026: the window is the studio's own number
  select coalesce(b.refund_window_hours, 12) into v_window
    from public.businesses b where b.id = v_class.business_id;$a$, '_cancel_one_class_booking');
  d := public._dos_swap(d,
    $a$when v_session.starts_at - now() >= interval '12 hours' then 'pending'$a$,
    $a$when v_session.starts_at - now() >= make_interval(hours => coalesce(v_window, 12)) then 'pending'$a$, '_cancel_one_class_booking');
  execute d;
end
$do$;

-- ── 1 again · create and update carry the switch (and a manager may call them) ──

drop function public.create_class_with_session(uuid,text,text,text,text,integer,integer,text,timestamptz,timestamptz,uuid,text,uuid,double precision,double precision,text);

create function public.create_class_with_session(p_business_id uuid, p_title text, p_style text, p_level text, p_room text, p_price_inr integer, p_capacity integer, p_status text, p_starts_at timestamptz, p_ends_at timestamptz, p_room_id uuid default null, p_poster text default null, p_venue_business_id uuid default null, p_lat double precision default null, p_lng double precision default null, p_maps_url text default null, p_auto_publish boolean default true)
returns public.classes
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user uuid := auth.uid();
  v_class public.classes;
  v_type text;
  v_venue_type text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  -- 11 Oct 2026: the people who RUN the business create its classes (owner or manager)
  if not public.runs_business(p_business_id) then
    raise exception 'only the people who run this business create classes here';
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
    if p_status <> 'draft' and not public.runs_business(p_venue_business_id) then
      raise exception 'a class at a studio is saved as a draft until the studio accepts the room';
    end if;
  elsif p_room_id is not null and not exists (
    select 1 from public.rooms r where r.id = p_room_id and r.business_id = p_business_id and r.deleted_at is null
  ) then
    raise exception 'that room belongs to another studio';
  end if;

  insert into public.classes (business_id, title, style, level, room, room_id, poster,
                              price_inr, capacity, status, auto_publish,
                              venue_business_id, venue_status, lat, lng, maps_url,
                              created_by, updated_by)
  values (p_business_id, trim(p_title), trim(p_style), p_level, nullif(trim(p_room), ''), p_room_id, p_poster,
          coalesce(p_price_inr, 0), p_capacity, p_status, coalesce(p_auto_publish, true),
          p_venue_business_id,
          case when p_venue_business_id is null then null
               when public.runs_business(p_venue_business_id) then 'accepted'
               else 'requested' end,
          p_lat, p_lng, nullif(trim(coalesce(p_maps_url, '')), ''),
          v_user, v_user)
  returning * into v_class;

  insert into public.class_sessions (class_id, business_id, starts_at, ends_at, created_by, updated_by)
  values (v_class.id, p_business_id, p_starts_at, p_ends_at, v_user, v_user);

  -- AN ARTIST TEACHES THEIR OWN CLASS: the page's owner is its teacher, confirmed
  -- by construction
  if v_type = 'artist_page' then
    insert into public.class_people (class_id, business_id, user_id, kind, status,
                                     can_attendance, can_refunds, pay_per_session_inr, created_by, updated_by)
    values (v_class.id, p_business_id, v_user, 'artist', 'confirmed', true, true, 0, v_user, v_user);
  end if;

  -- 11 Oct 2026: nothing left to wait for (an artist at their own pin, or in
  -- a studio they run) and the switch is on — it is on Discover already
  perform public.publish_class_if_ready(v_class.id);
  select * into v_class from public.classes c where c.id = v_class.id;
  return v_class;
end;
$fn$;
revoke all on function public.create_class_with_session(uuid,text,text,text,text,integer,integer,text,timestamptz,timestamptz,uuid,text,uuid,double precision,double precision,text,boolean) from public, anon;
grant execute on function public.create_class_with_session(uuid,text,text,text,text,integer,integer,text,timestamptz,timestamptz,uuid,text,uuid,double precision,double precision,text,boolean) to authenticated, service_role;

drop function public.update_class_with_session(uuid,text,text,text,text,integer,integer,timestamptz,timestamptz,uuid,text,uuid,double precision,double precision,text,boolean,boolean);

create function public.update_class_with_session(p_class_id uuid, p_title text, p_style text, p_level text, p_room text, p_price_inr integer, p_capacity integer, p_starts_at timestamptz, p_ends_at timestamptz, p_room_id uuid, p_poster text, p_venue_business_id uuid, p_lat double precision, p_lng double precision, p_maps_url text, p_allows_studio_memberships boolean, p_allows_artist_memberships boolean, p_auto_publish boolean default null)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_class public.classes;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_class from public.classes c
    where c.id = p_class_id and c.deleted_at is null;
  if not found then
    raise exception 'Class not found or not yours to edit';
  end if;

  -- the same sentence for "no such class" and "not yours", deliberately
  if not public.runs_business(v_class.business_id) then
    raise exception 'Class not found or not yours to edit';
  end if;

  update public.classes set
    title                     = p_title,
    style                     = p_style,
    level                     = p_level,
    room                      = p_room,
    room_id                   = p_room_id,
    poster                    = p_poster,
    price_inr                 = p_price_inr,
    capacity                  = p_capacity,
    venue_business_id         = p_venue_business_id,
    lat                       = p_lat,
    lng                       = p_lng,
    maps_url                  = p_maps_url,
    allows_studio_memberships = p_allows_studio_memberships,
    allows_artist_memberships = p_allows_artist_memberships,
    auto_publish              = coalesce(p_auto_publish, auto_publish)
  where id = p_class_id and deleted_at is null;

  update public.class_sessions set
    starts_at = p_starts_at,
    ends_at   = p_ends_at
  where class_id = p_class_id and deleted_at is null
    and not exists (select 1 from public.class_sessions x
                     where x.class_id = p_class_id and x.deleted_at is null and x.ends_at > now());

  update public.class_sessions s set
    starts_at = s.starts_at + (p_starts_at - a.anchor_start),
    ends_at   = s.starts_at + (p_starts_at - a.anchor_start) + (p_ends_at - p_starts_at)
  from (select min(x.starts_at) as anchor_start
          from public.class_sessions x
         where x.class_id = p_class_id and x.deleted_at is null and x.ends_at > now()) a
  where s.class_id = p_class_id and s.deleted_at is null and s.ends_at > now()
    and a.anchor_start is not null;

  -- 11 Oct 2026: an edit that leaves nothing to wait for publishes a ready draft
  perform public.publish_class_if_ready(p_class_id);
end;
$fn$;
revoke all on function public.update_class_with_session(uuid,text,text,text,text,integer,integer,timestamptz,timestamptz,uuid,text,uuid,double precision,double precision,text,boolean,boolean,boolean) from public, anon;
grant execute on function public.update_class_with_session(uuid,text,text,text,text,integer,integer,timestamptz,timestamptz,uuid,text,uuid,double precision,double precision,text,boolean,boolean,boolean) to authenticated, service_role;

-- ── 7 · one booking door, one door at the door ──────────────────────────────

drop function public.book_class_session(uuid);

create function public.book_class_session(p_session_id uuid, p_pass_id uuid default null)
returns public.class_bookings
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user uuid := auth.uid();
  v_session public.class_sessions;
  v_class public.classes;
  v_taken integer;
  v_row public.class_bookings;
begin
  -- 11 Oct 2026: a pass goes through the pass path, which spends the unit under its own lock
  if p_pass_id is not null then
    return public.book_with_membership(p_session_id, p_pass_id);
  end if;

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

  select * into v_class from public.classes c
    where c.id = v_session.class_id and c.deleted_at is null and c.status = 'published'
    for update;
  if not found then
    raise exception 'class is not open for booking';
  end if;

  -- 11 Oct 2026: the people who run a class do not book a seat on it
  if public.runs_business(v_class.business_id) or exists (
    select 1 from public.class_people cp
     where cp.class_id = v_class.id and cp.user_id = v_user and cp.status = 'confirmed' and cp.deleted_at is null
  ) then
    raise exception 'You run this class — it is not yours to book';
  end if;

  if exists (
    select 1 from public.class_bookings e
    where e.session_id = p_session_id and e.user_id = v_user
      and e.status = 'enrolled' and e.deleted_at is null
  ) then
    raise exception 'you already have a spot in this class';
  end if;

  select count(*) into v_taken from public.class_bookings e
    where e.session_id = p_session_id and e.status = 'enrolled' and e.deleted_at is null;
  if v_taken >= v_class.capacity then
    raise exception 'this class is full';
  end if;

  if v_class.price_inr > 0 then
    raise exception 'this class takes payment — book it from its class page';
  end if;

  insert into public.class_bookings (session_id, class_id, business_id, user_id, status, created_by, updated_by)
  values (p_session_id, v_class.id, v_class.business_id, v_user, 'enrolled', v_user, v_user)
  returning * into v_row;

  return v_row;
end;
$fn$;
comment on function public.book_class_session(uuid, uuid) is
  'The one booking door (11 Oct 2026): free, or with a membership pass. A priced class without a pass goes through the class page''s payment.';
revoke all on function public.book_class_session(uuid, uuid) from public, anon;
grant execute on function public.book_class_session(uuid, uuid) to authenticated, service_role;

create function public.book_at_the_door(p_session_id uuid, p_user_id uuid default null, p_name text default null)
returns public.class_bookings
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if p_user_id is not null then
    return public.book_class_session_for_person(p_session_id, p_user_id);
  end if;
  if nullif(btrim(coalesce(p_name, '')), '') is not null then
    return public.add_class_walk_in(p_session_id, p_name);
  end if;
  raise exception 'scan a code or type a name';
end;
$fn$;
comment on function public.book_at_the_door(uuid, uuid, text) is
  'The register''s one action (11 Oct 2026): a scanned person books in, a typed name is a walk-in. Same gate and window as both doors.';
revoke all on function public.book_at_the_door(uuid, uuid, text) from public, anon;
grant execute on function public.book_at_the_door(uuid, uuid, text) to authenticated, service_role;

drop function public._dos_swap(text, text, text, text, integer);

notify pgrst, 'reload schema';
