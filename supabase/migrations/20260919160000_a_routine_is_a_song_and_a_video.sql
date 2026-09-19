-- ═══════════════════════════════════════════════════════════════════════════
-- A ROUTINE IS A SONG AND A VIDEO (19 Sep 2026)
--
-- The user: "Routines are just a combination of Music — link or MP3 — and
-- Video — link. Artist should be able to add Routines from the class detail
-- page and should be visible. There should be a way to see the usage for that
-- particular routine as well — how many sessions taken with this, and details
-- of people who have taken classes for this routine and how many, all from
-- within the routines section."
--
-- The Routines tile has opened the prototype's "nothing here yet" since 18 Sep.
-- This is the desk behind it, lifted from S_choreos (17115) and
-- S_routinedetail (17215): a routine is a NAME, a STYLE and a LEVEL over two
-- media — the song (a link, or an MP3 in the media bucket) and the video (a
-- link) — and everything else on the screen is USAGE, counted from rows the
-- app already keeps.
--
--   · `routines` — the person's own. A routine belongs to the ARTIST, not to a
--     business: they carry it from studio to studio, which is why the tile is
--     on a person's Home and not on a studio's.
--   · `class_routines` — which routines a class is taught from. The link is
--     made by the class's CONFIRMED ARTIST or by the business's owner, and only
--     with a routine that is the caller's own. So "add from the class detail
--     page" is exactly what it says, and nobody can attach somebody else's work.
--   · THE USAGE IS COUNTED, NEVER STORED: `my_routines()` gives the desk a row
--     per routine with its classes, the sessions that have actually HELD and the
--     people who turned up; `routine_usage(uuid)` gives the detail page the
--     classes and those people by name. Both are the OWNER's alone — who
--     attended somebody's class is not a fact for the platform to hand around —
--     and both count ATTENDANCE, not bookings, for the same reason Stats does
--     (a booking nobody marked is not a session danced).
--
-- ⚠ What a stranger gains: a routine's NAME, SONG and VIDEO on a published
-- class of a listed business — the class page already names its teacher, its
-- room and its price, and a routine is what the class teaches. The usage is
-- never public: no count, no roster, not even to the studio — only the person
-- whose routine it is.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── the table ───────────────────────────────────────────────────────────────
create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  style text not null check (char_length(btrim(style)) between 1 and 40),
  level text not null default 'all' check (level in ('all', 'beginner', 'intermediate', 'professional')),
  -- the song: a name, and either a link or a path in the media bucket
  song_title text check (song_title is null or char_length(btrim(song_title)) <= 120),
  song_url text check (song_url is null or char_length(song_url) <= 500),
  song_is_file boolean not null default false,
  -- the video: a link (the user's list says link; a file would be a second bucket)
  video_url text check (video_url is null or char_length(video_url) <= 500),
  status text not null default 'live' check (status in ('live', 'draft')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users (id),
  updated_by uuid not null default auth.uid() references auth.users (id),
  deleted_at timestamptz
);
comment on table public.routines is
  'A routine is a song and a video (19 Sep 2026): the choreography a person teaches, carried from studio to studio. Usage is never stored — it is counted from the classes it is attached to.';
create index if not exists routines_owner_idx on public.routines (owner_id) where deleted_at is null;

create table if not exists public.class_routines (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  routine_id uuid not null references public.routines (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users (id),
  updated_by uuid not null default auth.uid() references auth.users (id),
  deleted_at timestamptz
);
comment on table public.class_routines is
  'Which routines a class is taught from (19 Sep 2026). Added from the class page by its confirmed artist or the business owner, with a routine of their own.';
create unique index if not exists class_routines_live_idx
  on public.class_routines (class_id, routine_id) where deleted_at is null;
create index if not exists class_routines_routine_idx on public.class_routines (routine_id) where deleted_at is null;

drop trigger if exists routines_updated_at on public.routines;
create trigger routines_updated_at before update on public.routines
  for each row execute function public.set_updated_at();
drop trigger if exists class_routines_updated_at on public.class_routines;
create trigger class_routines_updated_at before update on public.class_routines
  for each row execute function public.set_updated_at();

-- ── who may see a routine ───────────────────────────────────────────────────
-- SECURITY DEFINER on purpose: a policy on `routines` that queried
-- `class_routines` directly, whose own policy reads `classes`, is the 42P17
-- shape this file met on 18 Sep. The helper answers for everybody and the
-- policy just asks it.
create or replace function public.routine_is_on_a_public_class(p_routine_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.class_routines cr
      join public.classes c on c.id = cr.class_id
      join public.businesses b on b.id = c.business_id
     where cr.routine_id = p_routine_id
       and cr.deleted_at is null
       and c.deleted_at is null
       and c.status = 'published'
       and b.deleted_at is null
       and b.visibility = 'listed'
  );
$$;
grant execute on function public.routine_is_on_a_public_class(uuid) to anon, authenticated;

alter table public.routines enable row level security;
alter table public.class_routines enable row level security;
-- a new table arrives with Supabase's DEFAULT privileges — ALL to anon and
-- authenticated (the 19 Sep dry-run finding): a policy is not a grant, and a
-- grant is not a policy. Reads only; the policies decide which rows.
revoke all on public.routines from public, anon, authenticated;
revoke all on public.class_routines from public, anon, authenticated;
grant select on public.routines to anon, authenticated;
grant select on public.class_routines to anon, authenticated;

drop policy if exists "people read their own routines" on public.routines;
create policy "people read their own routines" on public.routines
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "anyone reads a routine on a public class" on public.routines;
create policy "anyone reads a routine on a public class" on public.routines
  for select to anon, authenticated
  using (deleted_at is null and public.routine_is_on_a_public_class(id));

drop policy if exists "the class's people read its routines" on public.class_routines;
create policy "the class's people read its routines" on public.class_routines
  for select to authenticated
  using (
    exists (select 1 from public.classes c where c.id = class_id and c.deleted_at is null)
  );

drop policy if exists "anyone reads the routines of a public class" on public.class_routines;
create policy "anyone reads the routines of a public class" on public.class_routines
  for select to anon, authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.classes c join public.businesses b on b.id = c.business_id
       where c.id = class_id and c.deleted_at is null and c.status = 'published'
         and b.deleted_at is null and b.visibility = 'listed'
    )
  );

