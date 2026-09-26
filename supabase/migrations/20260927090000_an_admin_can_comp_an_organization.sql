-- AN ADMIN CAN COMP AND END AN ORGANIZATION'S MANDATE (27 Sep 2026)
--
-- The user's answer to "pending at your end", item 6: "fix".
--
-- 26 Sep 2026 made an organization a BUSINESS with its own ₹5,000 mandate
-- (`org_monthly`), and `subscribe` learned the third kind that day. The two
-- ADMIN doors did not:
--
--   · `admin_grant_subscription` knows 'studio' and 'artist' and raises
--     "a plan is artist or studio" for anything else — so DanceOS cannot put an
--     organization live without taking money, which is exactly what a grant is
--     for (every studio and artist plan on production today is a granted one).
--     The Businesses desk says so in a sentence where the button would be.
--   · `admin_end_subscription` is worse than missing: its `else` branch assumes
--     ARTIST, so ending an organization's mandate would notify its owner "Your
--     Artist plan has ended", lock nothing, and log `plan.end` against a
--     PROFILE id that is a business id. A wrong audit row about money is the
--     kind this file exists to stop.
--
-- ⚠ MONEY + ADMIN AUTHORITY (Rule 9). Both functions are `create or replace`d
-- with their signatures UNCHANGED, so no grant moves and no ACL is restated —
-- the 16 Sep lesson (a re-created function comes back with Supabase's own
-- defaults) is avoided by never dropping one.
--
-- ⚠⚠ AND AN ORGANIZATION IS NEVER `listed`. A studio's grant flips
-- `visibility` to 'listed' because that column IS what puts a studio on
-- Discover. An organization's row is unlisted for ever and its public face is
-- `org_is_public` — the GST number AND a live mandate — so the org branch
-- touches visibility NOT AT ALL. Writing 'listed' there would be a column that
-- means nothing on that row today and a trap the first time somebody reads it
-- as meaning something.

begin;

