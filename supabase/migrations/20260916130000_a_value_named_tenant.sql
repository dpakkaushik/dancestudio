-- ─────────────────────────────────────────────────────────────────────────────
-- A VALUE NAMED TENANT (16 Sep 2026) — the follow-up 20260916120000 needed
--
-- The rename rewrote every function body, and in seven of them the word
-- `tenant` was not a NAME but a VALUE: `log_admin_action(…, 'tenant', …)` and
-- `report_content(p_subject_kind = 'tenant')` — the kind of thing an audit row
-- or a report is about. Function text is what the rename touched; the two CHECK
-- constraints that list the allowed kinds are parsed expressions, which keep
-- their literals through any rename — so after the apply the functions wrote
-- 'business' and the constraints still admitted only 'tenant'. Found by
-- `rls-proof-studio-verification` check 8: the admin's approve was refused with
-- a 400 the moment it tried to write its audit line.
--
-- The lesson, for the file: A RENAME CAN REACH A VALUE. Any word that is both
-- an identifier and a stored value has to be found on both sides — in the
-- expressions Postgres parses (CHECKs, policies, index predicates, defaults) and
-- in the rows already written — before the text rewrite runs. `pg_get_constraintdef`,
-- `pg_policies.qual` and a `group by` on the column are the three reads.
--
-- Two tables, two answers:
--   * `reports` is ordinary data: its 4 rows move to 'business' and its CHECK
--     lists the new word. `admin_reports` already builds the subject's name and
--     link for 'business', so the queue reads right again.
--   * `admin_audit` is IMMUTABLE — its own trigger refuses every UPDATE and
--     DELETE, the service role's included (20260910120000). Its 161 rows that
--     say 'tenant' therefore stay as written, the CHECK admits both words, and
--     the reader (`AuditLog`) shows the legacy word as what it means. A log
--     that could be edited to match a rename would not be a log.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── reports: mutable, so the rows follow the word ────────────────────────────
alter table public.reports drop constraint reports_subject_kind_check;
update public.reports set subject_kind = 'business' where subject_kind = 'tenant';
alter table public.reports add constraint reports_subject_kind_check
  check (subject_kind in ('business', 'profile', 'crew', 'event', 'class'));
comment on column public.reports.subject_kind is
  'What was reported: business (a studio or artist page — the word was tenant until 16 Sep 2026) | profile | crew | event | class.';

-- ── admin_audit: immutable, so the CHECK admits the legacy word beside the new
alter table public.admin_audit drop constraint admin_audit_subject_kind_check;
alter table public.admin_audit add constraint admin_audit_subject_kind_check
  check (subject_kind in ('profile', 'business', 'request', 'thread', 'tenant'));
comment on column public.admin_audit.subject_kind is
  'What the decision was about: profile | business | request | thread. Rows written before 16 Sep 2026 say tenant for business — this table is immutable, so they stay; read the two words as one.';

-- ── the guard, again, for the thing the first one could not see ──────────────
do $$
declare v_bad text[] := '{}'; r record;
begin
  for r in
    select conrelid::regclass::text as tbl, conname from pg_constraint
     where connamespace = 'public'::regnamespace
       and pg_get_constraintdef(oid) ~ '''tenant'''
       and conname <> 'admin_audit_subject_kind_check'
  loop
    v_bad := v_bad || (r.tbl || '.' || r.conname);
  end loop;
  if cardinality(v_bad) > 0 then
    raise exception 'a CHECK still admits only the old value: %', array_to_string(v_bad, ', ');
  end if;
  if exists (select 1 from public.reports where subject_kind = 'tenant') then
    raise exception 'reports still carry the old value';
  end if;
  raise notice 'value guard: only admin_audit (immutable) still admits ''tenant'', as history';
end $$;

notify pgrst, 'reload schema';
