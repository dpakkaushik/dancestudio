-- Step 23 (Search + Discover filters).
--
-- The prototype's search is one box that "searches everything" (4535-4575):
-- Studios, Artists, Crews, Events, in sections of at most three, matching a
-- name that STARTS with the term or has a WORD that does (the `m` predicate
-- at 4546). Its filters — style, sort, distance, time of day, duration, price,
-- kind, format — are predicates over lists the page already holds, so they need
-- no schema; they live in the page and its filter sheet.
--
-- Postgres, not Typesense. The roadmap named Typesense; at pilot scale every
-- searchable table holds tens of rows and a prefix match over lower(name) is
-- instant, so a sync pipeline would be machinery with nothing to carry. This
-- function is the seam: when counts ever warrant an index, the function keeps
-- its shape and the search engine changes behind it.
--
-- SECURITY INVOKER, on purpose: the caller's own RLS decides what is found.
-- A stranger finds listed businesses, live crews and published events; the
-- owner of an unlisted studio finds it; nobody's draft leaks. People (dancers)
-- are NOT searched here — profiles are readable by signed-in users only, and
-- there is no person page for a row to open (the prototype's Dancers section
-- navigates to a person; that page is on the backlog) — a row that goes
-- nowhere is the defect the prototype spent its time removing.

create or replace function public.search_dance_os(p_q text, p_limit integer default 3)
returns table (kind text, id uuid, name text, sub text, href text)
language sql
security invoker
set search_path = ''
stable
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
  events as (
    select 'event'::text as kind, e.id, e.title as name,
           case e.cat when 'showcase' then 'Showcase' when 'battle' then 'Battle' else 'Tournament' end
             || ' · ' || e.venue as sub,
           '/e/' || e.share_slug as href
    from public.events e
    join public.tenants t on t.id = e.tenant_id, q
    where e.deleted_at is null and q.term <> ''
      and (lower(e.title) like q.term || '%' or lower(e.title) like '% ' || q.term || '%'
           or lower(t.name) like q.term || '%' or lower(t.name) like '% ' || q.term || '%')
    order by e.start_date
    limit (select lim from q)
  )
  select * from studios
  union all select * from artists
  union all select * from crews
  union all select * from events;
$$;

comment on function public.search_dance_os(text, integer) is
  'Discover''s one search box: studios, artists, crews and events whose name starts with the term or has a word that does, at most p_limit per kind. SECURITY INVOKER — the caller''s RLS decides what is found.';

revoke execute on function public.search_dance_os(text, integer) from public;
grant execute on function public.search_dance_os(text, integer) to anon, authenticated;
