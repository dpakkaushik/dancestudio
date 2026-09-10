-- ─────────────────────────────────────────────────────────────────────────────
-- THE READS THIS PLATFORM WILL MAKE A MILLION TIMES (11 Sep 2026)
-- ⚠ Rule 9: this migration rewrites every RLS policy in `public`.
--
-- Nothing here changes WHAT anybody may see. Every policy keeps its command,
-- its roles and its decision, to the letter. What changes is how many times
-- Postgres has to ask, and whether the answer arrives through an index.
--
-- ── 1. A POLICY IS ASKED ONCE PER QUERY, NOT ONCE PER ROW ────────────────────
--
-- `auth.uid()` written bare inside a policy is a function call the planner
-- attaches to the row filter, so it is executed for EVERY row the query
-- considers — ten thousand rows, ten thousand calls, each one parsing the JWT
-- claim out of the request settings. Wrapped in a scalar subquery,
-- `(select auth.uid())`, the planner hoists it into an InitPlan: evaluated
-- once, before the scan, and compared as a constant. This is Supabase's own
-- documented fix and it is the single largest lever on RLS cost; on their
-- benchmarks it is the difference between a table that answers in
-- milliseconds and one that answers in seconds.
--
-- The rewrite below is mechanical and reads the policies back out of the
-- catalog rather than re-typing 63 of them by hand — a re-typed policy is a
-- policy that can differ from the one it replaced, and a policy that differs
-- is a security bug. `pg_policies` renders the expression Postgres actually
-- holds; only the function call is wrapped; `alter policy` replaces the
-- expression and touches neither the command nor the roles. It is idempotent:
-- an already-wrapped call is unwrapped first, so running it twice is running
-- it once.
--
-- SECURITY DEFINER function BODIES are deliberately left alone: a function
-- body is executed once per call, not once per row, so `auth.uid()` there is
-- already a single call and wrapping it would only obscure it.
--
-- ── 2. THE INDEXES THE SEARCH BOX AND DISCOVER ASK FOR ───────────────────────
--
-- `search_dance_os` matches names two ways — `like 'term%'` (starts with) and
-- `like '% term%'` (a word inside starts with). The second cannot use a btree
-- index at all: a leading wildcard has no prefix to seek on. Every keystroke
-- was therefore a sequential scan of tenants, of crews, and of events. A GIN
-- trigram index serves both shapes, so search stays flat as the tables grow.
--
-- Discover's other reads — a city's studios, a city's events, the admin desks'
-- lists — were seq scans for the plainer reason that nobody had indexed the
-- column they filter on.
--
-- ── 3. THE SEARCH BOX STOPS CALLING A FUNCTION ONCE PER ROW ──────────────────
--
-- The events branch of `search_dance_os` called `event_host_name(e.tenant_id)`
-- FOUR TIMES in the WHERE clause of every candidate row, and that function is
-- a definer that reads `tenants` and then calls `event_host_is_public()`,
-- which reads `tenant_members` and `profiles`. One search over ten thousand
-- events was forty thousand of those. It is rewritten to resolve the matching
-- hosts ONCE, as a set of ids, and then test membership — same rows, same
-- visibility rule (a host that is not public is not in the set, so its name
-- still cannot be used to find anything), one evaluation.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. every policy in public, re-evaluated once ─────────────────────────────
do $$
declare
  r record;
  v_qual  text;
  v_check text;
  v_sql   text;
  v_n     integer := 0;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where (coalesce(qual, '') like '%auth.uid()%' or coalesce(with_check, '') like '%auth.uid()%')
       and (
         schemaname = 'public'
         -- the storage policies THIS repo wrote, by name; Supabase's own are left alone
         or (schemaname = 'storage' and policyname in (
              'people write their own avatar folder',
              'people replace their own avatar folder',
              'people delete from their own avatar folder',
              'business people write their tenant folder',
              'business people delete from their tenant folder',
              'an organization writes its own proof folder',
              'an organization reads its own proof folder',
              'an organization deletes from its own proof folder',
              'admins read every proof folder'
            ))
       )
     order by schemaname, tablename, policyname
  loop
    -- unwrap first so a second run is a no-op, then wrap
    v_qual := replace(
                replace(coalesce(r.qual, ''), '( SELECT auth.uid() AS uid)', 'auth.uid()'),
                'auth.uid()', '(select auth.uid())');
    v_check := replace(
                replace(coalesce(r.with_check, ''), '( SELECT auth.uid() AS uid)', 'auth.uid()'),
                'auth.uid()', '(select auth.uid())');

    v_sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if r.qual is not null then
      v_sql := v_sql || format(' using (%s)', v_qual);
    end if;
    if r.with_check is not null then
      v_sql := v_sql || format(' with check (%s)', v_check);
    end if;

    if r.schemaname = 'public' then
      -- our own tables: a failure here is a real problem and must stop the
      -- migration rather than leave half the policies rewritten
      execute v_sql;
      v_n := v_n + 1;
    else
      -- `storage.objects` is Supabase's table, not ours. We created these
      -- policies, so we should be able to alter them — but the owner of that
      -- table is outside this repo's control, and a permission change on
      -- Supabase's side must not take the whole migration down with it. The
      -- public-schema rewrite and every index below matter more than these
      -- nine, so a refusal here is reported and stepped over.
      begin
        execute v_sql;
        v_n := v_n + 1;
      exception when others then
        raise warning 'left % on %.% alone: %', r.policyname, r.schemaname, r.tablename, sqlerrm;
      end;
    end if;
  end loop;
  raise notice 'auth.uid() hoisted out of the row loop in % policies', v_n;
