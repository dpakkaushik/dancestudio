-- 19 Sep 2026: AN ORGANIZATION TAKES ENQUIRIES.
--
-- The user: "Send Enquiry for all except users." A studio, an artist and a crew
-- could already be asked; an organization could not — its hosting row (R15,
-- type 'org') is unlisted for ever, and `send_enquiry` refused anything not
-- listed. An organization is asked THROUGH that hosting row now, while it is
-- PUBLIC (`event_host_is_public` — the same test its events pass), for a
-- celebration, a corporate show or a collaboration: it hosts events, it does not
-- teach, so private sessions and judging are not its to be asked for.
--
-- Nothing else moves: the row lands in `enquiries.business_id` as before, the
-- organization owns the hosting row so `is_enquiry_member` already admits it to
-- quote and record, and `notify_enquiry` already tells the owners of the
-- business asked — here, the organization. Same signature, `create or replace`,
-- ACL kept (authenticated + service_role, never anon).

create or replace function public.send_enquiry(
  p_business_id uuid,
  p_type_key text,
  p_fields jsonb,
  p_dates date[],
  p_where text,
  p_message text,
  p_mobile text default null,
  p_crew_id uuid default null
)
returns public.enquiries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_business public.businesses;
  v_crew public.crews;
  v_row public.enquiries;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user and p.deleted_at is null) then
    raise exception 'finish onboarding before sending an enquiry';
  end if;
  if p_type_key not in ('celebration', 'corporate', 'judge', 'private', 'collab') then
    raise exception 'unknown enquiry type';
  end if;
  if coalesce(array_length(p_dates, 1), 0) = 0 then
    raise exception 'add at least one date';
  end if;
  if length(trim(coalesce(p_message, ''))) = 0 then
    raise exception 'add a short message';
  end if;
  if jsonb_typeof(coalesce(p_fields, '[]'::jsonb)) <> 'array' then
    raise exception 'fields must be a list';
  end if;
  -- exactly one target, the same rule the table keeps
  if (p_business_id is null) = (p_crew_id is null) then
    raise exception 'an enquiry goes to a business or to a crew';
  end if;

  if p_crew_id is not null then
    -- ── to a CREW (18 Sep 2026) ──
    select * into v_crew from public.crews c where c.id = p_crew_id and c.deleted_at is null;
    if not found then
      raise exception 'crew not found';
    end if;
    if p_type_key not in ('celebration', 'corporate', 'collab') then
      raise exception 'a crew can be asked for a celebration, a corporate show or a collaboration';
    end if;
    if v_crew.leader_id = v_user or exists (
      select 1 from public.crew_members cm
      where cm.crew_id = p_crew_id and cm.user_id = v_user and cm.status = 'confirmed' and cm.deleted_at is null
    ) then
      raise exception 'you are in this crew';
    end if;

    insert into public.enquiries (business_id, crew_id, from_user_id, type_key, fields, dates, where_text, message, mobile, created_by, updated_by)
    values (null, p_crew_id, v_user, p_type_key, coalesce(p_fields, '[]'::jsonb), p_dates,
            nullif(trim(coalesce(p_where, '')), ''), trim(p_message), nullif(trim(coalesce(p_mobile, '')), ''), v_user, v_user)
    returning * into v_row;
    return v_row;
  end if;

  -- ── to a BUSINESS ──
  select * into v_business from public.businesses t where t.id = p_business_id and t.deleted_at is null;
  if not found then
    raise exception 'business not found';
  end if;
  if v_business.type = 'org' then
    -- ── AN ORGANIZATION, through its hosting row (19 Sep 2026): while it is public ──
    if not public.event_host_is_public(p_business_id) then
      raise exception 'this organization is not open to the public';
    end if;
    if p_type_key not in ('celebration', 'corporate', 'collab') then
      raise exception 'an organization can be asked for a celebration, a corporate show or a collaboration';
    end if;
  elsif v_business.visibility <> 'listed' then
    raise exception 'this business is not open to the public';
  end if;
  -- "Invite as Judge" is a person's job (4934): offered to artists only
  if p_type_key = 'judge' and v_business.type <> 'artist_page' then
    raise exception 'only an artist can be invited to judge';
  end if;
  -- you do not send yourself an enquiry
  if exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id and m.user_id = v_user and m.deleted_at is null
  ) then
    raise exception 'you already belong to this business';
  end if;

  insert into public.enquiries (business_id, from_user_id, type_key, fields, dates, where_text, message, mobile, created_by, updated_by)
  values (p_business_id, v_user, p_type_key, coalesce(p_fields, '[]'::jsonb), p_dates,
          nullif(trim(coalesce(p_where, '')), ''), trim(p_message), nullif(trim(coalesce(p_mobile, '')), ''), v_user, v_user)
  returning * into v_row;
  return v_row;
end;
$$;
comment on function public.send_enquiry(uuid, text, jsonb, date[], text, text, text, uuid) is
  'Send an enquiry to a listed business, to a crew (18 Sep 2026), or to a PUBLIC organization through its hosting row (19 Sep 2026 — celebration, corporate, collaboration). The sender must be onboarded and outside the thing asked.';