-- ── the doors ───────────────────────────────────────────────────────────────
create or replace function public.save_routine(
  p_routine_id uuid,
  p_title text,
  p_style text,
  p_level text,
  p_song_title text,
  p_song_url text,
  p_song_is_file boolean,
  p_video_url text,
  p_status text
)
returns public.routines
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.routines;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_title is null or char_length(btrim(p_title)) < 1 then
    raise exception 'name the routine';
  end if;
  if p_style is null or char_length(btrim(p_style)) < 1 then
    raise exception 'pick a dance style';
  end if;
  if p_level not in ('all', 'beginner', 'intermediate', 'professional') then
    raise exception 'invalid level';
  end if;
  if p_status not in ('live', 'draft') then
    raise exception 'invalid status';
  end if;
  -- A LINK IS A WEB ADDRESS, AND A FILE IS IN YOUR OWN FOLDER (the 11 Sep
  -- lesson: a javascript: URL stored as a link is rendered on a page somebody
  -- else reads). A song that is a FILE carries a storage path, never a URL.
  if p_song_url is not null and btrim(p_song_url) <> '' then
    if p_song_is_file then
      if btrim(p_song_url) !~ ('^routines/' || v_user::text || '/[^[:space:]]+$') then
        raise exception 'that file is not in your own folder';
      end if;
    elsif btrim(p_song_url) !~* '^https?://[^[:space:]]+$' then
      raise exception 'a song link is a web address starting with http:// or https://';
    end if;
  end if;
  if p_video_url is not null and btrim(p_video_url) <> ''
     and btrim(p_video_url) !~* '^https?://[^[:space:]]+$' then
    raise exception 'a video link is a web address starting with http:// or https://';
  end if;

  if p_routine_id is null then
    insert into public.routines (owner_id, title, style, level, song_title, song_url, song_is_file, video_url, status)
    values (v_user, btrim(p_title), btrim(p_style), p_level,
            nullif(btrim(p_song_title), ''), nullif(btrim(p_song_url), ''), coalesce(p_song_is_file, false),
            nullif(btrim(p_video_url), ''), p_status)
    returning * into v_row;
    return v_row;
  end if;

  update public.routines
     set title = btrim(p_title),
         style = btrim(p_style),
         level = p_level,
         song_title = nullif(btrim(p_song_title), ''),
         song_url = nullif(btrim(p_song_url), ''),
         song_is_file = coalesce(p_song_is_file, false),
         video_url = nullif(btrim(p_video_url), ''),
         status = p_status,
         updated_by = v_user
   where id = p_routine_id and owner_id = v_user and deleted_at is null
  returning * into v_row;
  if v_row.id is null then
    raise exception 'that routine is not yours';
  end if;
  return v_row;
