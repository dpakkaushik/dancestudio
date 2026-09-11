-- TWO THINGS THE FIRST REAL SIGN-UP FOUND (11 Sep 2026).
--
-- ─── 1. AN ORGANIZATION'S OWN LINKS ARE OPTIONAL NOW ────────────────────────
--
-- Found by the user signing up as a new organization, and by the first run of
-- the rewritten happy-path: skipping the links screen raised
--
--     an organization keeps at least one link
--
-- and onboarding could not be finished at all.
--
-- The rule was right when it was written (9 Sep 2026, requirement 4): an
-- organization's links were THE EVIDENCE behind its tick — a DanceOS admin read
-- them to decide whether the business was real, so a business with none could
-- not be verified and the database refused to let it get into that state.
--
-- That evidence moved to the STUDIO this afternoon
-- (20260914090000_verification_belongs_to_the_studio): each studio shows its own
-- links and its own 5-10 photos, and `request_studio_verification` is where
-- "at least one public link" is now enforced — on the studio, where it means
-- something. The organization itself is verified by its GST number, which is a
-- different kind of evidence entirely and asks nothing of Instagram.
--
-- So the rule outlived its reason, and an obsolete rule that blocks sign-up is
-- worse than no rule. Everything else about links is unchanged: at most twelve,
-- one per platform, each a real http(s) address (the `socials_are_web_links`
-- CHECK from 20260913100000 still refuses a `javascript:` URL by every door).
--
-- ─── 2. THE GST NUMBER IS A PLACEHOLDER, AND IT SHOULD LOOK LIKE ONE ────────
--
-- The user: *"right now just make a dummy — if in format 3 alphabets, 5 numbers
-- then the Verify button will answer verified, else not."*
--
-- I built the real 15-character GSTIN anatomy instead, which is not what was
-- asked for and makes the field impossible to fill in while testing. The
-- accepted format is now **ABC12345** — three letters, five digits — and
-- `verify_gstin` is still the single door and still the exact place the
-- government API will land.
--
-- `gstin_shape` accepts EITHER shape, because it is the CHECK constraint behind
-- the column and rows already carry real-looking numbers (the test-phone owner,
-- the demo organizations). A constraint that suddenly calls stored data invalid
-- would break the next UPDATE of those rows for no good reason. The CHECK asks
-- "could this be a GST number?"; `verify_gstin` asks "is this the format we
-- accept today?", and only the second one changes when the API arrives.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. the profile door, without the obsolete link rule
-- ─────────────────────────────────────────────────────────────────────────────
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

  -- links: an array of {platform, url}; a url is http(s) and a platform a short
  -- word. ⚠ NOT MANDATORY FOR AN ORGANIZATION ANY MORE — see the header.
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
  'The one door that edits a profile. A city is required and a user keeps at least one dance style; an organization carries no styles and — since 11 Sep 2026 — needs no links of its own, because what DanceOS checks is each STUDIO''s links and photos, and the organization''s own paperwork is its GST number.';

-- The matching client-side guard — the Profile tab's links sheet, which
-- disabled Remove on an organization's last link and explained why — goes in
-- the same commit (features/profiles/components/MyProfilePage.tsx). A screen
-- that forbids what the database allows is a screen that lies.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. the shape a GST number is allowed to have
-- ─────────────────────────────────────────────────────────────────────────────

/** Could this be a GST number at all? The CHECK behind `profiles.gstin`.
 *  Two shapes are allowed, deliberately:
 *    • ABC12345 — the placeholder in use today (3 letters, 5 digits);
 *    • 27ABCDE1234F1Z5 — a real 15-character GSTIN, so the numbers already
 *      stored stay valid and so nothing has to change here when the government
 *      API arrives.
 *  WHICH ONE IS ACCEPTED TODAY is `verify_gstin`'s business, not this one's. */
create or replace function public.gstin_shape(p_gstin text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_gstin is not null
     and (
       -- the placeholder
       p_gstin ~ '^[A-Z]{3}[0-9]{5}$'
       -- or the real thing: 2-digit state code, PAN, entity code, Z, check char
       or (
         p_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
         and (
           substring(p_gstin from 1 for 2) in ('97', '99')
           or (substring(p_gstin from 1 for 2))::integer between 1 and 38
         )
       )
     );
$$;
comment on function public.gstin_shape(text) is
  'Could this be a GST number? Accepts the placeholder ABC12345 (3 letters, 5 digits) in use since 11 Sep 2026, and a real 15-character GSTIN, so stored numbers stay valid. Which shape is ACCEPTED is verify_gstin''s decision.';

/** THE ONE DOOR. Today it accepts the placeholder the user asked for; when the
 *  government API is wired it goes between the format check and the stamp, and
 *  no caller changes. */
create or replace function public.verify_gstin(p_gstin text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_clean text;
  v_when timestamptz := now();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select p.role into v_role from public.profiles p where p.id = v_user and p.deleted_at is null;
  if not found then raise exception 'finish onboarding first'; end if;
  if v_role <> 'org' then raise exception 'a GST number belongs to a business — only an organization enters one'; end if;

  /* what somebody types is rarely what the register holds: spaces, lower case,
     a pasted label. Everything that is not a letter or a digit goes. */
  v_clean := upper(regexp_replace(coalesce(p_gstin, ''), '[^0-9A-Za-z]', '', 'g'));

  if v_clean = '' then
    raise exception 'Enter the GST number.';
  end if;
  if v_clean !~ '^[A-Z]{3}[0-9]{5}$' then
    raise exception 'That is not a GST number — it is three letters then five digits, like ABC12345.';
  end if;
  if exists (select 1 from public.profiles p
              where p.gstin = v_clean and p.id <> v_user and p.deleted_at is null) then
    raise exception 'That GST number is already on another DanceOS account.';
  end if;

  perform set_config('danceos.gstin_ok', 'on', true);
  update public.profiles
     set gstin = v_clean, gstin_verified_at = v_when, updated_by = v_user
   where id = v_user;
  perform set_config('danceos.gstin_ok', 'off', true);

  return v_when;
end;
$$;
comment on function public.verify_gstin(text) is
  'The organization verifies its own GST number. Since 11 Sep 2026 the accepted format is the placeholder the user asked for — three letters then five digits (ABC12345) — checked here and nowhere else. The government API lands inside this function; the signature and every caller stay as they are.';
