-- 18 Sep 2026: A BUSINESS CAN BE RENAMED FROM ITS OWN HOME.
--
-- The user: "give option to rename." `update_business_profile` is the one
-- owner-only door for what a business says about itself (About, Since, the
-- phone, the links, the enquiry types, the switches) and it took no name, so a
-- studio's name was fixed the moment the New-studio sheet closed. It takes
-- `p_name` now — LAST, with a default, so the app's named-argument call without
-- it resolves exactly as before. Dropped and re-created rather than overloaded
-- (two functions of one name is how PostgREST stops finding either — the Step 11
-- lesson). A given name is trimmed, must be 1–80 characters, and is the only
-- thing that changes here; a null leaves the name alone.
--
-- Nothing else moves: a business has no slug (its URL is its id), so a rename
-- breaks no link (Rule 14). ACL restated to exactly today's: authenticated +
-- service_role, never anon.

drop function public.update_business_profile(uuid, text, smallint, text, jsonb, text[], boolean, boolean, boolean, boolean);

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
  p_name text default null
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
         updated_by = v_user
   where id = p_business_id and deleted_at is null;
end;
$$;

revoke execute on function public.update_business_profile(uuid, text, smallint, text, jsonb, text[], boolean, boolean, boolean, boolean, text) from public, anon;
grant execute on function public.update_business_profile(uuid, text, smallint, text, jsonb, text[], boolean, boolean, boolean, boolean, text) to authenticated, service_role;

comment on function public.update_business_profile(uuid, text, smallint, text, jsonb, text[], boolean, boolean, boolean, boolean, text) is
  'The owner''s one door for what a business says about itself — About, Since, phone, links, enquiry types, the payment switches, and since 18 Sep 2026 its NAME (p_name, last, optional).';
