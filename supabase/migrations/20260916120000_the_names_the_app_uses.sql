-- ─────────────────────────────────────────────────────────────────────────────
-- THE NAMES THE APP USES (16 Sep 2026)
-- ⚠ Rule 9: this migration renames tables, columns and functions that every RLS
-- policy and every money / auth function stands on. Nothing here changes WHO may
-- do WHAT — only what things are CALLED. Every policy keeps its command, its
-- roles and its decision; every function keeps its body's logic, its SECURITY
-- DEFINER, its search_path and its grants.
--
-- The user, reading the schema: "there is a table tenants — nothing in the app
-- is called a tenant. Use the same nomenclature for tables and columns as the
-- app uses, so it is easy to understand what data is saving where." They were
-- right, and `tenants` was only the loudest case. The rule applied below is:
-- a table is named for what the APP calls the thing it holds, a column for
-- what the row actually stores, and a function for what it does to that thing.
--
-- ── THE MAP ──────────────────────────────────────────────────────────────────
--   tenants                     → businesses        the app's word since Step 2:
--                                                   /business/{id}, BusinessHub,
--                                                   admin_businesses. One word that
--                                                   is true for a studio, an artist
--                                                   page and an organization's own
--                                                   event-hosting row.
--   tenant_members              → business_members
--   tenant_invites              → business_invites
--   *.tenant_id                 → *.business_id     on every table that has one
--   tenants.type 'trainer_business' → 'artist_page'  the app has said "artist"
--                                                   since the Artist plan landed
--   org_verification_requests   → studio_verification_requests
--                                                   since 14 Sep only a STUDIO is
--                                                   reviewed; the name still said org
--   org_proof_photos            → studio_photos     the studio's 5–10 pictures: the
--                                                   evidence an admin checks AND its
--                                                   public header once listed
--   profile_photos              → profile_header_photos
--                                                   a person's header pictures, not
--                                                   their profile picture
--   class_claims                → class_people      "claim" appears nowhere in the
--                                                   app; these are the artist and
--                                                   assistants ASKED onto a class
--                                                   (services/classPeople.ts already
--                                                   called them that)
--   enrollments                 → class_bookings    the app says Book / Booked, and
--                                                   event_bookings already exists
--   *.enrollment_id             → *.class_booking_id
--   city_centroids              → cities            the city registry the map fills
--   plan_catalog                → plans             the price list (/admin/plans)
--   artist_plans                → artist_plans_legacy
--                                                   history since 10 Sep 2026; the
--                                                   name now says so
--   profiles.avatar_path        → profile_photo_path  the app says "Profile picture"
--   tenants.photo_path          → profile_photo_path  the business's, the same way
--   events.cat                  → category          three letters nobody could read;
--                                                   not `kind`, because
--                                                   event_bookings.kind exists and an
--                                                   unqualified `kind` in a join
--                                                   would be ambiguous
--
--   Functions follow their nouns — create_business_with_owner, is_business_member,
--   nearby_businesses, book_class_session, ask_class_person, add_studio_photo,
--   set_my_profile_photo, admin_plans … — plus two whose mechanical name would
--   have been a lie: `tenant_owner_verified` (it reads the STUDIO's badge; the
--   14 Sep migration kept the name to save twelve edits — the edits are free
--   here) becomes business_is_verified, and `set_tenant_photo` becomes
--   set_business_profile_photo. `cancel_booking` (reason + refund, jsonb) and
--   its 4-line wrapper `cancel_enrollment` both stay:
--   cancel_class_booking_with_reason and cancel_class_booking.
--
-- ── WHAT IS DELIBERATELY NOT RENAMED ─────────────────────────────────────────
--   * STORAGE PATHS. `tenants/{id}/…` in the media bucket and `proof/{org}/…` in
--     org-proof are the addresses of objects that already exist. The literal
--     'tenants/' is protected from every rewrite below, in code and in comments.
--   * BUCKET NAMES (media, org-proof) — same reason.
--   * `profiles` — it holds users AND organizations, but "Edit profile" and the
--     Profile tab are the app's own words for it, and it is Supabase's convention.
--   * `business_members.member_role`, `profiles.role`, `businesses.type`,
--     `businesses.visibility`, `leads`, `classes.room` — legible as they are, and
--     generic words that no mechanical rewrite of function text could rename
--     safely. Each gets a COMMENT instead.
--   * `class_bookings.status = 'enrolled'` — a value with a partial unique index
--     predicate behind it; a different class of change from a rename.
--   * `businesses.type = 'org'` — `'org'` is also a `profiles.role` value, so the
--     token is ambiguous in function text; and "the org's own row" reads fine.
--
-- ── HOW ──────────────────────────────────────────────────────────────────────
-- Postgres renames of tables, columns, constraints, indexes and triggers are
-- metadata-only: policies, FKs, index expressions, defaults and comments follow
-- the OID. What does NOT follow is FUNCTION TEXT — a plpgsql body is a string
-- (this repo learned that on the Cashfree rail swap). So every function in
-- `public` is read back out of the catalog with pg_get_functiondef, passed
-- through ONE mapping function, and re-created — the pattern 20260913090000
-- used for 63 policies, for the same reason: a re-typed function is one that can
-- differ from the one it replaced.
--
-- CREATE OR REPLACE keeps the OID (so triggers and policies keep working) but
-- may not rename a PARAMETER or change the RETURNS shape. So a function whose
-- signature changes (`p_tenant_id` → `p_business_id`, or a RETURNS TABLE column)
-- is DROPPED and re-created — with its grants and comment saved first and put
-- back after, because a dropped function's ACL does not come back on its own
-- (Rule 9: a definer RPC re-created with default privileges would be executable
-- by PUBLIC). A function that a policy, trigger, constraint or index DEPENDS on
-- cannot be dropped, so it keeps its parameter names (nobody types them — they
-- are called positionally) and gets only its body rewritten; the migration
-- prints which ones.
--
-- Nothing about a plpgsql body is checked until it RUNS, so a missed rename
-- would surface only as a 42P01 in production. The last block is therefore a
-- LEXICAL GUARD: every function body, every table, column, constraint, index,
-- trigger and policy name, and every comment is scanned for the old tokens, and
-- the migration RAISES — rolling back the whole rename — if one is found.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 0. the map, as one function, so every part of this file spells a name the
--       same way. Dropped at the end.
create or replace function public._dos_rename_text(s text, p_params boolean default true)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if s is null then return null; end if;

  -- contracts that must survive every rewrite: the storage folder prefix, and
  -- the proof scripts' file names where a comment quotes one
  s := replace(s, 'tenants/', '@@SF@@/');
  s := replace(s, 'rls-proof-tenant', '@@RPT@@');

  -- parameter names stay when asked (see HOW above)
  if not p_params then
    s := regexp_replace(s, '\mp_tenant(\w*)\M', '@@PT\1@@', 'g');
    s := regexp_replace(s, '\mp_enrollment_id\M', '@@PE@@', 'g');
    s := regexp_replace(s, '\mp_claim_id\M', '@@PC@@', 'g');
  end if;

  -- names where the mechanical rule would give the wrong answer
  s := replace(s, 'tenant_owner_verified', 'business_is_verified');
  s := replace(s, 'set_tenant_photo', 'set_business_profile_photo');
  s := replace(s, 'cancel_enrollment', 'cancel_class_booking');
  s := regexp_replace(s, '\mcancel_booking\M', 'cancel_class_booking_with_reason', 'g');
  s := replace(s, 'enroll_in_session', 'book_class_session');
  s := replace(s, 'notify_enrollment', 'notify_class_booking');
  s := replace(s, 'claim_person', 'ask_class_person');
  s := replace(s, 'respond_to_claim', 'respond_to_class_ask');
  s := replace(s, 'withdraw_claim', 'withdraw_class_ask');
  s := replace(s, 'set_claim_powers', 'set_class_person_powers');
  s := replace(s, 'set_claim_pay', 'set_class_person_pay');
  s := replace(s, 'notify_class_claim', 'notify_class_person');
  s := replace(s, 'add_studio_proof_photo', 'add_studio_photo');
  s := replace(s, 'remove_org_proof_photo', 'remove_studio_photo');
  s := replace(s, 'set_my_avatar', 'set_my_profile_photo');
  s := replace(s, 'person_avatar_paths', 'person_profile_photo_paths');
  s := replace(s, 'add_my_gallery_photo', 'add_my_header_photo');
  s := replace(s, 'remove_my_gallery_photo', 'remove_my_header_photo');

  -- tenant → business, in every form (plural first, or the singular rule would
  -- leave "businesss")
  s := replace(s, 'tenants', 'businesses');
  s := replace(s, 'tenant', 'business');
  s := replace(s, 'Tenants', 'Businesses');
  s := replace(s, 'Tenant', 'Business');
  s := replace(s, 'TENANTS', 'BUSINESSES');
  s := replace(s, 'TENANT', 'BUSINESS');

  -- the other tables
  s := replace(s, 'org_verification_requests', 'studio_verification_requests');
  s := replace(s, 'org_proof_photos', 'studio_photos');
  s := replace(s, 'audit_org_verification', 'audit_studio_verification');
  s := replace(s, 'notify_org_verification', 'notify_studio_verification');
  s := replace(s, 'profile_photos', 'profile_header_photos');
  s := replace(s, 'class_claims', 'class_people');
  s := replace(s, 'enrollments', 'class_bookings');
  s := replace(s, 'city_centroids', 'cities');
  s := replace(s, 'plan_catalog', 'plans');
  s := regexp_replace(s, 'artist_plans(?!_legacy)', 'artist_plans_legacy', 'g');

  -- columns and values
  s := replace(s, 'enrollment_id', 'class_booking_id');
  s := regexp_replace(s, '\m(\w+)_enrollment\M', '\1_class_booking', 'g');
  s := regexp_replace(s, '\menrollment\M', 'booking', 'g');
  s := replace(s, 'claim_id', 'class_person_id');
  s := regexp_replace(s, '\mphoto_path\M', 'profile_photo_path', 'g');
  s := replace(s, 'avatar_path', 'profile_photo_path');
  s := regexp_replace(s, '\mcat\M', 'category', 'g');
  s := replace(s, 'trainer_business', 'artist_page');

  -- restore the protected pieces
  s := regexp_replace(s, '@@PT(\w*)@@', 'p_tenant\1', 'g');
  s := replace(s, '@@PE@@', 'p_enrollment_id');
  s := replace(s, '@@PC@@', 'p_claim_id');
  s := replace(s, '@@RPT@@', 'rls-proof-tenant');
  s := replace(s, '@@SF@@/', 'tenants/');
  return s;
