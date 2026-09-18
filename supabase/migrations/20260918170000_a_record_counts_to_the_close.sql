-- 18 Sep 2026: A RECORD COUNTS A CLAIM'S SESSIONS UP TO THE MOMENT IT CLOSED.
--
-- Found by the proof harness on 18 Sep 2026 and put on the backlog; the user
-- asked for it fixed. `my_dance_stats` and `my_session_history` counted every
-- confirmed `class_people` row WITHOUT looking at `deleted_at`, so a claim that
-- was closed — withdrawn, or replaced by a re-ask — kept adding sessions, hours
-- and POINTS to a person's record (the harness read 5 conducted where 2 had
-- happened). `person_dance_stats` and `dance_chart` went the other way and
-- dropped a closed claim entirely, so somebody removed from a team lost credit
-- for sessions they had actually taught.
--
-- THE RULE, the same one the payouts ledger draws with `accrualCutoff`: a claim
-- counts a session that ENDED while the claim was open —
--     (k.deleted_at is null or s.ends_at <= k.deleted_at)
-- — and a session is counted ONCE however many claims on the class named the
-- same person (a re-ask is a second row for the same seat). All four functions
-- read the same line now, so the record, the history, a person's page and the
-- boards agree.
--
-- Same names, same signatures, `create or replace` throughout: every ACL stays
-- exactly as it is (authenticated + service_role; `dance_points` untouched).

