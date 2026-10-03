-- ⚠ Rule 9: a new table of device addresses, and the database calling out to the
-- app. 3 Oct 2026, the user: "phone push notifications".
--
-- Step 24 (28 Aug) raised every notification WHERE THE FACT HAPPENS, as triggers
-- on the tables that hold the facts, and stored a Push switch it could not act on:
-- "push needs VAPID keys and a service worker". This is the rest of it.
--
--   * `push_subscriptions` — one row per browser/phone a person turned Push on
--     from: the Web Push endpoint and its two keys. Own rows readable, NO write
--     policy: two doors (`save_push_subscription`, `remove_push_subscription`),
--     both scoped to auth.uid() inside, so nobody can register a device as
--     somebody else.
--   * ONE AFTER INSERT trigger on `notifications` that asks the app to send it.
--     ⚠ It is a trigger for Step 24's own reason: every path that writes a
--     notification — an action, an RPC, the Cashfree webhook, a cron — then
--     pushes it too, without any of them knowing push exists.
--     ⚠ It calls out with pg_net, which queues the request and sends it AFTER the
--     transaction commits — so a rolled-back fact pushes nothing, and a slow or
--     dead app can never hold up or fail the insert. It also swallows every error,
--     because a notification must never be the reason a booking fails.
--     ⚠ It calls out ONLY when there is somebody to reach: the person has a live
--     subscription, their Push switch is on, and that kind is on.
--   * WHERE it calls and the shared SECRET live in Supabase Vault
--     (`push_dispatch_url`, `push_dispatch_secret`), never in this file — a
--     migration is committed to git. With either missing the trigger does nothing.
--
-- ⚠ No begin/commit (Rule 18): db push wraps the file already.

create extension if not exists pg_net;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) between 40 and 200),
  auth text not null check (length(auth) between 10 and 100),
  user_agent text check (length(user_agent) <= 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

comment on table public.push_subscriptions is
  'A browser or phone a person turned Push on from (3 Oct 2026): the Web Push endpoint and its keys. Audit columns carry no foreign key (19 Sep 2026).';

create unique index push_subscriptions_live_endpoint on public.push_subscriptions (endpoint) where deleted_at is null;
create index push_subscriptions_user_idx on public.push_subscriptions (user_id) where deleted_at is null;

create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;
create policy "people read their own devices"
  on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

-- a new table arrives with Supabase's default grants (anon included) — say it
revoke all on table public.push_subscriptions from anon, authenticated;
grant select on table public.push_subscriptions to authenticated;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_me and p.deleted_at is null) then
    raise exception 'finish onboarding first';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' then
    raise exception 'that is not a push address';
  end if;
  -- already this person's: nothing to do
  select s.id into v_id from public.push_subscriptions s
   where s.endpoint = p_endpoint and s.user_id = v_me and s.deleted_at is null;
  if found then
    update public.push_subscriptions set p256dh = p_p256dh, auth = p_auth, updated_by = v_me where id = v_id;
    return v_id;
  end if;
  -- ⚠ the same phone signed in as somebody else: the device follows whoever is
  -- signed in on it NOW, so the other account stops being pushed to it
  update public.push_subscriptions set deleted_at = now(), updated_by = v_me
   where endpoint = p_endpoint and deleted_at is null;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, created_by, updated_by)
  values (v_me, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 400), v_me, v_me)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.remove_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.push_subscriptions set deleted_at = now(), updated_by = auth.uid()
   where endpoint = p_endpoint and user_id = auth.uid() and deleted_at is null;
end;
$$;

create or replace function public.push_dispatch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_push boolean;
  v_kind_on boolean;
begin
  if not exists (select 1 from public.push_subscriptions s where s.user_id = new.user_id and s.deleted_at is null) then
    return null;
  end if;
  select coalesce(p.push, true), coalesce((p.kinds ->> new.kind)::boolean, true)
    into v_push, v_kind_on
    from public.notification_prefs p where p.user_id = new.user_id and p.deleted_at is null;
  if coalesce(v_push, true) = false or coalesce(v_kind_on, true) = false then
    return null;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_dispatch_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_dispatch_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 8000
  );
  return null;
exception when others then
  -- a notification must never be the reason the fact it reports fails
  return null;
end;
$$;

create trigger notifications_push_dispatch
  after insert on public.notifications
  for each row execute function public.push_dispatch();

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
revoke all on function public.remove_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated, service_role;
grant execute on function public.remove_push_subscription(text) to authenticated, service_role;
revoke all on function public.push_dispatch() from public, anon, authenticated;
