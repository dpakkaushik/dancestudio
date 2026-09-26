-- PAY AT CREATION, VERIFY AFTER (27 Sep 2026)
--
-- The user's item 8: *"payment before adding organization and studio and add
-- mmultiple option after paying seprately for each and renewals handled inside
-- subscription from there home afterwards"* — and, asked which of three orders
-- they meant, they chose **"Pay at creation, verify after"**.
--
-- ⚠ MONEY (Rule 9). What moves is WHEN somebody may pay, and nothing else.
--
-- WHAT IS ALREADY TRUE, so it is not touched:
--   · each studio and each organization has its OWN mandate, and a person may
--     open several — "multiple, paid separately for each" (26 Sep, R47/R48);
--   · renewals are the Subscription tile on that business's own home (C60);
--   · **VERIFICATION STILL DECIDES WHETHER IT IS PUBLIC.**
--     `guard_business_visibility` refuses `listed` without the badge AND a live
--     plan; `org_is_public` is the GST number AND a live mandate. Neither
--     changes, so paying early buys the mandate and never the audience.
--
-- WHAT WAS IN THE WAY — two refusals inside `subscribe`, and only those two:
--
--     if not public.business_is_verified(p_business_id) then
--       raise exception 'DanceOS has not verified this studio yet — the badge
--                        comes first, then the subscription puts it on Discover';
--     ...
--     if ... gstin_verified_at is null then
--       raise exception 'verify the organization''s GST number first — then the
--                        subscription puts it in front of the public';
--
-- ⚠⚠ AND THE REST OF THE DATABASE WAS ALREADY BUILT FOR THIS ORDER, which is
-- what makes the change two deletions rather than a rewrite:
--   · `decide_studio_verification` already says *"a studio that was already
--     subscribed while it waited … goes on Discover the moment the badge lands"*
--     and lists it if `studio_plan_active` — so a paid studio does not sit dark
--     after being approved;
--   · the authorisation webhook's listing branch already carries
--     `and public.business_is_verified(t.id)`, so a paid-but-unverified studio
--     is NOT listed when the mandate goes live;
--   · `org_is_public` is a FUNCTION, read live, so an organization that paid
--     first becomes public the instant its GST number is verified, with no flip
--     to perform.
--
-- ⚠ WHAT THIS COSTS, said plainly: somebody can now pay for a studio DanceOS
-- then refuses to verify. There is no automatic refund — `admin_end_subscription`
-- ends it with a reason the owner reads, and the money already taken is a
-- Cashfree refund somebody makes by hand. That is a real consequence of the
-- order the user chose, and it is written here rather than discovered later.

begin;

create or replace function public.subscribe(p_plan_key text, p_business_id uuid default null::uuid)
returns public.subscriptions
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_plan public.plans;
  v_row public.subscriptions;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select p.role into v_role
    from public.profiles p where p.id = v_user and p.deleted_at is null;
  if not found then raise exception 'finish onboarding first'; end if;
  if exists (select 1 from public.profiles p where p.id = v_user and p.suspended_at is not null) then
    raise exception 'this account is suspended — write to DanceOS from your hub';
  end if;
  select * into v_plan from public.plans c where c.key = p_plan_key and c.active and c.deleted_at is null;
  if not found then raise exception 'that plan is not on offer'; end if;
  if v_plan.price_inr <= 0 then
    raise exception 'this plan is free right now — take it with Start, there is nothing to pay';
  end if;

  if v_plan.kind = 'artist' then
    if v_role <> 'user' then raise exception 'the Artist plan is a person''s — an organization subscribes its studios'; end if;
    if p_business_id is not null then raise exception 'an artist plan is not for a studio'; end if;
  elsif v_plan.kind = 'org' then
    -- 26 Sep 2026: an ORGANIZATION's own mandate — its owner's to set up.
    -- ⚠ 27 Sep 2026: the GST refusal is GONE. Paying first is the user's chosen
    -- order; `org_is_public` still needs the verified number, so what this buys
    -- is the mandate and never the audience.
    if p_business_id is null then raise exception 'which organization is this for?'; end if;
    if not exists (select 1 from public.businesses t where t.id = p_business_id and t.type = 'org' and t.deleted_at is null) then
      raise exception 'no such organization';
    end if;
    if not public.is_business_owner(p_business_id) then raise exception 'that organization is not yours to subscribe'; end if;
  else
    if p_business_id is null then raise exception 'which studio is this for?'; end if;
    if not exists (select 1 from public.businesses t where t.id = p_business_id and t.type = 'studio' and t.deleted_at is null) then
      raise exception 'no such studio';
    end if;
    if not exists (select 1 from public.business_members m
                    where m.business_id = p_business_id and m.user_id = v_user and m.member_role = 'owner' and m.deleted_at is null) then
      raise exception 'that studio is not yours to subscribe';
    end if;
    -- ⚠ 27 Sep 2026: the badge refusal is GONE, for the same reason.
    -- `guard_business_visibility` and the webhook's own listing branch both
    -- still test `business_is_verified`, and `decide_studio_verification` lists
    -- a studio that paid while it waited — so Discover is unchanged.
  end if;

  -- the live row for this subject, if there is one
  select * into v_row from public.subscriptions s
   where s.kind = v_plan.kind and s.deleted_at is null and s.status <> 'expired'
     and ((v_plan.kind = 'artist' and s.user_id = v_user) or (v_plan.kind in ('studio', 'org') and s.business_id = p_business_id))
   limit 1;
  if found then
    if v_row.status = 'pending_auth' then
      -- an earlier attempt that was never authorised: reuse the row, new provider id
      update public.subscriptions s
         set plan_key = v_plan.key, price_inr = v_plan.price_inr, period = v_plan.period,
             attempt = s.attempt + 1, provider_subscription_id = null, cf_subscription_id = null,
             provider_status = null, auth_status = null, updated_by = v_user
       where s.id = v_row.id
       returning * into v_row;
      return v_row;
    end if;
    if v_row.granted then
      raise exception 'DanceOS granted this until % — you can set up payment once that period ends', to_char(v_row.current_period_end, 'FMDD FMMonth YYYY');
    end if;
    if v_row.status = 'canceled' or v_row.cancel_at_period_end then
      raise exception 'this subscription runs until % and then stops — subscribe again after that', to_char(v_row.current_period_end, 'FMDD FMMonth YYYY');
    end if;
    raise exception 'already subscribed — it renews on its own until you cancel';
  end if;

  insert into public.subscriptions (kind, user_id, business_id, plan_key, price_inr, period, status, created_by, updated_by)
  values (v_plan.kind, v_user, p_business_id, v_plan.key, v_plan.price_inr, v_plan.period, 'pending_auth', v_user, v_user)
  returning * into v_row;
  return v_row;
