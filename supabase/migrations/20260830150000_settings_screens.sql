-- ─────────────────────────────────────────────────────────────────────────────
-- The settings sheet's rows are SCREENS in the prototype (S_subscr 16935,
-- S_payments 16531, S_invoices 16691, S_refunds 16621, the Enquiry-types sheet
-- 9000), and the public studio / artist page carries a verified tick, "Since
-- 2016", About, a phone (Call) and social chips (10565-11140). Screenshots of
-- the prototype's own build (29 Aug 2026) settled what the app had only read:
-- these are not decorations to drop, they are the product. This migration is
-- every field they stand on, honestly:
--
--   • artist_plans — DanceOS Pro · Artist (₹799/mo · ₹7,999/yr, 16960). The
--     plan is a RECORD with a period; the charge is a Cashfree order when the
--     account is live, so until then the pilot grants the period at ₹0 and the
--     screen says so. Artist tools switch on with an active plan (8850-8870).
--   • tenants gain what the prototype's business pages carry: about, founded
--     year, phone, socials, verified_at, the enquiry types they accept
--     (null = all), and the four "accepted from students" switches (16612).
--   • profiles gain verified_at and phone.
--
-- verified_at is set by DanceOS (service role) after KYC — never by the row's
-- owner; a tick you can give yourself is not a tick.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column verified_at timestamptz,
  add column phone text check (phone is null or phone ~ '^\+?[0-9][0-9 ]{7,17}$');

alter table public.tenants
  add column verified_at timestamptz,
  add column phone text check (phone is null or phone ~ '^\+?[0-9][0-9 ]{7,17}$'),
  add column about text check (about is null or char_length(about) <= 220),
  add column founded_year smallint check (founded_year is null or (founded_year >= 1950 and founded_year <= 2100)),
  add column socials jsonb not null default '[]'::jsonb
    check (jsonb_typeof(socials) = 'array' and jsonb_array_length(socials) <= 12),
  add column enquiry_types text[],
  add column accepts_upi boolean not null default true,
  add column accepts_cards boolean not null default true,
  add column accepts_cash boolean not null default true,
  add column accepts_bank boolean not null default false;

comment on column public.tenants.enquiry_types is
  'The enquiry types this business accepts (ENQ_TYPES keys). NULL means every type the kind allows — the prototype''s default.';
comment on column public.tenants.verified_at is
  'Set by DanceOS after KYC (service role only). Null draws no tick.';

-- ── the artist plan ───────────────────────────────────────────────────────────
create table public.artist_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan text not null check (plan in ('monthly', 'yearly')),
  started_on date not null default (now() at time zone 'Asia/Kolkata')::date,
  until date not null,
  /** ₹ charged for this period — 0 while the pilot grants it; a Cashfree order when live */
  amount_inr integer not null default 0 check (amount_inr >= 0),
  provider_order_id text,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);
create index artist_plans_user_idx on public.artist_plans (user_id) where deleted_at is null;
alter table public.artist_plans enable row level security;
create policy "people read their own plans" on public.artist_plans
  for select using (user_id = auth.uid());
-- no insert / update / delete policies: the three doors below are the only writes

/** the active plan, if any: the latest period that has not ended */
create or replace function public.my_artist_plan()
returns table (plan text, started_on date, until date, amount_inr integer, active boolean)
language sql
security invoker
set search_path = ''
as $$
  select p.plan, p.started_on, p.until, p.amount_inr,
         (p.until >= (now() at time zone 'Asia/Kolkata')::date and p.ended_at is null) as active
    from public.artist_plans p
   where p.user_id = auth.uid() and p.deleted_at is null
   order by p.until desc
   limit 1;
$$;
grant execute on function public.my_artist_plan() to authenticated;

/** start or extend the plan: +1 month or +1 year from today or from the current
 *  period's end, whichever is later (addPeriod, 19104-19107). ₹0 during the
 *  pilot — the amount is what the pilot charged, not the list price. */
create or replace function public.activate_artist_plan(p_plan text)
returns table (plan text, until date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_base date;
  v_until date;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_plan not in ('monthly', 'yearly') then raise exception 'a plan is monthly or yearly'; end if;
  if not exists (select 1 from public.profiles where id = v_user and deleted_at is null) then
    raise exception 'finish onboarding first';
  end if;
  select greatest(max(p.until), v_today) into v_base
    from public.artist_plans p where p.user_id = v_user and p.deleted_at is null and p.ended_at is null;
  v_base := coalesce(v_base, v_today);
  v_until := case when p_plan = 'yearly' then v_base + interval '1 year' else v_base + interval '1 month' end;
  insert into public.artist_plans (user_id, plan, started_on, until, amount_inr, created_by, updated_by)
    values (v_user, p_plan, v_today, v_until, 0, v_user, v_user);
  -- the toolset is on the same profile (8850): a plan makes you an artist
  update public.profiles set role = 'trainer', updated_by = v_user where id = v_user and role = 'dancer';
  return query select p_plan, v_until;
end;
$$;
revoke execute on function public.activate_artist_plan(text) from public, anon;
grant execute on function public.activate_artist_plan(text) to authenticated;

/** "End subscription now — tools lock, your profile stays" (16972) */
create or replace function public.end_artist_plan()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update public.artist_plans set ended_at = now(), updated_by = v_user
   where user_id = v_user and deleted_at is null and ended_at is null;
  update public.profiles set role = 'dancer', updated_by = v_user where id = v_user and role = 'trainer';
end;
$$;
revoke execute on function public.end_artist_plan() from public, anon;
grant execute on function public.end_artist_plan() to authenticated;

-- ── the business's own words and switches: owner only ───────────────────────
create or replace function public.update_tenant_profile(
  p_tenant_id uuid,
  p_about text,
  p_founded_year smallint,
  p_phone text,
  p_socials jsonb,
  p_enquiry_types text[],
  p_accepts_upi boolean,
  p_accepts_cards boolean,
  p_accepts_cash boolean,
  p_accepts_bank boolean
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
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from public.tenant_members m
     where m.tenant_id = p_tenant_id and m.user_id = v_user and m.member_role = 'owner' and m.deleted_at is null
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
  update public.tenants
     set about = nullif(btrim(p_about), ''),
         founded_year = p_founded_year,
         phone = nullif(btrim(p_phone), ''),
         socials = p_socials,
         enquiry_types = p_enquiry_types,
         accepts_upi = coalesce(p_accepts_upi, accepts_upi),
         accepts_cards = coalesce(p_accepts_cards, accepts_cards),
         accepts_cash = coalesce(p_accepts_cash, accepts_cash),
         accepts_bank = coalesce(p_accepts_bank, accepts_bank),
         updated_by = v_user
   where id = p_tenant_id and deleted_at is null;
end;
$$;
revoke execute on function public.update_tenant_profile(uuid, text, smallint, text, jsonb, text[], boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.update_tenant_profile(uuid, text, smallint, text, jsonb, text[], boolean, boolean, boolean, boolean) to authenticated;