end;
$$;

-- ── 1. tables ────────────────────────────────────────────────────────────────
do $$
declare r record; v_new text; v_n integer := 0;
begin
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' order by c.relname
  loop
    v_new := public._dos_rename_text(r.relname);
    if v_new <> r.relname then
      execute format('alter table public.%I rename to %I', r.relname, v_new);
      raise notice 'table  %  →  %', r.relname, v_new;
      v_n := v_n + 1;
    end if;
  end loop;
  raise notice '% tables renamed', v_n;
end $$;

-- ── 2. columns ───────────────────────────────────────────────────────────────
do $$
declare r record; v_new text; v_n integer := 0;
begin
  for r in
    select c.relname, a.attname
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
     order by c.relname, a.attnum
  loop
    v_new := public._dos_rename_text(r.attname);
    if v_new <> r.attname then
      execute format('alter table public.%I rename column %I to %I', r.relname, r.attname, v_new);
      v_n := v_n + 1;
    end if;
  end loop;
  raise notice '% columns renamed', v_n;
end $$;

-- ── 3. function NAMES (ALTER … RENAME keeps the OID, so every policy and
--       trigger that calls one keeps working; the bodies are rewritten in 4)
do $$
declare r record; v_new text; v_n integer := 0;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.proname not like '\_dos\_%'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e')
     order by p.proname
  loop
    v_new := public._dos_rename_text(r.proname);
    if v_new <> r.proname then
      execute format('alter function %s rename to %I', r.oid::regprocedure, v_new);
      raise notice 'function  %  →  %', r.proname, v_new;
      v_n := v_n + 1;
    end if;
  end loop;
  raise notice '% functions renamed', v_n;