end;
$function$;

comment on function public.subscribe(text, uuid) is
  'Starts a mandate: the Artist plan for a person, or one business''s own. Since 27 Sep 2026 it does NOT require verification first — paying is allowed at creation and the badge (a studio) or the GST number (an organization) is what decides whether the business is ever public.';

-- ⚠ AND THE SENTENCE AN APPROVED STUDIO READS HAS TO STOP ASSUMING IT HAS NOT
-- PAID. "Subscribe it to put it on Discover" is now wrong for the commonest
-- case — a studio that paid on the way in — and the one thing an owner reads
-- after waiting for a stranger's decision should not tell them to do something
-- they have already done.
create or replace function public.decide_studio_verification(p_business_id uuid, p_approve boolean, p_note text default null::text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_admin uuid := auth.uid();
  v_business public.businesses;
  v_owner uuid;
  v_live boolean;
begin
  if v_admin is null then raise exception 'not authenticated'; end if;
  if not public.is_platform_admin() then raise exception 'admins only'; end if;
  if p_note is not null and char_length(p_note) > 300 then raise exception 'a note is at most 300 characters'; end if;
  select * into v_business from public.businesses t where t.id = p_business_id and t.deleted_at is null;
  if not found then raise exception 'no such studio'; end if;
  v_owner := public.business_owner(p_business_id);

  update public.studio_verification_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         note = p_note,
         decided_at = now(),
         decided_by = v_admin,
         updated_by = v_admin
   where business_id = p_business_id and status = 'pending' and deleted_at is null;

  if p_approve then
    update public.businesses
       set verified_at = coalesce(verified_at, now()), updated_by = v_admin
     where id = p_business_id;
    /* a studio that was already subscribed while it waited — a grant, or a
       mandate that went through — goes on Discover the moment the badge lands;
       the visibility guard below admits it because both halves are now true */
    v_live := public.studio_plan_active(p_business_id);
    if v_live then
      update public.businesses set visibility = 'listed', updated_by = v_admin
       where id = p_business_id and visibility = 'unlisted' and deleted_at is null;
    end if;
    if v_owner is not null then
      perform public.notify(v_owner, 'people', v_business.name || ' is verified',
        coalesce(p_note, case when v_live
                              then 'DanceOS checked your photos and links. It is on Discover now — nothing else to do.'
                              else 'DanceOS checked your photos and links. Subscribe it to put it on Discover.' end),
        '/business');
    end if;
    perform public.log_admin_action('studio.verify', 'business', p_business_id, v_business.name, p_note, '{}'::jsonb);
  else
    update public.businesses
       set verified_at = null, updated_by = v_admin
     where id = p_business_id and verified_at is not null;
    if v_owner is not null then
      perform public.notify(v_owner, 'people', v_business.name || ' was not approved',
        coalesce(p_note, 'DanceOS could not verify this studio from what it shows. Message DanceOS and we will say what is missing.'),
        '/business');
    end if;
    perform public.log_admin_action('studio.reject', 'business', p_business_id, v_business.name, p_note, '{}'::jsonb);
  end if;
end;
$function$;

commit;
