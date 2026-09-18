-- 19 Sep 2026: FOLLOW AN ORGANIZATION, FOLLOW A CREW. ⚠ RLS (Rule 9).
--
-- The user, re-cutting every profile page in one message: "Follow with
-- Following toggle for all" — Organization, Studio, Artist, Crew, User. Two of
-- the five could not be followed: an ORGANIZATION (R9, 8 Sep 2026 — "neither
-- follows nor is followed") and a CREW (`follows` named a business or a person,
-- never a crew — the backlog row since Step 22). Both can be FOLLOWED now. What
-- does NOT change: an organization ACCOUNT still follows nobody (R11 — it is not
-- a person), a crew's own leader and members cannot follow their own crew (the
-- rule a business's members already live under), and every row is still one
-- person following exactly one thing.
--
-- WHAT A STRANGER READS THAT THEY COULD NOT: a PUBLIC organization's follower
-- COUNT (a number, never a name) and a crew's follower COUNT. Nothing else.

-- ── a crew is the third thing a follow can name ──────────────────────────────
alter table public.follows add column if not exists crew_id uuid references public.crews (id) on delete cascade;

alter table public.follows drop constraint if exists follows_one_object;
alter table public.follows add constraint follows_one_object check (
  ((business_id is not null)::int + (followee_id is not null)::int + (crew_id is not null)::int) = 1
);

-- one live follow per person per crew; ended ones stay on record (Step 15's shape)
create unique index if not exists follows_live_crew on public.follows (follower_id, crew_id) where deleted_at is null and crew_id is not null;
create index if not exists follows_by_crew on public.follows (crew_id) where deleted_at is null;

-- the crew's LEADER reads who follows it — the business's members read theirs
drop policy if exists "crew leaders read who follows their crew" on public.follows;
create policy "crew leaders read who follows their crew"
  on public.follows for select
  to authenticated
  using (crew_id is not null and public.is_crew_leader(crew_id));

comment on column public.follows.crew_id is 'The crew followed (19 Sep 2026) — exactly one of business_id, followee_id, crew_id is set.';

-- ── set_crew_follow — the one door, idempotent ──────────────────────────────
create or replace function public.set_crew_follow(p_crew_id uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_crew public.crews;
  v_live uuid;
  v_count bigint;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user and p.deleted_at is null) then
    raise exception 'finish onboarding before following';
  end if;
  -- an organization is not a person: it follows nothing (R11)
  if exists (select 1 from public.profiles p where p.id = v_user and p.role = 'org') then
    raise exception 'an organization does not follow — people follow';
  end if;
  select * into v_crew from public.crews c where c.id = p_crew_id and c.deleted_at is null;
  if not found then
    raise exception 'crew not found';
  end if;
  -- you are the crew: its leader, or a confirmed member
  if v_crew.leader_id = v_user or exists (
    select 1 from public.crew_members m
    where m.crew_id = p_crew_id and m.user_id = v_user and m.status = 'confirmed' and m.deleted_at is null
  ) then
    raise exception 'you are in this crew';
  end if;

  select f.id into v_live from public.follows f
    where f.follower_id = v_user and f.crew_id = p_crew_id and f.deleted_at is null;

  if p_on and v_live is null then
    insert into public.follows (follower_id, crew_id, created_by, updated_by)
    values (v_user, p_crew_id, v_user, v_user);
  elsif not p_on and v_live is not null then
    update public.follows set deleted_at = now(), updated_by = v_user where id = v_live;
  end if;

  select count(*) into v_count from public.follows f
    where f.crew_id = p_crew_id and f.deleted_at is null;

  return jsonb_build_object('following', p_on, 'followers', v_count);
end;
$$;
revoke execute on function public.set_crew_follow(uuid, boolean) from public, anon;
grant execute on function public.set_crew_follow(uuid, boolean) to authenticated, service_role;
comment on function public.set_crew_follow(uuid, boolean) is
  'Follow (true) or unfollow (false) a crew you are not in. Idempotent; refuses an organization account, the crew''s leader and its confirmed members. Returns the new state and the live follower count (19 Sep 2026).';

-- ── the count, for a crew's page and its card — a number, never a name ───────
create or replace function public.crew_follower_counts(p_crew_ids uuid[])
returns table(crew_id uuid, followers bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, count(f.id)
  from public.crews c
  left join public.follows f on f.crew_id = c.id and f.deleted_at is null
  where c.id = any (p_crew_ids) and c.deleted_at is null
  group by c.id;
$$;
revoke execute on function public.crew_follower_counts(uuid[]) from public;
grant execute on function public.crew_follower_counts(uuid[]) to anon, authenticated, service_role;

-- ── an ORGANIZATION may be followed, while it is public ─────────────────────
-- 20260908120000's body with one rule changed: the target may be an organization
-- whose page exists (`org_is_public`, 20260918173000). The caller still may not
-- be one.
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
  -- an organization is not a person: it follows nobody (8 Sep 2026)
  if exists (select 1 from public.profiles p where p.id = v_user and p.role = 'org') then
    raise exception 'an organization does not follow people';
  end if;
  if p_user_id = v_user then
    raise exception 'you cannot follow yourself';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id and p.deleted_at is null) then
    raise exception 'that person is not on DanceOS';
  end if;
  -- an organization can be followed since 19 Sep 2026 — one that is PUBLIC
  if exists (select 1 from public.profiles p where p.id = p_user_id and p.role = 'org')
     and not public.org_is_public(p_user_id) then
    raise exception 'this organization is not open to the public';
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
  'Follow (true) or unfollow (false) a person — or, since 19 Sep 2026, a PUBLIC organization. Idempotent; refuses yourself, somebody not on DanceOS, a private organization, and an organization as the caller. Returns the new state and the live follower count.';

-- a stranger reads a public organization's follower count too (the artist's since 18 Sep)
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
  where p.id = any (p_user_ids) and p.deleted_at is null
    and (auth.uid() is not null or public.artist_plan_active(p.id) or public.org_is_public(p.id));
$$;

-- ── the organizations YOU follow, for your own Following sheet ───────────────
-- An organization's profiles row is private (R12), so the sheet cannot embed it;
-- this hands the caller the four public columns of the organizations they follow.
create or replace function public.my_followed_organizations()
returns table(follow_id uuid, org_id uuid, name text, city text, photo_path text, followed_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, p.id, p.full_name, p.city, p.profile_photo_path, f.created_at
  from public.follows f
  join public.profiles p on p.id = f.followee_id and p.role = 'org' and p.deleted_at is null
  where f.follower_id = auth.uid() and f.deleted_at is null
  order by f.created_at desc;
$$;
revoke execute on function public.my_followed_organizations() from public, anon;
grant execute on function public.my_followed_organizations() to authenticated, service_role;
