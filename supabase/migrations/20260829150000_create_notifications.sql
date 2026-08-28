-- Step 24 (Notifications).
--
-- The prototype's notifications screen (S_notif 13702) is six KINDS
-- (NOTIF_KINDS 13642: Enquiries · Bookings · Money · People · Events · Classes),
-- each a stack of rows carrying a title, a body, a time and a destination, with
-- an unread dot, Mark read / Clear all per stack, and a settings sheet — "What
-- reaches you" — that switches a kind off ("Switch a kind off and its stack
-- disappears from this screen") and offers three channels: On this phone,
-- WhatsApp, Email.
--
-- WHERE A NOTIFICATION IS RAISED. The prototype's own comments say it twice:
-- "THE WAITLIST IS TOLD, OR IT IS NOT A WAITLIST" (13647) and "A REQUEST NOBODY
-- SEES IS NOT A REQUEST" (13659) — a notification is raised at the moment the
-- fact happens, not by whichever screen remembers to. So these are TRIGGERS on
-- the tables that already hold the facts, not calls sprinkled through the
-- actions: a claim asked, a claim answered, a seat booked, a waitlisted seat
-- offered, a refund requested and decided, a payout settled, an enquiry sent
-- and quoted, an event seat or entry booked, a crew ask and its answer, a duet
-- partner asked and their answer. Every path that writes those rows — an
-- action, an RPC, the Cashfree webhook, a proof script, the demo seeder —
-- raises the same notification, because none of them can write the row without
-- passing the trigger.
--
-- A trigger runs inside the transaction it observes, so `notify` NEVER raises:
-- it drops a notification whose recipient has no live profile rather than
-- failing somebody's booking. That is the whole of its error handling, and it
-- is deliberate — an unsent notification is a missing line on a screen; a
-- failed insert is a lost seat.
--
-- Channels, honestly: this slice delivers IN-APP. The three switches are real
-- rows (a person's answer is recorded, and it is the thing a sender must check
-- later), but nothing sends a web push, a WhatsApp message or an email yet:
-- push needs VAPID keys and a service worker, WhatsApp needs Step 26's
-- provider, email needs the verified Resend domain. Storing a preference we do
-- not yet act on is honest; printing "sent to your phone" would not be.

-- ── notifications ────────────────────────────────────────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  -- whose notification this is; there is no such thing as a tenant's
  -- notification, only a person's (a studio's owner gets it)
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('enquiry', 'booking', 'money', 'people', 'event', 'class')),
  title text not null check (length(trim(title)) between 1 and 160),
  body text check (body is null or length(body) <= 300),
  -- where pressing it goes, as an in-app path ("/inbox", "/c/abc-123")
  href text check (href is null or length(href) <= 300),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

comment on table public.notifications is
  'One person''s notifications. Raised by triggers where the fact happens, never by a screen. Clearing soft-deletes; reading stamps read_at.';

create index notifications_user_idx on public.notifications (user_id, created_at desc) where deleted_at is null;
create index notifications_unread_idx on public.notifications (user_id) where deleted_at is null and read_at is null;

create trigger notifications_set_updated_at
  before update on public.notifications
  for each row execute function public.set_updated_at();

-- ── notification_prefs — one row per person ──────────────────────────────────
create table public.notification_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- the six kinds; a kind switched off is hidden from the screen, and its
  -- history comes back when it is switched on again (nothing is deleted)
  kinds jsonb not null default '{"enquiry":true,"booking":true,"money":true,"people":true,"event":true,"class":true}'::jsonb,
  -- HOW THEY REACH YOU (13800). Recorded, not yet acted on — see the header.
  push boolean not null default true,
  whatsapp boolean not null default true,
  email boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);

comment on table public.notification_prefs is
  'What reaches a person: the six kinds, and the three channels. The channel switches are stored and not yet acted on — in-app is the only delivery this slice makes.';

create trigger notification_prefs_set_updated_at
  before update on public.notification_prefs
  for each row execute function public.set_updated_at();

-- ── RLS: your own, and nobody else's ─────────────────────────────────────────
alter table public.notifications enable row level security;
alter table public.notification_prefs enable row level security;

