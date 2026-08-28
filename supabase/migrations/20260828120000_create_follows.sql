-- Step 15 (Follows + public profiles): a person follows a business.
--
-- The prototype's follow is one bit per (person, public entity) with a count
-- everybody can read (Discover's DOS_FOLLOWERS pill, the profile's Followers
-- figure) and a list only the profile's owner opens (the Followers sheet). That
-- is exactly the shape here:
--   * `follows` rows are PRIVATE: the follower reads their own, the followed
--     business's members read who follows them, and there is no public policy
--     at all — who follows whom is nobody else's business.
--   * the COUNT is public, through an aggregate-only function (the pattern
--     session_seat_counts set at Step 4: a number, never a name).
--   * one door for writes: set_follow is idempotent — following twice is one
--     follow, unfollowing what you never followed is a no-op — and it refuses a
--     business that is not open to the public (unlisted) and a business you are
--     a member of (you are on that team; following yourself is not a count).
--
-- Targets are TENANTS only for now (studios and artist businesses — what
-- Discover lists). Following a person, or a crew, arrives with the screens
-- that show them (Steps 15's own-profile follow-up and 22).

create table public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);

comment on table public.follows is
  'A person following a business. Unfollowing soft-deletes the row (the follow that happened stays on record); re-following inserts a fresh live row.';

-- one LIVE follow per person per business; history rows do not block re-following
create unique index follows_live_unique
  on public.follows (follower_id, tenant_id) where deleted_at is null;
create index follows_tenant_idx on public.follows (tenant_id) where deleted_at is null;
create index follows_follower_idx on public.follows (follower_id) where deleted_at is null;

create trigger follows_set_updated_at
  before update on public.follows
  for each row execute function public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.follows enable row level security;

-- your own follows, live and ended (a soft-deleting role must be able to SELECT
-- the row it just deleted — Step 3's lesson)
create policy "followers read own follows"
  on public.follows for select
  to authenticated
  using (follower_id = auth.uid());

-- the followed business's people read who follows it (the Followers sheet)
create policy "members read their tenant's followers"
  on public.follows for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = follows.tenant_id
        and m.user_id = auth.uid()
        and m.deleted_at is null
    )
  );

-- No public policy, and no insert/update/delete policies: set_follow below is
-- the one way a follow starts or ends.

-- ── set_follow — follow or unfollow, idempotently ─────────────────────────────
create or replace function public.set_follow(p_tenant_id uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_tenant public.tenants;
  v_live uuid;
  v_count bigint;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user and p.deleted_at is null) then
    raise exception 'finish onboarding before following';
  end if;

  select * into v_tenant from public.tenants t
    where t.id = p_tenant_id and t.deleted_at is null;
  if not found then
    raise exception 'business not found';
  end if;
  -- a business that is not open to the public cannot be followed from outside
  if v_tenant.visibility <> 'listed' then
    raise exception 'this business is not open to the public';
  end if;
  -- you are on this team: a member's follow would count the business's own people
  if exists (
    select 1 from public.tenant_members m
    where m.tenant_id = p_tenant_id and m.user_id = v_user and m.deleted_at is null
  ) then
    raise exception 'you already belong to this business';
  end if;

  select f.id into v_live from public.follows f
    where f.follower_id = v_user and f.tenant_id = p_tenant_id and f.deleted_at is null;

  if p_on and v_live is null then
    insert into public.follows (follower_id, tenant_id, created_by, updated_by)
    values (v_user, p_tenant_id, v_user, v_user);
  elsif not p_on and v_live is not null then
    update public.follows
      set deleted_at = now(), updated_by = v_user
      where id = v_live;
  end if;

  select count(*) into v_count from public.follows f
    where f.tenant_id = p_tenant_id and f.deleted_at is null;

  return jsonb_build_object('following', p_on, 'followers', v_count);
end;
$$;

comment on function public.set_follow(uuid, boolean) is
  'Follow (true) or unfollow (false) a listed business you do not belong to. Idempotent; returns the new state and the live follower count.';

revoke execute on function public.set_follow(uuid, boolean) from public, anon;
grant execute on function public.set_follow(uuid, boolean) to authenticated;

-- ── follower_counts — a number, never a name ──────────────────────────────────
-- Counts for listed businesses are public (Discover's pill, the profile's
-- figure). An unlisted business's count is its own members' to see, and
-- nobody else's — the same line "anyone reads listed tenants" draws.
create or replace function public.follower_counts(p_tenant_ids uuid[])
returns table (tenant_id uuid, followers bigint)
language sql
security definer
set search_path = ''
stable
as $$
  select t.id as tenant_id,
         (select count(*) from public.follows f
            where f.tenant_id = t.id and f.deleted_at is null) as followers
  from public.tenants t
  where t.id = any (p_tenant_ids)
    and t.deleted_at is null
    and (
      t.visibility = 'listed'
      or exists (
        select 1 from public.tenant_members m
        where m.tenant_id = t.id and m.user_id = auth.uid() and m.deleted_at is null
      )
    );
$$;

comment on function public.follower_counts(uuid[]) is
  'Live follower counts for listed businesses (and for a business the caller belongs to). Aggregate only — no follower is ever named here.';

revoke execute on function public.follower_counts(uuid[]) from public;
grant execute on function public.follower_counts(uuid[]) to anon, authenticated;
