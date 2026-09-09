-- R15 (9 Sep 2026, the user's ask): an event belongs to the ORGANIZATION.
-- ⚠ Rule 9: RLS.
--
-- "Right now event is inside studio, though it should be at org level."
--
-- And it should be: an organization runs a battle in a rented hall, not "at"
-- one of its studios. `events` has always carried its own venue, address, city
-- and map link, so the studio on it was never the place — only the owner. That
-- ownership is what moves.
--
-- HOW, and why this shape. Every event table is keyed on `tenant_id`
-- (`events`, `event_entry_tiers`, `event_ticket_tiers`, `event_bookings`),
-- forty references across thirteen functions and eight policies, all of which
-- work correctly today. So rather than re-plumb the lot onto a profile id, an
-- organization gets ONE tenant of its own — `tenants.type = 'org'` — and that
-- row becomes the host. Every function, every policy and the route
-- `/business/<id>/events` keep working unchanged, and the public event page's
-- "by {name}" line prints the ORGANIZATION's name, which is what the user chose
-- when asked whose name a public event should carry.
--
-- THE ORGANIZATION IS STILL NOT BROWSABLE (R9). Its hosting tenant is
-- `visibility = 'unlisted'` for ever: it is never on Discover, never in search
-- (both filter on the two public types by name), has no public page, and cannot
-- be followed (`set_follow` refuses an unlisted business). It is visible in
-- exactly one place — as the host named on an event it runs. So "listed" keeps
-- meaning "on Discover", and a new function decides an event's publicness
-- instead:
--
--   * a studio or artist page hosts publicly while it is LISTED (unchanged);
--   * an organization hosts publicly while it is VERIFIED and not suspended.
--
-- A studio can no longer host an event at all: `save_event` refuses one, and
-- the four events that existed are moved to their organizations by this
-- migration, tiers and bookings with them.

-- ── 1. a third kind of tenant, and it is never public ───────────────────────
alter table public.tenants drop constraint tenants_type_check;
alter table public.tenants add constraint tenants_type_check
  check (type in ('studio', 'trainer_business', 'org'));
comment on column public.tenants.type is
  'studio | trainer_business (an artist page) | org (an organization''s own hosting row, R15 9 Sep 2026 — never listed, never on Discover, never in search; it exists so an event can belong to the organization and print its name).';

/** An organization's one hosting row, made if it is not there yet.
 *
 *  Idempotent and safe to call from anywhere: it returns the existing row's id
 *  whenever one is live. Named after the organization and carrying its city, so
 *  the event page and the events desk read as the organization. */
create or replace function public.ensure_org_tenant(p_org_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text;
  v_city text;
  v_lat double precision;
  v_lng double precision;
begin
  select t.id into v_id
    from public.tenants t
    join public.tenant_members m on m.tenant_id = t.id
   where m.user_id = p_org_id and m.member_role = 'owner' and m.deleted_at is null
     and t.type = 'org' and t.deleted_at is null
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select p.full_name, p.city into v_name, v_city
    from public.profiles p where p.id = p_org_id and p.role = 'org' and p.deleted_at is null;
  if not found then
    raise exception 'only an organization has an events host';
  end if;

  select c.lat, c.lng into v_lat, v_lng
    from public.city_centroids c where c.city = v_city and c.deleted_at is null;

  insert into public.tenants (type, name, city, lat, lng, visibility, created_by, updated_by)
  values ('org', v_name, v_city, v_lat, v_lng, 'unlisted', p_org_id, p_org_id)
  returning id into v_id;

  insert into public.tenant_members (tenant_id, user_id, member_role, created_by, updated_by)
  values (v_id, p_org_id, 'owner', p_org_id, p_org_id);

  return v_id;
end;
$$;
comment on function public.ensure_org_tenant(uuid) is
  'The organization''s single hosting tenant (type org), created on first need. Never listed — it exists so an event can belong to the organization rather than to one of its studios (R15).';
revoke execute on function public.ensure_org_tenant(uuid) from public, anon, authenticated;

/** The caller's own hosting row. What the hub and the events desk ask for. */
create or replace function public.my_org_tenant()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select p.role into v_role from public.profiles p where p.id = v_user and p.deleted_at is null;
  if not found then raise exception 'finish onboarding first'; end if;
  if v_role <> 'org' then raise exception 'only an organization hosts events under its own name'; end if;
  return public.ensure_org_tenant(v_user);
end;
$$;
comment on function public.my_org_tenant() is
  'The signed-in organization''s events host, made if it is not there yet (R15).';
revoke execute on function public.my_org_tenant() from public, anon;
grant execute on function public.my_org_tenant() to authenticated;

-- every organization that exists gets one now, so no screen has to make it
do $$
declare r record;
begin
  for r in select p.id from public.profiles p where p.role = 'org' and p.deleted_at is null loop
    perform public.ensure_org_tenant(r.id);
  end loop;
end $$;

-- and every organization made from here gets one as it is created
create or replace function public.make_org_tenant_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'org' and new.deleted_at is null then
    perform public.ensure_org_tenant(new.id);
  end if;
  return new;
end;
$$;
create trigger profiles_make_org_tenant
  after insert on public.profiles
  for each row execute function public.make_org_tenant_on_signup();

-- ── 2. when is an event's host public? ──────────────────────────────────────
/** A studio or artist page hosts publicly while it is LISTED. An organization
 *  hosts publicly while it is VERIFIED and not suspended — its hosting row is
 *  unlisted for ever, because it is not a business anybody browses to.
 *
 *  This is the one place that decides it; the four public event policies below
 *  all ask this and nothing else. */
create or replace function public.event_host_is_public(p_tenant_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select case
    when t.type = 'org' then exists (
      select 1 from public.tenant_members m
      join public.profiles p on p.id = m.user_id
      where m.tenant_id = t.id and m.member_role = 'owner' and m.deleted_at is null
        and p.verified_at is not null and p.suspended_at is null and p.deleted_at is null
    )
    else t.visibility = 'listed'
  end
  from public.tenants t
  where t.id = p_tenant_id and t.deleted_at is null;
$$;
comment on function public.event_host_is_public(uuid) is
  'Whether the tenant hosting an event may show it to the public: a studio or artist page while LISTED, an organization while VERIFIED and not suspended (R15, 9 Sep 2026).';
revoke execute on function public.event_host_is_public(uuid) from public;
grant execute on function public.event_host_is_public(uuid) to anon, authenticated;

drop policy if exists "anyone reads published events of listed tenants" on public.events;
create policy "anyone reads published events of public hosts" on public.events
  for select to anon, authenticated
  using (deleted_at is null and status = 'published' and public.event_host_is_public(tenant_id));

drop policy if exists "anyone reads public entry tiers" on public.event_entry_tiers;
create policy "anyone reads public entry tiers" on public.event_entry_tiers
  for select to anon, authenticated
  using (
    deleted_at is null
    and exists (select 1 from public.events e
                 where e.id = event_entry_tiers.event_id and e.status = 'published'
                   and e.deleted_at is null and public.event_host_is_public(e.tenant_id))
  );

drop policy if exists "anyone reads public ticket tiers" on public.event_ticket_tiers;
create policy "anyone reads public ticket tiers" on public.event_ticket_tiers
  for select to anon, authenticated
  using (
    deleted_at is null
    and exists (select 1 from public.events e
                 where e.id = event_ticket_tiers.event_id and e.status = 'published'
                   and e.deleted_at is null and public.event_host_is_public(e.tenant_id))
  );

drop policy if exists "anyone reads a crew's entries" on public.event_bookings;
create policy "anyone reads a crew's entries" on public.event_bookings
  for select to anon, authenticated
  using (
    crew_id is not null and status = 'booked' and deleted_at is null
    and exists (select 1 from public.events e
                 where e.id = event_bookings.event_id
                   and e.status in ('published', 'completed')
                   and e.deleted_at is null and public.event_host_is_public(e.tenant_id))
  );

-- ── 3. an event is the organization's to save, not a studio's ───────────────
-- `save_event` is otherwise unchanged; the one addition is the refusal, so the
-- rule lives at the door rather than only in the screen that draws the door.
create or replace function public.save_event(p_tenant_id uuid, p_event_id uuid, p_event jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid := p_event_id;
  v_row public.events;
  v_t jsonb;
  v_keep uuid[] := '{}';
  v_tid uuid;
  v_fmt text;
  v_type text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not public.can_run_events(p_tenant_id) then
    raise exception 'only the people who run this business can run its events';
  end if;
  -- R15 (9 Sep 2026): the one addition to this function. An event is the
  -- organization's; a studio is a place with rooms in it.
  select t.type into v_type from public.tenants t where t.id = p_tenant_id and t.deleted_at is null;
  if v_type = 'studio' then
    raise exception 'an event belongs to the organization, not to one of its studios — open Events from your business hub';
  end if;

  if v_id is null then
    insert into public.events (tenant_id, cat, title, style, start_date, end_date, start_time, venue, address, city, maps_url, about,
                               entry_format, bracket, rounds, prizes, tickets_on, created_by, updated_by)
    values (p_tenant_id,
            p_event->>'cat', trim(p_event->>'title'), coalesce(nullif(trim(p_event->>'style'), ''), 'All styles'),
            (p_event->>'start_date')::date, (p_event->>'end_date')::date, coalesce((p_event->>'start_time')::time, '18:00'),
            trim(p_event->>'venue'), nullif(trim(coalesce(p_event->>'address', '')), ''), trim(p_event->>'city'), trim(p_event->>'maps_url'),
            nullif(trim(coalesce(p_event->>'about', '')), ''),
            coalesce(p_event->>'entry_format', 'none'), coalesce((p_event->>'bracket')::integer, 0), coalesce((p_event->>'rounds')::integer, 0),
            coalesce((select array_agg((x)::integer) from jsonb_array_elements_text(coalesce(p_event->'prizes', '[]'::jsonb)) x), '{}'),
            coalesce((p_event->>'tickets_on')::boolean, true), v_user, v_user)
    returning * into v_row;
    v_id := v_row.id;
  else
    select * into v_row from public.events e where e.id = v_id and e.tenant_id = p_tenant_id and e.deleted_at is null;
    if not found then
      raise exception 'event not found';
    end if;
    update public.events set
      title = trim(p_event->>'title'), style = coalesce(nullif(trim(p_event->>'style'), ''), 'All styles'),
      start_date = (p_event->>'start_date')::date, end_date = (p_event->>'end_date')::date,
      start_time = coalesce((p_event->>'start_time')::time, start_time),
      venue = trim(p_event->>'venue'), address = nullif(trim(coalesce(p_event->>'address', '')), ''), city = trim(p_event->>'city'),
      maps_url = trim(p_event->>'maps_url'), about = nullif(trim(coalesce(p_event->>'about', '')), ''),
      entry_format = coalesce(p_event->>'entry_format', entry_format),
      bracket = coalesce((p_event->>'bracket')::integer, bracket), rounds = coalesce((p_event->>'rounds')::integer, rounds),
      prizes = coalesce((select array_agg((x)::integer) from jsonb_array_elements_text(coalesce(p_event->'prizes', '[]'::jsonb)) x), '{}'),
      tickets_on = coalesce((p_event->>'tickets_on')::boolean, tickets_on),
      updated_by = v_user
      where id = v_id;
  end if;

  -- entry tiers: {format, fee_inr, capacity}
  v_keep := '{}';
  for v_t in select * from jsonb_array_elements(coalesce(p_event->'entry_tiers', '[]'::jsonb)) loop
    v_fmt := v_t->>'format';
    select id into v_tid from public.event_entry_tiers where event_id = v_id and format = v_fmt and deleted_at is null;
    if v_tid is null then
      insert into public.event_entry_tiers (event_id, tenant_id, format, fee_inr, capacity, created_by, updated_by)
      values (v_id, p_tenant_id, v_fmt, coalesce((v_t->>'fee_inr')::integer, 0), coalesce((v_t->>'capacity')::integer, 0), v_user, v_user)
      returning id into v_tid;
    else
      update public.event_entry_tiers set fee_inr = coalesce((v_t->>'fee_inr')::integer, 0),
        capacity = coalesce((v_t->>'capacity')::integer, 0), updated_by = v_user where id = v_tid;
    end if;
    v_keep := v_keep || v_tid;
  end loop;
  update public.event_entry_tiers set deleted_at = now(), updated_by = v_user
    where event_id = v_id and deleted_at is null and not (id = any (v_keep));

  -- ticket tiers: {id?, name, price_inr, capacity, sort}
  v_keep := '{}';
  for v_t in select * from jsonb_array_elements(coalesce(p_event->'ticket_tiers', '[]'::jsonb)) loop
    v_tid := null;
    if coalesce(v_t->>'id', '') <> '' then
      select id into v_tid from public.event_ticket_tiers where id = (v_t->>'id')::uuid and event_id = v_id and deleted_at is null;
    end if;
    if v_tid is null then
      insert into public.event_ticket_tiers (event_id, tenant_id, name, price_inr, capacity, sort, created_by, updated_by)
      values (v_id, p_tenant_id, trim(v_t->>'name'), coalesce((v_t->>'price_inr')::integer, 0), (v_t->>'capacity')::integer,
              coalesce((v_t->>'sort')::integer, 0), v_user, v_user)
      returning id into v_tid;
    else
      update public.event_ticket_tiers set name = trim(v_t->>'name'), price_inr = coalesce((v_t->>'price_inr')::integer, 0),
        capacity = (v_t->>'capacity')::integer, sort = coalesce((v_t->>'sort')::integer, 0), updated_by = v_user where id = v_tid;
    end if;
    v_keep := v_keep || v_tid;
  end loop;
  update public.event_ticket_tiers set deleted_at = now(), updated_by = v_user
    where event_id = v_id and deleted_at is null and not (id = any (v_keep));

  return v_id;
end;
$$;
comment on function public.save_event(uuid, uuid, jsonb) is
  'Create or edit an event. Refused for a STUDIO host: an event belongs to the organization (R15, 9 Sep 2026). Tiers are reconciled, never replaced, so a tier that keeps its id keeps its bookings.';
revoke execute on function public.save_event(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_event(uuid, uuid, jsonb) to authenticated;

-- ── 4. the organization's hosting row is not a business anybody browses ─────
create or replace function public.nearby_tenants(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 25,
  p_type text default null
)
returns table (id uuid, type text, name text, area text, city text, distance_km double precision)
language sql
stable
as $$
  select t.id, t.type, t.name, t.area, t.city,
    round((extensions.st_distance(
      extensions.st_setsrid(extensions.st_makepoint(t.lng, t.lat), 4326)::extensions.geography,
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
    ) / 1000.0)::numeric, 1)::double precision as distance_km
  from public.tenants t
  where t.deleted_at is null
    -- R15: an organization's hosting row is not a place anybody goes to
    and t.type <> 'org'
    and t.lat is not null and t.lng is not null
    and (p_type is null or t.type = p_type)
    and extensions.st_dwithin(
      extensions.st_setsrid(extensions.st_makepoint(t.lng, t.lat), 4326)::extensions.geography,
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
      p_radius_km * 1000.0
    )
  order by distance_km
  limit 50;
$$;
comment on function public.nearby_tenants(double precision, double precision, double precision, text) is
  'Businesses near a point, SECURITY INVOKER so the caller''s own RLS decides what is found. Organizations'' hosting rows are excluded — they are not places (R15).';

-- the panel's Businesses list is about businesses, so it skips the hosting rows
create or replace function public.admin_businesses(p_q text default null, p_limit integer default 50)
-- the OUT columns keep the order the applied function already has: Postgres
-- refuses to change a function's return type, so a "create or replace" that
-- reshuffles them fails the whole migration
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
language sql
security definer
set search_path = ''
stable
as $$
  select t.id, t.type, t.name, t.city, t.area, t.visibility, t.photo_path, t.verified_at,
         o.id, o.full_name, o.role, o.verified_at is not null, o.suspended_at is not null,
         (select count(*)::integer from public.rooms r where r.tenant_id = t.id and r.deleted_at is null),
         (select count(*)::integer from public.classes c where c.tenant_id = t.id and c.deleted_at is null),
         (select count(*)::integer from public.events e where e.tenant_id = t.id and e.deleted_at is null),
         (select count(*)::integer from public.follows f where f.tenant_id = t.id and f.deleted_at is null),
         t.created_at
  from public.tenants t
  left join lateral (
    select p.id, p.full_name, p.role, p.verified_at, p.suspended_at
    from public.tenant_members m
    join public.profiles p on p.id = m.user_id
    where m.tenant_id = t.id and m.member_role = 'owner' and m.deleted_at is null and p.deleted_at is null
    limit 1
  ) o on true
  where t.deleted_at is null
    -- R15: an organization's hosting row is not a business
    and t.type <> 'org'
    and public.is_platform_admin()
    and (
      p_q is null or btrim(p_q) = ''
      or t.name ilike '%' || btrim(p_q) || '%'
      or coalesce(t.city, '') ilike '%' || btrim(p_q) || '%'
      or coalesce(o.full_name, '') ilike '%' || btrim(p_q) || '%'
    )
  order by t.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;
comment on function public.admin_businesses(text, integer) is
  'Every studio and artist page for the admin panel, with what it holds and who owns it. Organizations'' event-hosting rows are not businesses and are excluded (R15).';
revoke execute on function public.admin_businesses(text, integer) from public, anon;
grant execute on function public.admin_businesses(text, integer) to authenticated;

-- ── 5. the events that already exist move to their organizations ───────────
-- Four live events, every one of them hosted by a studio. The event, its two
-- kinds of tier and its bookings all carry `tenant_id`, so all four move
-- together or the event breaks in half.
do $$
declare
  r record;
  v_host uuid;
begin
  for r in
    select e.id as event_id, e.tenant_id as studio_id, m.user_id as org_id
      from public.events e
      join public.tenants t on t.id = e.tenant_id and t.type = 'studio'
      join public.tenant_members m on m.tenant_id = t.id and m.member_role = 'owner' and m.deleted_at is null
      join public.profiles p on p.id = m.user_id and p.role = 'org' and p.deleted_at is null
  loop
    v_host := public.ensure_org_tenant(r.org_id);
    update public.events set tenant_id = v_host where id = r.event_id;
    update public.event_entry_tiers set tenant_id = v_host where event_id = r.event_id;
    update public.event_ticket_tiers set tenant_id = v_host where event_id = r.event_id;
    update public.event_bookings set tenant_id = v_host where event_id = r.event_id;
  end loop;
end $$;
