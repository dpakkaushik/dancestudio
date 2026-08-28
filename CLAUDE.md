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

- **Completed: 17 / 29 steps** (Steps 0–14).
  (The denominator grew from 27 as
  Step 12b was split out of Step 12, and again as Step 13b was split out of
  Step 13.) **Step 14 landed 28 Aug 2026: the calendar** — S_profiletab in its
  `calendarOnly` dress, lifted whole: the sticky block of controls (hero, room
  picker on a studio's, Schedule · Day · Week · Month, Train · Teach · Assist,
  the one date panel that folds open onto the month or the week) and the four
  views under it, every card the app's one class tile. Two routes, no backend:
  `/calendar` is a person's — bookings are Train, confirmed artist claims Teach,
  confirmed assistant claims Assist, all real rows — and
  `/business/{id}/calendar` is the studio's, every session of every live class,
  drafts included, room by room. The register's tool chips became a rail and
  gained Calendar; My classes gained a Calendar › door. Migrations are
  **unblocked again**: the DB password was reset and the pooler accepts it, and
  a `SUPABASE_ACCESS_TOKEN` in `.env.local` works against the management API as
  a fallback. **Step 13b part 2b landed 28 Aug 2026: the studio's money-IN half
  of S_earn** — GROSS · {month} counted from captured payments, the ▲/▼
  vs-last-month badge computed from the same months the statements print, the
  Net / Asked back / Refunded tiles, HOW STUDENTS PAID off the real
  `payments.method`, the period chips, and the past three months' statements
  (WHERE IT CAME FROM · DEDUCTIONS · Net settled · a real CSV download). No
  migration, no RPC, no policy: plain RLS-shaped reads of Step 9's rows. The
  sums live in the repository because this project's PostgREST has aggregates
  switched off (PGRST123), so the queries carry a 4,000-row runaway guard and
  the screen says so if it is ever hit; months are IST (proof check 4 pins the
  boundary). Buckets (b) — source bar / SHARE OF GROSS — and (c) — fee, GST,
  bank settlements — stay on the parity backlog by design. **Environment
  findings the same day (28 Aug 2026):** this machine has no pnpm (`npm run …`
  runs the same scripts); the `.env.local` keys are now Supabase's `sb_secret_`
  format and Supabase refuses a secret key from a browser-like user agent, so
  every proof script sets a custom UserAgent; and the DB password in
  `.env.local` was rejected by the pooler for half a session until the user
  reset it (a fresh reset takes a minute to reach the pooler). Step 13b
  part 2a landed 25 Aug 2026: the class page's Earnings
  tab** — S_class's WHAT THIS SESSION MADE (12008-12042), the one place a class's
  price, fill and refunds are added up. No migration, no RPC, no policy: it reads
  the orders/payments/refunds Step 9 already admits members to. One deliberate
  departure from the prototype, which the proof pins down: the prototype derives
  "Came in" as price × seats because it has no payments to count, and we count the
  captured payments instead — proven to differ (₹1,500 real vs ₹1,800 derived once
  a seat is comped). **This slice also found that the remaining 13b work is
  smaller than "the income half":** `Gross collected`, `Refunds issued`,
  `SHARE OF GROSS` and `HOW STUDENTS PAID` are all real queries today
  (`payments.method` exists). What actually waits on Razorpay is narrower — the
  `DanceOS fee · 0.9%` and `GST on fee · 18%` lines (a platform fee that does not
  exist), `TDS · 10%` (needs a rate the studio sets), and `PAYOUTS TO YOUR BANK`
  (settlements with no account behind them). Step 13 landed 25 Aug 2026: **earnings & payouts** — a per-session
  rate the OWNER sets on the ask, `payouts` + `payout_lines` where a line
  snapshots the rate paid so a session can never be paid twice and a rate change
  can never rewrite a settled payment, and both sides of the prototype's S_earn:
  the studio's pay ledger at /business/{id}/earnings and the teacher's own at
  /earnings. No money moves through code — the studio settles by bank or UPI and
  records it, which is the prototype's own limit ("DanceOS is not the thing that
  runs the payroll"). **Hardening landed 25 Aug 2026** (no new
  step): migration `20260825140000` moves the register's membership test into
  `can_run_register_for_class` itself, so a confirmed attendance claim grants the
  register only while its holder is still a live member — the guarantee no longer
  depends on `remove_tenant_member` remembering to close claims. Same migration
  shuts a deleted class's register for everybody. Proof checks 16–17.
- Step 12b landed 25 Aug 2026: **staff
  invites** — `tenant_invites` keyed on the **email address people sign in with**,
  the owner-only ask, the invited person's own accept, and the Staff & permissions
  desk at /business/{id}/staff with the prototype's QR kept. The class form's
  artist/assistant pickers finally have people to offer. Ops open as before:
  Razorpay keys, Resend domain, pilot invites.
- Step 12 landed 25 Aug 2026: the
  Studio CRM — a `leads` desk at /business/{id}/students with the prototype's own
  five stages (New · Quoted · Trial · Won · Lost), the open/enrolled funnel, and
  trials agreed against a real class **without faking an enrollment** (a learner
  still books their own seat). Leads are private: no public policy exists on the
  table at all.
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
- **Step 13b part 1 landed 25 Aug 2026: the refund settlement queue** — the hole
  is closed. Step 9's in-window `requested` refunds had no writer but the
  service-role webhook, so a learner's money sat in a queue with no door.
  `decide_refund` (approve / decline / reopen) + `settle_refund_offline` now open
  it, gated on `can_settle_refunds_for_class` (owner, or a confirmed claim
  holding the refunds job — **not** a plain trainer), and the class page has the
  prototype's Refunds tab.
