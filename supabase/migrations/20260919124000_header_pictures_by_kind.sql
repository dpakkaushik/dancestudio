-- 19 Sep 2026: HEADER PICTURES BY KIND — an organization ten, a studio ten, an
-- artist FIVE, a crew FIVE, a user one. ⚠ RLS: one new public table (a crew's).
--
-- The user: "Poster on all profiles should be swipeable with limits —
-- Organization & Studio 10, Artist and Crews 5, User 1." The rail already
-- swipes. What changes is who may hold how many:
--   · an ORGANIZATION had no header at all (15 Sep: "not a place") — it holds
--     ten now, through the same door and table a person's header uses
--     (`profile_header_photos`, `gallery/{id}/`);
--   · an ARTIST held ten — FIVE now. Nothing stored is deleted: the cap is what
--     `add_my_header_photo` refuses beyond, and the page shows what it shows;
--   · a STUDIO's ten is its verification photos, unchanged;
--   · a USER's one is unchanged;
--   · a CREW held a single photo (its disc) — it gains a header of up to five,
--     a table of its own (`crew_header_photos`) in the leader's `crews/{id}/`
--     folder of the public bucket, readable by anyone (a crew is public), added
--     and removed only by the leader through two doors.

-- ── the person's door, capped by KIND ────────────────────────────────────────
create or replace function public.add_my_header_photo(p_path text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_count integer;
  v_max integer;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_path is null or p_path not like 'gallery/' || v_user::text || '/%' then
    raise exception 'that file is not in your own folder';
  end if;
  select p.role into v_role from public.profiles p where p.id = v_user and p.deleted_at is null;
  if v_role is null then
    raise exception 'finish onboarding first';
  end if;
  /* the KIND decides the ceiling (19 Sep 2026): an organization ten, an artist
     five, a user one */
  v_max := case when v_role = 'org' then 10 when public.artist_plan_active(v_user) then 5 else 1 end;
  select count(*) into v_count from public.profile_header_photos g where g.user_id = v_user and g.deleted_at is null;
  if v_count >= v_max then
    if v_max = 1 then
      raise exception 'one header picture is what a profile holds — remove it first, or take the Artist plan for five';
    end if;
    raise exception '% header pictures is the most — remove one first', case v_max when 5 then 'five' else 'ten' end;
  end if;
  insert into public.profile_header_photos (user_id, path, sort, created_by)
    values (v_user, p_path, v_count, v_user)
    returning id into v_id;
  return v_id;
end;
$$;
comment on function public.add_my_header_photo(text) is
  'Record one header picture a person has just uploaded to their own gallery folder. Ten for an organization, five for an artist (a live Artist plan), ONE for a user (19 Sep 2026).';

-- ── a crew's header ──────────────────────────────────────────────────────────
create table if not exists public.crew_header_photos (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews (id) on delete cascade,
  path text not null,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz
);
create unique index if not exists crew_header_photos_live_path on public.crew_header_photos (path) where deleted_at is null;
create index if not exists crew_header_photos_by_crew on public.crew_header_photos (crew_id, sort, created_at) where deleted_at is null;
comment on table public.crew_header_photos is 'A crew''s header pictures — up to five, in the leader''s crews/{id}/ folder of the public bucket (19 Sep 2026).';

alter table public.crew_header_photos enable row level security;
-- A POLICY IS NOT A GRANT (the 15 Sep lesson) — and the reverse bites too: a new
-- table in `public` arrives with Supabase's DEFAULT PRIVILEGES, ALL to anon and
-- authenticated (found by this migration's own dry run). RLS would still refuse
-- every write, since there is no insert policy, but the grant should say what
-- the policies mean: a read, and nothing else.
revoke all on public.crew_header_photos from public, anon, authenticated;
grant select on public.crew_header_photos to anon, authenticated;
drop policy if exists "a crew's header is public to read" on public.crew_header_photos;
create policy "a crew's header is public to read"
  on public.crew_header_photos for select
  to anon, authenticated
  using (deleted_at is null);
-- no insert / update / delete policy: the two doors below are the only writers

create or replace function public.add_crew_header_photo(p_crew_id uuid, p_path text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.crews c where c.id = p_crew_id and c.deleted_at is null) then
    raise exception 'crew not found';
  end if;
  if not public.is_crew_leader(p_crew_id) then
    raise exception 'only the crew''s leader changes its pictures';
  end if;
  if p_path is null or p_path not like 'crews/' || p_crew_id::text || '/%' then
    raise exception 'that file does not belong to this crew';
  end if;
  select count(*) into v_count from public.crew_header_photos h where h.crew_id = p_crew_id and h.deleted_at is null;
  if v_count >= 5 then
    raise exception 'five header pictures is the most for a crew — remove one first';
  end if;
  insert into public.crew_header_photos (crew_id, path, sort, created_by, updated_by)
    values (p_crew_id, p_path, v_count, v_user, v_user)
    returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.add_crew_header_photo(uuid, text) from public, anon;
grant execute on function public.add_crew_header_photo(uuid, text) to authenticated, service_role;

create or replace function public.remove_crew_header_photo(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.crew_header_photos;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_row from public.crew_header_photos h where h.id = p_id and h.deleted_at is null;
  if not found then
    raise exception 'picture not found';
  end if;
  if not public.is_crew_leader(v_row.crew_id) then
    raise exception 'only the crew''s leader changes its pictures';
  end if;
  update public.crew_header_photos set deleted_at = now(), updated_by = v_user where id = p_id;
  return v_row.path;
end;
$$;
revoke execute on function public.remove_crew_header_photo(uuid) from public, anon;
grant execute on function public.remove_crew_header_photo(uuid) to authenticated, service_role;
comment on function public.add_crew_header_photo(uuid, text) is 'The leader records one header picture uploaded to the crew''s own folder; five is the most (19 Sep 2026).';
comment on function public.remove_crew_header_photo(uuid) is 'The leader takes one header picture off the crew''s header (soft delete); returns the path so the browser removes the object (19 Sep 2026).';
