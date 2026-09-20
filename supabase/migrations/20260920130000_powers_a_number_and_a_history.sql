-- POWERS, A NUMBER, AND A HISTORY (20 Sep 2026) — the user's answers 1, 3, 4, 5, 13.
-- ⚠ AUTH (Rule 9): §2 lets an owner hand the owner seat to somebody, and §1
-- grants two real powers at the BUSINESS level for the first time. Read both.
--
-- Their answers, in their words:
--   1. "permission given by Artist or Studio for managing Attendance and Refunds"
--   3. "Yes" (a studio's own desk can make somebody its owner) "and should be
--      able to switch profile for that studio from profile switcher"
--   4. "Only to be used for managing all events according to permissions
--      assigned by the organization"
--   5. "fix in best way"   13. "Id should be besides profile type on home and
--      profilepage both"

-- ── 1. ATTENDANCE AND REFUNDS ARE GRANTED, NEVER IMPLIED ─────────────────────
-- An `assistant` seat has carried `staff`'s powers with a different name since
-- 20260920100000 — which is to say none. The user's answer is that the two
-- powers worth having are the artist's or the studio's to GIVE.
--
-- ⚠ THIS IS THE SECOND PLACE THOSE TWO WORDS LIVE, AND THAT IS DELIBERATE.
-- `class_people.can_attendance / can_refunds` have been PER CLASS since Step 11
-- ("you hold attendance on THIS class") and they stay exactly as they are. What
-- was missing is the standing grant — an assistant who runs the door for every
-- class a studio holds should not be asked onto each one. A grant here is a
-- FLOOR: the per-class job can still hand the power to somebody who does not
-- hold it standing, and neither can take it away from the owner.
alter table public.business_members
  add column if not exists can_attendance boolean not null default false,
  add column if not exists can_refunds boolean not null default false;

comment on column public.business_members.can_attendance is
  'A standing grant from the owner: this person may run the register on every class of this business (20 Sep 2026). The per-class class_people.can_attendance is unchanged and still grants it one class at a time.';
comment on column public.business_members.can_refunds is
  'A standing grant from the owner: this person may settle refunds on every class of this business (20 Sep 2026).';

-- the owner's door. ⚠ owner-only, like every other power on this table: a
-- trainer handing out refunds would be the grant granting itself.
create or replace function public.set_member_powers(
  p_business_id uuid,
  p_user_id uuid,
  p_can_attendance boolean,
  p_can_refunds boolean
)
returns public.business_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_member public.business_members;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not public.is_business_owner(p_business_id) then
    raise exception 'only the owner says what somebody may do';
  end if;
  select * into v_member from public.business_members m
   where m.business_id = p_business_id and m.user_id = p_user_id and m.deleted_at is null;
  if v_member.id is null then raise exception 'they are not on your team'; end if;
  -- an owner already holds both; saying so out loud beats a switch that does nothing
  if v_member.member_role = 'owner' then
    raise exception 'an owner already runs the register and settles refunds';
  end if;
  update public.business_members
     set can_attendance = coalesce(p_can_attendance, false),
         can_refunds = coalesce(p_can_refunds, false),
         updated_by = v_user
   where id = v_member.id
  returning * into v_member;
  return v_member;
end;
$$;
revoke execute on function public.set_member_powers(uuid, uuid, boolean, boolean) from public, anon;
grant execute on function public.set_member_powers(uuid, uuid, boolean, boolean) to authenticated, service_role;
comment on function public.set_member_powers(uuid, uuid, boolean, boolean) is
  'The owner grants a team member the standing Attendance and Refunds powers (20 Sep 2026, the user: "permission given by Artist or Studio for managing Attendance and Refunds").';

-- ⚠ 20260825140000's body verbatim, plus ONE branch: the standing grant. The two
-- existing branches are untouched, so nothing that could run the register before
-- loses it, and the seat is still what makes the grant live (the 25 Aug lesson —
-- put the membership test where the decision is made).
create or replace function public.can_run_register_for_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- the studio's own: an owner or trainer of the business that owns the class
  select exists (
    select 1 from public.classes c
    join public.business_members m on m.business_id = c.business_id
    where c.id = p_class_id
      and m.user_id = auth.uid()
      and m.member_role in ('owner', 'trainer')
      and m.deleted_at is null
      and c.deleted_at is null
  ) or exists (
    -- an assistant handed the attendance job (prototype 12390: "you hold
    -- attendance"). Any live member may hold it -- staff answer the desk and
    -- run the door -- but the claim is only ever as live as the seat behind it.
    select 1
    from public.class_people cc
    join public.classes c on c.id = cc.class_id
    join public.business_members m
      on m.business_id = c.business_id and m.user_id = cc.user_id
    where cc.class_id = p_class_id
      and cc.user_id = auth.uid()
      and cc.status = 'confirmed'
      and cc.can_attendance = true
      and cc.deleted_at is null
      and c.deleted_at is null
      and m.deleted_at is null
  ) or exists (
    -- THE STANDING GRANT (20 Sep 2026): the owner gave this person the register
    -- for the whole business, so they do not have to be asked onto each class.
    select 1
    from public.classes c
    join public.business_members m on m.business_id = c.business_id
    where c.id = p_class_id
      and m.user_id = auth.uid()
      and m.can_attendance = true
      and m.deleted_at is null
      and c.deleted_at is null
  );
$$;

-- the same third branch, and 20260825180000's body otherwise verbatim
create or replace function public.can_settle_refunds_for_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.classes c
    join public.business_members m on m.business_id = c.business_id
    where c.id = p_class_id
      and m.user_id = auth.uid()
      and m.member_role = 'owner'
      and m.deleted_at is null
      and c.deleted_at is null
  ) or exists (
    select 1
    from public.class_people cc
    join public.classes c on c.id = cc.class_id
    join public.business_members m
      on m.business_id = c.business_id and m.user_id = cc.user_id
    where cc.class_id = p_class_id
      and cc.user_id = auth.uid()
      and cc.status = 'confirmed'
      and cc.can_refunds = true
      and cc.deleted_at is null
      and c.deleted_at is null
      and m.deleted_at is null
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
$$;

-- ── 2. ⚠ A STUDIO'S OWN DESK CAN HAND OVER THE OWNER SEAT ────────────────────
-- Step 12b wrote "owner is not a seat that can be given away" and that held for
-- a month. The user has now said twice that an organization makes somebody a
-- studio owner, and today that a studio's own desk should too ("3. Yes").
--
-- ⚠ THE INVITE DOORS ARE UNTOUCHED. `invite_to_business` and
-- `invite_person_to_business` still refuse `owner`, and that is the point: this
-- promotes somebody who is ALREADY on the team and has already consented to be
-- there. Nobody is made an owner by an invite they accept sight unseen.
--
-- ⚠⚠ AND IT CLOSES A HOLE THAT WAS ALREADY THERE, found by reading this
-- function rather than by a failure: the old body refused `p_role = 'owner'` but
-- happily accepted an owner as the TARGET, so
-- `set_member_role(studio, the_only_owner, 'trainer')` would have left a studio
-- with no owner at all — and `business_owner()` , the hub, the earnings desk and
-- every "is this mine" test read that seat. The last owner cannot be demoted now.
create or replace function public.set_member_role(p_business_id uuid, p_user_id uuid, p_role text)
returns public.business_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_member public.business_members;
  v_owners integer;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_business_owner(p_business_id) then
    raise exception 'only the studio owner changes what somebody may do';
  end if;
  if p_role not in ('owner', 'trainer', 'staff', 'visiting_faculty', 'assistant') then
    raise exception 'a member may be an owner, faculty, visiting faculty, an assistant or other team';
  end if;
  select * into v_member from public.business_members m
   where m.business_id = p_business_id and m.user_id = p_user_id and m.deleted_at is null;
  if v_member.id is null then
    raise exception 'they are not on your team';
  end if;

  -- ⚠ NEVER THE LAST OWNER (new, 20 Sep 2026)
  if v_member.member_role = 'owner' and p_role <> 'owner' then
    select count(*) into v_owners from public.business_members m
     where m.business_id = p_business_id and m.member_role = 'owner' and m.deleted_at is null;
    if v_owners <= 1 then
      raise exception 'this is the only owner - make somebody else an owner first';
    end if;
  end if;

  update public.business_members
     set member_role = p_role,
         -- an owner holds both powers by their seat; a standing grant beside it
         -- would be a switch that cannot be turned off, so it is cleared
         can_attendance = case when p_role = 'owner' then false else can_attendance end,
         can_refunds = case when p_role = 'owner' then false else can_refunds end,
         updated_by = v_user
   where id = v_member.id
  returning * into v_member;
  return v_member;
end;
$$;
comment on function public.set_member_role(uuid, uuid, text) is
  'The owner changes what somebody on the team is. ⚠ Since 20 Sep 2026 this may hand over the OWNER seat (the user: a studio''s own desk can make somebody its owner) — to somebody already on the team, never through an invite — and it refuses to demote the last owner.';

-- ── 3. AN ORGANIZATION'S EVENT TEAM RUNS ITS EVENTS ──────────────────────────
-- R28 said the labels are words. The user has now scoped one of them: "Only to
-- be used for managing all events according to permissions assigned by the
-- organization." So `event_team` is the permission, and it reaches exactly one
-- business — the organization's OWN hosting row (`type = 'org'`), which is where
-- every event of theirs lives (R15). It does not touch their studios.
create or replace function public.can_run_events(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id and m.user_id = auth.uid()
      and m.member_role in ('owner', 'trainer') and m.deleted_at is null
  ) or exists (
    -- THE ORGANIZATION'S EVENT TEAM (20 Sep 2026), on its hosting row only
    select 1
    from public.businesses b
    join public.organization_members om
      on om.org_id = public.business_owner(b.id)
    where b.id = p_business_id
      and b.type = 'org'
      and b.deleted_at is null
      and om.user_id = auth.uid()
      and om.role in ('owner', 'event_team')
      and om.status = 'confirmed'
      and om.deleted_at is null
  );
$$;
comment on function public.can_run_events(uuid) is
  'Who may save, publish and run an event. A business''s own owner or faculty — and, since 20 Sep 2026, an organization''s confirmed Owner or Event team on the organization''s own hosting row (the user: "only to be used for managing all events according to permissions assigned by the organization").';

-- ── 4. AN ASSOCIATION IS A HISTORY, NOT ONLY A SEAT ──────────────────────────
-- What it did until now: live seats only, so a studio somebody taught at for two
-- years vanished from their page the day they left. "Fix in best way."
--
-- ⚠ THE BEST WAY IS NOT "RETURN EVERY DEAD ROW". A seat created and revoked the
-- same afternoon is not an association, and resurrecting one would put a name
-- back on a page somebody took it off. So an ENDED seat is returned only where
-- the person was actually PUT ON A CLASS there — a confirmed `class_people` row,
-- which is the same evidence `person_teaches_at` trusts. The row says which it
-- is, and the page can draw it quietly.
-- ⚠ DROPPED, not replaced: the row gains `ended`, and Postgres refuses to change
-- a function's return type in place ("cannot change return type of existing
-- function"). Found by the dry run on its first attempt, which is what a dry run
-- is for. The ACL is restated below.
drop function if exists public.person_associations(uuid);
create function public.person_associations(p_user_id uuid)
returns table(business_id uuid, business_type text, business_name text, city text, photo_path text, member_role text, owner_id uuid, ended boolean)
language sql
stable
security definer
set search_path = ''
as $$
  -- ⚠ the OWNER rides along so an artist page's row can open the PERSON behind
  -- it in one hop: /artist/{id} only redirects to /person/{owner} (18 Sep 2026),
  -- and a redirect-only URL in somebody's history is what makes back loop.
  select distinct on (b.id)
         b.id, b.type, b.name, b.city, b.profile_photo_path, m.member_role,
         public.business_owner(b.id), (m.deleted_at is not null)
  from public.business_members m
  join public.businesses b on b.id = m.business_id
  where m.user_id = p_user_id
    and m.member_role in ('owner', 'trainer', 'visiting_faculty', 'assistant')
    and b.deleted_at is null
    and b.visibility = 'listed'
    and b.type in ('studio', 'artist_page')
    and (auth.uid() is not null or public.artist_plan_active(p_user_id))
    and (
      m.deleted_at is null
      -- a seat that ENDED counts only where they really were on a class here
      or exists (
        select 1 from public.class_people cp
        join public.classes c on c.id = cp.class_id
        where cp.user_id = p_user_id
          and cp.status = 'confirmed'
          and c.business_id = b.id
      )
    )
  -- a live seat beats an ended one for the same business (distinct on takes the first)
  order by b.id, (m.deleted_at is not null), m.created_at desc;
$$;
revoke execute on function public.person_associations(uuid) from public;
grant execute on function public.person_associations(uuid) to anon, authenticated, service_role;
comment on function public.person_associations(uuid) is
  'Where a person is, and was, seated — for their public page (20 Sep 2026). Listed studios and artist pages where they are or were Owner, Faculty, Visiting faculty or Assistant; `staff` is never returned (rule E); an ENDED seat is returned only where they were actually put on a class there, so a page keeps a history without resurrecting a seat that was revoked.';

-- ── 5. EVERY KIND OF PROFILE HAS A NUMBER ────────────────────────────────────
-- `profiles.member_no` has been the account's own number since the Profile slice;
-- a studio and a crew had a uuid and nothing to print. The user: "Id should be
-- besides profile type on home and profilepage both" — so they get one, in the
-- same shape, assigned once and never reused.
alter table public.businesses add column if not exists member_no bigint generated by default as identity;
alter table public.crews add column if not exists member_no bigint generated by default as identity;
comment on column public.businesses.member_no is 'The business''s own account number, printed beside its type (20 Sep 2026). Assigned once, never reused.';
comment on column public.crews.member_no is 'The crew''s own account number, printed beside its type (20 Sep 2026). Assigned once, never reused.';

-- ⚠ AN ARTIST'S NUMBER IS NOT ADDED BACK. `20260919090000` deliberately took the
-- account number and the age OUT of what a stranger reads about a person
-- ("public_artist … carries neither"), and `public_artist` is left exactly as it
-- is. A BUSINESS's number is not personal data in that way, so a studio's, an
-- organization's and a crew's is public; a person's stays signed-in only, which
-- is what `findPublicPerson`'s fallback already does.
--
-- An organization's public page reads through a definer with a RETURNS TABLE, so
-- it is dropped and re-created. ⚠ 20260919142000's body VERBATIM with one column
-- appended — re-typing it from memory got eight things wrong in a first draft
-- (the column names, two types, the `verified` expression, the host subquery and
-- the location gate), which is this file's own standing lesson.
drop function if exists public.public_organization(uuid);
create function public.public_organization(p_org_id uuid)
returns table(id uuid, name text, city text, photo_path text, about text, socials jsonb, verified boolean, since timestamp with time zone, host_business_id uuid, phone text, contact_email text, lat double precision, lng double precision, member_no bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.city, p.profile_photo_path, p.about, p.socials,
         (p.gstin_verified_at is not null or p.verified_at is not null) as verified,
         p.created_at,
         (select t.id from public.businesses t
            join public.business_members m on m.business_id = t.id
           where m.user_id = p.id and m.member_role = 'owner' and m.deleted_at is null
             and t.type = 'org' and t.deleted_at is null
           limit 1) as host_business_id,
         p.phone,
         p.contact_email,
         case when p.location_set_at is not null then p.lat end as lat,
         case when p.location_set_at is not null then p.lng end as lng,
         p.member_no
  from public.profiles p
  where p.id = p_org_id and public.org_is_public(p_org_id);
$$;
revoke execute on function public.public_organization(uuid) from public;
grant execute on function public.public_organization(uuid) to anon, authenticated, service_role;