- **Next: Step 15 — follows + public profiles** (Phase 3 opens). The public
  profile is `S_profiletab` with `publicEntity="studio"|"trainer"|"crew"`
  (`PubStudio` 19133, PUB presets 8641-8646); a follow needs a `follows` table +
  aggregate counts, so this is the first migration since the DB password was
  reset — re-test `db push --dry-run` first. The public schedule
  (`PubCal`, `calendarOnly pubSchedule`, 19140) hangs off that profile and was
  deliberately left out of Step 14 for it. What still stands of 13b is only
  parity, tracked in the backlog: **(b)** the source bar / SHARE OF GROSS /
  source chips wait for a second source (Step 21 tickets); **(c)** `DanceOS fee ·
  0.9%`, `GST on fee · 18%`, `TDS · 10%`, `PAYOUTS TO YOUR BANK` and the Settled /
  In transit tiles wait for a real Razorpay account — printing them first would
  be the half-truth the prototype's own comment at 18086-18092 was written about.

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
| 12b | Staff invites (split out of 12) | ✅ done (25 Aug 2026) |
| 13 | Earnings & payouts ⚠ | ✅ done (25 Aug 2026) |
| 13b | Earnings income half + refund settlement queue (split out of 13) ⚠ | ✅ done (28 Aug 2026) — source bar and fee/settlement lines stay on the parity backlog by design |
| 14 | Calendar views | ✅ done (28 Aug 2026) |
| 15 | Follows + public profiles | ⬜ ⬅ next |
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

### Step 12b — Staff invites ✅ (done 25 Aug 2026)
- Migration `20260825120000_create_tenant_invites.sql`: `tenant_invites` (tenant,
  name, **email**, member_role trainer|staff, unique `code`, status
  pending|accepted|declined|revoked, accepted_by/at, audit + soft delete). The
  prototype's settings footnote is the whole design in one line (18434): *"Payout
  approval is owner-only and can't be granted (§10.9) · attachments are
  consent-based: invite → accept."*
