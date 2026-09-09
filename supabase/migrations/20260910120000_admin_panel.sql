-- The admin panel, phase 1: support, trust, accountability (10 Sep 2026)
-- ⚠ Rule 9: auth + RLS.
--
-- The user's ask: an organization waiting on verification must SEE where it
-- stands, read a rejection, and be able to TALK to the admin; the admin must be
-- able to start that conversation too, and the panel must be a real admin panel
-- rather than one Approve button. This is the first phase — support and trust:
--
--   1. `admin_audit` — every platform-level decision, insert-only, unforgeable.
--      An admin who approves, rejects, suspends or closes leaves a record with
--      a reason. Nobody, admin included, can edit or delete a row.
--   2. `support_threads` / `support_messages` — one conversation between an
--      account and DanceOS. Either side opens it; a verification thread carries
--      its request id, so "why was I rejected" is a reply in context. Both
--      sides' unread counts come off two read stamps, not a counter to drift.
--   3. `profiles.suspended_at` — the reversible sanction that belongs BEFORE
--      delete. A suspended account can sign in and read, and is refused every
--      act that touches somebody else (the guard already hung on eight tables).
--   4. `admin_dashboard()` — the platform's pulse in one call: what is waiting
--      on an admin, what exists, what moved this week, what is stuck.
--
-- Later phases: accounts, businesses, moderation (`reports`), money oversight,
-- announcements, settings.

-- ── 1. the audit log ────────────────────────────────────────────────────────
create table public.admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users (id),
  -- a verb.noun the panel can filter on: org.approve, account.suspend, …
  action text not null check (char_length(action) between 3 and 60),
  subject_kind text not null check (subject_kind in ('profile', 'tenant', 'request', 'thread')),
  subject_id uuid,
  -- the subject's NAME at the time: the log must still read after a deletion
  subject_label text check (subject_label is null or char_length(subject_label) <= 140),
  reason text check (reason is null or char_length(reason) <= 500),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
comment on table public.admin_audit is
  'Every platform-level decision an admin makes: who, what, to whom, why, when. Insert-only and immutable by anybody — the whole point is that it cannot be tidied afterwards.';

create index admin_audit_created_idx on public.admin_audit (created_at desc);
create index admin_audit_subject_idx on public.admin_audit (subject_kind, subject_id);
create index admin_audit_actor_idx on public.admin_audit (actor_id);

alter table public.admin_audit enable row level security;

create policy "admins read the audit log"
  on public.admin_audit for select
  to authenticated
  using (public.is_platform_admin());
-- no insert / update / delete policies: only the definer functions below write it

/** A log that can be edited is not a log. Even the service role is refused —
 *  a migration that needs to correct history should say so in a new row. */
create or replace function public.guard_admin_audit_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'the audit log is insert-only — a correction is a new row';
end;
$$;
revoke execute on function public.guard_admin_audit_immutable() from public, anon, authenticated;

create trigger admin_audit_immutable
  before update or delete on public.admin_audit
  for each row execute function public.guard_admin_audit_immutable();

/** The one writer. SECURITY DEFINER, and no grant to anybody: it is called
 *  from inside the admin RPCs below, never from a client. */
create or replace function public.log_admin_action(
  p_action text,
  p_subject_kind text,
  p_subject_id uuid,
  p_subject_label text,
  p_reason text default null,
  p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.admin_audit (actor_id, action, subject_kind, subject_id, subject_label, reason, detail)
  values (coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid), p_action, p_subject_kind, p_subject_id,
          left(coalesce(p_subject_label, ''), 140), nullif(btrim(coalesce(p_reason, '')), ''), coalesce(p_detail, '{}'::jsonb));
end;
$$;
revoke execute on function public.log_admin_action(text, text, uuid, text, text, jsonb) from public, anon, authenticated;

