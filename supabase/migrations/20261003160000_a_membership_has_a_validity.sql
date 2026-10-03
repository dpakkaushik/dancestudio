-- A MEMBERSHIP HAS A VALIDITY — 30, 60 OR 90 DAYS (3 Oct 2026).
--
-- The user: "membership should have a validity date in no. of days to use it
-- from 30 days, 60 days, 90 days."
--
-- THE WHOLE OF IT:
--   1. memberships.validity_days — 30 | 60 | 90, or NULL for a membership made
--      before today (no expiry; nothing anybody holds is shortened).
--   2. membership_passes.validity_days (the snapshot, like price and units) and
--      membership_passes.expires_at — bought_at + validity_days, stamped when the
--      pass becomes paid. Counted from PURCHASE, not from the first class.
--   3. one BEFORE trigger that takes the snapshot and stamps the date, so the
--      three doors that make or pay a pass (buy_membership's free path and its
--      resume path, apply_membership_payment) need no edit at all.
--   4. four live bodies edited by ASSERTED single-occurrence anchor, never
--      re-typed (five of six re-typed bodies were wrong on 28 Sep):
--        passes_for_session   — a pass is offered only for a class that STARTS
--                               before it runs out
--        book_with_membership — and refused in words if it does not
--        why_no_membership    — an EXPIRED pass no longer blocks buying another
--        business_memberships — "Active" leaves expired passes out
--   5. save_membership gains p_validity_days LAST and defaulted (dropped and
--      re-created — a parameter cannot be added in place; its grants restated
--      exactly: authenticated + service_role, never anon). A call without it
--      behaves as before, so every proof and the seeder keep working.
--
-- ⚠ NO status is added and no job runs: an expired pass is `active` with an
-- `expires_at` in the past, and every reader derives "expired" from the date.
-- ⚠ Units left on an expired pass simply lapse — no refund is filed. Said here
-- because it is a decision about money.
-- ⚠ No policy changes; no table grant changes; nothing backfilled.

alter table public.memberships
  add column if not exists validity_days integer;
alter table public.memberships
  add constraint memberships_validity_days_check
  check (validity_days is null or validity_days in (30, 60, 90));
comment on column public.memberships.validity_days is
  'How long a pass of this membership may be used, in days from purchase: 30, 60 or 90 (3 Oct 2026). NULL = a membership made before validity existed, which never expires.';

alter table public.membership_passes
  add column if not exists validity_days integer,
  add column if not exists expires_at timestamptz;
alter table public.membership_passes
  add constraint membership_passes_validity_days_check
  check (validity_days is null or validity_days in (30, 60, 90));
comment on column public.membership_passes.validity_days is
  'The membership''s validity at the moment this pass was taken — a snapshot, like price_inr and units_total (3 Oct 2026).';
comment on column public.membership_passes.expires_at is
  'bought_at + validity_days, stamped when the pass is paid. After it the pass spends nothing; units left lapse. NULL = never expires (3 Oct 2026).';

-- ── 3. the snapshot and the date, at the row ─────────────────────────────────
create or replace function public.membership_pass_validity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- the snapshot is taken while the pass is still being bought: on insert, and
  -- on the resume path that refreshes an unpaid pass to today's terms
  if tg_op = 'INSERT' or new.status = 'pending_payment' then
    select m.validity_days into new.validity_days
      from public.memberships m where m.id = new.membership_id;
  end if;
  -- the date is stamped once, when the pass is paid for
  if new.status in ('active', 'used_up') and new.bought_at is not null
     and new.expires_at is null and new.validity_days is not null then
    new.expires_at := new.bought_at + make_interval(days => new.validity_days);
  end if;
  return new;
end;
$$;
revoke all on function public.membership_pass_validity() from public, anon, authenticated;

create trigger membership_passes_validity
  before insert or update on public.membership_passes
  for each row execute function public.membership_pass_validity();

-- ── 4 & 5. the live bodies, edited by asserted anchor ────────────────────────
do $migration$
declare
  v_def text;
  v_acl text;
  -- replace exactly one occurrence, or refuse the whole migration
  -- (inline: count = (len(src) - len(src without a)) / len(a))
