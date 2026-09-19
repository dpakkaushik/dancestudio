-- A STUDIO SAYS WHAT IT DANCES, A TEAM IS ASKED BY NAME, ORDERED AND PAID, AND A
-- STUDENT CAN BE A PERSON (19 Sep 2026) — four columns, two re-created doors,
-- three new RPCs.
--
-- 1. ⚠ `businesses.styles` — THE USER: "some studios don't show dance styles on
--    profile, it is mandatory to have one at least."  They are right and the
--    cause is structural: a studio has never had styles of its own. Its public
--    page DERIVES them from its published classes, so a studio that has not
--    published one yet shows none — and that is most of them. Counted on
--    production before writing this: **18 listed studios, 6 with a published
--    class**, so twelve public pages say nothing about what is danced there.
--    A business gets its own list now, backfilled from the classes where there
--    are any; `update_business_profile` refuses to empty it, and
--    `create_business_with_owner` refuses a studio without one.
--    ⚠ What this does NOT do: unlist the twelve. `guard_business_visibility`
--    is untouched, because taking a live studio off Discover over a field it
--    never had is a punishment for our own omission. They keep their place and
--    the hub asks them for a style; the next save cannot leave without one.
--
-- 2. `business_members.sort` — the user: a team "should be able to place them in
--    order as well". `organization_members` has had `sort` since push 2; a
--    studio's team is ordered by `created_at` and had no way to change it.
--    `reorder_business_members` is the owner's door, and it is the crew desk's
--    `reorder_crew_members` in a different coat.
--
-- 3. `leads.user_id` — the user: a student is added "same way as for Team", i.e.
--    through the people picker, and the row then opens their profile. A lead has
--    only ever been free text plus `converted_user_id` ("who they became"), which
--    no screen writes. `user_id` is WHO THIS ROW IS, from the moment it is made.
--    Nullable on purpose: the walk-in at the desk who is not on DanceOS is still
--    a real student, and typing their name is still how they get on the list.
--
-- 4. ⚠ `business_invites.user_id` — the user: a team member is added "by typing
--    name, number, email or scan … similar suggestion as we get for other person
--    dropdowns with photo and name". An invite has only ever been keyed on the
--    EMAIL ADDRESS somebody signs in with, because that is what DanceOS
--    authenticates on — and the people picker hands back a USER ID, never an
--    address (a profile does not carry one; it lives in `auth.users`). So an
--    invite may now name a PERSON instead: `email` becomes nullable, `user_id`
--    joins it, and a CHECK keeps exactly one of the two. Nothing about consent
--    changes — `accept_business_invite` is still the invited person's own act,
--    and a link-holder still cannot use somebody else's invite.
--
-- 5. `record_team_payment` — the user: a team should be able "to pay them, track
--    payment history and should be part of expenses in the earnings". Two of
--    those three already exist: `payouts` IS the expense ledger and the Earnings
--    desk's MONEY OUT half already sums it. What was missing is a payment that
--    is not a bill for sessions taught: `record_payout` builds its amount from
--    `class_people.pay_per_session_inr` and refuses anything else, so a studio
--    could not pay its front-desk staff at all. This writes a payout with an
--    amount the owner states and NO lines — which is exactly what it is.
--    ⚠ It cannot double-pay a session, because it claims none.
--
-- No policy changes. No row is deleted. The re-created functions restate their
-- exact ACL — a re-created function otherwise arrives with Supabase's default
-- grants, including anon (the 16 Sep lesson).

-- ── 1. a business says what it dances ───────────────────────────────────────
alter table public.businesses
  add column if not exists styles text[] not null default '{}';

comment on column public.businesses.styles is
  'What is danced here, the business''s own answer (19 Sep 2026). Its public page used to derive this from its published classes alone, so a studio with no class yet showed nothing. Backfilled from those classes; at least one is required on create and on every profile save.';

-- backfill: what each business has actually published, most-taught first, at most
-- eight. A business with no published class keeps an empty list and is asked for
-- one the next time its owner opens the Edit sheet.
update public.businesses b
   set styles = coalesce(s.list, '{}')
  from (
    select c.business_id, array_agg(c.style order by c.n desc, c.style) filter (where c.rn <= 8) as list
      from (
        select business_id, style, count(*) n,
               row_number() over (partition by business_id order by count(*) desc, style) rn
          from public.classes
         where status = 'published' and deleted_at is null and style is not null and btrim(style) <> ''
         group by business_id, style
      ) c
     group by c.business_id
  ) s
 where s.business_id = b.id and b.deleted_at is null and coalesce(array_length(b.styles, 1), 0) = 0;