end $$;

-- ── 2. the indexes ───────────────────────────────────────────────────────────
create extension if not exists pg_trgm with schema extensions;

-- the search box: both LIKE shapes, on the lowered name the function compares
create index if not exists tenants_name_trgm
  on public.tenants using gin (lower(name) extensions.gin_trgm_ops);
create index if not exists crews_name_trgm
  on public.crews using gin (lower(name) extensions.gin_trgm_ops);
create index if not exists events_title_trgm
  on public.events using gin (lower(title) extensions.gin_trgm_ops);
create index if not exists classes_title_trgm
  on public.classes using gin (lower(title) extensions.gin_trgm_ops);
-- the admin's account search, which matches a name the same way
create index if not exists profiles_name_trgm
  on public.profiles using gin (lower(full_name) extensions.gin_trgm_ops);

-- Discover: a city's businesses, a city's events
create index if not exists tenants_city_type_idx
  on public.tenants (city, type) where deleted_at is null;
create index if not exists tenants_listed_city_idx
  on public.tenants (type, city) where deleted_at is null and visibility = 'listed';
create index if not exists events_city_date_idx
  on public.events (city, start_date) where deleted_at is null and status = 'published';
-- Discover's classes shelf reads published classes by city through their tenant
create index if not exists classes_status_tenant_idx
  on public.classes (status, tenant_id) where deleted_at is null;

-- the admin desks: accounts, businesses, money, the renewal clock
create index if not exists profiles_role_idx
  on public.profiles (role) where deleted_at is null;
create index if not exists profiles_created_idx
  on public.profiles (created_at desc) where deleted_at is null;
create index if not exists subscriptions_tenant_idx
  on public.subscriptions (tenant_id) where deleted_at is null and tenant_id is not null;
create index if not exists subscriptions_status_idx
  on public.subscriptions (status, current_period_end) where deleted_at is null;
create index if not exists payments_created_idx
  on public.payments (created_at desc) where deleted_at is null;
create index if not exists payments_subscription_idx
  on public.payments (subscription_id) where subscription_id is not null;
create index if not exists orders_status_created_idx
  on public.orders (status, created_at desc) where deleted_at is null;
create index if not exists refunds_created_idx
  on public.refunds (created_at desc) where deleted_at is null;
-- "webhooks that never finished" — the dashboard counts these on every load
create index if not exists webhook_events_pending_idx
  on public.webhook_events (created_at desc) where processed_at is null;

-- ── 3. search resolves a matching host once, not once per row ────────────────
create or replace function public.public_host_ids(p_term text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id
    from public.tenants t
   where t.deleted_at is null
     and coalesce(nullif(p_term, ''), null) is not null
     and (lower(t.name) like p_term || '%' or lower(t.name) like '% ' || p_term || '%')
     and public.event_host_is_public(t.id)
   limit 200;
$$;
comment on function public.public_host_ids(text) is
  'The ids of PUBLIC event hosts whose name matches the search term (11 Sep 2026). Definer, and public-only, so an unlisted host is not in the set and its name can therefore still not be used to find anything — the same rule event_host_name() enforces, resolved once per search instead of four times per row.';
revoke execute on function public.public_host_ids(text) from public;
grant execute on function public.public_host_ids(text) to anon, authenticated;

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
  hosts as (
    -- resolved ONCE for the whole search; empty when the term is empty
    select h.id from q, lateral public.public_host_ids(q.term) as h(id) where q.term <> ''
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
    from public.events e, q
    where e.deleted_at is null and q.term <> ''
      and (lower(e.title) like q.term || '%' or lower(e.title) like '% ' || q.term || '%'
           or e.tenant_id in (select id from hosts))
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
  'One search box over studios, artists, crews, events and people — SECURITY INVOKER, so the caller''s RLS decides what is found. An event is found by its title or its organiser''s name; since 11 Sep 2026 the organiser is matched through public_host_ids(), which answers only for PUBLIC hosts and is resolved ONCE per search instead of four times per candidate row.';
revoke execute on function public.search_dance_os(text, integer) from public;
grant execute on function public.search_dance_os(text, integer) to anon, authenticated;

-- ── 4. the planner needs to know the new indexes are there ───────────────────
analyze public.tenants;
analyze public.crews;
analyze public.events;
analyze public.classes;
analyze public.profiles;