-- ── 2. support threads ──────────────────────────────────────────────────────
create table public.support_threads (
  id uuid primary key default gen_random_uuid(),
  -- the account DanceOS is talking to (never an admin: an admin is the other side)
  account_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 140),
  kind text not null default 'general' check (kind in ('general', 'verification')),
  -- a verification thread carries its request, so a rejection has its reply in context
  request_id uuid references public.org_verification_requests (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_by_admin boolean not null default false,
  last_message_at timestamptz not null default now(),
  -- unread is derived from these two, so no counter can drift
  account_read_at timestamptz,
  admin_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);
comment on table public.support_threads is
  'One conversation between an account and DanceOS. Either side opens it; a verification thread names the request it is about. Unread is derived from account_read_at / admin_read_at, never stored as a count.';

create index support_threads_account_idx on public.support_threads (account_id) where deleted_at is null;
create index support_threads_status_idx on public.support_threads (status, last_message_at desc) where deleted_at is null;

create trigger support_threads_set_updated_at
  before update on public.support_threads
  for each row execute function public.set_updated_at();

alter table public.support_threads enable row level security;

create policy "an account reads its own threads"
  on public.support_threads for select
  to authenticated
  using (deleted_at is null and account_id = auth.uid());

create policy "admins read every thread"
  on public.support_threads for select
  to authenticated
  using (deleted_at is null and public.is_platform_admin());
-- no write policies: the RPCs below are the only doors

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  -- stamped at write time: an admin who is later removed still shows as DanceOS
  from_admin boolean not null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);
comment on table public.support_messages is
  'One message on a support thread. from_admin is stamped when it is written, so the transcript still reads correctly after an admin is removed.';

create index support_messages_thread_idx on public.support_messages (thread_id, created_at) where deleted_at is null;

create trigger support_messages_set_updated_at
  before update on public.support_messages
  for each row execute function public.set_updated_at();

alter table public.support_messages enable row level security;

create policy "whoever reads the thread reads its messages"
  on public.support_messages for select
  to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.support_threads t
      where t.id = support_messages.thread_id and t.deleted_at is null
        and (t.account_id = auth.uid() or public.is_platform_admin())
    )
  );

-- ── 3. suspension: the reversible sanction ──────────────────────────────────
alter table public.profiles add column suspended_at timestamptz;
alter table public.profiles add column suspended_reason text
  check (suspended_reason is null or char_length(suspended_reason) <= 300);
comment on column public.profiles.suspended_at is
  'Set by a platform admin: the account may sign in and read, and is refused every act that touches somebody else. Reversible, and what you want instead of a delete.';

/** Suspension gets its OWN guard rather than joining the tick's.
 *  `guard_verified_at` is hung `before update of verified_at` on BOTH profiles
 *  and tenants: it would never fire for a suspension (wrong column list), and
 *  `tenants` has no suspended_at to read. So: a separate function, a separate
 *  trigger, named on the two suspension columns, on profiles only. */
create or replace function public.guard_suspension()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role' then
    return new;
  end if;
  if public.is_platform_admin() then
    return new;
  end if;
  if new.suspended_at is distinct from old.suspended_at
     or new.suspended_reason is distinct from old.suspended_reason then
    raise exception 'only DanceOS suspends an account';
  end if;
  return new;
end;
$$;
comment on function public.guard_suspension() is
  'Trigger: suspended_at and suspended_reason move only under the service role or a platform admin (10 Sep 2026).';
revoke execute on function public.guard_suspension() from public, anon, authenticated;

create trigger profiles_guard_suspension
  before update of suspended_at, suspended_reason on public.profiles
  for each row execute function public.guard_suspension();

/** guard_person_only, extended: the person's seat is also refused to a
 *  SUSPENDED account. It already hangs on enrollments, orders, event_bookings,
 *  crews, crew_members, enquiries, class_claims and tenant_members, so one
 *  change closes every act that touches somebody else. */
