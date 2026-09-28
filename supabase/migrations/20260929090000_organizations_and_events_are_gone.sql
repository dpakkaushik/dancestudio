-- ORGANIZATIONS AND EVENTS ARE GONE — the database half (29 Sep 2026)
--
-- The user: "Remove Organization and Events completely from the system. all
-- mechanisms , stats , discover everything related to them should be wiped out
-- without hampering the other parts of the system."
--
-- The APP half shipped first and on purpose: nothing it draws selects a column
-- or calls a function this file drops, so that bundle runs against the database
-- as it stands today. This is the second half — it shuts the doors the app has
-- stopped drawing, so a token-holder cannot call them straight through
-- PostgREST and re-create what the sweep is about to remove.
--
-- ⚠⚠ WHAT THIS FILE DELIBERATELY DOES **NOT** DO, AND WHY — READ THIS FIRST.
--
-- (1) IT DROPS NO TABLE. `events`, `event_entry_tiers`, `event_ticket_tiers`
--     and `event_bookings` stay as TOMBSTONES, because **a ledger does not
--     forget money**: production carries 4 paid event orders with 4 captured
--     payments (₹1,500), and `orders.event_id` references `events`. A
--     `drop table events` cascades that column and takes those four orders and
--     their payments with it. `organization_members` stays for a second reason
--     as well — two SURVIVING functions read it (below).
--
-- (2) IT KEEPS FIVE FUNCTIONS THAT LOOK LIKE THEY BELONG ON THE LIST, BECAUSE
--     LIVE CODE STANDS ON THEM. This was read off the catalog rather than
--     remembered, and the catalog disagreed with the plan in four places:
--
--       org_is_public(uuid)        — called by person_follower_counts,
--                                    business_pictures_are_public,
--                                    business_header_photos, set_person_follow,
--                                    set_follow AND admin_grant_subscription,
--                                    and pinned by a policy on
--                                    organization_members. Dropping it would
--                                    have broken follows, header photos and the
--                                    admin's own grant.
--       why_no_organization()      — called by create_business_with_owner,
--                                    which is the door EVERY studio creation
--                                    goes through. Dropping it would have made
--                                    it impossible to open a studio.
--       event_host_is_public(uuid) — called by send_enquiry.
--       gstin_shape(text)          — pinned by two CHECK constraints,
--                                    profiles_gstin_shape and
--                                    businesses_gstin_shape.
--       guard_gstin()              — a BEFORE trigger on profiles.
--
--     Each of them answers "no / nothing" once the sweep has soft-deleted the
--     organization rows, which is the correct answer. They are dead branches,
--     not live ones — the same call the 28 Sep migration made about the eight
--     dead readers of profiles.role = 'org'.
--
-- (3) IT NARROWS NO CHECK CONSTRAINT. `profiles.role` still admits 'org' (52
--     soft-deleted rows carry the word) and `businesses.type` still admits it
--     (1,362 + 20 rows do). Narrowing either would refuse an UPDATE of any of
--     those rows — including the sweep's own — for no gain.
--
-- (4) IT LEAVES `apply_captured_payment_classes_and_events` ALONE, with its
--     event branch intact. That is the applier four real payments went through.
--
-- (5) IT LEAVES admin_dashboard()'s two event figures alone. They read 0 for
--     ever and are ADDED to other figures, so the arithmetic is already right;
--     rewriting a live function on a live database for zero visible change is
--     risk without benefit.
--
-- ⚠ Rule 9: this changes RLS (five policies) and drops security-definer doors.

begin;

-- ---------------------------------------------------------------------------
-- 0. THE MONEY IS WHERE WE THINK IT IS, OR THIS FILE DOES NOT RUN.
--    The tombstone decision rests on that count; if it is ever wrong, the
--    right thing is to stop rather than to proceed on a stale belief.
-- ---------------------------------------------------------------------------
do $guard$
declare
  v_orders integer;
begin
  select count(*) into v_orders from public.orders where event_id is not null;
  if v_orders <> 4 then
    raise exception
      'expected 4 orders naming an event (the tombstone reason); found %. Stop and re-read before dropping anything.',
      v_orders;
  end if;
end;
$guard$;