end;
$$;
revoke execute on function public.save_routine(uuid, text, text, text, text, text, boolean, text, text) from public, anon;
grant execute on function public.save_routine(uuid, text, text, text, text, text, boolean, text, text) to authenticated, service_role;

create or replace function public.delete_routine(p_routine_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  update public.routines set deleted_at = now(), updated_by = v_user
   where id = p_routine_id and owner_id = v_user and deleted_at is null;
  if not found then
    raise exception 'that routine is not yours';
  end if;
  -- the classes keep running; the link is what goes (S_routinedetail's own words)
  update public.class_routines set deleted_at = now(), updated_by = v_user
   where routine_id = p_routine_id and deleted_at is null;
end;
$$;
revoke execute on function public.delete_routine(uuid) from public, anon;
grant execute on function public.delete_routine(uuid) to authenticated, service_role;

-- who may put a routine on a class: its CONFIRMED ARTIST, or the business's owner
create or replace function public.can_set_class_routines(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.class_people k
     where k.class_id = p_class_id and k.user_id = auth.uid()
       and k.kind = 'artist' and k.status = 'confirmed' and k.deleted_at is null
  ) or exists (
    select 1 from public.classes c
      join public.business_members m on m.business_id = c.business_id
     where c.id = p_class_id and c.deleted_at is null
       and m.user_id = auth.uid() and m.member_role = 'owner' and m.deleted_at is null
  );
$$;
-- ⚠ a new function arrives with Supabase's DEFAULT privileges — execute to anon
-- too (the 16 Sep lesson). Revoked first, then granted: anon has no business
-- asking whether it may edit a class's routines.
revoke execute on function public.can_set_class_routines(uuid) from public, anon;
grant execute on function public.can_set_class_routines(uuid) to authenticated;

create or replace function public.add_class_routine(p_class_id uuid, p_routine_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not public.can_set_class_routines(p_class_id) then
    raise exception 'only the artist taking this class, or the studio that owns it, adds a routine';
  end if;
  if not exists (select 1 from public.routines r where r.id = p_routine_id and r.owner_id = v_user and r.deleted_at is null) then
    raise exception 'that routine is not yours';
  end if;
  insert into public.class_routines (class_id, routine_id)
  values (p_class_id, p_routine_id)
  on conflict do nothing;
  -- a link taken down and put back again is the same link
  update public.class_routines set deleted_at = null, updated_by = v_user
   where class_id = p_class_id and routine_id = p_routine_id and deleted_at is not null;
end;
$$;
revoke execute on function public.add_class_routine(uuid, uuid) from public, anon;
grant execute on function public.add_class_routine(uuid, uuid) to authenticated, service_role;

create or replace function public.remove_class_routine(p_class_id uuid, p_routine_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not public.can_set_class_routines(p_class_id)
     and not exists (select 1 from public.routines r where r.id = p_routine_id and r.owner_id = v_user) then
    raise exception 'only the artist taking this class, or the studio that owns it, changes its routines';
  end if;
  update public.class_routines set deleted_at = now(), updated_by = v_user
   where class_id = p_class_id and routine_id = p_routine_id and deleted_at is null;
end;
$$;
revoke execute on function public.remove_class_routine(uuid, uuid) from public, anon;
grant execute on function public.remove_class_routine(uuid, uuid) to authenticated, service_role;

-- ── THE USAGE, COUNTED ──────────────────────────────────────────────────────
-- The desk: a row per routine of the caller's own, with what it has been used
-- for. `classes` is how many classes carry it, `sessions` how many of their
-- sessions have actually ENDED (a class on the calendar has taught nobody yet)
-- and `students` how many distinct people turned up to one — attendance, not
-- bookings, the rule Step 25 set.
create or replace function public.my_routines()
returns table (
  id uuid, title text, style text, level text,
  song_title text, song_url text, song_is_file boolean, video_url text, status text,
  created_at timestamptz,
  classes integer, sessions integer, students integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select r.* from public.routines r
     where r.owner_id = auth.uid() and r.deleted_at is null
  ),
  held as (
    select cr.routine_id,
           count(distinct cr.class_id)::integer as n_classes,
           count(distinct s.id)::integer as n_sessions
      from public.class_routines cr
      join public.classes c on c.id = cr.class_id and c.deleted_at is null
      left join public.class_sessions s
        on s.class_id = c.id and s.deleted_at is null and s.ends_at < now()
     where cr.deleted_at is null
       and cr.routine_id in (select id from mine)
     group by cr.routine_id
  ),
  who as (
    select cr.routine_id, count(distinct a.user_id)::integer as n_students
      from public.class_routines cr
      join public.attendance a on a.class_id = cr.class_id and a.deleted_at is null
     where cr.deleted_at is null and cr.routine_id in (select id from mine)
     group by cr.routine_id
  )
  select m.id, m.title, m.style, m.level,
         m.song_title, m.song_url, m.song_is_file, m.video_url, m.status, m.created_at,
         coalesce(h.n_classes, 0), coalesce(h.n_sessions, 0), coalesce(w.n_students, 0)
    from mine m
    left join held h on h.routine_id = m.id
    left join who w on w.routine_id = m.id
   order by m.created_at desc;
$$;
comment on function public.my_routines() is
  'The caller''s own routines with their usage (19 Sep 2026): how many classes carry each, how many of their sessions have ended, and how many distinct people turned up. Counted, never stored.';
revoke execute on function public.my_routines() from public, anon;
grant execute on function public.my_routines() to authenticated;

-- The detail page: the classes a routine is taught in, and the people who
-- learned it. THE OWNER'S ALONE — who attended a class is not a fact the
-- platform hands to anybody who asks for a routine id.
create or replace function public.routine_classes(p_routine_id uuid)
returns table (
  class_id uuid, share_slug text, style text, level text, status text,
  business_name text, starts_at timestamptz, sessions integer, students integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.share_slug, c.style, c.level, c.status, b.name,
         (select min(s.starts_at) from public.class_sessions s where s.class_id = c.id and s.deleted_at is null),
         (select count(*)::integer from public.class_sessions s where s.class_id = c.id and s.deleted_at is null and s.ends_at < now()),
         (select count(distinct a.user_id)::integer from public.attendance a where a.class_id = c.id and a.deleted_at is null)
    from public.class_routines cr
    join public.classes c on c.id = cr.class_id and c.deleted_at is null
    join public.businesses b on b.id = c.business_id
   where cr.routine_id = p_routine_id
     and cr.deleted_at is null
     and exists (select 1 from public.routines r where r.id = p_routine_id and r.owner_id = auth.uid() and r.deleted_at is null)
   order by 7 desc nulls last;
$$;
revoke execute on function public.routine_classes(uuid) from public, anon;
grant execute on function public.routine_classes(uuid) to authenticated;

create or replace function public.routine_students(p_routine_id uuid)
returns table (user_id uuid, full_name text, profile_photo_path text, city text, sessions integer, last_on timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.user_id, p.full_name, p.profile_photo_path, p.city,
         count(*)::integer as sessions, max(a.created_at) as last_on
    from public.class_routines cr
    join public.attendance a on a.class_id = cr.class_id and a.deleted_at is null
    join public.profiles p on p.id = a.user_id and p.deleted_at is null
   where cr.routine_id = p_routine_id
     and cr.deleted_at is null
     and exists (select 1 from public.routines r where r.id = p_routine_id and r.owner_id = auth.uid() and r.deleted_at is null)
   group by a.user_id, p.full_name, p.profile_photo_path, p.city
   order by 5 desc, 2 asc;
$$;
comment on function public.routine_students(uuid) is
  'The people who have danced a routine, and how many of its sessions each turned up to (19 Sep 2026). The routine OWNER''s alone — attendance is not a public fact.';
revoke execute on function public.routine_students(uuid) from public, anon;
grant execute on function public.routine_students(uuid) to authenticated;

-- ── an MP3 goes in the person's own routines folder ─────────────────────────
-- The media bucket takes audio now, and the limit rises to 15 MB: a cropped
-- picture is a few hundred KB (the cropper sees to that) and a four-minute MP3
-- is five to ten.
update storage.buckets
   set file_size_limit = 15728640,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a']
 where id = 'media';

drop policy if exists "people write their own routines folder" on storage.objects;
create policy "people write their own routines folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = 'routines' and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists "people replace their own routines folder" on storage.objects;
create policy "people replace their own routines folder"
  on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = 'routines' and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists "people delete from their own routines folder" on storage.objects;
create policy "people delete from their own routines folder"
  on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = 'routines' and (storage.foldername(name))[2] = auth.uid()::text);
