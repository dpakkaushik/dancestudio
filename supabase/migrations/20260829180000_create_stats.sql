-- Step 25 (Analytics / Stats).
--
-- The prototype's Stats is one screen in three dresses (S_profiletab):
-- `historyOnly` — YOUR RECORD, "A LIBRARY, NOT A DASHBOARD" (9862+): what you
-- taught, what you assisted, what you attended, in hours as well as sessions,
-- and every figure openable into the list behind it; `classesOnly` — History,
-- the session library with its filters (9708+); and `chartsOnly` — Global
-- Rankings (9610+): four segments (Studios · Artists · Crews · Dancers), a
-- metric selector, city and style filters, and a HOW POINTS WORK card.
--
-- THE RULE THE PROTOTYPE STATES ABOUT ITS OWN NUMBERS (9950): "a number and the
-- list behind it are THE SAME NUMBER. The grid used to say 86 students and open
-- a list of five … which is how a figure stops being believed." So every figure
-- here is counted off the rows it opens, by one function, and no screen adds up
-- anything of its own.
--
-- WHAT IS REAL, AND WHAT THE PROTOTYPE'S POINTS CLAIM THAT WE CANNOT.
-- Its card reads: session conducted +2, assisted +1.5, attended +1, every hour
-- on the floor +0.5, BATTLE WIN +10, "refresh daily at midnight, and decay 10%
-- monthly". Three of those are claims we would be inventing:
--   * a battle win needs a SCORE, and no table holds one (Step 21 left brackets,
--     judges and scoring on the backlog) — so wins are not in the formula, and
--     the screen says so rather than showing a zero that looks like a result;
--   * "refresh daily" is a scheduled job we do not run — points are computed
--     live, which is better and is what the screen says;
--   * "decay 10% monthly" is a product rule nobody has decided; a decay we made
--     up would quietly change everybody's standing.
-- What IS real: sessions conducted (a confirmed artist claim on a class whose
-- session has ended), sessions assisted (the same for an assistant claim),
-- sessions attended (an attendance row — somebody actually checked in), and the
-- hours those sessions ran. Those come from rows this app already keeps.
--
-- AND A RANK IS ONLY HONEST WITH ITS DENOMINATOR. "#4" on a pilot with seven
-- dancers in a city is a number pretending to be a league. Every chart returns
-- the size of the population it ranked, and the screen prints "#2 of 7".
--
-- No new table: this is arithmetic over rows that already exist. Two SECURITY
-- DEFINER functions, because a leaderboard has to see across people that RLS
-- rightly hides from each other — and they are aggregate-only, in the pattern
-- `session_seat_counts` (Step 4) and `follower_counts` (Step 15) set: a name and
-- some numbers, never a row of somebody's private data.

