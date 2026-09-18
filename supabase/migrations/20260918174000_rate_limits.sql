-- 18 Sep 2026: RATE LIMITS. The user: "set a good limit."
--
-- RLS decides WHO may do a thing; nothing decided HOW OFTEN (the 11 Sep audit,
-- NEXT TO DO #4). This is the additive shape it recommended: one counter table
-- and one definer function, called from the server actions in front of the
-- risky doors — people search, sending an enquiry, reporting, opening a support
-- thread, signing up. No existing RPC body changes.
--
-- HOW IT COUNTS: fixed windows. A bucket ("enquiry.send"), a caller (their
-- auth.uid(), or for a signed-out caller a key the server hands in — a hash of
-- the address), a window of N seconds; the row for (key, window) is bumped and
-- the function answers whether the count is still within the limit. Fixed
-- windows are blunt at the edges and cheap, which is the right trade for the
-- first limit a pilot app has. Old windows are swept opportunistically.
--
-- ⚠ Rule 3 says every table ships with audit columns and soft delete; this one
-- has created_at/updated_at and no deleted_at ON PURPOSE — it is a counter, not
-- a record, and its rows are meant to disappear. Said here so it is not
-- "fixed" later. No RLS policy at all: nobody reads or writes it but the
-- function, which is SECURITY DEFINER and revoked from public.

create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (key, window_start)
);
comment on table public.rate_limits is
  'Fixed-window counters behind rate_limit_hit(): (bucket:caller, window) → hits. A counter, not a record — no soft delete, swept as it goes.';

alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from public, anon, authenticated;

create or replace function public.rate_limit_hit(p_bucket text, p_limit integer, p_window_seconds integer, p_client text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_window timestamptz;
  v_hits integer;
  v_secs integer := greatest(1, coalesce(p_window_seconds, 60));
begin
  if p_bucket is null or btrim(p_bucket) = '' then
    raise exception 'a rate limit needs a bucket';
  end if;
  -- the caller: who they are, or what the server said they are, or "anon"
  v_key := btrim(p_bucket) || ':' || coalesce(auth.uid()::text, nullif(btrim(coalesce(p_client, '')), ''), 'anon');
  v_window := to_timestamp(floor(extract(epoch from now()) / v_secs) * v_secs);

  insert into public.rate_limits as r (key, window_start, hits)
  values (v_key, v_window, 1)
  on conflict (key, window_start) do update
    set hits = r.hits + 1, updated_at = now()
  returning hits into v_hits;

  -- sweep, now and then: windows more than two days old are nobody's business
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;

  return v_hits <= greatest(1, coalesce(p_limit, 1));
end;
$$;
revoke execute on function public.rate_limit_hit(text, integer, integer, text) from public;
grant execute on function public.rate_limit_hit(text, integer, integer, text) to anon, authenticated, service_role;

comment on function public.rate_limit_hit(text, integer, integer, text) is
  'Count one hit on (bucket, caller) in the current fixed window and say whether it is still within p_limit. The caller is auth.uid(), else p_client (a hash the server hands in for a signed-out request).';
