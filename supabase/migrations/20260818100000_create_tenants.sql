-- Step 2 (Tenant onboarding): tenants + tenant_members + owner-creation RPC.
-- A tenant is a business on DanceOS: a studio location or an independent trainer
-- business (prototype: BIZ_STORE.studios / "New studio" sheet).

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('studio', 'trainer_business')),
  name text not null check (char_length(name) between 1 and 140),
  area text check (area is null or char_length(area) <= 140),
  city text check (city is null or char_length(city) <= 120),
  lat double precision,
  lng double precision,
  visibility text not null default 'listed' check (visibility in ('listed', 'unlisted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);

comment on table public.tenants is
  'One business = one tenant. type: studio (one location each) | trainer_business.';

create table public.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  member_role text not null default 'owner' check (member_role in ('owner', 'trainer', 'staff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz,
  unique (tenant_id, user_id)
);

create index tenant_members_user_idx on public.tenant_members (user_id) where deleted_at is null;
create index tenant_members_tenant_idx on public.tenant_members (tenant_id) where deleted_at is null;

create trigger tenants_set_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

create trigger tenant_members_set_updated_at
  before update on public.tenant_members
  for each row execute function public.set_updated_at();

-- Row Level Security (mandatory)
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;

-- users see only their own membership rows
create policy "users read own memberships"
  on public.tenant_members for select
  to authenticated
  using (user_id = auth.uid() and deleted_at is null);

-- tenants are visible to their live members only (public discovery arrives in Step 5)
create policy "members read own tenants"
  on public.tenants for select
  to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.tenant_members m
      where m.tenant_id = tenants.id
        and m.user_id = auth.uid()
        and m.deleted_at is null
    )
  );

-- only owners may update their tenant
create policy "owners update own tenants"
  on public.tenants for update
  to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.tenant_members m
      where m.tenant_id = tenants.id
        and m.user_id = auth.uid()
        and m.member_role = 'owner'
        and m.deleted_at is null
    )
  )
  with check (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = tenants.id
        and m.user_id = auth.uid()
        and m.member_role = 'owner'
        and m.deleted_at is null
    )
  );

-- Creation happens ONLY through this function (no direct insert policies on either
-- table): tenant + owner membership are one atomic step, so no tenant can ever
-- exist without an owner.
create or replace function public.create_tenant_with_owner(
  p_name text,
  p_type text,
  p_area text default null,
  p_city text default null
) returns public.tenants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_tenant public.tenants;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_type not in ('studio', 'trainer_business') then
    raise exception 'invalid tenant type';
  end if;
  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'name is required';
  end if;

  insert into public.tenants (type, name, area, city, created_by, updated_by)
  values (p_type, trim(p_name), nullif(trim(p_area), ''), nullif(trim(p_city), ''), v_user, v_user)
  returning * into v_tenant;

  insert into public.tenant_members (tenant_id, user_id, member_role, created_by, updated_by)
  values (v_tenant.id, v_user, 'owner', v_user, v_user);

  return v_tenant;
end;
$$;

revoke execute on function public.create_tenant_with_owner(text, text, text, text) from public, anon;
grant execute on function public.create_tenant_with_owner(text, text, text, text) to authenticated;
