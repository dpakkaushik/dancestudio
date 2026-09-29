-- WHAT PEOPLE LOOKED FOR, AND WHAT THEY WERE SHOWN (29 Sep 2026) — backlog #5.
--
-- The user's own pick from the "records a marketplace at this scale normally
-- keeps and this one does not" list: search and impression events, "without
-- which there is no relevance ranking and no way to tell a studio why it gets
-- no bookings".
--
-- Today the platform knows what was BOOKED and nothing about what was SEEN. A
-- studio with no bookings and a studio nobody was ever shown look identical from
-- every screen in the app, and they are opposite problems: the first is a
-- product or a price, the second is placement.
--
-- ⚠⚠ THERE IS NO CLIENT-FACING DOOR TO EITHER TABLE, ON PURPOSE.
-- The obvious shape — an RPC granted to anon so the browser can record — is a
-- spam vector wearing a feature's clothes: Discover is public, so anybody with
-- the anon key could fill these tables at their leisure, and neither carries a
-- rate limit that would mean anything (the value of an impression IS that it was
-- cheap). Discover and the search box already render on OUR server, so the rows
-- are written there with the SERVICE ROLE and the browser is never involved.
-- RLS is ON and there is NOT ONE POLICY — the precedent is `webhook_events`
-- (Step 9) and `rate_limits` (18 Sep 2026), both machine-written the same way.
--
-- ⚠ AND AN IMPRESSION IS ONE ROW PER SHELF, NOT ONE PER CARD. Fifty cards on a
-- Discover page is fifty rows under the obvious design, and the question a
-- studio asks — "how often was I shown?" — is answered exactly as well by an
-- array. It is the difference between one insert per page view and fifty.
--
-- ⚠ A SEARCH TERM IS PERSONAL DATA. `viewer_id` is nullable because most of
-- Discover is read signed out, and neither table is readable by the person it
-- describes or by anybody else: only a platform admin, through the definer read
-- at the foot of this file. The privacy page already says DanceOS keeps usage
-- records; this is the first table that actually holds one.

-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT WAS SEARCHED FOR
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.search_events (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  /** null for a stranger — Discover's search box answers signed out */
  viewer_id uuid,
  /** what they typed, trimmed and capped; the raw term is the whole point */
  term text not null,
  /** the city the search was scoped to, or null for "everywhere" */
  city text,
  /** which tab was open — studios | artists | crews | classes, or `all` for the
      one search box that looks everywhere */
  scope text not null,
  /** how many rows came back. ⚠ ZERO IS THE MOST VALUABLE ROW IN THIS TABLE:
      a term people search and DanceOS cannot answer is either a studio that
      should exist or a word the search does not understand. */
  result_count integer not null,
  constraint search_events_term_shape check (
    btrim(term) <> '' and length(term) <= 120
  ),
  constraint search_events_scope_shape check (
    scope in ('all', 'studios', 'artists', 'crews', 'classes')
  ),
  constraint search_events_count_shape check (result_count >= 0)
);

comment on table public.search_events is
  'What people typed into the search box and how many rows answered. Written by '
  'the SERVER with the service role — there is no client door and no policy. '
  'Read only by a platform admin, through search_terms_with_no_answer().';

create index if not exists search_events_at_idx on public.search_events (at desc);
/** the query this table exists for: the terms that answered nothing */
create index if not exists search_events_empty_idx
  on public.search_events (lower(btrim(term)))
  where result_count = 0;

