-- VERIFICATION MOVES TO THE STUDIO, AND A GST NUMBER BECOMES THE ORGANIZATION'S
-- OWN PAPERWORK (11 Sep 2026).
--
-- The user, in their words:
--   "Earlier we were verifying the ORG and uploading images and social media
--    for the org; now instead of social media use GST number. GST verification
--    will be by API — right now bypass, just give a Verify button: if it's in
--    format then verified, else reject.
--    2) If a user doesn't have a GST he can still create a studio but can't
--    create an event.
--    3) The earlier logic of org verification will work for the STUDIO: the
--    user will upload 5-10 images and social media for the studio, then admin
--    will verify the studio, then the studio gets a badge, then it subscribes
--    to go live."
--
-- WHAT THAT MEANS, PRECISELY, AGAINST WHAT IS HERE TODAY:
--
--   * An ORGANIZATION is no longer reviewed by a human at all. It types a
--     GSTIN and presses Verify. Today that is a FORMAT check and nothing more
--     — the government API arrives later and `verify_gstin` is where it will
--     land, keeping this signature. `profiles.gstin_verified_at` is the answer.
--
--   * A STUDIO is what a human reviews now, and it is reviewed exactly the way
--     an organization used to be: 5-10 photos of its space plus its public
--     links, an admin's approve or reject with a reason, and on approval a
--     BADGE — `tenants.verified_at`. The badge is what a subscription then
--     turns into a listing on Discover.
--
--   * THE THREE GATES MOVE:
--       create a studio  — was "your organization must be verified", now only
--                          "you must be an organization". (ask 2)
--       list a studio    — was the OWNER's tick, now the STUDIO's own badge
--                          plus its subscription. (ask 3)
--       create an event  — was nothing beyond being an organization, now the
--                          organization's GST must be verified. (ask 2)
--
-- WHY THE REQUEST TABLE IS EXTENDED RATHER THAN REPLACED: everything hanging
-- off `org_verification_requests` already works and is proven — the RLS pair
-- (an organization reads its own, admins read every one), the not-suspended
-- trigger, the notify trigger, the audit trigger, the support thread that
-- carries `request_id`, and the admin desk's paged queries. A studio request
-- is the same event with one more noun in it, so it gains a nullable
-- `tenant_id`: null means the legacy organization request (kept, so history
-- and already-verified organizations still read true), set means a studio.
-- A second table would have doubled all of that to say the same thing.
--
-- GRANDFATHERING, which this migration must not get wrong:
--   * every studio owned by an organization that is verified TODAY is given
--     the studio badge, so nothing that is live goes dark tonight;
--   * `profiles.verified_at` is left exactly as it is — the organization tick
--     still means "DanceOS checked this organization by hand", it simply is
--     not the thing that lists a studio any more;
--   * no organization is given a GST number it did not type. Already-published
--     events keep running (the new gate is on INSERT, not on what exists), and
--     the next event asks for the number — ten seconds of typing, with the
--     sentence saying so.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. THE ORGANIZATION'S GST NUMBER
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists gstin text,
  add column if not exists gstin_verified_at timestamptz;

comment on column public.profiles.gstin is
  'The organization''s GSTIN, as the register spells it: 15 characters, upper case. Null until it says one. Replaces the social links as the organization''s paperwork (11 Sep 2026).';
comment on column public.profiles.gstin_verified_at is
  'When the GSTIN passed. Today that is a format check (public.gstin_shape); when the government API is wired it will be that answer, and this column will not change meaning.';

/** THE SHAPE OF A GSTIN, as one expression — the same anatomy the TypeScript
 *  in `lib/gst/gstin.ts` enforces, kept here as well because a rule the
 *  database does not know is a rule a direct PATCH can walk past:
 *
 *      27 ABCDE1234F 1 Z 5
 *      │  │          │ │ └ check character
 *      │  │          │ └── always Z
 *      │  │          └──── entity number in the state: 1-9 then A-Z
 *      │  └───────────── the PAN: 5 letters, 4 digits, 1 letter
 *      └──────────────── state code: 01-38, 97 (other territory), 99 (centre)
 *
 *  IMMUTABLE, so a CHECK constraint may use it. */