create or replace function public.admin_grant_subscription(p_kind text, p_subject_id uuid, p_months integer, p_note text default null::text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  s public.subscriptions;
  v_user uuid;
  v_business uuid;
  v_label text;
  v_key text;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_start date;
  v_end date;
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  if p_months is null or p_months < 1 or p_months > 36 then raise exception 'between one month and three years'; end if;
  if p_kind = 'studio' then
    select m.user_id, t.name into v_user, v_label from public.businesses t
      join public.business_members m on m.business_id = t.id and m.member_role = 'owner' and m.deleted_at is null
     where t.id = p_subject_id and t.type = 'studio' and t.deleted_at is null limit 1;
    if v_user is null then raise exception 'no such studio, or it has no owner'; end if;
    v_business := p_subject_id; v_key := 'studio_monthly';
  elsif p_kind = 'org' then
    -- 27 Sep 2026: the same shape as a studio's, against the org business row
    select m.user_id, t.name into v_user, v_label from public.businesses t
      join public.business_members m on m.business_id = t.id and m.member_role = 'owner' and m.deleted_at is null
     where t.id = p_subject_id and t.type = 'org' and t.deleted_at is null limit 1;
    if v_user is null then raise exception 'no such organization, or it has no owner'; end if;
    v_business := p_subject_id; v_key := 'org_monthly';
  elsif p_kind = 'artist' then
    select p.full_name into v_label from public.profiles p where p.id = p_subject_id and p.role = 'user' and p.deleted_at is null;
    if v_label is null then raise exception 'the Artist plan is a person''s'; end if;
    v_user := p_subject_id; v_business := null; v_key := 'artist_monthly';
  else
    raise exception 'a plan is artist, studio or organization';
  end if;

  -- ⚠ the existing-row lookup has to admit the third kind too, or a grant on an
  -- organization that already has a mandate would INSERT a second live row past
  -- the partial unique index rather than extending the one it has
  select * into s from public.subscriptions x
   where x.kind = p_kind and x.deleted_at is null and x.status <> 'expired'
     and ((p_kind = 'artist' and x.user_id = v_user) or (p_kind in ('studio', 'org') and x.business_id = v_business))
   limit 1 for update;
  if found and s.status <> 'pending_auth' then
    -- extend from where the current period ends, never sooner
    v_start := greatest(coalesce(s.current_period_end, v_today), v_today);
    v_end := (v_start + (p_months || ' months')::interval)::date;
    update public.subscriptions
       set current_period_end = v_end, status = 'active', failure_reason = null,
           note = coalesce(p_note, note), granted_by = auth.uid(), updated_by = auth.uid()
     where id = s.id;
  else
    if found then
      -- an unauthorised attempt gives way to the grant
      update public.subscriptions set status = 'expired', updated_by = auth.uid() where id = s.id;
    end if;
    v_start := v_today;
    v_end := (v_today + (p_months || ' months')::interval)::date;
    insert into public.subscriptions (kind, user_id, business_id, plan_key, price_inr, period, status,
                                      current_period_start, current_period_end, granted, granted_by, note, created_by, updated_by)
    values (p_kind, v_user, v_business, v_key, 0, 'monthly', 'active', v_start, v_end, true, auth.uid(), p_note, v_user, v_user);
  end if;

  if p_kind = 'studio' then
    update public.businesses t set visibility = 'listed', updated_by = auth.uid()
     where t.id = v_business and t.visibility = 'unlisted' and t.deleted_at is null and public.business_is_verified(t.id);
    perform public.notify(v_user, 'money', v_label || ' is subscribed',
      'DanceOS set it up until ' || to_char(v_end, 'FMDD FMMonth YYYY') || ' — nothing was charged. It is on Discover now.', '/business');
    perform public.log_admin_action('subscription.grant', 'business', v_business, v_label, p_note,
      jsonb_build_object('months', p_months, 'until', v_end, 'amount_inr', 0));
  elsif p_kind = 'org' then
    -- ⚠ NO VISIBILITY WRITE: `org_is_public` is the organization's public face,
    -- and it reads the GST number and this mandate. The sentence says which of
    -- the two is still missing rather than claiming the page is up.
    perform public.notify(v_user, 'money', v_label || ' is subscribed',
      'DanceOS set it up until ' || to_char(v_end, 'FMDD FMMonth YYYY') || ' — nothing was charged.'
        || case when public.org_is_public(v_business) then ' Its page and its events are public now.'
                else ' Verify its GST number and its page goes public.' end, '/organizations');
    perform public.log_admin_action('subscription.grant', 'business', v_business, v_label, p_note,
      jsonb_build_object('months', p_months, 'until', v_end, 'amount_inr', 0));
  else
    perform public.notify(v_user, 'money', 'Artist tools are on',
      'DanceOS switched them on until ' || to_char(v_end, 'FMDD FMMonth YYYY') || ' — nothing was charged.', '/subscription');
    perform public.log_admin_action('plan.grant', 'profile', v_user, v_label, p_note,
      jsonb_build_object('months', p_months, 'until', v_end, 'amount_inr', 0));
  end if;
end;
$function$;

comment on function public.admin_grant_subscription(text, uuid, integer, text) is
  'A platform admin comps a subscription: artist (a person), studio (a business, which it also lists) or org (a business, whose public face is org_is_public). Nothing is charged; the row is granted and does not renew.';

create or replace function public.admin_end_subscription(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  s public.subscriptions;
  v_label text;
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'say why in a sentence — they read it, and so does the log';
  end if;
  select * into s from public.subscriptions x where x.id = p_id and x.deleted_at is null for update;
  if not found then raise exception 'no such subscription'; end if;
  if s.status = 'expired' then raise exception 'that subscription has already ended'; end if;
  update public.subscriptions set status = 'expired', cancel_at_period_end = true, updated_by = auth.uid() where id = s.id;
  if s.kind = 'studio' then
    select t.name into v_label from public.businesses t where t.id = s.business_id;
    update public.businesses t set visibility = 'unlisted', updated_by = auth.uid() where t.id = s.business_id and t.visibility = 'listed';
    perform public.notify(s.user_id, 'money', coalesce(v_label, 'Your studio') || '''s subscription has ended',
      btrim(p_reason) || ' — the studio is off Discover until it is subscribed again. Nothing in it is lost.', '/business');
    perform public.log_admin_action('subscription.end', 'business', s.business_id, v_label, p_reason, jsonb_build_object('subscription_id', s.id));
  elsif s.kind = 'org' then
    -- ⚠ 27 Sep 2026: this fell through to the ARTIST branch before, so ending an
    -- organization's mandate told its owner their Artist plan had ended and
    -- logged `plan.end` against a business id in the profile slot.
    select t.name into v_label from public.businesses t where t.id = s.business_id;
    perform public.notify(s.user_id, 'money', coalesce(v_label, 'Your organization') || '''s subscription has ended',
      btrim(p_reason) || ' — its page and its events are private until it is subscribed again. Nothing in it is lost.', '/organizations');
    perform public.log_admin_action('subscription.end', 'business', s.business_id, v_label, p_reason, jsonb_build_object('subscription_id', s.id));
  else
    select p.full_name into v_label from public.profiles p where p.id = s.user_id;
    perform public.notify(s.user_id, 'money', 'Your Artist plan has ended',
      btrim(p_reason) || ' — the artist tools are locked; your profile stays.', '/subscription');
    perform public.log_admin_action('plan.end', 'profile', s.user_id, v_label, p_reason, jsonb_build_object('subscription_id', s.id));
  end if;
end;
$function$;

comment on function public.admin_end_subscription(uuid, text) is
  'A platform admin ends a subscription with a reason the owner reads. A studio also comes off Discover; an organization''s page and events go private through org_is_public; an artist''s tools lock.';

-- ── AND ONE DEAD FUNCTION GOES ────────────────────────────────────────────────
-- `admin_org_standing(uuid[])` answers only `where p.role = 'org'`, and 26 Sep
-- retired that role: `profiles.role` is 'user' for everybody, so it has
-- returned the empty set for every caller since, for ever. Its last caller went
-- the same day (`ownerStandingOf` does the arithmetic over `admin_businesses`).
-- A function nobody can get an answer from is where a defect hides — this file's
-- own rule about branches nothing renders, one level down.
drop function if exists public.admin_org_standing(uuid[]);

commit;
