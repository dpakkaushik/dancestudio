-- R15, the two functions the policies alone did not cover (10 Sep 2026)
-- ⚠ Rule 9: RLS-adjacent.
--
-- `20260911160000` moved the four PUBLIC event policies onto
-- `event_host_is_public()`, and that was not the whole of it. Two functions ask
-- the same question inside their own bodies, where no policy reaches:
--
--   * `book_event` refused every booking on an organization's event with "this
--     event is not open to the public", because an organization's hosting row is
--     unlisted for ever and the old predicate was "is the host LISTED";
--   * `event_counts` — the aggregate every card and page uses for "1 booked ·
--     149 still available" — left an organization's event out of its own counts
--     for anybody who is not a member of the host.
--
-- The e2e caught the first: a learner could see the event and not buy a seat.
-- Nothing but a real booking would have shown it, which is the argument for the
-- test rather than for reading the policies again.
--
-- Both bodies below are the APPLIED definitions with that one predicate
-- swapped, generated from the live catalog rather than retyped, so the only
-- difference from what is running is the difference intended.

CREATE OR REPLACE FUNCTION public.book_event(p_event_id uuid, p_kind text, p_ticket_tier_id uuid DEFAULT NULL::uuid, p_qty integer DEFAULT 1, p_format text DEFAULT NULL::text, p_entrant_name text DEFAULT NULL::text, p_partner_name text DEFAULT NULL::text, p_crew_id uuid DEFAULT NULL::uuid, p_partner_id uuid DEFAULT NULL::uuid)
 RETURNS event_bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v public.events;
  v_tier public.event_ticket_tiers;
  v_entry public.event_entry_tiers;
  v_crew public.crews;
  v_sold integer;
  v_cap integer;
  v_price integer;
  v_name text;
  v_partner_name text;
  v_row public.event_bookings;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user and p.deleted_at is null) then
    raise exception 'finish onboarding before booking';
  end if;
  select * into v from public.events e where e.id = p_event_id and e.deleted_at is null for update;
  if not found or v.status <> 'published' then
    raise exception 'this event is not open for booking';
  end if;
  if v.end_date < (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'this event is over';
  end if;
  -- R15 (9 Sep 2026): an ORGANIZATION hosts its own events and its hosting row
  -- is unlisted for ever, so "is the host listed" is the wrong question now.
  -- event_host_is_public asks the right one: a studio or artist page while it
  -- is LISTED, an organization while it is VERIFIED and not suspended.
  if not public.event_host_is_public(v.tenant_id) then
    raise exception 'this event is not open to the public';
  end if;
  -- the people who run it do not book it (prototype: "Studios can't book", 13273)
  if exists (select 1 from public.tenant_members m where m.tenant_id = v.tenant_id and m.user_id = v_user and m.deleted_at is null) then
    raise exception 'you run this event — the register is yours, not a ticket';
  end if;

  if p_kind = 'spectator' then
    if not v.tickets_on then
      raise exception 'this event sells no tickets';
    end if;
    select * into v_tier from public.event_ticket_tiers t where t.id = p_ticket_tier_id and t.event_id = v.id and t.deleted_at is null;
    if not found then
      raise exception 'that ticket tier is not on sale';
    end if;
    if p_qty is null or p_qty < 1 or p_qty > 20 then
      raise exception 'between 1 and 20 tickets at a time';
    end if;
    select coalesce(sum(b.qty), 0) into v_sold from public.event_bookings b
      where b.ticket_tier_id = v_tier.id and b.status = 'booked' and b.deleted_at is null;
    if v_sold + p_qty > v_tier.capacity then
      raise exception 'only % left in %', greatest(0, v_tier.capacity - v_sold), v_tier.name;
    end if;
    v_price := v_tier.price_inr * p_qty;
    if v_price > 0 then
      raise exception 'payments aren''t switched on yet — this tier costs money';
    end if;
    insert into public.event_bookings (event_id, tenant_id, user_id, kind, ticket_tier_id, qty, amount_inr, created_by, updated_by)
    values (v.id, v.tenant_id, v_user, 'spectator', v_tier.id, p_qty, 0, v_user, v_user)
    returning * into v_row;
    return v_row;
  end if;

  if p_kind = 'participant' then
    -- a showcase is watched: the host builds the line-up (13245)
    if v.cat = 'showcase' then
      raise exception 'a showcase is invite-only — the host builds the line-up';
    end if;
    select * into v_entry from public.event_entry_tiers t where t.event_id = v.id and t.format = p_format and t.deleted_at is null;
    if not found then
      raise exception 'this event does not take % entries', coalesce(p_format, 'that kind of');
    end if;

    -- A DUET IS TWO PEOPLE (13362-13395): the partner is a person on DanceOS,
    -- named here and asked; they cannot confirm from outside it
    if p_format = 'duo' then
      if p_partner_id is null then
        raise exception 'a duet needs your partner — pick them from DanceOS';
      end if;
      if p_partner_id = v_user then
        raise exception 'your partner is somebody else';
      end if;
      select p.full_name into v_partner_name from public.profiles p where p.id = p_partner_id and p.deleted_at is null;
      if v_partner_name is null then
        raise exception 'that partner is not on DanceOS';
      end if;
    end if;

    -- A CREW IS ENTERED BY THE PERSON WHO LEADS IT (13397-13420)
    if p_format = 'crew' then
      if p_crew_id is null then
        raise exception 'pick the crew you are entering — only its leader can put it forward';
      end if;
      select * into v_crew from public.crews c where c.id = p_crew_id and c.deleted_at is null;
      if not found then
        raise exception 'that crew no longer exists';
      end if;
      if v_crew.leader_id <> v_user then
        raise exception 'only the person who leads % can enter it', v_crew.name;
      end if;
      if exists (select 1 from public.event_bookings b where b.event_id = v.id and b.crew_id = v_crew.id
                   and b.status = 'booked' and b.deleted_at is null) then
        raise exception '% has already entered', v_crew.name;
      end if;
    end if;

    -- one entry per person per format
    if exists (select 1 from public.event_bookings b where b.event_id = v.id and b.user_id = v_user and b.kind = 'participant'
                 and b.entry_format = p_format and b.status = 'booked' and b.deleted_at is null) then
      raise exception 'you have already entered';
    end if;
    select count(*) into v_sold from public.event_bookings b
      where b.event_id = v.id and b.kind = 'participant' and b.entry_format = p_format and b.status = 'booked' and b.deleted_at is null;
    v_cap := case when v_entry.capacity = 0 then 500 else v_entry.capacity end;
    if v_sold >= v_cap then
      raise exception 'the % places are full', p_format;
    end if;
    if v_entry.fee_inr > 0 then
      raise exception 'payments aren''t switched on yet — this entry costs money';
    end if;
    v_name := case when p_format = 'crew' then v_crew.name
                   else nullif(trim(coalesce(p_entrant_name, '')), '') end;
    insert into public.event_bookings (event_id, tenant_id, user_id, kind, entry_format, qty, entrant_name, partner_name, partner_id, partner_status, crew_id, amount_inr, created_by, updated_by)
    values (v.id, v.tenant_id, v_user, 'participant', p_format, 1, v_name,
            case when p_format = 'duo' then v_partner_name else nullif(trim(coalesce(p_partner_name, '')), '') end,
            case when p_format = 'duo' then p_partner_id else null end,
            case when p_format = 'duo' then 'asked' else null end,
            case when p_format = 'crew' then v_crew.id else null end,
            0, v_user, v_user)
    returning * into v_row;
    return v_row;
  end if;

  raise exception 'unknown booking kind';
end;
$function$;
comment on function public.book_event(uuid, text, uuid, integer, text, text, text, uuid, uuid) is
  'Book a free seat or enter a free format. Refuses a priced tier (no rail yet), a member of the host, a second entry in one format, and a host that is not public — which since R15 means a verified organization or a listed studio / artist page.';
revoke execute on function public.book_event(uuid, text, uuid, integer, text, text, text, uuid, uuid) from public, anon;
grant execute on function public.book_event(uuid, text, uuid, integer, text, text, text, uuid, uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.event_counts(p_event_ids uuid[])
 RETURNS TABLE(event_id uuid, ticket_tier_id uuid, entry_format text, kind text, n bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select b.event_id, b.ticket_tier_id, b.entry_format, b.kind, sum(b.qty)::bigint as n
  from public.event_bookings b
  join public.events e on e.id = b.event_id
  where b.event_id = any (p_event_ids)
    and b.status = 'booked' and b.deleted_at is null and e.deleted_at is null
    and (
      (e.status = 'published' and public.event_host_is_public(e.tenant_id))
      or public.is_tenant_member(e.tenant_id)
    )
  group by b.event_id, b.ticket_tier_id, b.entry_format, b.kind;
$function$;
comment on function public.event_counts(uuid[]) is
  'How full each side of an event is — aggregates only, never who. Public for an event whose host is public (R15), and to the host''s own members for a draft.';
revoke execute on function public.event_counts(uuid[]) from public;
grant execute on function public.event_counts(uuid[]) to anon, authenticated;

-- ── and one figure the hosting rows quietly spoiled ─────────────────────────
-- The panel's WHAT EXISTS grid counted every tenant, so each organization's
-- hosting row showed up under "not public yet" — a number an admin cannot act
-- on, next to numbers they can. Studios and artist pages only.
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
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
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
      'subscriptions', (select count(*) from public.profiles p
                         where p.role = 'org' and p.verified_at is not null
                           and p.deleted_at is null and p.suspended_at is null
                           and not exists (select 1 from public.org_plans o
                                            where o.org_id = p.id and o.deleted_at is null
                                              and o.ended_at is null and o.until >= v_today)),
      'refunds', (select count(*) from public.refunds r where r.status in ('requested', 'pending') and r.deleted_at is null),
      'stuck_webhooks', (select count(*) from public.webhook_events w where w.processed_at is null)
    ),
    'accounts', jsonb_build_object(
      'users', (select count(*) from public.profiles p where p.role = 'user' and p.deleted_at is null and p.suspended_at is null),
      'orgs', (select count(*) from public.profiles p where p.role = 'org' and p.deleted_at is null and p.suspended_at is null),
      'artists', (select count(*) from public.artist_plans a where a.ended_at is null and a.until >= v_today),
      'verified_orgs', (select count(*) from public.profiles p where p.role = 'org' and p.verified_at is not null and p.deleted_at is null),
      'subscribed_orgs', (select count(distinct o.org_id) from public.org_plans o
                           where o.deleted_at is null and o.ended_at is null and o.until >= v_today),
      'suspended', (select count(*) from public.profiles p where p.suspended_at is not null and p.deleted_at is null),
      'admins', (select count(*) from public.platform_admins a where a.deleted_at is null),
      'new_this_week', (select count(*) from public.profiles p where p.created_at >= v_week and p.deleted_at is null)
    ),
    'businesses', jsonb_build_object(
      'studios', (select count(*) from public.tenants t where t.type = 'studio' and t.deleted_at is null),
      'artist_pages', (select count(*) from public.tenants t where t.type = 'trainer_business' and t.deleted_at is null),
      -- R15: an organization's hosting row is unlisted for ever and is not a
      -- business, so counting it as "not public yet" would put a number on this
      -- panel that no admin can ever act on
      'listed', (select count(*) from public.tenants t where t.visibility = 'listed' and t.type <> 'org' and t.deleted_at is null),
      'unlisted', (select count(*) from public.tenants t where t.visibility = 'unlisted' and t.type <> 'org' and t.deleted_at is null),
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
  'The platform pulse for a platform admin: what is waiting on a decision (verifications, conversations, reports, subscriptions to set up, refunds, stuck webhooks), what exists, what moved this week. Aggregate only.';
revoke execute on function public.admin_dashboard() from public, anon;
grant execute on function public.admin_dashboard() to authenticated;