- **The handle is an email, because email is what DanceOS authenticates on
  today** (Step 6's magic link; mobile OTP is parked at Step 26). So an invite
  reaches its person two ways, both ending in the same consent: it appears in-app
  for whoever signs in with that address (`my_pending_invites`, matched on
  `auth.users.email` via `my_auth_email()`), and the owner can show or send the
  `/join/{code}` link — the prototype's **QR arm**, kept as a real drawn square.
  **Possession of the link is never enough:** `accept_tenant_invite` demands the
  signed-in email match, so a forwarded link cannot walk into a business that
  handles money. `preview_tenant_invite` masks the address (`s***@example.com`)
  so a link-holder never learns somebody else's email.
- RLS: members read their own desk; **no public policy, and no policy for the
  invitee either** — an invite carries an email address, so the table is
  business-private and the invited person meets their invite only through the
  definer functions (which hand back one invite, never the list). No
  insert/update/delete policies at all: `invite_to_tenant` / `revoke_tenant_invite`
  (owner-only), `accept_tenant_invite` / `decline_tenant_invite` (the person
  asked, only), `set_member_role` / `remove_tenant_member` (owner-only).
  `owner` is not a grantable role on any path.
- **`remove_tenant_member` closes the person's `class_claims` in the same act.**
  Step 11's `can_run_register_for_class` has a second branch that reads a
  confirmed attendance claim **without re-checking membership** — so a removed
  assistant would have kept running the register. **Lesson: when a permission can
  be granted by two independent paths, revoking the membership must revoke the
  grant too — or "removed" doesn't mean removed.** Proof check 14 asserts exactly
  this (ran the register → removed → register lost).
- **Latent bug this slice exposed and fixed:** `findMyMembershipRole` leaned on
  `tenant_members` RLS meaning "my rows", but Step 11 let a tenant's members read
  each other. With one member per studio it never fired; the moment a second
  person joined it matched several rows and `maybeSingle()` threw
  ("multiple (or no) rows returned"), **500ing the public class page for members**.
  It now says `user_id = auth.uid()` out loud, like `findMyTenants`. **This is the
  third time this exact lesson has cost us a bug — RLS is a ceiling, not a
  scoping mechanism.** Audited: `tenant_members` is touched nowhere else, and every
  other `maybeSingle()` in `/repositories` is keyed on `id` or the unique
  `share_slug`.
- `components/ui/QRBlock.tsx`: the drawn code square lifted out of PassSheet
  (first shared UI primitive) so the invite wears the same one.
- Repository `repositories/invites.ts`, Zod actions
  `features/staff/server-actions/staff.ts`, UI
  `features/staff/components/StaffDesk.tsx` at `/business/{id}/staff` (the
  prototype's Staff & permissions cards 18428-18433 with the Admin/Staff level
  badge, the footnote verbatim, the dashed ＋ Invite button, the "⏳ Invited"
  treatment from 18578, and the QR/link sheet) plus
  `features/staff/components/JoinInvite.tsx` at `/join/{code}` wearing the same
  gold "you've been asked" card the class page uses (15455). Home shows incoming
  asks above RUN YOUR BUSINESS; the register gained a **Staff ›** chip.
- Verified: `scripts/rls-proof-staff.ps1` — 15 checks green (owner invites with a
  normalised email, owner not grantable, rival cannot invite in, public/rival/
  invitee all read 0 rows off the table, the invitee finds their own invite, a
  link-holder cannot accept, preview masks the address, accept makes the seat, a
  re-invite of a member is refused, a trainer can neither invite nor remove,
  role change works but promotion to owner is refused, an owner cannot be removed,
  **removal takes the register with it**, bogus and withdrawn codes are dead).
  The proof mints real email accounts through the admin API — test phone numbers
  have no address for an invite to find. e2e extended: the owner invites an email
  with **no account yet**, sees the QR, that person signs up, finds the ask on
  Home, accepts, and then appears in the class form's artist picker.

### Step 13 — Earnings & payouts ⚠ ✅ (done 25 Aug 2026)
- **The prototype's own limit, honoured.** S_earn's closing line is
  `/* S_payroll — a 133-line payroll desk, removed with the feature. A studio
  pays its faculty; DanceOS is not the thing that runs the payroll. */` So this
  slice builds **no payroll engine**: no pay cycles, no batch runs, no payslips,
  no approval chains. It adds ONE write — the studio records a settlement it has
  already made — because that single record is the only thing that can make the
  prototype's own "WHO HAS PAID YOU" rows true (dosEarnPayouts, 17950-17961).
- **Nor does money move through code.** Step 9's rail is collection-only: one
  platform key pair in `lib/razorpay/api.ts`, so class fees land in the
  PLATFORM's Razorpay account. Paying a third party needs a payout rail we do
  not have — Route (splits at capture; fits a revenue share) or RazorpayX (true
  payouts; fits a fixed per-session rate) — and no Razorpay account exists yet.
  So `payouts` carries a nullable `provider_ref` and states that match both the
  prototype's words and a rail's lifecycle (`done | in_transit | on_hold |
  failed`), and switching a rail on later fills fields this ledger already has.
- Migration `20260825160000_create_payouts.sql`:
  - `class_claims.pay_per_session_inr` — **the OWNER's number**, set per person
    per class (an artist and an assistant on the same class can be paid
    differently; 0 is a real answer). The prototype's ₹900/₹1,300 are sample
    rows, not constants: what is lifted is the grammar `sessions × rate =
    amount`. It rides the ask, so the person confirming sees what they are
    agreeing to.
  - `payouts` (tenant, payee → profiles, amount, status, method, provider_ref,
    paid_on, note) + `payout_lines` (which sessions a payout covered, each with
    the **rate actually paid**). RLS: **the owner and the payee only** — not
    every member, because a trainer has no business reading another trainer's
    pay (deliberately unlike `leads`, where staff answer the phone so staff read
    the desk). No insert/update/delete policies at all.
  - The integrity spine: `payout_lines` carries a unique index on
    `(session_id, user_id) where deleted_at is null`, so **a session can never be
    paid twice** — and because a line snapshots its rate, **raising a rate later
    cannot rewrite what was already settled**.
  - `record_payout` counts the amount from the rates on record (Step 9's rule
    kept: the client never states an amount) and refuses sessions that have not
    ended, sessions belonging to another studio, and totals of zero. It reads
    the claim **regardless of `deleted_at`**, because Step 12b's removal closes a
    person's claims and *the work still happened* — somebody taken off the team
    is still owed for the sessions they taught.
  - `set_claim_pay` is separate from `set_claim_powers` on purpose: attendance
    and refunds are jobs an owner OR trainer hands out, but what a session pays
    is the owner's alone (18434). `claim_person` gained the rate with a default
    and was **dropped and recreated, not overloaded** (Step 11's lesson), so the
    ten existing five-argument callers still resolve — proven by re-running the
    Step 11 and 12b scripts.
  - `void_payout` releases a mis-recorded payment's sessions and soft-deletes
    both sides, so the mistake stays readable.
- Repository `repositories/payouts.ts` (the owner's ledger and the teacher's own,
  both plain RLS-shaped reads), `types/payout.ts`, Zod actions in
  `features/payouts/server-actions/payouts.ts`. Accrual has a cutoff: a claim
  stops earning the moment it is closed, so a removed assistant is owed for what
  they taught and not for what ran afterwards.
- UI lifted from S_earn (17877-18205) as a shared kit (`earnings-kit.tsx`: the
  green hero, the money card with its stacked bar built FROM the rows, the three
  counted tiles, the ledger block whose row opens into WHO, the settlement row
  painted by state): **the studio's pay desk** at `/business/{id}/earnings`
  (owner-only, server-checked, reachable by a new **Earnings ›** chip on the
  register) with the record-a-payment sheet and per-payment void, and **the
  teacher's own earnings** at `/earnings` — the prototype is explicit that these
  are two different ledgers ("A STUDIO is a business… AN ARTIST is a person…
  PAID BY studios"), never a studio's P&L with your name on it. The class form's
  step 2 gained the rate field, owner-only.
- Verified: `scripts/rls-proof-payouts.ps1` — 14 checks green (owner sets the
  rate; a trainer can neither attach nor change one; no direct writes even by the
  owner; a trainer cannot record; a future session cannot be paid; two sessions
  counted server-side to ₹1,800; **the same session cannot be paid twice**; payee
  reads their own while rival, teammate and public read none; **a rate rise
  leaves a settled payout at ₹1,800 on a ₹900 line**; void releases the session;
  **removed from the team and still paid**; zero-rate sessions cannot become a
  payout; a rival's session cannot be paid from your ledger). Regressions re-run
  green: rooms-people (13), staff+hardening (17). e2e extended — the owner puts
  the invited trainer on the class **at ₹900**, then the earnings desk and the
  teacher's own screen both load (which is what actually exercises the new
  PostgREST embeds; the proof script queries the API directly and would never
  catch a bad one). typecheck / lint / production build / both specs green.

### Step 13b part 1 — the refund settlement queue ⚠ ✅ (done 25 Aug 2026)
- **The hole.** Step 9 files a cancellation inside the 48 h window as
  `requested` — "the studio decides" — and then the only writer of that row was
  `apply_refund_update`, which is **service_role only** (the webhook). No
  authenticated path existed, so a learner who cancelled in-window had their seat
  taken back and their money left in a queue nobody could reach. Silent, and on
  the customer's side of the till.
- Migration `20260825180000_refund_settlement_queue.sql`:
  - `declined` added to the refunds status check. A studio saying no inside its
    own policy window is a **decision**; recording it as `failed` would have
    claimed the rail broke, which is a different fact. Plus `decided_at`,
    `decision_note`, and `settled_offline` — because a cash refund handed back at
    the desk must not be indistinguishable from one Razorpay actually processed.
  - `can_settle_refunds_for_class`: the owner, **or a confirmed claim holding the
    refunds job** (prototype 12710, "Manages refunds · Sees refund requests
    against this class and settles them"). A plain trainer is deliberately NOT
    admitted — the job is grantable per class precisely because settling money is
    not implied by being a trainer, and unlike payout approval (owner-only,
    ungrantable, §10.9) this one *is* grantable. **The membership re-check is in
    the claim branch from the start** — 20260825140000 had to go back and add it
    to `can_run_register_for_class`, and the lesson was cheaper to apply than to
    relearn.
  - `decide_refund` (approve / decline / reopen — the transitions stated once)
    and `settle_refund_offline` (the prototype's "Mark refunded", refused once a
    `razorpay_refund_id` exists, because then the rail owns the outcome).
  - `attach_settled_refund_reference` — **a real find:** Step 9's
    `attach_razorpay_refund` is scoped `user_id = auth.uid()`, the LEARNER's own
    cancel path, so a studio approving somebody else's refund could never have
    bound the rail id with it. That would have thrown at runtime, after the money
    moved. The settler needs their own bind.
- Approving does not move money inside the database: the row goes to `pending`
  and the action fires the Razorpay refund, exactly as `cancelBookingAction`
  already did. A failed call or missing keys leaves the row `pending` and still
  on the queue — ledgered rather than lost — and Razorpay's `refund.processed`
  event is what finally closes it, so the action never claims the money landed.
- Repository `repositories/refunds.ts`, `types/refund.ts`, Zod actions in
  `features/payments/server-actions/refunds.ts`, UI
  `features/payments/components/RefundQueue.tsx` lifted from S_class 12219-12262
  (the TO SETTLE / OWED / PAID SEATS tiles, "Refund all N · ₹X" when more than
  one waits, and the per-status Approve / Decline / Mark refunded / Reopen row),
  hung on the class page as the prototype's own **Refunds** owner segment
  (SEGS 11755-11757). The tab is only drawn for somebody who may actually settle.
- Verified: `scripts/rls-proof-refunds.ps1` — 12 checks green (the in-window
  request is filed; the learner cannot decide their own; a trainer without the
  job cannot; a rival cannot; the owner approves to `pending` with the payment id
  known; re-approving is refused; the job holder declines and reopens; **the seat
  pulled behind the RPC's back stops the job working while the claim stays
  live**; cash marked refunded flips the order too; a refund already with
  Razorpay cannot be closed by hand; a direct PATCH changes nothing; the learner
  reads their own decision and nobody else's). Step 9's payments proof re-run
  green (12) — the constraint change touched it. typecheck / lint / build / both
  e2e specs green; the owner's own visit to /c/{slug} in the happy path is what
  exercises the new `orders!inner` embed.

### Step 13b part 2a — the class page's Earnings tab ⚠ ✅ (done 25 Aug 2026)
- **No migration.** This slice adds no table, no RPC and no policy: it reads the
  `orders` / `payments` / `refunds` that Step 9 already admits a tenant's members
  to, and adds them up. `findClassMoney` in `repositories/payments.ts` joins
  through `orders!inner (class_id)` — the same spine `findRefundsByClass` rides,
  since payments carry no class_id.
- UI lifted from S_class 12008-12042 as
  `features/payments/components/ClassEarnings.tsx`: the style-edged card, WHAT
  THIS SESSION MADE, the net in DOS_DISPLAY (green, or the prototype's softer red
  `#F87171` when it goes negative), the "after ₹X refunded" line, the five dotted
  rows (Seats taken · Price a seat · Came in · Refunded · Still being asked for)
  and "See it beside everything else you earn ›" — a real `Link` to
  /business/{id}/earnings where the prototype fires `__DOSNAV("earn")`. Hung on
  the class page as the **Earnings** segment, placed between Attendance and
  Refunds exactly as the prototype's SEGS orders them (11757).
- **Owner-only, and honest about what that means.** The prototype gates Earnings
  on `isMine` while Attendance and Refunds ride grantable jobs, so the tab is the
  owner's alone. That is a *presentation* gate: Step 9's RLS admits every member
  of the tenant to these rows, so a trainer can still read the takings through the
  API. Proof check 9 asserts exactly that, so nobody later mistakes the tab for a
  wall — narrowing it is an RLS change to Step 9, not a UI change here.
- **The one departure from the prototype.** It computes `gotIn = price × seats`
  because it has no payments to count. We have them, and "Came in" is a claim
  about money, so it sums the payments actually captured — a comped or unpaid seat
  cannot inflate what a class made. A payment later refunded still counts as
  came-in, with the refund on its own line beneath, which is how the prototype
  prints them. Declined and failed refunds are in neither total, matching its own
  filters (only Paid, and Requested + Processing).
- Verified: `scripts/rls-proof-class-earnings.ps1` — 9 checks green first run
  (free class honestly zero; **came-in counts 5 captured payments at ₹1,500 where
  price × 6 orders would have said ₹1,800**; a settled refund leaves gross intact
  and nets ₹1,200; an open request is owed not refunded; declined in neither;
  failed in neither; a rival's takings stay out; rival and public read nothing;
  and the documented non-boundary). Regressions re-run green: Step 9 payments
  (12) and the refund queue (12). e2e extended — the owner opens the Earnings tab
  from the class page and the learner never sees it; that visit is what exercises
  the new embeds, which a script querying PostgREST directly would never catch.
  typecheck / lint / production build / both specs green.
- **A finding worth recording, not building:** the parity backlog's "the learner's
  own view of a refund decision" has no prototype screen to lift. The prototype's
  only learner-side refund UI is the RefundSheet that *files* the request; the
  decision lives on the studio's Refunds tab and S_refunds ledger, both
  business-side. There is an unrendered `REFUNDS` array at 8506 that looks like a
  learner's list ("₹400 · refunded ✓", "₹499 · processing…") but nothing consumes
  it — its literals appear nowhere else in the file. So closing that gap needs a
  product decision about a new screen, not a lift, and it stays on the backlog
  marked as such rather than being invented.

### Step 13b part 2b — the studio's money IN ⚠ ✅ (done 28 Aug 2026)
- **No migration, again — but for a reason that was checked, not assumed.** The
  natural way to sum a month is an aggregate, and this project's PostgREST has
  them switched off (`PGRST123 Use of aggregate functions is not allowed`); a
  SQL rollup function would have been a migration, and **no migration can be
  applied from this machine today** (below). So `findTenantIncome` in
  `repositories/income.ts` reads the rows and sums them here, over a window of
  this month plus the three before it (the prototype's period chips, 17988),
  with a 4,000-row **runaway guard, not a page size** — part 2a's precedent: the
  card states one total, so a partial sum is a wrong number rather than a short
  list. If a query ever fills the guard, `complete` goes false and the screen
  prints "Counting the latest 4,000 rows only" instead of a figure that looks
  finished. An aggregate RPC is the right follow-up once migrations can land.
- **Months are IST.** `lib/format/month.ts` (pure: the clock is handed in) keys
  every payment by its IST calendar month — 00:15 on the 1st in India is 18:45
  on the last day of the previous month in UTC, and proof check 4 plants a
  payment exactly there and shows the two readings disagree. A processed refund
  belongs to the month it was DECIDED (an approval or a desk settlement), or,
  for the rail's own auto-refunds nobody decided, the month the row last moved.
- **What the numbers are.** Gross = captured payments (a later-refunded payment
  still came in; its refund is a deduction beneath — the prototype prints them
  that way). Refunded = processed refunds in the month. Asked back = refunds
  `requested` or `pending` right now, whatever month they were filed — a live
  queue figure, like the prototype's In transit tile. Declined and failed are in
  neither total, matching its own filters. The **▲/▼ vs last month** pill is
  computed from the same month the statements print and is not drawn when last
  month took nothing — "a number that can only ever be good news is not a
  measurement" (17996-18002). The statement's Deductions hold only Refunds
  because we charge no fee, so `Net settled = Gross − Refunds` is a true sentence.
- UI lifted from S_earn into `features/payouts/components/StudioIncome.tsx` and
  composed in `EarningsDesk.tsx` as the top half of `/business/{id}/earnings`
  (owner-only, server-checked, as before): the period chips (17988-17992),
  GROSS · {MONTH} via the kit's `MoneyCard` with a new `badge` slot
  (17993-18011), the three tiles — **Net and Asked back stand in for the
  prototype's Settled / In transit**, which count bank settlements that do not
  exist without a Razorpay account, beside its own REFUNDED (18037-18049) —
  HOW STUDENTS PAID with the prototype's method tints (18171-18178, shares of
  the money), and in the past-month view the statements (18055-18082) with WHERE
  IT CAME FROM (one source today — Classes), DEDUCTIONS, Net settled and
  **Download statement ↓, which writes a real CSV** rather than firing the
  prototype's demo toast. Its sub-line counts payments where the prototype
  counts bank payouts — the real number we have. Deliberately absent: the source
  bar / SHARE OF GROSS / source chips (bucket b), the fee / GST / settlement
  lines and "Settles T+2" subtitle (bucket c), Open invoices (later slice).
- Verified: `scripts/rls-proof-studio-income.ps1` — 13 checks green (empty
  studio is honestly zero; four payments by three methods sum to gross and split
  HOW STUDENTS PAID; a payment moved into last month separates the badge's two
  inputs, ₹300 vs ₹900 → +200%; **the IST boundary**; a failed payment adds
  nothing; a desk-settled refund deducts while gross stands; an open request is
  asked back; declined and failed in neither total; a rival's takings stay out
  and its own screen counts only its own; rival and public read zero rows;
  **a trainer still reads the takings — the owner-only screen is the
  prototype's presentation gate, not a wall**; a payment older than the window
  is outside the read while an unbounded read finds it). Regressions re-run
  green: payments (12), refunds (12), class earnings (9). e2e: the happy path
  opens the GROSS card, the empty HOW STUDENTS PAID, a past month's statement
  and back; the paid-webhook spec now signs the owner in through the real
  screens (test number, OTP typed into the hidden input) and finds the one
  captured payment as ₹300 and "UPI 100%" — the only place a REAL payment meets
  these queries. typecheck / lint / production build / both specs green.
- **Environment lessons (28 Aug 2026), all three hit before the first check
  ran:** (1) `.env.local` now holds Supabase's new-format keys and **Supabase
  refuses an `sb_secret_` key from a browser-like user agent** — PowerShell 5.1's
  `Invoke-RestMethod` announces itself as `Mozilla/5.0`, so every `scripts/*.ps1`
  now sets `$PSDefaultParameterValues` with a `danceos-proof` UserAgent right
  after `$ErrorActionPreference`; keep that line in new scripts. (2) This machine
  has no pnpm; `npm run typecheck|lint|build|dev` and `npx playwright test` run
  the same scripts, and Playwright needed `npx playwright install chromium`;
  start `npm run dev` before the e2e (the config reuses a running server).
  (3) **`SUPABASE_DB_PASSWORD` is rejected by the pooler** (`password
  authentication failed`), the direct host is IPv6-only and does not resolve
  here, the CLI is unlinked and there is no access token — so **migrations are
  blocked until the password is reset in the Supabase dashboard** (Database →
  Settings → reset) or a `SUPABASE_ACCESS_TOKEN` is supplied. Steps 15+ need
  schema; Step 14 does not.

### Step 14 — Calendar views ✅ (done 28 Aug 2026)
- **No migration, no RPC, no policy.** A calendar is class sessions read through
  rows that already exist, under the RLS Steps 3, 4 and 11 set. Every query in
  `repositories/calendar.ts` says whose rows it wants out loud (`user_id = …`,
  `tenant_id = …`) — a person who is both a learner and a studio's member can
  read far more than their own rows, and RLS is a ceiling, not a scope.
  Reads are windowed (two months back, three ahead, `lib/format/month.ts`
  `monthsWindow`) with a runaway guard; seats come from the aggregate-only
  `session_seat_counts`.
- **The prototype's three sides are real rows here.** "A dancer does not attend
  a class, they TRAIN; a teacher does not host one, they TEACH" (DOS_SIDES 6666):
  a live booking is Train, a confirmed artist claim is Teach, a confirmed
  assistant claim is Assist, and teaching outranks assisting on the same session
  (the classifier's order, 8899). `types/calendar.ts` carries the IST `dayKey`
  and `hour` on every entry, computed once in the repository, so the client never
  runs a clock or a time-zone conversion during render.
- **Two routes, one screen.** `features/calendar/components/CalendarScreen.tsx`
  is S_profiletab's `calendarOnly` render (10530) lifted whole: the sticky block
  (`data-dos-sticky`, 9058) with the hero in the calendar's own paint (DOS_TOOLS
  2932), the room picker on a studio's calendar — a studio with more than one
  room opens on its first, "All rooms" being a deliberate act (8655) — the
  Schedule · Day · Week · Month switcher, Train · Teach · Assist with counts that
  follow the view, and the one date panel every view shares (9157-9300: title,
  TODAY, Today, ‹ ›, folding open onto a Monday-first month grid or the week
  strip, dots per day in style colours, the page frozen beneath it). Under it:
  Schedule (day gutter, TODAY divider, scroll-to-today measured against what is
  pinned — `dosScrollTo` 1517), Day (an 8 am–9 pm rail widened by the hours the
  day actually uses), Week and Month (the day you picked, named and counted).
  Cards are `ClassTile`; a person's carry the side pill and, for Train, the
  EnrollButton. `/calendar` (from My classes' new Calendar › door) and
  `/business/{id}/calendar` (from the register's chip rail — now a scrollable
  rail, Calendar first, as the prototype's studio deck opens "Classes · Calendar
  ›" side by side, 7140-7148) with the compose FAB offering Add class only — an
  event is Step 21's, absent rather than refused (10541).
- **Deliberately not lifted, tracked in the backlog:** the Classes/Events switch
  above the sides (events don't exist), the hold-to-reorder gesture on the side
  pills (a saved preference that also drives Home's deck order — Home parity),
  the History chip (the record page is Step 25's), `pubSchedule` (hangs off a
  public profile, Step 15), and `__DOSCALSTATE` (view + day remembered across
  drill-ins; ours is component state). A studio's calendar draws no sides: a
  venue is not a person on the floor.
- **Fixed in passing (⚠ RLS):** `findMyPendingClaims` filtered on
  `status = 'asked'` with no `user_id`, so under Step 11's members-read-their-
  tenant policy a studio owner would have been shown the asks the studio SENT as
  asks waiting for them. No caller had reached it yet. The fourth time this
  lesson has surfaced; it now says `user_id = auth.uid()` out loud.
- Verified: typecheck / lint / production build green. e2e extended — the owner
  opens the studio calendar from the register, finds the class three days out on
  the Schedule, sees Month open on today with "nothing on" and Day draw its
  8 am rail; the learner opens their calendar from My classes and finds the
  booking as **Train: 1 · Teach: 0**. The paid-webhook spec's UI sign-in gained a
  retry: Supabase rate-limits a second OTP request for the same test number
  moments after the spec's API half made one ("you can only request this after
  N seconds"), and the first run only passed because a cold dev server was slow.
  **Lesson: this working copy is CRLF and the Edit tool inserts LF, so files
  end up mixed — script patches must match on content, not on line endings
  (git normalises on commit).**

### Hardening — the register re-checks membership ✅ (25 Aug 2026, no new step)
- Migration `20260825140000_harden_register_claim_check.sql` (⚠ auth/RLS, Rule 9):
  `can_run_register_for_class`'s claim branch now joins `tenant_members`, so a
  confirmed attendance claim opens the register **only while its holder is still
  a live member** of the studio that owns the class. Step 12b had closed the same
  hole at the revocation site (`remove_tenant_member` soft-deletes the person's
  claims in the same act) — a real guarantee, since `tenant_members` carries only
  SELECT policies and that RPC is the one way a seat can end, but the **weak**
  form of it: it held only because every path that ends a membership also closed
  the claims. **Lesson: put the test where the decision is made, not only where
  the grant is revoked — a defence that depends on every future caller
  remembering something reopens silently, and stays invisible until somebody hits
  it.** The function only ever loses authority (signature, volatility, definer
  status and grants unchanged), so check_in / undo_check_in / give_spot /
  remove_from_waitlist inherited the stricter test untouched.
- Second tightening in the same migration: the claim branch never filtered
  soft-deleted classes while the membership branch always did, so an assistant
  could run the register on a class the studio had deleted. Both branches now
  read live classes only.
- Step 11's feature is intact by construction: `claim_person` only ever asks your
  own team, so every legitimate claim holder is a member — a **staff** assistant
  handed attendance still runs the register (rooms/people proof check 11).
- Verified: `scripts/rls-proof-staff.ps1` now 17 checks green. **Check 16 is the
  one that matters** — it soft-deletes the membership row **directly with the
  service role, bypassing the RPC entirely** (exactly like a future offboarding
  job that forgets about claims), leaving the claim live, and the register shuts
  anyway; reviving the seat brings it back, which is what proves the membership
  test is what moved. Check 17: a deleted class has no register for assistant or
  owner. Regressions re-run green: `rls-proof-attendance.ps1` (10) and
  `rls-proof-rooms-people.ps1` (13). typecheck / lint / production build / both
  e2e specs green.

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
| Refunds: the learner's own view of a decision. **No prototype screen exists to lift** — its only learner-side refund UI files the request (RefundSheet); the decision lives business-side. The learner-shaped `REFUNDS` array at 8506 is never rendered (its literals appear nowhere else). Needs a product decision, not a lift. | — (gap in the prototype itself) | unscheduled — decide first |
| Earnings: `Earnings by source` / SHARE OF GROSS, the stacked source bar and the source filter chips; the month statement's WHERE IT CAME FROM prints its one real source row (Classes) for the same reason. Real, but the studio ledger's other three sources (tickets, packages, room rentals) don't exist — today it would be one bar reading "Classes 100%" and a filter that filters nothing | S_earn 18020-18026, 18050-18053, 18139-18155 | after Step 21 (needs a second source to mean anything) |
| Earnings: the Settled / In transit tiles (they count bank settlements) and the gross card's "Settles T+2 · DanceOS fee 0.9% at source" subtitle. Today the GROSS card's first two tiles read **Net** and **Asked back** — the two real states of this money — beside REFUNDED | S_earn 18014, 18037-18047 | blocked with the deductions panel below |
| Earnings: the deductions + settlement panel only — `DanceOS fee · 0.9%`, `GST on fee · 18%`, `PAYOUTS TO YOUR BANK`, and the statements' Fee / GST deduction rows (Deductions hold only Refunds today, which is the truth) | S_earn 18156-18183 | blocked on a real Razorpay account (a platform fee that does not exist, and settlements with no account behind them) |
| Earnings: the artist's TDS 10% line and WHAT REACHES YOU panel | S_earn 18178-18190 | blocked: needs a withholding rate the studio sets — not a tax engine |
| Earnings: the statement sub-line counts payments where the prototype counts bank payouts; the earnings period state is component state, not the prototype's `__DOSEARNSTATE` memory across drill-ins | S_earn 18062, 17880 | with the settlement panel above; the memory if a drill-in ever leaves the page |
| Earnings: "Open invoices" (the past-months view's button) and the ALSO COLLECTED enquiries card | S_earn 18084, 18124 | later slices (invoices, event enquiry desk) |
| Class detail page: WHAT YOU'LL DANCE (routine/notes/songs) | S_class 12278-12354 | later slice (needs a routine field) |
| Poster uploads (PosterCropper + Storage) and the "None" poster — the three drawn designs ship | PosterCropper, dosPosterOf 129-135 | media slice (Step 20 rails) |
| Invite by **mobile** and by QR **scan** — the invite handle is an email (what we authenticate on) and the QR is drawn, not yet scannable | invite sheet 18435 "QR / mobile / search" | Step 26 (WhatsApp OTP) + the camera work |
| Staff & permissions: per-person permission grants (the prototype's "enquiries ✓ scanner ✓ classes ✓" are per-role words today, not individually toggled) | settings 18428-18429 | later slice |
| Leads: the event-enquiry desk (celebrations/corporate/judge/collab types, quotes, in vs out) — the STUDENT pipeline ships | ENQ_TYPES 4902, S_enqdetail 5380 | later slice |
| Pay sheet: pass + cash methods, POLICY Memberships row; invoice Download PDF | S_class 12471-12507 + 12401, InvoiceSheet 6249 | passes (Phase 2/3), PDF with Step 13 |
| Register: walk-in add + the QR scanner (needs the student pool); the pass QR is drawn, not scannable yet | attend 12104-12116, PassSheet 6209 | Steps 11-12 (people); real scanning later |
| Class form: DosDatePick calendar (the native date input ships), searchable style dropdown, refund-cutoff + memberships toggles | S_classform 15317, 15336-15360, 15520-15528 | Step 13 (money policy) |
| Class card: poster art, live chips, share action on the home-deck card, undo toasts | BookingCard 7969 | Steps 10-11 |
| Studio desk: the Studio Tools grid on a studio Home (S_homebiz 7133-7160) — today the register's chip rail (Calendar · Students · Rooms · Staff · Earnings) opens the same doors; Reports/Expenses/Assets have no slice | S_bizhub/BizShell, S_homebiz | Home parity slice (Reports with Step 25) |
| Discover: style filter rail, sort, crews tab, follower counts, studio photos, map view | S_discover 4100+ | Steps 15 (counts), 22 (crews), 23 (filters/sort/map) |
| Calendar: the Classes/Events switch above the sides (events do not exist yet) | SideTiles 6836 | Step 21 |
| Calendar: hold-to-reorder on the side pills (a saved preference that also decides which side Home opens on), and `__DOSCALSTATE` remembering view + day across drill-ins | DosSidePill 6700, 8651 | Home parity slice |
| Calendar: the History chip in the hero (opens the record page) | 9070-9074 | Step 25 (record / stats) |
| Calendar: the public schedule (`pubSchedule` — published, upcoming classes only, one view, no switcher) | PubCal 19140, isPublishedClass 8902 | Step 15 (hangs off the public profile) |

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
| 14 | Calendar views (learner + studio) | none new — reads sessions | **Not a standalone screen** (found 25 Aug 2026): the calendar IS `S_profiletab` behind a flag — `CalTab=()=><S_profiletab calendarOnly/>` (19146) and `PubCal=()=><S_profiletab calendarOnly pubSchedule/>` (19140). Its parts: `calManage` 8845, `calSection` 9057, `calSheetEl` 9359, day/month/schedule views (7655), and the tile is `CalTile=BookingCard` (8505), already built. Backend is genuinely nothing; the UI is a large lift out of a screen the parity backlog otherwise defers to Phase 3, so budget for it. |

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
    the same push or the immediately following one: steps complete / 28, what
    just landed, and what's next. The tracker and the step table must always
    match reality — a stale tracker is a bug.

## Session log

Four lines per session, written when the user ends it. The step records above hold
the technical detail; this log is the at-a-glance history.

### 25 Aug 2026
- **This session:** Steps 11, 12 and 12b, then a hardening pass. Step 11 — rooms
  & people (`rooms` + `class_claims`, capacity cap and no double-booking enforced
  by triggers, two-sided consent on claims, the class form as the prototype's
  two-step wizard; 13-check proof, commit ac57db0). Step 12 — the Studio CRM
  leads desk with the prototype's five stages, and the deliberate non-feature: a
  studio cannot book a seat for somebody, so a "trial" records the class and the
  day instead of faking an enrollment (10 checks, 531b493). Step 12b — staff
  invites keyed on the email people sign in with, owner-only ask, the invited
  person's own accept, `/join/{code}` + the drawn QR (15 checks, 47ed215); it
  exposed and fixed the third instance of the RLS-is-a-ceiling bug
  (`findMyMembershipRole` 500ing the public class page once a studio had two
  members). Finished with migration `20260825140000`: the register's membership
  test moved **into** `can_run_register_for_class`, so an attendance claim no
  longer outlives the seat behind it whatever ends the seat, and a deleted class
  has no register (staff proof now 17 checks; attendance and rooms/people proofs
  re-run green; typecheck / lint / build / both e2e specs green). Then **Step 13
  — earnings & payouts ⚠**: an owner-set per-session rate on the claim, `payouts`
  + `payout_lines` whose snapshot makes double-paying a session impossible and a
  rate change unable to rewrite a settled payment, and both sides of S_earn (the
  studio's pay desk, the teacher's own earnings). Deliberately no payroll engine
  and no money movement — the prototype deleted its own payroll desk, and Step
  9's rail only collects. 14-check proof green, both regressions re-run green.
- **Done so far:** Steps 0–13 (15 / 29) plus that hardening. Studios can be
  created, staffed by invite, given rooms, run classes with real people, posters
  and per-session pay, take free bookings (paid ones wait on Razorpay keys), run
  an attendance register with a waitlist queue, work a leads pipeline, and settle
  what they owe the people who taught.
  Then **Step 13b part 1 — the refund settlement queue**, closing the hole Step 13
  surfaced: in-window refunds were filed as `requested` with no writer but the
  webhook, so a learner's money had no door. `decide_refund` +
  `settle_refund_offline` behind `can_settle_refunds_for_class` (owner, or the
  refunds job — not a plain trainer), the prototype's Refunds tab on the class
  page, 12 checks green, Step 9's proof re-run green. It also caught that Step 9's
  `attach_razorpay_refund` is payer-scoped, so a studio could never have bound
  the rail id — that would have thrown after the money moved.
- **Remaining:** Step 13b part 2 (S_earn's income half + the class page's
  Earnings tab, both waiting on a real Razorpay account), then 14–26. Ops still open, all needing the
  user's accounts: Razorpay account + keys and the webhook registration, a
  verified Resend sending domain (sign-in email currently reaches only the Resend
  account owner), pilot studio invites. Plus the UI parity backlog, which grew by
  six tracked Step 13b entries.
- **Next session:** Step 13b — **lead with the refund settlement queue**: Step 9
  files in-window refunds as `requested` for the studio to decide and nothing in
  the app can settle them, so a learner's refund request has no path today. Then
  S_earn's money-IN half for a studio and the month statements (both wait on a
  real Razorpay account, since printing "settles T+2 · fee 0.9%" before one
  exists would be a promise rather than a fact).

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
