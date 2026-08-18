-- Step 1 (Auth + Identity): profiles — one row per authenticated user.
-- Shape derived from the prototype's ACCOUNT / __DOSROLE (dancer | trainer | studio).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 120),
  role text not null check (role in ('dancer', 'trainer', 'studio')),
  city text check (city is null or char_length(city) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);

comment on table public.profiles is
  'One profile per auth user. role mirrors the prototype __DOSROLE: dancer | trainer | studio.';

-- keep updated_at / updated_by fresh on every update
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Row Level Security (mandatory — no table exists without it)
alter table public.profiles enable row level security;

-- profiles are public inside the app: any signed-in user can view live ones
create policy "signed-in users read live profiles"
  on public.profiles for select
  to authenticated
  using (deleted_at is null);

-- a user may create only their own profile row
create policy "users insert own profile"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

-- a user may update only their own live profile
create policy "users update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid() and deleted_at is null)
  with check (id = auth.uid());

-- no delete policy on purpose: soft delete only (set deleted_at via update)
