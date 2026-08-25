-- Step 12 (Studio CRM): the leads desk — the people who asked about dancing
-- here and have not (yet) become students.
--
-- Stages are the prototype's own five (the chip row at DanceOSApp.jsx:5978 and
-- the tints at 5664): New · Quoted · Trial booked · Converted · Lost. The funnel
-- those feed is "leads → trials → enrolled" (18209-18211).
--
-- What this table deliberately does NOT do: fake an enrollment. A studio cannot
-- book a seat on somebody else's behalf — enrolling is the learner's own act
-- (Step 4's enroll_in_session is self-only, on purpose). So a booked trial is
-- recorded here as what it really is at this stage — which class, which day,
-- agreed at the desk — and the lead is marked Converted once they actually turn
-- up as a learner. `converted_user_id` is the join back to the real person.

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  -- how the desk gets back to them; India-first, so a mobile is the handle
  mobile text check (mobile is null or char_length(trim(mobile)) between 4 and 20),
  -- what they want: a style, "join a class", "wedding choreo" (18213)
  interest text check (interest is null or char_length(interest) <= 160),
  source text not null default 'walk_in' check (source in ('walk_in', 'enquiry', 'referral', 'social')),
  status text not null default 'new'
    check (status in ('new', 'quoted', 'trial_booked', 'converted', 'lost')),
  -- a trial agreed at the desk: which class, which day
  trial_class_id uuid references public.classes (id) on delete set null,
  trial_on date,
  -- who they became, once they are a real learner
  converted_user_id uuid references public.profiles (id) on delete set null,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);

comment on table public.leads is
  'The studio''s enquiry pipeline: new → quoted → trial booked → converted | lost. A booked trial is a desk agreement, not an enrollment — a learner still books their own seat.';

create index leads_tenant_status_idx on public.leads (tenant_id, status) where deleted_at is null;
create index leads_tenant_created_idx on public.leads (tenant_id, created_at desc) where deleted_at is null;

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

alter table public.leads enable row level security;

-- The whole team works the desk — including staff, who are exactly the people
-- who answer the phone. No deleted_at filter on SELECT: a soft-deleting role
-- must be able to SELECT the row it just deleted (Step 3's lesson).
create policy "members read own tenant leads"
  on public.leads for select
  to authenticated
  using (public.is_tenant_member(leads.tenant_id));

create policy "members insert own tenant leads"
  on public.leads for insert
  to authenticated
  with check (public.is_tenant_member(leads.tenant_id));

create policy "members update own tenant leads"
  on public.leads for update
  to authenticated
  using (public.is_tenant_member(leads.tenant_id));

-- A lead is a private business record: no public policy, ever. Nobody outside
-- the studio can read who enquired, what they were quoted, or that they left.
