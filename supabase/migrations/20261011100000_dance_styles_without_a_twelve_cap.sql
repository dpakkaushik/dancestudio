-- ═══════════════════════════════════════════════════════════════════════════
-- DANCE STYLES WITHOUT A TWELVE CAP (10 Oct 2026)
--
-- The user: "no limit of 12 dance styles should be unlimited", and, asked which
-- lists, "All four": the styles a person wants to LEARN, the styles they DANCE,
-- a studio's (any business's) styles and a crew's styles.
--
-- The registry holds about fifty styles, so "unlimited" in practice means "as
-- many as exist". The database keeps one hidden SAFETY CEILING of 100 so a broken
-- script cannot write thousands of names into a row — the user's chosen option.
--
-- What moves — every 12 that caps a styles list, and nothing else:
--   · profiles_styles_check and crews_styles_check: cardinality <= 12 → <= 100
--   · are_style_names (the learn_styles CHECK helper): <= 12 → <= 100
--   · set_my_learn_styles, update_my_profile, update_business_profile,
--     set_crew_styles: the `> 12` refusal → `> 100`, with its words.
-- The four function bodies are edited OUT OF THE CATALOG by asserted anchor
-- (`_dos_swap`, as in 20261004190000), so a body that has drifted refuses the
-- whole migration; `create or replace` keeps every signature, so no grant moves.
--
-- What deliberately does NOT move: every "at least one style" floor, the
-- 40-character name limit, no table, no row, no policy, no grant. Nothing here
-- writes `begin;`/`commit;` (Rule 18).
-- ═══════════════════════════════════════════════════════════════════════════

create function public._dos_swap(p_def text, p_from text, p_to text, p_fn text, p_expect integer default 1) returns text
language plpgsql as $fn$
declare v_n integer;
begin
  v_n := (length(p_def) - length(replace(p_def, p_from, ''))) / length(p_from);
  if v_n <> p_expect then
    raise exception 'anchor found % times in %, expected %: %', v_n, p_fn, p_expect, left(p_from, 80);
  end if;
  return replace(p_def, p_from, p_to);
end;
$fn$;

do $migration$
declare
  v_def text;
begin
  -- the styles to learn
  select pg_get_functiondef('public.set_my_learn_styles(text[])'::regprocedure) into v_def;
  v_def := public._dos_swap(v_def, 'coalesce(array_length(v_clean, 1), 0) > 12', 'coalesce(array_length(v_clean, 1), 0) > 100', 'set_my_learn_styles');
  v_def := public._dos_swap(v_def, '''at most 12 styles to learn''', '''at most 100 styles to learn''', 'set_my_learn_styles');
  execute v_def;

  -- the styles a person dances
  select pg_get_functiondef('public.update_my_profile(text, text, smallint, jsonb, text[], text, text, boolean, date)'::regprocedure) into v_def;
  v_def := public._dos_swap(v_def, 'cardinality(v_styles) > 12', 'cardinality(v_styles) > 100', 'update_my_profile');
  v_def := public._dos_swap(v_def, '''at most 12 styles''', '''at most 100 styles''', 'update_my_profile');
  execute v_def;

  -- a business's styles
  select pg_get_functiondef('public.update_business_profile(uuid, smallint, text, jsonb, text[], boolean, boolean, boolean, boolean, text, text, text[])'::regprocedure) into v_def;
  v_def := public._dos_swap(v_def,
    'if array_length(v_styles, 1) > 12 then raise exception ''at most twelve dance styles''; end if;',
    'if array_length(v_styles, 1) > 100 then raise exception ''at most 100 dance styles''; end if;',
    'update_business_profile');
  -- and the body's own comment, so it does not go on saying twelve
  v_def := public._dos_swap(v_def, 'given, at most twelve; not given', 'given, at most 100; not given', 'update_business_profile');
  execute v_def;

  -- a crew's styles
  select pg_get_functiondef('public.set_crew_styles(uuid, text[])'::regprocedure) into v_def;
  v_def := public._dos_swap(v_def,
    'if array_length(v_styles, 1) > 12 then raise exception ''at most twelve dance styles''; end if;',
    'if array_length(v_styles, 1) > 100 then raise exception ''at most 100 dance styles''; end if;',
    'set_crew_styles');
  execute v_def;
end
$migration$;

drop function public._dos_swap(text, text, text, text, integer);

-- the learn_styles CHECK helper (written in 20261011090000; same signature, so
-- its grants stay exactly as they are)
create or replace function public.are_style_names(p text[])
returns boolean
language sql
immutable
set search_path to ''
as $$
  select p is not null
     and coalesce(array_length(p, 1), 0) <= 100
     and not exists (
       select 1 from unnest(p) as x
       where x is null or length(btrim(x)) < 1 or length(x) > 40 or x <> btrim(x)
     );
$$;

alter table public.profiles drop constraint profiles_styles_check;
alter table public.profiles add constraint profiles_styles_check check (cardinality(styles) <= 100);
alter table public.crews drop constraint crews_styles_check;
alter table public.crews add constraint crews_styles_check check (cardinality(styles) <= 100);