create or replace function public.guard_person_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_col text := tg_argv[0];
  v_what text := tg_argv[1];
  v_id uuid;
  v_role text;
  v_suspended timestamptz;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role' then
    return new;
  end if;
  v_id := (to_jsonb(new) ->> v_col)::uuid;
  if v_id is null then
    return new;
  end if;
  select p.role, p.suspended_at into v_role, v_suspended from public.profiles p where p.id = v_id;
  if v_suspended is not null then
    raise exception 'this account is suspended — write to DanceOS from your hub';
  end if;
  -- an organization OWNS its studios: the owner row is the one membership it holds
  if tg_table_name = 'tenant_members' and (to_jsonb(new) ->> 'member_role') = 'owner' then
    return new;
  end if;
  if v_role = 'org' then
    raise exception 'an organization account cannot %', v_what;
  end if;
  return new;
end;
$$;
comment on function public.guard_person_only() is
  'Trigger: refuses a SUSPENDED account outright, and an organization account where a person belongs (bookings, orders, event bookings, crews, rosters, enquiries, class jobs, trainer/staff seats). Service role exempt.';
revoke execute on function public.guard_person_only() from public, anon, authenticated;

/** A suspended organization does not open studios either, and a suspended
 *  account does not ask to be verified. Both doors already check the role;
 *  this adds the one line each, without reproducing their bodies. */
create or replace function public.guard_not_suspended()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role' then
    return new;
  end if;
  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.suspended_at is not null) then
    raise exception 'this account is suspended — write to DanceOS from your hub';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_not_suspended() from public, anon, authenticated;

create trigger tenants_not_suspended
  before insert on public.tenants
  for each row execute function public.guard_not_suspended();
create trigger classes_not_suspended
  before insert on public.classes
  for each row execute function public.guard_not_suspended();
create trigger events_not_suspended
  before insert on public.events
  for each row execute function public.guard_not_suspended();
create trigger org_verification_requests_not_suspended
  before insert on public.org_verification_requests
  for each row execute function public.guard_not_suspended();