-- ---------------------------------------------------------------------------
-- 1. THE PUBLIC READS. A stranger stops being offered any of it.
--    The member / own-row policies STAY: somebody who bought a ticket keeps
--    being able to read the booking their invoice still names.
-- ---------------------------------------------------------------------------
drop policy "anyone reads published events of public hosts" on public.events;
drop policy "anyone reads public entry tiers"               on public.event_entry_tiers;
drop policy "anyone reads public ticket tiers"              on public.event_ticket_tiers;
drop policy "anyone reads a crew's entries"                 on public.event_bookings;
drop policy "anyone reads a public organization's confirmed team" on public.organization_members;

-- ---------------------------------------------------------------------------
-- 2. THE TRIGGERS THAT COULD STILL WRITE, and the functions behind them.
--    A notification about a thing that no longer exists is noise; a slug
--    trigger on a table nothing inserts into is dead weight.
-- ---------------------------------------------------------------------------
drop trigger events_need_a_verified_gstin on public.events;
drop trigger events_fill_share_slug       on public.events;
drop trigger notify_event_booking         on public.event_bookings;
drop trigger organization_members_notify  on public.organization_members;

drop function public.guard_event_needs_gstin();
drop function public.events_fill_share_slug();
drop function public.generate_event_slug(p_title text);
drop function public.notify_event_booking();
drop function public.notify_organization_member();

-- ---------------------------------------------------------------------------
-- 3. THE EVENT DOORS. Every one of these is a door the app no longer draws;
--    `save_event` and `book_event` are the two that could otherwise put the
--    data back after the sweep has taken it away.
-- ---------------------------------------------------------------------------
drop function public.save_event(p_business_id uuid, p_event_id uuid, p_event jsonb);
drop function public.publish_event(p_event_id uuid);
drop function public.book_event(p_event_id uuid, p_kind text, p_ticket_tier_id uuid, p_qty integer, p_format text, p_entrant_name text, p_partner_name text, p_crew_id uuid, p_partner_id uuid);
drop function public.cancel_event_booking(p_booking_id uuid, p_reason text);
drop function public.check_in_event_booking(p_booking_id uuid, p_in boolean);
drop function public.add_event_walk_in(p_event_id uuid, p_kind text, p_name text, p_ticket_tier_id uuid, p_format text);
drop function public.delete_event(p_event_id uuid);
drop function public.set_event_status(p_event_id uuid, p_status text);
drop function public.set_event_poster(p_event_id uuid, p_path text);
drop function public.event_counts(p_event_ids uuid[]);
drop function public.event_blockers(p_event_id uuid);
drop function public.create_event_payment_order(p_event_booking_id uuid);
drop function public.event_host_cards(p_business_ids uuid[]);
drop function public.event_host_name(p_business_id uuid);
drop function public.why_no_event(p_business_id uuid);
drop function public.respond_to_partner_ask(p_booking_id uuid, p_accept boolean);
-- R40 (20 Sep 2026) gave an organization's Event team this; with no events to
-- run, nothing asks it and nothing is pinned to it.
drop function public.can_run_events(p_business_id uuid);

-- ---------------------------------------------------------------------------
-- 4. THE ORGANIZATION DOORS.
-- ---------------------------------------------------------------------------
drop function public.ask_organization_member(p_org_id uuid, p_user_id uuid, p_role text);
drop function public.respond_to_organization_ask(p_member_id uuid, p_accept boolean);
drop function public.withdraw_organization_ask(p_member_id uuid);
drop function public.remove_organization_member(p_member_id uuid);
drop function public.set_organization_member_role(p_member_id uuid, p_role text, p_business_id uuid);
drop function public.org_seat_follows_label(p_org_id uuid, p_user_id uuid, p_role text, p_actor uuid);
drop function public.public_organization(p_org_id uuid);
drop function public.public_organization_team(p_org_id uuid);
drop function public.my_followed_organizations();
drop function public.my_org_stats();
-- The GST number was an organization's paperwork and nothing else's. The SHAPE
-- function stays (two CHECKs stand on it); what goes is the pair that WROTE it.
drop function public.verify_business_gstin(p_business_id uuid, p_gstin text);
drop function public.clear_business_gstin(p_business_id uuid);

