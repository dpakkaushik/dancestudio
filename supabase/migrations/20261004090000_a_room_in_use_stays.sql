-- A ROOM IN USE STAYS, AND SO DOES A STUDIO'S LAST ROOM (4 Oct 2026).
--
-- The user: "room cannot be deleted if classes are alredy published for it",
-- then "if only one room can never be deleted", then "push that as well" — the
-- database half of what `softDeleteRoom` already refuses in the app. Until now
-- the two `rooms` policies admitted an owner or manager to set `deleted_at`
-- straight through PostgREST whatever the app checked.
--
-- WHAT THIS ADDS — one trigger function and one trigger, nothing else:
--   * refuses a soft delete of the business's LAST live room;
--   * refuses a soft delete of a room holding a PUBLISHED class with a session
--     not yet ended. ⚠ "published" alone would hold a room for ever: nothing in
--     this app moves a class to 'completed' (30 Sep 2026), and a past class
--     keeps the room's NAME, so history loses nothing.
--
-- WHO IS HELD TO IT: a signed-in client (role 'authenticated'). The service
-- role and a session-less connection (a migration, the sweep scripts) are
-- exempt, like every guard in this project — and a room whose BUSINESS is
-- itself deleted may always go, because a sweep takes a studio down with its
-- rooms. ⚠ nullif before the cast: an unset setting is NULL and casts fine, an
-- EMPTY one throws (19 Sep 2026).
--
-- NO table, column, policy, grant or row changes. Nothing is backfilled.
-- No `begin;`/`commit;` — `db push` wraps the file itself (Rule 18).

create or replace function public.guard_room_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  v_left int;
  v_held int;
begin
  -- only a removal: deleted_at going from null to a value
  if old.deleted_at is not null or new.deleted_at is null then
    return new;
  end if;
  if v_role <> 'authenticated' then
    return new;
  end if;
  -- a studio being taken down takes its rooms with it
  if exists (select 1 from public.businesses b where b.id = old.business_id and b.deleted_at is not null) then
    return new;
  end if;

  select count(*) into v_left
    from public.rooms r
   where r.business_id = old.business_id and r.deleted_at is null and r.id <> old.id;
  if v_left = 0 then
    raise exception 'A studio keeps at least one room — add another before removing this one';
  end if;

  select count(distinct c.id) into v_held
    from public.classes c
    join public.class_sessions s on s.class_id = c.id and s.deleted_at is null
   where c.room_id = old.id
     and c.status = 'published'
     and c.deleted_at is null
     and s.ends_at > now();
  if v_held > 0 then
    raise exception 'This room has % published % still to run — move or take % down first',
      v_held, case when v_held = 1 then 'class' else 'classes' end, case when v_held = 1 then 'it' else 'them' end;
  end if;

  return new;
end;
$$;

comment on function public.guard_room_removal() is
  'Refuses a signed-in client soft-deleting a business''s last live room, or a room holding a published class still to run (4 Oct 2026). Service role, session-less connections and a deleted business are exempt.';

revoke all on function public.guard_room_removal() from public, anon, authenticated;

drop trigger if exists rooms_guard_removal on public.rooms;
create trigger rooms_guard_removal
  before update of deleted_at on public.rooms
  for each row execute function public.guard_room_removal();
