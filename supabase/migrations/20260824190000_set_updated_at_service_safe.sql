-- Step 9 follow-up: set_updated_at unconditionally stamped updated_by with
-- auth.uid(), which is NULL when the writer is the machine (service role running
-- the webhook's apply_* RPCs) — every such update then violated the NOT NULL
-- constraint even though the RPC set updated_by explicitly. Keep the explicit
-- value (or the previous author) when there is no signed-in user; behaviour with
-- a real user is unchanged. One function feeds every table's trigger, so this
-- fixes orders/payments/refunds/enrollments in one place.
--
-- Lesson for future service-role write paths: a shared audit trigger must never
-- assume auth.uid() is non-null.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;
