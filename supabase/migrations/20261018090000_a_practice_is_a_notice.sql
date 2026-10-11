-- A practice is a notice, not a question (11 Oct 2026).
--
-- The user: "no request required for practice only notification should do.
-- team leader can just check their attendance directly in register." And:
-- "handle invites to join a team and crew from the crew and studio tabs at
-- home … only enquiries to be handled from inbox."
--
-- What changes, and nothing else:
--   1. save_crew_practice — creating a practice ASKS nobody. Every confirmed
--      member (the leader aside) is TOLD, through one notification each. The
--      signature, the grants and the leader-only rule are unchanged.
--   2. my_crew_practices — same RETURNS TABLE. `my_status` reads 'leader' or
--      'member' (nobody is 'asked' any more), `going` is how many were checked
--      in by the register, `asked` is the size of the roster the practice is
--      for (leader + confirmed members).
--   3. practice_people — the register lists the CREW (the leader and every
--      confirmed member), not an asked list; anybody already checked in who has
--      since left the roster stays on it, so the register never loses a row.
--   4. notify_practice_moved — tells the confirmed members, not the asked rows.
--   5. notify_crew_member — a crew ask points to the Crews tab on Home
--      (/crews?show=in), where it is answered now, instead of the Inbox.
--
-- Deliberately untouched: crew_practice_people and its rows (history),
-- respond_to_practice (no caller after this push; it still only lets a person
-- answer for themselves), check_in_practice (already needed no answer).
-- No table, column, policy or grant moves. No begin/commit (Rule 18).

create or replace function public.save_crew_practice(
  p_crew_id uuid,
  p_starts_at timestamp with time zone,
  p_ends_at timestamp with time zone,
  p_place text,
  p_note text default null::text,
  p_practice_id uuid default null::uuid)
 returns public.crew_practices
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_row public.crew_practices;
  v_crew text;
begin
  if not public.is_crew_leader(p_crew_id) then
    raise exception 'only the person who leads this crew can arrange a practice';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'a practice ends after it starts';
  end if;

  if p_practice_id is null then
    insert into public.crew_practices (crew_id, starts_at, ends_at, place, note)
    values (p_crew_id, p_starts_at, p_ends_at, btrim(p_place), nullif(btrim(coalesce(p_note, '')), ''))
    returning * into v_row;

    /* A PRACTICE IS A NOTICE (11 Oct 2026). Every confirmed member but the
       leader is told; nobody is asked, and the register is the leader's. */
    select c.name into v_crew from public.crews c where c.id = p_crew_id;
    perform public.notify(m.user_id, 'people',
      coalesce(v_crew, 'Your crew') || ' has a practice',
      to_char(v_row.starts_at at time zone 'Asia/Kolkata', 'Dy DD Mon, HH12:MIam') || ' · ' || v_row.place,
      '/practice')
    from public.crew_members m
    where m.crew_id = p_crew_id and m.status = 'confirmed' and m.deleted_at is null
      and m.user_id <> auth.uid();
  else
    if not public.leads_practice(p_practice_id) then
      raise exception 'only the person who leads this crew can change its practice';
    end if;
    /* a move is told by notify_practice_moved */
    update public.crew_practices
    set starts_at = p_starts_at,
        ends_at = p_ends_at,
        place = btrim(p_place),
        note = nullif(btrim(coalesce(p_note, '')), '')
    where id = p_practice_id and deleted_at is null
    returning * into v_row;
  end if;

  return v_row;
end;
$function$;

create or replace function public.my_crew_practices(
  p_from timestamp with time zone default null::timestamp with time zone,
  p_to timestamp with time zone default null::timestamp with time zone)
 returns table(practice_id uuid, crew_id uuid, crew_name text, crew_style text,
   starts_at timestamp with time zone, ends_at timestamp with time zone,
   place text, note text, status text, i_lead boolean, my_status text,
   going integer, asked integer)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select p.id,
         c.id,
         c.name,
         c.style,
         p.starts_at,
         p.ends_at,
         p.place,
         p.note,
         p.status,
         (c.leader_id = auth.uid()),
         case when c.leader_id = auth.uid() then 'leader' else 'member' end,
         /* going = checked in by the register */
         (select count(*)::integer from public.crew_practice_attendance a
          where a.practice_id = p.id and a.deleted_at is null),
         /* asked = the roster the practice is for: the leader and every confirmed member */
         (1 + (select count(*)::integer from public.crew_members m
               where m.crew_id = c.id and m.status = 'confirmed' and m.deleted_at is null
                 and m.user_id <> c.leader_id))
  from public.crew_practices p
  join public.crews c on c.id = p.crew_id and c.deleted_at is null
  where p.deleted_at is null
    and (p_from is null or p.starts_at >= p_from)
    and (p_to is null or p.starts_at <= p_to)
    and (
      c.leader_id = auth.uid()
      or exists (select 1 from public.crew_members m
                 where m.crew_id = c.id and m.user_id = auth.uid()
                   and m.status = 'confirmed' and m.deleted_at is null)
    )
  order by p.starts_at;