end $$;

-- ── 4. function BODIES (and signatures where they can move) ──────────────────
do $$
declare
  r record;
  v_def text; v_new text; v_args text; v_ret text; v_sig text; v_comment text;
  v_dep boolean; v_changed_sig boolean;
  v_acl text[]; g text;
  v_replaced integer := 0; v_recreated integer := 0; v_kept_params text[] := '{}';
begin
  for r in
    select p.oid, p.proname, p.proacl
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.proname not like '\_dos\_%'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e')
     order by p.proname
  loop
    v_def  := pg_get_functiondef(r.oid);
    v_args := pg_get_function_arguments(r.oid);
    v_ret  := pg_get_function_result(r.oid);
    v_changed_sig := public._dos_rename_text(v_args) <> v_args
                  or public._dos_rename_text(v_ret)  <> v_ret;
    -- something in the catalog holds this function by OID: a trigger, a policy,
    -- a CHECK, a default, an index expression, another function's default
    v_dep := exists (
      select 1 from pg_depend d
       where d.refobjid = r.oid and d.refclassid = 'pg_proc'::regclass
         and d.classid in ('pg_trigger'::regclass, 'pg_policy'::regclass, 'pg_constraint'::regclass,
                           'pg_attrdef'::regclass, 'pg_rewrite'::regclass, 'pg_class'::regclass, 'pg_proc'::regclass));

    if v_changed_sig and not v_dep then
      -- DROP + CREATE: the signature moves, and the grants and comment go with it
      v_new := public._dos_rename_text(v_def, true);
      v_sig := r.oid::regprocedure::text;
      v_comment := obj_description(r.oid, 'pg_proc');
      v_acl := null;
      if r.proacl is not null then
        select array_agg(format('grant %s on function %%s to %s',
                                a.privilege_type,
                                case when a.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end))
          into v_acl
          from aclexplode(r.proacl) a;
      end if;
      execute 'drop function ' || v_sig;
      execute v_new;
      if r.proacl is not null then
        -- ⚠ the new function arrives with the DATABASE'S default privileges —
        -- on Supabase that is execute to anon, authenticated AND service_role —
        -- not with the ones the old function had. Revoking from `public` alone
        -- left anon able to call 45 authenticated-only RPCs in the dry run. So
        -- every grant it came with is revoked, and exactly the saved set goes back.
        for g in
          select format('revoke %s on function %s from %s', a.privilege_type, v_sig,
                        case when a.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end)
            from pg_proc p2, aclexplode(coalesce(p2.proacl, acldefault('f', p2.proowner))) a
           where p2.oid = to_regprocedure(v_sig)
        loop
          execute g;
        end loop;
        if v_acl is not null then
          foreach g in array v_acl loop execute format(g, v_sig); end loop;
        end if;
      end if;
      if v_comment is not null then
        execute format('comment on function %s is %L', v_sig, public._dos_rename_text(v_comment));
      end if;
      v_recreated := v_recreated + 1;
    else
      -- CREATE OR REPLACE: same OID; parameters keep their names where a
      -- dependent object pins the function in place
      v_new := public._dos_rename_text(v_def, not (v_changed_sig and v_dep));
      if v_changed_sig and v_dep then
        v_kept_params := v_kept_params || r.proname;
      end if;
      if v_new <> v_def then
        execute v_new;
        v_replaced := v_replaced + 1;
      end if;
    end if;
  end loop;
  raise notice '% function bodies rewritten in place, % dropped and re-created with their grants', v_replaced, v_recreated;
  if cardinality(v_kept_params) > 0 then
    raise notice 'kept their parameter names (pinned by a policy/trigger, called positionally): %', array_to_string(v_kept_params, ', ');
  end if;
