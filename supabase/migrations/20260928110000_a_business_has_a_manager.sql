-- A BUSINESS HAS A MANAGER (28 Sep 2026)
--
-- The user: "make sure in Organization or Studio Teams are able to add another
-- Owner & Manger as options and only these 2 get the right to get studio or
-- organization in the profile switcher. that profile switcher and rights should
-- never be given for faculty, visiting faculty, assistant, event team or other
-- team members."
--
-- The second half of that sentence is the APP's and shipped without schema: the
-- switcher and all seventeen desks under a business now admit a seat that RUNS
-- it, and a faculty seat keeps its own classes, its registers and its earnings
-- and nothing else. This file is the first half — the word `manager` itself,
-- which no CHECK in this database will accept today.
--
-- ⚠ THE RULE, ONE LINE, SO NO SITE IS A JUDGEMENT CALL:
--     WHEREVER `trainer` MAY ACT, `manager` MAY ACT.
--     WHEREVER ONLY `owner` MAY ACT, `manager` MAY NOT.
-- So a manager runs the place — the classes register, the rooms, the events
-- door, the pictures — and never touches its MONEY, its plan or its badge.
-- Earnings, refunds, the subscription, the verification, the GST number, taking
-- a membership off sale and handing out seats all stay the owner's, untouched.
--
-- ⚠⚠ AND ONE DEFECT IS FIXED IN THE SAME BREATH, because the user's sentence
-- cannot be true without it. An ORGANIZATION's team has had an `owner` LABEL
-- since 19 Sep, and it grants NOTHING: `set_organization_member_role` writes a
-- word on `organization_members` and no seat anywhere. R36 gave the equivalent
-- studio label a real `business_members` row on 20 Sep, and R48 took that path
-- away on 26 Sep when an organization stopped running studios — leaving the
-- label with nothing behind it. Counted on production right now: TWO people are
-- confirmed "Owner" of an organization and NEITHER can open it. An organization
-- Owner or Manager gets a real seat on the organization from here.
--
-- ⚠ Measured against the LIVE catalog before a line was written (migrations
-- supersede each other, so the .sql files are history): exactly EIGHT functions
-- name a `member_role in (...)` list, TWO policies on `rooms`, TWO on
-- `storage.objects`, and THREE CHECK constraints hold the vocabulary.
-- Live seats at the time of writing: 22 owner, and ELEVEN that are not —
-- 6 visiting_faculty, 3 trainer, 2 staff. Those eleven are the people the app
-- side stopped handing a business to this afternoon.
--
-- NOTHING IS BACKFILLED. No existing row becomes a manager; every seat on
-- production keeps the word it has, so applying this changes what nobody sees
-- until somebody hands the label out.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · THE VOCABULARY — three CHECKs, and they are three because the same word
--     is constrained separately in three places. ⚠ `business_members` and
--     `business_invites` are THE PAIR that was missed on 19 Sep 2026, when
--     `visiting_faculty` was offered by a door, accepted by the RPC and refused
--     by the table: "a value added to one table's vocabulary does not reach the
--     tables that FEED it."
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.business_members drop constraint business_members_member_role_check;
alter table public.business_members add constraint business_members_member_role_check
  check (member_role in ('owner', 'manager', 'trainer', 'staff', 'visiting_faculty', 'assistant'));

alter table public.business_invites drop constraint business_invites_member_role_check;
alter table public.business_invites add constraint business_invites_member_role_check
  check (member_role in ('manager', 'trainer', 'staff', 'visiting_faculty', 'assistant'));

-- ⚠ `owner` is still absent from the INVITE list, and that is Step 12b's rule
-- kept rather than overlooked: ownership is handed over on the desk to somebody
-- who has already said yes, never offered to a stranger with a link. A MANAGER
-- is invitable, because accepting the invite IS the consent and managing is not
-- owning.

