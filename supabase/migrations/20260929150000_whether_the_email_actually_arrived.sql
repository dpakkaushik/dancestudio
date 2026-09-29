-- WHETHER THE EMAIL ACTUALLY ARRIVED (29 Sep 2026) — backlog #5, second half.
--
-- The user's own pick: "a delivery log for email". Today, when a pilot user says
-- "I never got the link", there is NO WAY TO KNOW whether it bounced, went to
-- spam, or was never sent — and the one thing this app has always been able to
-- say about email is what the 24 Aug record admits: Resend in test mode reaches
-- only the account owner, and everybody else gets the check-inbox screen and
-- silence.
--
-- ⚠⚠ THE SHAPE FOLLOWS FROM A FACT THAT WAS CHECKED RATHER THAN ASSUMED: THIS
-- APP SENDS NO EMAIL AT ALL. Every message — the signup confirmation, the
-- recovery link, the resend — is sent by SUPABASE AUTH over Resend SMTP;
-- `signUpAction`, `requestPasswordResetAction` and `resendEmailAction` each call
-- Supabase and nothing else, and there is no Resend API call anywhere in the
-- tree (`grep resend` finds copy, a test and a comment). So a log written where
-- the app "sends" could only ever record "we asked Supabase to ask Resend",
-- which is already in the auth logs and is not the question. The DELIVERY
-- outcome exists only at Resend, and reaches us only if Resend is told to POST
-- it back.
--
-- So this is a WEBHOOK LEDGER, and it is deliberately the same shape as
-- `webhook_events` (Step 9): one row per delivery, unique on the provider's own
-- message id, append-only, and idempotent by construction rather than by care.
-- A redelivery is a duplicate key and a no-op. There is no status column that
-- can go backwards, because there is no status column at all — "did it arrive"
-- is the newest event for that message, which is a query.
--
-- ⚠ NO CLIENT DOOR AND NO POLICY, like every other machine-written table here.
-- The route writes with the service role.
--
-- ⚠⚠ AND IT DOES NOTHING UNTIL TWO THINGS THE USER OWNS ARE DONE, which is said
-- here rather than discovered: a webhook must be added at resend.com/webhooks
-- pointing at {deployment}/api/webhooks/resend, and its signing secret put in
-- RESEND_WEBHOOK_SECRET. Until then the route answers 503 "not configured",
-- exactly as the Cashfree route did before 10 Sep 2026 — and this table stays
-- empty, which is honest rather than broken.

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  /** ⚠ THE EXACTLY-ONCE SPINE — Svix's own message id from the `svix-id` header.
      A redelivery carries the SAME id, so it collides here and the route answers
      200 without doing anything twice. Same rule as webhook_events.event_id. */
  provider_event_id text not null unique,
  provider text not null default 'resend',
  /** Resend's id for the EMAIL itself — several events share it (sent, then
      delivered, then perhaps bounced), which is what makes this a log */
  message_id text,
  /** email.sent | email.delivered | email.bounced | email.complained |
      email.delivery_delayed — stored as Resend sends it rather than mapped, so
      a kind we have not met yet is recorded instead of dropped */
  event_type text not null,
  /** who it was for. ⚠ Personal data: nothing but a platform admin reads it. */
  to_email text,
  subject text,
  /** the reason, for a bounce or a complaint — the only field that answers
      "why did they not get it" */
  detail text,
  /** ⚠ the whole payload, kept: the first time a delivery does something we did
      not expect, this column is the only evidence of what it actually said */
  payload jsonb not null,
  constraint email_events_provider_shape check (provider in ('resend')),
  constraint email_events_type_shape check (btrim(event_type) <> '')
);

comment on table public.email_events is
  'Delivery events POSTed back by Resend — one row per webhook delivery, unique '
  'on the Svix message id so a redelivery is a no-op. ⚠ This app sends no email '
  'itself (Supabase Auth does, over Resend SMTP), so this is the ONLY place the '
  'platform can learn that a link bounced. Written by the webhook route with the '
  'service role: no client door, no policy.';

create index if not exists email_events_at_idx on public.email_events (at desc);
create index if not exists email_events_message_idx on public.email_events (message_id, at desc);
/** the query somebody actually runs: "what happened to this person's email?" */
create index if not exists email_events_to_idx on public.email_events (lower(btrim(to_email)), at desc);
/** and the one that matters at a glance: what is failing */
create index if not exists email_events_bad_idx
  on public.email_events (at desc)
  where event_type in ('email.bounced', 'email.complained', 'email.delivery_delayed');

alter table public.email_events enable row level security;
-- ⚠ NO POLICY — the service role writes, a definer function reads.
revoke all on public.email_events from anon, authenticated;

/** What happened to the emails sent to one address, newest first.
 *  ⚠ The whole point: "I never got the link" becomes an answer instead of a
 *  shrug. A platform admin's alone — an address and its delivery history are
 *  somebody else's data. */
create or replace function public.email_history_for(p_email text, p_limit integer default 50)
returns table (at timestamptz, event_type text, subject text, detail text, message_id text)
language sql
security definer
set search_path = public
as $$
  select e.at, e.event_type, e.subject, e.detail, e.message_id
    from public.email_events e
   where public.is_platform_admin()
     and lower(btrim(e.to_email)) = lower(btrim(p_email))
   order by e.at desc
   limit least(greatest(p_limit, 1), 500);
$$;

comment on function public.email_history_for(text, integer) is
  'Every delivery event for one address, for a platform admin. ⚠ Answers the '
  'service role with EMPTINESS rather than an error (10 Sep 2026), because '
  'is_platform_admin() is false for a connection with no auth.uid().';

/** How email is doing overall — the figure that says whether anything is wrong.
 *  ⚠ It counts EVENTS, not messages: one email that was sent and then bounced is
 *  two rows, which is what a delivery log is. The ratio is what to read. */
create or replace function public.email_delivery_pulse(p_days integer default 7)
returns table (event_type text, n bigint)
language sql
security definer
set search_path = public
as $$
  select e.event_type, count(*) as n
    from public.email_events e
   where public.is_platform_admin()
     and e.at >= now() - make_interval(days => greatest(p_days, 1))
   group by 1
   order by 2 desc;
$$;

comment on function public.email_delivery_pulse(integer) is
  'Delivery events by kind over a window, for a platform admin — the dashboard '
  'figure that says whether email is working at all.';

revoke all on function public.email_history_for(text, integer) from public, anon;
revoke all on function public.email_delivery_pulse(integer) from public, anon;
grant execute on function public.email_history_for(text, integer) to authenticated;
grant execute on function public.email_delivery_pulse(integer) to authenticated;
