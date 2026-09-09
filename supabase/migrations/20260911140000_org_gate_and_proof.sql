-- R14 + R16 (9 Sep 2026, the user's asks): the studio gate, and the photos an
-- organization shows DanceOS to be verified.
-- ⚠ Rule 9: auth + RLS + money-adjacent.
--
-- R14. "Studio creation must be after verification and paying for the
--      subscription — until the org is not verified can't create studio."
--
--      Until now an organization could build studios the moment it signed up;
--      they were born unlisted and went public when the tick landed. From here
--      a studio cannot be created at all until BOTH are true: the organization
--      is verified, and its subscription is live. A studio made by a verified,
--      subscribed organization is public immediately — there is nothing left to
--      wait for.
--
--      THE MONEY, HONESTLY: no price has been set, so nothing is charged. The
--      gate is complete and real — `org_subscription_active()` — but the only
--      thing that currently creates a live plan row is an admin granting one.
--      When the price exists, a Cashfree order writes the same row and the gate
--      does not change. Nothing here pretends to have taken money.
--
--      Every organization ALREADY verified is granted twelve months, so the
--      rule arrives without breaking an account that was playing by the old
--      one. Those rows say so in their note.
--
-- R16. "At the time of signup along with the social media the org must attach
--      min 5 to max 10 pics which will be visible to admin for the
--      verification."
--
--      These are evidence, not a gallery: a PRIVATE bucket (`org-proof`), read
--      by the organization itself and by a platform admin, and by nobody else.
--      The public `media` bucket would have made them world-readable by URL.
--      `request_org_verification` refuses to file a request under five.

-- ── 1. proof photos ─────────────────────────────────────────────────────────
create table public.org_proof_photos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.profiles (id) on delete cascade,
  -- the object's path in the private bucket: proof/{org_id}/{uuid}.{ext}
  path text not null check (char_length(path) between 8 and 400),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);
comment on table public.org_proof_photos is
  'The 5-10 photos of its space an organization shows DanceOS to be verified (R16, 9 Sep 2026). Evidence, not a gallery: the objects live in the PRIVATE org-proof bucket and only the organization and a platform admin may read them.';

create unique index org_proof_photos_path_idx on public.org_proof_photos (path) where deleted_at is null;
create index org_proof_photos_org_idx on public.org_proof_photos (org_id, sort) where deleted_at is null;

create trigger org_proof_photos_set_updated_at
  before update on public.org_proof_photos
  for each row execute function public.set_updated_at();

alter table public.org_proof_photos enable row level security;

create policy "an organization reads its own proof" on public.org_proof_photos
  for select to authenticated using (org_id = auth.uid());
create policy "admins read every organization's proof" on public.org_proof_photos
  for select to authenticated using (public.is_platform_admin());
-- no insert/update/delete policies: the two functions below are the only way in

-- ── 2. the subscription that opens the studio gate ──────────────────────────
create table public.org_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.profiles (id) on delete cascade,
  -- 'granted' is an admin's decision and costs nothing; the two paid words are
  -- reserved for the Cashfree order that does not exist yet
  plan text not null check (plan in ('granted', 'monthly', 'yearly')),
  started_on date not null default (now() at time zone 'Asia/Kolkata')::date,
  until date not null,
  amount_inr integer not null default 0 check (amount_inr >= 0),
  granted_by uuid references auth.users (id),
  note text check (note is null or char_length(note) <= 300),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  deleted_at timestamptz
);
comment on table public.org_plans is
  'An organization''s subscription. One live row (ended_at null, until in the future) is what opens the studio gate alongside the verification tick (R14, 9 Sep 2026). Nothing is charged yet: only an admin''s grant writes a row. A Cashfree order will write the same row.';

create index org_plans_org_idx on public.org_plans (org_id) where deleted_at is null;

create trigger org_plans_set_updated_at
  before update on public.org_plans
  for each row execute function public.set_updated_at();

alter table public.org_plans enable row level security;

create policy "an organization reads its own subscription" on public.org_plans
  for select to authenticated using (org_id = auth.uid());
create policy "admins read every subscription" on public.org_plans
  for select to authenticated using (public.is_platform_admin());

