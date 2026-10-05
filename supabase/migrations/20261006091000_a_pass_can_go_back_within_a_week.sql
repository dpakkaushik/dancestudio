-- ⚠ Rule 9 (refunds are money). 6 Oct 2026, the user's decision 3: a membership
-- that has not been used can be handed back within 7 days of buying it.
--
-- Until today a paid pass could never be refunded at all — not by its holder,
-- not by the studio, and no screen offered it. The user chose: within a week of
-- purchase, and only while not one hour or class has been spent, the holder may
-- return it and the money goes back automatically through the same rail a class
-- refund uses.
--
-- THE WHOLE OF IT: one new function, `return_membership_pass(p_pass_id)`.
--   · the HOLDER's alone (`user_id = auth.uid()`), never the studio's;
--   · refused in words unless the pass is ACTIVE, NOTHING has been spent, it was
--     bought less than 7 days ago, and it has not run out;
--   · the pass becomes `cancelled` — so it counts nowhere as sold, offers itself
--     to no class, and the place goes back on sale (every count reads paid
--     passes only, `20260930130000`);
--   · a PAID pass files ONE refund row against its order, 'pending' (automatic,
--     like a class cancelled outside its window), with the holder as both payer
--     and actor, and moves the order to 'refund_pending'. The app then sends it
--     to Cashfree exactly as a class refund is sent, and `apply_refund_update`
--     (the webhook's applier) closes it. A FREE pass is simply handed back.
-- Returns what the app needs to send the refund. Executable by `authenticated`
-- only.
--
-- AND ONE EXISTING BODY LEARNS THE WORD: `notify_refund` (the trigger that tells
-- the payer and the studio about a refund) only knew classes and events, so a
-- returned membership would have read "A booking · cancelled outside the policy
-- window" and linked the studio to `/c/` with no slug. It names the membership,
-- says it was returned unused, and links to the Memberships desks — edited out
-- of the catalog by asserted anchor; `create or replace`, same signature, so no
-- grant moves. A class's and an event's wording are byte-identical.
--
-- No table, column or policy changes; nothing is backfilled. No
-- `begin;`/`commit;` (Rule 18).

create function public.return_membership_pass(p_pass_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_pass public.membership_passes;
  v_order public.orders;
  v_payment public.payments;
  v_refund public.refunds;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select * into v_pass from public.membership_passes p
    where p.id = p_pass_id and p.user_id = v_user and p.deleted_at is null
    for update;
  if not found then
    raise exception 'membership not found';
  end if;
  if v_pass.status <> 'active' then
    raise exception 'Only an active membership can be returned';
  end if;
  if v_pass.units_used > 0 then
    raise exception 'Part of this membership has been used — it can no longer be returned';
  end if;
  if v_pass.bought_at is null or v_pass.bought_at < now() - interval '7 days' then
    raise exception 'A membership can be returned within 7 days of buying it — this one is older';
  end if;
  if v_pass.expires_at is not null and v_pass.expires_at <= now() then
    raise exception 'This membership has run out';
  end if;

  update public.membership_passes
    set status = 'cancelled', updated_by = v_user
    where id = v_pass.id;

  -- the money side: only when this pass was actually paid for
  select * into v_order from public.orders o
    where o.membership_pass_id = v_pass.id and o.status = 'paid' and o.deleted_at is null
    order by o.created_at desc limit 1;
  if found then
    select * into v_payment from public.payments p
      where p.order_id = v_order.id and p.status = 'captured' and p.deleted_at is null
      order by p.created_at desc limit 1;
  end if;

  if v_payment.id is not null then
    insert into public.refunds (payment_id, order_id, business_id, user_id, provider, amount_inr,
                                reason, status, created_by, updated_by)
    values (v_payment.id, v_order.id, v_order.business_id, v_user, v_order.provider, v_payment.amount_inr,
            'Membership returned within 7 days, unused', 'pending', v_user, v_user)
    returning * into v_refund;
    update public.orders set status = 'refund_pending', updated_by = v_user where id = v_order.id;
    return jsonb_build_object('status', 'returned', 'refund', jsonb_build_object(
      'id', v_refund.id, 'status', v_refund.status, 'amount_inr', v_refund.amount_inr,
      'provider', v_order.provider,
      'provider_order_id', v_order.provider_order_id,
      'provider_payment_id', v_payment.provider_payment_id));
  end if;

  return jsonb_build_object('status', 'returned', 'refund', null);
end;
$$;

revoke all on function public.return_membership_pass(uuid) from public, anon;
grant execute on function public.return_membership_pass(uuid) to authenticated;

comment on function public.return_membership_pass(uuid) is
  'The holder hands an UNUSED membership back within 7 days of buying it (6 Oct 2026, decision 3): the pass is cancelled and a paid one files one automatic refund on its order, sent by the app through the class refund rail.';

create function public._dos_swap(p_def text, p_from text, p_to text, p_fn text, p_expect integer default 1)
returns text
language plpgsql
as $$
declare
  v_n integer := (length(p_def) - length(replace(p_def, p_from, ''))) / greatest(length(p_from), 1);
begin
  if v_n <> p_expect then
    raise exception '% : expected % occurrence(s) of the anchor, found %', p_fn, p_expect, v_n;
  end if;
  return replace(p_def, p_from, p_to);
end;
$$;

do $$
declare
  v text := pg_get_functiondef('public.notify_refund()'::regprocedure);
begin
  v := public._dos_swap(v,
$a$  v_biz_href text;$a$,
$b$  v_biz_href text;
  v_membership text;$b$, 'notify_refund declare');
  v := public._dos_swap(v,
$a$  v_what := coalesce(v_class.title, v_event.title, 'A booking');$a$,
$b$  select m.name into v_membership from public.memberships m
    join public.orders o on o.membership_id = m.id where o.id = new.order_id;
  v_what := coalesce(v_class.title, v_event.title, v_membership, 'A booking');$b$, 'notify_refund what');
  v := public._dos_swap(v,
$a$                     else '/c/' || coalesce(v_class.share_slug, '') end;$a$,
$b$                     when v_membership is not null
                     then '/business/' || new.business_id::text || '/memberships'
                     else '/c/' || coalesce(v_class.share_slug, '') end;$b$, 'notify_refund biz href');
  v := public._dos_swap(v,
$a$        v_what || ' · cancelled outside the policy window, so it goes back automatically.',$a$,
$b$        v_what || case when v_membership is not null
                       then ' · returned unused within 7 days, so it goes back automatically.'
                       else ' · cancelled outside the policy window, so it goes back automatically.' end,$b$, 'notify_refund payer line');
  v := public._dos_swap(v,
$a$        v_what || ' · automatic, outside the policy window.',$a$,
$b$        v_what || case when v_membership is not null
                       then ' · returned unused within 7 days — automatic.'
                       else ' · automatic, outside the policy window.' end,$b$, 'notify_refund owner line');
  v := public._dos_swap(v,
$a$'/my-classes');$a$,
$b$case when v_membership is not null then '/memberships' else '/my-classes' end);$b$, 'notify_refund payer href', 2);
  execute v;
end;
$$;

drop function public._dos_swap(text, text, text, text, integer);
