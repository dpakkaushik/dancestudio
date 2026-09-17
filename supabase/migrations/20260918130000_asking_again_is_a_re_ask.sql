-- FOUND BY THE PROOFS, WITHIN THE HOUR (18 Sep 2026). Rule 4: the applied
-- migration is not edited; this is the follow-up.
--
-- 20260918120000's `ask_class_person` gained a line refusing to ask the class's
-- confirmed TEACHER to be its assistant:
--
--     raise exception 'the person taking the class is not their own assistant';
--
-- It reads sensibly and it is wrong. Asking somebody who is already on a class
-- is a RE-ASK: the function closes their live row and inserts a fresh one, which
-- is how changing what a person is on a class has always worked (the class form
-- has re-asked on artist <-> assistant since Step 11: "Changing WHAT somebody is
-- is a different ask, so that re-asks by design"). The guard turned that ordinary
-- move into an error, and three proofs met it as a 400 mid-run:
-- rls-proof-staff, rls-proof-stats and rls-proof-rooms-people.
--
-- Worse, it made a check pass for the wrong reason: rooms-people's "claiming
-- somebody outside the team is rejected" went green off THIS refusal, not off the
-- rule it was written for - and that rule is gone anyway (since 20260918120000 a
-- studio may ask anyone on DanceOS). That check is re-cut in the same push.
--
-- Everything else about the function is unchanged: the teacher is the owner's to
-- choose, an assistant is the owner's or the teacher's, the jobs and the pay stay
-- the owner's, an organization is never asked, and a rate from anybody but the
-- owner is refused.
--
-- RLS impact: none. One function body, its signature and grants untouched.

create or replace function public.ask_class_person(
  p_class_id uuid,
  p_user_id uuid,
  p_kind text,
  p_can_attendance boolean default false,
  p_can_refunds boolean default false,
  p_pay_per_session_inr integer default 0
) returns public.class_people
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_class public.classes;
  v_row public.class_people;
  v_owner boolean;
  v_teacher boolean;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_kind not in ('artist', 'assistant') then
    raise exception 'invalid kind';
  end if;
  select * into v_class from public.classes c where c.id = p_class_id and c.deleted_at is null;
  if not found then
    raise exception 'class not found';
  end if;
  v_owner := public.is_business_owner(v_class.business_id);
  v_teacher := exists (
    select 1 from public.class_people cp
     where cp.class_id = p_class_id and cp.user_id = v_user and cp.kind = 'artist'
       and cp.status = 'confirmed' and cp.deleted_at is null);
  if p_kind = 'artist' and not v_owner then
    raise exception 'only the owner chooses who takes a class';
  end if;
  if p_kind = 'assistant' and not (v_owner or v_teacher) then
    raise exception 'only the owner, or the person taking this class, adds assistants';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id and p.deleted_at is null) then
    raise exception 'that person has not finished onboarding';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_user_id and p.role = 'org') then
    raise exception 'an organization does not take a class — ask a person';
  end if;
  if coalesce(p_pay_per_session_inr, 0) <> 0 and not v_owner then
    raise exception 'only the studio owner sets what a session pays';
  end if;

  -- asking again after a withdrawal, a no, or in a different role is a FRESH ASK:
  -- the live row is closed and a new one goes out, so consent is never inherited
  update public.class_people
     set deleted_at = now(), updated_by = v_user
   where class_id = p_class_id and user_id = p_user_id and deleted_at is null;

  insert into public.class_people (class_id, business_id, user_id, kind, status,
                                   can_attendance, can_refunds, pay_per_session_inr,
                                   created_by, updated_by)
  values (p_class_id, v_class.business_id, p_user_id, p_kind, 'asked',
          case when v_owner then coalesce(p_can_attendance, false) else false end,
          case when v_owner then coalesce(p_can_refunds, false) else false end,
          coalesce(p_pay_per_session_inr, 0), v_user, v_user)
  returning * into v_row;
  return v_row;
end;
$$;

comment on function public.ask_class_person(uuid, uuid, text, boolean, boolean, integer) is
  'The studio''s owner asks anyone on DanceOS to TAKE a class; the owner or that person asks an ASSISTANT (18 Sep 2026). Asking again - after a no, a withdrawal, or in a different role - is a fresh ask. The jobs and the pay are the owner''s alone.';