-- ── 3. both tables are an ORGANIZATION's, and the database says so ──────────
-- The mirror of `guard_person_only` (9 Sep 2026): that one keeps organizations
-- out of a person's tables; this one keeps people out of an organization's.
create or replace function public.guard_org_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role' then
    return new;
  end if;
  select p.role into v_role from public.profiles p where p.id = new.org_id and p.deleted_at is null;
  if v_role is distinct from 'org' then
    raise exception 'that belongs to an organization, and this account is not one';
  end if;
  return new;
end;
$$;
comment on function public.guard_org_only() is
  'Refuses a row on an organization-only table whose owner is not an organization. The mirror of guard_person_only.';

create trigger org_proof_photos_org_only
  before insert or update of org_id on public.org_proof_photos
  for each row execute function public.guard_org_only();
create trigger org_plans_org_only
  before insert or update of org_id on public.org_plans
  for each row execute function public.guard_org_only();

-- ── 4. is the subscription live? ────────────────────────────────────────────
create or replace function public.org_subscription_active(p_org_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.org_plans p
    where p.org_id = p_org_id
      and p.deleted_at is null
      and p.ended_at is null
      and p.until >= (now() at time zone 'Asia/Kolkata')::date
  );
$$;
comment on function public.org_subscription_active(uuid) is
  'True while an organization holds a live subscription row. Half of the studio gate (R14); the other half is the verification tick.';
revoke execute on function public.org_subscription_active(uuid) from public, anon;
grant execute on function public.org_subscription_active(uuid) to authenticated;

/** What the organization signed in right now still needs before it can create a
 *  studio — as the sentence it should read, or null when the gate is open.
 *
 *  One rule, said in one place: `create_tenant_with_owner` raises this exact
 *  text, and the hub prints it under a disabled button. A screen that guesses
 *  the rule and a database that enforces it drift apart; this cannot. */
create or replace function public.why_no_studio()
returns text
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_verified timestamptz;
  v_photos integer;
  v_pending boolean;
begin
  if v_user is null then
    return 'Sign in first.';
  end if;
  select p.role, p.verified_at into v_role, v_verified
    from public.profiles p where p.id = v_user and p.deleted_at is null;
  if not found then
    return 'Finish onboarding first.';
  end if;
  if v_role <> 'org' then
    return 'Only an organization can set up a studio.';
  end if;
  if v_verified is null then
    select count(*) into v_photos from public.org_proof_photos
      where org_id = v_user and deleted_at is null;
    select exists (select 1 from public.org_verification_requests r
                    where r.org_id = v_user and r.status = 'pending' and r.deleted_at is null)
      into v_pending;
    if v_photos < 5 then
      return 'DanceOS needs at least 5 photos of your space before it can verify you — ' || v_photos || ' so far.';
    end if;
    if v_pending then
      return 'A DanceOS admin is checking your organization. Studios open the moment you are verified.';
    end if;
    return 'Ask DanceOS to verify your organization first — studios open when the tick lands.';
  end if;
  if not public.org_subscription_active(v_user) then
    return 'Your DanceOS subscription is not active. Message DanceOS and an admin will set it up.';
  end if;
  return null;
end;
$$;
comment on function public.why_no_studio() is
  'The sentence an organization still needs to satisfy before creating a studio, or null when it may. The same text create_tenant_with_owner raises, so the screen and the database cannot disagree (R14).';
revoke execute on function public.why_no_studio() from public, anon;
grant execute on function public.why_no_studio() to authenticated;