-- ⚠ `studio_owner` stays in this list though nothing can write it any more
-- (`set_organization_member_role` has refused it since 26 Sep). Narrowing it
-- would refuse an UPDATE of any historical row that still carries the word, for
-- no gain; the live histogram has none, and the door is the enforcement.
alter table public.organization_members drop constraint organization_members_role_check;
alter table public.organization_members add constraint organization_members_role_check
  check (role in ('owner', 'manager', 'studio_owner', 'event_team', 'member'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · WHEREVER A TRAINER MAY ACT — six functions, every one `create or replace`
--     with an UNCHANGED signature, so not one grant moves and no ACL is restated
--     (the 16 Sep lesson: a DROPPED function comes back with the database's own
--     default privileges, which on Supabase includes anon).
-- ─────────────────────────────────────────────────────────────────────────────

-- ⚠⚠ EVERY BODY BELOW IS THE LIVE ONE, READ BACK WITH `pg_get_functiondef` AND
-- EDITED BY HAND — not re-typed. The first cut of this file DID re-type them and
-- the dry run caught five separate differences in one pass: a RETURNS **text**
-- written as void, two path checks that are a strict REGEX live and became a
-- loose LIKE, four error messages reworded, and — the one that mattered —
-- `can_run_register_for_class`'s middle branch silently losing its join back to
-- `business_members`, which is the 25 Aug 2026 hardening that stops a claim
-- outliving the seat behind it. **A re-typed function is one that can differ**
-- (16 Sep), and here it differed five ways before anybody looked.

create or replace function public.can_run_register(p_business_id uuid)
 returns boolean language sql stable security definer set search_path to ''
as $function$
  select exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.member_role in ('owner', 'manager', 'trainer')
      and m.deleted_at is null
  );
$function$;

create or replace function public.can_run_events(p_business_id uuid)
 returns boolean language sql stable security definer set search_path to ''
as $function$
  select exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id and m.user_id = auth.uid()
      and m.member_role in ('owner', 'manager', 'trainer') and m.deleted_at is null
  ) or exists (
    -- THE ORGANIZATION'S EVENT TEAM (20 Sep 2026), keyed on the business since 26 Sep
    select 1
    from public.organization_members om
    where om.org_id = p_business_id
      and om.user_id = auth.uid()
      and om.role in ('owner', 'manager', 'event_team')
      and om.status = 'confirmed'
      and om.deleted_at is null
  );
$function$;

create or replace function public.can_run_register_for_class(p_class_id uuid)
 returns boolean language sql stable security definer set search_path to ''
as $function$
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
$function$;

create or replace function public.set_business_profile_photo(p_business_id uuid, p_path text)
 returns text language plpgsql security definer set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id and m.user_id = v_user
      and m.member_role in ('owner', 'manager', 'trainer') and m.deleted_at is null
  ) then
    raise exception 'only the studio''s own people can change its photo';
  end if;
  if p_path is not null and p_path not like 'tenants/' || p_business_id::text || '/%' then
    raise exception 'that file does not belong to this business';
  end if;
  update public.businesses set profile_photo_path = p_path, updated_by = v_user
    where id = p_business_id and deleted_at is null;
  return p_path;
end;
$function$;

create or replace function public.set_class_poster(p_class_id uuid, p_path text)
 returns void language plpgsql security definer set search_path to ''
as $function$
declare
  v_business uuid;
begin
  select c.business_id into v_business
  from public.classes c
  where c.id = p_class_id and c.deleted_at is null;
  if v_business is null then
    raise exception 'that class does not exist';
  end if;
  if not exists (
    select 1 from public.business_members m
    where m.business_id = v_business and m.user_id = auth.uid()
      and m.member_role in ('owner', 'manager', 'trainer') and m.deleted_at is null
  ) then
    raise exception 'only the studio that runs this class can change its poster';
  end if;
  /* the path is checked against THIS business's own folder — the same rule the
     storage policy keeps, said again here so a row can never point at a file
     somebody else owns (the parity-slice-2 pattern) */
  if p_path is not null and p_path !~ ('^posters/' || v_business::text || '/[^/]+$') then
    raise exception 'that file is not in this business''s own posters folder';
  end if;
  update public.classes set poster_path = p_path where id = p_class_id;
end;
$function$;