-- ---------------------------------------------------------------------------
-- 5. SEARCH STOPS OFFERING A ROW THAT OPENS A 404.
--
--    The body below is the LIVE one with two CTEs removed — `events`, and the
--    `hosts` CTE that existed only to feed it — and the `union all` that read
--    from it. Everything else is byte-for-byte what the catalog holds.
--    Same signature, so the ACL does not move; still SECURITY INVOKER, so the
--    caller's own RLS keeps deciding what is found.
-- ---------------------------------------------------------------------------
create or replace function public.search_dance_os(p_q text, p_limit integer default 3)
returns table(kind text, id uuid, name text, sub text, href text)
language sql
stable
set search_path to ''
as $fn$
  with q as (
    select lower(trim(coalesce(p_q, ''))) as term,
           greatest(1, least(coalesce(p_limit, 3), 10)) as lim
  ),
  studios as (
    select 'studio'::text as kind, t.id, t.name,
           'Studio · ' || coalesce(t.city, '—') as sub,
           '/studio/' || t.id::text as href
    from public.businesses t, q
    where t.deleted_at is null and t.type = 'studio' and q.term <> ''
      and (lower(t.name) like q.term || '%' or lower(t.name) like '% ' || q.term || '%')
    order by t.name
    limit (select lim from q)
  ),
  -- ARTISTS ARE PEOPLE (18 Sep 2026), read through public_artists() (19 Sep
  -- 2026) so a stranger finds them without a policy on profiles
  artists as (
    select 'artist'::text as kind, a.id, a.full_name as name,
           'Artist · ' || coalesce(a.city, '—') as sub,
           '/person/' || a.id::text as href
    from public.public_artists() a, q
    where q.term <> ''
      and (lower(a.full_name) like q.term || '%' or lower(a.full_name) like '% ' || q.term || '%')
    order by a.full_name
    limit (select lim from q)
  ),
  crews as (
    select 'crew'::text as kind, c.id, c.name,
           'Crew · ' || c.city as sub,
           '/crew/' || c.id::text as href
    from public.crews c, q
    where c.deleted_at is null and q.term <> ''
      and (lower(c.name) like q.term || '%' or lower(c.name) like '% ' || q.term || '%')
    order by c.name
    limit (select lim from q)
  ),
  -- PEOPLE are the users WITHOUT a plan — an artist is listed above, once; the
  -- caller's own RLS decides (a stranger reads no profile row, so none)
  people as (
    select 'person'::text as kind, p.id, p.full_name as name,
           'User · ' || coalesce(p.city, '—') as sub,
           '/person/' || p.id::text as href
    from public.profiles p, q
    where p.deleted_at is null and p.role <> 'org' and q.term <> ''
      and not public.artist_plan_active(p.id)
      and (lower(p.full_name) like q.term || '%' or lower(p.full_name) like '% ' || q.term || '%')
    order by p.full_name
    limit (select lim from q)
  )
  select * from studios
  union all select * from artists
  union all select * from crews
  union all select * from people;
$fn$;

-- It resolved the public hosts for the events branch and had no other caller.
drop function public.public_host_ids(p_term text);

