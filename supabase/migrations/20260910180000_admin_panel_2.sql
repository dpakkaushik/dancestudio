-- The admin panel, phase 2: businesses and moderation (10 Sep 2026)
-- ⚠ Rule 9: auth + RLS.
--
-- Phase 1 gave the panel support, an audit log and suspension. This gives it
-- the two things a platform needs when somebody behaves badly:
--
--   1. **Businesses.** Every studio and artist page in one searchable list,
--      with the switch that has been on the backlog since 8 Sep:
--      `admin_set_tenant_visibility` — list or unlist ONE business, with a
--      reason, audited, and telling its owner. Until now the only lever was
--      revoking a whole organization's verification, which unlists every studio
--      it runs to deal with one.
--   2. **Reports.** `reports` — anybody signed in can report a studio, an
--      artist page, a person, a crew, an event or a class; an admin dismisses
--      it or acts on it, with a note, audited. One live report per person per
--      thing, so a pile-on is one row per reporter and not a queue full of the
--      same complaint.
--
-- Later phases: money oversight, announcements, platform settings.

-- ── 1. one business's visibility, an admin's to move ────────────────────────
create or replace function public.admin_set_tenant_visibility(
  p_tenant_id uuid,
  p_visibility text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant public.tenants;
  v_owner uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin';
  end if;
  if p_visibility not in ('listed', 'unlisted') then
    raise exception 'a business is listed or unlisted';
  end if;
  select * into v_tenant from public.tenants t where t.id = p_tenant_id and t.deleted_at is null;
  if not found then
    raise exception 'no such business';
  end if;
  if p_visibility = 'listed' and v_tenant.type = 'studio' and not public.tenant_owner_verified(p_tenant_id) then
    raise exception 'that studio''s organization is not verified — verify it first, or its studios cannot be public';
  end if;
  if p_visibility = 'unlisted' and (p_reason is null or char_length(btrim(p_reason)) < 3) then
    raise exception 'say why in a sentence — the owner reads it, and so does the log';
  end if;

  update public.tenants t
     set visibility = p_visibility, updated_by = auth.uid()
   where t.id = p_tenant_id;

  select m.user_id into v_owner from public.tenant_members m
   where m.tenant_id = p_tenant_id and m.member_role = 'owner' and m.deleted_at is null
   limit 1;
  if v_owner is not null then
    perform public.notify(v_owner, 'people',
      case when p_visibility = 'listed' then v_tenant.name || ' is public again' else v_tenant.name || ' has been taken off Discover' end,
      case when p_visibility = 'listed'
           then 'It is back on Discover and in search.'
           else btrim(coalesce(p_reason, '')) || ' — write to DanceOS from your hub if you want to discuss it.' end,
      '/business');
  end if;
  perform public.log_admin_action(
    case when p_visibility = 'listed' then 'business.list' else 'business.unlist' end,
    'tenant', p_tenant_id, v_tenant.name, p_reason,
    jsonb_build_object('type', v_tenant.type, 'city', v_tenant.city, 'was', v_tenant.visibility));
end;
$$;
comment on function public.admin_set_tenant_visibility(uuid, text, text) is
  'List or unlist ONE business, with a reason the owner reads. Refuses listing a studio whose organization is not verified. Audited (10 Sep 2026).';
revoke execute on function public.admin_set_tenant_visibility(uuid, text, text) from public, anon;
grant execute on function public.admin_set_tenant_visibility(uuid, text, text) to authenticated;

/** Every business, for the panel: what it is, who owns it, what it holds, and
 *  how many people follow it. Searchable by name, city or the owner's name. */
create or replace function public.admin_businesses(p_q text default null, p_limit integer default 50)
returns table (
  id uuid,
  type text,
  name text,
  city text,
  area text,
  visibility text,
  photo_path text,
  verified_at timestamptz,
  owner_id uuid,
  owner_name text,
  owner_role text,
  owner_verified boolean,
  owner_suspended boolean,
  rooms integer,
  classes integer,
  events integer,
  followers integer,
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
    select t.id, t.type, t.name, t.city, t.area, t.visibility, t.photo_path, t.verified_at,
           o.id, o.full_name, o.role, o.verified_at is not null, o.suspended_at is not null,
           (select count(*)::int from public.rooms r where r.tenant_id = t.id and r.deleted_at is null),
           (select count(*)::int from public.classes c where c.tenant_id = t.id and c.deleted_at is null),
           (select count(*)::int from public.events e where e.tenant_id = t.id and e.deleted_at is null),
           (select count(*)::int from public.follows f where f.tenant_id = t.id and f.deleted_at is null),
           t.created_at
    from public.tenants t
    left join public.tenant_members m
      on m.tenant_id = t.id and m.member_role = 'owner' and m.deleted_at is null
    left join public.profiles o on o.id = m.user_id
    where t.deleted_at is null
      and (p_q is null or btrim(p_q) = ''
           or t.name ilike '%' || btrim(p_q) || '%'
           or coalesce(t.city, '') ilike '%' || btrim(p_q) || '%'
           or coalesce(o.full_name, '') ilike '%' || btrim(p_q) || '%')
    order by t.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;
comment on function public.admin_businesses(text, integer) is
  'Every live business for a platform admin: kind, owner (and whether that owner is verified or suspended), what it holds, followers. Searchable by business name, city or owner name.';
revoke execute on function public.admin_businesses(text, integer) from public, anon;
grant execute on function public.admin_businesses(text, integer) to authenticated;

-- ── 2. reports: somebody says something is wrong ────────────────────────────
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  subject_kind text not null check (subject_kind in ('tenant', 'profile', 'crew', 'event', 'class')),
  subject_id uuid not null,
  -- a closed list, so the queue can be read at a glance and counted
  reason text not null check (reason in ('impersonation', 'not_a_real_business', 'stolen_content', 'offensive', 'spam', 'unsafe', 'other')),
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  -- what the admin did about it, in their words
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  decided_at timestamptz,
  decided_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);
comment on table public.reports is
  'One person saying one thing is wrong with one other thing. An admin dismisses it or acts on it, with a note. One live report per reporter per subject, so a pile-on is one row each rather than a queue full of the same complaint.';

create unique index reports_one_live_per_reporter
  on public.reports (reporter_id, subject_kind, subject_id)
  where status = 'open' and deleted_at is null;
create index reports_subject_idx on public.reports (subject_kind, subject_id) where deleted_at is null;
create index reports_status_idx on public.reports (status, created_at desc) where deleted_at is null;

create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

alter table public.reports enable row level security;

create policy "a reporter reads their own reports"
  on public.reports for select
  to authenticated
  using (deleted_at is null and reporter_id = auth.uid());

create policy "admins read every report"
  on public.reports for select
  to authenticated
  using (deleted_at is null and public.is_platform_admin());
-- no write policies: the two functions below are the only doors

/** Anybody signed in may report. The subject must exist and must not be the
 *  reporter themselves; a suspended account cannot report (it would be the
 *  obvious retaliation). Filing twice is not an error — it says so in words. */
create or replace function public.report_content(
  p_subject_kind text,
  p_subject_id uuid,
  p_reason text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_exists boolean := false;
  v_label text;
  v_report uuid;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user and p.deleted_at is null) then
    raise exception 'finish onboarding first';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_user and p.suspended_at is not null) then
    raise exception 'this account is suspended — write to DanceOS from your hub';
  end if;
  if p_subject_kind not in ('tenant', 'profile', 'crew', 'event', 'class') then
    raise exception 'that is not something you can report';
  end if;
  if p_reason not in ('impersonation', 'not_a_real_business', 'stolen_content', 'offensive', 'spam', 'unsafe', 'other') then
    raise exception 'pick a reason from the list';
  end if;
  if p_subject_kind = 'profile' and p_subject_id = v_user then
    raise exception 'you cannot report yourself';
  end if;

  if p_subject_kind = 'tenant' then
    select true, t.name into v_exists, v_label from public.tenants t where t.id = p_subject_id and t.deleted_at is null;
  elsif p_subject_kind = 'profile' then
    select true, p.full_name into v_exists, v_label from public.profiles p where p.id = p_subject_id and p.deleted_at is null;
  elsif p_subject_kind = 'crew' then
    select true, c.name into v_exists, v_label from public.crews c where c.id = p_subject_id and c.deleted_at is null;
  elsif p_subject_kind = 'event' then
    select true, e.title into v_exists, v_label from public.events e where e.id = p_subject_id and e.deleted_at is null;
  else
    select true, c.title into v_exists, v_label from public.classes c where c.id = p_subject_id and c.deleted_at is null;
  end if;
  if not coalesce(v_exists, false) then
    raise exception 'there is nothing there to report';
  end if;

  select r.id into v_report from public.reports r
    where r.reporter_id = v_user and r.subject_kind = p_subject_kind and r.subject_id = p_subject_id
      and r.status = 'open' and r.deleted_at is null;
  if v_report is not null then
    raise exception 'you have already reported this — a DanceOS admin is looking at it';
  end if;

  insert into public.reports (reporter_id, subject_kind, subject_id, reason, note)
  values (v_user, p_subject_kind, p_subject_id, p_reason, nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_report;

  perform public.notify_platform_admins('people',
    'A ' || p_subject_kind || ' was reported',
    coalesce(v_label, 'Something') || ' — ' || replace(p_reason, '_', ' ') || '. Read it in the reports queue.',
    '/admin/reports');
  return v_report;
end;
$$;
comment on function public.report_content(text, uuid, text, text) is
  'Report a business, a person, a crew, an event or a class. Refuses yourself, a suspended caller, a subject that does not exist, and a second open report on the same thing. Notifies the admins.';
revoke execute on function public.report_content(text, uuid, text, text) from public, anon;
grant execute on function public.report_content(text, uuid, text, text) to authenticated;

create or replace function public.decide_report(p_report_id uuid, p_actioned boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports;
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin';
  end if;
  select * into v_report from public.reports r where r.id = p_report_id and r.deleted_at is null;
  if not found then
    raise exception 'no such report';
  end if;
  if v_report.status <> 'open' then
    raise exception 'that report already has an answer';
  end if;

  update public.reports r
     set status = case when p_actioned then 'actioned' else 'dismissed' end,
         decision_note = nullif(btrim(coalesce(p_note, '')), ''),
         decided_at = now(),
         decided_by = auth.uid(),
         updated_by = auth.uid()
   where r.id = p_report_id;

  -- the reporter hears back: a report that vanishes teaches people not to report
  perform public.notify(v_report.reporter_id, 'people',
    case when p_actioned then 'DanceOS acted on your report' else 'DanceOS looked at your report' end,
    coalesce(nullif(btrim(coalesce(p_note, '')), ''),
             case when p_actioned then 'Thank you — we have dealt with it.' else 'We looked, and did not find a problem this time.' end),
    '/');
  perform public.log_admin_action(
    case when p_actioned then 'report.actioned' else 'report.dismissed' end,
    'profile', v_report.reporter_id, null, p_note,
    jsonb_build_object('report_id', p_report_id, 'subject_kind', v_report.subject_kind,
                       'subject_id', v_report.subject_id, 'reason', v_report.reason));
end;
$$;
comment on function public.decide_report(uuid, boolean, text) is
  'Answer a report: actioned or dismissed, with a note the reporter reads back. Audited. Acting on the subject itself is a separate, separately audited decision (unlist, suspend).';
revoke execute on function public.decide_report(uuid, boolean, text) from public, anon;
grant execute on function public.decide_report(uuid, boolean, text) to authenticated;

/** The queue, with each subject's NAME resolved and how many other people have
 *  reported the same thing — the number that turns one complaint into a case. */
create or replace function public.admin_reports(p_status text default 'open', p_limit integer default 100)
returns table (
  id uuid,
  reporter_id uuid,
  reporter_name text,
  subject_kind text,
  subject_id uuid,
  subject_label text,
  subject_href text,
  reason text,
  note text,
  status text,
  decision_note text,
  decided_at timestamptz,
  others integer,
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
    select r.id, r.reporter_id, rp.full_name, r.subject_kind, r.subject_id,
           case r.subject_kind
             when 'tenant' then (select t.name from public.tenants t where t.id = r.subject_id)
             when 'profile' then (select p.full_name from public.profiles p where p.id = r.subject_id)
             when 'crew' then (select c.name from public.crews c where c.id = r.subject_id)
             when 'event' then (select e.title from public.events e where e.id = r.subject_id)
             else (select c.title from public.classes c where c.id = r.subject_id)
           end,
           case r.subject_kind
             when 'tenant' then (select case when t.type = 'studio' then '/studio/' else '/artist/' end || t.id::text from public.tenants t where t.id = r.subject_id)
             when 'profile' then '/person/' || r.subject_id::text
             when 'crew' then '/crew/' || r.subject_id::text
             when 'event' then (select '/e/' || e.share_slug from public.events e where e.id = r.subject_id)
             else (select '/c/' || c.share_slug from public.classes c where c.id = r.subject_id)
           end,
           r.reason, r.note, r.status, r.decision_note, r.decided_at,
           (select count(*)::int from public.reports o
             where o.subject_kind = r.subject_kind and o.subject_id = r.subject_id
               and o.id <> r.id and o.deleted_at is null),
           r.created_at
    from public.reports r
    join public.profiles rp on rp.id = r.reporter_id
    where r.deleted_at is null
      and (p_status is null or p_status = 'all' or r.status = p_status)
    order by (r.status = 'open') desc, r.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 300));
end;
$$;
comment on function public.admin_reports(text, integer) is
  'The reports queue for a platform admin, open first: who reported what, the subject''s name and where it lives, and how many OTHERS reported the same thing.';
revoke execute on function public.admin_reports(text, integer) from public, anon;
grant execute on function public.admin_reports(text, integer) to authenticated;

-- ── 3. the dashboard learns to count reports ────────────────────────────────
-- Body is 20260910120000's with the reports count filled in, so the nav badge
-- and the overview stop saying nothing about a queue that now exists.
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
      'reports', (select count(*) from public.reports r where r.status = 'open' and r.deleted_at is null),
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
  'The platform pulse for a platform admin: what is waiting on a decision (verifications, conversations, reports, refunds, stuck webhooks), what exists, what moved this week. Aggregate only.';
revoke execute on function public.admin_dashboard() from public, anon;
grant execute on function public.admin_dashboard() to authenticated;