begin
  -- passes_for_session
  v_def := pg_get_functiondef('public.passes_for_session(uuid)'::regprocedure);
  if (length(v_def) - length(replace(v_def, $a$on p.user_id = auth.uid() and p.status = 'active' and p.deleted_at is null$a$, ''))) / length($a$on p.user_id = auth.uid() and p.status = 'active' and p.deleted_at is null$a$) <> 1 then
    raise exception 'passes_for_session: anchor not found exactly once';
  end if;
  v_def := replace(v_def,
    $a$on p.user_id = auth.uid() and p.status = 'active' and p.deleted_at is null$a$,
    $b$on p.user_id = auth.uid() and p.status = 'active' and p.deleted_at is null
     and (p.expires_at is null or s.starts_at < p.expires_at)$b$);
  execute v_def;

  -- book_with_membership: a second `if` opened right after the active check; the
  -- body's own `end if;` closes it
  v_def := pg_get_functiondef('public.book_with_membership(uuid, uuid)'::regprocedure);
  if (length(v_def) - length(replace(v_def, $a$raise exception 'that membership is not active';$a$, ''))) / length($a$raise exception 'that membership is not active';$a$) <> 1 then
    raise exception 'book_with_membership: anchor not found exactly once';
  end if;
  v_def := replace(v_def,
    $a$raise exception 'that membership is not active';$a$,
    $b$raise exception 'that membership is not active';
  end if;
  if v_pass.expires_at is not null and v_session.starts_at >= v_pass.expires_at then
    raise exception 'that membership runs out before this class';$b$);
  execute v_def;

  -- why_no_membership
  v_def := pg_get_functiondef('public.why_no_membership(uuid)'::regprocedure);
  if (length(v_def) - length(replace(v_def, $a$and p.status = 'active' and p.units_used < p.units_total and p.deleted_at is null$a$, ''))) / length($a$and p.status = 'active' and p.units_used < p.units_total and p.deleted_at is null$a$) <> 1 then
    raise exception 'why_no_membership: anchor not found exactly once';
  end if;
  v_def := replace(v_def,
    $a$and p.status = 'active' and p.units_used < p.units_total and p.deleted_at is null$a$,
    $b$and p.status = 'active' and p.units_used < p.units_total and p.deleted_at is null
       and (p.expires_at is null or p.expires_at > now())$b$);
  execute v_def;

  -- business_memberships
  v_def := pg_get_functiondef('public.business_memberships(uuid)'::regprocedure);
  if (length(v_def) - length(replace(v_def, $a$count(*) filter (where x.status = 'active')::integer as n_active$a$, ''))) / length($a$count(*) filter (where x.status = 'active')::integer as n_active$a$) <> 1 then
    raise exception 'business_memberships: anchor not found exactly once';
  end if;
  v_def := replace(v_def,
    $a$count(*) filter (where x.status = 'active')::integer as n_active$a$,
    $b$count(*) filter (where x.status = 'active' and (x.expires_at is null or x.expires_at > now()))::integer as n_active$b$);
  execute v_def;

  -- save_membership: a new LAST argument, so drop and re-create
  v_def := pg_get_functiondef('public.save_membership(uuid, uuid, text, text, numeric, integer, integer, text)'::regprocedure);
  if (length(v_def) - length(replace(v_def, $a$p_status text)$a$, ''))) / length($a$p_status text)$a$) <> 1 then
    raise exception 'save_membership: header anchor not found exactly once';
  end if;
  v_def := replace(v_def, $a$p_status text)$a$, $b$p_status text, p_validity_days integer DEFAULT NULL::integer)$b$);

  if (length(v_def) - length(replace(v_def, $a$  if p_status not in ('live', 'draft') then$a$, ''))) / length($a$  if p_status not in ('live', 'draft') then$a$) <> 1 then
    raise exception 'save_membership: status anchor not found exactly once';
  end if;
  v_def := replace(v_def, $a$  if p_status not in ('live', 'draft') then$a$,
    $b$  if p_validity_days is not null and p_validity_days not in (30, 60, 90) then
    raise exception 'a membership is valid for 30, 60 or 90 days';
  end if;
  if p_status not in ('live', 'draft') then$b$);

  if (length(v_def) - length(replace(v_def, $a$insert into public.memberships (business_id, name, unit, units, price_inr, total_count, status)
    values (p_business_id, btrim(p_name), p_unit, p_units, p_price_inr, p_total_count, p_status)$a$, ''))) <= 0 then
    raise exception 'save_membership: insert anchor not found';
  end if;
  v_def := replace(v_def,
    $a$insert into public.memberships (business_id, name, unit, units, price_inr, total_count, status)
    values (p_business_id, btrim(p_name), p_unit, p_units, p_price_inr, p_total_count, p_status)$a$,
    $b$insert into public.memberships (business_id, name, unit, units, price_inr, total_count, status, validity_days)
    values (p_business_id, btrim(p_name), p_unit, p_units, p_price_inr, p_total_count, p_status, p_validity_days)$b$);

  if (length(v_def) - length(replace(v_def, $a$price_inr = p_price_inr, total_count = p_total_count, status = p_status,$a$, ''))) / length($a$price_inr = p_price_inr, total_count = p_total_count, status = p_status,$a$) <> 1 then
    raise exception 'save_membership: update anchor not found exactly once';
  end if;
  -- on an edit a null leaves the validity as it was; it never rewrites a sold pass
  v_def := replace(v_def,
    $a$price_inr = p_price_inr, total_count = p_total_count, status = p_status,$a$,
    $b$price_inr = p_price_inr, total_count = p_total_count, status = p_status,
         validity_days = coalesce(p_validity_days, validity_days),$b$);

  drop function public.save_membership(uuid, uuid, text, text, numeric, integer, integer, text);
  execute v_def;
end;
$migration$;

-- a re-created function arrives with the database's default grants (16 Sep):
-- revoke them all, then restate exactly what it had
revoke all on function public.save_membership(uuid, uuid, text, text, numeric, integer, integer, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.save_membership(uuid, uuid, text, text, numeric, integer, integer, text, integer) to authenticated, service_role;