-- ---------------------------------------------------------------------------
-- 6. A CREW'S POINTS ARE ITS CONFIRMED MEMBERS.
--
--    The crew board scored `(events entered × 3) + (members × 1)`. With no
--    events, the first term is 0 for everybody for ever — so it is removed
--    rather than left to read as a real score of zero. The app's own
--    CREW_POINT_RULES already prints one rule.
--
--    ⚠ This is dance_chart_all, NOT dance_chart: push 2 (19 Sep 2026) split
--    them, and dance_chart_all is the ungated core that holds the arithmetic.
--    dance_chart is a thin wrapper and is not touched.
--
--    Only the `else` (crew) branch changes; the three branches above it are
--    the catalog's own, unedited. The RETURNS TABLE shape is unchanged, so no
--    ACL moves — `conducted` simply carries 0 for a crew now.
-- ---------------------------------------------------------------------------
do $rewrite$
declare
  v_def text;
  v_old text;
  v_new text;
  v_hits integer;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'dance_chart_all';

  -- The whole crew branch, exactly as the catalog holds it.
  v_old :=
    '    with entered as (' || e'\n' ||
    '      select b.crew_id as cid, count(*)::integer as n_ev' || e'\n' ||
    '      from public.event_bookings b' || e'\n' ||
    '      join public.events e on e.id = b.event_id' || e'\n' ||
    '      where b.crew_id is not null and b.status = ''booked'' and b.deleted_at is null' || e'\n' ||
    '        and e.deleted_at is null and e.status in (''published'', ''completed'')' || e'\n' ||
    '        and (p_style is null or e.style = p_style)' || e'\n' ||
    '      group by b.crew_id' || e'\n' ||
    '    ),' || e'\n' ||
    '    roster as (';

  -- ⚠ `with` led the chain and `entered` was its FIRST member, so the keyword
  -- has to move onto `roster` — dropping the CTE alone leaves a bare `roster as`.
  v_new :=
    '    -- 29 Sep 2026: the `entered` CTE counted a crew''s event entries and' || e'\n' ||
    '    -- there are no events. A crew''s points are its confirmed members.' || e'\n' ||
    '    with roster as (';

  v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / nullif(length(v_old), 0);
  if coalesce(v_hits, 0) <> 1 then
    raise exception 'dance_chart_all: expected the crew `entered` CTE exactly once, found %', coalesce(v_hits, 0);
  end if;
  v_def := replace(v_def, v_old, v_new);

  -- The join onto it, and the two places n_ev is read.
  v_old := '      from public.crews c' || e'\n' ||
           '      left join entered x on x.cid = c.id' || e'\n' ||
           '      left join roster r on r.cid = c.id';
  v_new := '      from public.crews c' || e'\n' ||
           '      left join roster r on r.cid = c.id';
  if position(v_old in v_def) = 0 then
    raise exception 'dance_chart_all: the join onto `entered` is not where the catalog said';
  end if;
  v_def := replace(v_def, v_old, v_new);

  v_old := '             coalesce(x.n_ev, 0) as n_ev, coalesce(r.n_mem, 0) as n_mem';
  v_new := '             0 as n_ev, coalesce(r.n_mem, 0) as n_mem';
  if position(v_old in v_def) = 0 then
    raise exception 'dance_chart_all: the n_ev projection is not where the catalog said';
  end if;
  v_def := replace(v_def, v_old, v_new);

  v_old := '             round((n_ev * 3.0) + (n_mem * 1.0), 1) as pts';
  v_new := '             round(n_mem * 1.0, 1) as pts';
  if position(v_old in v_def) = 0 then
    raise exception 'dance_chart_all: the crew points formula is not where the catalog said';
  end if;
  v_def := replace(v_def, v_old, v_new);

  if position('event_bookings' in v_def) > 0 or position('public.events' in v_def) > 0 then
    raise exception 'dance_chart_all: an event reference survived the rewrite';
  end if;

  execute v_def;
end;
$rewrite$;

-- ---------------------------------------------------------------------------
-- 7. THE TOMBSTONES SAY SO, so the next person to read this schema does not
--    spend an afternoon looking for the feature that reaches them.
-- ---------------------------------------------------------------------------
comment on table public.events is
  'TOMBSTONE (29 Sep 2026). Events were removed from DanceOS. This table is kept because orders.event_id references it and four real, paid orders name it — a ledger does not forget money. Nothing writes here any more: every door was dropped and the rows are soft-deleted.';
comment on table public.event_entry_tiers is
  'TOMBSTONE (29 Sep 2026) — see public.events.';
comment on table public.event_ticket_tiers is
  'TOMBSTONE (29 Sep 2026) — see public.events.';
comment on table public.event_bookings is
  'TOMBSTONE (29 Sep 2026). Kept with public.events: orders.event_booking_id references it, and four captured payments hang off those orders.';
comment on table public.organization_members is
  'TOMBSTONE (29 Sep 2026). Organizations were removed from DanceOS. The table is kept because has_been_asked_by_business() and can_run_register_for_class()''s neighbours still read it and answer false, and because narrowing it buys nothing. Every door was dropped; the rows are soft-deleted.';

comment on column public.orders.event_id is
  'TOMBSTONE (29 Sep 2026). Events are gone from the product; this column stays because four paid orders name one. Never written again.';
comment on column public.businesses.gstin is
  'TOMBSTONE (29 Sep 2026). The GST number was an organization''s paperwork. The write doors are dropped; the shape CHECK stays so the stored values remain valid.';

commit;