create or replace function public.gstin_shape(p_gstin text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_gstin is not null
     and p_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
     and (
       substring(p_gstin from 1 for 2) in ('97', '99')
       or (substring(p_gstin from 1 for 2))::integer between 1 and 38
     );
$$;
comment on function public.gstin_shape(text) is
  'Is this the shape of a GSTIN? 15 characters, a real state code, a PAN in the middle, Z in the fourteenth seat. The check character is NOT verified here (see lib/gst/gstin.ts gstinChecksumOk) — the bypass the user asked for is shape-only until the API lands.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_gstin_shape') then
    alter table public.profiles
      add constraint profiles_gstin_shape check (gstin is null or public.gstin_shape(gstin));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_gstin_verified_needs_number') then
    alter table public.profiles
      add constraint profiles_gstin_verified_needs_number check (gstin_verified_at is null or gstin is not null);
  end if;
end;
$$;

/* one GSTIN, one organization — a number typed twice is two businesses claiming
   the same registration, which is the one thing a GSTIN is for */
create unique index if not exists profiles_gstin_idx
  on public.profiles (gstin) where gstin is not null and deleted_at is null;

/** ⚠ THE TICK GUARD DOES NOT COVER THIS COLUMN, AND MUST NOT.
 *  `profiles.verified_at` is DanceOS's to give and a trigger says so. The GST
 *  number is the organization's OWN, and the whole point of the change is that
 *  it needs no admin — so `gstin_verified_at` is written by `verify_gstin`,
 *  which is the only door: the column is not in any UPDATE policy's column
 *  list, and the policy below refuses a hand-written one. */
create or replace function public.guard_gstin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.gstin is distinct from old.gstin or new.gstin_verified_at is distinct from old.gstin_verified_at)
     and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role'
     and not coalesce(current_setting('danceos.gstin_ok', true) = 'on', false) then
    raise exception 'a GST number is set through Verify, not by hand';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_gstin() from public, anon, authenticated;

drop trigger if exists profiles_guard_gstin on public.profiles;
create trigger profiles_guard_gstin
  before update of gstin, gstin_verified_at on public.profiles
  for each row execute function public.guard_gstin();

/** VERIFY MY GST NUMBER. Today: normalise, check the shape, stamp it. The
 *  refusal carries the reason, because "rejected" with no reason is a support
 *  thread waiting to happen.
 *
 *  When the government API is wired, it goes between the shape check and the
 *  stamp — the signature, the grants and every caller stay as they are. */
