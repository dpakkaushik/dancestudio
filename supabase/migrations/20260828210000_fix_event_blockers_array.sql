-- Step 21 fix, found by scripts/rls-proof-events.ps1 check 2: the publish
-- blockers were REFUSING correctly but in the wrong words.
--
-- `event_blockers` built its answer with `out := out || 'A showcase is watched…'`.
-- With an untyped string literal on the right, Postgres resolves `||` to the
-- anyarray || anyarray operator and tries to parse the sentence AS an array —
-- so `publish_event` raised `malformed array literal: "A showcase is watched —
-- put tickets on sale before publishing"` instead of the sentence itself. The
-- form never saw it (it computes the same blockers client-side, so the button
-- was disabled), but the desk's Publish pill on an unfinished draft would have
-- printed the parser's complaint. Lesson: append to a text[] with array_append
-- or cast the literal — `out || 'x'::text`.
--
-- Same signature, same grants, same rule (dosEventBlockers 3061); only the
-- appends change. Never edit the applied migration (Rule 4).
create or replace function public.event_blockers(p_event_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v public.events;
  out text[] := '{}';
  v_tiers integer;
  v_entries integer;
  v_no_cap text;
begin
  select * into v from public.events e where e.id = p_event_id and e.deleted_at is null;
  if not found then
    return array['Nothing to publish'];
  end if;
  select count(*) into v_tiers from public.event_ticket_tiers t where t.event_id = v.id and t.deleted_at is null;
  if v.tickets_on and v_tiers = 0 then
    out := array_append(out, 'Add a ticket tier, or turn spectator tickets off'::text);
  end if;
  if v.cat in ('battle', 'tournament') then
    select count(*) into v_entries from public.event_entry_tiers t where t.event_id = v.id and t.deleted_at is null;
    if v_entries = 0 then
      out := array_append(out, 'Open at least one way in — solo, duet or crew'::text);
    end if;
    for v_no_cap in
      select case t.format when 'solo' then 'Solo' when 'duo' then 'Duet' else 'Crew' end
      from public.event_entry_tiers t where t.event_id = v.id and t.deleted_at is null and t.capacity = 0
    loop
      out := array_append(out, (v_no_cap || ' entries have no places — say how many')::text);
    end loop;
  else
    if not (v.tickets_on and v_tiers > 0) then
      out := array_append(out, 'A showcase is watched — put tickets on sale before publishing'::text);
    end if;
  end if;
  return out;
end;
$$;
revoke execute on function public.event_blockers(uuid) from public, anon;
grant execute on function public.event_blockers(uuid) to authenticated;