create or replace function public.my_dance_stats()
returns table(sessions_conducted integer, sessions_assisted integer, sessions_attended integer, hours_conducted numeric, hours_assisted numeric, hours_attended numeric, points numeric, styles integer, studios integer, artists integer, first_session date, last_session date)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select auth.uid() as uid),
  -- every past session this person was on the floor for, and which side they were on
  mine as (
    -- TAUGHT: a confirmed artist claim, on a session that ended while the claim stood
    select distinct 'conducted'::text as side, s.id, s.starts_at, s.ends_at, c.style, c.business_id, null::uuid as artist_id
    from public.class_people k
    join public.classes c on c.id = k.class_id
    join public.class_sessions s on s.class_id = c.id
    , me
    where k.user_id = me.uid and k.kind = 'artist' and k.status = 'confirmed'
      and (k.deleted_at is null or s.ends_at <= k.deleted_at)
      and c.deleted_at is null and s.deleted_at is null and s.ends_at < now()
    union
    -- ASSISTED: "you were on the floor, running it with someone" (7752)
    select distinct 'assisted', s.id, s.starts_at, s.ends_at, c.style, c.business_id, null::uuid
    from public.class_people k
    join public.classes c on c.id = k.class_id
    join public.class_sessions s on s.class_id = c.id
    , me
    where k.user_id = me.uid and k.kind = 'assistant' and k.status = 'confirmed'
      and (k.deleted_at is null or s.ends_at <= k.deleted_at)
      and c.deleted_at is null and s.deleted_at is null and s.ends_at < now()
    union
    -- ATTENDED: an attendance row — somebody actually checked in. A booking that
    -- nobody marked is not a session attended, and counting it would be a guess.
    select 'attended', s.id, s.starts_at, s.ends_at, c.style, c.business_id,
           (select k2.user_id from public.class_people k2
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
      count(distinct business_id)::integer as studios_n,
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

create or replace function public.my_session_history(p_limit integer default 200)
returns table(session_id uuid, side text, class_id uuid, share_slug text, title text, style text, room text, city text, business_id uuid, business_name text, artist_name text, starts_at timestamptz, ends_at timestamptz, minutes integer)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select auth.uid() as uid), rows as (
    select distinct 'conducted'::text as side, s.id as sid, c.id as cid, s.starts_at, s.ends_at, c.title, c.style, c.room, c.share_slug, c.business_id
    from public.class_people k
    join public.classes c on c.id = k.class_id
    join public.class_sessions s on s.class_id = c.id, me
    where k.user_id = me.uid and k.kind = 'artist' and k.status = 'confirmed'
      and (k.deleted_at is null or s.ends_at <= k.deleted_at)
      and c.deleted_at is null and s.deleted_at is null and s.ends_at < now()
    union
    select distinct 'assisted', s.id, c.id, s.starts_at, s.ends_at, c.title, c.style, c.room, c.share_slug, c.business_id
    from public.class_people k
    join public.classes c on c.id = k.class_id
    join public.class_sessions s on s.class_id = c.id, me
    where k.user_id = me.uid and k.kind = 'assistant' and k.status = 'confirmed'
      and (k.deleted_at is null or s.ends_at <= k.deleted_at)
      and c.deleted_at is null and s.deleted_at is null and s.ends_at < now()
    union
    select 'attended', s.id, c.id, s.starts_at, s.ends_at, c.title, c.style, c.room, c.share_slug, c.business_id
    from public.attendance a
    join public.class_sessions s on s.id = a.session_id
    join public.classes c on c.id = a.class_id, me
    where a.user_id = me.uid and a.deleted_at is null
      and c.deleted_at is null and s.deleted_at is null and s.ends_at < now()
  )
  select r.sid, r.side, r.cid, r.share_slug, r.title, r.style, r.room,
         t.city, r.business_id, t.name,
         (select p.full_name from public.class_people k3
            join public.profiles p on p.id = k3.user_id
            where k3.class_id = r.cid and k3.kind = 'artist' and k3.status = 'confirmed' and k3.deleted_at is null
            limit 1),
         r.starts_at, r.ends_at,
         (extract(epoch from (r.ends_at - r.starts_at)) / 60)::integer
  from rows r
  left join public.businesses t on t.id = r.business_id
  order by r.starts_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$$;

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
      -- signed-in only, exactly like the profiles policy this rides beside
      and auth.uid() is not null
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
  from agg;
$$;

-- the boards: the people branch is the one that reads claims. Every column of
-- the inner select is QUALIFIED (`d.kind`, `d.style`) because inside this
-- function `kind`, `style`, `id` and `name` are OUT parameters — the 42702
-- lesson of 28 Aug 2026.
create or replace function public.dance_chart(p_segment text, p_city text default null, p_style text default null, p_limit integer default 20)
returns table(place bigint, kind text, id uuid, name text, city text, style text, conducted integer, assisted integer, attended integer, hours numeric, extra integer, points numeric, population bigint)
language plpgsql
stable
security definer
set search_path = ''
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
    -- have DANCED (the prototype charts one person on both, 9680). A claim counts
    -- the sessions that ended while it stood, and a session once.
    return query
    with taught as (
      select distinct k.user_id as uid, k.kind as k_kind, s.id as sid, s.starts_at as s_start, s.ends_at as s_end, c.style as c_style
      from public.class_people k
      join public.classes c on c.id = k.class_id
      join public.class_sessions s on s.class_id = c.id
      where k.status = 'confirmed'
        and (k.deleted_at is null or s.ends_at <= k.deleted_at)
        and c.deleted_at is null and s.deleted_at is null and s.ends_at < now()
        and (p_style is null or c.style = p_style)
    ),
    per as (
      select d.uid,
             count(*) filter (where d.k_kind = 'artist')::integer as c_n,
             count(*) filter (where d.k_kind = 'assistant')::integer as a_n,
             round(coalesce(sum(extract(epoch from (d.s_end - d.s_start)) / 3600.0), 0), 1) as h,
             (array_agg(d.c_style order by d.s_start desc))[1] as top_style
      from taught d
      group by d.uid
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
      select p.id as uid, p.full_name as who, p.city as pcity,
             coalesce(x.c_n, 0) as c_n, coalesce(x.a_n, 0) as a_n, coalesce(y.t_n, 0) as t_n,
             round(coalesce(x.h, 0) + coalesce(y.h, 0), 1) as hrs,
             coalesce(x.top_style, y.top_style) as pstyle
      from public.profiles p
      left join per x on x.uid = p.id
      left join att y on y.uid = p.id
      where p.deleted_at is null
        and (p_city is null or p.city = p_city)
        and (p_segment <> 'artist' or coalesce(x.c_n, 0) + coalesce(x.a_n, 0) > 0)
        and (p_segment <> 'dancer' or coalesce(y.t_n, 0) > 0)
    ),
    scored as (
      select uid, who, pcity, c_n, a_n, t_n, hrs, pstyle,
             public.dance_points(c_n, a_n, t_n, hrs) as pts
      from joined
    )
    select row_number() over (order by scored.pts desc, scored.who asc),
           p_segment, scored.uid, scored.who, scored.pcity, scored.pstyle,
           scored.c_n, scored.a_n, scored.t_n, scored.hrs, 0,
           scored.pts, (select count(*) from scored)
    from scored
    order by scored.pts desc, scored.who asc
    limit v_lim;

  elsif p_segment = 'studio' then
    -- BUSINESSES. What a studio has actually run: past sessions of its live
    -- classes, the hours they took, and how many people were on those floors.
    return query
    with held as (
      select c.business_id as tid, count(*)::integer as n_held,
             round(coalesce(sum(extract(epoch from (s.ends_at - s.starts_at)) / 3600.0), 0), 1) as h,
             (array_agg(c.style order by s.starts_at desc))[1] as top_style
      from public.classes c
      join public.class_sessions s on s.class_id = c.id
      where c.deleted_at is null and s.deleted_at is null and s.ends_at < now()
        and (p_style is null or c.style = p_style)
      group by c.business_id
    ),
    people as (
      select a.business_id as tid, count(distinct a.user_id)::integer as n_who
      from public.attendance a where a.deleted_at is null group by a.business_id
    ),
    joined as (
      select t.id as tid, t.name as who, t.city as pcity,
             coalesce(x.n_held, 0) as n_held, coalesce(x.h, 0) as hrs,
             x.top_style as pstyle, coalesce(y.n_who, 0) as n_who
      from public.businesses t
      left join held x on x.tid = t.id
      left join people y on y.tid = t.id
      where t.deleted_at is null and t.visibility = 'listed' and t.type = 'studio'
        and (p_city is null or t.city = p_city)
        and coalesce(x.n_held, 0) > 0
    ),
    scored as (
      select tid, who, pcity, n_held, hrs, pstyle, n_who,
             public.dance_points(n_held, 0, 0, hrs) as pts
      from joined
    )
    select row_number() over (order by scored.pts desc, scored.who asc),
           'studio'::text, scored.tid, scored.who, scored.pcity, scored.pstyle,
           scored.n_held, 0, 0, scored.hrs, scored.n_who,
           scored.pts, (select count(*) from scored)
    from scored
    order by scored.pts desc, scored.who asc
    limit v_lim;

  else
    -- CREWS. The prototype ranks crews by battle wins; nothing holds a score, so
    -- this ranks what a crew has actually DONE — the events it entered — with the
    -- roster beside it. Said on the screen, not implied by a number.
    return query
    with entered as (
      select b.crew_id as cid, count(*)::integer as n_ev
      from public.event_bookings b
      join public.events e on e.id = b.event_id
      where b.crew_id is not null and b.status = 'booked' and b.deleted_at is null
        and e.deleted_at is null and e.status in ('published', 'completed')
        and (p_style is null or e.style = p_style)
      group by b.crew_id
    ),
    roster as (
      select m.crew_id as cid, count(*)::integer as n_mem from public.crew_members m
      where m.status = 'confirmed' and m.deleted_at is null group by m.crew_id
    ),
    joined as (
      select c.id as cid, c.name as who, c.city as pcity, c.style as pstyle,
             coalesce(x.n_ev, 0) as n_ev, coalesce(r.n_mem, 0) as n_mem
      from public.crews c
      left join entered x on x.cid = c.id
      left join roster r on r.cid = c.id
      where c.deleted_at is null
        and (p_city is null or c.city = p_city)
        and (p_style is null or c.style = p_style or c.style = 'All styles')
    ),
    scored as (
      select cid, who, pcity, pstyle, n_ev, n_mem,
             round((n_ev * 3.0) + (n_mem * 1.0), 1) as pts
      from joined
    )
    select row_number() over (order by scored.pts desc, scored.who asc),
           'crew'::text, scored.cid, scored.who, scored.pcity, scored.pstyle,
           scored.n_ev, 0, 0, 0::numeric, scored.n_mem,
           scored.pts, (select count(*) from scored)
    from scored
    order by scored.pts desc, scored.who asc
    limit v_lim;
  end if;
end;
$$;

comment on function public.my_dance_stats() is
  'The signed-in person''s record: sessions conducted / assisted / attended, hours, points. A closed claim counts the sessions that ended while it stood (18 Sep 2026); a session counts once.';
