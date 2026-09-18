-- 19 Sep 2026: A CONTACT EMAIL — the Mail button on every profile but a user's.
--
-- The user: "Mail for all except users." No table held an address anybody could
-- be mailed at: the auth email is private and never shown. So a business, a
-- profile (an organization's, an artist's) and a crew gain ONE optional
-- `contact_email`, set by the owner from their own Edit sheet and printed on the
-- public page as a mailto. The shape is checked by the column itself (the
-- socials lesson of 11 Sep: a rule the database does not keep holds only at the
-- door you went in by), and by each door in words.
--
-- Three doors gain the argument LAST with a default, so every existing call
-- resolves exactly as before; each is dropped and re-created because a
-- parameter is added (the overload lesson), with its ACL restated. The two
-- public reads that hand a stranger a page — `public_organization`,
-- `public_artist` — gain the column (and `public_organization` the phone, for
-- Call), which is a RETURNS TABLE change, so they are dropped and re-created too.
-- Null means "leave it as it is"; an empty string clears it. No row changes.

-- ── the column, on three tables, with the shape it must have ────────────────
alter table public.businesses add column if not exists contact_email text;
alter table public.businesses drop constraint if exists businesses_contact_email_shape;
alter table public.businesses add constraint businesses_contact_email_shape
  check (contact_email is null or (char_length(contact_email) <= 254 and contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'));

alter table public.profiles add column if not exists contact_email text;
alter table public.profiles drop constraint if exists profiles_contact_email_shape;
alter table public.profiles add constraint profiles_contact_email_shape
  check (contact_email is null or (char_length(contact_email) <= 254 and contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'));

alter table public.crews add column if not exists contact_email text;
alter table public.crews drop constraint if exists crews_contact_email_shape;
alter table public.crews add constraint crews_contact_email_shape
  check (contact_email is null or (char_length(contact_email) <= 254 and contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'));

comment on column public.businesses.contact_email is 'The address the Mail button on the public page opens (19 Sep 2026). Optional; set by the owner.';
comment on column public.profiles.contact_email is 'The address the Mail button on an organization''s or an artist''s page opens (19 Sep 2026). Optional; a plain user''s is never shown.';
comment on column public.crews.contact_email is 'The address the Mail button on the crew''s page opens (19 Sep 2026). Optional; set by the leader.';

-- ── the business door ────────────────────────────────────────────────────────
drop function public.update_business_profile(uuid, text, smallint, text, jsonb, text[], boolean, boolean, boolean, boolean, text);

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
  p_contact_email text default null
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
         accepts_bank = coalesce(p_accepts_bank, accepts_bank),
         contact_email = case when p_contact_email is null then contact_email else nullif(v_email, '') end,
         updated_by = v_user
   where id = p_business_id and deleted_at is null;
end;
$$;
revoke execute on function public.update_business_profile(uuid, text, smallint, text, jsonb, text[], boolean, boolean, boolean, boolean, text, text) from public, anon;
grant execute on function public.update_business_profile(uuid, text, smallint, text, jsonb, text[], boolean, boolean, boolean, boolean, text, text) to authenticated, service_role;
comment on function public.update_business_profile(uuid, text, smallint, text, jsonb, text[], boolean, boolean, boolean, boolean, text, text) is
  'The owner''s one door for what a business says about itself — About, Since, phone, links, enquiry types, the payment switches, its NAME (18 Sep 2026) and its CONTACT EMAIL (19 Sep 2026; both last, optional, null = unchanged).';

-- ── the person's door ────────────────────────────────────────────────────────
drop function public.update_my_profile(text, text, smallint, text, jsonb, text[], text);

create function public.update_my_profile(
  p_full_name text,
  p_city text,
  p_age smallint,
  p_about text,
  p_socials jsonb,
  p_styles text[],
  p_phone text default null,
  p_contact_email text default null
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
         updated_by = v_user
   where id = v_user and deleted_at is null;
end;
$$;
revoke execute on function public.update_my_profile(text, text, smallint, text, jsonb, text[], text, text) from public, anon;
grant execute on function public.update_my_profile(text, text, smallint, text, jsonb, text[], text, text) to authenticated, service_role;
comment on function public.update_my_profile(text, text, smallint, text, jsonb, text[], text, text) is
  'The one door that edits a profile. A city is required and a user keeps at least one dance style; an organization carries no styles and needs no links. Since 19 Sep 2026 also the CONTACT EMAIL the Mail button opens (last, optional, null = unchanged, empty = cleared).';

-- ── the crew's door ──────────────────────────────────────────────────────────
drop function public.update_crew(uuid, text, text, text);

create function public.update_crew(p_crew_id uuid, p_name text, p_city text, p_style text, p_contact_email text default null)
returns public.crews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.crews;
  v_email text;
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
  update public.crews set
    name = trim(p_name),
    city = coalesce(nullif(trim(p_city), ''), city),
    style = coalesce(nullif(trim(p_style), ''), style),
    contact_email = case when p_contact_email is null then contact_email else nullif(v_email, '') end,
    updated_by = auth.uid()
  where id = p_crew_id
  returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.update_crew(uuid, text, text, text, text) from public, anon;
grant execute on function public.update_crew(uuid, text, text, text, text) to authenticated, service_role;
comment on function public.update_crew(uuid, text, text, text, text) is
  'The leader edits the crew''s record — name, city, style, and since 19 Sep 2026 the CONTACT EMAIL the Mail button opens (last, optional, null = unchanged, empty = cleared).';

-- ── the two public reads carry the new column (and the organization its phone) ─
drop function public.public_organization(uuid);
create function public.public_organization(p_org_id uuid)
returns table(id uuid, name text, city text, photo_path text, about text, socials jsonb, verified boolean, since timestamptz, host_business_id uuid, phone text, contact_email text)
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
         p.contact_email
  from public.profiles p
  where p.id = p_org_id and public.org_is_public(p_org_id);
$$;
revoke execute on function public.public_organization(uuid) from public;
grant execute on function public.public_organization(uuid) to anon, authenticated, service_role;
comment on function public.public_organization(uuid) is
  'An organization''s public page (18 Sep 2026, amending R9): name, city, logo, About, links, verified, since, its hosting row — and since 19 Sep 2026 the phone (Call) and contact email (Mail) it chose to publish — for a public organization only; empty otherwise.';

drop function public.public_artist(uuid);
create function public.public_artist(p_user_id uuid)
returns table(id uuid, full_name text, role text, city text, profile_photo_path text, about text, socials jsonb, styles text[], verified_at timestamptz, phone text, contact_email text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.role, p.city, p.profile_photo_path, p.about, p.socials, p.styles, p.verified_at, p.phone, p.contact_email
  from public.profiles p
  where p.id = p_user_id and p.deleted_at is null and p.role = 'user' and p.suspended_at is null
    and public.artist_plan_active(p.id);
$$;
revoke execute on function public.public_artist(uuid) from public;
grant execute on function public.public_artist(uuid) to anon, authenticated, service_role;
comment on function public.public_artist(uuid) is
  'An artist''s public face for a stranger (19 Sep 2026): the public columns of a live, unsuspended person with a live Artist plan — no age, no account number; the contact email they chose to publish. Empty for anybody else.';
