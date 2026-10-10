-- ⚠ Rule 9 (a new column on profiles, a read that widens what a signed-in
-- reader sees about somebody else, and two storage limits).
--
-- The user, 11 Oct 2026: "Setting up profile should show selecting dance
-- styles twice … 1. Dance Styles they want to learn and 2. Dance Styles they
-- already know … discover should get a setting icon … to change the dance
-- styles you want to learn should be called recommendation settings … full
-- stats page should be visible when looking at someones profile. right now
-- only top section visible … profile photo more than 5 mb should be around
-- 25mb."
--
-- THREE THINGS, NOTHING ELSE:
--
--   1 · `profiles.learn_styles` — the styles a person wants to LEARN, which is
--       what Discover recommends from. `profiles.styles` stays what they already
--       dance. ⚠ PRIVATE: since 20261006092000 `profiles` grants SELECT column by
--       column, so a new column is unreadable to every client until granted —
--       and it is not granted. It is read through `my_learn_styles()` and written
--       through `set_my_learn_styles()`, both scoped to `auth.uid()` inside. A
--       wish list is nobody else's business.
--
--   2 · `person_session_history(p_user_id, p_limit)` — the per-session rows
--       `my_session_history` returns for the caller, for somebody else, so their
--       Stats page draws its graphs, its number grid's lists and its History
--       column (the page drew only the figures). ⚠ WHAT IT PUBLISHES to a
--       signed-in reader: the ENDED sessions a person taught, assisted and
--       attended — and ONLY on a published (or completed) class of a LISTED business, so an
--       unlisted studio's name and a draft never leave through it. Nothing ahead
--       of now. Not executable by anon.
--
--   3 · Both picture buckets take 25 MB (the media bucket was 15 MB, the studio
--       photos 5 MB) — the app's own pre-crop check rises to match, and a
--       picture the cropper cannot decode is uploaded as it is.
--
-- No policy, no existing function, no existing row. Nothing backfilled:
-- `learn_styles` starts empty for everybody, and recommendations then fall back
-- to what Discover already shows.

-- ── 1 · the styles a person wants to learn ──────────────────────────────────
create or replace function public.are_style_names(p text[])
returns boolean
language sql
immutable
set search_path to ''
as $$
  select p is not null
     and coalesce(array_length(p, 1), 0) <= 12
     and not exists (
       select 1 from unnest(p) as x
       where x is null or length(btrim(x)) < 1 or length(x) > 40 or x <> btrim(x)
     );
$$;
-- ⚠ a new function arrives with Supabase's default grants (anon included), so
-- anon is revoked by name; a signed-in client keeps EXECUTE because the CHECK
-- below runs it on that client's own write
revoke all on function public.are_style_names(text[]) from public, anon;
grant execute on function public.are_style_names(text[]) to authenticated, service_role;

alter table public.profiles
  add column learn_styles text[] not null default '{}'::text[];
alter table public.profiles
  add constraint profiles_learn_styles_shape check (public.are_style_names(learn_styles));

comment on column public.profiles.learn_styles is
  'The dance styles this person wants to LEARN, in their order (11 Oct 2026). '
  'What Discover recommends from; `styles` is what they already dance. Private: '
  'no client SELECT grant — read through my_learn_styles(), written through '
  'set_my_learn_styles().';

create or replace function public.my_learn_styles()
returns text[]
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(
    (select p.learn_styles from public.profiles p where p.id = auth.uid() and p.deleted_at is null),
    '{}'::text[]
  );
$$;
revoke all on function public.my_learn_styles() from public, anon;
grant execute on function public.my_learn_styles() to authenticated;

create or replace function public.set_my_learn_styles(p_styles text[])
returns text[]
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_clean text[];
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  -- trimmed, blanks dropped, a repeat kept once in the order first given
  select coalesce(array_agg(x order by first_at), '{}'::text[]) into v_clean
  from (
    select btrim(s) as x, min(ord) as first_at
    from unnest(coalesce(p_styles, '{}'::text[])) with ordinality as u(s, ord)
    where s is not null and btrim(s) <> ''
    group by btrim(s)
  ) d;
  if coalesce(array_length(v_clean, 1), 0) > 12 then
    raise exception 'at most 12 styles to learn';
  end if;
  if exists (select 1 from unnest(v_clean) x where length(x) > 40) then
    raise exception 'a style name is at most 40 characters';
  end if;
  update public.profiles
     set learn_styles = v_clean
   where id = v_uid and deleted_at is null;
  if not found then
    raise exception 'finish onboarding first';
  end if;
  return v_clean;
end;
$$;
revoke all on function public.set_my_learn_styles(text[]) from public, anon;
grant execute on function public.set_my_learn_styles(text[]) to authenticated;

-- ── 2 · somebody else's sessions, for their Stats page ─────────────────────
create or replace function public.person_session_history(p_user_id uuid, p_limit integer default 200)
returns table(session_id uuid, side text, class_id uuid, share_slug text, title text, style text, room text, city text, business_id uuid, business_name text, artist_name text, starts_at timestamp with time zone, ends_at timestamp with time zone, minutes integer)
language sql
stable
security definer
set search_path to ''
as $$
  with who as (
    select p.id as uid from public.profiles p
    where p.id = p_user_id and p.deleted_at is null and auth.uid() is not null
  ), rows as (
    select distinct 'conducted'::text as side, s.id as sid, c.id as cid, s.starts_at, s.ends_at, c.title, c.style, c.room, c.share_slug, c.business_id
    from public.class_people k
    join public.classes c on c.id = k.class_id
    join public.class_sessions s on s.class_id = c.id, who
    where k.user_id = who.uid and k.kind = 'artist' and k.status = 'confirmed'
      and (k.deleted_at is null or s.ends_at <= k.deleted_at)
      and c.deleted_at is null and s.deleted_at is null and s.ends_at < now()
    union
    select distinct 'assisted', s.id, c.id, s.starts_at, s.ends_at, c.title, c.style, c.room, c.share_slug, c.business_id
    from public.class_people k
    join public.classes c on c.id = k.class_id
    join public.class_sessions s on s.class_id = c.id, who
    where k.user_id = who.uid and k.kind = 'assistant' and k.status = 'confirmed'
      and (k.deleted_at is null or s.ends_at <= k.deleted_at)
      and c.deleted_at is null and s.deleted_at is null and s.ends_at < now()
    union
    select 'attended', s.id, c.id, s.starts_at, s.ends_at, c.title, c.style, c.room, c.share_slug, c.business_id
    from public.attendance a
    join public.class_sessions s on s.id = a.session_id
    join public.classes c on c.id = a.class_id, who
    where a.user_id = who.uid and a.deleted_at is null
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
  join public.classes c2 on c2.id = r.cid
  join public.businesses t on t.id = r.business_id
  -- ⚠ only what was public: a PUBLISHED (or completed — it was published to run)
  -- class of a LISTED business; never a draft, never an unlisted studio's name
  where c2.status in ('published', 'completed') and t.visibility = 'listed' and t.deleted_at is null
  order by r.starts_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$$;
revoke all on function public.person_session_history(uuid, integer) from public, anon;
grant execute on function public.person_session_history(uuid, integer) to authenticated;

comment on function public.person_session_history(uuid, integer) is
  'Somebody else''s ENDED sessions — taught, assisted, attended — on published '
  'classes of listed businesses only, for their Stats page (11 Oct 2026). Signed in only.';

-- ── 3 · 25 MB pictures ─────────────────────────────────────────────────────
update storage.buckets set file_size_limit = 26214400 where id in ('media', 'org-proof');
