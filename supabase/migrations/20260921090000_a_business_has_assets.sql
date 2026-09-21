-- A BUSINESS HAS ASSETS (21 Sep 2026)
--
-- The user: "Fix assets for both artist, studio and organization. Make sure to
-- just add name type of asset and price/ Old asset."
--
-- The Assets tile has opened the prototype's "nothing here yet" since 18 Sep
-- 2026 on an artist's grid and a studio's, and an ORGANIZATION never had the
-- tile at all. This is the desk behind all three, and it is the prototype's own
-- S_assets (16791) with nothing added:
--
--     ADD ASSET
--     [ Asset name                         ]
--     [ Equipment  v ]  [ ₹ (0 = old) ]
--     INVENTORY · ₹1,72,500 total
--
-- ⚠ "PRICE / OLD ASSET" IS THE PROTOTYPE'S OWN `₹ (0 = old)`, and it is why
-- there is no separate flag on this table: a value of 0 MEANS "we already had
-- it", and the row prints "₹0 (legacy)" exactly as the prototype does (16792,
-- "Mirrors — Studio A", "₹0 (legacy)"). A boolean beside the number would be a
-- second way to say the same thing, and the two could disagree.
--
-- ⚠ AND THE CATEGORY IS A CLOSED LIST, not free text — the prototype's fourteen
-- words (16800). A typed category is how one studio ends up with "Sound",
-- "sound" and "Sound & AV" and no total worth reading.
--
-- WHOSE. A business's — a studio's, an artist page's, or an organization's own
-- hosting row, which is the one row an organization owns. So one table and one
-- desk serve all three kinds, the way `memberships` does.
--
-- ⚠ Rule 9: RLS. Nothing here is public and nothing here is a person's: an
-- inventory and what it is worth is the OWNER's business, the way the Earnings
-- desk is, so the policy is `is_business_owner` and there is no anon grant at
-- all. A trainer cannot read what the studio's floor cost.
--
-- ⚠ AND THE AUDIT COLUMNS CARRY NO FOREIGN KEY INTO auth.users. That is the
-- 19 Sep lesson, learnt twice in one day: `20260919160000` (routines) and
-- `20260919170000` (memberships) both wrote `created_by ... references
-- auth.users (id)` with no `on delete` clause — NO ACTION, so deleting the
-- account is REFUSED — and `20260919180000_an_account_can_still_be_deleted` had
-- to drop ten such constraints. Every other table in this database keeps plain
-- uuid audit columns. This one does too.

begin;

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  category text not null,
  -- ⚠ 0 is not "missing", it is "we already had this one" — see the header
  value_inr integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz,
  constraint assets_name_shape check (char_length(btrim(name)) between 1 and 80),
  constraint assets_value_sane check (value_inr >= 0 and value_inr <= 1000000000),
  constraint assets_category_known check (category in (
    'Equipment', 'Sound & AV', 'Lighting', 'Infrastructure', 'Flooring',
    'Mirrors', 'Costume', 'Props', 'Furniture', 'IT & devices',
    'Instruments', 'Safety', 'Merchandise', 'Vehicle'
  ))
);

comment on table public.assets is
  'What a business owns and what it is worth (prototype S_assets 16791). A studio''s, an artist page''s, or an organization''s hosting row. value_inr = 0 means an asset it already had — "legacy" on the screen — which is why there is no separate flag.';
comment on column public.assets.value_inr is
  'Whole rupees. 0 MEANS "old asset we already had", printed as "₹0 (legacy)". Never null.';

create index if not exists assets_business_idx on public.assets (business_id, created_at desc) where deleted_at is null;

drop trigger if exists assets_updated_at on public.assets;
create trigger assets_updated_at before update on public.assets
  for each row execute function public.set_updated_at();

alter table public.assets enable row level security;

-- a policy is not a grant (19 Sep). Reads only, and never to anon.
revoke all on public.assets from public, anon, authenticated;
grant select on public.assets to authenticated;

drop policy if exists "an owner reads their business's assets" on public.assets;
create policy "an owner reads their business's assets" on public.assets
  for select to authenticated
  using (public.is_business_owner(business_id));

-- no insert/update/delete policy anywhere: the two functions below are the doors.

-- ── SAVE ────────────────────────────────────────────────────────────────────
-- one door for both "add" and "edit", because the prototype's row edits the
-- same three fields the form collects and a second function would be the same
-- validation written twice.
create or replace function public.save_asset(
  p_business_id uuid,
  p_name text,
  p_category text,
  p_value_inr integer,
  p_asset_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'only the owner of this business adds its assets';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'name the asset — up to 80 characters';
  end if;
  if p_value_inr is null or p_value_inr < 0 then
    raise exception 'put a value on it — ₹0 means you already had it';
  end if;

  if p_asset_id is null then
    insert into public.assets (business_id, name, category, value_inr)
    values (p_business_id, v_name, p_category, p_value_inr)
    returning id into v_id;
  else
    update public.assets
       set name = v_name,
           category = p_category,
           value_inr = p_value_inr,
           updated_by = auth.uid()
     where id = p_asset_id
       and business_id = p_business_id
       and deleted_at is null
    returning id into v_id;
    if v_id is null then
      raise exception 'that asset is not on this business';
    end if;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.save_asset(uuid, text, text, integer, uuid) from public, anon;
grant execute on function public.save_asset(uuid, text, text, integer, uuid) to authenticated, service_role;

-- ── REMOVE ──────────────────────────────────────────────────────────────────
create or replace function public.remove_asset(p_asset_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business uuid;
begin
  select business_id into v_business from public.assets where id = p_asset_id and deleted_at is null;
  if v_business is null then
    raise exception 'that asset is not on record';
  end if;
  if not public.is_business_owner(v_business) then
    raise exception 'only the owner of this business removes its assets';
  end if;
  update public.assets set deleted_at = now(), updated_by = auth.uid() where id = p_asset_id;
end;
$$;

revoke execute on function public.remove_asset(uuid) from public, anon;
grant execute on function public.remove_asset(uuid) to authenticated, service_role;

commit;
