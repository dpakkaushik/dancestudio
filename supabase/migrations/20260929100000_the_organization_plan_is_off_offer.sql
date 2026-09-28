-- THE ORGANIZATION PLAN COMES OFF THE PRICE LIST (29 Sep 2026)
--
-- `20260929090000` removed organizations from the product and the sweep that
-- followed soft-deleted every organization there was. `plan_catalog`'s
-- `org_monthly` row (₹5,000 a month) was left ACTIVE, and the Plans desk was
-- taught to label it "nobody — organizations are retired … it cannot be
-- bought". That label is true and the column disagreed with it.
--
-- This is one flag, and it is the smaller half of the truth:
--   `active = false` is what the price list means by "not on offer".
--
-- ⚠ THE ROW ITSELF STAYS, and that is deliberate. Six subscriptions on
--   production name `org_monthly` in their `plan_key`, and a price list a
--   historical row points at is not something to delete: a subscription that
--   cannot name what it was for is a subscription nobody can audit. The same
--   reasoning keeps the four event tables as tombstones.
--
-- ⚠ NOTHING ELSE MOVES. No function, no policy, no grant, no other row. The
--   two live plans (`artist_monthly` ₹700, `studio_monthly` ₹1,200) are
--   untouched, and `subscribe` keeps refusing an inactive plan exactly as it
--   always has — which is now the second thing standing between an
--   organization subscription and a database that has no organizations.

begin;

do $guard$
declare
  v_live integer;
begin
  -- If an organization subscription were somehow live, taking the plan off
  -- offer would be the wrong tool and this should stop rather than proceed.
  select count(*) into v_live
  from public.subscriptions
  where plan_key = 'org_monthly' and status = 'active' and deleted_at is null;
  if v_live <> 0 then
    raise exception
      'org_monthly still has % live subscription(s) — do not take it off offer while somebody is paying for it', v_live;
  end if;
end;
$guard$;

update public.plans
   set active = false
 where key = 'org_monthly' and active;

comment on table public.plans is
  'The price list. ⚠ org_monthly is RETIRED (29 Sep 2026) — active = false, kept as a row because six historical subscriptions name it in plan_key and a ledger row must be able to say what it was for.';

commit;
