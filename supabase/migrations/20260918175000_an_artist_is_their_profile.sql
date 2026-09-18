-- 18 Sep 2026: AN ARTIST IS THEIR PROFILE. ⚠ RLS: this widens what a stranger reads.
--
-- The user, twice today: "there is no need for a separate artist page to be
-- created — should be managed from the artist profile only" and, of search
-- finding an artist twice, "should only come as their profile as artist, no
-- separate page required." So the artist's ONE public face is their profile —
-- /person/{id}, with the ARTIST badge the plan gives — and the artist_page row
-- is what it always was underneath: the business their classes, team, students
-- and earnings hang off, never a page anybody visits.
--
-- WHAT CHANGES FOR A STRANGER, exactly: a profile whose owner holds a LIVE
-- Artist plan (and is a person, live, not suspended) is readable signed out —
-- name, city, styles, About, age, links, the number they chose to publish,
-- their picture. That is what /artist/{id} already showed a stranger about the
-- same person (the header pictures, the styles off their classes, the About,
-- the phone, the links), so nothing is public that was not; it is now read
-- from the row it belongs to. A plain user's profile stays signed-in only.
--
-- The three aggregate reads the person page makes gain the same door: a
-- stranger may read an ARTIST's record, teaches-at and follower counts, and
-- nobody else's. `search_dance_os` lists an artist ONCE, under Artists, as the
-- person; People is the users without a plan. `discover_artists` is the
-- Artists tab's shelf: artists in a city, by name. Follows of an artist PAGE
-- become follows of the artist (one row per follower, self-follows dropped),
-- so nobody loses who they followed.

-- ── 1. an artist's profile is readable by anyone ─────────────────────────────
create policy "anyone reads an artist's live profile"
  on public.profiles for select
  to anon, authenticated
  using (deleted_at is null and role = 'user' and suspended_at is null and public.artist_plan_active(id));

-- ── 2. the page's reads open to a stranger for an artist only ────────────────
create or replace function public.person_dance_stats(p_user_id uuid)
returns table(sessions_conducted integer, sessions_assisted integer, sessions_attended integer, hours_conducted numeric, hours_assisted numeric, hours_attended numeric, points numeric, styles integer, studios integer, first_session date, last_session date)
language sql
stable
security definer
set search_path = ''
as $$
  with who as (
    select p.id as uid from public.profiles p
    where p.id = p_user_id and p.deleted_at is null
      -- signed-in, or the person is an artist and therefore public (18 Sep 2026)
      and (auth.uid() is not null or public.artist_plan_active(p.id))
  ),
  mine as (
    select distinct 'conducted'::text as side, s.id as sid, s.starts_at, s.ends_at, c.style, c.business_id
    from public.class_people k
    join public.classes c on c.id = k.class_id
    join public.class_sessions s on s.class_id = c.id, who
    where k.user_id = who.uid and k.kind = 'artist' and k.status = 'confirmed'
      and (k.deleted_at is null or s.ends_at <= k.deleted_at)
      and c.deleted_at is null and s.deleted_at is null and s.ends_at < now()
    union
    select distinct 'assisted', s.id, s.starts_at, s.ends_at, c.style, c.business_id
    from public.class_people k
    join public.classes c on c.id = k.class_id
    join public.class_sessions s on s.class_id = c.id, who
    where k.user_id = who.uid and k.kind = 'assistant' and k.status = 'confirmed'
      and (k.deleted_at is null or s.ends_at <= k.deleted_at)
      and c.deleted_at is null and s.deleted_at is null and s.ends_at < now()
    union
    select 'attended', s.id, s.starts_at, s.ends_at, c.style, c.business_id
    from public.attendance a
    join public.class_sessions s on s.id = a.session_id
    join public.classes c on c.id = a.class_id, who
    where a.user_id = who.uid and a.deleted_at is null
      and c.deleted_at is null and s.deleted_at is null and s.ends_at < now()
  ),
  agg as (
    select
      count(*) filter (where side = 'conducted')::integer as c_n,
      count(*) filter (where side = 'assisted')::integer as a_n,
      count(*) filter (where side = 'attended')::integer as t_n,
      round(coalesce(sum(extract(epoch from (ends_at - starts_at)) / 3600.0) filter (where side = 'conducted'), 0), 1) as c_h,
      round(coalesce(sum(extract(epoch from (ends_at - starts_at)) / 3600.0) filter (where side = 'assisted'), 0), 1) as a_h,
      round(coalesce(sum(extract(epoch from (ends_at - starts_at)) / 3600.0) filter (where side = 'attended'), 0), 1) as t_h,
      count(distinct style)::integer as styles_n,
      count(distinct business_id)::integer as studios_n,
      min((starts_at at time zone 'Asia/Kolkata')::date) as first_d,
      max((starts_at at time zone 'Asia/Kolkata')::date) as last_d
    from mine
  )
  select c_n, a_n, t_n, c_h, a_h, t_h,
         public.dance_points(c_n, a_n, t_n, c_h + a_h + t_h),
         styles_n, studios_n, first_d, last_d
  from agg
  -- NO ROW for somebody the caller may not read (a stranger asking about a
  -- plain user): an empty answer, never a record of zeros that looks like one
  where exists (select 1 from who);
$$;
grant execute on function public.person_dance_stats(uuid) to anon;

