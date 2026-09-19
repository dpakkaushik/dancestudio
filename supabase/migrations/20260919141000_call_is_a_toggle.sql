-- ============================================================================
-- 19 Sep 2026 — CALL IS A TOGGLE ON AN ARTIST'S PAGE AND ON A CREW'S.
--
-- The user, on the profile-page list: "Call is off for artist page by default
-- but should have option to make it available on profile and same for crew."
--
-- A PERSON: `profiles.phone` has held the number they chose to type since
-- parity slice 7; since 19 Sep their page has not dialled it (the list gave
-- Call to studios and organizations). `phone_public` is the switch — OFF by
-- default — that puts Call back on an ARTIST's page; a plain user's page still
-- carries no buttons. `update_my_profile` gains the switch LAST with a default,
-- so every existing call resolves exactly as before (dropped and re-created —
-- the overload lesson — with its ACL restated). For a STRANGER, `public_artist`
-- hands the number only while the switch is on; a signed-in reader could
-- already read `profiles.phone` through the API (Step 1's policy), which this
-- does not change and the list says so.
--
-- A CREW never held a number. It gets one in a table of its own,
-- `crew_contacts`, rather than a column on `crews`, ON PURPOSE: `crews` is
-- readable whole by anybody (Discover lists crews), so a number there would be
-- a stranger's to read through the API whatever the switch said. On its own
-- table the POLICY is the switch — anybody reads the row while `phone_public`
-- is on, the leader always — and a hidden number is hidden from every door.
-- `update_crew` gains the number and the switch LAST with defaults (dropped
-- and re-created, ACL restated); null leaves each as it is, '' clears the number.
--
-- ⚠ Rule 9: what widens is a number its owner switched on. Nothing else.
-- ============================================================================

-- ── a person's switch ────────────────────────────────────────────────────────
alter table public.profiles add column if not exists phone_public boolean not null default false;
comment on column public.profiles.phone_public is
  'Whether the Call button is drawn on this person''s public page (19 Sep 2026). Off by default; meaningful for an artist — a plain user''s page carries no buttons; an organization''s Call is always drawn.';

drop function public.update_my_profile(text, text, smallint, text, jsonb, text[], text, text);

create function public.update_my_profile(
  p_full_name text,
  p_city text,
  p_age smallint,
  p_about text,
  p_socials jsonb,
  p_styles text[],
  p_phone text default null,
  p_contact_email text default null,
  p_phone_public boolean default null
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
         age = p_age,
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
revoke execute on function public.update_my_profile(text, text, smallint, text, jsonb, text[], text, text, boolean) from public, anon;
grant execute on function public.update_my_profile(text, text, smallint, text, jsonb, text[], text, text, boolean) to authenticated, service_role;
comment on function public.update_my_profile(text, text, smallint, text, jsonb, text[], text, text, boolean) is
  'The one door that edits a profile. A city is required and a user keeps at least one dance style; an organization carries no styles and needs no links. The CONTACT EMAIL (Mail) and the CALL SWITCH (19 Sep 2026) are last, optional, null = unchanged.';

-- a stranger reads an artist's number only while the switch is on (body change; same shape)
create or replace function public.public_artist(p_user_id uuid)
returns table(id uuid, full_name text, role text, city text, profile_photo_path text, about text, socials jsonb, styles text[], verified_at timestamptz, phone text, contact_email text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.role, p.city, p.profile_photo_path, p.about, p.socials, p.styles, p.verified_at,
         case when p.phone_public then p.phone end as phone,
         p.contact_email
  from public.profiles p
  where p.id = p_user_id and p.deleted_at is null and p.role = 'user' and p.suspended_at is null
    and public.artist_plan_active(p.id);
$$;
comment on function public.public_artist(uuid) is
  'An artist''s public face for a stranger (19 Sep 2026): the public columns of a live, unsuspended person with a live Artist plan — no age, no account number; the contact email they chose to publish, and the number only while their Call switch is on. Empty for anybody else.';

-- ── a crew's number, on a table whose policy IS the switch ───────────────────
create table if not exists public.crew_contacts (
  crew_id uuid primary key references public.crews (id) on delete cascade,
  phone text,
  phone_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz,
  constraint crew_contacts_phone_shape check (phone is null or phone ~ '^\+?[0-9][0-9 ]{7,17}$')
);
comment on table public.crew_contacts is
  'A crew''s phone number and whether its page dials it (19 Sep 2026). Its own table, not a column on crews, so a hidden number is hidden from every door: the SELECT policy is the switch.';

drop trigger if exists crew_contacts_set_updated_at on public.crew_contacts;
create trigger crew_contacts_set_updated_at
  before update on public.crew_contacts
  for each row execute function public.set_updated_at();

alter table public.crew_contacts enable row level security;
revoke all on public.crew_contacts from public, anon, authenticated;
grant select on public.crew_contacts to anon, authenticated;

drop policy if exists "anyone reads a crew's published number" on public.crew_contacts;
create policy "anyone reads a crew's published number" on public.crew_contacts
  for select to anon, authenticated
  using (deleted_at is null and phone_public and phone is not null);

-- `is_crew_leader` is executable by authenticated only, so this policy is `to authenticated` on its own
drop policy if exists "the leader reads the crew's number" on public.crew_contacts;
create policy "the leader reads the crew's number" on public.crew_contacts
  for select to authenticated
  using (deleted_at is null and public.is_crew_leader(crew_id));

drop function public.update_crew(uuid, text, text, text, text);

create function public.update_crew(p_crew_id uuid, p_name text, p_city text, p_style text, p_contact_email text default null, p_phone text default null, p_phone_public boolean default null)
returns public.crews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.crews;
  v_email text;
  v_phone text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_crew_leader(p_crew_id) then
    raise exception 'only the crew''s leader can change it';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'name your crew first';
  end if;
  if p_contact_email is not null then
    v_email := btrim(p_contact_email);
    if v_email <> '' and (char_length(v_email) > 254 or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
      raise exception 'that is not an email address';
    end if;
  end if;
  -- the number (19 Sep 2026): given → checked; empty → cleared; not given → unchanged
  if p_phone is not null then
    v_phone := btrim(p_phone);
    if v_phone <> '' and v_phone !~ '^\+?[0-9][0-9 ]{7,17}$' then
      raise exception 'a phone number is 8 to 18 digits';
    end if;
  end if;
  update public.crews set
    name = trim(p_name),
    city = coalesce(nullif(trim(p_city), ''), city),
    style = coalesce(nullif(trim(p_style), ''), style),
    contact_email = case when p_contact_email is null then contact_email else nullif(v_email, '') end,
    updated_by = auth.uid()
  where id = p_crew_id
  returning * into v_row;
  -- the contact row, made on first mention and kept in step after
  if p_phone is not null or p_phone_public is not null then
    insert into public.crew_contacts as cc (crew_id, phone, phone_public, created_by, updated_by)
    values (p_crew_id, nullif(v_phone, ''), coalesce(p_phone_public, false), auth.uid(), auth.uid())
    on conflict (crew_id) do update
      set phone = case when p_phone is null then cc.phone else nullif(v_phone, '') end,
          phone_public = coalesce(p_phone_public, cc.phone_public),
          deleted_at = null,
          updated_by = auth.uid();
  end if;
  return v_row;
end;
$$;
revoke execute on function public.update_crew(uuid, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.update_crew(uuid, text, text, text, text, text, boolean) to authenticated, service_role;
comment on function public.update_crew(uuid, text, text, text, text, text, boolean) is
  'The leader edits the crew''s record — name, city, style, the CONTACT EMAIL (Mail), and since 19 Sep 2026 the NUMBER and the CALL SWITCH (last, optional, null = unchanged, empty number = cleared).';
