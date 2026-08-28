-- Step 24, second migration: an automatic refund tells the person whose money it is.
--
-- Found by the proof, not by reading. Step 9 files a cancellation OUTSIDE the
-- 48-hour window as `pending` — the rail refunds it, nobody decides anything —
-- and the first cut of `notify_refund` only spoke on an INSERT of `requested`
-- (the studio's queue) and on the UPDATE that decides one. So the commonest
-- refund of all, the automatic one, was silent to the payer: their seat went
-- back, their money started moving, and no line appeared anywhere.
--
-- The one place that knows a refund was filed is the same trigger, so it says
-- both things now: the studio hears a request that needs deciding, and the
-- payer hears that money is coming back — whether a person decided it or the
-- policy did. Same trigger, same signature; the body is what changed.
-- (Rule 4: the applied migration is untouched.)

create or replace function public.notify_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class public.classes;
  v_who text;
begin
  select c.* into v_class from public.classes c
    join public.orders o on o.class_id = c.id where o.id = new.order_id;
  select p.full_name into v_who from public.profiles p where p.id = new.user_id;

  if tg_op = 'INSERT' then
    if new.status = 'requested' then
      -- inside the policy window: the studio decides, so the studio is told
      perform public.notify_tenant_owners(new.tenant_id, 'money',
        coalesce(v_who, 'Somebody') || ' asked for a refund — ₹' || new.amount_inr::text,
        coalesce(v_class.title, 'A class') || ' · your call, inside the policy window.',
        '/c/' || coalesce(v_class.share_slug, ''));
    elsif new.status = 'pending' then
      -- outside it: the policy already decided, and the payer hears that
      perform public.notify(new.user_id, 'money',
        'Refund on its way — ₹' || new.amount_inr::text,
        coalesce(v_class.title, 'A class') || ' · cancelled outside the policy window, so it goes back automatically.',
        '/my-classes');
      perform public.notify_tenant_owners(new.tenant_id, 'money',
        coalesce(v_who, 'Somebody') || ' cancelled — ₹' || new.amount_inr::text || ' refunding',
        coalesce(v_class.title, 'A class') || ' · automatic, outside the policy window.',
        '/c/' || coalesce(v_class.share_slug, ''));
    end if;
  elsif tg_op = 'UPDATE' and old.status <> new.status and new.status in ('pending', 'processed', 'declined') then
    perform public.notify(new.user_id, 'money',
      case new.status
        when 'declined' then 'Refund declined — ₹' || new.amount_inr::text
        when 'processed' then 'Refund paid — ₹' || new.amount_inr::text
        else 'Refund approved — ₹' || new.amount_inr::text end,
      coalesce(v_class.title, 'A class') || case new.status when 'pending' then ' · on its way back to you.' else '' end,
      '/my-classes');
  end if;
  return null;
end;
$$;
revoke execute on function public.notify_refund() from public, anon, authenticated;
