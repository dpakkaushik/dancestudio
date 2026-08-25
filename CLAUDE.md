# CLAUDE.md — DanceOS

## What this repo is

DanceOS: an app for dance studios and dancers — class management, bookings, crews,
events, discovery. Two things live here:

1. **`prototype/`** — a complete, tested frontend prototype (the product specification)
2. **Repo root** — the real app being built from it: Next.js + Supabase, multi-tenant

## The prototype (`prototype/` — reference only, do not edit)

- `DanceOSApp.jsx` (19,399 lines) — the entire app as one React file. 127 screens,
  all flows working. **This is the product spec**: when building a real feature,
  open the matching prototype screen and match its behavior.
- `DanceOS.html` — self-contained build of the JSX. Double-click to preview locally.
  (The `build.sh` that compiles JSX → HTML is NOT in this repo; don't edit the HTML.)
- `D4-START-HERE.md` / `REVIEW-D3.md` — the prototype's status and review docs
  (16 Aug 2026): 13 Playwright suites green, 22/22 poison boots, all product
  decisions documented there.
- The prototype has **no backend**: all data lives in browser localStorage via
  `dosStorage` (`__DOSACCOUNT`, `__DOSACTIVESTUDIO`, `__DOSEVENTS`, `__DOSBOOKED`,
  `__DOSLINKS`, …). These storage shapes are the source material for the real
  database schema. UI-only keys (`__DOSTHEME`, `__DOSNAV`, `__DOSTAB`) stay client-side.

## Build plan (approved 18 Aug 2026) — the single source of truth

Goal: turn the prototype into a scalable multi-tenant app serving many studios
pan-India. The prototype's `__DOS*` localStorage shapes are the source material
for the database schema. **The UI is not redesigned** — see Rule 2.

### Progress tracker — update after EVERY push (Rule 11)

- **Completed: 13 / 27 steps** (Steps 0–12). Step 12 landed 25 Aug 2026: the
  Studio CRM — a `leads` desk at /business/{id}/students with the prototype's own
  five stages (New · Quoted · Trial · Won · Lost), the open/enrolled funnel, and
  trials agreed against a real class **without faking an enrollment** (a learner
  still books their own seat). Leads are private: no public policy exists on the
  table at all. **Staff invites did NOT ship with it** — see the backlog; the
  claim pickers still only offer people already on the team. Ops open as before:
  Razorpay keys, Resend domain, pilot invites.
- Step 11 landed 25 Aug 2026: rooms &
  people — `rooms` (capacity caps the class, amenities, no double-booking) and
  `class_claims` (artist/assistant with real two-sided consent and the
  attendance/refunds jobs), `room_id` + `poster` on classes, the rooms manager at
  /business/{id}/rooms, the class form as the prototype's **two-step wizard**
  (basics + room → people, price, poster), and the class page's artist column,
  CLASS ASSISTANTS, room amenities and "you've been asked" card. An assistant
  holding attendance now gets the register. Ops still open: Razorpay account +
  keys (paid classes say "payments aren't switched on yet" until then), verify a
  Resend sending domain, invite pilots.
- **Live:** https://dancestudio-orcin.vercel.app (auto-deploys `main`)
- **Next: Step 12b — staff invites** (invite by mobile → they accept → a
  tenant_members row; unblocks the class form's people pickers), then Step 13 —
  earnings & payouts ⚠

| Step | Slice | Status |
|------|-------|--------|
| 0 | Foundations: repo restructure, Next.js scaffold, CI | ✅ done (commit 817d01a) |
| 1 | Auth + identity (mobile-OTP login) | ✅ done (18 Aug 2026) |
| 2 | Tenant onboarding | ✅ done (18 Aug 2026) |
| 3 | Classes | ✅ done (19 Aug 2026) |
| 4 | Enrollment | ✅ done (24 Aug 2026) |
| 5 | Discovery ("near me") | ✅ done (24 Aug 2026) |
| 6 | Hardening & pilot | ✅ done (24 Aug 2026) — pending ops: Resend domain, pilot invites |
| 7 | App chrome + Home parity | ✅ done (24 Aug 2026) |
| 8 | Class detail page + share links | ✅ done (24 Aug 2026) |
| 9 | Razorpay payments ⚠ | ✅ done (24 Aug 2026) — pending ops: Razorpay account + keys |
| 10 | Attendance + waitlist management | ✅ done (24 Aug 2026) |
| 11 | Rooms & people (full class form) | ✅ done (25 Aug 2026) |
| 12 | Studio CRM (leads/trials/conversions) | ✅ done (25 Aug 2026) |
| 12b | Staff invites (split out of 12) | ⬅ next |
| 13 | Earnings & payouts ⚠ | ⬜ |
| 14 | Calendar views | ⬜ |
| 15 | Follows + public profiles | ⬜ |
| 16 | Reviews + ratings | ⬜ |
| 17 | Social feed (images first) | ⬜ |
| 18 | Messaging (DMs → groups) | ⬜ |
| 19 | Moderation + reporting | ⬜ |
| 20 | Video/reels (Mux/Cloudflare Stream) | ⬜ |
| 21 | Events, competitions, ticketing ⚠ | ⬜ |
| 22 | Teams/crews + auditions | ⬜ |
| 23 | Search (Typesense) + Discover filters/map | ⬜ |
| 24 | Push notifications | ⬜ |
| 25 | Analytics dashboards | ⬜ |
| 26 | WhatsApp OTP unpark ⚠ | ⬜ |

Steps 0–6 detail is recorded below; Steps 7–26 detail lives in the
**Extended roadmap** section. ⚠ = touches money/auth (Rule 9).

### Step 0 — Foundations ✅
Prototype moved to `prototype/` (byte-identical); Next.js 16 + TypeScript +
Tailwind v4 scaffold at repo root; feature-first folders; GitHub Actions CI
(lint + typecheck + build on every push). Verified: `pnpm typecheck`, `pnpm lint`,
`pnpm build` all green.

### Step 1 — Auth + Identity ✅ (done 18 Aug 2026)
- Supabase project **danceos** (Mumbai, `wonhocebhckjokfssvja`), linked; keys in `.env.local`
- Migration `20260818070000_create_profiles.sql`: `profiles` (UUID PK ref auth.users,
  full_name, role dancer|trainer|studio, city, audit cols, soft delete) + RLS
  (signed-in read live rows; insert/update own row only) — applied to the live DB
- **Auth is mobile-OTP** (login = phone number, like the prototype's S_auth flow —
  NOT email). Dev uses Supabase test numbers 99999 99999 / 88888 88888, OTP 123456,
  nothing is sent. **Decided (18 Aug 2026): production OTP is WhatsApp-first**
  (Supabase channel "whatsapp" via Twilio Verify — needs Meta business verification
  + an approved authentication template) **with SMS fallback** (needs India DLT
  registration). Wired at Step 6; code change is `channel: "whatsapp"` in
  signInWithOtp. `mailer_autoconfirm` is on (dev); revisit before pilot.
- **Interim real sign-in (added 24 Aug 2026): email magic link** — free tier can't
  customise email templates (no OTP code by email) or send SMS, so the sign-in
  screen has a 📱 Mobile / ✉️ Email toggle: email sends a Supabase magic link →
  `/auth/confirm` route verifies the token_hash and forks to onboarding/home.
  `uri_allow_list=http://localhost:3000/**` (add the Vercel URL at deploy). The
  default mailer sends only ~2 emails/hour — connect custom SMTP (e.g. Resend) at
  Step 6. gotrue quirk: a NEW user's link verifies with type `signup`, a returning
  user's with `magiclink` — the confirm route passes the URL's type through.
  Verified: `scripts/auth-proof-email.ps1` (mint link via admin API → lands at
  /onboarding signed in → reused link bounces). WhatsApp-first remains the
  production phone channel.
- UI lifted from prototype S_auth (DanceOSApp.jsx:3616-3946): `/login` welcome,
  `/login/phone` sign-in, `/login/verify` OTP boxes, `/onboarding` name+role+city,
  `/` identity header (prototype Home sleeve treatment). Session refresh in `proxy.ts`.
- Verified: `scripts/rls-proof.ps1` — 2 users, cross-user update blocked, impostor
  insert rejected, anonymous reads 0 rows. Build/lint/typecheck green.

### Step 2 — Tenant onboarding ✅ (done 18 Aug 2026)
- Migration `20260818100000_create_tenants.sql`: `tenants` (studio |
  trainer_business, name, area, city, lat/lng for Step 5, visibility) and
  `tenant_members` (user ↔ tenant, owner|trainer|staff) + RLS: members read only
  their own tenants, owners update; **no direct inserts** — creation goes through
  the `create_tenant_with_owner` security-definer RPC (tenant + owner membership
  atomic, so no ownerless tenant can exist)
- Repository `repositories/tenants.ts`, Zod-validated `createTenantAction`
- UI lifted from prototype S_bizhub (DanceOSApp.jsx:2608-2686): `/business` hub
  (owned-business rows, dashed add button) + the "New studio" bottom sheet with
  the closed DOS_CITIES list; rooms arrive with the ERP slice
- Verified: `scripts/rls-proof-tenants.ps1` — A can't see, rename, or self-invite
  into B's studio; anonymous sees 0 rows. Build/lint/typecheck green.

### Step 3 — Classes ✅ (done 19 Aug 2026)
- Migration `20260819080000_create_classes.sql`: `classes` (tenant_id, title, style,
  level, room, price_inr placeholder, capacity, status draft|published|completed,
  audit + soft delete) + `class_sessions` (class_id, tenant_id denormalised,
  starts_at/ends_at) + RLS: members read all their tenant's rows; owners/trainers
  update; public (anon + signed-in) reads published classes of LISTED tenants only;
  creation ONLY via `create_class_with_session` security-definer RPC (class + first
  session atomic, membership checked). Also added "anyone reads listed tenants"
  policy on `tenants` (pulled forward from Step 5 so the learner listing can name
  the studio).
- Migration `20260819110000_members_read_deleted_classes.sql`: member SELECT
  policies lost their `deleted_at is null` filter — PostgREST updates run with an
  internal RETURNING that applies SELECT policies to the NEW row, so soft delete
  was refused (403) while the deleter couldn't select the deleted row. Queries
  filter live rows; public policies stay strict. **Lesson for future tables: a
  soft-deleting role must be able to SELECT the row it just deleted.**
- Style registry lifted to `lib/constants/styles.ts` (66 styles + colours,
  prototype DOS_STYLE_REG line 1630); repository `repositories/classes.ts`;
  Zod-validated actions create/update/publish/delete in
  `features/classes/server-actions/classes.ts` (times stored as IST, +05:30).
- UI lifted from prototype: Classes register S_classesmod (DanceOSApp.jsx:14970,
  tabs + confirm sheets) at `/business/[tenantId]/classes`, class form S_classform
  essentials (15108 — style/level chips, name, date+times, room, price, capacity;
  room pickers/artists arrive with ERP) at `.../classes/new` and `.../[classId]/edit`,
  learner "Upcoming classes" (4771) at `/classes` with the BookingCard sleeve tile
  (7969) as `ClassTile`. Business-hub rows now open the register.
- Verified: `scripts/rls-proof-classes.ps1` — 8 checks (draft hidden from outsiders,
  cross-tenant update/create blocked, published visible to stranger + anonymous with
  studio name + session, anonymous write blocked, soft delete hides). Build/lint/
  typecheck green.

### Step 4 — Enrollment ✅ (done 24 Aug 2026)
- Migration `20260824090000_create_enrollments.sql`: `enrollments` (session_id,
  class_id + tenant_id denormalised, user_id → **profiles** so the roster can name
  the learner, status enrolled|waitlisted|cancelled, audit + soft delete; partial
  unique index = one live spot per learner per session, cancelled rows don't block
  re-enrolling). RLS: learners read own rows; tenant members read their roster;
  **no direct writes** — everything through security-definer RPCs:
  `enroll_in_session` (row-lock on the class → atomic capacity check, full →
  waitlisted, rejects past/unpublished sessions and missing profiles),
  `cancel_enrollment` (own rows only; a freed seat auto-promotes the oldest
  waitlisted — prototype 13648), `session_seat_counts` (aggregate-only, granted to
  anon so public cards can say "N spots left" without exposing who).
- Repository `repositories/enrollments.ts`; Zod actions enroll/cancel in
  `features/enrollments/server-actions/enrollments.ts` (revalidate /classes +
  /my-classes).
- UI: `EnrollButton` on the class tiles (Book a spot / Join waitlist / Enrolled ✓ /
  cancel — waitlist copy from prototype 12420), `/my-classes` (learner bookings,
  soonest first), roster at `/business/[tenantId]/classes/[classId]/roster`
  (person-row treatment from PeoplePicker 649), real seat counts on the register
  and learner listing, "My classes" row on home.
- Verified: `scripts/rls-proof-enrollments.ps1` — 9 checks (enroll, double-book
  rejected, full → waitlist, anon enroll rejected, direct insert rejected, cancel
  promotes waitlist, cross-user cancel rejected, roster member-only, anon seat
  counts). Build/lint/typecheck green.

### Step 5 — Discovery ("near me") ✅ (done 24 Aug 2026)
- Migration `20260824120000_discovery_postgis.sql`: PostGIS enabled (extensions
  schema); `city_centroids` reference table (12 DOS_CITIES seeded, public read);
  existing tenants backfilled with their city's coordinates (trigger paused for the
  backfill — auth.uid() is null in migrations); `create_tenant_with_owner` replaced
  (same signature) to stamp centroid lat/lng at creation; GIST expression index on
  tenants; `nearby_tenants(lat,lng,radius_km,type)` — **SECURITY INVOKER** so the
  caller's RLS decides visibility: anon sees listed only, owners still find their
  own unlisted business. Precise addresses (Google Maps autocomplete) arrive later;
  until then a studio sits at its city centroid.
- Repository `repositories/discovery.ts`; centroids mirrored in
  `lib/constants/cities.ts` for the client.
- UI `/discover` lifted from prototype S_discover: city chip rail (closed list, URL
  state `?city=`), entity tabs Classes | Studios | Artists (`?tab=`), classes shelf
  reuses ClassTile + EnrollButton filtered by city, studios/artists use `StudioCard`
  lifted from prototype 4306 (cover strip with per-business gradient, 56px squircle
  avatar riding the cover edge, distance chip top-right). Home's discover row points
  here. Profile city = default city.
- Verified: `scripts/rls-proof-discovery.ps1` — 5 checks (new studio gets coords,
  anon finds it near Pune, type filter, unlisted hidden from anon but visible to
  owner, Delhi search excludes Pune). Build/lint/typecheck green. (PowerShell
  lesson: compare REST ids with `-contains` + `[string]` casts, not `Where-Object`
  object equality.)

### Step 6 — Hardening & pilot (in progress, 24 Aug 2026)
- ✅ `supabase/seed.sql`: demo cast (Tandav Dance Academy/Pune + Meera Rao Dance
  Company/Mumbai + 3 learners, future-dated sessions, a full class demoing the
  waitlist). LOCAL ONLY — runs on `supabase db reset`, never pushed to the cloud
  project; superuser context, so created_by is set explicitly on every row.
- ✅ Playwright e2e (`e2e/happy-path.spec.ts`, `pnpm test:e2e`): signup (admin
  generate_link → real /auth/confirm) → onboard studio → create studio → publish
  class → second user books a spot; unique-stamped rows, cleans up after itself
  (tenant cascade + admin user delete). **Its first run caught a real RLS bug:**
  `findMyTenants` selected from `tenants` relying on RLS to mean "my tenants",
  but policies OR together — Step 3's public "anyone reads listed tenants" policy
  made every listed studio show up in everyone's business hub (and /business/*
  page guards pass). **Lesson: RLS is a ceiling, not a scoping mechanism — a
  "rows I belong to" query must use the membership table as its spine** (fixed:
  repository now selects `tenant_members` with the tenant embedded). Also fixed:
  create-studio action redirected to the same route so the sheet never closed —
  it now returns `{created:true}` + revalidatePath and the sheet closes itself
  (setState lives in the useActionState wrapper, not an effect — lint rejects
  setState-in-effect). **Second real find: the bottom sheets had
  `aria-hidden="true"` on their backdrop wrapper**, hiding the whole form from
  the accessibility tree (screen readers couldn't create a studio; getByRole
  couldn't either) — replaced with `role="dialog"` + `aria-modal` on the sheet
  itself (BusinessHub + ClassesManager ConfirmSheet). e2e VERIFIED green 24 Aug
  2026 (12s) + typecheck/lint/build all green. Test-selector note: ClassTile
  headlines the STYLE, the class title lives only in its aria-label.
- ✅ Email verification production-ready (24 Aug 2026, decided: email-first,
  mobile parked): **Resend SMTP wired** into the hosted project via the
  management API (smtp.resend.com:465, user "resend", password = RESEND_API_KEY
  in `.env.local`; sender onboarding@resend.dev), email rate limit raised
  2 → 60/hour, **`mailer_autoconfirm` turned OFF** (new email users verify via a
  real signup-type link — /auth/confirm already handles both types), sign-in
  screen now defaults to ✉️ Email with 📱 Mobile second (test numbers stay for
  dev). Verified: auth-proof-email.ps1 green, e2e green (9.8s), typecheck/lint
  green, and a real email delivered through the full gotrue → Resend pipeline.
  **Resend limitation until a domain is verified:** test mode delivers ONLY to
  the Resend account owner's address (deepakkaushik8919@gmail.com) — verify a
  domain at resend.com/domains + switch smtp_admin_email to that domain before
  inviting pilot users.
- ✅ Live-DB cleanup (24 Aug 2026): all 8 leftover proof-script studios deleted
  (children cascaded), plus 3 leaked test users (2 e2e owners + dbg@example.com).
  Live DB now holds only: the owner's real account (deepakkaushik8919@gmail.com),
  the 2 test-number users and their profiles, 0 tenants. Production build green.
- ✅ Deployed to Vercel (24 Aug 2026): **https://dancestudio-orcin.vercel.app**
  — project `dancestudio` (git-connected to dpakkaushik/dancestudio, auto-deploys
  main; VERCEL_TOKEN in `.env.local`). Env vars set via API: the two
  NEXT_PUBLIC_SUPABASE_* keys only (service role stays local). Supabase
  `site_url` now points at the production URL and `uri_allow_list` carries
  localhost + all three vercel.app aliases, so magic links work live. Smoke
  tested: / redirects anon → /login, /login /discover /classes all 200, and a
  production magic link was sent/delivered.
- Remaining (ops, not code): verify a sending domain in Resend (until then
  sign-in emails only reach deepakkaushik8919@gmail.com), then invite 1–2 pilot
  studios. Real OTP delivery stays **parked** — it is Step 26 in the extended
  roadmap (WhatsApp-first via Twilio Verify + Meta business verification, SMS/DLT
  fallback).

### Step 7 — App chrome + Home parity ✅ (done 24 Aug 2026)
- **Theme system:** prototype DOS_PALETTE lifted to CSS variables on `<html>`
  (`html.dark` / `html.light` in `app/globals.css`), applied pre-paint by a boot
  script in the root layout (localStorage key `__DOSTHEME`), toggled from the top
  bar. The neutral design tokens (`INK`/`LILAC`/`SUB`/`LINE` + new `CARD`/`MUTED`)
  are now `var()`-backed, so every already-built screen follows the toggle; card
  and border literals were swept to `var(--card)`/`var(--el)`. Accents stay literal
  hex (the prototype keeps them theme-invariant, and call sites alpha-suffix them).
  Auth screens pin the dark palette on AuthShell ("auth wears the in-app dark
  look", prototype line 48).
- **Chrome** (`features/shell/components/AppChrome.tsx`, lifted from the root
  shell 19171-19397): fixed top bar (DosMark + wordmark on tabs; back chip + page
  title on drill pages; round theme/settings chips) and the floating five-tab pill
  bar — **Home · Discover · Stats · Inbox · Profile** with per-tab accent tints and
  the expanding selected capsule. NOTE: the prototype's FINAL tab set has no
  Calendar/Create tab (Calendar opens from Home ▸ business; the old backlog line
  was stale). Signed-in routes moved into the `app/(app)/` route group (URLs
  unchanged) whose layout wears the chrome; in-page ← arrows removed from drill
  pages (the chrome owns back now). Tabs are real routes, so active-tab and
  bar-visibility read off the pathname.
- **Home** (`app/(app)/page.tsx`, prototype S_homedancer 7206-7352): time-of-day
  greeting on the identity sleeve, booked-classes deck with LIVE pulse chip
  (dosPulseH) and waitlist tag, run-your-business rows (tenant → its register) with
  the dashed add row, discover row. Log out moved to the new `/profile` tab page
  (identity kit + sign-out); `/stats` and `/inbox` are placeholder tabs wearing the
  prototype's own not-built treatment (19164-19169).
- Verified: typecheck, lint, production build, e2e happy path (14s) all green.
  **Lesson: this repo's lint forbids setState-in-effect — read DOM-owned state
  (like the `<html>` theme class) through `useSyncExternalStore`, and keep
  `Date.now()` out of component bodies (react-hooks/purity) by computing time
  slices in module-level helpers.**

### Step 8 — Class detail page + share links ✅ (done 24 Aug 2026)
- Migration `20260824150000_class_share_slugs.sql`: `share_slug` on `classes` —
  stable public booking-link slug (title slugified to the prototype's grammar,
  shareRecOf 3975, + 4-char random suffix), stamped by a BEFORE INSERT trigger
  (`generate_class_slug`, security definer so the uniqueness probe sees every
  row) so every insert path gets one without rewriting the applied RPC. Backfill
  for existing rows, NOT NULL, unique index spanning soft-deleted rows (a dead
  class's slug is never reused). **No RLS policy added or changed** — the
  /c/{slug} lookup rides the existing SELECT policies, so a draft's link 404s
  for strangers and resolves for the studio's own members.
- Repository: `findClassBySlug` (+ `share_slug` through CLASS_COLUMNS and the
  enrollments join), `findMyMembershipRole` in repositories/tenants.ts (owner /
  trainer / staff / null — membership table as the spine). Enrollment actions
  also revalidate `/` and `/c/[slug]`.
- UI lifted from prototype S_class (11626-12807), Step-8 scope: `/c/[slug]`
  (app/(app)/c/[slug]/page.tsx + features/classes/components/ClassDetail.tsx) —
  the poster sleeve lit like a player (poster kit lifted to poster.tsx:
  PosterBlock/dosPosterAuto/DosPosterSleeve/useDosFold; drawn designs, uploads
  arrive Step 11), the card you tapped opened into a page (calendar block,
  style headline in dosStyleInk contrast-walked ink, live chip, capacity bar,
  price chip), AT THE STUDIO (studio row + Maps chip; amenities arrive with
  rooms), the fixed booking bar (book / sold-out→waitlist / booked / sign-in),
  the you're-booked card with cancel, the draft footer (YOUR DRAFT · Edit
  class), and ShareSheet (3984-4005) printing the real deployment's /c/{slug}.
  Session date/time grammar extracted to lib/format/session.ts, shared by tile
  and page (the prototype's "one grammar" rule, line 70). Every class surface
  now opens the page: ClassTile's sleeve is a link (booking actions stay
  outside the anchor), home deck rows, and the owner register rows.
- Interim placements, tracked in the backlog: "Share booking link" sits as a
  button on the detail page (the prototype moved it behind the poster's pass
  sheet, which arrives with Step 10's QR work); the two-step pay sheets and the
  POLICY section arrive with Step 9 (printing refund/membership promises before
  money exists would be a lie); no artist column/team/routine until Step 11.
- Verified: `scripts/rls-proof-slugs.ps1` — 5 checks (slug auto-stamped in
  shape, anon resolves published link with studio name, draft link dark to
  anon, owner resolves own draft, same title twice → different slugs; cleans
  up via service role). e2e extended: owner opens the page from the register,
  the share sheet shows the real link, the learner opens that link and books
  there (16.6s green). Typecheck/lint/build green. **Lesson: this repo's lint
  also forbids ref-writes during render (react-hooks/refs) — the prototype's
  `hRef.current = h` mid-render pattern must become an effect dependency. And
  keep .ps1 files ASCII: an em-dash in a double-quoted string breaks
  PowerShell 5.1's ANSI parse of BOM-less UTF-8.**

### Step 9 — Razorpay payments ⚠ ✅ (done 24 Aug 2026)
- Migration `20260824180000_create_payments.sql`: `orders` (tenant + user +
  class + session traceability, price snapshot in whole rupees, razorpay_order_id,
  created | paid | refund_pending | refunded), `payments` (unique
  razorpay_payment_id — the idempotency spine; captured | failed | refunded),
  `refunds` (the auditable money-back ledger: requested | pending | processed |
  failed, with the learner's reason), `webhook_events` (unique event_id =
  exactly-once webhook processing; machine-written, so its created_by is
  nullable). RLS: the payer reads own rows, tenant members read the studio's,
  the public reads none; **no direct writes** — money moves only through RPCs:
  `create_payment_order` / `attach_razorpay_order` / `cancel_booking`
  (authenticated) and `apply_captured_payment` / `apply_failed_payment` /
  `apply_refund_update` (service_role only). Same migration closes the free
  hole: `enroll_in_session` rejects a priced class with open seats (waitlisting
  a full one stays free), and a freed seat auto-promotes ONLY on free classes —
  a paid seat goes back on sale (promoting an unpaid waitlister would give a
  paid seat away; Step 10's owner queue closes this properly).
  `cancel_enrollment` is now a wrapper on `cancel_booking(reason)`: the seat
  back immediately, the refund row by the 48 h window ('pending' auto-refund
  outside it, 'requested' studio-decides inside — the POLICY line the learner
  saw when booking). Capture is capacity-safe: money landing on a full, closed,
  or amount-mismatched order files a pending refund instead of overbooking, and
  a waitlisted learner who pays for an open seat is promoted.
- Migration `20260824190000_set_updated_at_service_safe.sql`: the shared
  `set_updated_at` trigger stamped `updated_by := auth.uid()` unconditionally —
  NULL for service-role writes, so every webhook-driven update violated NOT
  NULL. It now coalesces to the explicitly-set/previous author. **Lesson: a
  shared audit trigger must never assume auth.uid() is non-null.**
- Razorpay server side: `lib/razorpay/api.ts` (orders / fetch-payment / refund
  via plain fetch + basic auth; RAZORPAY_KEY_ID / KEY_SECRET / WEBHOOK_SECRET in
  env, documented in .env.local.example), `lib/razorpay/signature.ts`
  (HMAC-SHA256 + timing-safe compare), `lib/supabase/admin.ts` (service-role
  client, used only by the webhook route and the verified handshake).
- Webhook `/api/webhooks/razorpay`: raw-body HMAC verify (401 on mismatch) →
  exactly-once event ledger (replayed delivery = 200 no-op) → the idempotent
  apply_* RPCs (payment.captured/failed, refund.processed/failed); non-2xx lets
  Razorpay retry safely. The checkout handshake (`confirmCheckoutAction`)
  verifies the signature server-side, fetches the payment FROM Razorpay, and
  calls the same RPC — webhook and handshake race harmlessly.
- Actions `features/payments/server-actions/payments.ts` (Zod): startCheckout
  (the amount always from the database, never the client), confirmCheckout,
  cancelBooking (fires the real refund API when one is due; a failed call
  leaves the ledgered 'pending' row visible for ops/Step 13).
- UI lifted from the prototype: the two-step pay sheets (S_class 12456-12573 —
  free skips to the confirm sheet, 12439; one method row until passes arrive),
  POLICY section (12399-12402, Refund row only — Memberships waits for passes),
  BookingActions' merged Invoice | Cancel pill on the you're-booked card
  (6408-6448), InvoiceSheet (6230-6255, real amount + method; Download PDF
  omitted until it can be real), RefundSheet (6269-6327, reasons + 48 h copy).
  EnrollButton routes priced classes (and paid-booking cancels) to /c/{slug},
  where the money conversation lives; free bookings and waitlist moves stay
  one tap.
- Verified: `scripts/rls-proof-payments.ps1` — 12 checks green (free path
  closed, no direct writes, apply_* machine-only, capture enrolls + replay is a
  no-op, member/anon visibility, full-class capture refunds instead of
  overbooking, both sides of the 48 h window, refund.processed closes the loop,
  free-class waitlist promotion regression). `e2e/paid-webhook.spec.ts` — forged
  signature 401, signed capture books the seat through the live route, replayed
  delivery changes nothing (green). Happy-path e2e updated (price 0 + the new
  confirm sheet) green. Typecheck / lint / production build green. **PowerShell
  lessons: Invoke-RestMethod parses a JSON [] into something @() counts as 1 —
  count via ConvertFrom-Json + a null filter; and a function returning a
  1-element array unrolls it to a scalar — return `,@(...)`.**
- Ops remaining (not code): create the Razorpay account, put RAZORPAY_KEY_ID /
  RAZORPAY_KEY_SECRET (+ a strong RAZORPAY_WEBHOOK_SECRET) in .env.local and the
  Vercel project, and register the webhook (URL {deployment}/api/webhooks/razorpay,
  events payment.captured, payment.failed, refund.processed, refund.failed).
  Until then paid classes say "payments aren't switched on yet" and free classes
  work end to end.

### Step 10 — Attendance + waitlist management ✅ (done 24 Aug 2026)
- Migration `20260824210000_create_attendance.sql`: `attendance` (enrollment_id +
  session/class/tenant/user denormalised, audit + soft delete) — one live row
  per enrollment = checked in; check-out soft-deletes so history is never
  destroyed, re-check-in inserts anew. RLS: learners read their own check-ins,
  tenant members read the register; **no direct writes** — the register moves
  only through RPCs gated by `can_run_register` (owner|trainer; assistant claims
  arrive with Step 11): `check_in` (idempotent; **the clock owns the window** —
  opens 30 min before starts_at, closes at ends_at, after which the register is
  final — prototype 12050-12063), `undo_check_in`, `give_spot` (promotes a
  waitlisted learner under the class lock, capacity-checked: "free a spot first"
  when full; works on paid classes — the studio's seat to give, desk money until
  Step 13), `remove_from_waitlist`. This closes Step 9's deliberate gap: a freed
  paid seat waits for the owner instead of auto-promoting an unpaid waitlister.
  (Fix caught at apply time: the membership column is `member_role`, not `role`.)
- Repository `repositories/attendance.ts` (`findClassRegister` — enrolled rows
  with live-attendance state + the waitlist in join order — and the four RPC
  wrappers); Zod actions in `features/attendance/server-actions/attendance.ts`.
- UI lifted from prototype: **Details | Attendance owner tabs** on the class
  page (strip belongs to the card, 11961-11970; SEGS 11755-11757 — Earnings/
  Refunds segments arrive Step 13), the clock-derived session strip with the
  live pulse (12050-12077), the WAITLIST queue (12080-12099: #position, Give
  spot, ✕ remove), the LIVE/FINAL REGISTER (12117-12137: fill bar, initials
  avatars, Check in / ✓ In toggles; read-only once ended). **PassSheet behind
  the poster** (6161-6227: the ticket — poster with the style pill riding its
  top edge, torn edge, QR block, code line, Share): the poster is now the
  control (DosPosterSleeve onOpen), a booked viewer gets their entry code,
  everyone else the booking link (dosCodeFor grammar, 115-121) — the standalone
  "Share booking link" button is gone (one place instead of three, 12001).
  Walk-ins + the QR scanner need the student pool (Steps 11-12, backlog).
- Verified: `scripts/rls-proof-attendance.ps1` — 10 checks green (learner can't
  run the register, owner check-in visible to the learner, double check-in
  no-op, undo keeps history, window rejects a far session, give_spot rejected
  when full, freed paid seat does NOT auto-promote, give_spot promotes, owner
  clears a queue row, direct insert rejected). e2e updated (share now flows
  through the pass sheet) — both specs green. Typecheck/lint/build green.
  **Lesson: this repo's lint also forbids mutating a closure variable during
  render (react-hooks/immutability) — hash-walk drawing math belongs in a pure
  module-level helper returning data.**

### Step 11 — Rooms & people ✅ (done 25 Aug 2026)
- Migration `20260824230000_create_rooms_and_claims.sql`:
  - `rooms` (tenant, name, capacity, amenities text[] from the closed
    DOS_AMENITIES vocabulary, audit + soft delete) + RLS: members read their
    tenant's (no deleted_at filter — Step 3's soft-delete lesson), **anyone reads
    a listed tenant's live rooms** so a public class page can say what the room
    has; owners/trainers insert/update directly (plain config, no cross-row
    invariant needs an RPC).
  - `classes.room_id` + `classes.poster` ('bold'|'split'|'quiet'|'none'), and the
    three promises the prototype's settings footnote makes (18425) enforced by
    triggers, not by the caller: a BEFORE trigger resolves `room_id` from the
    room NAME (Step 8's share_slug technique, so every insert path gets it) and
    keeps the denormalised name in step; `assert_room_ok` refuses a capacity
    above the room's and refuses an overlapping **published** class in the same
    room — while a DRAFT holds no room at all (9729), so two drafts can share a
    slot.
  - `class_claims` (class, tenant, person → profiles, kind artist|assistant,
    status asked|confirmed|rejected, can_attendance/can_refunds — the jobs from
    dosTeamOne 89-90) + RLS: you read your own, members read their tenant's, and
    **anyone reads CONFIRMED claims on a published class of a listed tenant** —
    so an unanswered ask never puts a name on a public page. No direct writes:
    `claim_person` (owner/trainer, own team only), `respond_to_claim` (**only the
    person asked**), `withdraw_claim`, `set_claim_powers`.
  - `can_run_register_for_class` replaces Step 10's tenant-scoped check, so **an
    assistant handed attendance gets the register** (12390) — check_in,
    undo_check_in, give_spot and remove_from_waitlist all re-pointed at it.
  - `create_class_with_session` gained `p_room_id` / `p_poster` **with defaults**,
    so the earlier proof scripts' ten-argument calls still hit the one creation
    path (the old signature was dropped, not overloaded).
- Migrations `20260824234500_members_read_team.sql` + `20260825000500_fix_team_policy_recursion.sql`:
  a tenant's members can now read each other (the people pickers had nothing to
  offer while tenant_members was own-rows-only). The first attempt recursed —
  **a policy on table X must never contain a subquery against X** (42P17); the
  membership test moved into the security-definer `is_tenant_member`. And
  because RLS is a ceiling rather than a scope, `findMyTenants` now says
  `user_id = auth.uid()` out loud instead of leaning on the old narrow policy.
- Repositories `rooms.ts`, `claims.ts` (+ `findTenantTeam` in tenants.ts — two
  queries, because tenant_members.user_id references auth.users, not profiles, so
  PostgREST has no relationship to embed the name through); Zod actions in
  `features/rooms/server-actions/rooms.ts` and
  `features/claims/server-actions/claims.ts`; first use of `/services` —
  `services/classPeople.ts` reconciles the form's intent against the claims on
  record so **a person who already said yes is never re-asked**, only their job
  is updated (changing artist ⇄ assistant re-asks by design).
- UI lifted from the prototype: **rooms manager** at `/business/{id}/rooms`
  (settings Rooms segment 18389-18425 — name/capacity edited in place, amenities
  folded away, the closing note that says what a room decides), reachable from a
  "Rooms ›" chip on the classes register; the **two-step class form wizard**
  (15309-15531 — step 1 date/time, style, level, name, WHERE from the studio's
  own rooms 15381-15396; step 2 WHO IS TAKING IT + CLASS ASSISTANTS with the
  Attendance/Refunds job chips and the ⏳ Asked / ✓ Confirmed badges 15473-15475,
  capacity "defined by Studio A" 15507-15509, price, and the drawn poster
  picker); the class page's **artist column** in the card, **CLASS ASSISTANTS**
  section, real **room amenities** in AT THE STUDIO (12278-12354), the chosen
  poster design, and the **"you've been asked" card** where the person answers
  (15455). Poster uploads and the "None" poster stay on the backlog.
- Verified: `scripts/rls-proof-rooms-people.ps1` — 13 checks green (room read by
  anon, cross-tenant room insert rejected, capacity cap, name→room_id trigger,
  overlap rejected, draft may share the slot, off-team claim rejected, unanswered
  ask invisible to the public, the studio cannot answer for you, confirmed name
  public, staff assistant with attendance runs the register, job removed closes
  it, direct claim insert rejected). e2e extended to add a room with an amenity,
  pick it in the wizard, see "defined by Studio A", and find that amenity on the
  learner's public class page — both specs green. Typecheck/lint/build green.

### Step 12 — Studio CRM (leads) ✅ (done 25 Aug 2026)
- Migration `20260825090000_create_leads.sql`: `leads` (tenant, name, mobile,
  interest, source walk_in|enquiry|referral|social, status **new | quoted |
  trial_booked | converted | lost** — the prototype's own five stages, chip row
  5978 and tints 5664 — plus trial_class_id, trial_on, converted_user_id, note,
  audit + soft delete). RLS: **every member of the tenant** reads and writes the
  desk (staff answer the phone, so staff work leads), via the security-definer
  `is_tenant_member`; SELECT carries no deleted_at filter (Step 3's lesson).
  **There is no public policy on this table at all** — who enquired, what they
  were quoted and that they left is private business data.
- The deliberate non-feature: a studio **cannot book a seat for somebody**.
  Enrolling is the learner's own act (Step 4's self-only RPC), so a "booked
  trial" is recorded as what it really is at the desk — which class, which day —
  and the lead is marked Converted when they turn up for real. Faking an
  enrollment here would have put a name on a roster that never agreed to it.
- Repository `repositories/leads.ts`, Zod actions in
  `features/leads/server-actions/leads.ts`, UI `features/leads/components/LeadsDesk.tsx`
  at `/business/{id}/students` (funnel summary, stage chips, one row per person
  with its age, an add sheet, and a per-lead sheet that moves the stage and sets
  the trial class). The classes register now carries **Students ›** and
  **Rooms ›** chips.
- Verified: `scripts/rls-proof-leads.ps1` — 10 checks green (rival studio sees
  nothing, public sees nothing, rival cannot write, staff read AND move a lead,
  trial against a real class, **the trial took no seat**, invented stage
  rejected by the database, soft delete keeps the record). e2e both green,
  typecheck/lint/build green. **Lesson re-learned: `Date.now()` may not be
  called during render even in a server component (react-hooks/purity) — stamp
  it from a module-level helper.**

### UI parity backlog — gaps vs the prototype, tracked so none is forgotten

Rule 2 says the prototype's UI is the spec. These are the known, deliberate gaps
between the built screens and their prototype counterparts, each tagged with the
slice that closes it. **Add to this list whenever a screen ships simplified;
remove entries as they close.**

| Gap | Prototype ref | Closes with |
|-----|--------------|-------------|
| Top bar: notifications bell + notifications screen | shell 19254, S_notif | Step 24 (notifications) |
| Home: QR share sheet, rank row, style row, full PassDeck (session codes, invoices) | Home 7248+, PassDeck | Phase 2-3 slices |
| Profile tab: full S_profiletab (stats, achievements, reviews, settings) — today it is identity + log out | S_profiletab | Phase 3 |
| Stats / Inbox tabs: placeholder screens today | HistPage / S_chats | Steps 25 / 18 |
| Class detail page: Earnings + Refunds owner tabs (money segment 12008-12042, refund queue) | S_class owner tabs | Step 13 |
| Class detail page: WHAT YOU'LL DANCE (routine/notes/songs) | S_class 12278-12354 | later slice (needs a routine field) |
| Poster uploads (PosterCropper + Storage) and the "None" poster — the three drawn designs ship | PosterCropper, dosPosterOf 129-135 | media slice (Step 20 rails) |
| Staff invites — the claim system can only offer people already on the team | settings Staff & permissions 18427 | Step 12b (next) |
| Leads: the event-enquiry desk (celebrations/corporate/judge/collab types, quotes, in vs out) — the STUDENT pipeline ships | ENQ_TYPES 4902, S_enqdetail 5380 | later slice |
| Pay sheet: pass + cash methods, POLICY Memberships row; invoice Download PDF | S_class 12471-12507 + 12401, InvoiceSheet 6249 | passes (Phase 2/3), PDF with Step 13 |
| Register: walk-in add + the QR scanner (needs the student pool); the pass QR is drawn, not scannable yet | attend 12104-12116, PassSheet 6209 | Steps 11-12 (people); real scanning later |
| Class form: DosDatePick calendar (the native date input ships), searchable style dropdown, refund-cutoff + memberships toggles | S_classform 15317, 15336-15360, 15520-15528 | Step 13 (money policy) |
| Class card: poster art, live chips, share action on the home-deck card, undo toasts | BookingCard 7969 | Steps 10-11 |
| Studio desk: BizShell tools grid (students, earnings, reports, calendar) — today the register plus a Rooms chip | S_bizhub/BizShell | Steps 12–14 |
| Discover: style filter rail, sort, crews tab, follower counts, studio photos, map view | S_discover 4100+ | Steps 15 (counts), 22 (crews), 23 (filters/sort/map) |
| My classes: real calendar view | Calendar tab | Step 14 |

### Extended roadmap — Steps 7–26 (approved 24 Aug 2026): prototype → full DanceOS

Same discipline as Steps 0–6: one vertical slice per session, execution order
below (schema+RLS → repository → Zod actions → UI → verify), and **Rule 2 is
absolute — every screen's JSX is lifted from `prototype/DanceOSApp.jsx`
unchanged; only the `dosStorage` wiring is replaced with server actions.** Each
step names the prototype screens its UI comes from so nothing gets redesigned.
⚠ = touches money/auth (Rule 9).

**Prototype parity (no new tables)**

| # | Slice | Backend | Prototype UI source |
|---|-------|---------|---------------------|
| 7 | App chrome + Home: bottom tab bar (Home·Discover·Create·Calendar·Profile), top bar, theme system, home sleeves/greeting/live-now chips | none — reads existing data | shell/nav, Home 7248+ |

**Phase 2 — Transactions**

| # | Slice | Backend | Prototype UI source |
|---|-------|---------|---------------------|
| 8 | Class detail page + share/booking links | share-slug lookup | S_class |
| 9 | ⚠ Razorpay: orders/payments/refunds tables, **verified idempotent webhooks**, paid enrollment; every payment traceable to tenant + user + bookable | biggest single slice | booking flow, BookingCard 7969 |
| 10 | Attendance (manual first, QR later) + owner-side waitlist queue management | attendance table + RPCs | attend 12080 |
| 11 | Rooms & people: studio rooms, room picker, artist/assistant claims, posters → completes the two-step class form wizard | rooms + claims tables | S_classform 15108 |
| 12 | Studio CRM: leads, trials, conversions | leads pipeline | BizShell students tools |
| 13 | ⚠ Earnings & payouts: trainer payout ledger (manual first), earnings dashboard, reports | payout ledger | BizShell earnings/reports |
| 14 | Calendar views (learner + studio) | none new — reads sessions | Calendar tab |

**Phase 3 — Community**

| # | Slice | Backend | Prototype UI source |
|---|-------|---------|---------------------|
| 15 | Follow system + public profiles with follower counts | follows table + aggregates | profile screens |
| 16 | Reviews (trainer/studio categories) + rating rollups on profiles | reviews + rollups | review screens |
| 17 | Social feed, images first: cursor pagination, rate limiting | posts/likes/comments | feed screens |
| 18 | Messaging: DMs first, group/community chat later (Supabase Realtime) | conversations/messages | chat screens |
| 19 | Moderation: user reports on all UGC, admin queue, pending/published states | reports + queue | admin screens |

**Phase 4 — Performance & events**

| # | Slice | Backend | Prototype UI source |
|---|-------|---------|---------------------|
| 20 | Video/reels: Mux or Cloudflare Stream (decide before building), webhook-driven, playback IDs only in Postgres, automated screening | media pipeline | reel screens |
| 21 | ⚠ Events, competitions, ticketing (reuses the Step 9 Razorpay rails) | events/tickets | event screens |
| 22 | Teams/crews + auditions (fills Discover's crews tab) | teams/members | crew screens |

**Phase 5 — Scale & intelligence**

| # | Slice | Backend | Prototype UI source |
|---|-------|---------|---------------------|
| 23 | Typesense search sync (triggers + reconciliation job) → Discover style rail, sort, map view | sync pipeline | S_discover 4100+ |
| 24 | Push notifications (OneSignal/FCM) | fan-out | system-level |
| 25 | Analytics: DAU/MAU, retention, GMV dashboards | aggregates | admin/reports |
| 26 | ⚠ WhatsApp-first OTP unpark: Twilio Verify + Meta business verification, SMS/DLT fallback | provider setup; code = `channel:"whatsapp"` in signInWithOtp | existing S_auth screens |

Order rationale: Step 7 first so pilot studios see the prototype's real chrome
(zero backend risk); then money — Phase 2 — because paying students is a pilot
studio's first ask, and payments unlock payouts, ticketing, and GMV analytics
downstream; community after transactions; scale last.

### Execution order — every step follows this exact sequence, no exceptions

1. **Connect** — Supabase project exists and keys are wired in `.env.local`
   (done once in Step 1, then verified at the start of each later step)
2. **Schema** — new migration file in `supabase/migrations/`: tables + RLS policy
   together (Rule 3). Apply and confirm it runs cleanly.
3. **Backend** — repository module + server actions with Zod validation and
   server-side authorization. No UI yet.
4. **UI** — the screen lifted from `prototype/DanceOSApp.jsx` (Rule 2), wired to
   the server actions from step 3.
5. **Verify** — run the step's "done when" test + the Definition of Done checklist,
   demo in the browser. Only then is the step complete.

Never start a later stage before the earlier one is finished (no UI before schema
and backend exist). Never start the next step before the current one passes step 5.

**One step per session.** Each slice is vertical: migration → RLS → repository →
server action → UI, finished and verified before the next begins.

## Tech stack

- Next.js (App Router) + TypeScript + Tailwind v4 (+ shadcn/ui when UI work starts)
- Supabase: Postgres, Auth, Storage; RLS mandatory
- Zod for validation, pnpm for packages
- Razorpay for payments (Phase 2, webhook-driven)

## Rules

1. **Never edit anything in `prototype/`** — it is the reference.
2. **Keep the prototype's UI — do not redesign it.** Every screen's JSX (markup,
   styles, interactions) is lifted directly from `prototype/DanceOSApp.jsx` into the
   real app. Only the data wiring changes: `dosStorage` reads/writes are replaced
   with server actions. The built screen must look identical to the prototype screen.
3. **Every table ships with**: UUID PK, `tenant_id` (if tenant-scoped), audit columns
   (`created_at`, `updated_at`, `created_by`, `updated_by`), soft delete (`deleted_at`),
   and its RLS policy — all in the same migration.
4. **Never modify an applied migration** — write a new one.
5. **No direct Supabase calls from components** — repository layer only
   (`/repositories`), orchestrated by server actions (`/features/*/server-actions`).
6. **Validate every input server-side with Zod.** Never trust the client.
7. **Secrets only in `.env.local`** (gitignored). `.env.local.example` documents the keys.
8. **Pagination on every list endpoint** (cursor-based for feeds).
9. Anything touching money, auth, or RLS gets flagged explicitly in the summary of changes.
10. **When the user asks to end a session**, append an entry to the Session log
    (below) with exactly four things — this session / done so far / remaining /
    next session — then commit and push it. Newest entry on top.
11. **After every push, update the Progress tracker** (top of the Build plan) in
    the same push or the immediately following one: steps complete / 27, what
    just landed, and what's next. The tracker and the step table must always
    match reality — a stale tracker is a bug.

## Session log

Four lines per session, written when the user ends it. The step records above hold
the technical detail; this log is the at-a-glance history.

### 24 Aug 2026
- **This session:** Steps 4, 5, and Step 6 part 1 — Enrollment (enrollments table
  + RPCs with capacity/waitlist logic, EnrollButton, /my-classes, roster, 9-check
  RLS proof), Discovery (PostGIS + city centroids, nearby_tenants, /discover with
  city rail + tabs, 5-check proof), interim email magic-link sign-in (📱/✉️ toggle,
  /auth/confirm; commit 691e4eb), then hardening part 1: local-only seed.sql +
  self-cleaning Playwright e2e of the full happy path (signup → onboard → create
  studio → publish class → second user enrolls). The e2e caught and we fixed a
  real RLS leak (findMyTenants showed everyone every listed studio — membership
  table is now the query spine) and an a11y bug (bottom sheets aria-hidden, forms
  invisible to screen readers → proper role="dialog"). e2e + typecheck + lint +
  build all green; pushed as 70dbccf.
- **Done so far:** Steps 0–5 complete + Step 6 partly (seed, e2e, RLS/a11y fixes).
  Auth: email magic link live (interim), test phone numbers for OTP.
- **Remaining:** Step 6 rest — custom SMTP (Resend) to lift the ~2/hour mailer cap,
  WhatsApp-first OTP (Twilio Verify + Meta verification, SMS/DLT fallback), turn
  off mailer_autoconfirm, add production URL to uri_allow_list, deploy to Vercel,
  invite 1–2 pilot studios. Optional: delete ~8 leftover proof-script studios from
  the live DB. Then later phases (payments, community, events, search) + the UI
  parity backlog.
- **Next session:** Step 6 rest — start with Vercel deploy + Resend SMTP (needs
  the user's accounts), then WhatsApp OTP setup; or, if the user prefers building,
  begin Phase 2 groundwork (attendance/ERP) as the next vertical slice.

### 19 Aug 2026
- **This session:** Step 3 (Classes) built end-to-end and verified: classes +
  class_sessions schema with RLS, atomic creation RPC, repository + Zod server
  actions, register/form/learner-listing UI lifted from the prototype, 8-check RLS
  proof green (commit d933ef0). Also locked the WhatsApp-first production OTP
  decision into this file (78a8cce) and clarified: Supabase's WhatsApp channel is
  built in, but delivery needs the user's Twilio account + Meta business
  verification — wired at Step 6, test numbers until then. Session ended cleanly:
  session-log rule (Rule 10) added, everything committed and pushed.
- **Done so far:** Steps 0–3 — scaffold + CI, mobile-OTP auth (test numbers
  99999 99999 / 88888 88888, OTP 123456), tenant onboarding, classes.
- **Remaining:** Steps 4–6 (enrollment, discovery "near me", hardening & pilot),
  then later phases: payments, community, events, search.
- **Next session:** Step 4 — Enrollment: `enrollments` table + RLS, enroll/cancel
  server actions with capacity check (payments stubbed), learner "my classes" +
  studio roster UI lifted from the prototype.

## Structure

```
app/            → Next.js routes (thin — no business logic)
features/       → feature slices: components, server-actions, types
repositories/   → all database access, one module per domain
services/       → business logic orchestration
lib/            → shared helpers (auth, formatting)
components/ui/  → shared primitives
types/          → shared types
supabase/
  migrations/   → SQL migrations (never edit applied ones)
prototype/      → the reference prototype (read-only)
```

## Commands

```
pnpm dev        → run locally (http://localhost:3000)
pnpm build      → production build
pnpm lint       → eslint
pnpm typecheck  → tsc --noEmit
```

## Definition of Done (each slice)

- RLS proven with two test tenants (cross-tenant reads fail)
- Zod validation + server-side authorization on every action
- At least one test on the happy path
- Loading and error states in UI
- Demoable in the browser

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