create or replace function public.verify_gstin(p_gstin text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_clean text;
  v_when timestamptz := now();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select p.role into v_role from public.profiles p where p.id = v_user and p.deleted_at is null;
  if not found then raise exception 'finish onboarding first'; end if;
  if v_role <> 'org' then raise exception 'a GST number belongs to a business — only an organization enters one'; end if;

  /* what somebody types is rarely what the register holds: spaces, lower case,
     a pasted label. Everything that is not a letter or a digit goes. */
  v_clean := upper(regexp_replace(coalesce(p_gstin, ''), '[^0-9A-Za-z]', '', 'g'));

  if v_clean = '' then
    raise exception 'Enter the GST number.';
  end if;
  if char_length(v_clean) <> 15 then
    raise exception 'A GST number is 15 characters — this one is %.', char_length(v_clean);
  end if;
  if not public.gstin_shape(v_clean) then
    raise exception 'That is not the shape of a GST number: 2 digits, a 10-character PAN, an entity code, Z, and a check character — like 27ABCDE1234F1Z5.';
  end if;
  if exists (select 1 from public.profiles p
              where p.gstin = v_clean and p.id <> v_user and p.deleted_at is null) then
    raise exception 'That GST number is already on another DanceOS account.';
  end if;

  perform set_config('danceos.gstin_ok', 'on', true);
  update public.profiles
     set gstin = v_clean, gstin_verified_at = v_when, updated_by = v_user
   where id = v_user;
  perform set_config('danceos.gstin_ok', 'off', true);

  return v_when;
end;
$$;
comment on function public.verify_gstin(text) is
  'The organization verifies its own GST number (11 Sep 2026). FORMAT ONLY for now — the user asked for the API to be bypassed until it is wired, and this function is where it will land. Raises the reason on a refusal.';
revoke execute on function public.verify_gstin(text) from public, anon;
grant execute on function public.verify_gstin(text) to authenticated;

/** Take it off again — a number typed into the wrong account, or a business
 *  that re-registered. The events door closes with it, which is the point. */
create or replace function public.clear_gstin()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  perform set_config('danceos.gstin_ok', 'on', true);
  update public.profiles set gstin = null, gstin_verified_at = null, updated_by = v_user where id = v_user;
  perform set_config('danceos.gstin_ok', 'off', true);
end;
$$;
revoke execute on function public.clear_gstin() from public, anon;
grant execute on function public.clear_gstin() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. THE EVENTS GATE — the sentence, and the door it closes
-- ─────────────────────────────────────────────────────────────────────────────

/** Who owns this business. One row by definition (`tenant_members` with
 *  member_role 'owner'), and the events gate needs it to ask about the
 *  organization behind a studio. */
create or replace function public.tenant_owner(p_tenant_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id from public.tenant_members m
   where m.tenant_id = p_tenant_id and m.member_role = 'owner' and m.deleted_at is null
   limit 1;
$$;
revoke execute on function public.tenant_owner(uuid) from public, anon;
grant execute on function public.tenant_owner(uuid) to authenticated;

/** WHY THIS ORGANIZATION CANNOT PUT ON AN EVENT — null when it can.
 *  The database words the gate and the screen prints the sentence, the way
 *  `why_no_studio` has since 10 Sep 2026. */
create or replace function public.why_no_event(p_org_id uuid default null)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := coalesce(p_org_id, auth.uid());
  v_role text;
  v_gstin text;
  v_ok timestamptz;
begin
  if v_org is null then return 'Sign in first.'; end if;
  select p.role, p.gstin, p.gstin_verified_at into v_role, v_gstin, v_ok
    from public.profiles p where p.id = v_org and p.deleted_at is null;
  if not found then return 'Finish onboarding first.'; end if;
  if v_role <> 'org' then return 'Only an organization puts on an event.'; end if;
  if v_ok is null then
    return case
      when v_gstin is null
        then 'Add your GST number to put on events — it is how DanceOS knows the business behind the ticket. Your studios and classes do not need it.'
      else 'Your GST number has not been verified yet — open it and press Verify.'
    end;
  end if;
  return null;
end;
$$;
comment on function public.why_no_event(uuid) is
  'The one sentence between an organization and an event, or null (11 Sep 2026). A GST number is what an event needs and a studio does not — the user: "if a user doesn''t have a GST he can still create a studio but can''t create an event".';
revoke execute on function public.why_no_event(uuid) from public, anon;
grant execute on function public.why_no_event(uuid) to authenticated;

/** THE DOOR ITSELF, as a trigger rather than inside `save_event`.
 *
 *  Deliberate: `save_event` is a 200-line definer that has been rewritten by
 *  four migrations already, and a fifth copy of it to add one `if` is four
 *  chances to lose a line of it. A BEFORE INSERT trigger gates every way an
 *  event can be created — the RPC, a direct insert, a future importer — and
 *  leaves UPDATE alone, so an event published before tonight keeps its life
 *  and can still be edited. */
create or replace function public.guard_event_needs_gstin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_why text;
begin
  v_why := public.why_no_event(public.tenant_owner(new.tenant_id));
  if v_why is not null then
    raise exception '%', v_why;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_event_needs_gstin() from public, anon, authenticated;

drop trigger if exists events_need_a_verified_gstin on public.events;
create trigger events_need_a_verified_gstin
  before insert on public.events
  for each row execute function public.guard_event_needs_gstin();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. A REQUEST CAN BE ABOUT A STUDIO
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.org_verification_requests
  add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;

comment on column public.org_verification_requests.tenant_id is
  'The studio being reviewed (11 Sep 2026). Null is a legacy ORGANIZATION request, kept so history and already-verified organizations still read true; set is the studio review that replaced it. org_id stays the organization either way — it is who is notified and whose RLS reads the row.';
comment on table public.org_verification_requests is
  'A review DanceOS is asked for. Since 11 Sep 2026 it is a STUDIO that is reviewed — its 5-10 photos and its public links — and approval stamps tenants.verified_at, the badge a subscription then turns into a listing. Rows with a null tenant_id are the organization reviews this replaced.';

/* one open question per studio, and still only one per organization for the
   legacy shape — a partial unique index cannot span "null means one thing",
   so it is two indexes saying one rule */
drop index if exists public.org_verification_requests_one_pending;
create unique index if not exists org_verification_requests_one_pending_org
  on public.org_verification_requests (org_id)
  where status = 'pending' and deleted_at is null and tenant_id is null;
create unique index if not exists org_verification_requests_one_pending_tenant
  on public.org_verification_requests (tenant_id)
  where status = 'pending' and deleted_at is null and tenant_id is not null;
create index if not exists org_verification_requests_tenant_idx
  on public.org_verification_requests (tenant_id) where deleted_at is null;

-- a proof photo can belong to one studio rather than to the organization
alter table public.org_proof_photos
  add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;

comment on column public.org_proof_photos.tenant_id is
  'Which studio this photo shows (11 Sep 2026). Null is a legacy organization photo. The object still lives under proof/{org_id}/… in the private bucket, so every storage policy keeps working untouched.';

create index if not exists org_proof_photos_tenant_idx
  on public.org_proof_photos (tenant_id, sort) where deleted_at is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. A STUDIO SHOWS ITS SPACE
-- ─────────────────────────────────────────────────────────────────────────────

/** Add one photo to a STUDIO's evidence. The path check is the same one the
 *  organization's photos use — the object must be in this account's own folder
 *  — so the bucket's policies need no change at all. */
create or replace function public.add_studio_proof_photo(p_tenant_id uuid, p_path text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_live integer;
  v_id uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if public.tenant_owner(p_tenant_id) is distinct from v_user then
    raise exception 'only the owner shows DanceOS this studio';
  end if;
  if p_path is null or (string_to_array(p_path, '/'))[1] <> 'proof'
     or (string_to_array(p_path, '/'))[2] <> v_user::text then
    raise exception 'that file is not in your own folder';
  end if;
  select count(*) into v_live from public.org_proof_photos
    where tenant_id = p_tenant_id and deleted_at is null;
  if v_live >= 10 then
    raise exception 'ten photos is plenty — remove one first';
  end if;
  insert into public.org_proof_photos (org_id, tenant_id, path, sort, created_by, updated_by)
    values (v_user, p_tenant_id, p_path, v_live, v_user, v_user)
    returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.add_studio_proof_photo(uuid, text) from public, anon;
grant execute on function public.add_studio_proof_photo(uuid, text) to authenticated;

/** ASK DANCEOS TO CHECK THIS STUDIO — the organization's old ask, now per
 *  studio: at least one public link ON THE STUDIO and at least five photos of
 *  it. Idempotent while one is pending, exactly as the organization's was. */
create or replace function public.request_studio_verification(p_tenant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_tenant public.tenants;
  v_photos integer;
  v_id uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_tenant from public.tenants t where t.id = p_tenant_id and t.deleted_at is null;
  if not found then raise exception 'no such studio'; end if;
  if public.tenant_owner(p_tenant_id) is distinct from v_user then
    raise exception 'only the owner asks DanceOS to check this studio';
  end if;
  if v_tenant.verified_at is not null then raise exception 'this studio is already verified'; end if;

  if jsonb_array_length(coalesce(v_tenant.socials, '[]'::jsonb)) = 0 then
    raise exception 'add at least one public link for this studio — DanceOS checks a studio by what it shows the world';
  end if;
  select count(*) into v_photos from public.org_proof_photos
    where tenant_id = p_tenant_id and deleted_at is null;
  if v_photos < 5 then
    raise exception 'add at least 5 photos of this studio — DanceOS checks them alongside your links (% so far)', v_photos;
  end if;

  select r.id into v_id from public.org_verification_requests r
    where r.tenant_id = p_tenant_id and r.status = 'pending' and r.deleted_at is null;
  if found then return v_id; end if;

  insert into public.org_verification_requests (org_id, tenant_id, created_by, updated_by)
    values (v_user, p_tenant_id, v_user, v_user)
    returning id into v_id;
  return v_id;
end;
$$;
comment on function public.request_studio_verification(uuid) is
  'The owner asks DanceOS to verify one studio (11 Sep 2026) — 5-10 photos of the space and at least one public link, which is what an organization used to be asked for.';
revoke execute on function public.request_studio_verification(uuid) from public, anon;
grant execute on function public.request_studio_verification(uuid) to authenticated;

/** THE ADMIN'S ANSWER. Approve stamps the badge — `tenants.verified_at` — and
 *  nothing else: the studio still needs its own subscription to reach
 *  Discover, which is the order the user asked for ("then studio will get
 *  badge, then it will subscribe to go live"). Reject takes the badge off and
 *  says why, in the admin's own words, where the owner will read it. */
create or replace function public.decide_studio_verification(
  p_tenant_id uuid,
  p_approve boolean,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_tenant public.tenants;
  v_owner uuid;
begin
  if v_admin is null then raise exception 'not authenticated'; end if;
  if not public.is_platform_admin() then raise exception 'admins only'; end if;
  if p_note is not null and char_length(p_note) > 300 then raise exception 'a note is at most 300 characters'; end if;
  select * into v_tenant from public.tenants t where t.id = p_tenant_id and t.deleted_at is null;
  if not found then raise exception 'no such studio'; end if;
  v_owner := public.tenant_owner(p_tenant_id);

  update public.org_verification_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         note = p_note,
         decided_at = now(),
         decided_by = v_admin,
         updated_by = v_admin
   where tenant_id = p_tenant_id and status = 'pending' and deleted_at is null;

  if p_approve then
    update public.tenants
       set verified_at = coalesce(verified_at, now()), updated_by = v_admin
     where id = p_tenant_id;
    if v_owner is not null then
      perform public.notify(v_owner, 'people', v_tenant.name || ' is verified',
        coalesce(p_note, 'DanceOS checked your photos and links. Subscribe it to put it on Discover.'),
        '/business');
    end if;
    perform public.log_admin_action('studio.verify', 'tenant', p_tenant_id, v_tenant.name, p_note, '{}'::jsonb);
  else
    update public.tenants
       set verified_at = null, updated_by = v_admin
     where id = p_tenant_id and verified_at is not null;
    if v_owner is not null then
      perform public.notify(v_owner, 'people', v_tenant.name || ' was not approved',
        coalesce(p_note, 'DanceOS could not verify this studio from what it shows. Message DanceOS and we will say what is missing.'),
        '/business');
    end if;
    perform public.log_admin_action('studio.reject', 'tenant', p_tenant_id, v_tenant.name, p_note, '{}'::jsonb);
  end if;
end;
$$;
comment on function public.decide_studio_verification(uuid, boolean, text) is
  'An admin verifies a studio, or does not, with the reason (11 Sep 2026). Approval is the BADGE only — the studio still subscribes to reach Discover.';
revoke execute on function public.decide_studio_verification(uuid, boolean, text) from public, anon;
grant execute on function public.decide_studio_verification(uuid, boolean, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. THE TWO GATES, REWRITTEN
-- ─────────────────────────────────────────────────────────────────────────────

/** MAY I SET UP A STUDIO? Since 11 Sep 2026: yes, if you are an organization.
 *
 *  Everything else this used to ask — five photos, a pending review, a tick —
 *  moved to the studio itself, where it is asked once the studio exists and
 *  has something to show. The user: "if a user doesn't have a GST he can still
 *  create a studio". A studio that nobody has checked is simply a studio that
 *  is not on Discover yet, and `why_no_studio(uuid)` below is the sentence
 *  that says so. */
create or replace function public.why_no_studio()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
begin
  if v_user is null then return 'Sign in first.'; end if;
  select p.role into v_role from public.profiles p where p.id = v_user and p.deleted_at is null;
  if not found then return 'Finish onboarding first.'; end if;
  if v_role <> 'org' then return 'Only an organization can set up a studio.'; end if;
  return null;
end;
$$;
comment on function public.why_no_studio() is
  'The one sentence between an organization and a NEW studio, or null. Since 11 Sep 2026 that is only "are you an organization" — verification moved to the studio, which is reviewed after it exists.';
revoke execute on function public.why_no_studio() from public, anon;
grant execute on function public.why_no_studio() to authenticated;

/** WHY IS THIS STUDIO NOT ON DISCOVER? The order the user asked for, in the
 *  order it is checked: the BADGE first, then the SUBSCRIPTION, then whether
 *  DanceOS has taken it down. */
create or replace function public.why_no_studio(p_tenant_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant public.tenants;
  v_price integer;
  v_photos integer;
  v_pending boolean;
  v_rejected public.org_verification_requests;
  s public.subscriptions;
begin
  select * into v_tenant from public.tenants t where t.id = p_tenant_id and t.deleted_at is null;
  if not found then return 'No such studio.'; end if;
  if v_tenant.type <> 'studio' then return null; end if;

  if v_tenant.verified_at is null then
    select count(*) into v_photos from public.org_proof_photos
      where tenant_id = p_tenant_id and deleted_at is null;
    select exists (select 1 from public.org_verification_requests r
                    where r.tenant_id = p_tenant_id and r.status = 'pending' and r.deleted_at is null)
      into v_pending;
    if v_pending then
      return 'A DanceOS admin is checking this studio. The badge lands, then you subscribe it to Discover.';
    end if;
    select * into v_rejected from public.org_verification_requests r
      where r.tenant_id = p_tenant_id and r.status = 'rejected' and r.deleted_at is null
      order by r.decided_at desc nulls last limit 1;
    if v_rejected.id is not null then
      return coalesce('DanceOS could not verify this studio: ' || v_rejected.note, 'DanceOS could not verify this studio — your notifications say why.');
    end if;
    if jsonb_array_length(coalesce(v_tenant.socials, '[]'::jsonb)) = 0 then
      return 'Add a public link for this studio, and 5 photos of it, then ask DanceOS to verify it.';
    end if;
    if v_photos < 5 then
      return 'DanceOS needs at least 5 photos of this studio before it can verify it — ' || v_photos || ' so far.';
    end if;
    return 'Ask DanceOS to verify this studio — the badge is what a subscription then puts on Discover.';
  end if;

  if not public.studio_plan_active(p_tenant_id) then
    select v.price_inr into v_price from public.plan_catalog v
      where v.plan_key = 'studio_monthly' and v.deleted_at is null limit 1;
    select * into s from public.subscriptions x where x.kind = 'studio' and x.tenant_id = p_tenant_id and x.deleted_at is null
      order by x.created_at desc limit 1;
    if s.id is not null and s.status = 'pending_auth' then
      return 'The subscription was started but not authorised — finish it to put the studio on Discover.';
    end if;
    if s.id is not null and s.current_period_end is not null then
      return 'Its subscription ended on ' || to_char(s.current_period_end, 'FMDD FMMonth') || ' — subscribe again to put the studio back on Discover.';
    end if;
    return 'Each studio has its own subscription' || case when v_price is not null then ' — ₹' || v_price || ' a month, renewing on its own' else '' end || '. Subscribe to put it on Discover.';
  end if;

  if v_tenant.visibility <> 'listed' then
    return 'DanceOS took this studio off Discover — your notifications say why, and Message DanceOS is the door.';
  end if;
  return null;
end;
$$;
comment on function public.why_no_studio(uuid) is
  'Why this studio is not on Discover, or null (11 Sep 2026). Badge, then subscription, then moderation — the order the user asked for: "admin will verify studio, then studio will get badge, then it will subscribe to go live".';
revoke execute on function public.why_no_studio(uuid) from public, anon;
grant execute on function public.why_no_studio(uuid) to authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. GRANDFATHERING — nothing that is live goes dark tonight
-- ─────────────────────────────────────────────────────────────────────────────

/* Every studio owned by an organization DanceOS has already verified by hand
   gets the studio badge. Their subscriptions and their listings are untouched,
   so the only thing that changes for them is that the badge is now on the
   studio, where the new gate looks for it.

   The tick guard refuses a write that is neither the service role nor an
   admin, and a migration is neither — so it is lifted for this one statement
   and put straight back. */
alter table public.tenants disable trigger tenants_guard_verified_at;

update public.tenants t
   set verified_at = coalesce(t.verified_at, now()),
       updated_by = t.updated_by
 where t.deleted_at is null
   and t.verified_at is null
   and exists (
     select 1 from public.tenant_members m
       join public.profiles p on p.id = m.user_id
      where m.tenant_id = t.id and m.member_role = 'owner' and m.deleted_at is null
        and p.verified_at is not null and p.deleted_at is null
   );

alter table public.tenants enable trigger tenants_guard_verified_at;

/* Requests filed under the old model stay exactly as they are: tenant_id null,
   status untouched, notes readable. They are history, and history that still
   reads true is worth more than a tidy table. */
