-- AN INVITE GETS ITS CODE BACK (20 Sep 2026).
--
-- ⚠ THIS IS THE SAME MISTAKE TWICE IN ONE MIGRATION, AND THE SECOND TIME I HAD
-- ALREADY CAUGHT MYSELF MAKING IT. `20260920100000` needed three functions to
-- learn one new word. For `ask_organization_member` and `remove_organization_member`
-- I read 20260919140000 and copied the body verbatim, because re-typing one had
-- already cost five differences. For `invite_person_to_business` I re-typed it
-- from memory anyway, and lost TWO things:
--
--   1. `code` — the invite's own handle. `business_invites.code` is NOT NULL, so
--      EVERY ask through the people picker answered
--      *null value in column "code" of relation "business_invites" violates
--      not-null constraint*. The Team desk printed it, which is how the happy
--      path found it in one line.
--   2. The re-ask rule. The original RAISES *"they have already been asked — the
--      invite is still waiting"*; my version quietly soft-deleted the pending
--      invite and wrote a new one, which silently invalidates a code somebody may
--      already be holding (Rule 14's spirit: a handle handed over is a promise).
--
-- 20260919190000's body, verbatim, with exactly one character of change: the
-- role list gains `assistant`. Same signature, so `create or replace` keeps the
-- ACL. **Read the original. Every time. Even the third one in the same file.**
create or replace function public.invite_person_to_business(p_business_id uuid, p_user_id uuid, p_role text)
returns public.business_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_invite public.business_invites;
  v_name text;
  v_role text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not public.is_business_owner(p_business_id) then
    raise exception 'only an owner invites somebody onto the team';
  end if;
  v_role := coalesce(nullif(btrim(p_role), ''), 'staff');
  -- 20 Sep 2026: `assistant` is the only addition to this list
  if v_role not in ('trainer', 'staff', 'visiting_faculty', 'assistant') then
    raise exception 'owner is not a seat that can be given away';
  end if;
  if p_user_id = v_user then raise exception 'you are already on this team'; end if;

  select p.full_name into v_name
    from public.profiles p
   where p.id = p_user_id and p.deleted_at is null and p.role = 'user';
  if not found then raise exception 'that is not somebody on DanceOS'; end if;

  if exists (
    select 1 from public.business_members m
     where m.business_id = p_business_id and m.user_id = p_user_id and m.deleted_at is null
  ) then
    raise exception 'they are already on this team';
  end if;
  if exists (
    select 1 from public.business_invites i
     where i.business_id = p_business_id and i.user_id = p_user_id
       and i.status = 'pending' and i.deleted_at is null
  ) then
    raise exception 'they have already been asked — the invite is still waiting';
  end if;

  -- it still gets a code: the QR and the link are how an invite is HANDED over
  -- in the room, and `accept_business_invite` still checks who is accepting
  insert into public.business_invites (business_id, name, email, user_id, member_role, code, created_by, updated_by)
  values (p_business_id, v_name, null, p_user_id, v_role,
          substr(md5(gen_random_uuid()::text), 1, 10), v_user, v_user)
  returning * into v_invite;
  return v_invite;
end;
$$;
comment on function public.invite_person_to_business(uuid, uuid, text) is
  'An owner asks a PERSON onto the team (19 Sep 2026), by their profile rather than an address. The invite still carries a code, because the QR and the link are how it is handed over in the room. Seats: trainer | staff | visiting_faculty | assistant (20 Sep 2026) — never owner.';
