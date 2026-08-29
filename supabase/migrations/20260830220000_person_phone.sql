-- ─────────────────────────────────────────────────────────────────────────────
-- A PERSON'S NUMBER GOES THROUGH THE SAME DOOR AS EVERYTHING ELSE THEY SAY
-- (parity audit N8 / P9 — the prototype's Call on a person, S_profiletab 10879)
--
-- `profiles.phone` has existed since the settings slice (20260830150000), with
-- the same check the business phone carries. What it never had was a way in:
-- the Edit profile sheet did not offer it, so the column could only ever be
-- null. The tick's mistake in reverse — there, a badge with nothing behind it;
-- here, a fact with no way to state it.
--
-- The fix is NOT a second write. `update_my_profile` is the one door for what a
-- person says about themselves (20260830090000), and a number is one of those
-- things — so the door gains a parameter rather than the app gaining a bypass.
-- The old six-argument signature is DROPPED, not left beside the new one: two
-- overloads of the same name is how PostgREST comes to answer "could not find
-- the function without parameters", and this file has been bitten by that.
--
-- No new column, no new policy. profiles already lets a signed-in person update
-- their own row (Step 1); the function re-scopes to auth.uid() regardless.
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.update_my_profile(text, text, smallint, text, jsonb, text[]);

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
  if p_full_name is null or char_length(btrim(p_full_name)) < 1 or char_length(p_full_name) > 120 then
    raise exception 'a name is 1 to 120 characters';
  end if;
  if p_city is not null and char_length(p_city) > 120 then
    raise exception 'that city name is too long';
  end if;
  if p_age is not null and (p_age < 13 or p_age > 99) then
    raise exception 'an age is between 13 and 99';
  end if;
  if p_about is not null and char_length(p_about) > 220 then
    raise exception 'about is at most 220 characters';
  end if;

  -- the number, said the way the business phone is said (20260830150000:168) —
  -- the same sentence, because a person typing it is making the same mistake
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

  update public.profiles
     set full_name = btrim(p_full_name),
         city = nullif(btrim(p_city), ''),
         age = p_age,
         about = nullif(btrim(p_about), ''),
         socials = p_socials,
         styles = v_styles,
         phone = nullif(btrim(p_phone), ''),
         updated_by = v_user
   where id = v_user and deleted_at is null;
  if not found then
    raise exception 'finish onboarding first';
  end if;
end;
$$;

comment on column public.profiles.phone is
  'The number the person chooses to publish, for Call on their page (S_profiletab 10879). Theirs to set and theirs to clear — an empty box saves null, so taking it down is one edit, not a support request.';

revoke execute on function public.update_my_profile(text, text, smallint, text, jsonb, text[], text) from public, anon;
grant execute on function public.update_my_profile(text, text, smallint, text, jsonb, text[], text) to authenticated;
