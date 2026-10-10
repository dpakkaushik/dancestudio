-- A FIRST-MONTH REFUND IS "REFUNDED" ONLY WHEN CASHFREE SAYS SO, AND AN
-- ACCOUNT THAT LEFT CAN BE PUT BACK (10 Oct 2026). The user, on two of the
-- limits the 6 Oct decisions left: "Check with Cashfree" and "Restore button".
-- ⚠ Rule 9: money, and auth.
--
-- ── 1 · THE FIRST-MONTH REFUND ────────────────────────────────────────────
-- `admin_record_first_period_refund` (20261006095000) marked the studio's
-- authorisation payment `refunded` the moment Cashfree ACCEPTED the refund, so
-- a refund Cashfree later failed would read refunded for ever. Now:
--   * `subscription_refunds` — one row per first-month refund sent: the
--     subscription, the payment, the payer, the amount, OUR merchant refund id
--     (what Cashfree is asked about), and `pending | processed | failed`. ⚠ Not
--     the `refunds` table: that is a class-order ledger whose `order_id` is NOT
--     NULL, and a subscription payment has no order (20261006095000's reason).
--     RLS: the payer reads their own, a platform admin reads all; no client
--     writes at all.
--   * `admin_record_first_period_refund` — same signature, so no grant moves —
--     now files a PENDING row and leaves the payment `captured`. The payer is
--     told the money is on its way, not that it has landed.
--   * `apply_subscription_refund_update(merchant refund id, succeeded)` — the
--     service role's alone, idempotent: SUCCESS marks the row processed and the
--     payment refunded and tells the payer it landed; FAILED marks the row failed
--     and tells the platform admins. The app calls it after asking Cashfree,
--     when the admin's money desk or the payer's invoices are opened.
--
-- ── 2 · PUTTING BACK AN ACCOUNT THAT LEFT ─────────────────────────────────
-- `request_account_deletion` (20261006094000) soft-deletes the profile and the
-- app bans sign-in; undoing it was an UPDATE and an API call nobody had a
-- button for. Two admin-only doors:
--   * `admin_left_accounts()` — every account that left BY ITSELF (a
--     soft-deleted profile with its own "Delete my account" thread), newest
--     first, with the address, so the Accounts desk can list them.
--   * `admin_restore_account(p_user_id, p_reason)` — refuses anything that did
--     not leave through that door; otherwise un-deletes the profile, puts back
--     the artist page the same act closed (and its owner seat — matched to the
--     second on the profile's own `deleted_at`, because one transaction stamped
--     all three with the same `now()`), answers in the thread, tells the person,
--     and audits `account.restore`. ⚠ Every OTHER seat, crew place and class ask
--     the deletion closed STAYS closed — the user's choice. The sign-in ban is
--     lifted by the app with the service role, after this answers.
--
-- Counted first: 0 first-month refunds recorded, 0 accounts that left — nothing
-- to backfill. No existing table, column, policy or grant moves. No
-- `begin;`/`commit;` (Rule 18).

-- ── 1 · first-month refunds ─────────────────────────────────────────────
create table public.subscription_refunds (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  payment_id uuid not null references public.payments(id) on delete cascade,
  user_id uuid not null,
  amount_inr integer not null check (amount_inr >= 0),
  provider_refund_id text not null check (char_length(provider_refund_id) between 3 and 64),
  status text not null default 'pending' check (status in ('pending', 'processed', 'failed')),
  reason text check (reason is null or char_length(reason) <= 500),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

comment on table public.subscription_refunds is
  'A first-month refund of a subscription, sent to Cashfree''s subscription refund API: pending until Cashfree says SUCCESS (the payment is then marked refunded) or FAILED. Written only by admin_record_first_period_refund and apply_subscription_refund_update.';
comment on column public.subscription_refunds.provider_refund_id is
  'OUR merchant refund id (dos_subref_…), which is what Cashfree''s GET /subscriptions/{id}/refunds/{refund_id} is keyed on.';

create unique index subscription_refunds_provider_refund_id_key on public.subscription_refunds (provider_refund_id);
-- one live refund per payment; a FAILED one may be followed by another
create unique index subscription_refunds_one_live_per_payment on public.subscription_refunds (payment_id)
  where deleted_at is null and status <> 'failed';
create index subscription_refunds_pending_idx on public.subscription_refunds (created_at) where status = 'pending' and deleted_at is null;
create index subscription_refunds_user_idx on public.subscription_refunds (user_id);

create trigger subscription_refunds_set_updated_at before update on public.subscription_refunds
  for each row execute function public.set_updated_at();

alter table public.subscription_refunds enable row level security;
create policy "payers read their own first-month refunds, admins all" on public.subscription_refunds
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_platform_admin());
revoke all on table public.subscription_refunds from anon, authenticated;
grant select on table public.subscription_refunds to authenticated;

create or replace function public.admin_record_first_period_refund(
  p_subscription_id uuid,
  p_provider_refund_id text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  s public.subscriptions;
  v_pay public.payments;
  v_label text;
  v_refund uuid;
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'say why in a sentence — they read it, and so does the log';
  end if;
  if p_provider_refund_id is null or char_length(btrim(p_provider_refund_id)) < 3 then
    raise exception 'a refund is recorded with the rail''s own refund id';
  end if;
  select * into s from public.subscriptions x where x.id = p_subscription_id and x.deleted_at is null;
  if not found then raise exception 'no such subscription'; end if;

  select * into v_pay from public.payments p
   where p.subscription_id = s.id and p.kind = 'subscription_auth' and p.deleted_at is null
   order by p.created_at desc
   limit 1
   for update;
  if not found then
    raise exception 'nothing was paid for the first period — there is nothing to refund';
  end if;
  if v_pay.status = 'refunded' then
    raise exception 'the first period is already refunded';
  end if;
  if v_pay.status <> 'captured' then
    raise exception 'the first period''s payment did not go through — there is nothing to refund';
  end if;
  if exists (select 1 from public.subscription_refunds r
              where r.payment_id = v_pay.id and r.deleted_at is null and r.status = 'pending') then
    raise exception 'the first period is already being refunded';
  end if;

  insert into public.subscription_refunds (subscription_id, payment_id, user_id, amount_inr, provider_refund_id, status, reason, created_by, updated_by)
  values (s.id, v_pay.id, s.user_id, v_pay.amount_inr, btrim(p_provider_refund_id), 'pending', left(btrim(p_reason), 500), auth.uid(), auth.uid())
  returning id into v_refund;

  if s.kind in ('studio', 'org') then
    select t.name into v_label from public.businesses t where t.id = s.business_id;
  else
    select p.full_name into v_label from public.profiles p where p.id = s.user_id;
  end if;

  perform public.notify(s.user_id, 'money',
    left('₹' || to_char(v_pay.amount_inr, 'FM9,99,99,999') || ' for ' || coalesce(v_label, 'your subscription') || ' is being refunded', 160),
    left(btrim(p_reason) || ' — Cashfree is sending the first month back to where it was paid from. You are told when it lands.', 300),
    '/invoices');
  perform public.log_admin_action('subscription.refund',
    case when s.kind in ('studio', 'org') then 'business' else 'profile' end,
    coalesce(s.business_id, s.user_id), v_label, p_reason,
    jsonb_build_object('subscription_id', s.id, 'payment_id', v_pay.id, 'amount_inr', v_pay.amount_inr,
                       'refund_id', v_refund, 'provider_refund_id', btrim(p_provider_refund_id)));

  return jsonb_build_object('refund_id', v_refund, 'payment_id', v_pay.id, 'amount_inr', v_pay.amount_inr, 'status', 'pending');
end;
$function$;

comment on function public.admin_record_first_period_refund(uuid, text, text) is
  'Records that Cashfree ACCEPTED the refund of a subscription''s FIRST period: files a pending subscription_refunds row (the payment stays captured until Cashfree says the money moved), tells the payer it is on its way, audits subscription.refund. A platform admin''s alone; refuses a comped plan, a failed payment, a refunded one and a second live refund.';

create or replace function public.apply_subscription_refund_update(
  p_provider_refund_id text,
  p_succeeded boolean
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  r public.subscription_refunds;
  s public.subscriptions;
  v_label text;
begin
  select * into r from public.subscription_refunds x
   where x.provider_refund_id = p_provider_refund_id and x.deleted_at is null
   for update;
  if not found then
    return jsonb_build_object('outcome', 'unknown');
  end if;
  if r.status <> 'pending' then
    return jsonb_build_object('outcome', 'duplicate', 'status', r.status);
  end if;

  select * into s from public.subscriptions x where x.id = r.subscription_id;
  if s.kind in ('studio', 'org') then
    select t.name into v_label from public.businesses t where t.id = s.business_id;
  else
    select p.full_name into v_label from public.profiles p where p.id = s.user_id;
  end if;

  if p_succeeded then
    update public.subscription_refunds set status = 'processed', settled_at = now(), updated_by = r.created_by where id = r.id;
    update public.payments set status = 'refunded', updated_by = r.created_by where id = r.payment_id and status = 'captured';
    perform public.notify(r.user_id, 'money',
      left('₹' || to_char(r.amount_inr, 'FM9,99,99,999') || ' for ' || coalesce(v_label, 'your subscription') || ' is back', 160),
      'The first month has been refunded to where it was paid from.',
      '/invoices');
    return jsonb_build_object('outcome', 'processed');
  end if;

  update public.subscription_refunds set status = 'failed', settled_at = now(), updated_by = r.created_by where id = r.id;
  perform public.notify_platform_admins('money',
    left('A first-month refund failed — ' || coalesce(v_label, 'a subscription'), 160),
    left('Cashfree did not send ₹' || to_char(r.amount_inr, 'FM9,99,99,999') || ' back (' || r.provider_refund_id || '). The payment still reads paid — refund it from the Cashfree dashboard.', 300),
    '/admin/payments');
  return jsonb_build_object('outcome', 'failed');
end;
$function$;

revoke all on function public.apply_subscription_refund_update(text, boolean) from public, anon, authenticated;
grant execute on function public.apply_subscription_refund_update(text, boolean) to service_role;

comment on function public.apply_subscription_refund_update(text, boolean) is
  'Lands Cashfree''s answer on a pending first-month refund, keyed on our merchant refund id: success marks it processed and the payment refunded and tells the payer; failure marks it failed and tells the platform admins. Idempotent. The service role''s alone.';

-- ── 2 · an account that left, put back ──────────────────────────────────
create or replace function public.admin_left_accounts()
returns table (user_id uuid, full_name text, email text, profile_photo_path text, city text, left_at timestamptz, thread_id uuid)
language sql
stable
security definer
set search_path to ''
as $function$
  select p.id, p.full_name, u.email::text, p.profile_photo_path, p.city, p.deleted_at,
         (select t.id from public.support_threads t
           where t.account_id = p.id and t.subject = 'Delete my account' and not t.opened_by_admin and t.deleted_at is null
           order by t.created_at desc limit 1)
    from public.profiles p
    left join auth.users u on u.id = p.id
   where public.is_platform_admin()
     and p.deleted_at is not null
     and exists (select 1 from public.support_threads t
                  where t.account_id = p.id and t.subject = 'Delete my account' and not t.opened_by_admin and t.deleted_at is null)
   order by p.deleted_at desc
   limit 500;
$function$;

revoke all on function public.admin_left_accounts() from public, anon;
grant execute on function public.admin_left_accounts() to authenticated, service_role;

comment on function public.admin_left_accounts() is
  'Every account that left through "Delete my account" (a soft-deleted profile with its own deletion thread), newest first — a platform admin''s alone; answers nothing to anybody else.';

create or replace function public.admin_restore_account(p_user_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_admin uuid := auth.uid();
  v_left timestamptz;
  v_name text;
  v_thread uuid;
  v_pages integer := 0;
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'say why in a sentence — they read it, and so does the log';
  end if;
  if char_length(btrim(p_reason)) > 300 then
    raise exception 'a reason is at most 300 characters';
  end if;

  select p.deleted_at, p.full_name into v_left, v_name from public.profiles p where p.id = p_user_id for update;
  if not found then raise exception 'no such account'; end if;
  if v_left is null then raise exception 'this account has not left — there is nothing to restore'; end if;

  select t.id into v_thread from public.support_threads t
   where t.account_id = p_user_id and t.subject = 'Delete my account' and not t.opened_by_admin and t.deleted_at is null
   order by t.created_at desc limit 1;
  if v_thread is null then
    raise exception 'this account did not leave through "Delete my account" — restoring it is not this door''s';
  end if;

  update public.profiles set deleted_at = null where id = p_user_id;

  -- the artist page the same act closed, and its owner seat: stamped with the
  -- same now() as the profile, so the match is exact
  with pages as (
    update public.businesses b set deleted_at = null
     where b.type = 'artist_page' and b.deleted_at = v_left
       and exists (select 1 from public.business_members m
                    where m.business_id = b.id and m.user_id = p_user_id
                      and m.member_role = 'owner' and m.deleted_at = v_left)
    returning b.id
  ), seats as (
    update public.business_members m set deleted_at = null
     where m.user_id = p_user_id and m.member_role = 'owner' and m.deleted_at = v_left
       and m.business_id in (select id from pages)
    returning m.id
  )
  select count(*) into v_pages from pages;

  insert into public.support_messages (thread_id, author_id, from_admin, body, created_by, updated_by)
  values (v_thread, v_admin, true,
          left('Your account is back — sign in as before. ' || btrim(p_reason)
               || chr(10) || chr(10) || 'Seats, crew places and classes you left stay closed.', 4000),
          v_admin, v_admin);
  update public.support_threads
     set last_message_at = now(), admin_read_at = now(), updated_by = v_admin
   where id = v_thread;

  perform public.notify(p_user_id, 'people', 'Your account is back',
    left(btrim(p_reason), 300), '/support/' || v_thread::text);
  perform public.log_admin_action('account.restore', 'profile', p_user_id, v_name, p_reason,
    jsonb_build_object('thread_id', v_thread, 'left_at', v_left, 'artist_pages', v_pages));

  return jsonb_build_object('restored', p_user_id, 'thread_id', v_thread, 'artist_pages', v_pages);
end;
$function$;

revoke all on function public.admin_restore_account(uuid, text) from public, anon;
grant execute on function public.admin_restore_account(uuid, text) to authenticated, service_role;

comment on function public.admin_restore_account(uuid, text) is
  'Puts back an account that left through "Delete my account": un-deletes the profile and the artist page (and its owner seat) the same act closed, answers in the deletion thread, tells the person, audits account.restore. Every other seat and ask stays closed. A platform admin''s alone; the app lifts the sign-in ban with the service role afterwards.';
