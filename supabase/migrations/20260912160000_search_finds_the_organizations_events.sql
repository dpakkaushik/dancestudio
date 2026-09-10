-- ─────────────────────────────────────────────────────────────────────────────
-- SEARCH FINDS THE ORGANIZATION'S EVENTS (10 Sep 2026) — R15 fallout, found by
-- rls-proof-search the day it was re-cut for org-hosted events.
--
-- `search_dance_os` is SECURITY INVOKER on purpose (Step 23): the caller's own
-- RLS decides what is found. Its events branch INNER-JOINED public.tenants to
-- match the organiser's name — and since R15 an event's host is the
-- organization's own tenant row, which is UNLISTED for ever, so a stranger's RLS
-- on tenants ("anyone reads listed tenants") dropped the join row and the event
-- with it. Every published event on production was unfindable through the
-- search box for anybody but the organization itself; Discover's Events tab and
-- the event page were fine, because they never went through tenants.
--
-- The fix keeps the function INVOKER (RLS on events — published, and
-- event_host_is_public — still decides which events exist to the caller) and
-- reads the organiser's name through ONE SECURITY DEFINER helper that answers
-- only for a PUBLIC host, so an unlisted studio's name is never revealed by it.
-- Same signature, same return type, same grants.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.event_host_name(p_tenant_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select t.name
    from public.tenants t
   where t.id = p_tenant_id
     and t.deleted_at is null
     and public.event_host_is_public(t.id);
$$;
comment on function public.event_host_name(uuid) is
  'The organiser''s name for a PUBLIC event host — a verified organization, or a listed studio / artist page — and null otherwise (10 Sep 2026). Search matches on it, so an unlisted host''s name is never revealed through it.';
revoke execute on function public.event_host_name(uuid) from public;
grant execute on function public.event_host_name(uuid) to anon, authenticated;

create or replace function public.search_dance_os(p_q text, p_limit integer default 3)
returns table (kind text, id uuid, name text, sub text, href text)
language sql
stable
set search_path = ''
as $$
  with q as (
    select lower(trim(coalesce(p_q, ''))) as term,
           greatest(1, least(coalesce(p_limit, 3), 10)) as lim
  ),
  studios as (
    select 'studio'::text as kind, t.id, t.name,
           'Studio · ' || coalesce(t.city, '—') as sub,
           '/studio/' || t.id::text as href
    from public.tenants t, q
    where t.deleted_at is null and t.type = 'studio' and q.term <> ''
      and (lower(t.name) like q.term || '%' or lower(t.name) like '% ' || q.term || '%')
    order by t.name
    limit (select lim from q)
  ),
  artists as (
    select 'artist'::text as kind, t.id, t.name,
           'Artist · ' || coalesce(t.city, '—') as sub,
           '/artist/' || t.id::text as href
    from public.tenants t, q
    where t.deleted_at is null and t.type = 'trainer_business' and q.term <> ''
      and (lower(t.name) like q.term || '%' or lower(t.name) like '% ' || q.term || '%')
    order by t.name
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
  -- the organiser's name through the definer helper, NOT a join on tenants: the
  -- host is the organization's unlisted row, which the caller's RLS cannot read
  events as (
    select 'event'::text as kind, e.id, e.title as name,
           case e.cat when 'showcase' then 'Showcase' when 'battle' then 'Battle' else 'Tournament' end
             || ' · ' || e.venue as sub,
           '/e/' || e.share_slug as href
    from public.events e, q
    where e.deleted_at is null and q.term <> ''
      and (lower(e.title) like q.term || '%' or lower(e.title) like '% ' || q.term || '%'
           or lower(coalesce(public.event_host_name(e.tenant_id), '')) like q.term || '%'
           or lower(coalesce(public.event_host_name(e.tenant_id), '')) like '% ' || q.term || '%')
    order by e.start_date
    limit (select lim from q)
  ),
  people as (
    select 'person'::text as kind, p.id, p.full_name as name,
           (case when exists (select 1 from public.artist_ids(array[p.id])) then 'Artist'
                 else 'User' end)
             || ' · ' || coalesce(p.city, '—') as sub,
           '/person/' || p.id::text as href
    from public.profiles p, q
    where p.deleted_at is null and p.role <> 'org' and q.term <> ''
      and (lower(p.full_name) like q.term || '%' or lower(p.full_name) like '% ' || q.term || '%')
    order by p.full_name
    limit (select lim from q)
  )
  select * from studios
  union all select * from artists
  union all select * from crews
  union all select * from events
  union all select * from people;
$$;
comment on function public.search_dance_os(text, integer) is
  'One search box over studios, artists, crews, events and people — SECURITY INVOKER, so the caller''s RLS decides what is found. An event is found by its title or its organiser''s name (10 Sep 2026: the organization''s, through event_host_name, never a join on its unlisted hosting row).';
revoke execute on function public.search_dance_os(text, integer) from public;
grant execute on function public.search_dance_os(text, integer) to anon, authenticated;