create or replace function public.person_teaches_at(p_user_id uuid)
returns table(business_id uuid, business_name text, business_type text, city text, classes integer, kinds text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.name, t.type, t.city,
         count(distinct c.id)::integer as classes,
         string_agg(distinct case k.kind when 'artist' then 'Artist' else 'Assistant' end, ' · ' order by
                    case k.kind when 'artist' then 'Artist' else 'Assistant' end) as kinds
  from public.class_people k
  join public.classes c on c.id = k.class_id
  join public.businesses t on t.id = c.business_id
  where k.user_id = p_user_id and k.status = 'confirmed' and k.deleted_at is null
    and c.status = 'published' and c.deleted_at is null
    and t.visibility = 'listed' and t.deleted_at is null
    and (auth.uid() is not null or public.artist_plan_active(p_user_id))
  group by t.id, t.name, t.type, t.city
  order by classes desc, t.name;
$$;
grant execute on function public.person_teaches_at(uuid) to anon;

-- counts only, never a name; the rows themselves stay private (Step 15's rule).
-- A stranger is answered for an ARTIST and for nobody else — the same door as
-- the two reads above, so no count leaks about a plain user who is not public.
create or replace function public.person_follower_counts(p_user_ids uuid[])
returns table (user_id uuid, followers bigint, following bigint)
language sql
security definer
set search_path = ''
stable
as $$
  select p.id as user_id,
         (select count(*) from public.follows f where f.followee_id = p.id and f.deleted_at is null) as followers,
         (select count(*) from public.follows f where f.follower_id = p.id and f.deleted_at is null) as following
  from public.profiles p
  where p.id = any (p_user_ids) and p.deleted_at is null
    and (auth.uid() is not null or public.artist_plan_active(p.id));
$$;
grant execute on function public.person_follower_counts(uuid[]) to anon;

-- ── 3. the page behind an artist, and the artist behind a page ───────────────
-- what the Enquiry on an artist's profile is sent TO: their listed artist_page
create or replace function public.artist_page_of(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id from public.businesses t
  join public.business_members m on m.business_id = t.id
  where m.user_id = p_user_id and m.member_role = 'owner' and m.deleted_at is null
    and t.type = 'artist_page' and t.visibility = 'listed' and t.deleted_at is null
  limit 1;
$$;
revoke execute on function public.artist_page_of(uuid) from public;
grant execute on function public.artist_page_of(uuid) to anon, authenticated, service_role;

-- where /artist/{id} sends you: the person who owns that page (Rule 14 — the
-- old address is a promise, and it keeps it by redirecting)
create or replace function public.artist_page_owner(p_business_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id from public.businesses t
  join public.business_members m on m.business_id = t.id
  where t.id = p_business_id and t.type = 'artist_page' and t.deleted_at is null
    and m.member_role = 'owner' and m.deleted_at is null
  limit 1;
$$;
revoke execute on function public.artist_page_owner(uuid) from public;
grant execute on function public.artist_page_owner(uuid) to anon, authenticated, service_role;

-- ── 4. Discover's Artists tab: the artists in a city, as people ──────────────
-- SECURITY INVOKER: the policy above is what lets a stranger see them
create or replace function public.discover_artists(p_city text, p_limit integer default 50, p_offset integer default 0)
returns table(id uuid, full_name text, city text, photo_path text, styles text[], verified_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select p.id, p.full_name, p.city, p.profile_photo_path, p.styles, p.verified_at
  from public.profiles p
  where p.deleted_at is null and p.role = 'user' and p.suspended_at is null
    and public.artist_plan_active(p.id)
    and (p_city is null or p.city = p_city)
  order by p.full_name
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;
revoke execute on function public.discover_artists(text, integer, integer) from public;
grant execute on function public.discover_artists(text, integer, integer) to anon, authenticated, service_role;

-- ── 5. search lists an artist once, as the person ────────────────────────────
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
  -- ARTISTS ARE PEOPLE (18 Sep 2026): the person with a live plan, opening their
  -- profile — not the business row behind them
  artists as (
    select 'artist'::text as kind, p.id, p.full_name as name,
           'Artist · ' || coalesce(p.city, '—') as sub,
           '/person/' || p.id::text as href
    from public.profiles p, q
    where p.deleted_at is null and p.role = 'user' and q.term <> ''
      and public.artist_plan_active(p.id)
      and (lower(p.full_name) like q.term || '%' or lower(p.full_name) like '% ' || q.term || '%')
    order by p.full_name
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
  -- PEOPLE are the users WITHOUT a plan — an artist is listed above, once
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

-- ── 6. who followed the page followed the person ─────────────────────────────
-- one live follow per (follower, person); a follower who IS the artist is dropped
-- (`follows.business_id` — the column has carried the app's word since the 16 Sep rename)
update public.follows f
   set followee_id = o.user_id, business_id = null, updated_at = now()
  from public.businesses b
  join public.business_members o on o.business_id = b.id and o.member_role = 'owner' and o.deleted_at is null
 where f.business_id = b.id and b.type = 'artist_page' and f.deleted_at is null
   and f.follower_id <> o.user_id
   and not exists (
     select 1 from public.follows f2
     where f2.follower_id = f.follower_id and f2.followee_id = o.user_id and f2.deleted_at is null
   );
-- whatever is left pointing at an artist page (a self-follow, a duplicate) ends
update public.follows f
   set deleted_at = now(), updated_at = now()
  from public.businesses b
 where f.business_id = b.id and b.type = 'artist_page' and f.deleted_at is null;

comment on policy "anyone reads an artist's live profile" on public.profiles is
  'An artist''s public face is their profile (18 Sep 2026): a person with a live Artist plan is readable signed out. A plain user stays signed-in only.';
comment on function public.discover_artists(text, integer, integer) is
  'Discover''s Artists tab: the people with a live Artist plan in a city, by name, paged. SECURITY INVOKER — the artist policy on profiles is what admits a stranger.';