-- ── 2. a team has an order ──────────────────────────────────────────────────
alter table public.business_members
  add column if not exists sort integer not null default 0;

comment on column public.business_members.sort is
  'Where this person sits on the team list (19 Sep 2026). Lower is higher; ties fall back to when they joined. Set by reorder_business_members, the owner''s alone.';

create index if not exists business_members_business_sort_idx
  on public.business_members (business_id, sort, created_at)
  where deleted_at is null;

-- seed the order from the order they are shown in today, so nothing jumps on the
-- first render: the owner first, then whoever joined earliest
with ranked as (
  select id, row_number() over (
           partition by business_id
           order by case when member_role = 'owner' then 0 else 1 end, created_at
         ) - 1 as n
    from public.business_members
   where deleted_at is null
)
update public.business_members m
   set sort = ranked.n
  from ranked
 where ranked.id = m.id and m.sort = 0;

-- THE OWNER'S DOOR. The list given is the new order; anybody left out keeps their
-- place after it, which makes a partial list safe rather than destructive.
create or replace function public.reorder_business_members(p_business_id uuid, p_user_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_n integer := 0;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from public.business_members m
     where m.business_id = p_business_id and m.user_id = v_user
       and m.member_role = 'owner' and m.deleted_at is null
  ) then
    raise exception 'only an owner arranges the team';
  end if;
  foreach v_id in array coalesce(p_user_ids, '{}'::uuid[]) loop
    update public.business_members
       set sort = v_n, updated_by = v_user
     where business_id = p_business_id and user_id = v_id and deleted_at is null;
    v_n := v_n + 1;
  end loop;