end $$;

-- ── 5. constraint, index, trigger and policy NAMES ───────────────────────────
do $$
declare r record; v_new text; v_c integer := 0; v_i integer := 0; v_t integer := 0; v_p integer := 0;
begin
  for r in
    select con.conname, con.conrelid::regclass as rel
      from pg_constraint con
     where con.connamespace = 'public'::regnamespace order by con.conname
  loop
    v_new := public._dos_rename_text(r.conname);
    if v_new <> r.conname then
      execute format('alter table %s rename constraint %I to %I', r.rel, r.conname, v_new);
      v_c := v_c + 1;
    end if;
  end loop;
  -- indexes that are not a constraint's (those were renamed with it above)
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'i' order by c.relname
  loop
    v_new := public._dos_rename_text(r.relname);
    if v_new <> r.relname then
      execute format('alter index public.%I rename to %I', r.relname, v_new);
      v_i := v_i + 1;
    end if;
  end loop;
  for r in
    select t.tgname, t.tgrelid::regclass as rel
      from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and not t.tgisinternal order by t.tgname
  loop
    v_new := public._dos_rename_text(r.tgname);
    if v_new <> r.tgname then
      execute format('alter trigger %I on %s rename to %I', r.tgname, r.rel, v_new);
      v_t := v_t + 1;
    end if;
  end loop;
  for r in
    select schemaname, tablename, policyname from pg_policies
     where schemaname = 'public' order by tablename, policyname
  loop
    v_new := public._dos_rename_text(r.policyname);
    if v_new <> r.policyname then
      execute format('alter policy %I on %I.%I rename to %I', r.policyname, r.schemaname, r.tablename, v_new);
      v_p := v_p + 1;
    end if;
  end loop;
  -- storage.objects is Supabase's table; the policies THIS repo wrote there
  -- are renamed where the owner allows it and reported where it does not
  for r in
    select schemaname, tablename, policyname from pg_policies
     where schemaname = 'storage' order by policyname
  loop
    v_new := public._dos_rename_text(r.policyname);
    if v_new <> r.policyname then
      begin
        execute format('alter policy %I on %I.%I rename to %I', r.policyname, r.schemaname, r.tablename, v_new);
        v_p := v_p + 1;
      exception when others then
        raise warning 'left storage policy % alone: %', r.policyname, sqlerrm;
      end;
    end if;
  end loop;
  raise notice '% constraints, % indexes, % triggers, % policies renamed', v_c, v_i, v_t, v_p;
