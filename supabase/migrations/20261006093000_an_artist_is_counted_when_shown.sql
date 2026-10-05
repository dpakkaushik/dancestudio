-- AN ARTIST IS COUNTED WHEN SHOWN (6 Oct 2026, decision 7 of the eight put to
-- the user on 5 Oct, "resolve all as you mentioned apart from point 5").
--
-- `impressions` (20260929140000) records every Discover shelf as one row: the
-- surface, the city, the kind and the ids in the order they were drawn. Its
-- CHECK admitted three kinds — business, class, crew — because when it was
-- written an artist had already been a PERSON (a `profiles` id) since R24,
-- 18 Sep 2026, and a row claiming a person is a business would be a lie in a
-- table nobody re-reads. So the Artists tab was the one shelf nobody recorded,
-- and "how often was I shown?" was unanswerable for exactly the people most
-- likely to ask it.
--
-- The whole of this file:
--   1. `impressions_kind_shape` admits 'person' as a fourth kind. Nothing
--      existing changes kind; no row is touched.
--   2. `impressions_for_person(p_user_id, p_days)` — the twin of
--      `impressions_for_business`: a platform admin's read, the same shape
--      (surface, shown, median position), gated on `is_platform_admin()`
--      inside, executable by `authenticated` only. ⚠ A function gated that
--      way answers the SERVICE ROLE with emptiness (10 Sep 2026), so the app
--      reads it with the admin's own client, as `/admin/reach` already does.
--
-- Not touched: the table's RLS (on, no policy — writes are the server's with
-- the service role, exactly as before), no grant on the table, no other
-- function. No `begin;`/`commit;` (Rule 18).

alter table public.impressions drop constraint impressions_kind_shape;
alter table public.impressions
  add constraint impressions_kind_shape
  check (subject_kind = any (array['business'::text, 'class'::text, 'crew'::text, 'person'::text]));

create or replace function public.impressions_for_person(p_user_id uuid, p_days integer default 30)
returns table(surface text, shown bigint, median_position numeric)
language sql
security definer
set search_path to 'public'
as $function$
  select i.surface,
         count(*) as shown,
         percentile_cont(0.5) within group (
           order by array_position(i.subject_ids, p_user_id)
         ) as median_position
    from public.impressions i
   where public.is_platform_admin()
     and i.subject_kind = 'person'
     and i.subject_ids @> array[p_user_id]
     and i.at >= now() - make_interval(days => greatest(p_days, 1))
   group by 1
   order by 2 desc;
$function$;

revoke all on function public.impressions_for_person(uuid, integer) from public, anon;
grant execute on function public.impressions_for_person(uuid, integer) to authenticated, service_role;

comment on function public.impressions_for_person(uuid, integer) is
  'How often an ARTIST (a person, R24) was shown on Discover''s Artists tab, by surface, with the median place in the shelf. A platform admin''s read — empty for anybody else, the service role included.';
