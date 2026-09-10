-- ─────────────────────────────────────────────────────────────────────────────
-- THE TWO DESKS THE PANEL WAS MISSING (11 Sep 2026) — the user's words:
-- "make it in segments where each segment opens a new page where admin can see
--  what is happening where. payment, subscription, approval request,
--  communication etc"
--
-- Three of those four already had a page: subscriptions, approval requests
-- (verifications, and reports beside them), and — half of communication —
-- support. Two things had none:
--
--   * MONEY. The dashboard carried six totals and there was nowhere to go from
--     them. An admin could see that ₹40,000 had been captured and could not see
--     a single payment, could not find one person's payment, could not see the
--     refund somebody was waiting on, and could not see what had been paid out
--     to a trainer. Every other desk reads through a definer RPC because a
--     platform admin has NO PROFILE to scope a plain query by — and the money
--     tables have no admin policy at all, by design, so an RPC is the only way
--     to read them.
--
--   * WHAT THE PLATFORM SAYS AND HEARS. `notifications` is written by triggers
--     where the fact happens and read by one person at a time. Nobody could
--     answer "did the platform actually tell anyone?" — which is the first
--     question when a studio says nobody turned up, and the first question
--     after any change to a trigger.
--
-- Both are READ-ONLY. Nothing here can move money or send anything; deciding a
-- refund stays where it is, with the studio, and every existing settlement door
-- is untouched.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. every payment on the platform ─────────────────────────────────────────
create or replace function public.admin_payments(
  p_q text default null,
  p_kind text default null,
  p_status text default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  kind text,
  amount_inr integer,
  status text,
  method text,
  provider text,
  provider_payment_id text,
  created_at timestamptz,
  payer_id uuid,
  payer_name text,
  payer_email text,
  tenant_id uuid,
  tenant_name text,
  what text,
  refunded_inr integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         p.kind,
         p.amount_inr,
         p.status,
         p.method,
         p.provider,
         p.provider_payment_id,
         p.created_at,
         p.user_id as payer_id,
         coalesce(pr.full_name, 'Someone') as payer_name,
         u.email::text as payer_email,
         p.tenant_id,
         t.name as tenant_name,
         -- what the money was FOR, in the words the rest of the app uses
         case p.kind
           when 'order' then coalesce(c.title, 'A class')
           when 'subscription_auth' then coalesce(s.kind, 'plan') || ' plan — first period'
           else coalesce(s.kind, 'plan') || ' plan — renewal'
         end as what,
         coalesce((select sum(r.amount_inr)::integer from public.refunds r
                    where r.payment_id = p.id and r.status = 'processed' and r.deleted_at is null), 0) as refunded_inr
    from public.payments p
    left join public.profiles pr on pr.id = p.user_id
    left join auth.users u on u.id = p.user_id
    left join public.tenants t on t.id = p.tenant_id
    left join public.orders o on o.id = p.order_id
    left join public.classes c on c.id = o.class_id
    left join public.subscriptions s on s.id = p.subscription_id
   where public.is_platform_admin()
     and p.deleted_at is null
     and (p_kind is null or p.kind = p_kind)
     and (p_status is null or p.status = p_status)
     and (
       p_q is null or btrim(p_q) = ''
       or lower(coalesce(pr.full_name, '')) like '%' || lower(btrim(p_q)) || '%'
       or lower(coalesce(u.email::text, '')) like '%' || lower(btrim(p_q)) || '%'
       or lower(coalesce(t.name, '')) like '%' || lower(btrim(p_q)) || '%'
       or lower(coalesce(p.provider_payment_id, '')) like '%' || lower(btrim(p_q)) || '%'
     )
   order by p.created_at desc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;
comment on function public.admin_payments(text, text, text, integer) is
  'Every payment on the platform — a class seat, a mandate authorisation, a renewal — with who paid, what for, and how much of it has since gone back (11 Sep 2026). Admins only; read-only.';
revoke execute on function public.admin_payments(text, text, text, integer) from public, anon;
grant execute on function public.admin_payments(text, text, text, integer) to authenticated;

-- ── 2. every refund, whoever is waiting on it ────────────────────────────────
create or replace function public.admin_refunds(
  p_status text default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  amount_inr integer,
  status text,
  reason text,
  created_at timestamptz,
  decided_at timestamptz,
  decision_note text,
  settled_offline boolean,
  provider_refund_id text,
  learner_id uuid,
  learner_name text,
  tenant_id uuid,
  tenant_name text,
  class_title text,
  waiting_days integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id,
         r.amount_inr,
         r.status,
         r.reason,
         r.created_at,
         r.decided_at,
         r.decision_note,
         r.settled_offline,
         r.provider_refund_id,
         r.user_id as learner_id,
         coalesce(pr.full_name, 'Someone') as learner_name,
         r.tenant_id,
         t.name as tenant_name,
         coalesce(c.title, 'A class') as class_title,
         -- how long somebody has been waiting: the number that says which one to chase
         case when r.status in ('requested', 'pending')
              then greatest(0, (extract(epoch from (now() - r.created_at)) / 86400)::integer)
              else 0 end as waiting_days
    from public.refunds r
    left join public.profiles pr on pr.id = r.user_id
    left join public.tenants t on t.id = r.tenant_id
    left join public.orders o on o.id = r.order_id
    left join public.classes c on c.id = o.class_id
   where public.is_platform_admin()
     and r.deleted_at is null
     and (p_status is null or r.status = p_status)
   order by (r.status in ('requested', 'pending')) desc, r.created_at desc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;
comment on function public.admin_refunds(text, integer) is
  'Every refund on the platform, the ones somebody is still waiting on first, with how many days they have waited (11 Sep 2026). Admins only; READ-ONLY — settling stays with the studio.';
revoke execute on function public.admin_refunds(text, integer) from public, anon;
grant execute on function public.admin_refunds(text, integer) to authenticated;

-- ── 3. every payout a business has made to a person ──────────────────────────
create or replace function public.admin_payouts(
  p_status text default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  amount_inr integer,
  status text,
  method text,
  provider_ref text,
  paid_on date,
  created_at timestamptz,
  tenant_id uuid,
  tenant_name text,
  person_id uuid,
  person_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select po.id,
         po.amount_inr,
         po.status,
         po.method,
         po.provider_ref,
         po.paid_on,
         po.created_at,
         po.tenant_id,
         t.name as tenant_name,
         po.user_id as person_id,
         coalesce(pr.full_name, 'Someone') as person_name
    from public.payouts po
    left join public.tenants t on t.id = po.tenant_id
    left join public.profiles pr on pr.id = po.user_id
   where public.is_platform_admin()
     and po.deleted_at is null
     and (p_status is null or po.status = p_status)
   order by po.paid_on desc, po.created_at desc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;
comment on function public.admin_payouts(text, integer) is
  'What businesses have paid their trainers, newest first (11 Sep 2026). Admins only; read-only — DanceOS does not move this money, it records it.';
revoke execute on function public.admin_payouts(text, integer) from public, anon;
grant execute on function public.admin_payouts(text, integer) to authenticated;

-- ── 4. the money desk's own header ───────────────────────────────────────────
create or replace function public.admin_money_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when not public.is_platform_admin() then null else jsonb_build_object(
    'captured_today_inr', (select coalesce(sum(amount_inr), 0) from public.payments
                            where status = 'captured' and deleted_at is null
                              and created_at >= date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'),
    'captured_week_inr', (select coalesce(sum(amount_inr), 0) from public.payments
                           where status = 'captured' and deleted_at is null and created_at >= now() - interval '7 days'),
    'captured_all_inr', (select coalesce(sum(amount_inr), 0) from public.payments
                          where status = 'captured' and deleted_at is null),
    -- what DanceOS itself earned, as against what passed through it to a studio
    'platform_all_inr', (select coalesce(sum(amount_inr), 0) from public.payments
                          where status = 'captured' and deleted_at is null and kind <> 'order'),
    'classes_all_inr', (select coalesce(sum(amount_inr), 0) from public.payments
                         where status = 'captured' and deleted_at is null and kind = 'order'),
    'refunded_all_inr', (select coalesce(sum(amount_inr), 0) from public.refunds
                          where status = 'processed' and deleted_at is null),
    'refunds_waiting', (select count(*) from public.refunds where status in ('requested', 'pending') and deleted_at is null),
    'refunds_oldest_days', (select coalesce(max((extract(epoch from (now() - created_at)) / 86400)::integer), 0)
                              from public.refunds where status in ('requested', 'pending') and deleted_at is null),
    'payments_failed_week', (select count(*) from public.payments
                              where status = 'failed' and deleted_at is null and created_at >= now() - interval '7 days'),
    'orders_unpaid', (select count(*) from public.orders where status = 'created' and deleted_at is null),
    'payouts_all_inr', (select coalesce(sum(amount_inr), 0) from public.payouts
                         where status = 'done' and deleted_at is null),
    'payouts_pending', (select count(*) from public.payouts
                         where status in ('in_transit', 'on_hold') and deleted_at is null),
    -- a delivery that arrived and never finished is money we may not have recorded
    'webhooks_stuck', (select count(*) from public.webhook_events where processed_at is null)
  ) end;
$$;
comment on function public.admin_money_summary() is
  'The money desk''s header: what came in today / this week / ever, split into DanceOS''s own revenue and studios'' class income, what went back, who is waiting, and whether any webhook never finished (11 Sep 2026).';
revoke execute on function public.admin_money_summary() from public, anon;
grant execute on function public.admin_money_summary() to authenticated;

-- ── 5. what the platform has been saying, and hearing back ───────────────────
create or replace function public.admin_communication()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when not public.is_platform_admin() then null else jsonb_build_object(
    'notifications', jsonb_build_object(
      'today', (select count(*) from public.notifications
                 where deleted_at is null
                   and created_at >= date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'),
      'week', (select count(*) from public.notifications where deleted_at is null and created_at >= now() - interval '7 days'),
      'all', (select count(*) from public.notifications where deleted_at is null),
      'unread', (select count(*) from public.notifications where deleted_at is null and read_at is null),
      -- the share that gets opened at all: a kind nobody reads is a kind nobody wants
      'read_pct', (select case when count(*) = 0 then 0
                          else round(100.0 * count(*) filter (where read_at is not null) / count(*))::integer end
                     from public.notifications where deleted_at is null and created_at >= now() - interval '30 days'),
      'by_kind', coalesce((select jsonb_agg(x order by x->>'kind')
                             from (select jsonb_build_object(
                                     'kind', kind,
                                     'n', count(*),
                                     'read_pct', case when count(*) = 0 then 0
                                                 else round(100.0 * count(*) filter (where read_at is not null) / count(*))::integer end
                                   ) as x
                                     from public.notifications
                                    where deleted_at is null and created_at >= now() - interval '30 days'
                                    group by kind) k), '[]'::jsonb)
    ),
    'support', jsonb_build_object(
      'open', (select count(*) from public.support_threads where status = 'open' and deleted_at is null),
      'closed', (select count(*) from public.support_threads where status = 'closed' and deleted_at is null),
      -- threads where the LAST word is theirs and no admin has read it since
      'waiting_on_us', (select count(*) from public.support_threads
                         where status = 'open' and deleted_at is null
                           and (admin_read_at is null or admin_read_at < last_message_at)),
      'oldest_waiting_days', (select coalesce(max((extract(epoch from (now() - last_message_at)) / 86400)::integer), 0)
                                from public.support_threads
                               where status = 'open' and deleted_at is null
                                 and (admin_read_at is null or admin_read_at < last_message_at)),
      'messages_week', (select count(*) from public.support_messages where deleted_at is null and created_at >= now() - interval '7 days')
    ),
    'enquiries', jsonb_build_object(
      'open', (select count(*) from public.enquiries where status not in ('won', 'lost') and deleted_at is null),
      'week', (select count(*) from public.enquiries where deleted_at is null and created_at >= now() - interval '7 days'),
      'all', (select count(*) from public.enquiries where deleted_at is null)
    )
  ) end;
$$;
comment on function public.admin_communication() is
  'What the platform has been saying and hearing (11 Sep 2026): notifications raised and the share actually opened, broken down by kind; support threads where the last word is theirs; enquiry volume. Read-only.';
revoke execute on function public.admin_communication() from public, anon;
grant execute on function public.admin_communication() to authenticated;

-- ── 6. the most recent notifications, to see the words themselves ────────────
create or replace function public.admin_recent_notifications(
  p_kind text default null,
  p_limit integer default 50
)
returns table (
  id uuid,
  kind text,
  title text,
  body text,
  href text,
  read_at timestamptz,
  created_at timestamptz,
  person_id uuid,
  person_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.kind, n.title, n.body, n.href, n.read_at, n.created_at,
         n.user_id as person_id, coalesce(pr.full_name, 'Someone') as person_name
    from public.notifications n
    left join public.profiles pr on pr.id = n.user_id
   where public.is_platform_admin()
     and n.deleted_at is null
     and (p_kind is null or n.kind = p_kind)
   order by n.created_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;
comment on function public.admin_recent_notifications(text, integer) is
  'The last notifications the platform raised, with who they went to (11 Sep 2026). The words themselves, so a trigger that has started saying the wrong thing is visible. Admins only; read-only.';
revoke execute on function public.admin_recent_notifications(text, integer) from public, anon;
grant execute on function public.admin_recent_notifications(text, integer) to authenticated;