end $$;

-- ── 6. the one VALUE that changes: a business of type trainer_business is an
--       artist page. `guard_business_type` refuses any change of `type` that is
--       not the service role's — a migration over the pooler carries no JWT —
--       so it is stepped around for exactly this statement, and the CHECK that
--       named the old value is replaced.
alter table public.businesses drop constraint businesses_type_check;
alter table public.businesses disable trigger businesses_guard_type;
update public.businesses set type = 'artist_page' where type = 'trainer_business';
alter table public.businesses enable trigger businesses_guard_type;
alter table public.businesses add constraint businesses_type_check
  check (type in ('studio', 'artist_page', 'org'));

-- ── 7. comments follow the OID but their TEXT still says the old names ────────
do $$
declare r record; v_old text; v_new text; v_n integer := 0;
begin
  for r in
    select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
  loop
    v_old := obj_description(r.oid, 'pg_class');
    v_new := public._dos_rename_text(v_old);
    if v_old is not null and v_new <> v_old then
      execute format('comment on table public.%I is %L', r.relname, v_new);
      v_n := v_n + 1;
    end if;
  end loop;
  for r in
    select c.oid, c.relname, a.attnum, a.attname
      from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
  loop
    v_old := col_description(r.oid, r.attnum);
    v_new := public._dos_rename_text(v_old);
    if v_old is not null and v_new <> v_old then
      execute format('comment on column public.%I.%I is %L', r.relname, r.attname, v_new);
      v_n := v_n + 1;
    end if;
  end loop;
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.proname not like '\_dos\_%'
  loop
    v_old := obj_description(r.oid, 'pg_proc');
    v_new := public._dos_rename_text(v_old);
    if v_old is not null and v_new <> v_old then
      execute format('comment on function %s is %L', r.oid::regprocedure, v_new);
      v_n := v_n + 1;
    end if;
  end loop;
  raise notice '% comments re-worded', v_n;