create or replace function public.admin_suspend_account(p_account_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'say why in a sentence — the account reads it, and so does the log';
  end if;
  if p_account_id = auth.uid() then
    raise exception 'you cannot suspend yourself';
  end if;
  if exists (select 1 from public.platform_admins a where a.user_id = p_account_id and a.deleted_at is null) then
    raise exception 'that is a platform admin — remove the admin row first';
  end if;
  select p.full_name into v_name from public.profiles p where p.id = p_account_id and p.deleted_at is null;
  if v_name is null then
    raise exception 'no such account';
  end if;
  update public.profiles
     set suspended_at = now(), suspended_reason = btrim(p_reason), updated_by = auth.uid()
   where id = p_account_id;
  -- every studio it owns goes dark while it is suspended
  update public.tenants t
     set visibility = 'unlisted', updated_by = auth.uid()
   where t.deleted_at is null and t.visibility = 'listed'
     and exists (select 1 from public.tenant_members m
                  where m.tenant_id = t.id and m.user_id = p_account_id
                    and m.member_role = 'owner' and m.deleted_at is null);
  perform public.notify(p_account_id, 'people', 'Your account is suspended',
    btrim(p_reason) || ' — reply from your hub and a DanceOS admin will read it.', '/support');
  perform public.log_admin_action('account.suspend', 'profile', p_account_id, v_name, p_reason, '{}'::jsonb);
end;
$$;
comment on function public.admin_suspend_account(uuid, text) is
  'Suspend an account, with a reason it reads back. Unlists every studio it owns. Refuses another admin and yourself. Audited.';
revoke execute on function public.admin_suspend_account(uuid, text) from public, anon;
grant execute on function public.admin_suspend_account(uuid, text) to authenticated;

create or replace function public.admin_unsuspend_account(p_account_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin';
  end if;
  select p.full_name into v_name from public.profiles p where p.id = p_account_id and p.deleted_at is null;
  if v_name is null then
    raise exception 'no such account';
  end if;
  update public.profiles
     set suspended_at = null, suspended_reason = null, updated_by = auth.uid()
   where id = p_account_id;
  -- a verified organization's studios come back; an unverified one's stay dark
  update public.tenants t
     set visibility = 'listed', updated_by = auth.uid()
   where t.deleted_at is null and t.type = 'studio' and t.visibility = 'unlisted'
     and public.tenant_owner_verified(t.id)
     and exists (select 1 from public.tenant_members m
                  where m.tenant_id = t.id and m.user_id = p_account_id
                    and m.member_role = 'owner' and m.deleted_at is null);
  perform public.notify(p_account_id, 'people', 'Your account is active again',
    coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Everything works as before.'), '/');
  perform public.log_admin_action('account.unsuspend', 'profile', p_account_id, v_name, p_note, '{}'::jsonb);
end;
$$;
comment on function public.admin_unsuspend_account(uuid, text) is
  'Lift a suspension. A verified organization''s studios go public again; an unverified one''s stay dark. Audited.';
revoke execute on function public.admin_unsuspend_account(uuid, text) from public, anon;
grant execute on function public.admin_unsuspend_account(uuid, text) to authenticated;

-- ── 4. the conversation ─────────────────────────────────────────────────────
/** The account writes first. An admin-only account has no profile and so has
 *  no side to write from — it uses admin_open_support_thread instead. */
create or replace function public.open_support_thread(
  p_subject text,
  p_body text,
  p_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_thread uuid;
  v_kind text := 'general';
  v_open integer;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select p.full_name into v_name from public.profiles p where p.id = v_user and p.deleted_at is null;
  if v_name is null then
    raise exception 'finish onboarding first';
  end if;
  if p_subject is null or char_length(btrim(p_subject)) < 1 then
    raise exception 'give it a subject';
  end if;
  if p_body is null or char_length(btrim(p_body)) < 1 then
    raise exception 'write your message';
  end if;
  if char_length(p_body) > 4000 then
    raise exception 'a message is at most 4000 characters';
  end if;
  -- an open thread per account keeps the queue honest; five is plenty
  select count(*) into v_open from public.support_threads t
    where t.account_id = v_user and t.status = 'open' and t.deleted_at is null;
  if v_open >= 5 then
    raise exception 'you already have 5 open conversations — continue one of those';
  end if;
  if p_request_id is not null then
    if not exists (select 1 from public.org_verification_requests r
                    where r.id = p_request_id and r.org_id = v_user and r.deleted_at is null) then
      raise exception 'that is not your verification request';
    end if;
    v_kind := 'verification';
  end if;

  insert into public.support_threads (account_id, subject, kind, request_id, opened_by_admin, last_message_at, account_read_at)
  values (v_user, btrim(p_subject), v_kind, p_request_id, false, now(), now())
  returning id into v_thread;

  insert into public.support_messages (thread_id, author_id, from_admin, body)
  values (v_thread, v_user, false, btrim(p_body));

  perform public.notify_platform_admins('people',
    v_name || ' wrote to DanceOS',
    left(btrim(p_body), 140),
    '/admin/support/' || v_thread::text);
  return v_thread;
end;
$$;
comment on function public.open_support_thread(text, text, uuid) is
  'An account opens a conversation with DanceOS. Pass a verification request id to hang it on that decision. At most 5 open threads per account.';
revoke execute on function public.open_support_thread(text, text, uuid) from public, anon;
grant execute on function public.open_support_thread(text, text, uuid) to authenticated;

/** The admin writes first — the onboarding nudge the user asked for. */
create or replace function public.admin_open_support_thread(
  p_account_id uuid,
  p_subject text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_thread uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin';
  end if;
  select p.full_name into v_name from public.profiles p where p.id = p_account_id and p.deleted_at is null;
  if v_name is null then
    raise exception 'no such account';
  end if;
  if p_subject is null or char_length(btrim(p_subject)) < 1 then
    raise exception 'give it a subject';
  end if;
  if p_body is null or char_length(btrim(p_body)) < 1 then
    raise exception 'write your message';
  end if;
  if char_length(p_body) > 4000 then
    raise exception 'a message is at most 4000 characters';
  end if;

  insert into public.support_threads (account_id, subject, kind, opened_by_admin, last_message_at, admin_read_at)
  values (p_account_id, btrim(p_subject), 'general', true, now(), now())
  returning id into v_thread;

  insert into public.support_messages (thread_id, author_id, from_admin, body)
  values (v_thread, v_user, true, btrim(p_body));

  perform public.notify(p_account_id, 'people', 'DanceOS sent you a message',
    left(btrim(p_body), 140), '/support/' || v_thread::text);
  perform public.log_admin_action('support.open', 'thread', v_thread, v_name, null,
    jsonb_build_object('subject', btrim(p_subject)));
  return v_thread;
end;
$$;
comment on function public.admin_open_support_thread(uuid, text, text) is
  'A platform admin opens a conversation with an account — the onboarding nudge. Audited.';
revoke execute on function public.admin_open_support_thread(uuid, text, text) from public, anon;
grant execute on function public.admin_open_support_thread(uuid, text, text) to authenticated;

/** Either side replies. Who you are decides which side the message lands on
 *  and who gets told; the account replying reopens a closed thread. */
create or replace function public.post_support_message(p_thread_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_admin boolean;
  v_thread public.support_threads;
  v_name text;
  v_message uuid;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_body is null or char_length(btrim(p_body)) < 1 then
    raise exception 'write your message';
  end if;
  if char_length(p_body) > 4000 then
    raise exception 'a message is at most 4000 characters';
  end if;
  v_admin := public.is_platform_admin();
  select * into v_thread from public.support_threads t
    where t.id = p_thread_id and t.deleted_at is null;
  if not found then
    raise exception 'no such conversation';
  end if;
  if not v_admin and v_thread.account_id <> v_user then
    raise exception 'that is not your conversation';
  end if;

  insert into public.support_messages (thread_id, author_id, from_admin, body)
  values (p_thread_id, v_user, v_admin, btrim(p_body))
  returning id into v_message;

  update public.support_threads t
     set last_message_at = now(),
         updated_by = v_user,
         status = case when not v_admin then 'open' else t.status end,
         admin_read_at = case when v_admin then now() else t.admin_read_at end,
         account_read_at = case when v_admin then t.account_read_at else now() end
   where t.id = p_thread_id;

  if v_admin then
    perform public.notify(v_thread.account_id, 'people', 'DanceOS replied',
      left(btrim(p_body), 140), '/support/' || p_thread_id::text);
  else
    select p.full_name into v_name from public.profiles p where p.id = v_user;
    perform public.notify_platform_admins('people',
      coalesce(v_name, 'An account') || ' replied',
      left(btrim(p_body), 140),
      '/admin/support/' || p_thread_id::text);
  end if;
  return v_message;
end;
$$;
comment on function public.post_support_message(uuid, text) is
  'Reply on a support thread. The caller''s side is decided by is_platform_admin(); an account replying reopens a closed thread. The other side is notified.';
revoke execute on function public.post_support_message(uuid, text) from public, anon;
grant execute on function public.post_support_message(uuid, text) to authenticated;

create or replace function public.mark_support_read(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_admin boolean;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  v_admin := public.is_platform_admin();
  update public.support_threads t
     set account_read_at = case when v_admin then t.account_read_at else now() end,
         admin_read_at = case when v_admin then now() else t.admin_read_at end
   where t.id = p_thread_id and t.deleted_at is null
     and (v_admin or t.account_id = v_user);
end;
$$;
revoke execute on function public.mark_support_read(uuid) from public, anon;
grant execute on function public.mark_support_read(uuid) to authenticated;

create or replace function public.set_support_thread_status(p_thread_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin';
  end if;
  if p_status not in ('open', 'closed') then
    raise exception 'a thread is open or closed';
  end if;
  select p.full_name into v_name
    from public.support_threads t join public.profiles p on p.id = t.account_id
   where t.id = p_thread_id and t.deleted_at is null;
  if v_name is null then
    raise exception 'no such conversation';
  end if;
  update public.support_threads t
     set status = p_status, updated_by = auth.uid(), admin_read_at = now()
   where t.id = p_thread_id;
  perform public.log_admin_action('support.' || p_status, 'thread', p_thread_id, v_name, null, '{}'::jsonb);
end;
$$;
revoke execute on function public.set_support_thread_status(uuid, text) from public, anon;
grant execute on function public.set_support_thread_status(uuid, text) to authenticated;

/** One list for both sides: an admin gets every thread, an account its own,
 *  each with the unread count for the caller's side and the last line. */
create or replace function public.support_thread_list()
returns table (
  id uuid,
  account_id uuid,
  account_name text,
  account_role text,
  account_avatar_path text,
  subject text,
  kind text,
  status text,
  request_id uuid,
  last_message_at timestamptz,
  last_body text,
  last_from_admin boolean,
  unread integer,
  messages integer,
  created_at timestamptz
)
language sql
security invoker
set search_path = ''
stable
as $$
  select t.id, t.account_id, p.full_name, p.role, p.avatar_path,
         t.subject, t.kind, t.status, t.request_id, t.last_message_at,
         (select m.body from public.support_messages m
           where m.thread_id = t.id and m.deleted_at is null
           order by m.created_at desc limit 1),
         (select m.from_admin from public.support_messages m
           where m.thread_id = t.id and m.deleted_at is null
           order by m.created_at desc limit 1),
         (select count(*)::int from public.support_messages m
           where m.thread_id = t.id and m.deleted_at is null
             and m.from_admin <> (t.account_id <> auth.uid())
             and m.created_at > coalesce(
                   case when t.account_id = auth.uid() then t.account_read_at else t.admin_read_at end,
                   '-infinity'::timestamptz)),
         (select count(*)::int from public.support_messages m where m.thread_id = t.id and m.deleted_at is null),
         t.created_at
  from public.support_threads t
  join public.profiles p on p.id = t.account_id
  where t.deleted_at is null
  order by (t.status = 'open') desc, t.last_message_at desc;
$$;
comment on function public.support_thread_list() is
  'Both sides'' thread list. SECURITY INVOKER, so RLS decides what comes back: an admin sees every thread, an account only its own. Unread counts the OTHER side''s messages since the caller last read.';
revoke execute on function public.support_thread_list() from public, anon;
grant execute on function public.support_thread_list() to authenticated;

-- ── 5. a verification decision leaves a record, and reaches the thread ──────
/** decide_org_verification is not reproduced here — this trigger records what
 *  it did, and posts the reason into the organization's verification thread so
 *  the answer lands where the conversation is. */
create or replace function public.audit_org_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_thread uuid;
begin
  select p.full_name into v_name from public.profiles p where p.id = new.org_id;
  perform public.log_admin_action(
    case when new.status = 'approved' then 'org.approve' else 'org.reject' end,
    'request', new.id, v_name, new.note,
    jsonb_build_object('org_id', new.org_id, 'status', new.status));

  select t.id into v_thread from public.support_threads t
    where t.request_id = new.id and t.deleted_at is null
    order by t.created_at limit 1;
  if v_thread is not null then
    insert into public.support_messages (thread_id, author_id, from_admin, body)
    values (v_thread, coalesce(new.decided_by, auth.uid(), new.org_id), true,
            case when new.status = 'approved'
                 then 'Approved — your studios are live on Discover now.'
                 else 'Not approved. ' || coalesce(nullif(btrim(coalesce(new.note, '')), ''), 'Update your links and ask again from your hub.') end);
    update public.support_threads t set last_message_at = now(), status = 'open' where t.id = v_thread;
  end if;
  return null;
end;
$$;
revoke execute on function public.audit_org_verification() from public, anon, authenticated;

create trigger audit_org_verification
  after update of status on public.org_verification_requests
  for each row when (old.status = 'pending' and new.status in ('approved', 'rejected'))
  execute function public.audit_org_verification();

-- ── 6. the dashboard ────────────────────────────────────────────────────────
/** The platform's pulse in one call: what is waiting on an admin, what exists,
 *  what moved in the last seven days, and what is stuck. Admin only — every
 *  number here is aggregate, but they add up to a picture of the business. */
create or replace function public.admin_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v jsonb;
  v_week timestamptz := now() - interval '7 days';
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin';
  end if;
  select jsonb_build_object(
    'waiting', jsonb_build_object(
      'verifications', (select count(*) from public.org_verification_requests r where r.status = 'pending' and r.deleted_at is null),
      'threads', (select count(*) from public.support_threads t where t.status = 'open' and t.deleted_at is null
                   and exists (select 1 from public.support_messages m where m.thread_id = t.id and m.deleted_at is null
                                and not m.from_admin and m.created_at > coalesce(t.admin_read_at, '-infinity'::timestamptz))),
      'refunds', (select count(*) from public.refunds r where r.status in ('requested', 'pending') and r.deleted_at is null),
      'stuck_webhooks', (select count(*) from public.webhook_events w where w.processed_at is null)
    ),
    'accounts', jsonb_build_object(
      'users', (select count(*) from public.profiles p where p.role = 'user' and p.deleted_at is null and p.suspended_at is null),
      'orgs', (select count(*) from public.profiles p where p.role = 'org' and p.deleted_at is null and p.suspended_at is null),
      'artists', (select count(*) from public.artist_plans a where a.ended_at is null and a.until >= (now() at time zone 'Asia/Kolkata')::date),
      'verified_orgs', (select count(*) from public.profiles p where p.role = 'org' and p.verified_at is not null and p.deleted_at is null),
      'suspended', (select count(*) from public.profiles p where p.suspended_at is not null and p.deleted_at is null),
      'admins', (select count(*) from public.platform_admins a where a.deleted_at is null),
      'new_this_week', (select count(*) from public.profiles p where p.created_at >= v_week and p.deleted_at is null)
    ),
    'businesses', jsonb_build_object(
      'studios', (select count(*) from public.tenants t where t.type = 'studio' and t.deleted_at is null),
      'artist_pages', (select count(*) from public.tenants t where t.type = 'trainer_business' and t.deleted_at is null),
      'listed', (select count(*) from public.tenants t where t.visibility = 'listed' and t.deleted_at is null),
      'unlisted', (select count(*) from public.tenants t where t.visibility = 'unlisted' and t.deleted_at is null),
      'rooms', (select count(*) from public.rooms r where r.deleted_at is null)
    ),
    'activity', jsonb_build_object(
      'classes_live', (select count(*) from public.classes c where c.status = 'published' and c.deleted_at is null),
      'events_live', (select count(*) from public.events e where e.status = 'published' and e.deleted_at is null),
      'crews', (select count(*) from public.crews c where c.deleted_at is null),
      'bookings_week', (select count(*) from public.enrollments e where e.created_at >= v_week and e.deleted_at is null),
      'event_bookings_week', (select count(*) from public.event_bookings b where b.created_at >= v_week and b.status = 'booked' and b.deleted_at is null),
      'enquiries_open', (select count(*) from public.enquiries e where e.status not in ('won', 'lost') and e.deleted_at is null)
    ),
    'money', jsonb_build_object(
      'captured_week_inr', (select coalesce(sum(pm.amount_inr), 0) from public.payments pm where pm.status = 'captured' and pm.created_at >= v_week and pm.deleted_at is null),
      'captured_all_inr', (select coalesce(sum(pm.amount_inr), 0) from public.payments pm where pm.status = 'captured' and pm.deleted_at is null),
      'refunded_all_inr', (select coalesce(sum(r.amount_inr), 0) from public.refunds r where r.status = 'processed' and r.deleted_at is null),
      'payouts_pending', (select count(*) from public.payouts p where p.status in ('in_transit', 'on_hold') and p.deleted_at is null),
      'orders_unpaid', (select count(*) from public.orders o where o.status = 'created' and o.created_at < now() - interval '1 hour' and o.deleted_at is null)
    )
  ) into v;
  return v;
end;
$$;
comment on function public.admin_dashboard() is
  'The platform pulse for a platform admin: what is waiting on a decision, what exists, what moved this week, what is stuck. Aggregate only.';
revoke execute on function public.admin_dashboard() from public, anon;
grant execute on function public.admin_dashboard() to authenticated;

/** The audit log, newest first, with the actor named. A definer function
 *  because an admin-only account has no profile to join to. */
create or replace function public.admin_audit_log(p_limit integer default 100, p_action text default null)
returns table (
  id uuid,
  actor_id uuid,
  actor_email text,
  action text,
  subject_kind text,
  subject_id uuid,
  subject_label text,
  reason text,
  detail jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin';
  end if;
  return query
    select a.id, a.actor_id, u.email::text, a.action, a.subject_kind, a.subject_id,
           a.subject_label, a.reason, a.detail, a.created_at
    from public.admin_audit a
    left join auth.users u on u.id = a.actor_id
    where p_action is null or a.action = p_action
    order by a.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;
revoke execute on function public.admin_audit_log(integer, text) from public, anon;
grant execute on function public.admin_audit_log(integer, text) to authenticated;

/** Who the admin can act on: every account, searchable, with what it holds.
 *  Phase 2 gives this its own screen; the support and verification screens
 *  already need it to name an account. */
create or replace function public.admin_accounts(p_q text default null, p_limit integer default 50)
returns table (
  id uuid,
  email text,
  full_name text,
  role text,
  city text,
  avatar_path text,
  verified_at timestamptz,
  suspended_at timestamptz,
  suspended_reason text,
  is_admin boolean,
  has_plan boolean,
  owns integer,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin';
  end if;
  return query
    select p.id, u.email::text, p.full_name, p.role, p.city, p.avatar_path,
           p.verified_at, p.suspended_at, p.suspended_reason,
           exists (select 1 from public.platform_admins a where a.user_id = p.id and a.deleted_at is null),
           exists (select 1 from public.artist_plans ap where ap.user_id = p.id and ap.ended_at is null
                    and ap.until >= (now() at time zone 'Asia/Kolkata')::date),
           (select count(*)::int from public.tenant_members m join public.tenants t on t.id = m.tenant_id
             where m.user_id = p.id and m.member_role = 'owner' and m.deleted_at is null and t.deleted_at is null),
           p.created_at, u.last_sign_in_at
    from public.profiles p
    left join auth.users u on u.id = p.id
    where p.deleted_at is null
      and (p_q is null or btrim(p_q) = ''
           or p.full_name ilike '%' || btrim(p_q) || '%'
           or coalesce(u.email::text, '') ilike '%' || btrim(p_q) || '%'
           or coalesce(p.city, '') ilike '%' || btrim(p_q) || '%')
    order by p.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;
comment on function public.admin_accounts(text, integer) is
  'Every live account for a platform admin: its kind, tick, suspension, plan, how many businesses it owns, and when it last signed in. Searchable by name, email or city.';
revoke execute on function public.admin_accounts(text, integer) from public, anon;
grant execute on function public.admin_accounts(text, integer) to authenticated;
