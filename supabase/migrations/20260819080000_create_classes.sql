-- Step 3 (Classes): classes + class_sessions + atomic creation RPC.
-- Source shapes: prototype CLASS_STORE (DanceOSApp.jsx:586-600) — title, style, level,
-- schedule window, room, price, capacity, status Published|Draft|Completed.
-- A class is the catalogue entry; a class_session is one dated occurrence of it
-- (enrollment in Step 4 attaches to sessions).

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 140),
  style text not null check (char_length(style) between 1 and 60),
  level text not null default 'all' check (level in ('all', 'beginner', 'intermediate', 'professional')),
  room text check (room is null or char_length(room) <= 140),
  price_inr integer not null default 0 check (price_inr between 0 and 1000000),
  capacity integer not null check (capacity between 1 and 500),
  status text not null default 'draft' check (status in ('draft', 'published', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);

comment on table public.classes is
  'A class on a tenant''s catalogue. price_inr is a per-session placeholder until Razorpay (Phase 2).';

create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  -- denormalised so session RLS never joins two tables deep
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz,
  check (ends_at > starts_at)
);

create index classes_tenant_idx on public.classes (tenant_id) where deleted_at is null;
create index classes_published_idx on public.classes (status) where deleted_at is null and status = 'published';
create index class_sessions_class_idx on public.class_sessions (class_id) where deleted_at is null;
create index class_sessions_tenant_idx on public.class_sessions (tenant_id) where deleted_at is null;
create index class_sessions_starts_idx on public.class_sessions (starts_at) where deleted_at is null;

create trigger classes_set_updated_at
  before update on public.classes
  for each row execute function public.set_updated_at();

create trigger class_sessions_set_updated_at
  before update on public.class_sessions
  for each row execute function public.set_updated_at();

-- Row Level Security (mandatory)
alter table public.classes enable row level security;
alter table public.class_sessions enable row level security;

-- Pulled forward from Step 5 (discovery): the learner class listing has to name the
-- studio behind a published class, so listed tenants become publicly readable now.
-- Unlisted tenants stay member-only.
create policy "anyone reads listed tenants"
  on public.tenants for select
  to anon, authenticated
  using (visibility = 'listed' and deleted_at is null);

-- members see everything of their tenant's, drafts included
create policy "members read own classes"
  on public.classes for select
  to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.tenant_members m
      where m.tenant_id = classes.tenant_id
        and m.user_id = auth.uid()
        and m.deleted_at is null
    )
  );

-- the public reads published classes — and only of tenants that are listed
-- (the tenants subquery runs under the caller's own RLS, so an unlisted
-- tenant's classes stay invisible even when published)
create policy "anyone reads published classes"
  on public.classes for select
  to anon, authenticated
  using (
    deleted_at is null
    and status = 'published'
    and exists (
      select 1 from public.tenants t
      where t.id = classes.tenant_id
        and t.visibility = 'listed'
        and t.deleted_at is null
    )
  );

-- owners and trainers manage classes (publish, reschedule, soft delete); staff read only
create policy "owners and trainers update own classes"
  on public.classes for update
  to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.tenant_members m
      where m.tenant_id = classes.tenant_id
        and m.user_id = auth.uid()
        and m.member_role in ('owner', 'trainer')
        and m.deleted_at is null
    )
  )
  with check (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = classes.tenant_id
        and m.user_id = auth.uid()
        and m.member_role in ('owner', 'trainer')
        and m.deleted_at is null
    )
  );

create policy "members read own sessions"
  on public.class_sessions for select
  to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.tenant_members m
      where m.tenant_id = class_sessions.tenant_id
        and m.user_id = auth.uid()
        and m.deleted_at is null
    )
  );

-- session visibility follows the class: the classes subquery re-applies the
-- published + listed-tenant policy for the caller
create policy "anyone reads sessions of published classes"
  on public.class_sessions for select
  to anon, authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.classes c
      where c.id = class_sessions.class_id
    )
  );

create policy "owners and trainers update own sessions"
  on public.class_sessions for update
  to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.tenant_members m
      where m.tenant_id = class_sessions.tenant_id
        and m.user_id = auth.uid()
        and m.member_role in ('owner', 'trainer')
        and m.deleted_at is null
    )
  )
  with check (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = class_sessions.tenant_id
        and m.user_id = auth.uid()
        and m.member_role in ('owner', 'trainer')
        and m.deleted_at is null
    )
  );

-- Creation happens ONLY through this function (no direct insert policies on either
-- table, same pattern as create_tenant_with_owner): class + first session are one
-- atomic step, so no class can exist without a session on the calendar.
create or replace function public.create_class_with_session(
  p_tenant_id uuid,
  p_title text,
  p_style text,
  p_level text,
  p_room text,
  p_price_inr integer,
  p_capacity integer,
  p_status text,
  p_starts_at timestamptz,
  p_ends_at timestamptz
) returns public.classes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_class public.classes;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.tenant_members m
    where m.tenant_id = p_tenant_id
      and m.user_id = v_user
      and m.member_role in ('owner', 'trainer')
      and m.deleted_at is null
  ) then
    raise exception 'not allowed for this tenant';
  end if;
  if p_title is null or char_length(trim(p_title)) = 0 then
    raise exception 'title is required';
  end if;
  if p_status not in ('draft', 'published') then
    raise exception 'invalid status';
  end if;
  if p_level not in ('all', 'beginner', 'intermediate', 'professional') then
    raise exception 'invalid level';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'invalid schedule';
  end if;

  insert into public.classes (tenant_id, title, style, level, room, price_inr, capacity, status, created_by, updated_by)
  values (p_tenant_id, trim(p_title), trim(p_style), p_level, nullif(trim(p_room), ''),
          coalesce(p_price_inr, 0), p_capacity, p_status, v_user, v_user)
  returning * into v_class;

  insert into public.class_sessions (class_id, tenant_id, starts_at, ends_at, created_by, updated_by)
  values (v_class.id, p_tenant_id, p_starts_at, p_ends_at, v_user, v_user);

  return v_class;
end;
$$;

revoke execute on function public.create_class_with_session(uuid, text, text, text, text, integer, integer, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.create_class_with_session(uuid, text, text, text, text, integer, integer, text, timestamptz, timestamptz) to authenticated;
