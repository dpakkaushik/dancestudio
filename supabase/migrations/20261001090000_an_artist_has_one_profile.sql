-- AN ARTIST HAS ONE PROFILE, SO THE DATABASE STOPS NAMING A SECOND ONE
-- (1 Oct 2026, the user: "are artist profile and artist page 2 seprate things?",
-- then "yeah please fix this part").
--
-- They are not two things (R24, 18 Sep 2026): an artist is their profile, and the
-- `artist_page` business row is the plumbing their classes, team and money hang
-- off. The app stopped naming that row in its own words the same day; this is the
-- one sentence the DATABASE still prints to a person — `why_no_class`, which the
-- Manage segment draws in place of Create class when an artist's plan has lapsed.
--
-- ⚠ ONE LITERAL, AND NOTHING ELSE. The body is read out of the catalog and the
-- sentence is swapped by an anchor asserted to occur exactly once — a re-typed
-- function is one that can differ (28 Sep 2026: five of six were wrong). It is
-- `create or replace` with the same signature, so not one grant moves.
--
-- ⚠ Deliberately NOT touched: `create_business_with_owner`'s three artist-page
-- refusals (raised only on the path `ensureArtistPage` takes, whose refusals Home
-- swallows) and `guard_business_type`'s (raised only by a direct PATCH of `type`).
-- No screen prints either, and rewriting a live function for words nobody reads
-- is risk without benefit. The organization line inside `why_no_class` is dead
-- (there are no organizations) and is left alone for the same reason.
--
-- No begin/commit: `supabase db push` wraps the file itself (Rule 18).

do $$
declare
  v_def text;
  v_old text := 'Classes on an artist page need a live Artist plan';
  v_new text := 'Teaching your own classes needs a live Artist plan — renew it from Subscription on Home';
  v_n int;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'why_no_class';
  if v_def is null then
    raise exception 'why_no_class not found';
  end if;
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then
    raise exception 'expected the sentence exactly once in why_no_class, found %', v_n;
  end if;
  execute replace(v_def, v_old, v_new);
end
$$;

comment on function public.why_no_class(uuid) is
  'The one sentence that stands between a business and a new class, or null. An artist is their profile (R24): the artist_page row is never named to them, so the lapsed-plan sentence speaks of their own classes (1 Oct 2026).';
