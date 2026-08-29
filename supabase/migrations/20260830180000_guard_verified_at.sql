-- ─────────────────────────────────────────────────────────────────────────────
-- verified_at is DanceOS's to set (20260830150000: "a tick you can give yourself
-- is not a tick") — but that migration only SAID so. Step 1 lets a person update
-- their own profile row and Step 2 lets an owner update their own tenant row,
-- and neither policy names columns, so a plain PATCH could have set the tick.
-- Found while writing the proof, before it was ever drawn on a real page.
--
-- One trigger function on both tables: a change to verified_at goes through
-- only for the service role (the KYC hand-off, run from ops). Everything else
-- about the row still moves exactly as before; the RPCs never touch the column.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.guard_verified_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.verified_at is distinct from old.verified_at
     and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'verification is set by DanceOS after KYC — it cannot be changed here';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_verified_at() from public, anon, authenticated;

create trigger tenants_guard_verified_at
  before update of verified_at on public.tenants
  for each row execute function public.guard_verified_at();

create trigger profiles_guard_verified_at
  before update of verified_at on public.profiles
  for each row execute function public.guard_verified_at();