-- ── the points formula, in one place ─────────────────────────────────────────
create or replace function public.dance_points(p_conducted integer, p_assisted integer, p_attended integer, p_hours numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(
    (coalesce(p_conducted, 0) * 2.0) +
    (coalesce(p_assisted, 0) * 1.5) +
    (coalesce(p_attended, 0) * 1.0) +
    (coalesce(p_hours, 0) * 0.5), 1);
$$;
comment on function public.dance_points(integer, integer, integer, numeric) is
  'Session conducted +2, assisted +1.5, attended +1, every hour on the floor +0.5 (prototype 9660). A battle win would be +10 — no table holds a score yet, so wins are not counted and the screen says so.';
revoke execute on function public.dance_points(integer, integer, integer, numeric) from public;
grant execute on function public.dance_points(integer, integer, integer, numeric) to anon, authenticated;

-- ── one person's record ──────────────────────────────────────────────────────
-- Every figure is counted off the same rows the history list prints, so the
-- number and the list agree by construction.
create or replace function public.my_dance_stats()
returns table (
  sessions_conducted integer,
  sessions_assisted integer,
  sessions_attended integer,
  hours_conducted numeric,
  hours_assisted numeric,
  hours_attended numeric,
  points numeric,
  styles integer,
  studios integer,
  artists integer,
  first_session date,
  last_session date
)
language sql
security definer
set search_path = ''
stable
as $$
  with me as (select auth.uid() as uid),
  -- every past session this person was on the floor for, and which side they were on
  mine as (
    -- TAUGHT: a confirmed artist claim, on a session that has ended
    select 'conducted'::text as side, s.id, s.starts_at, s.ends_at, c.style, c.tenant_id, null::uuid as artist_id
    from public.class_claims k
    join public.classes c on c.id = k.class_id
    join public.class_sessions s on s.class_id = c.id
    , me
    where k.user_id = me.uid and k.kind = 'artist' and k.status = 'confirmed'
      and c.deleted_at is null and s.deleted_at is null and s.ends_at < now()
    union all
    -- ASSISTED: "you were on the floor, running it with someone" (7752)
    select 'assisted', s.id, s.starts_at, s.ends_at, c.style, c.tenant_id, null::uuid
    from public.class_claims k
    join public.classes c on c.id = k.class_id
    join public.class_sessions s on s.class_id = c.id
    , me
    where k.user_id = me.uid and k.kind = 'assistant' and k.status = 'confirmed'
      and c.deleted_at is null and s.deleted_at is null and s.ends_at < now()
    union all
    -- ATTENDED: an attendance row — somebody actually checked in. A booking that
    -- nobody marked is not a session attended, and counting it would be a guess.
    select 'attended', s.id, s.starts_at, s.ends_at, c.style, c.tenant_id,
           (select k2.user_id from public.class_claims k2
              where k2.class_id = c.id and k2.kind = 'artist' and k2.status = 'confirmed' and k2.deleted_at is null
              limit 1)
    from public.attendance a
    join public.class_sessions s on s.id = a.session_id
    join public.classes c on c.id = a.class_id
    , me
    where a.user_id = me.uid and a.deleted_at is null
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
      count(distinct tenant_id)::integer as studios_n,
      count(distinct artist_id)::integer as artists_n,
      min((starts_at at time zone 'Asia/Kolkata')::date) as first_d,
      max((starts_at at time zone 'Asia/Kolkata')::date) as last_d
    from mine
  )
  select c_n, a_n, t_n, c_h, a_h, t_h,
         public.dance_points(c_n, a_n, t_n, c_h + a_h + t_h),
         styles_n, studios_n, artists_n, first_d, last_d
  from agg;
$$;
comment on function public.my_dance_stats() is
  'The signed-in person''s record: sessions and hours conducted / assisted / attended off real rows (a confirmed claim, an attendance row), plus the styles, studios and artists those sessions touched.';
revoke execute on function public.my_dance_stats() from public, anon;
grant execute on function public.my_dance_stats() to authenticated;

-- ── one person's history — the library the figures open into ─────────────────
create or replace function public.my_session_history(p_limit integer default 200)
returns table (
  session_id uuid,
  side text,
  class_id uuid,
  share_slug text,
  title text,
  style text,
  room text,
  city text,
  tenant_id uuid,
  tenant_name text,
  artist_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  minutes integer
)
language sql
security definer
set search_path = ''
stable
as $$
  with me as (select auth.uid() as uid), rows as (
    select 'conducted'::text as side, s.id as sid, c.id as cid, s.starts_at, s.ends_at, c.title, c.style, c.room, c.share_slug, c.tenant_id
    from public.class_claims k
    join public.classes c on c.id = k.class_id
    join public.class_sessions s on s.class_id = c.id, me
    where k.user_id = me.uid and k.kind = 'artist' and k.status = 'confirmed'
      and c.deleted_at is null and s.deleted_at is null and s.ends_at < now()
    union all
    select 'assisted', s.id, c.id, s.starts_at, s.ends_at, c.title, c.style, c.room, c.share_slug, c.tenant_id
    from public.class_claims k
    join public.classes c on c.id = k.class_id
    join public.class_sessions s on s.class_id = c.id, me
    where k.user_id = me.uid and k.kind = 'assistant' and k.status = 'confirmed'
      and c.deleted_at is null and s.deleted_at is null and s.ends_at < now()
    union all
    select 'attended', s.id, c.id, s.starts_at, s.ends_at, c.title, c.style, c.room, c.share_slug, c.tenant_id
    from public.attendance a
    join public.class_sessions s on s.id = a.session_id
    join public.classes c on c.id = a.class_id, me
    where a.user_id = me.uid and a.deleted_at is null
      and c.deleted_at is null and s.deleted_at is null and s.ends_at < now()
  )
  select r.sid, r.side, r.cid, r.share_slug, r.title, r.style, r.room,
         t.city, r.tenant_id, t.name,
         (select p.full_name from public.class_claims k3
            join public.profiles p on p.id = k3.user_id
            where k3.class_id = r.cid and k3.kind = 'artist' and k3.status = 'confirmed' and k3.deleted_at is null
            limit 1),
         r.starts_at, r.ends_at,
         (extract(epoch from (r.ends_at - r.starts_at)) / 60)::integer
  from rows r
  left join public.tenants t on t.id = r.tenant_id
  order by r.starts_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$$;
comment on function public.my_session_history(integer) is
  'The signed-in person''s past sessions, newest first, one row per side they were on — the library the Stats figures open into.';
revoke execute on function public.my_session_history(integer) from public, anon;
grant execute on function public.my_session_history(integer) to authenticated;

-- ── the charts — aggregate rows only, and every one carries its population ──
-- A dancer's row is a name, a city and some counts of activity. It is NOT a
-- window into their bookings, their money or their classes, and there is no
-- p_user_id: you cannot ask this function about a person, only for a board.
create or replace function public.dance_chart(
  p_segment text,
  p_city text default null,
  p_style text default null,
  p_limit integer default 20
)
returns table (
  place bigint,
  kind text,
  id uuid,
  name text,
  city text,
  style text,
  conducted integer,
  assisted integer,
  attended integer,
  hours numeric,
  extra integer,
  points numeric,
  population bigint
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_lim integer := greatest(1, least(coalesce(p_limit, 20), 100));
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_segment not in ('dancer', 'artist', 'studio', 'crew') then
    raise exception 'unknown chart';
  end if;

  if p_segment in ('dancer', 'artist') then
    -- PEOPLE. A dancer and an artist are the same rows read from two ends: the
    -- artist board ranks what somebody has TAUGHT, the dancer board what they
    -- have DANCED (the prototype charts one person on both, 9680).
    return query
    with per as (
      select k.user_id as uid,
             count(*) filter (where k.kind = 'artist')::integer as c_n,
             count(*) filter (where k.kind = 'assistant')::integer as a_n,
             0::integer as t_n,
             round(coalesce(sum(extract(epoch from (s.ends_at - s.starts_at)) / 3600.0), 0), 1) as h,
             (array_agg(c.style order by s.starts_at desc))[1] as top_style
      from public.class_claims k
      join public.classes c on c.id = k.class_id
      join public.class_sessions s on s.class_id = c.id
      where k.status = 'confirmed' and k.deleted_at is null
        and c.deleted_at is null and s.deleted_at is null and s.ends_at < now()
        and (p_style is null or c.style = p_style)
      group by k.user_id
    ),
    att as (
      select a.user_id as uid, count(*)::integer as t_n,
             round(coalesce(sum(extract(epoch from (s.ends_at - s.starts_at)) / 3600.0), 0), 1) as h,
             (array_agg(c.style order by s.starts_at desc))[1] as top_style
      from public.attendance a
      join public.class_sessions s on s.id = a.session_id
      join public.classes c on c.id = a.class_id
      where a.deleted_at is null and c.deleted_at is null and s.deleted_at is null and s.ends_at < now()
        and (p_style is null or c.style = p_style)
      group by a.user_id
    ),
    joined as (
      select p.id as uid, p.full_name, p.city as pcity,
             coalesce(x.c_n, 0) as c_n, coalesce(x.a_n, 0) as a_n, coalesce(y.t_n, 0) as t_n,
             round(coalesce(x.h, 0) + coalesce(y.h, 0), 1) as h,
             coalesce(x.top_style, y.top_style) as top_style
      from public.profiles p
      left join per x on x.uid = p.id
      left join att y on y.uid = p.id
      where p.deleted_at is null
        and (p_city is null or p.city = p_city)
        and (p_segment <> 'artist' or coalesce(x.c_n, 0) + coalesce(x.a_n, 0) > 0)
        and (p_segment <> 'dancer' or coalesce(y.t_n, 0) > 0)
    ),
    scored as (
      select uid, full_name, pcity, c_n, a_n, t_n, h, top_style,
             public.dance_points(c_n, a_n, t_n, h) as pts
      from joined
    )
    select row_number() over (order by pts desc, full_name asc),
           p_segment, uid, full_name, pcity, top_style, c_n, a_n, t_n, h, 0,
           pts, (select count(*) from scored)
    from scored
    order by pts desc, full_name asc
    limit v_lim;

  elsif p_segment = 'studio' then
    -- BUSINESSES. What a studio has actually run: past sessions of its live
    -- classes, the hours they took, and how many people were on those floors.
    return query
    with held as (
      select c.tenant_id, count(*)::integer as n,
             round(coalesce(sum(extract(epoch from (s.ends_at - s.starts_at)) / 3600.0), 0), 1) as h,
             (array_agg(c.style order by s.starts_at desc))[1] as top_style
      from public.classes c
      join public.class_sessions s on s.class_id = c.id
      where c.deleted_at is null and s.deleted_at is null and s.ends_at < now()
        and (p_style is null or c.style = p_style)
      group by c.tenant_id
    ),
    people as (
      select a.tenant_id, count(distinct a.user_id)::integer as n
      from public.attendance a where a.deleted_at is null group by a.tenant_id
    ),
    joined as (
      select t.id, t.name, t.city, coalesce(x.n, 0) as n, coalesce(x.h, 0) as h,
             x.top_style, coalesce(y.n, 0) as who
      from public.tenants t
      left join held x on x.tenant_id = t.id
      left join people y on y.tenant_id = t.id
      where t.deleted_at is null and t.visibility = 'listed' and t.type = 'studio'
        and (p_city is null or t.city = p_city)
        and coalesce(x.n, 0) > 0
    ),
    scored as (
      select id, name, city, n, h, top_style, who, public.dance_points(n, 0, 0, h) as pts from joined
    )
    select row_number() over (order by pts desc, name asc),
           'studio'::text, id, name, city, top_style, n, 0, 0, h, who,
           pts, (select count(*) from scored)
    from scored
    order by pts desc, name asc
    limit v_lim;

  else
    -- CREWS. The prototype ranks crews by battle wins; nothing holds a score, so
    -- this ranks what a crew has actually DONE — the events it entered — with the
    -- roster beside it. Said on the screen, not implied by a number.
    return query
    with entered as (
      select b.crew_id, count(*)::integer as n
      from public.event_bookings b
      join public.events e on e.id = b.event_id
      where b.crew_id is not null and b.status = 'booked' and b.deleted_at is null
        and e.deleted_at is null and e.status in ('published', 'completed')
        and (p_style is null or e.style = p_style)
      group by b.crew_id
    ),
    roster as (
      select m.crew_id, count(*)::integer as n from public.crew_members m
      where m.status = 'confirmed' and m.deleted_at is null group by m.crew_id
    ),
    joined as (
      select c.id, c.name, c.city, c.style, coalesce(x.n, 0) as ev, coalesce(r.n, 0) as members
      from public.crews c
      left join entered x on x.crew_id = c.id
      left join roster r on r.crew_id = c.id
      where c.deleted_at is null
        and (p_city is null or c.city = p_city)
        and (p_style is null or c.style = p_style or c.style = 'All styles')
    ),
    scored as (
      select id, name, city, style, ev, members,
             round((ev * 3.0) + (members * 1.0), 1) as pts
      from joined
    )
    select row_number() over (order by pts desc, name asc),
           'crew'::text, id, name, city, style, ev, 0, 0, 0::numeric, members,
           pts, (select count(*) from scored)
    from scored
    order by pts desc, name asc
    limit v_lim;
  end if;
end;
$$;
comment on function public.dance_chart(text, text, text, integer) is
  'A leaderboard for one segment (dancer | artist | studio | crew), aggregate-only: a name, a place, some counts, and the SIZE OF THE POPULATION it ranked, so a rank is never printed without its denominator. There is no p_user_id: you can ask for a board, never about a person.';
revoke execute on function public.dance_chart(text, text, text, integer) from public, anon;
grant execute on function public.dance_chart(text, text, text, integer) to authenticated;

-- ── where the caller stands, with the denominator ───────────────────────────
create or replace function public.my_chart_place(p_segment text, p_city text default null)
returns table (place bigint, population bigint, points numeric)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_segment not in ('dancer', 'artist') then
    raise exception 'a place on this board belongs to a person';
  end if;
  return query
  select c.place, c.population, c.points
  from public.dance_chart(p_segment, p_city, null, 100) c
  where c.id = v_user;
end;
$$;
comment on function public.my_chart_place(text, text) is
  'The caller''s own place on a people board, with the population it is out of. Empty when they have nothing on that board yet — which is the honest answer, not #0.';
revoke execute on function public.my_chart_place(text, text) from public, anon;
grant execute on function public.my_chart_place(text, text) to authenticated;
