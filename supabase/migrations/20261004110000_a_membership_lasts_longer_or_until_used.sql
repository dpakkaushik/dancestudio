-- A MEMBERSHIP MAY LAST 120 OR 150 DAYS, OR UNTIL IT IS USED UP (4 Oct 2026).
--
-- The user: "Valid for should have 120 days, 150 days and Unlimited. in unlimited
-- subscription active till full consumed."
--
-- What it changes, and nothing else:
--   1. memberships.validity_days and membership_passes.validity_days admit
--      120 and 150 beside 30 · 60 · 90 (the two CHECKs, replaced).
--   2. save_membership's own refusal admits them too — create or replace with
--      the SAME signature, so not one grant moves. Its body is the live
--      catalog's, edited at one asserted anchor, never re-typed.
--
-- ⚠ UNLIMITED NEEDS NO SCHEMA: a NULL validity has meant "never expires" since
-- 20261003160000 (a pass with no expires_at spends until its hours run out), and
-- save_membership already inserts NULL when it is sent none. So "Unlimited" is
-- the form sending no validity on a NEW membership. ⚠ On an EDIT a NULL still
-- means "leave it as it was" — no screen edits a membership today, so nothing
-- can be turned unlimited after the fact; that would be a decision of its own.
--
-- No table, no column, no policy, no grant, no row moves. Nothing is backfilled.
-- No begin/commit (Rule 18): db push wraps the file.

alter table public.memberships drop constraint memberships_validity_days_check;
alter table public.memberships
  add constraint memberships_validity_days_check
  check (validity_days is null or validity_days in (30, 60, 90, 120, 150));
comment on column public.memberships.validity_days is
  'How long a pass of this membership may be used, in days from purchase: 30, 60, 90, 120 or 150 (4 Oct 2026). NULL = unlimited — a pass that never expires and lasts until its hours are used up.';

alter table public.membership_passes drop constraint membership_passes_validity_days_check;
alter table public.membership_passes
  add constraint membership_passes_validity_days_check
  check (validity_days is null or validity_days in (30, 60, 90, 120, 150));

do $migration$
declare
  v_def text;
  v_old constant text := $a$  if p_validity_days is not null and p_validity_days not in (30, 60, 90) then
    raise exception 'a membership is valid for 30, 60 or 90 days';$a$;
  v_new constant text := $b$  if p_validity_days is not null and p_validity_days not in (30, 60, 90, 120, 150) then
    raise exception 'a membership is valid for 30, 60, 90, 120 or 150 days, or until it is used up';$b$;
begin
  v_def := pg_get_functiondef('public.save_membership(uuid, uuid, text, text, numeric, integer, integer, text, integer)'::regprocedure);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'save_membership: validity anchor not found exactly once';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$migration$;