end;
$$;
revoke execute on function public.reorder_business_members(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_business_members(uuid, uuid[]) to authenticated, service_role;

-- the public team reads in the order the studio arranged (same signature, so the
-- ACL and every caller are untouched)
create or replace function public.public_studio_team(p_business_id uuid)
returns table(user_id uuid, member_role text, full_name text, photo_path text, is_org boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, m.member_role, p.full_name, p.profile_photo_path, (p.role = 'org') as is_org
  from public.business_members m
  join public.profiles p on p.id = m.user_id and p.deleted_at is null
  join public.businesses b on b.id = m.business_id
  where m.business_id = p_business_id and m.deleted_at is null
    and m.member_role in ('owner', 'trainer', 'visiting_faculty')
    and b.deleted_at is null and b.type = 'studio'
    and (b.visibility = 'listed' or public.is_business_member(p_business_id))
  order by case m.member_role when 'owner' then 0 when 'trainer' then 1 else 2 end, m.sort, p.full_name;
$$;

-- ── 3. a student can be a person ────────────────────────────────────────────
alter table public.leads
  add column if not exists user_id uuid references public.profiles (id) on delete set null;

comment on column public.leads.user_id is
  'The person this row IS, when they were added from the people picker (19 Sep 2026). Null for a walk-in typed at the desk. `converted_user_id` is a different fact — who a free-text lead later turned out to be.';

create index if not exists leads_business_user_idx
  on public.leads (business_id, user_id)
  where deleted_at is null and user_id is not null;

-- ── the two doors that gain the styles ──────────────────────────────────────
-- ⚠ DROPPED AND RE-CREATED, not replaced: a new parameter cannot be added to a
-- function in place, and two overloads of one name is how PostgREST stops
-- finding either (the Step 11 lesson). `p_styles` is LAST and defaults to null,
-- so every existing named-argument call resolves exactly as it did.

drop function if exists public.update_business_profile(uuid, text, smallint, text, jsonb, text[], boolean, boolean, boolean, boolean, text, text);
create function public.update_business_profile(
  p_business_id uuid,
  p_about text,
  p_founded_year smallint,
  p_phone text,
  p_socials jsonb,
  p_enquiry_types text[],
  p_accepts_upi boolean,
  p_accepts_cards boolean,
  p_accepts_cash boolean,
  p_accepts_bank boolean,
  p_name text default null,
  p_contact_email text default null,
  p_styles text[] default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_item jsonb;
  v_url text;
  v_name text;
  v_email text;
  v_styles text[];
  v_type text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from public.business_members m
     where m.business_id = p_business_id and m.user_id = v_user and m.member_role = 'owner' and m.deleted_at is null
  ) then
    raise exception 'only an owner changes what a business says about itself';
  end if;
  if p_about is not null and char_length(p_about) > 220 then raise exception 'about is at most 220 characters'; end if;
  if p_phone is not null and p_phone !~ '^\+?[0-9][0-9 ]{7,17}$' then raise exception 'a phone number is 8 to 18 digits'; end if;
  if p_socials is null or jsonb_typeof(p_socials) <> 'array' or jsonb_array_length(p_socials) > 12 then
    raise exception 'links must be a list of at most 12';
  end if;
  for v_item in select * from jsonb_array_elements(p_socials) loop
    v_url := btrim(v_item ->> 'url');
    if coalesce(btrim(v_item ->> 'platform'), '') = '' or v_url is null or v_url !~* '^https?://[^[:space:]]+$' then
      raise exception 'a link is a platform and a web address starting with http:// or https://';
    end if;
  end loop;
  -- the name (18 Sep 2026): given → trimmed, 1–80 characters; not given → unchanged
  if p_name is not null then
    v_name := btrim(p_name);
    if char_length(v_name) = 0 then raise exception 'a business needs a name'; end if;
    if char_length(v_name) > 80 then raise exception 'a name is at most 80 characters'; end if;
  end if;
  -- the contact email (19 Sep 2026): given → checked; empty → cleared; not given → unchanged
  if p_contact_email is not null then
    v_email := btrim(p_contact_email);
    if v_email <> '' and (char_length(v_email) > 254 or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
      raise exception 'that is not an email address';
    end if;
  end if;
  -- ⚠ THE STYLES (19 Sep 2026): given → at least one, de-duplicated in the order
  -- given, at most twelve; not given → unchanged. There is no way to empty it,
  -- which is what "mandatory to have one at least" means at this door.
  if p_styles is not null then
    select array_agg(s order by n) into v_styles
      from (select distinct on (btrim(x)) btrim(x) s, min(i) n
              from unnest(p_styles) with ordinality as u(x, i)
             where btrim(x) <> ''
             group by btrim(x)) d;
    v_styles := coalesce(v_styles, '{}');
    if coalesce(array_length(v_styles, 1), 0) = 0 then
      select b.type into v_type from public.businesses b where b.id = p_business_id;
      raise exception '%', case when v_type = 'studio'
        then 'a studio says at least one dance style'
        else 'name at least one dance style' end;
    end if;
    if array_length(v_styles, 1) > 12 then raise exception 'at most twelve dance styles'; end if;
  end if;

  update public.businesses
     set name = coalesce(v_name, name),
         about = nullif(btrim(p_about), ''),
         founded_year = p_founded_year,
         phone = nullif(btrim(p_phone), ''),
         socials = p_socials,
         enquiry_types = p_enquiry_types,
         accepts_upi = coalesce(p_accepts_upi, accepts_upi),
         accepts_cards = coalesce(p_accepts_cards, accepts_cards),
         accepts_cash = coalesce(p_accepts_cash, accepts_cash),
         contact_email = case when p_contact_email is null then contact_email else nullif(v_email, '') end,
         accepts_bank = coalesce(p_accepts_bank, accepts_bank),
         styles = coalesce(v_styles, styles),
         updated_by = v_user
   where id = p_business_id and deleted_at is null;
end;
$$;
revoke execute on function public.update_business_profile(uuid, text, smallint, text, jsonb, text[], boolean, boolean, boolean, boolean, text, text, text[]) from public, anon;
grant execute on function public.update_business_profile(uuid, text, smallint, text, jsonb, text[], boolean, boolean, boolean, boolean, text, text, text[]) to authenticated, service_role;

drop function if exists public.create_business_with_owner(text, text, text, text);
create function public.create_business_with_owner(p_name text, p_type text, p_area text default null, p_city text default null, p_styles text[] default null)
returns public.businesses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_business public.businesses;
  v_lat double precision;
  v_lng double precision;
  v_role text;
  v_why text;
  v_visibility text;
  v_styles text[];
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_type not in ('studio', 'artist_page') then raise exception 'invalid business type'; end if;
  if p_name is null or char_length(trim(p_name)) = 0 then raise exception 'name is required'; end if;
  select p.role into v_role from public.profiles p where p.id = v_user and p.deleted_at is null;
  if not found then raise exception 'finish onboarding first'; end if;

  select array_agg(s order by n) into v_styles
    from (select distinct on (btrim(x)) btrim(x) s, min(i) n
            from unnest(coalesce(p_styles, '{}'::text[])) with ordinality as u(x, i)
           where btrim(x) <> ''
           group by btrim(x)) d;
  v_styles := coalesce(v_styles, '{}');

  if p_type = 'studio' then
    v_why := public.why_no_studio();
    if v_why is not null then raise exception '%', v_why; end if;
    -- ⚠ 19 Sep 2026: a studio says what is danced there before it exists
    if coalesce(array_length(v_styles, 1), 0) = 0 then
      raise exception 'a studio says at least one dance style';
    end if;
    v_visibility := 'unlisted';
  else
    if v_role <> 'user' then raise exception 'an artist page belongs to a person — an organization sets up studios'; end if;
    if not public.artist_plan_active(v_user) then raise exception 'the Artist plan unlocks your artist page'; end if;
    if exists (select 1 from public.businesses t join public.business_members m on m.business_id = t.id
                where m.user_id = v_user and m.member_role = 'owner' and m.deleted_at is null
                  and t.type = 'artist_page' and t.deleted_at is null) then
      raise exception 'you already have an artist page';
    end if;
    -- an artist page is named after a person who already carries their own styles,
    -- and Home provisions it without asking (R22) — so it is not required here
    v_visibility := 'listed';
  end if;

  select c.lat, c.lng into v_lat, v_lng from public.cities c
   where c.city = nullif(trim(p_city), '') and c.deleted_at is null;

  insert into public.businesses (type, name, area, city, lat, lng, visibility, styles, created_by, updated_by)
  values (p_type, trim(p_name), nullif(trim(p_area), ''), nullif(trim(p_city), ''), v_lat, v_lng, v_visibility, v_styles, v_user, v_user)
  returning * into v_business;
  insert into public.business_members (business_id, user_id, member_role, sort, created_by, updated_by)
  values (v_business.id, v_user, 'owner', 0, v_user, v_user);
  return v_business;
end;
$$;
revoke execute on function public.create_business_with_owner(text, text, text, text, text[]) from public, anon;
grant execute on function public.create_business_with_owner(text, text, text, text, text[]) to authenticated, service_role;

-- ── 4. a team member is asked BY NAME ───────────────────────────────────────
alter table public.business_invites
  add column if not exists user_id uuid references public.profiles (id) on delete cascade;
alter table public.business_invites alter column email drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'business_invites_one_handle') then
    alter table public.business_invites
      add constraint business_invites_one_handle
      check ((email is null) <> (user_id is null));
  end if;
end $$;

comment on column public.business_invites.user_id is
  'The person invited, when they were picked from the people search (19 Sep 2026). Exactly one of this and `email` is set: an address reaches somebody who may not be on DanceOS yet, a person id reaches somebody who is.';

create index if not exists business_invites_user_idx
  on public.business_invites (user_id, status)
  where deleted_at is null and user_id is not null;

-- THE OWNER'S OTHER DOOR. Same rules as `invite_to_business` — an owner only,
-- a live business, not somebody already on the team, not a second live invite —
-- said against a person rather than an address.
create or replace function public.invite_person_to_business(p_business_id uuid, p_user_id uuid, p_role text)
returns public.business_invites
language plpgsql
security definer
set search_path = ''
as $$
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
  if v_role not in ('trainer', 'staff', 'visiting_faculty') then
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

  -- it still gets a code: the QR and the link are how an invite is HANDED over
  -- in the room, and `accept_business_invite` still checks who is accepting
  insert into public.business_invites (business_id, name, email, user_id, member_role, code, created_by, updated_by)
  values (p_business_id, v_name, null, p_user_id, v_role,
          substr(md5(gen_random_uuid()::text), 1, 10), v_user, v_user)
  returning * into v_invite;
  return v_invite;
end;
$$;
revoke execute on function public.invite_person_to_business(uuid, uuid, text) from public, anon;
grant execute on function public.invite_person_to_business(uuid, uuid, text) to authenticated, service_role;

-- ⚠ AND THE THREE DOORS THAT DECIDE WHOSE INVITE IT IS. All three compared the
-- ADDRESS alone, so an invite naming a person could be accepted by nobody — the
-- comparison is "my address, or me" now. Consent is unchanged: holding the link
-- is still not enough, and a person still answers only their own invite.
create or replace function public.accept_business_invite(p_code text)
returns public.business_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text := public.my_auth_email();
  v_invite public.business_invites;
  v_member public.business_members;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into v_invite from public.business_invites i
  where i.code = p_code and i.deleted_at is null;
  if v_invite.id is null then raise exception 'that invite link is not valid'; end if;
  if v_invite.status <> 'pending' then raise exception 'that invite has already been answered'; end if;
  -- consent is tied to identity, not to holding the link
  if not ((v_invite.email is not null and v_invite.email is not distinct from v_email)
          or (v_invite.user_id is not null and v_invite.user_id = v_user)) then
    raise exception 'this invite was sent to somebody else';
  end if;
  if not exists (
    select 1 from public.profiles p where p.id = v_user and p.deleted_at is null
  ) then
    raise exception 'finish setting up your profile first';
  end if;

  -- a person who was removed and asked back rejoins the same seat
  insert into public.business_members (business_id, user_id, member_role, created_by, updated_by)
  values (v_invite.business_id, v_user, v_invite.member_role, v_user, v_user)
  on conflict (business_id, user_id) do update
    set member_role = excluded.member_role,
        deleted_at = null,
        updated_by = v_user
  returning * into v_member;

  update public.business_invites
    set status = 'accepted', accepted_by = v_user, accepted_at = now(), updated_by = v_user
    where id = v_invite.id;

  return v_member;
end;
$$;

create or replace function public.decline_business_invite(p_code text)
returns public.business_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_invite public.business_invites;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into v_invite from public.business_invites i
  where i.code = p_code and i.deleted_at is null;
  if v_invite.id is null then raise exception 'that invite link is not valid'; end if;
  if v_invite.status <> 'pending' then raise exception 'that invite has already been answered'; end if;
  if not ((v_invite.email is not null and v_invite.email is not distinct from public.my_auth_email())
          or (v_invite.user_id is not null and v_invite.user_id = v_user)) then
    raise exception 'this invite was sent to somebody else';
  end if;

  update public.business_invites
    set status = 'declined', updated_by = v_user
    where id = v_invite.id
    returning * into v_invite;

  return v_invite;
end;
$$;

-- the hint says what it can: an address is masked, a person is named
create or replace function public.preview_business_invite(p_code text)
returns table(business_id uuid, business_name text, member_role text, invited_name text, status text, email_hint text, is_for_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.business_id,
    t.name,
    i.member_role,
    i.name,
    i.status,
    case when i.email is null then i.name
         else left(i.email, 1) || '***@' || split_part(i.email, '@', 2) end,
    (i.email is not null and i.email = public.my_auth_email())
      or (i.user_id is not null and i.user_id = auth.uid())
  from public.business_invites i
  join public.businesses t on t.id = i.business_id
  where i.code = p_code
    and i.deleted_at is null
    and t.deleted_at is null;
$$;

-- an invite reaches you by either handle now (same signature, same ACL)
create or replace function public.my_pending_invites()
returns table(invite_id uuid, business_id uuid, business_name text, business_type text, member_role text, code text, invited_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.business_id, t.name, t.type, i.member_role, i.code, i.name, i.created_at
  from public.business_invites i
  join public.businesses t on t.id = i.business_id
  where (i.email = public.my_auth_email() or i.user_id = auth.uid())
    and i.status = 'pending'
    and i.deleted_at is null
    and t.deleted_at is null
  order by i.created_at desc
  limit 20;
$$;

-- ── 5. a team member can be PAID ────────────────────────────────────────────
-- A payout that is not a bill for sessions: the owner states the amount, and the
-- row lands in the same ledger the Earnings desk already reads as MONEY OUT, so
-- it is an expense the moment it is written. No lines, because it claims no
-- session — which is also why it can never double-pay one.
create or replace function public.record_team_payment(
  p_business_id uuid,
  p_user_id uuid,
  p_amount_inr integer,
  p_method text default 'bank_transfer',
  p_status text default 'done',
  p_paid_on date default null,
  p_note text default null
)
returns public.payouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_payout public.payouts;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not public.is_business_owner(p_business_id) then
    raise exception 'only the owner records a payment';
  end if;
  if p_amount_inr is null or p_amount_inr <= 0 then
    raise exception 'a payment is at least ₹1';
  end if;
  if p_amount_inr > 10000000 then raise exception 'that is more than this records'; end if;
  if p_status not in ('done', 'in_transit', 'on_hold', 'failed') then raise exception 'invalid status'; end if;
  if p_method not in ('bank_transfer', 'upi', 'cash', 'other') then raise exception 'invalid method'; end if;
  -- they have to be, or have been, on this team: a studio pays its own people
  if not exists (
    select 1 from public.business_members m
     where m.business_id = p_business_id and m.user_id = p_user_id
  ) then
    raise exception 'they are not on this team';
  end if;

  insert into public.payouts (business_id, user_id, amount_inr, status, method,
                              paid_on, note, created_by, updated_by)
  values (p_business_id, p_user_id, p_amount_inr, p_status, p_method,
          coalesce(p_paid_on, current_date), nullif(btrim(coalesce(p_note, '')), ''),
          v_user, v_user)
  returning * into v_payout;
  return v_payout;
end;
$$;
revoke execute on function public.record_team_payment(uuid, uuid, integer, text, text, date, text) from public, anon;
grant execute on function public.record_team_payment(uuid, uuid, integer, text, text, date, text) to authenticated, service_role;