create or replace function public.set_event_poster(p_event_id uuid, p_path text)
 returns void language plpgsql security definer set search_path to ''
as $function$
declare
  v_business uuid;
begin
  select e.business_id into v_business
  from public.events e
  where e.id = p_event_id and e.deleted_at is null;
  if v_business is null then
    raise exception 'that event does not exist';
  end if;
  if not exists (
    select 1 from public.business_members m
    where m.business_id = v_business and m.user_id = auth.uid()
      and m.member_role in ('owner', 'manager', 'trainer') and m.deleted_at is null
  ) then
    raise exception 'only the organiser can change this event''s poster';
  end if;
  if p_path is not null and p_path !~ ('^posters/' || v_business::text || '/[^/]+$') then
    raise exception 'that file is not in this business''s own posters folder';
  end if;
  update public.events set poster_path = p_path where id = p_event_id;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · THE FOUR POLICIES that name the pair. ⚠ A policy is data, not text: the
--     `member_role = ANY (ARRAY[...])` list is a PARSED expression, so no
--     rewrite of a function body reaches it — which is the 16 Sep lesson ("a
--     rename can reach a VALUE") in its other coat.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy "owners and trainers insert rooms" on public.rooms;
create policy "owners and trainers insert rooms" on public.rooms for insert to authenticated
with check (
  exists (
    select 1 from public.business_members m
     where m.business_id = rooms.business_id
       and m.user_id = (select auth.uid())
       and m.member_role in ('owner', 'manager', 'trainer')
       and m.deleted_at is null
  )
);

drop policy "owners and trainers update rooms" on public.rooms;
create policy "owners and trainers update rooms" on public.rooms for update to authenticated
using (
  exists (
    select 1 from public.business_members m
     where m.business_id = rooms.business_id
       and m.user_id = (select auth.uid())
       and m.member_role in ('owner', 'manager', 'trainer')
       and m.deleted_at is null
  )
);

drop policy "business people write their tenant folder" on storage.objects;
create policy "business people write their tenant folder" on storage.objects for insert to authenticated
with check (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = 'tenants'
  and exists (
    select 1 from public.business_members m
     where m.business_id = ((storage.foldername(name))[2])::uuid
       and m.user_id = (select auth.uid())
       and m.member_role in ('owner', 'manager', 'trainer')
       and m.deleted_at is null
  )
);

drop policy "business people delete from their tenant folder" on storage.objects;
create policy "business people delete from their tenant folder" on storage.objects for delete to authenticated
using (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = 'tenants'
  and exists (
    select 1 from public.business_members m
     where m.business_id = ((storage.foldername(name))[2])::uuid
       and m.user_id = (select auth.uid())
       and m.member_role in ('owner', 'manager', 'trainer')
       and m.deleted_at is null
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · WHAT A STRANGER READS. A manager is published exactly as faculty is —
--     name, picture and seat on a LISTED business's team, and the business on
--     the person's own page. ⚠ `staff` is still absent from both, which is
--     deliberate and unchanged (20 Sep): "other team member" is defined by not
--     being one of the others and has never had a public surface.
-- ─────────────────────────────────────────────────────────────────────────────

-- ⚠ BOTH RETURNS TABLE SHAPES ARE THE LIVE ONES, UNTOUCHED. Postgres refuses to
-- change a function's return type, so a column renamed here would fail the whole
-- migration — and the only way out would be `drop function`, which hands the new
-- one the database's DEFAULT privileges (`public_studio_team` is ANON-executable,
-- so that is a policy change in disguise). The first cut of this file invented
-- both column lists and the dry run stopped it dead with exactly that error.

create or replace function public.public_studio_team(p_business_id uuid)
 returns table(user_id uuid, member_role text, full_name text, photo_path text, is_org boolean)
 language sql stable security definer set search_path to ''
as $function$
  select m.user_id, m.member_role, p.full_name, p.profile_photo_path, (p.role = 'org') as is_org
  from public.business_members m
  join public.profiles p on p.id = m.user_id and p.deleted_at is null
  join public.businesses b on b.id = m.business_id
  where m.business_id = p_business_id and m.deleted_at is null
    and m.member_role in ('owner', 'manager', 'trainer', 'visiting_faculty', 'assistant')
    and b.deleted_at is null
    /* ⚠ AN ARTIST PAGE TOO (27 Sep 2026) — it takes the same seats, by the same
       consent, and is public only while listed, which the clause below keeps */
    and b.type in ('studio', 'artist_page')
    and (b.visibility = 'listed' or public.is_business_member(p_business_id))
  order by case m.member_role
             when 'owner' then 0 when 'manager' then 1 when 'trainer' then 2
             when 'visiting_faculty' then 3 else 4 end,
           m.sort, p.full_name;
$function$;

create or replace function public.person_associations(p_user_id uuid)
 returns table(business_id uuid, business_type text, business_name text, city text, photo_path text, member_role text, owner_id uuid, ended boolean)
 language sql stable security definer set search_path to ''
as $function$
  -- ⚠ the OWNER rides along so an artist page's row can open the PERSON behind
  -- it in one hop: /artist/{id} only redirects to /person/{owner} (18 Sep 2026),
  -- and a redirect-only URL in somebody's history is what makes back loop.
  select distinct on (b.id)
         b.id, b.type, b.name, b.city, b.profile_photo_path, m.member_role,
         public.business_owner(b.id), (m.deleted_at is not null)
  from public.business_members m
  join public.businesses b on b.id = m.business_id
  where m.user_id = p_user_id
    and m.member_role in ('owner', 'manager', 'trainer', 'visiting_faculty', 'assistant')
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
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5 · THE DOORS THAT HAND THE WORD OUT.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.set_member_role(p_business_id uuid, p_user_id uuid, p_role text)
returns public.business_members language plpgsql security definer set search_path = '' as $$
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
  if p_role not in ('owner', 'manager', 'trainer', 'staff', 'visiting_faculty', 'assistant') then
    raise exception 'a member may be an owner, a manager, faculty, visiting faculty, an assistant or other team';
  end if;
  select * into v_member from public.business_members m
   where m.business_id = p_business_id and m.user_id = p_user_id and m.deleted_at is null;
  if v_member.id is null then
    raise exception 'they are not on your team';
  end if;

  -- ⚠ NEVER THE LAST OWNER (20 Sep 2026). ⚠ A MANAGER DOES NOT COUNT: making the
  -- only owner a manager would leave a business nobody can subscribe, verify or
  -- hand a seat out for, which is exactly what this guard exists to prevent.
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

create or replace function public.invite_person_to_business(p_business_id uuid, p_user_id uuid, p_role text)
returns public.business_invites language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_invite public.business_invites;
  v_name text;
  v_role text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not public.is_business_owner(p_business_id) then
    raise exception 'only an owner invites somebody onto the team';
  end if;
  v_role := coalesce(nullif(btrim(p_role), ''), 'staff');
  -- 20 Sep 2026: `assistant`. 28 Sep 2026: `manager` — accepting the invite IS
  -- the consent, and managing is not owning, so unlike `owner` it may be offered.
  if v_role not in ('manager', 'trainer', 'staff', 'visiting_faculty', 'assistant') then
    raise exception 'owner is not a seat that can be given away';
  end if;
  if p_user_id = v_user then raise exception 'you are already on this team'; end if;

  select p.full_name into v_name
    from public.profiles p
   where p.id = p_user_id and p.deleted_at is null and p.role = 'user';
  if not found then raise exception 'that is not somebody on DanceOS'; end if;

  if exists (
    select 1 from public.business_members m
     where m.business_id = p_business_id and m.user_id = p_user_id and m.deleted_at is null
  ) then
    raise exception 'they are already on this team';
  end if;
  if exists (
    select 1 from public.business_invites i
     where i.business_id = p_business_id and i.user_id = p_user_id
       and i.status = 'pending' and i.deleted_at is null
  ) then
    raise exception 'they have already been asked — the invite is still waiting';
  end if;

  insert into public.business_invites (business_id, name, email, user_id, member_role, code, created_by, updated_by)
  values (p_business_id, v_name, null, p_user_id, v_role,
          substr(md5(gen_random_uuid()::text), 1, 10), v_user, v_user)
  returning * into v_invite;
  return v_invite;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6 · ⚠⚠ AN ORGANIZATION'S OWNER OR MANAGER GETS A REAL SEAT — the defect.
--
--     `organization_members` has been LABELS since 19 Sep: a word on the public
--     page, giving nobody a login and nobody a seat. R36 made the studio label
--     `studio_owner` write a genuine `business_members` row on 20 Sep, and R48
--     removed that path on 26 Sep when an organization stopped running studios
--     — so the `owner` label was left meaning nothing at all. Two people on
--     production hold it today and neither can open the organization.
--
--     ⚠ IT IS THE SAME SHAPE R36 USED, INCLUDING ITS UNDO: `prior_member_role`
--     remembers the seat that was replaced, so relabelling away puts back what
--     was there rather than removing somebody from the business altogether —
--     which is the bug `20260920140000` had to go back and fix.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.org_seat_follows_label(p_org_id uuid, p_user_id uuid, p_role text, p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_seat text;
  v_row public.business_members;
  v_prior text;
begin
  v_seat := case when p_role in ('owner', 'manager') then p_role else null end;

  -- ⚠⚠ THE ROW IS FOUND WHATEVER ITS `deleted_at`, and the dry run is what
  -- taught this: `business_members` carries a PLAIN unique constraint on
  -- (business_id, user_id) — not the partial one this codebase uses nearly
  -- everywhere else — so a SOFT-DELETED seat still occupies the slot and a
  -- second insert comes back `23505`. Relabelling somebody manager → member →
  -- manager would have failed on the third press, for every organization.
  select * into v_row from public.business_members m
   where m.business_id = p_org_id and m.user_id = p_user_id;

  if v_seat is not null then
    if v_row.id is null then
      -- no seat ever: make one, and remember there was none
      insert into public.business_members (business_id, user_id, member_role, sort, created_by, updated_by)
      values (p_org_id, p_user_id, v_seat, 0, p_actor, p_actor);
      update public.organization_members
         set prior_member_role = '(none)'
       where org_id = p_org_id and user_id = p_user_id and deleted_at is null;
    else
      -- ⚠ a seat that was taken away is REVIVED rather than re-inserted
      update public.business_members
         set member_role = v_seat, deleted_at = null, updated_by = p_actor
       where id = v_row.id;
      update public.organization_members
         set prior_member_role = coalesce(
               prior_member_role,
               case when v_row.deleted_at is not null then '(none)' else v_row.member_role end)
       where org_id = p_org_id and user_id = p_user_id and deleted_at is null;
    end if;
  else
    -- the label no longer runs the organization: put back whatever was replaced
    select m.prior_member_role into v_prior
      from public.organization_members m
     where m.org_id = p_org_id and m.user_id = p_user_id and m.deleted_at is null;
    if v_prior = '(none)' then
      update public.business_members set deleted_at = now(), updated_by = p_actor
       where business_id = p_org_id and user_id = p_user_id and deleted_at is null;
    elsif v_prior is not null then
      update public.business_members set member_role = v_prior, updated_by = p_actor
       where business_id = p_org_id and user_id = p_user_id and deleted_at is null;
    end if;
    update public.organization_members set prior_member_role = null
     where org_id = p_org_id and user_id = p_user_id and deleted_at is null;
  end if;
end;
$$;

revoke all on function public.org_seat_follows_label(uuid, uuid, text, uuid) from public, anon, authenticated;

comment on function public.org_seat_follows_label(uuid, uuid, text, uuid) is
  'Keeps an organization''s `business_members` seat in step with the label on its team (28 Sep 2026). Executable by nobody: the three doors below call it.';

create or replace function public.ask_organization_member(p_org_id uuid, p_user_id uuid, p_role text default 'member')
returns public.organization_members language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public.assert_caller_owns_organization(p_org_id);
  v_row public.organization_members;
  v_sort integer;
begin
  if p_role not in ('owner', 'manager', 'event_team', 'member') then
    raise exception 'ask somebody as an owner, a manager, event team or a member';
  end if;
  if p_user_id = v_user then
    raise exception 'you own this organization';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.role = 'user' and p.deleted_at is null and p.suspended_at is null
  ) then
    raise exception 'that person is not on DanceOS';
  end if;
  if exists (
    select 1 from public.organization_members m
    where m.org_id = p_org_id and m.user_id = p_user_id and m.deleted_at is null and m.status in ('asked', 'confirmed')
  ) then
    raise exception 'they are already on the team, or already asked';
  end if;
  update public.organization_members set deleted_at = now(), updated_by = v_user
    where org_id = p_org_id and user_id = p_user_id and deleted_at is null;
  select coalesce(max(m.sort), 0) + 1 into v_sort from public.organization_members m
    where m.org_id = p_org_id and m.deleted_at is null;
  insert into public.organization_members (org_id, user_id, role, status, sort, created_by, updated_by)
  values (p_org_id, p_user_id, p_role, 'asked', v_sort, v_user, v_user)
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.respond_to_organization_ask(p_member_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_row public.organization_members;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_row from public.organization_members m where m.id = p_member_id and m.deleted_at is null;
  if not found or v_row.user_id <> v_user then
    raise exception 'request not found';
  end if;
  if v_row.status <> 'asked' then
    raise exception 'this request was already answered';
  end if;
  update public.organization_members
    set status = case when p_accept then 'confirmed' else 'rejected' end, updated_by = v_user
    where id = p_member_id;
  -- ⚠ THE SEAT IS MADE WHEN THEY SAY YES, never when they are asked — consent
  -- first, authority after, which is this app's rule everywhere else
  if p_accept then
    perform public.org_seat_follows_label(v_row.org_id, v_row.user_id, v_row.role, v_user);
  end if;
end;
$$;

create or replace function public.set_organization_member_role(p_member_id uuid, p_role text, p_business_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_row public.organization_members;
  v_user uuid;
begin
  if p_role not in ('owner', 'manager', 'event_team', 'member') then
    -- 26 Sep 2026: an organization runs no studios, so there is no studio to own
    raise exception 'a team member is an owner, a manager, event team or a member';
  end if;
  if p_business_id is not null then
    raise exception 'only a studio owner names a studio';
  end if;
  select * into v_row from public.organization_members m where m.id = p_member_id and m.deleted_at is null;
  if not found then raise exception 'member not found'; end if;
  v_user := public.assert_caller_owns_organization(v_row.org_id);
  if v_row.status <> 'confirmed' then
    raise exception 'they have not said yes yet';
  end if;
  update public.organization_members
     set role = p_role, business_id = null, updated_by = v_user
   where id = p_member_id;
  perform public.org_seat_follows_label(v_row.org_id, v_row.user_id, p_role, v_user);
end;
$$;

create or replace function public.remove_organization_member(p_member_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_row public.organization_members;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_row from public.organization_members m where m.id = p_member_id and m.deleted_at is null;
  if not found then raise exception 'member not found'; end if;
  if v_row.user_id <> v_user and not public.is_business_owner(v_row.org_id) then
    raise exception 'only the organization''s owner removes its team';
  end if;
  -- ⚠ THE SEAT GOES WITH THE LABEL. Leaving a `business_members` row behind
  -- would be R38's "a grant is only as live as the seat behind it" broken from
  -- the other end: off the team on the page, still holding the organization.
  perform public.org_seat_follows_label(v_row.org_id, v_row.user_id, 'member', v_user);
  update public.organization_members set deleted_at = now(), updated_by = v_user where id = p_member_id;
end;
$$;

-- ⚠ NOTHING IS BACKFILLED FOR THE TWO EXISTING ORGANIZATION OWNERS EITHER. They
-- hold a label with no seat today, and giving somebody authority over a live
-- business is not a thing a migration should do behind its owner's back — the
-- organization's owner relabels them on the Team desk and the seat follows,
-- which takes one press and is a decision somebody made.
