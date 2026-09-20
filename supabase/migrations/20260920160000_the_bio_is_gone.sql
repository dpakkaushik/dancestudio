-- THE BIO IS GONE FROM A PROFILE AND FROM A BUSINESS (20 Sep 2026)
--
-- The user, having taken the About field off both Edit sheets yesterday:
-- "drop the about column", and then, narrowing it themselves:
-- "about and bio for profiles need to go away nothing for events".
--
-- ⚠ THREE TABLES CARRY A COLUMN CALLED `about` AND ONLY TWO OF THEM ARE THIS.
--   profiles.about    — a person's / an organization's Bio      → DROPPED here
--   businesses.about  — a studio's or artist page's Bio         → DROPPED here
--   events.about      — the event page's "WHAT TO KNOW"         → UNTOUCHED
-- `events.about` is written by `save_event`, read by the event page and the
-- manager, and 21 of 27 live events carry one. It is a different field that
-- happens to share a name, and the user said so in as many words.
--
-- ⚠ WHAT THIS DESTROYS, counted before it was written rather than after:
-- 12 of 37 live profiles and 5 of 194 live businesses hold a non-empty About
-- (16 and 31 counting soft-deleted rows, most of them proof leftovers). Every
-- one was copied out to a JSON file before this migration was applied, so the
-- decision is reversible by hand even though the column is not.
--
-- ⚠ FOUR FUNCTIONS NAME THE COLUMN and all four are dropped and re-created:
-- two because `about` is in their RETURNS TABLE (which `create or replace`
-- cannot change), two because they take a `p_about` argument (which it cannot
-- remove). Each body below is the LIVE definition read back with
-- `pg_get_functiondef` and copied verbatim — the one thing this file has been
-- bitten by three times is re-typing a function from memory. The only edits are
-- the removal of `about` / `p_about`.
--
-- ⚠ `entity_chart_row` and `person_dance_stats` also match the word, in a
-- COMMENT ("a stranger asking about…"), and are deliberately not touched.
--
-- ⚠ ORDERING, because both doors change SIGNATURE: the app sends `p_about`
-- today, so it must be applied and deployed close together — apply first, then
-- push, exactly as every other signature change here has been.

-- ---------------------------------------------------------------- the readers
drop function if exists public.public_artist(uuid);
drop function if exists public.public_organization(uuid);

-- ------------------------------------------------------------------ the doors
drop function if exists public.update_business_profile(uuid, text, smallint, text, jsonb, text[], boolean, boolean, boolean, boolean, text, text, text[]);
drop function if exists public.update_my_profile(text, text, smallint, text, jsonb, text[], text, text, boolean, date);

-- ----------------------------------------------------------------- the column
alter table public.profiles   drop column if exists about;
alter table public.businesses drop column if exists about;

-- =============================================================== public_artist
create function public.public_artist(p_user_id uuid)
 returns table(id uuid, full_name text, role text, city text, profile_photo_path text, socials jsonb, styles text[], verified_at timestamp with time zone, phone text, contact_email text)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select p.id, p.full_name, p.role, p.city, p.profile_photo_path, p.socials, p.styles, p.verified_at,
         case when p.phone_public then p.phone end as phone,
         p.contact_email
  from public.profiles p
  where p.id = p_user_id and p.deleted_at is null and p.role = 'user' and p.suspended_at is null
    and public.artist_plan_active(p.id);
$function$;

revoke all on function public.public_artist(uuid) from public, anon, authenticated, service_role;
grant execute on function public.public_artist(uuid) to anon, authenticated, service_role;
comment on function public.public_artist(uuid) is
  'An artist''s public face for a stranger (19 Sep 2026): the public columns of a live, unsuspended person with a live Artist plan - no age, no account number; the contact email they chose to publish, and the number only while their Call switch is on. Empty for anybody else. The Bio left on 20 Sep 2026.';

-- ========================================================= public_organization
create function public.public_organization(p_org_id uuid)
 returns table(id uuid, name text, city text, photo_path text, socials jsonb, verified boolean, since timestamp with time zone, host_business_id uuid, phone text, contact_email text, lat double precision, lng double precision, member_no bigint)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select p.id, p.full_name, p.city, p.profile_photo_path, p.socials,
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
$function$;

revoke all on function public.public_organization(uuid) from public, anon, authenticated, service_role;
grant execute on function public.public_organization(uuid) to anon, authenticated, service_role;

