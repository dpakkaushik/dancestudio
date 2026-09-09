-- The organization rules, second pass (9 Sep 2026) ⚠ Rule 9: auth + RLS.
--
-- After 20260908120000 the two kinds of account exist. This migration closes
-- the gaps the schema review of 9 Sep found between the database and the
-- user's requirements of 8 Sep, so that each rule is held by the database and
-- not only by a screen:
--
--   1. an ORGANIZATION IS NOT A PERSON — it cannot book a class, buy a seat,
--      enter or watch an event, lead or join a crew, send an enquiry, hold a
--      class job, or be somebody's trainer or staff. One trigger function,
--      hung on the eight tables that name a person, refuses it.
--   2. update_my_profile holds the profile rules: a CITY is required (the
--      user's "location"); a USER keeps at least one dance style; an
--      ORGANIZATION keeps at least one link (the evidence the admin checks),
--      and its styles are always empty (it is not asked what it dances).
--   3. an organization's PROFILE ROW is not readable by other users through
--      the API — only by itself, by a platform admin, and by the people on the
--      teams of the studios it owns (their Staff desk names the owner).
--   4. grant hygiene: four trigger functions and my_artist_plan lose the
--      default PUBLIC / anon execute they never needed.
--
-- Nothing here touches existing rows. Legacy profiles with no city or no
-- style keep working until their next profile edit, which then asks for it.

-- ── 1. an organization is not a person ──────────────────────────────────────
-- TG_ARGV[0] is the column that names the person; TG_ARGV[1] finishes the
-- sentence "an organization account cannot …". The service role is exempt,
-- like every guard in this project (the seeder and the webhook run as it).
create or replace function public.guard_person_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_col text := tg_argv[0];
  v_what text := tg_argv[1];
  v_id uuid;
  v_role text;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role' then
    return new;
  end if;
  v_id := (to_jsonb(new) ->> v_col)::uuid;
  if v_id is null then
    return new;
  end if;
  -- an organization OWNS its studios: the owner row is the one membership it holds
  if tg_table_name = 'tenant_members' and (to_jsonb(new) ->> 'member_role') = 'owner' then
    return new;
  end if;
  select p.role into v_role from public.profiles p where p.id = v_id;
  if v_role = 'org' then
    raise exception 'an organization account cannot %', v_what;
  end if;
  return new;
end;
$$;
comment on function public.guard_person_only() is
  'Trigger (9 Sep 2026): refuses a row that names an organization account where a person belongs — bookings, orders, event bookings, crews, crew rosters, enquiries, class jobs, trainer/staff memberships. TG_ARGV[0] is the column, TG_ARGV[1] the deed. Service role exempt.';
revoke execute on function public.guard_person_only() from public, anon, authenticated;

create trigger enrollments_person_only
  before insert or update of user_id on public.enrollments
  for each row execute function public.guard_person_only('user_id', 'book a class — people book classes; an organization runs them');
create trigger orders_person_only
  before insert or update of user_id on public.orders
  for each row execute function public.guard_person_only('user_id', 'buy a seat — people book classes; an organization runs them');
create trigger event_bookings_person_only
  before insert or update of user_id on public.event_bookings
  for each row execute function public.guard_person_only('user_id', 'book or enter an event — people do; an organization hosts them');
create trigger crews_person_only
  before insert or update of leader_id on public.crews
  for each row execute function public.guard_person_only('leader_id', 'lead a crew — crews are people');
create trigger crew_members_person_only
  before insert or update of user_id on public.crew_members
  for each row execute function public.guard_person_only('user_id', 'join a crew — crews are people');
create trigger enquiries_person_only
  before insert or update of from_user_id on public.enquiries
  for each row execute function public.guard_person_only('from_user_id', 'send an enquiry — people ask businesses; an organization receives them');
create trigger class_claims_person_only
  before insert or update of user_id on public.class_claims
  for each row execute function public.guard_person_only('user_id', 'be put on a class — the artist and assistants are people');
create trigger tenant_members_person_only
  before insert or update of user_id, member_role on public.tenant_members
  for each row execute function public.guard_person_only('user_id', 'join a team as trainer or staff — those are people; an organization owns the studio');

-- ── 2. the profile rules, held by the one door that edits a profile ─────────
-- Body is 20260830220000's with three checks added: a city is required, a
-- user keeps at least one style, an organization keeps at least one link and
-- carries no styles.
create or replace function public.update_my_profile(
  p_full_name text,
  p_city text,
  p_age smallint,
  p_about text,
  p_socials jsonb,
  p_styles text[],
  p_phone text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_item jsonb;
  v_platform text;
  v_url text;
  v_style text;
  v_seen text[] := '{}';
  v_styles text[] := '{}';
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select p.role into v_role from public.profiles p where p.id = v_user and p.deleted_at is null;
  if v_role is null then
    raise exception 'finish onboarding first';
  end if;
  if p_full_name is null or char_length(btrim(p_full_name)) < 1 or char_length(p_full_name) > 120 then
    raise exception 'a name is 1 to 120 characters';
  end if;
  -- the user's "location" (requirement 2, 8 Sep 2026): a city, always
  if p_city is null or char_length(btrim(p_city)) < 1 then
    raise exception 'a city is required';
  end if;
  if char_length(p_city) > 120 then
    raise exception 'that city name is too long';
  end if;
  if p_age is not null and (p_age < 13 or p_age > 99) then
    raise exception 'an age is between 13 and 99';
  end if;
  if p_about is not null and char_length(p_about) > 220 then
    raise exception 'about is at most 220 characters';
  end if;
  if p_phone is not null and btrim(p_phone) <> '' and btrim(p_phone) !~ '^\+?[0-9][0-9 ]{7,17}$' then
    raise exception 'a phone number is 8 to 18 digits';
  end if;

  -- links: an array of {platform, url}; a url is http(s) and a platform a short word
  if p_socials is null or jsonb_typeof(p_socials) <> 'array' then
    raise exception 'links must be a list';
  end if;
  if jsonb_array_length(p_socials) > 12 then
    raise exception 'at most 12 links';
  end if;
  -- requirement 4: an organization's links are mandatory — the evidence behind its tick
  if v_role = 'org' and jsonb_array_length(p_socials) = 0 then
    raise exception 'an organization keeps at least one link';
  end if;
  for v_item in select * from jsonb_array_elements(p_socials) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'a link is a platform and a url';
    end if;
    v_platform := btrim(v_item ->> 'platform');
    v_url := btrim(v_item ->> 'url');
    if v_platform is null or char_length(v_platform) < 1 or char_length(v_platform) > 40 then
      raise exception 'a link needs a platform or a label (up to 40 characters)';
    end if;
    if v_url is null or char_length(v_url) > 300 or v_url !~* '^https?://[^[:space:]]+$' then
      raise exception 'a link is a web address starting with http:// or https://';
    end if;
    if v_platform = any (v_seen) then
      raise exception 'one link per platform';
    end if;
    v_seen := array_append(v_seen, v_platform);
  end loop;

  -- styles: short words, de-duplicated, in the order given
  if p_styles is null then
    raise exception 'styles must be a list';
  end if;
  foreach v_style in array p_styles loop
    v_style := btrim(v_style);
    if v_style is null or char_length(v_style) < 1 or char_length(v_style) > 40 then
      raise exception 'a style is 1 to 40 characters';
    end if;
    if not (v_style = any (v_styles)) then
      v_styles := array_append(v_styles, v_style);
    end if;
  end loop;
  if cardinality(v_styles) > 12 then
    raise exception 'at most 12 styles';
  end if;
  -- requirement 3: a user names at least one style; an organization is not asked
  if v_role = 'user' and cardinality(v_styles) = 0 then
    raise exception 'pick at least one dance style';
  end if;
  if v_role = 'org' then
    v_styles := '{}';
  end if;

  update public.profiles
     set full_name = btrim(p_full_name),
         city = btrim(p_city),
         age = p_age,
         about = nullif(btrim(p_about), ''),
         socials = p_socials,
         styles = v_styles,
         phone = nullif(btrim(p_phone), ''),
         updated_by = v_user
   where id = v_user and deleted_at is null;
end;
$$;
comment on function public.update_my_profile(text, text, smallint, text, jsonb, text[], text) is
  'The one door that edits a profile. Validates every field in words; since 9 Sep 2026 a city is required, a user keeps at least one dance style, and an organization keeps at least one link and carries no styles.';
revoke execute on function public.update_my_profile(text, text, smallint, text, jsonb, text[], text) from public, anon;
grant execute on function public.update_my_profile(text, text, smallint, text, jsonb, text[], text) to authenticated;

-- ── 3. an organization's profile row is not another user's to read ──────────
-- Step 1's policy let every signed-in user read every live profile. People
-- stay readable to each other (their pages, rosters, followers). An
-- organization is readable to itself, to a platform admin (the queue), and to
-- the people on the teams of the studios it owns — their Staff desk prints the
-- owner's name. Nobody else; the app already shows it to nobody else.
drop policy if exists "signed-in users read live profiles" on public.profiles;
create policy "signed-in users read live profiles"
  on public.profiles for select
  to authenticated
  using (
    deleted_at is null
    and (
      role <> 'org'
      or id = auth.uid()
      or public.is_platform_admin()
      or exists (
        select 1
        from public.tenant_members me
        join public.tenant_members own on own.tenant_id = me.tenant_id
        where me.user_id = auth.uid() and me.deleted_at is null
          and own.user_id = profiles.id and own.member_role = 'owner' and own.deleted_at is null
      )
    )
  );
comment on policy "signed-in users read live profiles" on public.profiles is
  'Signed-in users read live PEOPLE. An organization''s row is read only by itself, a platform admin, or a member of a studio it owns (9 Sep 2026).';

-- ── 4. the platform admin is ADMIN ONLY (user's decision, 9 Sep 2026) ───────
-- "Remove it as a user, keep it admin only." The first admin's account had
-- onboarded as a studio ("Dance Plus"); that profile goes, and the account
-- keeps only its platform_admins row. An admin with no profile has no Home,
-- no follows, no bookings — Home and onboarding send it to the queue.
--
-- Two things follow. notifications.user_id references profiles, so notifying
-- an admin who has no profile would fail the INSERT — and with it the
-- organization's request_org_verification. notify_platform_admins therefore
-- notifies only admins who also have a live profile; an admin-only account
-- reads the queue instead. And the profile is DELETED, not soft-deleted: a
-- soft-deleted row would keep the primary key and refuse any future
-- onboarding of the same account, while the app treats "no row" as "not
-- onboarded", which is the honest state.
delete from public.profiles p
 where p.id in (select u.id from auth.users u where lower(u.email) = 'ai@eeetaxi.com');

create or replace function public.notify_platform_admins(p_kind text, p_title text, p_body text, p_href text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  -- only admins who also hold a profile can carry a notification (the FK);
  -- an admin-only account reads the queue
  for v_user in
    select a.user_id
    from public.platform_admins a
    join public.profiles p on p.id = a.user_id and p.deleted_at is null
    where a.deleted_at is null
  loop
    perform public.notify(v_user, p_kind, p_title, p_body, p_href);
  end loop;
end;
$$;
comment on function public.notify_platform_admins(text, text, text, text) is
  'Internal: one notification per platform admin who also has a profile (notifications.user_id references profiles). An admin-only account reads the queue instead (9 Sep 2026).';
revoke execute on function public.notify_platform_admins(text, text, text, text) from public, anon, authenticated;

-- ── 5. grant hygiene ────────────────────────────────────────────────────────
revoke execute on function public.classes_room_check() from public, anon, authenticated;
revoke execute on function public.classes_room_guard() from public, anon, authenticated;
revoke execute on function public.sessions_room_check() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.my_artist_plan() from public, anon;
grant execute on function public.my_artist_plan() to authenticated;
