-- AN UNPAID PASS IS NOT A SOLD PASS, AND A CLASS STARTS AHEAD (30 Sep 2026)
--
-- Two things the classes / refunds / memberships audit found that only the
-- database can fix. Neither adds a table, a column, a policy or a grant on
-- anything that exists; five function bodies change by one clause each, one
-- gains a resume branch, and `class_sessions` gains one BEFORE trigger.
--
-- ── 1 · A `pending_payment` PASS COUNTED AS TAKEN ─────────────────────────────
-- `buy_membership` writes a PRICED pass as `pending_payment` and opens the
-- Cashfree window. Close the window and the pass stays — and every count in
-- the slice treated it as SOLD: `why_no_membership` refused the next buyer
-- ("all N of these have been taken"), `public_memberships.left_count` came
-- down by one on the public page, `business_memberships.sold` went up by one
-- on the seller's desk, and `apply_membership_payment` counted it against the
-- cap when somebody ELSE's money landed. So twenty abandoned checkouts sold out
-- a twenty-count membership with nobody having paid a rupee — and the same
-- person pressing Buy again made a SECOND pending pass, eating a second place.
--
-- The rule now: a pass counts once it is PAID FOR (`active` or `used_up`). An
-- unpaid one holds nothing — and if the money lands after the last real place
-- has gone, `apply_membership_payment` already refunds it under the lock, which
-- is the honest outcome and the one the 19 Sep migration wrote for exactly this
-- case. Pressing Buy again RESUMES the unpaid pass at today's price rather than
-- making another.
--
-- ⚠ `membership_holders` already left `pending_payment` out, and `my_memberships`
-- deliberately keeps it in — that is how the holder finds the "Pay ₹X" button.
-- Neither moves.
--
-- ── 2 · A CLASS COULD BE BACKDATED THROUGH THE DATABASE ───────────────────────
-- The form has refused a past start since 28 Sep 2026 ("should not be able to
-- create a class in backdate") and said, in its own comment, that the database
-- still allowed it: `create_class_with_session` takes any instant. One BEFORE
-- trigger on `class_sessions` is the rule where the row lands — on INSERT, and
-- on an UPDATE that MOVES `starts_at` (an unchanged start on a past class is
-- an edit of its price or its people and passes untouched, which is the form's
-- own "a class that has already run stays editable"). The same minute of slack
-- as the form, so the two clocks cannot disagree by a second.
--
-- ⚠ THE SERVICE ROLE IS EXEMPT, like every guard in this project: the seeder,
-- the stats proof and the shoots plant a class that already ran by creating it
-- ahead and back-dating the session with the service role, and that is the one
-- honest way to plant history.
--
-- ⚠ EVERY BODY BELOW IS THE 19 Sep FILE'S OWN TEXT WITH THE ONE CLAUSE CHANGED,
-- marked ⚠ CHANGED where it sits — a re-typed function is one that can differ
-- (28 Sep: five of six were). The dry run diffs each against the live catalog
-- and prints every other line that moved.

-- ────────────────────────────────────────────────────────────────────────────
-- 1a · why_no_membership — the cap counts PAID passes
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.why_no_membership(p_membership_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_m public.memberships;
  v_sold integer;
begin
  select * into v_m from public.memberships where id = p_membership_id and deleted_at is null;
  if not found then
    return 'that membership is no longer on sale';
  end if;
  if v_m.status <> 'live' then
    return 'that membership is not on sale yet';
  end if;
  if not exists (select 1 from public.businesses b where b.id = v_m.business_id and b.deleted_at is null and b.visibility = 'listed') then
    return 'that business is not open to the public';
  end if;
  if exists (select 1 from public.business_members m where m.business_id = v_m.business_id and m.user_id = auth.uid() and m.deleted_at is null) then
    return 'you are on this team — a membership is for the people who come to dance';
  end if;
  -- ⚠ CHANGED: paid passes only — an unpaid one holds no place
  select count(*) into v_sold from public.membership_passes p
    where p.membership_id = p_membership_id and p.status in ('active', 'used_up') and p.deleted_at is null;
  if v_sold >= v_m.total_count then
    return 'all ' || v_m.total_count || ' of these have been taken';
  end if;
  if exists (
    select 1 from public.membership_passes p
     where p.membership_id = p_membership_id and p.user_id = auth.uid()
       and p.status = 'active' and p.units_used < p.units_total and p.deleted_at is null
  ) then
    return 'you already hold one of these — use it up first';
  end if;
  return null;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 1b · buy_membership — pressing Buy again resumes the unpaid pass
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.buy_membership(p_membership_id uuid)
returns public.membership_passes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_m public.memberships;
  v_why text;
  v_row public.membership_passes;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user and p.role = 'user' and p.deleted_at is null) then
    -- guard_person_only's rule, said in this door's own words
    raise exception 'a membership is bought by a person';
  end if;
  -- lock the membership: the cap is a race otherwise, exactly as a seat is
  select * into v_m from public.memberships where id = p_membership_id and deleted_at is null for update;
  v_why := public.why_no_membership(p_membership_id);
  if v_why is not null then
    raise exception '%', v_why;
  end if;

  -- ⚠ CHANGED: an unpaid pass of THEIRS on this membership is picked up again,
  -- at today's price and size, rather than a second one being made beside it.
  -- The order that pays for it is opened against the pass, so resuming here is
  -- what lets the "Pay ₹X" button under Memberships and the Buy button on the
  -- public page finish the SAME purchase.
  select * into v_row from public.membership_passes p
    where p.membership_id = p_membership_id and p.user_id = v_user
      and p.status = 'pending_payment' and p.deleted_at is null
    order by p.created_at desc limit 1;
  if found then
    update public.membership_passes
       set price_inr = v_m.price_inr, unit = v_m.unit, units_total = v_m.units, updated_by = v_user
     where id = v_row.id
    returning * into v_row;
    return v_row;
  end if;

  insert into public.membership_passes (membership_id, business_id, user_id, price_inr, unit, units_total, status, bought_at)
  values (p_membership_id, v_m.business_id, v_user, v_m.price_inr, v_m.unit, v_m.units,
          case when v_m.price_inr = 0 then 'active' else 'pending_payment' end,
          case when v_m.price_inr = 0 then now() else null end)
  returning * into v_row;
  return v_row;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 1c · business_memberships — the seller's "sold" is what was paid for
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.business_memberships(p_business_id uuid)
returns table (
  id uuid, name text, unit text, units numeric, price_inr integer, total_count integer, status text,
  sold integer, active integer, units_sold numeric, units_used numeric, revenue_inr integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.name, m.unit, m.units, m.price_inr, m.total_count, m.status,
         coalesce(p.n, 0), coalesce(p.n_active, 0),
         coalesce(p.units_total, 0), coalesce(p.units_used, 0), coalesce(p.paid, 0)
    from public.memberships m
    left join lateral (
      select count(*)::integer as n,
             count(*) filter (where x.status = 'active')::integer as n_active,
             sum(x.units_total) as units_total,
             sum(x.units_used) as units_used,
             sum(x.price_inr) filter (where x.status in ('active', 'used_up'))::integer as paid
        from public.membership_passes x
       -- ⚠ CHANGED: paid passes only
       where x.membership_id = m.id and x.status in ('active', 'used_up') and x.deleted_at is null
    ) p on true
   where m.business_id = p_business_id
     and m.deleted_at is null
     and public.is_business_member(p_business_id)
   order by m.created_at desc;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 1d · public_memberships — "N left" on the public page
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.public_memberships(p_business_id uuid)
returns table (id uuid, name text, unit text, units numeric, price_inr integer, total_count integer, left_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.name, m.unit, m.units, m.price_inr, m.total_count,
         greatest(m.total_count - coalesce((
           select count(*)::integer from public.membership_passes p
            -- ⚠ CHANGED: paid passes only
            where p.membership_id = m.id and p.status in ('active', 'used_up') and p.deleted_at is null
         ), 0), 0)
    from public.memberships m
    join public.businesses b on b.id = m.business_id
   where m.business_id = p_business_id
     and m.deleted_at is null and m.status = 'live'
     and b.deleted_at is null and b.visibility = 'listed'
   order by m.price_inr, m.name;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 1e · apply_membership_payment — the cap under the lock counts PAID passes
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.apply_membership_payment(p_order_id uuid, p_payment_id uuid, p_amount_paise bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_pass public.membership_passes;
  v_m public.memberships;
  v_sold integer;
  v_why text := null;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  select * into v_m from public.memberships m where m.id = v_order.membership_id for update;
  select * into v_pass from public.membership_passes p where p.id = v_order.membership_pass_id for update;

  if v_order.status <> 'created' then
    v_why := 'payment landed on a closed order';
  elsif p_amount_paise <> v_order.amount_inr::bigint * 100 then
    v_why := 'amount did not match the order';
  elsif v_pass.id is null or v_pass.deleted_at is not null then
    v_why := 'the membership no longer exists';
  elsif v_pass.status = 'active' or v_pass.status = 'used_up' then
    v_why := 'already paid for';
  elsif v_pass.status = 'cancelled' then
    v_why := 'the membership was cancelled before the payment landed';
  else
    -- ⚠ CHANGED: paid passes only — another buyer's abandoned window is not a sale
    select count(*) into v_sold from public.membership_passes p
      where p.membership_id = v_m.id and p.status in ('active', 'used_up') and p.deleted_at is null and p.id <> v_pass.id;
    if v_sold >= v_m.total_count then
      v_why := 'all of these were taken before the payment landed';
    end if;
  end if;

  if v_why is not null then
    update public.orders set status = 'refund_pending', updated_by = v_order.user_id where id = v_order.id;
    insert into public.refunds (order_id, payment_id, business_id, user_id, amount_inr, status, reason, created_by, updated_by)
    values (v_order.id, p_payment_id, v_order.business_id, v_order.user_id, v_order.amount_inr, 'pending', v_why, v_order.user_id, v_order.user_id);
    return jsonb_build_object('outcome', 'refunded', 'reason', v_why);
  end if;

  update public.membership_passes set status = 'active', bought_at = now(), updated_by = v_order.user_id where id = v_pass.id;
  update public.orders set status = 'paid', updated_by = v_order.user_id where id = v_order.id;
  return jsonb_build_object('outcome', 'granted', 'pass_id', v_pass.id);
end;
$$;

comment on function public.buy_membership(uuid) is
  'Take a membership. A free one is ACTIVE at once; a priced one comes back pending_payment and the caller opens the checkout. 30 Sep 2026: an unpaid pass holds no place and counts nowhere until it is paid for, and pressing Buy again RESUMES it at today''s price rather than making a second.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2 · a class starts ahead — the form's rule, kept by the row
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.class_session_starts_ahead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- the service role plants history (the seeder, the proofs, the shoots) and is
  -- exempt, like every guard in this project. ⚠ nullif before the cast: an
  -- unset setting is NULL and casts fine, an EMPTY one throws (19 Sep 2026).
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role' then
    return new;
  end if;
  -- an edit that leaves the start where it was is an edit of something else.
  -- ⚠ TO THE MINUTE, not to the microsecond (found by the dry run): the form's
  -- time control is HH:MM, so re-saving a class whose session was stamped with
  -- seconds hands back the same minute with the seconds dropped — measured at
  -- 5–10 s on 30 Sep — and an exact comparison would refuse the price edit of
  -- every class that has already run, which is the one thing this must not do.
  if tg_op = 'UPDATE' and date_trunc('minute', new.starts_at) = date_trunc('minute', old.starts_at) then
    return new;
  end if;
  -- the form's own sentence and the form's own minute of slack
  if new.starts_at < now() - interval '1 minute' then
    raise exception 'That start has already gone — pick a date and time ahead';
  end if;
  return new;
end;
$$;

comment on function public.class_session_starts_ahead() is
  'Trigger (30 Sep 2026): a class session may not be created in the past, or MOVED into it — the form has refused both since 28 Sep and the database now keeps the same rule with the same minute of slack. A past class''s price or people are still edited freely (an unchanged start passes). Service role exempt: planting a class that already ran is done by creating it ahead and back-dating the session as the service role.';

revoke all on function public.class_session_starts_ahead() from public;
revoke all on function public.class_session_starts_ahead() from anon;
revoke all on function public.class_session_starts_ahead() from authenticated;

drop trigger if exists class_sessions_start_ahead on public.class_sessions;
create trigger class_sessions_start_ahead
  before insert or update of starts_at on public.class_sessions
  for each row execute function public.class_session_starts_ahead();