-- no deleted_at filter: a soft-deleting role must be able to SELECT the row it
-- just cleared (Step 3's lesson)
create policy "people read own notifications" on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy "people read own notification prefs" on public.notification_prefs for select to authenticated
  using (user_id = auth.uid());

-- no insert policy anywhere: notifications are raised by triggers only, and
-- prefs are written through set_notification_prefs. No public policy at all —
-- what has been asked of you is nobody else's business.

-- ── notify — the one writer ──────────────────────────────────────────────────
create or replace function public.notify(p_user_id uuid, p_kind text, p_title text, p_body text, p_href text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    return;
  end if;
  -- somebody with no live profile has nowhere to read this
  if not exists (select 1 from public.profiles p where p.id = p_user_id and p.deleted_at is null) then
    return;
  end if;
  insert into public.notifications (user_id, kind, title, body, href, created_by, updated_by)
  values (p_user_id, p_kind, left(trim(p_title), 160), left(nullif(trim(coalesce(p_body, '')), ''), 300), p_href, auth.uid(), auth.uid());
exception
  -- a notification must never be the reason a booking, a payment or a consent
  -- record fails; the fact is what matters, the line on the screen is not
  when others then
    return;
end;
$$;
revoke execute on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;

-- everybody who runs a business: an owner reads what happens to it
create or replace function public.notify_tenant_owners(p_tenant_id uuid, p_kind text, p_title text, p_body text, p_href text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  for v_user in
    select m.user_id from public.tenant_members m
      where m.tenant_id = p_tenant_id and m.member_role = 'owner' and m.deleted_at is null
  loop
    perform public.notify(v_user, p_kind, p_title, p_body, p_href);
  end loop;
end;
$$;
revoke execute on function public.notify_tenant_owners(uuid, text, text, text, text) from public, anon, authenticated;

-- ── the triggers, one per fact ───────────────────────────────────────────────

-- a person is asked onto a class, and the answer comes back (Step 11)
create or replace function public.notify_class_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class public.classes;
  v_tenant text;
  v_who text;
  v_role text;
begin
  select * into v_class from public.classes c where c.id = new.class_id;
  select t.name into v_tenant from public.tenants t where t.id = new.tenant_id;
  select p.full_name into v_who from public.profiles p where p.id = new.user_id;
  v_role := case new.kind when 'artist' then 'the artist taking' else 'an assistant on' end;

  if tg_op = 'INSERT' and new.status = 'asked' then
    perform public.notify(new.user_id, 'people',
      coalesce(v_tenant, 'A studio') || ' wants you as ' || v_role || ' ' || coalesce(v_class.title, 'a class'),
      'Confirm or reject it in your Inbox — it stays a draft until you do.', '/inbox');
  elsif tg_op = 'UPDATE' and old.status = 'asked' and new.status in ('confirmed', 'rejected') then
    perform public.notify_tenant_owners(new.tenant_id, 'people',
      coalesce(v_who, 'Somebody') || (case new.status when 'confirmed' then ' confirmed ' else ' said no to ' end) || coalesce(v_class.title, 'a class'),
      case new.status when 'confirmed' then 'It can go on Discover now.' else 'Their name has been taken off it — assign somebody else.' end,
      '/c/' || coalesce(v_class.share_slug, ''));
  end if;
  return null;
end;
$$;
revoke execute on function public.notify_class_claim() from public, anon, authenticated;
create trigger notify_class_claim
  after insert or update of status on public.class_claims
  for each row execute function public.notify_class_claim();

-- a seat is booked, and a waitlisted seat is offered (Steps 4 and 10)
create or replace function public.notify_enrollment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class public.classes;
  v_who text;
begin
  select * into v_class from public.classes c where c.id = new.class_id;
  select p.full_name into v_who from public.profiles p where p.id = new.user_id;

  if tg_op = 'INSERT' then
    perform public.notify_tenant_owners(new.tenant_id, 'booking',
      coalesce(v_who, 'Somebody') || (case new.status when 'waitlisted' then ' joined the waitlist for ' else ' booked ' end) || coalesce(v_class.title, 'a class'),
      null, '/business/' || new.tenant_id::text || '/classes');
  elsif tg_op = 'UPDATE' and old.status = 'waitlisted' and new.status = 'enrolled' then
    -- THE WAITLIST IS TOLD, OR IT IS NOT A WAITLIST (13647)
    perform public.notify(new.user_id, 'class',
      'A place opened in ' || coalesce(v_class.title, 'a class'),
      'You were first on the waitlist and the seat is yours.',
      '/c/' || coalesce(v_class.share_slug, ''));
  end if;
  return null;
end;
$$;
revoke execute on function public.notify_enrollment() from public, anon, authenticated;
create trigger notify_enrollment
  after insert or update of status on public.enrollments
  for each row execute function public.notify_enrollment();

-- money: a refund asked for and decided (Steps 9 and 13b), a payout settled (Step 13)
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

  if tg_op = 'INSERT' and new.status = 'requested' then
    perform public.notify_tenant_owners(new.tenant_id, 'money',
      coalesce(v_who, 'Somebody') || ' asked for a refund — ₹' || new.amount_inr::text,
      coalesce(v_class.title, 'A class') || ' · your call, inside the policy window.',
      '/c/' || coalesce(v_class.share_slug, ''));
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
create trigger notify_refund
  after insert or update of status on public.refunds
  for each row execute function public.notify_refund();

create or replace function public.notify_payout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant text;
begin
  select t.name into v_tenant from public.tenants t where t.id = new.tenant_id;
  perform public.notify(new.user_id, 'money',
    coalesce(v_tenant, 'A studio') || ' paid you ₹' || new.amount_inr::text,
    case new.status when 'done' then 'Recorded as settled.' else 'Recorded as ' || new.status || '.' end,
    '/earnings');
  return null;
end;
$$;
revoke execute on function public.notify_payout() from public, anon, authenticated;
create trigger notify_payout
  after insert on public.payouts
  for each row execute function public.notify_payout();

-- enquiries: one arrives, and it is quoted (Step 18)
create or replace function public.notify_enquiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_who text;
begin
  select p.full_name into v_who from public.profiles p where p.id = new.from_user_id;
  perform public.notify_tenant_owners(new.tenant_id, 'enquiry',
    coalesce(v_who, 'Somebody') || ' sent an enquiry',
    left(new.message, 120), '/inbox/enquiries/' || new.id::text);
  return null;
end;
$$;
revoke execute on function public.notify_enquiry() from public, anon, authenticated;
create trigger notify_enquiry
  after insert on public.enquiries
  for each row execute function public.notify_enquiry();

create or replace function public.notify_enquiry_quote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enq public.enquiries;
  v_tenant text;
begin
  select * into v_enq from public.enquiries e where e.id = new.enquiry_id;
  select t.name into v_tenant from public.tenants t where t.id = v_enq.tenant_id;
  if new.status = 'sent' then
    perform public.notify(v_enq.from_user_id, 'enquiry',
      coalesce(v_tenant, 'A studio') || ' quoted ₹' || new.cost_inr::text,
      'Accept it or decline it on the enquiry.', '/inbox/enquiries/' || v_enq.id::text);
  end if;
  return null;
end;
$$;
revoke execute on function public.notify_enquiry_quote() from public, anon, authenticated;
create trigger notify_enquiry_quote
  after insert on public.enquiry_quotes
  for each row execute function public.notify_enquiry_quote();

-- events: a seat sold, an entry registered (Step 21)
create or replace function public.notify_event_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_who text;
begin
  select * into v_event from public.events e where e.id = new.event_id;
  select p.full_name into v_who from public.profiles p where p.id = new.user_id;

  if tg_op = 'INSERT' then
    perform public.notify_tenant_owners(new.tenant_id, 'event',
      case new.kind
        when 'spectator' then coalesce(v_who, 'Somebody') || ' booked ' || new.qty::text || (case when new.qty = 1 then ' ticket — ' else ' tickets — ' end) || coalesce(v_event.title, 'your event')
        else coalesce(new.entrant_name, v_who, 'Somebody') || ' entered ' || coalesce(v_event.title, 'your event') end,
      null, '/business/' || new.tenant_id::text || '/events/' || new.event_id::text);
    -- the duet partner is asked, and the entry stands either way (Step 22)
    if new.partner_id is not null and new.partner_status = 'asked' then
      perform public.notify(new.partner_id, 'event',
        coalesce(v_who, 'Somebody') || ' entered ' || coalesce(v_event.title, 'an event') || ' with you',
        'Their entry holds either way — this decides whether the organiser sees you as confirmed.', '/inbox');
    end if;
  elsif tg_op = 'UPDATE' and coalesce(old.partner_status, '') = 'asked' and new.partner_status in ('confirmed', 'rejected') then
    select p.full_name into v_who from public.profiles p where p.id = new.partner_id;
    perform public.notify(new.user_id, 'event',
      coalesce(v_who, 'Your partner') || (case new.partner_status when 'confirmed' then ' confirmed your duet' else ' cannot dance the duet' end),
      coalesce(v_event.title, 'The event') || case new.partner_status when 'rejected' then ' — find another partner.' else '' end,
      '/e/' || coalesce(v_event.share_slug, ''));
  end if;
  return null;
end;
$$;
revoke execute on function public.notify_event_booking() from public, anon, authenticated;
create trigger notify_event_booking
  after insert or update of partner_status on public.event_bookings
  for each row execute function public.notify_event_booking();

-- crews: an ask, and its answer (Step 22)
create or replace function public.notify_crew_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_crew public.crews;
  v_who text;
begin
  select * into v_crew from public.crews c where c.id = new.crew_id;
  select p.full_name into v_who from public.profiles p where p.id = new.user_id;

  if tg_op = 'INSERT' and new.status = 'asked' then
    perform public.notify(new.user_id, 'people',
      coalesce(v_crew.name, 'A crew') || ' wants you on the roster',
      'A crew roster is a public page — confirm it in your Inbox.', '/inbox');
  elsif tg_op = 'UPDATE' and old.status = 'asked' and new.status in ('confirmed', 'rejected') then
    perform public.notify(v_crew.leader_id, 'people',
      coalesce(v_who, 'Somebody') || (case new.status when 'confirmed' then ' joined ' else ' said no to ' end) || coalesce(v_crew.name, 'the crew'),
      null, '/crews/' || new.crew_id::text || '/manage');
  end if;
  return null;
end;
$$;
revoke execute on function public.notify_crew_member() from public, anon, authenticated;
create trigger notify_crew_member
  after insert or update of status on public.crew_members
  for each row execute function public.notify_crew_member();

-- ── reads and writes for the screen ──────────────────────────────────────────

-- the prefs row is made on first read, so a person always has one
create or replace function public.my_notification_prefs()
returns public.notification_prefs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.notification_prefs;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_row from public.notification_prefs p where p.user_id = v_user;
  if not found then
    insert into public.notification_prefs (user_id, created_by, updated_by)
    values (v_user, v_user, v_user)
    on conflict (user_id) do nothing;
    select * into v_row from public.notification_prefs p where p.user_id = v_user;
  end if;
  return v_row;
end;
$$;
revoke execute on function public.my_notification_prefs() from public, anon;
grant execute on function public.my_notification_prefs() to authenticated;

create or replace function public.set_notification_prefs(p_kinds jsonb, p_push boolean, p_whatsapp boolean, p_email boolean)
returns public.notification_prefs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.notification_prefs;
  v_key text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  -- only the six kinds, only booleans: a preference this app cannot act on is
  -- not a preference it should store
  if p_kinds is not null then
    for v_key in select jsonb_object_keys(p_kinds) loop
      if v_key not in ('enquiry', 'booking', 'money', 'people', 'event', 'class') then
        raise exception 'unknown notification kind: %', v_key;
      end if;
      if jsonb_typeof(p_kinds -> v_key) <> 'boolean' then
        raise exception 'a switch is on or off';
      end if;
    end loop;
  end if;

  perform public.my_notification_prefs();
  update public.notification_prefs set
    kinds = coalesce(p_kinds, kinds),
    push = coalesce(p_push, push),
    whatsapp = coalesce(p_whatsapp, whatsapp),
    email = coalesce(p_email, email),
    updated_by = v_user
  where user_id = v_user
  returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.set_notification_prefs(jsonb, boolean, boolean, boolean) from public, anon;
grant execute on function public.set_notification_prefs(jsonb, boolean, boolean, boolean) to authenticated;

-- Mark read / Clear, one row or a whole kind (13771-13776). Every one of these
-- is scoped to auth.uid() inside the function: a person can only ever touch
-- their own notifications, whatever they pass.
create or replace function public.mark_notifications_read(p_ids uuid[] default null, p_kind text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_n integer;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  with touched as (
    update public.notifications set read_at = now(), updated_by = v_user
    where user_id = v_user and deleted_at is null and read_at is null
      and (p_ids is null or id = any (p_ids))
      and (p_kind is null or kind = p_kind)
    returning 1
  )
  select count(*) into v_n from touched;
  return v_n;
end;
$$;
revoke execute on function public.mark_notifications_read(uuid[], text) from public, anon;
grant execute on function public.mark_notifications_read(uuid[], text) to authenticated;

create or replace function public.clear_notifications(p_ids uuid[] default null, p_kind text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_n integer;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_ids is null and p_kind is null then
    raise exception 'say which notifications to clear';
  end if;
  with touched as (
    update public.notifications set deleted_at = now(), updated_by = v_user
    where user_id = v_user and deleted_at is null
      and (p_ids is null or id = any (p_ids))
      and (p_kind is null or kind = p_kind)
    returning 1
  )
  select count(*) into v_n from touched;
  return v_n;
end;
$$;
revoke execute on function public.clear_notifications(uuid[], text) from public, anon;
grant execute on function public.clear_notifications(uuid[], text) to authenticated;

-- the bell's badge: one number, the caller's own, cheap enough for every page
create or replace function public.my_unread_notifications()
returns integer
language sql
security definer
set search_path = ''
stable
as $$
  select count(*)::integer from public.notifications n
  where n.user_id = auth.uid() and n.deleted_at is null and n.read_at is null;
$$;
revoke execute on function public.my_unread_notifications() from public, anon;
grant execute on function public.my_unread_notifications() to authenticated;
