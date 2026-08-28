-- Parity slice (28 Aug 2026): person pages, and following a person.
--
-- The roadmap is finished; this is the first row off the parity backlog, and it
-- was chosen because it blocks nothing and three built screens already want it:
-- the crew desk's member rows and the crew page's roster (Step 22 drew the door
-- and had nowhere to send it), and the search dropdown's Dancers section (Step 23
-- left people out for exactly this reason — "a row that goes nowhere is the
-- defect the prototype spent its time removing").
--
-- In the prototype a PERSON is `publicEntity="trainer"` on S_profiletab (PUB
-- 8643: a name, a badge, a place, followers and following) — the same screen a
-- studio and a crew wear, which is why our tenant page and this one share their
-- skeleton. What differs is what the page is made of: a person's record, the
-- crews they are in, and where they teach.
--
-- WHO CAN SEE A PERSON. `profiles` is readable by SIGNED-IN users only (Step 1),
-- and that line is not moved here: a person page is for people who are on
-- DanceOS, and a stranger gets nothing. Every figure it prints is one this app
-- already shows to a signed-in user — Step 25's boards publish exactly these
-- counts against a name — so the page exposes nothing new. Making person pages
-- PUBLIC would be a product decision about somebody else's data, and it is not
-- one to take in passing.
--
-- FOLLOWING A PERSON reuses `follows` rather than adding a table: the row is the
-- same fact with a different object, so one table keeps one meaning. tenant_id
-- becomes nullable, followee_id arrives, and a check makes a row name EXACTLY
-- one of them — a follow of nothing, or of both, cannot be stored.

-- ── follows learns about people ──────────────────────────────────────────────
alter table public.follows
  alter column tenant_id drop not null,
  add column followee_id uuid references public.profiles (id) on delete cascade,
  add constraint follows_one_object check (
    (tenant_id is not null and followee_id is null)
    or (tenant_id is null and followee_id is not null)
  );

comment on column public.follows.followee_id is
  'The PERSON being followed, when this row follows a person rather than a business. Exactly one of tenant_id / followee_id is set.';

-- one LIVE follow per person per person; history rows do not block re-following
create unique index follows_person_live_unique
  on public.follows (follower_id, followee_id) where deleted_at is null and followee_id is not null;
create index follows_followee_idx on public.follows (followee_id) where deleted_at is null;

-- the person followed reads who follows them (their own Followers list), the
-- same way a business's members read theirs
create policy "people read their own followers"
  on public.follows for select
  to authenticated
  using (followee_id = auth.uid());

-- ── set_person_follow — the one door, idempotent ─────────────────────────────
create or replace function public.set_person_follow(p_user_id uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_live uuid;
  v_count bigint;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user and p.deleted_at is null) then
    raise exception 'finish onboarding before following';
  end if;
  if p_user_id = v_user then
    raise exception 'you cannot follow yourself';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id and p.deleted_at is null) then
    raise exception 'that person is not on DanceOS';
  end if;

  select f.id into v_live from public.follows f
    where f.follower_id = v_user and f.followee_id = p_user_id and f.deleted_at is null;

  if p_on and v_live is null then
    insert into public.follows (follower_id, followee_id, created_by, updated_by)
    values (v_user, p_user_id, v_user, v_user);
  elsif not p_on and v_live is not null then
    update public.follows set deleted_at = now(), updated_by = v_user where id = v_live;
  end if;

  select count(*) into v_count from public.follows f
    where f.followee_id = p_user_id and f.deleted_at is null;

  return jsonb_build_object('following', p_on, 'followers', v_count);
end;
$$;
comment on function public.set_person_follow(uuid, boolean) is
  'Follow (true) or unfollow (false) a person. Idempotent; refuses yourself and somebody who is not on DanceOS. Returns the new state and the live follower count.';
revoke execute on function public.set_person_follow(uuid, boolean) from public, anon;
grant execute on function public.set_person_follow(uuid, boolean) to authenticated;

-- ── person_follower_counts — a number, never a name ─────────────────────────
-- Signed-in only, like `profiles` itself: a follower count is a fact about a
-- person, and this app does not publish those to the world.
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
  where p.id = any (p_user_ids) and p.deleted_at is null;
$$;
revoke execute on function public.person_follower_counts(uuid[]) from public, anon;
grant execute on function public.person_follower_counts(uuid[]) to authenticated;

