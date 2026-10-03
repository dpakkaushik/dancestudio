-- AN ASSET HAS A QUANTITY, AND THE TYPE LIST IS SHORTER (4 Oct 2026).
--
-- The user: "asset form- quantity in form with 1 minimum while adding. should
-- also be visible on card … shorter and better list for type of asset- speaker,
-- props should be there and Other assets also in option".
--
-- THE WHOLE OF IT:
--   1. `assets.quantity integer not null default 1`, CHECK 1 … 10000. Every
--      existing row reads 1. ⚠ `value_inr` keeps meaning what it always meant —
--      what the business paid for the asset as recorded, i.e. for the WHOLE lot —
--      so Earnings' "Assets bought" line and the desk's total are unchanged and
--      no money figure moves. Quantity is a count, not a multiplier.
--   2. The fourteen prototype categories become nine: Speaker · Mirror ·
--      Flooring · Lighting · Props · Costume · Furniture · Electronics · Other.
--      Existing rows are MAPPED (all of them, deleted ones too, so the new CHECK
--      holds for every row): Sound & AV → Speaker, Mirrors → Mirror,
--      IT & devices → Electronics, and Equipment, Infrastructure, Instruments,
--      Safety, Merchandise, Vehicle → Other. Lighting, Flooring, Costume, Props
--      and Furniture keep their word. Counted first: 4 rows on production
--      (Equipment ×2, Props, Sound & AV).
--   3. `save_asset` is DROPPED and re-created with `p_quantity integer default 1`
--      LAST, so a call without it behaves as before; its body is the catalog's
--      own with the quantity added (checked 1 … 10000) and written on insert and
--      update. Grants restated exactly: authenticated + service_role, never anon.
--
-- No policy, no other function, no other table. No `begin;`/`commit;` (Rule 18).

alter table public.assets add column quantity integer not null default 1;
alter table public.assets add constraint assets_quantity_sane check (quantity between 1 and 10000);
comment on column public.assets.quantity is
  'How many of this asset the business has (4 Oct 2026). A count, not a multiplier: value_inr is what was paid for the whole lot.';

alter table public.assets drop constraint assets_category_known;

-- ⚠ `set_updated_at` keeps the previous author when auth.uid() is null (24 Aug
-- 2026), so a migration's update leaves updated_by as it was
update public.assets
   set category = case category
                    when 'Sound & AV' then 'Speaker'
                    when 'Mirrors' then 'Mirror'
                    when 'IT & devices' then 'Electronics'
                    when 'Lighting' then 'Lighting'
                    when 'Flooring' then 'Flooring'
                    when 'Costume' then 'Costume'
                    when 'Props' then 'Props'
                    when 'Furniture' then 'Furniture'
                    else 'Other'
                  end
 where category not in ('Speaker', 'Mirror', 'Flooring', 'Lighting', 'Props', 'Costume', 'Furniture', 'Electronics', 'Other');

alter table public.assets add constraint assets_category_known
  check (category in ('Speaker', 'Mirror', 'Flooring', 'Lighting', 'Props', 'Costume', 'Furniture', 'Electronics', 'Other'));

drop function public.save_asset(uuid, text, text, integer, uuid);

create function public.save_asset(
  p_business_id uuid,
  p_name text,
  p_category text,
  p_value_inr integer,
  p_asset_id uuid default null,
  p_quantity integer default 1
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_qty integer := coalesce(p_quantity, 1);
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
  if v_qty < 1 or v_qty > 10000 then
    raise exception 'a quantity is at least 1';
  end if;

  if p_asset_id is null then
    insert into public.assets (business_id, name, category, value_inr, quantity)
    values (p_business_id, v_name, p_category, p_value_inr, v_qty)
    returning id into v_id;
  else
    update public.assets
       set name = v_name,
           category = p_category,
           value_inr = p_value_inr,
           quantity = v_qty,
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
$function$;

revoke all on function public.save_asset(uuid, text, text, integer, uuid, integer) from public, anon, authenticated;
grant execute on function public.save_asset(uuid, text, text, integer, uuid, integer) to authenticated, service_role;
