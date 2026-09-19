-- ============================================================================
-- 19 Sep 2026 — STATS AND A RANK FOR SOMEBODY ELSE'S PROFILE.
--
-- The user: "stats page on any profile should show all stats for that
-- particular profile and rankings as well." Until now the Stats chip on
-- another's page opened the BOARD they stand on; their own figures and their
-- own place were nowhere.
--
-- Step 25's boards (`dance_chart`) already compute every figure a profile's
-- stats page wants — a person's sessions conducted / assisted / attended and
-- hours, a studio's sessions held and people on the floor, a crew's events and
-- roster — plus the place and the population ranked. What was missing was a
-- way to ask for ONE row of a board about ONE entity, and to let a STRANGER ask
-- it about a PUBLIC entity. So the board is split in two:
--
--   `dance_chart_all`  — the same body, no gate, no cap, executable by NOBODY
--                        from outside (the core the doors below read);
--   `dance_chart`      — the same signature and shape as before: the signed-in
--                        gate, the 100-row cap, one line calling the core;
--   `entity_chart_row` — one board row for one entity. Signed in: anybody's.
--                        Signed out: only a PUBLIC entity's — an artist with a
--                        live plan, a listed studio, a live crew — and nothing
--                        for a plain user, whose profile is still signed-in only.
--
-- Nothing is granted to anon that a stranger could not already see on the
-- public page beside it: the figures are aggregate counts about a public
-- entity, and the place is where it stands among its kind.
-- ============================================================================

-- ── the core: the board's body, ungated and uncapped ─────────────────────────
create or replace function public.dance_chart_all(p_segment text, p_city text default null, p_style text default null, p_limit integer default 20)
returns table(place bigint, kind text, id uuid, name text, city text, style text, conducted integer, assisted integer, attended integer, hours numeric, extra integer, points numeric, population bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lim integer := greatest(1, least(coalesce(p_limit, 20), 10000));
begin
  if p_segment not in ('dancer', 'artist', 'studio', 'crew') then
    raise exception 'unknown chart';
  end if;

  if p_segment in ('dancer', 'artist') then
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
revoke execute on function public.dance_chart_all(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.dance_chart_all(text, text, text, integer) to service_role;
comment on function public.dance_chart_all(text, text, text, integer) is
  'The boards'' body, ungated and uncapped (19 Sep 2026) — the core `dance_chart` and `entity_chart_row` read. Executable by no client role.';

-- ── the board, as it always was: the gate, the cap, one line ─────────────────
create or replace function public.dance_chart(p_segment text, p_city text default null, p_style text default null, p_limit integer default 20)
returns table(place bigint, kind text, id uuid, name text, city text, style text, conducted integer, assisted integer, attended integer, hours numeric, extra integer, points numeric, population bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_segment not in ('dancer', 'artist', 'studio', 'crew') then
    raise exception 'unknown chart';
  end if;
  return query
  select * from public.dance_chart_all(p_segment, p_city, p_style, greatest(1, least(coalesce(p_limit, 20), 100)));
end;
$$;

-- ── one row, one entity — a public one for a stranger, anybody's when signed in ─
create or replace function public.entity_chart_row(p_segment text, p_id uuid, p_city text default null)
returns table(place bigint, kind text, id uuid, name text, city text, style text, conducted integer, assisted integer, attended integer, hours numeric, extra integer, points numeric, population bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_public boolean := false;
begin
  if p_segment not in ('dancer', 'artist', 'studio', 'crew') then
    raise exception 'unknown chart';
  end if;
  if auth.uid() is null then
    -- a STRANGER asks about a PUBLIC entity only; a plain user's record stays signed-in (Step 1)
    if p_segment in ('dancer', 'artist') then
      select exists (
        select 1 from public.profiles p
        where p.id = p_id and p.role = 'user' and p.deleted_at is null and p.suspended_at is null
          and public.artist_plan_active(p.id)
      ) into v_public;
    elsif p_segment = 'studio' then
      select exists (
        select 1 from public.businesses t
        where t.id = p_id and t.type = 'studio' and t.visibility = 'listed' and t.deleted_at is null
      ) into v_public;
    else
      select exists (select 1 from public.crews c where c.id = p_id and c.deleted_at is null) into v_public;
    end if;
    if not v_public then
      return;
    end if;
  end if;
  return query
  select c.place, c.kind, c.id, c.name, c.city, c.style, c.conducted, c.assisted, c.attended, c.hours, c.extra, c.points, c.population
  from public.dance_chart_all(p_segment, p_city, null, 10000) c
  where c.id = p_id;
end;
$$;
revoke execute on function public.entity_chart_row(text, uuid, text) from public;
grant execute on function public.entity_chart_row(text, uuid, text) to anon, authenticated, service_role;
comment on function public.entity_chart_row(text, uuid, text) is
  'One board row for one entity (19 Sep 2026): its figures, its place and the population it is ranked out of — nationally, or in a city. Signed in, anybody''s; signed out, a public artist''s, a listed studio''s or a live crew''s, and nothing for a plain user.';
