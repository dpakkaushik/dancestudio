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

| Step | Slice | Status |
|------|-------|--------|
| 0 | Foundations: repo restructure, Next.js scaffold, CI | ✅ done (commit 817d01a) |
| 1 | Auth + identity (mobile-OTP login) | ✅ done (18 Aug 2026) |
| 2 | Tenant onboarding | ✅ done (18 Aug 2026) |
| 3 | Classes | ✅ done (19 Aug 2026) |
| 4 | Enrollment | ✅ done (24 Aug 2026) |
| 5 | Discovery ("near me") | ✅ done (24 Aug 2026) |
| 6 | Hardening & pilot | ⬅ next |

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
- Remaining: verify a sending domain in Resend (needed before real users can
  receive links); real OTP delivery **parked** — WhatsApp-first (Twilio Verify;
  Meta business verification + template) with SMS fallback (DLT registration);
  add the production URL to `uri_allow_list` at deploy
- Remaining: deploy to Vercel; invite 1–2 real studios as pilots

### UI parity backlog — gaps vs the prototype, tracked so none is forgotten

Rule 2 says the prototype's UI is the spec. These are the known, deliberate gaps
between the built screens and their prototype counterparts, each tagged with the
slice that closes it. **Add to this list whenever a screen ships simplified;
remove entries as they close.**

| Gap | Prototype ref | Closes with |
|-----|--------------|-------------|
| App chrome: bottom tab bar (Home·Discover·Create·Calendar·Profile), top bar, theme system | shell/nav | Step 6 polish |
| Home screen: sleeves, live-now chips, greeting, tools — current home is identity header + row links | Home 7248+ | Step 6 polish |
| Class detail page (poster, artist, add-ons, share/booking link) — booking is on the tile today | S_class | Phase 2 (attendance slice) |
| Class form: two-step wizard, DosDatePick calendar, room picker from studio rooms, artist/assistant claims, posters | S_classform 15108 | ERP slice (rooms/people) |
| Class card: poster art, live chips, share sheet, undo toasts | BookingCard 7969 | Phase 2-3 |
| Studio desk: BizShell tools grid (students, attendance, earnings, reports, rooms, calendar) — "Manage" opens the Classes register only | S_bizhub/BizShell | Phase 2 (ERP) |
| Discover: style filter rail, sort, crews tab, follower counts, studio photos, map view | S_discover 4100+ | Step 6+ / Phase 3 |
| My classes: real calendar view; owner-side waitlist queue management | Calendar tab / attend 12080 | Phase 2 (attendance) |

### Later phases (not in this plan's scope)
Razorpay payments + attendance + studio CRM → community/feed/reviews →
events/video → search (Typesense) + analytics.

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