end $$;

-- ── 8. fresh comments on what was renamed — the sentence a reader of the
--       schema gets before opening anything else
comment on table public.businesses is
  'A BUSINESS on DanceOS (renamed from `tenants`, 16 Sep 2026). type: studio (a location an organization runs; needs the badge and its own subscription to be listed) | artist_page (a Pro user''s one public page) | org (an organization''s own row that HOSTS its events — never listed, never on Discover, no public page). visibility listed = on Discover. Writes go through the definer functions only: there is deliberately no update policy.';
comment on column public.businesses.type is
  'studio | artist_page | org. Chosen at creation by create_business_with_owner and never switched (guard_business_type): a studio and an artist page are bought separately.';
comment on column public.businesses.visibility is
  'listed = on Discover and its public page is readable by anyone; unlisted = only its team sees it. A studio is born unlisted; its own subscription lists it.';
comment on column public.businesses.profile_photo_path is
  'The business''s profile picture (the round disc on its pages): a path in the public media bucket under tenants/{business id}/… — the folder keeps its old name because objects already live there. Set by set_business_profile_photo. Null draws the kind''s mark.';
comment on table public.business_members is
  'Who is on a business''s team and as what: member_role owner | trainer | staff. Membership is the spine of every "my businesses" read (RLS is a ceiling, not a scope). Seats are made by create_business_with_owner and accept_business_invite; ended by remove_business_member.';
comment on column public.business_members.member_role is
  'owner | trainer | staff. Owner is never grantable — one owner per business, from creation.';
comment on table public.business_invites is
  'An owner asking a person onto a business''s team, by the EMAIL they sign in with. pending → accepted | declined | revoked. Reached in-app by whoever signs in with that address, or by the /join/{code} link — accepting still demands the email match.';
comment on table public.studio_verification_requests is
  'A STUDIO asking DanceOS for its badge (since 14 Sep 2026 only a studio is reviewed; an organization has a GST number and nothing else). org_id = the organization that runs it; business_id = the studio. business_id null = a legacy organization request, kept as history and never read back.';
comment on table public.studio_photos is
  'A studio''s 5–10 pictures of its space: the evidence an admin reviews for the badge AND, once the studio is listed, its public header pictures. Objects stay in the private org-proof bucket under proof/{org id}/… (the folder keeps its name because objects already live there); a listed studio''s rows are readable by anyone, an unlisted one''s by its team and admins. business_id null = legacy organization proof.';
comment on table public.profile_header_photos is
  'A PERSON''s header pictures — the pictures swiped across the top of their pages above the profile disc. One for a user, ten for an artist (add_my_header_photo caps by artist_plan_active). Objects live under gallery/{user id}/… in the public media bucket.';
comment on column public.profiles.profile_photo_path is
  'The person''s profile picture (the round disc): a path in the public media bucket under avatars/{user id}/… (the folder keeps its name because objects already live there). Set by set_my_profile_photo. Null draws initials.';
comment on table public.class_people is
  'The PEOPLE on a class and their answer (renamed from `class_claims`, 16 Sep 2026): kind artist (who takes it) | assistant, status asked → confirmed | rejected — nobody is put on a class without saying yes. can_attendance / can_refunds are the jobs an assistant may hold; pay_per_session_inr is what the owner pays them a session.';
comment on table public.class_bookings is
  'A person''s seat in a class session (renamed from `enrollments`, 16 Sep 2026): status enrolled | waitlisted | cancelled. One live row per person per session; a priced class books through orders/payments, a free one through book_class_session.';
comment on table public.cities is
  'The city registry the map fills (remember_city; renamed from `city_centroids`): a canonical city name and its centroid. Discover measures a city''s shelf from here, and a business with no pin of its own sits on its city''s point.';
