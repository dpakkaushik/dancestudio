-- A CHECK-IN TELLS THE PERSON CHECKED IN (2 Oct 2026).
--
-- The user: "once your check in is confirmed in a class you should get a
-- notification". Until now a check-in raised nothing: `attendance` carries no
-- notify trigger at all, so the person standing at the door learnt they were in
-- only by watching the desk.
--
-- One trigger function, one AFTER INSERT trigger. A live attendance row is a
-- check-in (Step 10: checking out soft-deletes, a re-check-in inserts anew), so
-- INSERT is exactly the moment; an update (the check-out) says nothing.
--
-- ⚠ A walk-in has no account (user_id is null since 20260929130000) and is told
--   nothing — `notify` already returns on a null recipient.
-- ⚠ AFTER, returning null, and `notify` never raises: a notification must not be
--   the reason a check-in fails.
-- ⚠ Kind 'class' — what the notifications CHECK admits (the plural was silently
--   dropped for eight days in 2026-09; never 'classes').
-- ⚠ No begin/commit here (Rule 18): db push wraps the file itself.

create or replace function public.notify_checked_in()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text;
  v_slug  text;
begin
  if new.user_id is null or new.deleted_at is not null then
    return null;
  end if;
  select c.style || ' · ' || c.level, c.share_slug
    into v_label, v_slug
    from public.classes c
   where c.id = new.class_id;
  perform public.notify(
    new.user_id,
    'class',
    'You are checked in',
    coalesce(v_label, 'Your class') || ' — enjoy the class.',
    case when v_slug is null then null else '/c/' || v_slug end
  );
  return null;
end;
$$;

revoke execute on function public.notify_checked_in() from public, anon, authenticated;

drop trigger if exists attendance_notify_checked_in on public.attendance;
create trigger attendance_notify_checked_in
  after insert on public.attendance
  for each row execute function public.notify_checked_in();

comment on function public.notify_checked_in() is
  'Tells a person they were checked in (a live attendance row was inserted for them). Walk-ins (no user) are told nothing. Never raises.';
