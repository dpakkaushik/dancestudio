-- Step 25, second migration: the studio and crew boards could not run.
--
-- Found by the proof, not by reading. `dance_chart` declares OUT parameters
-- named `id`, `name`, `city`, `style`, `points` — and a plpgsql function's OUT
-- parameters are VARIABLES in every query inside it. The people branch happened
-- to alias its columns (`uid`, `full_name`, `pcity`), so it ran; the studio and
-- crew branches selected `t.id`, `t.name`, `t.city` into CTEs that kept those
-- names, and Postgres refused the lot with `column reference "id" is ambiguous
-- — it could refer to either a PL/pgSQL variable or a table column` (42702).
-- Two of the four boards were dead on arrival and only a call could show it.
--
-- The fix is the discipline the people branch already had: every CTE column
-- inside this function is named so it cannot collide with an OUT parameter.
-- Same signature, same grants, same numbers.
--
-- Lesson worth keeping: name a set-returning plpgsql function's OUT parameters
-- as if they were globals, because inside the body they are.

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
      select c.tenant_id as tid, count(*)::integer as n_held,
             round(coalesce(sum(extract(epoch from (s.ends_at - s.starts_at)) / 3600.0), 0), 1) as h,
             (array_agg(c.style order by s.starts_at desc))[1] as top_style
      from public.classes c
      join public.class_sessions s on s.class_id = c.id
      where c.deleted_at is null and s.deleted_at is null and s.ends_at < now()
        and (p_style is null or c.style = p_style)
      group by c.tenant_id
    ),
    people as (
      select a.tenant_id as tid, count(distinct a.user_id)::integer as n_who
      from public.attendance a where a.deleted_at is null group by a.tenant_id
    ),
    joined as (
      select t.id as tid, t.name as who, t.city as pcity,
             coalesce(x.n_held, 0) as n_held, coalesce(x.h, 0) as hrs,
             x.top_style as pstyle, coalesce(y.n_who, 0) as n_who
      from public.tenants t
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

revoke execute on function public.dance_chart(text, text, text, integer) from public, anon;
grant execute on function public.dance_chart(text, text, text, integer) to authenticated;
