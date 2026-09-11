-- ─────────────────────────────────────────────────────────────────────────────
-- AN EVENT HAS A PLACE TOO (11 Sep 2026) — the user: "wherever we are giving an
-- address, city or location there should be a location picker as well… user
-- will check nearest studio using location only."
--
-- `events` has carried `venue`, `address`, `city` and a `maps_url` typed by
-- hand since Step 21, and nothing a computer can measure. The event form now
-- puts a pin on the venue and writes the map link from it; this is where the
-- pin itself is kept, so an event can be found by distance the way a studio
-- now can, and drawn on the same map.
--
-- `save_event` is replaced with the SAME body plus two columns read from the
-- payload — nothing else in it changes, and a payload without `lat`/`lng` (every
-- caller until today) behaves exactly as before: the columns stay null.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.events
  add column if not exists lat double precision
    check (lat is null or (lat >= 6 and lat <= 37.5)),
  add column if not exists lng double precision
    check (lng is null or (lng >= 68 and lng <= 97.5));

comment on column public.events.lat is
  'Where the venue is, as the organiser placed the pin (11 Sep 2026). NULL for an event made before the map, or whose organiser skipped it — the maps_url is still there.';

-- published events by place, for a radius search later
create index if not exists events_geog_idx
  on public.events
  using gist ((extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography))
  where deleted_at is null and lat is not null and lng is not null;

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
  -- the pin, when the payload carries one; a value outside India is a bug or a
  -- joke and is not written
  v_lat double precision := nullif(p_event->>'lat', '')::double precision;
  v_lng double precision := nullif(p_event->>'lng', '')::double precision;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not public.can_run_events(p_tenant_id) then
    raise exception 'only the people who run this business can run its events';
  end if;
  -- R15 (9 Sep 2026): an event is the organization's; a studio is a place with rooms in it.
  select t.type into v_type from public.tenants t where t.id = p_tenant_id and t.deleted_at is null;
  if v_type = 'studio' then
    raise exception 'an event belongs to the organization, not to one of its studios — open Events from your business hub';
  end if;
  if v_lat is not null and v_lng is not null
     and (v_lat < 6 or v_lat > 37.5 or v_lng < 68 or v_lng > 97.5) then
    raise exception 'that point is not in India';
  end if;
  if (v_lat is null) <> (v_lng is null) then
    v_lat := null;
    v_lng := null;
  end if;

  if v_id is null then
    insert into public.events (tenant_id, cat, title, style, start_date, end_date, start_time, venue, address, city, maps_url, lat, lng, about,
                               entry_format, bracket, rounds, prizes, tickets_on, created_by, updated_by)
    values (p_tenant_id,
            p_event->>'cat', trim(p_event->>'title'), coalesce(nullif(trim(p_event->>'style'), ''), 'All styles'),
            (p_event->>'start_date')::date, (p_event->>'end_date')::date, coalesce((p_event->>'start_time')::time, '18:00'),
            trim(p_event->>'venue'), nullif(trim(coalesce(p_event->>'address', '')), ''), trim(p_event->>'city'), trim(p_event->>'maps_url'),
            v_lat, v_lng,
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
      -- a payload without a pin keeps the pin it had; one with a pin moves it
      lat = coalesce(v_lat, lat), lng = coalesce(v_lng, lng),
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
  'Create or edit an event. Refused for a STUDIO host: an event belongs to the organization (R15, 9 Sep 2026). Tiers are reconciled, never replaced, so a tier that keeps its id keeps its bookings. Since 11 Sep 2026 the payload may carry lat/lng — the venue''s pin — and a payload without them keeps whatever pin the event had.';
revoke execute on function public.save_event(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_event(uuid, uuid, jsonb) to authenticated;
