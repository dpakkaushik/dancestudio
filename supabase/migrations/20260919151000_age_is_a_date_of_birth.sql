-- ═══════════════════════════════════════════════════════════════════════════
-- AGE IS A DATE OF BIRTH (19 Sep 2026)
--
-- The user: "age should always be DOB instead when selecting anywhere in the
-- app." A profile carried `age` since the Profile slice (30 Aug 2026) — a
-- number typed once that is wrong a year later. It carries a DATE OF BIRTH
-- now, and the age every page prints is worked out from it on the day.
--
--   · `profiles.dob date` — nullable (nobody has one yet), never before 1920.
--   · `update_my_profile` gains `p_dob date default null` LAST (DROP + recreate:
--     a new argument on a function this many callers name by argument would
--     otherwise be an overload, the Step 11 lesson; the ACL is restated to
--     exactly today's). A date given is checked — 13 to 99 years ago — and
--     written, and `age` is kept IN STEP from it so every existing reader of
--     the column (the person page, the boards, the Profile tab, `public_artist`
--     which hands a stranger neither) keeps printing the right number without a
--     line changing; not given → unchanged. `p_age` stays for the callers that
--     still send it (the demo seeder until it is re-cut; the proofs) and is
--     ignored whenever a date is on record, because the date is the truth.
--   · `age_from_dob(date)` — the one arithmetic, IST-dated, used here and by
--     the nightly clock below.
--   · A tiny pg_cron job at 21:30 UTC rolls `age` forward for anybody whose
--     birthday it is (guarded like the subscription clock: the schedule is
--     skipped where pg_cron is off, and the rest still applies).
--
-- No policy change; `public_artist`'s shape is untouched (it never carried the
-- age); a stranger learns nothing new.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists dob date
  check (dob is null or dob >= date '1920-01-01');
comment on column public.profiles.dob is
  'Date of birth (19 Sep 2026). The age a page prints is worked out from this on the day; `age` is kept in step from it and is only a number of its own for a profile that never gave a date.';

create or replace function public.age_from_dob(p_dob date)
returns smallint
language sql
stable
set search_path = ''
as $$
  select case when p_dob is null then null
              else extract(year from age((now() at time zone 'Asia/Kolkata')::date, p_dob))::smallint end;
$$;
grant execute on function public.age_from_dob(date) to anon, authenticated;

-- ── the one door, with the date last ────────────────────────────────────────
drop function if exists public.update_my_profile(text, text, smallint, text, jsonb, text[], text, text, boolean);
create function public.update_my_profile(
  p_full_name text,
  p_city text,
  p_age smallint,
  p_about text,
  p_socials jsonb,
  p_styles text[],
  p_phone text default null,
  p_contact_email text default null,
  p_phone_public boolean default null,
  p_dob date default null
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
  -- THE DATE OF BIRTH (19 Sep 2026): given → checked and kept; not given → unchanged
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
  if p_about is not null and char_length(p_about) > 220 then
    raise exception 'about is at most 220 characters';
  end if;
  if p_phone is not null and btrim(p_phone) <> '' and btrim(p_phone) !~ '^\+?[0-9][0-9 ]{7,17}$' then
    raise exception 'a phone number is 8 to 18 digits';
  end if;
  -- the contact email (19 Sep 2026): given → checked; empty → cleared; not given → unchanged
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
         about = nullif(btrim(p_about), ''),
         socials = p_socials,
         styles = v_styles,
         phone = nullif(btrim(p_phone), ''),
         contact_email = case when p_contact_email is null then contact_email else nullif(v_email, '') end,
         -- the Call switch (19 Sep 2026): not given → unchanged
         phone_public = coalesce(p_phone_public, phone_public),
         updated_by = v_user
   where id = v_user and deleted_at is null;
end;
$$;
revoke execute on function public.update_my_profile(text, text, smallint, text, jsonb, text[], text, text, boolean, date) from public, anon;
grant execute on function public.update_my_profile(text, text, smallint, text, jsonb, text[], text, text, boolean, date) to authenticated, service_role;
comment on function public.update_my_profile(text, text, smallint, text, jsonb, text[], text, text, boolean, date) is
  'The one door that edits a profile. A city is required and a user keeps at least one dance style; an organization carries no styles and needs no links. The CONTACT EMAIL, the CALL SWITCH and the DATE OF BIRTH (19 Sep 2026) are last, optional, null = unchanged; a date on record decides the age.';

-- ── the birthday clock: age rolls forward on the day ────────────────────────
create or replace function public.roll_ages_forward()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles p
     set age = public.age_from_dob(p.dob)
   where p.dob is not null and p.deleted_at is null
     and p.age is distinct from public.age_from_dob(p.dob);
$$;
revoke execute on function public.roll_ages_forward() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'birthday-clock';
    perform cron.schedule('birthday-clock', '30 21 * * *', 'select public.roll_ages_forward()');
  else
    raise notice 'pg_cron is not enabled: ages roll forward on the next profile save instead of nightly';
  end if;
end;
$$;