comment on table public.plans is
  'The price list an admin edits at /admin/plans (renamed from `plan_catalog`): key, kind artist | studio, price_inr, the Cashfree plan minted for that price. A subscription snapshots its price, so a change here reaches only new mandates.';
comment on table public.artist_plans_legacy is
  'HISTORY. The pilot-era Artist plan rows, superseded by `subscriptions` on 10 Sep 2026 (every live row was carried over as a granted subscription). Nothing reads this table.';
comment on column public.events.business_id is
  'The HOST: an organization''s own hosting row (businesses.type = org) or an artist page. Never a studio — save_event refuses one; an event belongs to the organization.';
comment on column public.events.category is
  'showcase | battle | tournament (renamed from `cat`, 16 Sep 2026). A showcase is watched (tickets, no public entry); a battle or tournament is entered by format.';

-- ── 9. THE LEXICAL GUARD — nothing about a plpgsql body is checked until it
--       runs, so this is where a missed rename is caught: in the migration,
--       atomically, instead of as a 42P01 on the live site
do $$
declare
  r record;
  v_body text;
  v_bad text[] := '{}';
  -- every old token, as a word or a snake_case piece. `p_tenant…` on a function
  -- pinned by a dependent is the one legitimate survivor and is masked first.
  c_pat constant text :=
    '(tenant|Tenant|TENANT|org_verification_requests|org_proof_photos|\mclass_claims\M|\menrollments?\M|enrollment_id'
    || '|city_centroids|plan_catalog|\mprofile_photos\M|avatar_path|\mphoto_path\M|trainer_business|\mcat\M'
    || '|claim_person|respond_to_claim|withdraw_claim|set_claim_p|enroll_in_session|cancel_enrollment|\mcancel_booking\M'
    || '|gallery_photo|set_my_avatar|person_avatar_paths|add_studio_proof_photo|remove_org_proof_photo)';
begin
  for r in
    select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.proname not like '\_dos\_%'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e')
  loop
    v_body := pg_get_functiondef(r.oid) || coalesce(' ' || obj_description(r.oid, 'pg_proc'), '');
    v_body := replace(v_body, 'tenants/', '');
    v_body := replace(v_body, 'rls-proof-tenant', '');
    v_body := regexp_replace(v_body, '\mp_tenant\w*\M', '', 'g');
    if v_body ~ c_pat then
      v_bad := v_bad || ('function ' || r.proname || ': ' || substring(v_body from c_pat));
    end if;
  end loop;
  for r in
    select 'table ' || c.relname as what from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relname ~ c_pat
    union all
    select 'column ' || c.relname || '.' || a.attname
      from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped and a.attname ~ c_pat
    union all
    select 'constraint ' || conname from pg_constraint where connamespace = 'public'::regnamespace and conname ~ c_pat
    union all
    select 'index ' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'i' and c.relname ~ c_pat
    union all
    select 'trigger ' || t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and not t.tgisinternal and t.tgname ~ c_pat
    union all
    select 'policy ' || policyname from pg_policies where schemaname = 'public' and policyname ~ c_pat
    union all
    -- a table's comment may say what it was renamed FROM — that is the one place
    -- an old name is allowed to stand, and it is stripped before the scan
    select 'comment on ' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and regexp_replace(
             replace(replace(coalesce(obj_description(c.oid, 'pg_class'), ''), 'tenants/', ''), 'rls-proof-tenant', ''),
             'renamed from `[^`]+`', '', 'g') ~ c_pat
  loop
    v_bad := v_bad || r.what;
  end loop;

  if cardinality(v_bad) > 0 then
    raise exception E'the rename is incomplete — rolled back. Old names still live in:\n  %', array_to_string(v_bad, E'\n  ');
  end if;
  raise notice 'lexical guard: no old name survives in any function, table, column, constraint, index, trigger, policy or comment';
end $$;

-- ── 10. done with the map ────────────────────────────────────────────────────
drop function public._dos_rename_text(text, boolean);

-- PostgREST caches the schema; Supabase reloads it on DDL, and this says so
-- explicitly for the same reason the app never trusts a cache it did not ask.
notify pgrst, 'reload schema';