alter table public.search_events enable row level security;
-- ⚠ NO POLICY. See the header: nothing but the service role touches this.
revoke all on public.search_events from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT WAS SHOWN
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.impressions (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  viewer_id uuid,
  /** where the shelf was drawn */
  surface text not null,
  /** the city the shelf was measured in, or null */
  city text,
  /** what kind of thing the ids name — one shelf holds one kind */
  subject_kind text not null,
  /** ⚠ THE WHOLE SHELF, IN ORDER. Position matters for relevance: being shown
      fiftieth is not being shown. `array_position` answers it without a column. */
  subject_ids uuid[] not null,
  constraint impressions_surface_shape check (
    surface in ('discover', 'search', 'followed', 'nearby')
  ),
  constraint impressions_kind_shape check (
    subject_kind in ('business', 'class', 'crew')
  ),
  /** ⚠ a bound, not a page size: a shelf longer than this is a bug upstream,
      and an unbounded array in a row is how one page view costs a megabyte.
      ⚠⚠ THE `coalesce` IS LOAD-BEARING AND THE DRY RUN IS WHAT FOUND IT:
      `array_length('{}', 1)` is NULL, not 0 — and a CHECK PASSES ON NULL, since
      only FALSE fails one. Written as a bare `between`, this constraint accepted
      the one row it exists to refuse: an impression recording that nothing was
      shown, which is not a fact about anything. */
  constraint impressions_ids_shape check (
    coalesce(array_length(subject_ids, 1), 0) between 1 and 200
  )
);

comment on table public.impressions is
  'One row per SHELF rendered (not per card): which businesses, classes or crews '
  'were shown, in order, on which surface. Written by the SERVER with the service '
  'role — no client door, no policy. The other half of "why do I get no bookings".';

create index if not exists impressions_at_idx on public.impressions (at desc);
/** the query a studio's own answer needs: "how often did I appear?" */
create index if not exists impressions_subject_ids_idx
  on public.impressions using gin (subject_ids);

alter table public.impressions enable row level security;
-- ⚠ NO POLICY.
revoke all on public.impressions from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- THE TWO READS — a platform admin's, and nobody else's
-- ─────────────────────────────────────────────────────────────────────────────

/** Terms people searched that answered NOTHING, commonest first.
 *  ⚠ The one report this table was built for: every row is either a studio that
 *  should be on DanceOS or a word the search box does not understand. */
create or replace function public.search_terms_with_no_answer(
  p_days integer default 30,
  p_limit integer default 50
)
returns table (term text, searches bigint, last_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select lower(btrim(s.term)) as term,
         count(*)             as searches,
         max(s.at)            as last_at
    from public.search_events s
   where public.is_platform_admin()
     and s.result_count = 0
     and s.at >= now() - make_interval(days => greatest(p_days, 1))
   group by 1
   order by 2 desc, 3 desc
   limit least(greatest(p_limit, 1), 500);
$$;

comment on function public.search_terms_with_no_answer(integer, integer) is
  'Search terms that returned nothing, for a platform admin. ⚠ Answers the '
  'service role with EMPTINESS rather than an error (the 10 Sep 2026 lesson), '
  'because is_platform_admin() is false for a connection with no auth.uid().';

/** How often one business was SHOWN, and where in the shelf.
 *  ⚠ Takes a business id and is the admin's alone for now. Handing a studio its
 *  own figure is a different decision — it is a number about other people's
 *  attention — and belongs with a screen rather than with the table. */
create or replace function public.impressions_for_business(
  p_business_id uuid,
  p_days integer default 30
)
returns table (surface text, shown bigint, median_position numeric)
language sql
security definer
set search_path = public
as $$
  select i.surface,
         count(*) as shown,
         percentile_cont(0.5) within group (
           order by array_position(i.subject_ids, p_business_id)
         ) as median_position
    from public.impressions i
   where public.is_platform_admin()
     and i.subject_kind = 'business'
     and i.subject_ids @> array[p_business_id]
     and i.at >= now() - make_interval(days => greatest(p_days, 1))
   group by 1
   order by 2 desc;
$$;

comment on function public.impressions_for_business(uuid, integer) is
  'How often a business appeared on each surface and where in the shelf, for a '
  'platform admin. Median position, because a mean is moved by one long shelf.';

revoke all on function public.search_terms_with_no_answer(integer, integer) from public, anon;
revoke all on function public.impressions_for_business(uuid, integer) from public, anon;
grant execute on function public.search_terms_with_no_answer(integer, integer) to authenticated;
grant execute on function public.impressions_for_business(uuid, integer) to authenticated;