$function$;

create or replace function public.practice_people(p_practice_id uuid)
 returns table(user_id uuid, full_name text, avatar_path text, status text, is_leader boolean, present boolean)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with practice as (
    select p.id, p.crew_id, c.leader_id
    from public.crew_practices p
    join public.crews c on c.id = p.crew_id and c.deleted_at is null
    where p.id = p_practice_id and p.deleted_at is null
      and public.is_on_crew(p.crew_id)
  ),
  people as (
    select pr.leader_id as uid, 'leader'::text as st, true as lead
    from practice pr
    union
    select m.user_id, 'member'::text, false
    from public.crew_members m
    join practice pr on pr.crew_id = m.crew_id
    where m.status = 'confirmed' and m.deleted_at is null and m.user_id <> pr.leader_id
    union
    /* somebody checked in who has since left the crew stays on the register */
    select a.user_id, 'member'::text, false
    from public.crew_practice_attendance a
    join practice pr on pr.id = a.practice_id
    where a.deleted_at is null and a.user_id <> pr.leader_id
  )
  select pe.uid,
         pf.full_name,
         pf.profile_photo_path,
         pe.st,
         pe.lead,
         exists (select 1 from public.crew_practice_attendance a
                 where a.practice_id = p_practice_id and a.user_id = pe.uid and a.deleted_at is null)
  from people pe
  join public.profiles pf on pf.id = pe.uid and pf.deleted_at is null
  order by pe.lead desc, pf.full_name;
$function$;

create or replace function public.notify_practice_moved()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_crew public.crews;
begin
  if old.starts_at = new.starts_at and old.place = new.place and old.status = new.status then
    return new;
  end if;
  select * into v_crew from public.crews c where c.id = new.crew_id;
  perform public.notify(m.user_id, 'people',
    case when new.status = 'cancelled' then coalesce(v_crew.name, 'Your crew') || ' called off a practice'
         else coalesce(v_crew.name, 'Your crew') || ' moved a practice' end,
    to_char(new.starts_at at time zone 'Asia/Kolkata', 'Dy DD Mon, HH12:MIam') || ' · ' || new.place,
    '/practice')
  from public.crew_members m
  where m.crew_id = new.crew_id and m.status = 'confirmed' and m.deleted_at is null
    and m.user_id <> v_crew.leader_id;
  return new;
end;
$function$;

create or replace function public.notify_crew_member()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_crew public.crews;
  v_who text;
begin
  select * into v_crew from public.crews c where c.id = new.crew_id;
  select p.full_name into v_who from public.profiles p where p.id = new.user_id;

  if tg_op = 'INSERT' and new.status = 'asked' then
    perform public.notify(new.user_id, 'people',
      coalesce(v_crew.name, 'A crew') || ' wants you on the roster',
      'A crew roster is a public page — answer it under Crews on Home.', '/crews?show=in');
  elsif tg_op = 'UPDATE' and old.status = 'asked' and new.status in ('confirmed', 'rejected') then
    perform public.notify(v_crew.leader_id, 'people',
      coalesce(v_who, 'Somebody') || (case new.status when 'confirmed' then ' joined ' else ' said no to ' end) || coalesce(v_crew.name, 'the crew'),
      null, '/crews/' || new.crew_id::text || '/manage');
  end if;
  return null;
end;
$function$;

comment on function public.save_crew_practice(uuid, timestamp with time zone, timestamp with time zone, text, text, uuid)
  is 'The leader arranges or moves a practice. Creating one TELLS every confirmed member (11 Oct 2026); nobody is asked.';
comment on function public.practice_people(uuid)
  is 'The register: the leader and every confirmed member, with whether the leader checked them in.';
