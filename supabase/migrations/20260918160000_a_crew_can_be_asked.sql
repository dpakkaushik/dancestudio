-- 18 Sep 2026: A CREW CAN BE ASKED. ⚠ RLS, money-adjacent (an enquiry is quoted).
--
-- The user: "crews can also get enquiries." An enquiry has named a BUSINESS since
-- Step 18 — a studio or an artist page, `enquiries.business_id not null` — and a
-- crew is a person's thing (Step 22: `crews.leader_id`, no business behind it).
-- So an enquiry learns a second target the way `follows` learned a second object
-- on 28 Aug 2026: `business_id` becomes nullable, `crew_id` arrives, and a CHECK
-- makes a row name EXACTLY ONE of them. The quotes follow the same shape, so a
-- quote is always addressable by whoever received the enquiry.
--
-- WHO READS A CREW'S ENQUIRY: the sender (unchanged) and the crew's LEADER — the
-- one person who runs the crew and the one the desk on `/crews/{id}/inbox` is
-- drawn for. Not the members: a member did not agree to run the crew's bookings,
-- and the prototype's crew desk (S_crewmanage) is the leader's alone.
--
-- WHAT A CREW CAN BE ASKED FOR: a celebration, a corporate show, a collaboration.
-- Not "invite as judge" (a person's job, 4934 — refused for a studio already) and
-- not "private sessions" (a teacher's thing). The rule is in `send_enquiry` so
-- every door meets it; the sheet on the crew's page offers only those three.
--
-- WHAT DOES NOT CHANGE: every existing row names a business and keeps doing so
-- (the CHECK is satisfied by construction); the sender's read, the business's
-- read, `set_enquiry_status`, `answer_enquiry_quote` and `record_enquiry_payment`
-- are untouched — the last three already decide through `is_enquiry_member`,
-- which is the one function that learns about the leader. No grant widens: the
-- two new policies are `to authenticated` like the ones beside them, and every
-- function comes back with exactly the ACL it has today.

-- ── 1. the enquiry names a business OR a crew ────────────────────────────────
alter table public.enquiries alter column business_id drop not null;
alter table public.enquiries
  add column crew_id uuid references public.crews (id) on delete cascade;
alter table public.enquiries
  add constraint enquiries_one_target check ((business_id is null) <> (crew_id is null));
create index enquiries_crew_idx on public.enquiries (crew_id, created_at desc) where deleted_at is null;

comment on column public.enquiries.business_id is
  'The studio or artist page asked — null when the enquiry went to a crew (exactly one of business_id / crew_id is set).';
comment on column public.enquiries.crew_id is
  'The crew asked (18 Sep 2026) — null when the enquiry went to a business. Read by the crew''s leader.';

-- ── 2. and so does the quote ─────────────────────────────────────────────────
alter table public.enquiry_quotes alter column business_id drop not null;
alter table public.enquiry_quotes
  add column crew_id uuid references public.crews (id) on delete cascade;
alter table public.enquiry_quotes
  add constraint enquiry_quotes_one_target check ((business_id is null) <> (crew_id is null));

comment on column public.enquiry_quotes.crew_id is
  'The crew that quoted (18 Sep 2026) — copied from the enquiry, null for a business''s quote.';

-- ── 3. the leader reads the crew's enquiries and quotes ──────────────────────
-- `is_crew_leader` is the SECURITY DEFINER test Step 22 wrote for the crew's own
-- rows, already executable by authenticated; using it here keeps this policy
-- from depending on `crews`' own policies.
create policy "crew leaders read their crew's enquiries"
  on public.enquiries for select
  to authenticated
  using (crew_id is not null and public.is_crew_leader(crew_id));

create policy "crew leaders read their crew's quotes"
  on public.enquiry_quotes for select
  to authenticated
  using (crew_id is not null and public.is_crew_leader(crew_id));

-- ── 4. who may WORK an enquiry: the business's members, or the crew's leader ─
-- Same name, same signature: `create or replace` keeps the ACL (authenticated,
-- service_role). Every RPC that moves an enquiry — the stage, the quote, the
-- payment record — decides through this one function.
create or replace function public.is_enquiry_member(p_enquiry_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.enquiries e
    where e.id = p_enquiry_id
      and e.deleted_at is null
      and (
        (e.business_id is not null and exists (
          select 1 from public.business_members m
          where m.business_id = e.business_id
            and m.user_id = auth.uid()
            and m.deleted_at is null
        ))
        or (e.crew_id is not null and exists (
          select 1 from public.crews c
          where c.id = e.crew_id
            and c.leader_id = auth.uid()
            and c.deleted_at is null
        ))
      )
  );
$$;

-- ── 5. send_enquiry gains p_crew_id ──────────────────────────────────────────
-- DROPPED and re-created, not overloaded (the Step 11 / slice-7 lesson: two
-- functions of one name is how PostgREST stops finding either). The new argument
-- is LAST with a default, so the app's existing call — by named arguments, without
-- it — resolves exactly as before.
drop function public.send_enquiry(uuid, text, jsonb, date[], text, text, text);

create function public.send_enquiry(
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
    -- a crew dances at a celebration, a corporate show, a collaboration; judging
    -- is a person's job and private sessions are a teacher's
    if p_type_key not in ('celebration', 'corporate', 'collab') then
      raise exception 'a crew can be asked for a celebration, a corporate show or a collaboration';
    end if;
    -- you do not send your own crew an enquiry: not its leader, not a confirmed member
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

  -- ── to a BUSINESS — unchanged from Step 18 ──
  select * into v_business from public.businesses t where t.id = p_business_id and t.deleted_at is null;
  if not found then
    raise exception 'business not found';
  end if;
  if v_business.visibility <> 'listed' then
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
-- a re-created function arrives with the database's default grants (anon among
-- them — the 16 Sep lesson), so the whole set is stated: exactly what it has today
revoke execute on function public.send_enquiry(uuid, text, jsonb, date[], text, text, text, uuid) from public, anon;
grant execute on function public.send_enquiry(uuid, text, jsonb, date[], text, text, text, uuid) to authenticated, service_role;

-- ── 6. a quote carries the enquiry's target ──────────────────────────────────
create or replace function public.send_enquiry_quote(p_enquiry_id uuid, p_cost_inr integer, p_advance_pct integer)
returns public.enquiry_quotes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_enq public.enquiries;
  v_n integer;
  v_row public.enquiry_quotes;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_enquiry_member(p_enquiry_id) then
    raise exception 'only the business this enquiry went to can quote it';
  end if;
  if p_cost_inr is null or p_cost_inr <= 0 then
    raise exception 'the cost must be a positive amount';
  end if;
  if p_advance_pct is null or p_advance_pct < 0 or p_advance_pct > 100 then
    raise exception 'the advance is a percentage';
  end if;
  select * into v_enq from public.enquiries e where e.id = p_enquiry_id and e.deleted_at is null;
  if v_enq.status in ('won', 'lost') then
    raise exception 'this enquiry is closed';
  end if;

  -- an older quote is not deleted, it is SUPERSEDED — the history is the point
  update public.enquiry_quotes
    set status = 'superseded', updated_by = v_user
    where enquiry_id = p_enquiry_id and status = 'sent' and deleted_at is null;

  select coalesce(max(q.n), 0) + 1 into v_n from public.enquiry_quotes q where q.enquiry_id = p_enquiry_id;

  insert into public.enquiry_quotes (enquiry_id, business_id, crew_id, n, cost_inr, advance_pct, advance_inr, created_by, updated_by)
  values (p_enquiry_id, v_enq.business_id, v_enq.crew_id, v_n, p_cost_inr, p_advance_pct,
          round(p_cost_inr * p_advance_pct / 100.0)::integer, v_user, v_user)
  returning * into v_row;

  update public.enquiries set status = 'quoted', updated_by = v_user where id = p_enquiry_id;
  return v_row;
end;
$$;

-- ── 7. the notifications name the crew ───────────────────────────────────────
-- A crew's enquiry is raised to its LEADER; a business's to its owners, as
-- before. Trigger functions: `create or replace` keeps the revoke-from-everybody
-- ACL and the triggers stay bound.
create or replace function public.notify_enquiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_who text;
  v_leader uuid;
begin
  select p.full_name into v_who from public.profiles p where p.id = new.from_user_id;
  if new.crew_id is not null then
    select c.leader_id into v_leader from public.crews c where c.id = new.crew_id;
    if v_leader is not null then
      perform public.notify(v_leader, 'enquiry',
        coalesce(v_who, 'Somebody') || ' sent your crew an enquiry',
        left(new.message, 120), '/inbox/enquiries/' || new.id::text);
    end if;
    return null;
  end if;
  perform public.notify_business_owners(new.business_id, 'enquiry',
    coalesce(v_who, 'Somebody') || ' sent an enquiry',
    left(new.message, 120), '/inbox/enquiries/' || new.id::text);
  return null;
end;
$$;

create or replace function public.notify_enquiry_quote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enq public.enquiries;
  v_name text;
begin
  select * into v_enq from public.enquiries e where e.id = new.enquiry_id;
  if v_enq.crew_id is not null then
    select c.name into v_name from public.crews c where c.id = v_enq.crew_id;
  else
    select t.name into v_name from public.businesses t where t.id = v_enq.business_id;
  end if;
  if new.status = 'sent' then
    perform public.notify(v_enq.from_user_id, 'enquiry',
      coalesce(v_name, case when v_enq.crew_id is not null then 'A crew' else 'A studio' end) || ' quoted ₹' || new.cost_inr::text,
      'Accept it or decline it on the enquiry.', '/inbox/enquiries/' || v_enq.id::text);
  end if;
  return null;
end;
$$;

comment on function public.send_enquiry(uuid, text, jsonb, date[], text, text, text, uuid) is
  'Send an enquiry from a public page to a listed business (p_business_id) OR to a crew (p_crew_id, 18 Sep 2026) — exactly one. A crew takes celebration / corporate / collab; its leader and confirmed members cannot ask it.';