-- =================================================== update_business_profile
create function public.update_business_profile(p_business_id uuid, p_founded_year smallint, p_phone text, p_socials jsonb, p_enquiry_types text[], p_accepts_upi boolean, p_accepts_cards boolean, p_accepts_cash boolean, p_accepts_bank boolean, p_name text default null::text, p_contact_email text default null::text, p_styles text[] default null::text[])
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
  -- the name (18 Sep 2026): given -> trimmed, 1-80 characters; not given -> unchanged
  if p_name is not null then
    v_name := btrim(p_name);
    if char_length(v_name) = 0 then raise exception 'a business needs a name'; end if;
    if char_length(v_name) > 80 then raise exception 'a name is at most 80 characters'; end if;
  end if;
  -- the contact email (19 Sep 2026): given -> checked; empty -> cleared; not given -> unchanged
  if p_contact_email is not null then
    v_email := btrim(p_contact_email);
    if v_email <> '' and (char_length(v_email) > 254 or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
      raise exception 'that is not an email address';
    end if;
  end if;
  -- the styles (19 Sep 2026): given -> at least one, de-duplicated in the order
  -- given, at most twelve; not given -> unchanged. There is no way to empty it,
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
$function$;

revoke all on function public.update_business_profile(uuid, smallint, text, jsonb, text[], boolean, boolean, boolean, boolean, text, text, text[]) from public, anon, authenticated, service_role;
grant execute on function public.update_business_profile(uuid, smallint, text, jsonb, text[], boolean, boolean, boolean, boolean, text, text, text[]) to authenticated, service_role;

-- ========================================================= update_my_profile
create function public.update_my_profile(p_full_name text, p_city text, p_age smallint, p_socials jsonb, p_styles text[], p_phone text default null::text, p_contact_email text default null::text, p_phone_public boolean default null::boolean, p_dob date default null::date)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_item jsonb;
  v_platform text;
  v_url text;
  v_style text;
  v_seen text[] := '{}';
  v_styles text[] := '{}';
  v_email text;
  v_dob date;
  v_age smallint;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select p.role, p.dob into v_role, v_dob from public.profiles p where p.id = v_user and p.deleted_at is null;
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
  -- THE DATE OF BIRTH (19 Sep 2026): given -> checked and kept; not given -> unchanged
  if p_dob is not null then
    if p_dob > (now() at time zone 'Asia/Kolkata')::date - interval '13 years' or p_dob < (now() at time zone 'Asia/Kolkata')::date - interval '99 years' then
      raise exception 'a date of birth is 13 to 99 years ago';
    end if;
    v_dob := p_dob;
  end if;
  -- the age: from the date when there is one; a bare number only for a profile without a date
  if v_dob is not null then
    v_age := public.age_from_dob(v_dob);
  else
    if p_age is not null and (p_age < 13 or p_age > 99) then
      raise exception 'an age is between 13 and 99';
    end if;
    v_age := p_age;
  end if;
  if p_phone is not null and btrim(p_phone) <> '' and btrim(p_phone) !~ '^\+?[0-9][0-9 ]{7,17}$' then
    raise exception 'a phone number is 8 to 18 digits';
  end if;
  -- the contact email (19 Sep 2026): given -> checked; empty -> cleared; not given -> unchanged
  if p_contact_email is not null then
    v_email := btrim(p_contact_email);
    if v_email <> '' and (char_length(v_email) > 254 or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
      raise exception 'that is not an email address';
    end if;
  end if;

  -- links: an array of {platform, url}; a url is http(s) and a platform a short
  -- word. Not mandatory for an organization (11 Sep 2026).
  if p_socials is null or jsonb_typeof(p_socials) <> 'array' then
    raise exception 'links must be a list';
  end if;
  if jsonb_array_length(p_socials) > 12 then
    raise exception 'at most 12 links';
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
         dob = v_dob,
         age = v_age,
         socials = p_socials,
         styles = v_styles,
         phone = nullif(btrim(p_phone), ''),
         contact_email = case when p_contact_email is null then contact_email else nullif(v_email, '') end,
         -- the Call switch (19 Sep 2026): not given -> unchanged
         phone_public = coalesce(p_phone_public, phone_public),
         updated_by = v_user
   where id = v_user and deleted_at is null;
end;
$function$;

revoke all on function public.update_my_profile(text, text, smallint, jsonb, text[], text, text, boolean, date) from public, anon, authenticated, service_role;
grant execute on function public.update_my_profile(text, text, smallint, jsonb, text[], text, text, boolean, date) to authenticated, service_role;
comment on function public.update_my_profile(text, text, smallint, jsonb, text[], text, text, boolean, date) is
  'The one door that edits a profile. A city is required and a user keeps at least one dance style; an organization carries no styles and needs no links. The CONTACT EMAIL, the CALL SWITCH and the DATE OF BIRTH (19 Sep 2026) are last, optional, null = unchanged; a date on record decides the age. The Bio left on 20 Sep 2026 - p_about is gone, not ignored.';
