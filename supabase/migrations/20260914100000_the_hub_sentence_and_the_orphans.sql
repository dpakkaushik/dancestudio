-- THREE THINGS THE FIRST RUN OF THE PROOF FOUND (11 Sep 2026, an hour after
-- 20260914090000 was applied). A migration that has been applied is not edited;
-- it is followed.
--
--   1. `why_no_studio(uuid)` named a column that does not exist —
--      `plan_catalog.plan_key`; the column is `key`. plpgsql resolves column
--      names on first EXECUTION, not at CREATE, so the migration applied
--      cleanly and the error waited for the first badged-but-unsubscribed
--      studio: exactly the state every studio passes through under the new
--      model, and the hub would have 500'd on it. Found by check 8 of
--      scripts/rls-proof-studio-verification.ps1 — which is what proofs are for.
--   2. `verify_gstin` refused a wrong STATE CODE with the generic "not the
--      shape" sentence, because gstin_shape() folds the two checks. The
--      TypeScript beside it says "45 is not a GST state code." The database
--      now says the same — a refusal that names the character is one a person
--      can act on.
--   3. Thirteen studios were on Discover with NO OWNER — test rows whose
--      organizations were deleted by killed runs, the tenant left behind and
--      still listed. Under the old model that was merely untidy; under the new
--      one a listed studio without a badge is a contradiction. Grandfathering
--      badged every studio that had a verified organization behind it; a studio
--      with nobody behind it gets the opposite: it is unlisted. A business is
--      somebody's, or it is not a business.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. the sentence, with the right column names
-- ─────────────────────────────────────────────────────────────────────────────
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
    /* `key` and `active` — the columns plan_catalog actually has */
    select c.price_inr into v_price from public.plan_catalog c
      where c.key = 'studio_monthly' and c.active and c.deleted_at is null limit 1;
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. verify_gstin names the state code when that is what is wrong
-- ─────────────────────────────────────────────────────────────────────────────
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
  v_state text;
  v_when timestamptz := now();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select p.role into v_role from public.profiles p where p.id = v_user and p.deleted_at is null;
  if not found then raise exception 'finish onboarding first'; end if;
  if v_role <> 'org' then raise exception 'a GST number belongs to a business — only an organization enters one'; end if;

  v_clean := upper(regexp_replace(coalesce(p_gstin, ''), '[^0-9A-Za-z]', '', 'g'));

  if v_clean = '' then
    raise exception 'Enter the GST number.';
  end if;
  if char_length(v_clean) <> 15 then
    raise exception 'A GST number is 15 characters — this one is %.', char_length(v_clean);
  end if;
  if v_clean !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then
    raise exception 'That is not the shape of a GST number: 2 digits, a 10-character PAN, an entity code, Z, and a check character — like 27ABCDE1234F1Z5.';
  end if;
  /* the shape is right; is the state real? said on its own, the way the
     TypeScript beside this says it */
  v_state := substring(v_clean from 1 for 2);
  if not public.gstin_shape(v_clean) then
    raise exception '% is not a GST state code.', v_state;
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. a studio with nobody behind it is not on Discover
-- ─────────────────────────────────────────────────────────────────────────────
update public.tenants t
   set visibility = 'unlisted'
 where t.type = 'studio'
   and t.deleted_at is null
   and t.visibility = 'listed'
   and not exists (
     select 1 from public.tenant_members m
       join public.profiles p on p.id = m.user_id
      where m.tenant_id = t.id and m.member_role = 'owner' and m.deleted_at is null and p.deleted_at is null
   );
