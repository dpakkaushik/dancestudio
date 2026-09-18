-- 19 Sep 2026: A STRANGER SEES AN ARTIST'S PUBLIC FACE — AND NOT THEIR AGE OR
-- ACCOUNT NUMBER. ⚠ RLS: this NARROWS what a stranger reads.
--
-- `20260918175000` let a stranger read a live artist's whole `profiles` row,
-- and the list put in front of the user said so: the row carries `age` and
-- `member_no`, two things the old /artist page never showed. The user: "fix
-- all." A SELECT policy is a ROW decision, not a column one, so the policy
-- goes, and what a stranger may read comes back through ONE SECURITY DEFINER
-- read that hands back exactly the public columns — the `public_organization`
-- shape (`20260918173000`), the pattern this database uses for every public
-- surface over a private table.
--
-- WHAT A STRANGER READS ABOUT AN ARTIST NOW, exactly: id, name, role, city,
-- picture, About, links, styles, the tick, and the number they chose to
-- publish. Not age. Not the account number. About a plain user: nothing, as
-- before. Signed in, a person still reads every live profile row as Step 1
-- has always let them, age included — nothing changes for a member.
--
-- `discover_artists` and search's Artists branch leaned on the dropped policy
-- for a stranger; both read live artists through one definer helper now.
-- `person_dance_stats`, `person_teaches_at`, `person_follower_counts`,
-- `artist_page_of` and `artist_page_owner` decide with `artist_plan_active`
-- directly and are untouched. No row changes; no table changes.

drop policy if exists "anyone reads an artist's live profile" on public.profiles;

-- ── the one public face ──────────────────────────────────────────────────────
create or replace function public.public_artist(p_user_id uuid)
returns table(id uuid, full_name text, role text, city text, profile_photo_path text, about text, socials jsonb, styles text[], verified_at timestamptz, phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.role, p.city, p.profile_photo_path, p.about, p.socials, p.styles, p.verified_at, p.phone
  from public.profiles p
  where p.id = p_user_id and p.deleted_at is null and p.role = 'user' and p.suspended_at is null
    and public.artist_plan_active(p.id);
$$;
revoke execute on function public.public_artist(uuid) from public;
grant execute on function public.public_artist(uuid) to anon, authenticated, service_role;

comment on function public.public_artist(uuid) is
  'An artist''s public face for a stranger (19 Sep 2026): the public columns of a live, unsuspended person with a live Artist plan — no age, no account number. Empty for anybody else.';

-- ── the live artists, for the shelf and the search box ──────────────────────
create or replace function public.public_artists()
returns table(id uuid, full_name text, city text, profile_photo_path text, styles text[], verified_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.city, p.profile_photo_path, p.styles, p.verified_at
  from public.profiles p
  where p.deleted_at is null and p.role = 'user' and p.suspended_at is null
    and public.artist_plan_active(p.id);
$$;
revoke execute on function public.public_artists() from public;
grant execute on function public.public_artists() to anon, authenticated, service_role;

comment on function public.public_artists() is
  'Every live artist as a stranger may list them (19 Sep 2026): name, city, picture, styles, tick. What the Artists shelf and search''s Artists branch read.';

-- `discover_artists`: same signature, same answer, read through the helper so a
-- stranger keeps the shelf with no policy on the table (INVOKER as before — the
-- helper carries the authority; `create or replace` keeps the ACL)
create or replace function public.discover_artists(p_city text, p_limit integer default 50, p_offset integer default 0)
returns table(id uuid, full_name text, city text, photo_path text, styles text[], verified_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select a.id, a.full_name, a.city, a.profile_photo_path, a.styles, a.verified_at
  from public.public_artists() a
  where (p_city is null or a.city = p_city)
  order by a.full_name
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function public.discover_artists(text, integer, integer) is
  'Discover''s Artists tab: the people with a live Artist plan in a city, by name, paged — through public_artists(), so a stranger reads names and faces and never the row (19 Sep 2026).';

-- ── search lists an artist once, as the person — through the helper ─────────
create or replace function public.search_dance_os(p_q text, p_limit integer default 3)
returns table(kind text, id uuid, name text, sub text, href text)
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
  events as (
    select 'event'::text as kind, e.id, e.title as name,
           case e.category when 'showcase' then 'Showcase' when 'battle' then 'Battle' else 'Tournament' end
             || ' · ' || e.venue as sub,
           '/e/' || e.share_slug as href
    from public.events e, q
    where e.deleted_at is null and q.term <> ''
      and (lower(e.title) like q.term || '%' or lower(e.title) like '% ' || q.term || '%'
           or e.business_id in (select id from hosts))
    order by e.start_date
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
  union all select * from events
  union all select * from people;
$$;
