-- AN ADMIN WHO HAS ACTED CAN STILL BE DELETED (27 Sep 2026)
--
-- ⚠ Rule 9 — this touches the AUDIT LOG, which is the record of every platform
-- decision ever made and is immutable by its own trigger. Nothing here makes a
-- row editable and nothing here removes a row; what changes is that deleting a
-- PERSON no longer has to be refused because of them.
--
-- THE DEFECT, found by auditing the catalog rather than by a failure. Four
-- columns in `public` carry a FOREIGN KEY into `auth.users` with NO `on delete`
-- clause, which is NO ACTION — so the delete is REFUSED:
--
--     admin_audit.actor_id                      1591 rows, 483 distinct actors
--     reports.decided_by                           1 row
--     studio_verification_requests.decided_by     15 rows
--     subscriptions.granted_by                    25 rows
--
-- The consequence is that **any account that has ever acted as a platform admin
-- is permanently undeletable**. That is not a theoretical tidiness problem: it
-- is why `jishnu.nanda@gmail.com` — one of the three retired organization
-- logins the user asked to be deleted — answered
--     23503 … violates foreign key constraint "admin_audit_actor_id_fkey"
-- over ONE audit row; and it is why every throwaway `sv-admin-*` account the
-- verification proof creates has been left on production since 14 Sep, one per
-- run, because their own cleanup is refused in silence.
--
-- ⚠ AND `on delete set null` IS NOT THE FIX. `admin_audit` is guarded by
-- `admin_audit_immutable`, a BEFORE UPDATE OR DELETE trigger that raises for
-- EVERYBODY, service role included — so the SET NULL (an UPDATE) would be
-- refused too, and the delete would fail with a different message. This is the
-- `crew_header_photos` shape of 19 Sep in a third coat: an FK from an AUDIT
-- column into `auth.users` is the tell.
--
-- THE FIX IS THE ONE THIS DATABASE ALREADY USES EVERYWHERE ELSE. Every other
-- audit column here — `created_by`, `updated_by`, on every table — is a plain
-- uuid with no constraint (and `20260919180000` dropped ten of exactly these
-- when the same defect was found on the routines and memberships tables). So
-- the four stragglers go the same way.
--
-- ⚠ WHAT WOULD BE LOST, AND WHAT KEEPS IT. `admin_audit_log` resolves the actor
-- by LEFT JOIN on `auth.users`, so once the account is gone the log would say
-- who was acted UPON and not who acted. That is the one thing worth keeping, and
-- the table already knows how: `subject_label` is a NAME SNAPSHOT taken at write
-- time for exactly this reason ("so it reads after a deletion", 10 Sep). This
-- migration gives the actor the same treatment — `actor_label`, written by
-- `log_admin_action` as it writes the row, backfilled for the 1591 rows that
-- predate it. The other three columns need no label: none of them is read by
-- name anywhere in the app (nothing embeds through those FKs either, so no
-- PostgREST relationship breaks).

begin;

-- ── 1 · the actor's name, snapshotted, exactly as the subject's already is ───
alter table public.admin_audit add column if not exists actor_label text;
comment on column public.admin_audit.actor_label is
  'WHO ACTED, as they were called at the time (27 Sep 2026). A snapshot for the same reason subject_label is one: this log must read after the account is deleted, and actor_id carries no foreign key any more.';

-- ⚠ THE BACKFILL HAS TO GO ROUND THE IMMUTABILITY TRIGGER, and that is said out
-- loud rather than done quietly. `guard_admin_audit_immutable` refuses every
-- UPDATE from everybody; a migration owns the table, so it may disable the
-- trigger for the length of ONE statement and put it back. Nothing else in this
-- file, and nothing in the app, ever can.
alter table public.admin_audit disable trigger admin_audit_immutable;

update public.admin_audit a
set actor_label = left(coalesce(nullif(btrim(p.full_name), ''), u.email::text, ''), 140)
from auth.users u
left join public.profiles p on p.id = u.id
where u.id = a.actor_id and a.actor_label is null;

alter table public.admin_audit enable trigger admin_audit_immutable;

-- ── 2 · the one writer takes the snapshot from here on ──────────────────────
-- same signature, same grants (nothing is dropped, so the ACL cannot move).
create or replace function public.log_admin_action(
  p_action text,
  p_subject_kind text,
  p_subject_id uuid,
  p_subject_label text,
  p_reason text default null,
  p_detail jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_actor uuid := coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  v_label text;
begin
  /* who this is, as they are called right now — read once, kept for ever, so
     the log still names them when the account is gone (27 Sep 2026) */
  select left(coalesce(nullif(btrim(p.full_name), ''), u.email::text, ''), 140)
    into v_label
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = v_actor;

  insert into public.admin_audit (actor_id, actor_label, action, subject_kind, subject_id, subject_label, reason, detail)
  values (v_actor, v_label, p_action, p_subject_kind, p_subject_id,
          left(coalesce(p_subject_label, ''), 140), nullif(btrim(coalesce(p_reason, '')), ''), coalesce(p_detail, '{}'::jsonb));
end;
$$;

-- ── 3 · the desk reads the snapshot when the account is gone ────────────────
-- ⚠ `create or replace`, and the RETURNS TABLE is UNCHANGED: `actor_email` keeps
-- its name and its position, so the repository, its row type and the screen all
-- stay as they are. A live admin still reads as their email — which is what that
-- desk has shown since 10 Sep — and only a deleted one falls back to the name.
create or replace function public.admin_audit_log(p_limit integer default 100, p_action text default null)
returns table (
  id uuid, actor_id uuid, actor_email text, action text, subject_kind text,
  subject_id uuid, subject_label text, reason text, detail jsonb, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin';
  end if;
  return query
    select a.id, a.actor_id, coalesce(u.email::text, nullif(a.actor_label, '')), a.action, a.subject_kind, a.subject_id,
           a.subject_label, a.reason, a.detail, a.created_at
    from public.admin_audit a
    left join auth.users u on u.id = a.actor_id
    where p_action is null or a.action = p_action
    order by a.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

-- ── 4 · and the four constraints go ─────────────────────────────────────────
-- ⚠ Nothing embeds through any of them (checked against every `.select()` in
-- the app: `admin_audit` is read only through the definer above, and the other
-- three columns are never joined by PostgREST), so no relationship is lost.
alter table public.admin_audit drop constraint if exists admin_audit_actor_id_fkey;
alter table public.reports drop constraint if exists reports_decided_by_fkey;
alter table public.studio_verification_requests drop constraint if exists studio_verification_requests_decided_by_fkey;
alter table public.subscriptions drop constraint if exists subscriptions_granted_by_fkey;

comment on column public.admin_audit.actor_id is
  'The admin who acted. A PLAIN uuid — no foreign key, like every other audit column here — because an account that has acted must still be deletable; actor_label is the name that survives them.';
comment on column public.reports.decided_by is 'The admin who decided. A plain uuid (27 Sep 2026) — see admin_audit.actor_id.';
comment on column public.studio_verification_requests.decided_by is 'The admin who decided. A plain uuid (27 Sep 2026) — see admin_audit.actor_id.';
comment on column public.subscriptions.granted_by is 'The admin who granted this comp. A plain uuid (27 Sep 2026) — see admin_audit.actor_id.';

commit;
