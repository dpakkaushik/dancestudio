-- Step 6 (Hardening): demo data for LOCAL development only.
--
-- Runs automatically on `supabase db reset` against the LOCAL stack — it is never
-- pushed to the linked cloud project (`supabase db push` applies migrations only).
-- Runs as postgres (superuser), so RLS is bypassed and auth.uid() is null: every
-- row sets created_by/updated_by explicitly.
--
-- Cast (per CLAUDE.md: 1 studio, 1 trainer business, a few learners):
--   Priya Nair   → owns  Tandav Dance Academy   (studio, Pune)
--   Meera Rao    → owns  Meera Rao Dance Company (trainer_business, Mumbai)
--   Aarav Shah, Zoya Khan (Pune), Ishaan Verma (Mumbai) → learners
--
-- Sign in locally with any seeded email — the magic link lands in Inbucket
-- (http://localhost:54324). A bcrypt password ('DanceOS-demo-1') is also set in
-- case a password flow ever appears; the app itself is OTP/magic-link only.

-- ---------------------------------------------------------------- auth users --
-- Fixed UUIDs so re-running is idempotent and rows can reference each other.
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change_token_new, email_change)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
  u.email, extensions.crypt('DanceOS-demo-1', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
  '', '', '', ''
from (values
  ('00000000-0000-4000-8000-000000000001'::uuid, 'priya@seed.danceos.in'),
  ('00000000-0000-4000-8000-000000000002'::uuid, 'meera@seed.danceos.in'),
  ('00000000-0000-4000-8000-000000000011'::uuid, 'aarav@seed.danceos.in'),
  ('00000000-0000-4000-8000-000000000012'::uuid, 'zoya@seed.danceos.in'),
  ('00000000-0000-4000-8000-000000000013'::uuid, 'ishaan@seed.danceos.in')
) as u (id, email)
on conflict (id) do nothing;

-- GoTrue expects an identity row per email user
insert into auth.identities
  (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  gen_random_uuid(), u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.email like '%@seed.danceos.in'
on conflict (provider_id, provider) do nothing;

-- ------------------------------------------------------------------ profiles --
insert into public.profiles (id, full_name, role, city, created_by, updated_by)
values
  ('00000000-0000-4000-8000-000000000001', 'Priya Nair',   'studio',  'Pune',   '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002', 'Meera Rao',    'trainer', 'Mumbai', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000011', 'Aarav Shah',   'dancer',  'Pune',   '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000012', 'Zoya Khan',    'dancer',  'Pune',   '00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000012'),
  ('00000000-0000-4000-8000-000000000013', 'Ishaan Verma', 'dancer',  'Mumbai', '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000013')
on conflict (id) do nothing;

-- ------------------------------------------------------------------- tenants --
-- Coordinates come from city_centroids (same source create_tenant_with_owner uses).
insert into public.tenants (id, type, name, area, city, lat, lng, visibility, created_by, updated_by)
select '00000000-0000-4000-8000-000000000101', 'studio', 'Tandav Dance Academy',
       'Koregaon Park', c.city, c.lat, c.lng, 'listed',
       '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'
from public.city_centroids c where c.city = 'Pune'
on conflict (id) do nothing;

insert into public.tenants (id, type, name, area, city, lat, lng, visibility, created_by, updated_by)
select '00000000-0000-4000-8000-000000000102', 'trainer_business', 'Meera Rao Dance Company',
       'Bandra West', c.city, c.lat, c.lng, 'listed',
       '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002'
from public.city_centroids c where c.city = 'Mumbai'
on conflict (id) do nothing;

insert into public.tenant_members (id, tenant_id, user_id, member_role, created_by, updated_by)
values
  ('00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-000000000101',
   '00000000-0000-4000-8000-000000000001', 'owner',
   '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000112', '00000000-0000-4000-8000-000000000102',
   '00000000-0000-4000-8000-000000000002', 'owner',
   '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

-- ------------------------------------------------------------------- classes --
-- capacity 2 on the Bollywood class on purpose: with 2 enrolled + 1 waitlisted
-- below, the seed demos "Class full" and the waitlist UI out of the box.
insert into public.classes (id, tenant_id, title, style, level, room, price_inr, capacity, status, created_by, updated_by)
values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101',
   'Bolly Blast — Beginners', 'Bollywood', 'beginner', 'Studio A', 299, 2, 'published',
   '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000101',
   'Hip-Hop Foundations', 'Hip-Hop', 'all', null, 349, 16, 'draft',
   '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000102',
   'Kathak Essentials', 'Kathak', 'intermediate', null, 499, 12, 'published',
   '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

-- Sessions sit in the future relative to the reset: evenings two/three days out.
-- 12:30 UTC = 18:00 IST — the timestamps read as evening classes in the app.
insert into public.class_sessions (id, class_id, tenant_id, starts_at, ends_at, created_by, updated_by)
values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201',
   '00000000-0000-4000-8000-000000000101',
   date_trunc('day', now()) + interval '2 days 12 hours 30 minutes',
   date_trunc('day', now()) + interval '2 days 14 hours',
   '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000202',
   '00000000-0000-4000-8000-000000000101',
   date_trunc('day', now()) + interval '3 days 12 hours 30 minutes',
   date_trunc('day', now()) + interval '3 days 14 hours',
   '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000203',
   '00000000-0000-4000-8000-000000000102',
   date_trunc('day', now()) + interval '3 days 13 hours 30 minutes',
   date_trunc('day', now()) + interval '3 days 15 hours',
   '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

-- --------------------------------------------------------------- enrollments --
-- Statuses respect the same invariants the enroll_in_session RPC enforces:
-- Bollywood (capacity 2) holds exactly 2 enrolled, so Ishaan is waitlisted.
-- Staggered created_at keeps the waitlist promotion order deterministic.
insert into public.enrollments (id, session_id, class_id, tenant_id, user_id, status, created_at, created_by, updated_by)
values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000301',
   '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101',
   '00000000-0000-4000-8000-000000000011', 'enrolled',   now() - interval '3 hours',
   '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000301',
   '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101',
   '00000000-0000-4000-8000-000000000012', 'enrolled',   now() - interval '2 hours',
   '00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000012'),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000301',
   '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101',
   '00000000-0000-4000-8000-000000000013', 'waitlisted', now() - interval '1 hour',
   '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000013'),
  ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-000000000303',
   '00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000102',
   '00000000-0000-4000-8000-000000000013', 'enrolled',   now() - interval '1 hour',
   '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000013')
on conflict (id) do nothing;