-- ── person_dance_stats — Step 25's numbers, for somebody else ────────────────
-- The SAME arithmetic as `my_dance_stats`, keyed on a person instead of the
-- caller. It publishes nothing new: `dance_chart` already puts exactly these
-- counts beside a name for any signed-in caller (Step 25), so a person page
-- showing them is the board's own row, opened.
create or replace function public.person_dance_stats(p_user_id uuid)
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
  first_session date,
  last_session date
)
language sql
security definer
set search_path = ''
stable
as $$
  with who as (
    select p.id as uid from public.profiles p
    where p.id = p_user_id and p.deleted_at is null
      -- signed-in only, exactly like the profiles policy this rides beside
      and auth.uid() is not null
  ),
  mine as (
    select 'conducted'::text as side, s.starts_at, s.ends_at, c.style, c.tenant_id
    from public.class_claims k
    join public.classes c on c.id = k.class_id
    join public.class_sessions s on s.class_id = c.id, who
    where k.user_id = who.uid and k.kind = 'artist' and k.status = 'confirmed' and k.deleted_at is null
      and c.deleted_at is null and s.deleted_at is null and s.ends_at < now()
    union all
    select 'assisted', s.starts_at, s.ends_at, c.style, c.tenant_id
    from public.class_claims k
    join public.classes c on c.id = k.class_id
    join public.class_sessions s on s.class_id = c.id, who
    where k.user_id = who.uid and k.kind = 'assistant' and k.status = 'confirmed' and k.deleted_at is null
      and c.deleted_at is null and s.deleted_at is null and s.ends_at < now()
    union all
    select 'attended', s.starts_at, s.ends_at, c.style, c.tenant_id
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
      count(distinct tenant_id)::integer as studios_n,
      min((starts_at at time zone 'Asia/Kolkata')::date) as first_d,
      max((starts_at at time zone 'Asia/Kolkata')::date) as last_d
    from mine
  )
  select c_n, a_n, t_n, c_h, a_h, t_h,
         public.dance_points(c_n, a_n, t_n, c_h + a_h + t_h),
         styles_n, studios_n, first_d, last_d
  from agg;
$$;
comment on function public.person_dance_stats(uuid) is
  'One person''s record — the same arithmetic as my_dance_stats, keyed on somebody else. Signed-in callers only; publishes nothing dance_chart does not already show beside a name.';
revoke execute on function public.person_dance_stats(uuid) from public, anon;
grant execute on function public.person_dance_stats(uuid) to authenticated;

-- ── where a person teaches — off PUBLIC rows only ───────────────────────────
-- A confirmed claim on a PUBLISHED class of a LISTED business is already public
-- (Step 11's policy: "an unanswered ask never puts a name on a public page").
-- This is that list, and nothing else: no drafts, no unlisted businesses.
create or replace function public.person_teaches_at(p_user_id uuid)
returns table (tenant_id uuid, tenant_name text, tenant_type text, city text, classes integer, kinds text)
language sql
security definer
set search_path = ''
stable
as $$
  select t.id, t.name, t.type, t.city,
         count(distinct c.id)::integer as classes,
         string_agg(distinct case k.kind when 'artist' then 'Artist' else 'Assistant' end, ' · ' order by
                    case k.kind when 'artist' then 'Artist' else 'Assistant' end) as kinds
  from public.class_claims k
  join public.classes c on c.id = k.class_id
  join public.tenants t on t.id = c.tenant_id
  where k.user_id = p_user_id and k.status = 'confirmed' and k.deleted_at is null
    and c.status = 'published' and c.deleted_at is null
    and t.visibility = 'listed' and t.deleted_at is null
    and auth.uid() is not null
  group by t.id, t.name, t.type, t.city
  order by classes desc, t.name;
$$;
revoke execute on function public.person_teaches_at(uuid) from public, anon;
grant execute on function public.person_teaches_at(uuid) to authenticated;

-- ── and search can offer people now, because there is somewhere to send them ─
-- Step 23 left the prototype's Dancers section out with a stated reason: no
-- person page existed, and "a destination that does not exist is worse than no
-- destination". That reason is gone, so the section arrives. SECURITY INVOKER as
-- before, so `profiles`' signed-in-only policy decides: a stranger still finds
-- no people at all.
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
  ),
  people as (
    select 'person'::text as kind, p.id, p.full_name as name,
           (case p.role when 'trainer' then 'Artist' when 'studio' then 'Studio owner' else 'Dancer' end)
             || ' · ' || coalesce(p.city, '—') as sub,
           '/person/' || p.id::text as href
    from public.profiles p, q
    where p.deleted_at is null and q.term <> ''
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
  'Discover''s one search box: studios, artists, crews, events and PEOPLE whose name starts with the term or has a word that does, at most p_limit per kind. SECURITY INVOKER — the caller''s RLS decides, so a stranger finds no people (profiles are signed-in only).';
revoke execute on function public.search_dance_os(text, integer) from public;
grant execute on function public.search_dance_os(text, integer) to anon, authenticated;