-- ── 5. the two photo functions ──────────────────────────────────────────────
create or replace function public.add_org_proof_photo(p_path text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_live integer;
  v_id uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select p.role into v_role from public.profiles p where p.id = v_user and p.deleted_at is null;
  if not found then raise exception 'finish onboarding first'; end if;
  if v_role <> 'org' then raise exception 'only an organization shows DanceOS its space'; end if;
  if p_path is null or (string_to_array(p_path, '/'))[1] <> 'proof'
     or (string_to_array(p_path, '/'))[2] <> v_user::text then
    raise exception 'that file is not in your own folder';
  end if;
  select count(*) into v_live from public.org_proof_photos
    where org_id = v_user and deleted_at is null;
  if v_live >= 10 then
    raise exception 'ten photos is the most DanceOS needs — remove one first';
  end if;
  insert into public.org_proof_photos (org_id, path, sort, created_by, updated_by)
  values (v_user, p_path, v_live, v_user, v_user)
  returning id into v_id;
  return v_id;
end;
$$;
comment on function public.add_org_proof_photo(text) is
  'Record one verification photo an organization has just uploaded to its own folder in the private org-proof bucket. Ten is the ceiling (R16).';
revoke execute on function public.add_org_proof_photo(text) from public, anon;
grant execute on function public.add_org_proof_photo(text) to authenticated;

create or replace function public.remove_org_proof_photo(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_live integer;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.org_proof_photos p
                  where p.id = p_id and p.org_id = v_user and p.deleted_at is null) then
    raise exception 'no such photo';
  end if;
  select count(*) into v_live from public.org_proof_photos
    where org_id = v_user and deleted_at is null;
  -- while a request is with an admin, the evidence stays whole
  if v_live <= 5 and exists (select 1 from public.org_verification_requests r
                              where r.org_id = v_user and r.status = 'pending' and r.deleted_at is null) then
    raise exception 'DanceOS is checking these now — add a replacement before you remove one';
  end if;
  update public.org_proof_photos p
     set deleted_at = now(), updated_by = v_user
   where p.id = p_id;
end;
$$;
comment on function public.remove_org_proof_photo(uuid) is
  'Take one verification photo back. Refused while a request is pending and it would drop the evidence below five (R16).';
revoke execute on function public.remove_org_proof_photo(uuid) from public, anon;
grant execute on function public.remove_org_proof_photo(uuid) to authenticated;

-- ── 6. asking to be verified now costs five photos as well as a link ────────
create or replace function public.request_org_verification()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_socials jsonb;
  v_verified timestamptz;
  v_photos integer;
  v_id uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select p.role, p.socials, p.verified_at into v_role, v_socials, v_verified
    from public.profiles p where p.id = v_user and p.deleted_at is null;
  if not found then raise exception 'finish onboarding first'; end if;
  if v_role <> 'org' then raise exception 'only an organization asks to be verified'; end if;
  if v_verified is not null then raise exception 'this organization is already verified'; end if;
  if jsonb_array_length(coalesce(v_socials, '[]'::jsonb)) = 0 then
    raise exception 'add at least one social link first — DanceOS verifies an organization by its public presence';
  end if;
  select count(*) into v_photos from public.org_proof_photos
    where org_id = v_user and deleted_at is null;
  if v_photos < 5 then
    raise exception 'add at least 5 photos of your space — DanceOS checks them alongside your links (% so far)', v_photos;
  end if;
  select r.id into v_id from public.org_verification_requests r
    where r.org_id = v_user and r.status = 'pending' and r.deleted_at is null;
  if found then return v_id; end if;
  insert into public.org_verification_requests (org_id, created_by, updated_by)
    values (v_user, v_user, v_user)
    returning id into v_id;
  return v_id;
end;
$$;
comment on function public.request_org_verification() is
  'File a verification request. Needs at least one public link AND at least five photos of the space (R16, 9 Sep 2026). Idempotent while one is pending.';
revoke execute on function public.request_org_verification() from public, anon;
grant execute on function public.request_org_verification() to authenticated;

-- ── 7. the gate itself ──────────────────────────────────────────────────────
create or replace function public.create_tenant_with_owner(
  p_name text,
  p_type text,
  p_area text default null,
  p_city text default null
) returns public.tenants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_tenant public.tenants;
  v_lat double precision;
  v_lng double precision;
  v_role text;
  v_why text;
  v_visibility text;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_type not in ('studio', 'trainer_business') then
    raise exception 'invalid tenant type';
  end if;
  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'name is required';
  end if;

  select p.role into v_role
    from public.profiles p where p.id = v_user and p.deleted_at is null;
  if not found then
    raise exception 'finish onboarding first';
  end if;

  if p_type = 'studio' then
    /* R14: verified AND subscribed, in the one sentence the hub also prints */
    v_why := public.why_no_studio();
    if v_why is not null then
      raise exception '%', v_why;
    end if;
    /* the organization is verified by the time it gets here, so there is
       nothing left for the studio to wait for — it is public on creation */
    v_visibility := 'listed';
  else
    if v_role <> 'user' then
      raise exception 'an artist page belongs to a person — an organization sets up studios';
    end if;
    if not exists (select 1 from public.artist_plans ap
                    where ap.user_id = v_user and ap.deleted_at is null and ap.ended_at is null and ap.until >= v_today) then
      raise exception 'the Artist plan unlocks your artist page';
    end if;
    if exists (select 1 from public.tenants t
                join public.tenant_members m on m.tenant_id = t.id
                where m.user_id = v_user and m.member_role = 'owner' and m.deleted_at is null
                  and t.type = 'trainer_business' and t.deleted_at is null) then
      raise exception 'you already have an artist page';
    end if;
    v_visibility := 'listed';
  end if;

  select c.lat, c.lng into v_lat, v_lng
  from public.city_centroids c
  where c.city = nullif(trim(p_city), '') and c.deleted_at is null;

  insert into public.tenants (type, name, area, city, lat, lng, visibility, created_by, updated_by)
  values (p_type, trim(p_name), nullif(trim(p_area), ''), nullif(trim(p_city), ''), v_lat, v_lng, v_visibility, v_user, v_user)
  returning * into v_tenant;

  insert into public.tenant_members (tenant_id, user_id, member_role, created_by, updated_by)
  values (v_tenant.id, v_user, 'owner', v_user, v_user);

  return v_tenant;
end;
$$;
comment on function public.create_tenant_with_owner(text, text, text, text) is
  'Create a studio or an artist page and make the caller its owner. A studio needs a VERIFIED and SUBSCRIBED organization (R14, 9 Sep 2026) and is public on creation; an artist page needs a live Artist plan and there may be only one.';
revoke execute on function public.create_tenant_with_owner(text, text, text, text) from public, anon;
grant execute on function public.create_tenant_with_owner(text, text, text, text) to authenticated;

-- ── 8. an admin's two subscription decisions, both audited ──────────────────
create or replace function public.admin_grant_org_subscription(p_org_id uuid, p_months integer, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_role text;
  v_until date;
  v_from date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin';
  end if;
  if p_months is null or p_months < 1 or p_months > 36 then
    raise exception 'between one month and three years';
  end if;
  select p.full_name, p.role into v_name, v_role
    from public.profiles p where p.id = p_org_id and p.deleted_at is null;
  if not found then raise exception 'no such account'; end if;
  if v_role <> 'org' then raise exception 'only an organization holds this subscription'; end if;

  -- a grant on top of a live one extends from where that one ends
  select greatest(v_from, max(p.until)) into v_until from public.org_plans p
   where p.org_id = p_org_id and p.deleted_at is null and p.ended_at is null and p.until >= v_from;
  v_until := (coalesce(v_until, v_from) + (p_months || ' months')::interval)::date;

  update public.org_plans p set ended_at = now(), updated_by = auth.uid()
   where p.org_id = p_org_id and p.deleted_at is null and p.ended_at is null;

  insert into public.org_plans (org_id, plan, started_on, until, amount_inr, granted_by, note, created_by, updated_by)
  values (p_org_id, 'granted', v_from, v_until, 0, auth.uid(), p_note, auth.uid(), auth.uid());

  perform public.notify(p_org_id, 'people',
    'Your DanceOS subscription is active',
    'Until ' || to_char(v_until, 'FMDD FMMonth YYYY') || '. You can set up studios from your business hub.',
    '/business');
  perform public.log_admin_action('subscription.grant', 'profile', p_org_id, v_name, p_note,
    jsonb_build_object('months', p_months, 'until', v_until, 'amount_inr', 0));
end;
$$;
comment on function public.admin_grant_org_subscription(uuid, integer, text) is
  'Grant an organization a subscription of N months, free, as an admin decision. Extends a live one rather than shortening it. Audited (R14). The Cashfree order that will replace this writes the same row.';
revoke execute on function public.admin_grant_org_subscription(uuid, integer, text) from public, anon;
grant execute on function public.admin_grant_org_subscription(uuid, integer, text) to authenticated;

create or replace function public.admin_end_org_subscription(p_org_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'say why in a sentence — they read it, and so does the log';
  end if;
  select p.full_name into v_name from public.profiles p where p.id = p_org_id and p.deleted_at is null;
  if not found then raise exception 'no such account'; end if;
  if not public.org_subscription_active(p_org_id) then
    raise exception 'that organization has no live subscription';
  end if;

  update public.org_plans p set ended_at = now(), updated_by = auth.uid()
   where p.org_id = p_org_id and p.deleted_at is null and p.ended_at is null;

  perform public.notify(p_org_id, 'people',
    'Your DanceOS subscription has ended',
    btrim(p_reason) || ' — your studios stay exactly as they are; you cannot add a new one until it is active again.',
    '/business');
  perform public.log_admin_action('subscription.end', 'profile', p_org_id, v_name, p_reason, '{}'::jsonb);
end;
$$;
comment on function public.admin_end_org_subscription(uuid, text) is
  'End an organization''s subscription, with a reason it reads. Existing studios are untouched; only creating a NEW one is closed off. Audited (R14).';
revoke execute on function public.admin_end_org_subscription(uuid, text) from public, anon;
grant execute on function public.admin_end_org_subscription(uuid, text) to authenticated;

-- ── 9. the panel needs to see both new things ───────────────────────────────
/** Every organization's standing, for the accounts desk: is it verified, is the
 *  subscription live, how many photos has it shown, and when does it lapse. */
create or replace function public.admin_org_standing(p_org_ids uuid[])
returns table (
  org_id uuid,
  subscribed boolean,
  until date,
  plan text,
  proof_photos integer
)
language sql
security definer
set search_path = ''
stable
as $$
  select p.id,
         public.org_subscription_active(p.id),
         (select max(o.until) from public.org_plans o
           where o.org_id = p.id and o.deleted_at is null and o.ended_at is null),
         (select o.plan from public.org_plans o
           where o.org_id = p.id and o.deleted_at is null and o.ended_at is null
           order by o.until desc limit 1),
         (select count(*)::integer from public.org_proof_photos f
           where f.org_id = p.id and f.deleted_at is null)
  from public.profiles p
  where p.id = any (p_org_ids) and p.role = 'org' and p.deleted_at is null
    and public.is_platform_admin();
$$;
comment on function public.admin_org_standing(uuid[]) is
  'Subscription and verification-evidence figures for a page of organizations, for the admin accounts desk (R14, R16).';
revoke execute on function public.admin_org_standing(uuid[]) from public, anon;
grant execute on function public.admin_org_standing(uuid[]) to authenticated;

-- ── 10. the organizations already verified keep working ─────────────────────
-- The rule is new; their accounts are not. Twelve months each, said plainly in
-- the row, so nobody later mistakes a grandfather clause for a payment.
insert into public.org_plans (org_id, plan, started_on, until, amount_inr, note, created_by, updated_by)
select p.id, 'granted',
       (now() at time zone 'Asia/Kolkata')::date,
       ((now() at time zone 'Asia/Kolkata')::date + interval '12 months')::date,
       0,
       'Granted automatically when the subscription gate was introduced (R14, 9 Sep 2026) — this organization was verified under the old rule and nothing was charged.',
       p.id, p.id
from public.profiles p
where p.role = 'org' and p.verified_at is not null and p.deleted_at is null
  and not exists (select 1 from public.org_plans o where o.org_id = p.id and o.deleted_at is null and o.ended_at is null);

-- ── 11. the private bucket the proof photos live in ─────────────────────────
-- NOT the public `media` bucket: these are a business's premises, handed over
-- as evidence to a stranger who has to check it. A public bucket would make
-- them readable by anybody who guessed the URL. Reads here are signed, and only
-- the organization itself and a platform admin may sign one.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-proof', 'org-proof', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "an organization reads its own proof folder" on storage.objects;
create policy "an organization reads its own proof folder"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'org-proof'
    and (storage.foldername(name))[1] = 'proof'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "admins read every proof folder" on storage.objects;
create policy "admins read every proof folder"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'org-proof' and public.is_platform_admin());

drop policy if exists "an organization writes its own proof folder" on storage.objects;
create policy "an organization writes its own proof folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'org-proof'
    and (storage.foldername(name))[1] = 'proof'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "an organization deletes from its own proof folder" on storage.objects;
create policy "an organization deletes from its own proof folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'org-proof'
    and (storage.foldername(name))[1] = 'proof'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- ── 12. the overview counts the new work ────────────────────────────────────
-- One line added to `waiting` and one to `accounts`: an organization that is
-- verified but has no live subscription cannot create a studio, and nothing
-- else on the panel would tell an admin that.
create or replace function public.admin_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v jsonb;
  v_week timestamptz := now() - interval '7 days';
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin';
  end if;
  select jsonb_build_object(
    'waiting', jsonb_build_object(
      'verifications', (select count(*) from public.org_verification_requests r where r.status = 'pending' and r.deleted_at is null),
      'threads', (select count(*) from public.support_threads t where t.status = 'open' and t.deleted_at is null
                   and exists (select 1 from public.support_messages m where m.thread_id = t.id and m.deleted_at is null
                                and not m.from_admin and m.created_at > coalesce(t.admin_read_at, '-infinity'::timestamptz))),
      'reports', (select count(*) from public.reports r where r.status = 'open' and r.deleted_at is null),
      'subscriptions', (select count(*) from public.profiles p
                         where p.role = 'org' and p.verified_at is not null
                           and p.deleted_at is null and p.suspended_at is null
                           and not exists (select 1 from public.org_plans o
                                            where o.org_id = p.id and o.deleted_at is null
                                              and o.ended_at is null and o.until >= v_today)),
      'refunds', (select count(*) from public.refunds r where r.status in ('requested', 'pending') and r.deleted_at is null),
      'stuck_webhooks', (select count(*) from public.webhook_events w where w.processed_at is null)
    ),
    'accounts', jsonb_build_object(
      'users', (select count(*) from public.profiles p where p.role = 'user' and p.deleted_at is null and p.suspended_at is null),
      'orgs', (select count(*) from public.profiles p where p.role = 'org' and p.deleted_at is null and p.suspended_at is null),
      'artists', (select count(*) from public.artist_plans a where a.ended_at is null and a.until >= v_today),
      'verified_orgs', (select count(*) from public.profiles p where p.role = 'org' and p.verified_at is not null and p.deleted_at is null),
      'subscribed_orgs', (select count(distinct o.org_id) from public.org_plans o
                           where o.deleted_at is null and o.ended_at is null and o.until >= v_today),
      'suspended', (select count(*) from public.profiles p where p.suspended_at is not null and p.deleted_at is null),
      'admins', (select count(*) from public.platform_admins a where a.deleted_at is null),
      'new_this_week', (select count(*) from public.profiles p where p.created_at >= v_week and p.deleted_at is null)
    ),
    'businesses', jsonb_build_object(
      'studios', (select count(*) from public.tenants t where t.type = 'studio' and t.deleted_at is null),
      'artist_pages', (select count(*) from public.tenants t where t.type = 'trainer_business' and t.deleted_at is null),
      'listed', (select count(*) from public.tenants t where t.visibility = 'listed' and t.deleted_at is null),
      'unlisted', (select count(*) from public.tenants t where t.visibility = 'unlisted' and t.deleted_at is null),
      'rooms', (select count(*) from public.rooms r where r.deleted_at is null)
    ),
    'activity', jsonb_build_object(
      'classes_live', (select count(*) from public.classes c where c.status = 'published' and c.deleted_at is null),
      'events_live', (select count(*) from public.events e where e.status = 'published' and e.deleted_at is null),
      'crews', (select count(*) from public.crews c where c.deleted_at is null),
      'bookings_week', (select count(*) from public.enrollments e where e.created_at >= v_week and e.deleted_at is null),
      'event_bookings_week', (select count(*) from public.event_bookings b where b.created_at >= v_week and b.status = 'booked' and b.deleted_at is null),
      'enquiries_open', (select count(*) from public.enquiries e where e.status not in ('won', 'lost') and e.deleted_at is null)
    ),
    'money', jsonb_build_object(
      'captured_week_inr', (select coalesce(sum(pm.amount_inr), 0) from public.payments pm where pm.status = 'captured' and pm.created_at >= v_week and pm.deleted_at is null),
      'captured_all_inr', (select coalesce(sum(pm.amount_inr), 0) from public.payments pm where pm.status = 'captured' and pm.deleted_at is null),
      'refunded_all_inr', (select coalesce(sum(r.amount_inr), 0) from public.refunds r where r.status = 'processed' and r.deleted_at is null),
      'payouts_pending', (select count(*) from public.payouts p where p.status in ('in_transit', 'on_hold') and p.deleted_at is null),
      'orders_unpaid', (select count(*) from public.orders o where o.status = 'created' and o.created_at < now() - interval '1 hour' and o.deleted_at is null)
    )
  ) into v;
  return v;
end;
$$;
comment on function public.admin_dashboard() is
  'The platform pulse for a platform admin: what is waiting on a decision (verifications, conversations, reports, subscriptions to set up, refunds, stuck webhooks), what exists, what moved this week. Aggregate only.';
revoke execute on function public.admin_dashboard() from public, anon;
grant execute on function public.admin_dashboard() to authenticated;
