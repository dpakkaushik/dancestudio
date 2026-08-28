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

- **Completed: 24 / 29 steps** (Steps 0–15, 18, 21–25; 16, 17, 19 and 20 are ❌
  not in the prototype — see the re-scope below — so only 26 remains).
  **Step 25 landed 28 Aug 2026: analytics / Stats** — the prototype's Stats is
  one screen in three dresses (S_profiletab): YOUR RECORD (`historyOnly` 9862,
  "A LIBRARY, NOT A DASHBOARD"), HISTORY (`classesOnly` 9708) and GLOBAL
  RANKINGS (`chartsOnly` 9610). Migration `20260829180000_create_stats.sql`:
  **no new table** — this is arithmetic over rows the app already keeps — and
  four functions. `my_dance_stats` and `my_session_history` count the
  same rows, so the prototype's own rule holds by construction (9950: "a number
  and the list behind it are THE SAME NUMBER … The grid used to say 86 students
  and open a list of five, which is how a figure stops being believed").
  `dance_chart` is the leaderboard for the four segments and
  `my_chart_place` is where you stand; both are SECURITY DEFINER because a
  board must see across people RLS rightly hides from each other, and both are
  **aggregate-only** in the pattern `session_seat_counts` and
  `follower_counts` set — a name, a place and some counts, never a row of
  somebody's private data, and **no p_user_id at all**: you can ask for a board,
  never about a person. **What is real, and what the prototype's points card
  claims that we cannot:** conducted (a confirmed artist claim on a session that
  has ENDED), assisted, attended (an attendance row — somebody actually checked
  in; a booking nobody marked is not a session danced) and the hours those
  sessions ran are real; a **battle win** needs a score and no table holds one,
  so wins are NOT in the formula and the screen says so; "refresh daily at
  midnight" is a job we do not run, so points are counted live; and a **10%
  monthly decay** is a product rule nobody has decided, so it is absent rather
  than invented. **A rank is only honest with its denominator**, so every board
  returns the size of the population it ranked and the screen prints "#2 of 7".
  Second migration `20260829190000_fix_dance_chart_ambiguity.sql`, **found by
  the proof**: a set-returning plpgsql function's OUT parameters are variables
  inside its own body, so the studio and crew branches — which selected `id`,
  `name`, `city` into CTEs — died on `column reference "id" is
  ambiguous` (42702). Two of the four boards were dead on arrival and only a
  call could show it. 14-check proof, both e2e specs green.
  **Step 24 landed 28 Aug 2026: notifications** — the prototype's
  notifications screen (S_notif 13702) is six KINDS stacked one card each, an
  unread dot per row, Mark read / Clear all per stack, and a settings sheet
  ("What reaches you") with a switch per kind and three channels. Migration
  `20260829150000_create_notifications.sql` (⚠ RLS): `notifications` (per
  PERSON — there is no such thing as a tenant's notification, only its owner's)
  and `notification_prefs`. **Notifications are raised WHERE THE FACT HAPPENS**
  — the prototype says it twice ("THE WAITLIST IS TOLD, OR IT IS NOT A WAITLIST"
  13647; "A REQUEST NOBODY SEES IS NOT A REQUEST" 13659) — so they are TRIGGERS
  on the tables that already hold the facts, not calls sprinkled through actions:
  a class claim asked and answered, a seat booked, **a waitlisted seat offered**,
  a refund requested and decided, a payout settled, an enquiry sent and quoted,
  an event seat or entry booked, a **duet partner** asked and their answer, a
  **crew** ask and its answer. Every path that writes the fact raises it — an
  action, an RPC, the Cashfree webhook, a proof, the demo seeder — because none
  of them can write the row without passing the trigger. The notify function is revoked from
  every client role, there is no insert policy, and it **never raises**: a
  notification must not be the reason a booking fails. Reads/clears are scoped to
  `auth.uid()` inside the RPCs, so passing somebody else's ids touches nothing.
  Second migration `20260829163000_notify_auto_refund.sql`, **found by the
  proof**: a refund filed automatically outside the 48-hour window told nobody —
  the commonest refund of all was silent — so the trigger now speaks on that
  insert too. Screens: `/notifications` (S_notif lifted — the hero, the stacks,
  the rows, Mark read / Clear all, the settings sheet) and **the bell with its
  badge in the top bar**, counted once per render of the signed-in layout.
  Channels, honestly: in-app is the only delivery — the push / WhatsApp / email
  switches are real stored answers, and each waits on the thing that sends it
  (VAPID keys and a service worker, Step 26's provider, the verified Resend
  domain). 12-check proof; six proofs re-run as regressions, one of which
  (**enrollments**) turned out to have been red since Step 9 and is repaired.
  **Step 23 landed 28 Aug 2026: search + Discover filters** — the
  prototype's Discover is one search box that "searches everything" (4535-4575:
  Studios · Artists · Crews · Events, three each, matching a name that STARTS
  with the term or has a WORD that does) plus every way of narrowing a list —
  THE STYLE RAIL (4596, the app's one style tile in three rows, ordered by how
  many classes each style has), the **Filters · N** button beside the two or
  three quick chips people actually reach for (4655), and THE FILTER SHEET
  (4827: SORT BY · DISTANCE · TIME OF DAY · DURATION · PRICE · TYPE OF EVENT ·
  COMPETING AS, "rows are only offered when they mean something"). Migration
  `20260829120000_search_dance_os.sql`: one function, `search_dance_os(q, limit)`,
  **SECURITY INVOKER** so the caller's own RLS decides what is found — a stranger
  finds listed businesses, live crews and published events (by title or by the
  organiser's name), an owner also finds their unlisted business and their
  drafts, and **people are never returned** (profiles are signed-in-only and
  there is no person page for a row to open — "a destination that does not exist
  is worse than no destination"). **Postgres, not Typesense**, and the reason is
  written into the migration: at pilot scale every searchable table holds tens of
  rows, so a sync pipeline would be machinery with nothing to carry; the function
  is the seam if counts ever warrant an index. The filters themselves need no
  schema — they are pure predicates in `features/discovery/filters.ts`
  (parse/serialise the URL, `filtersOnCount`, and one filter per list) applied
  on the server, so **the address IS the state**: BACK returns to the same list
  (the prototype's `__DOSDISCOVERSTATE`, 4427) and a filtered shelf is a
  shareable link. Screens: `DiscoverFilters` (the search box with its
  bifurcated dropdown, the style rail, Filters + quick chips, the sheet, and the
  events tab's own box — S_eventslist 13551) on a Discover page that now filters
  and sorts every tab. 8-check proof, both e2e specs green.
  **Step 22 landed 28 Aug 2026: crews** — the prototype's crew is a RECORD, not a
  constant (CREWS 661-708), with two relationships (S_bizhub 2596): the crews you
  LEAD have a desk, the crews you are IN have a page. Migration
  `20260829090000_create_crews.sql` (⚠ RLS): `crews` (name, city, style,
  leader_id → profiles; no tenant_id — a crew belongs to a person) and
  `crew_members` (role leader | member | trainee, status **asked | confirmed |
  rejected**, sort). **Nobody is put on a roster without saying yes** (1792): a
  crew is public and its CONFIRMED roster is anybody's to read, an unanswered
  ask is the leader's and the asked person's, and only the person asked answers.
  No direct writes — `create_crew` (you are the leader, everyone named is
  asked), `update_crew`, `ask_crew_member`, `respond_to_crew_ask`,
  `withdraw_crew_ask`, `remove_crew_member` (the leader removes or a member
  leaves; **the leader cannot leave**), `set_crew_member_role` (Promote; **Make
  leader hands the crew over**), `reorder_crew_members`, the aggregate-only
  `crew_member_counts`. **Step 21's two debts paid in the same migration:**
  `event_bookings` gained `crew_id` (a crew entry is made BY THE PERSON WHO
  LEADS IT, from a crew they lead — a typed name no longer books), `partner_id`
  + `partner_status` (the duet partner is a PERSON on DanceOS, asked through
  `respond_to_partner_ask`; the entry stands either way — "blocking here would
  only strand money", 1815), a partner-reads-their-ask policy and a public policy
  for a crew's entries into published events (its battle record). `book_event`
  dropped and recreated with `p_crew_id` / `p_partner_id`. Screens lifted: the
  **Crews hub** `/crews` (S_bizhub — CREWS YOU LEAD · Manage › / ＋ Create crew /
  CREWS YOU ARE IN · Profile ›), **Create your crew** `/crews/new` (crewFormOnly
  9545 — DETAILS, MEMBERS as faces with the dashed ＋, the CONFIRM · CREATE CREW
  sheet), **the crew desk** `/crews/{id}/manage` (S_crewmanage 16318 — tiles,
  Members | Battle record, ⏳ Waiting on them to confirm, Promote / Make leader /
  Remove / Withdraw, ↑ ↓, ＋ Add member → SEARCH DANCEOS, THEN ASK THEM), **the
  public crew page** `/crew/{id}` (publicEntity="crew" 11044 — CREW, the
  figures, the style coin, Crew leader / Crew members, the battle record),
  Discover's **Crews** tab (CompactCard grid), the Inbox's Requests desk with
  **crew asks and duet-partner asks** on both sides, the event page's **Which
  crew** picker (the crews you lead, pre-picked when there is one) and **Your
  partner** as a PeoplePicker, the organiser's row reading "entered by its
  leader" / "with X · awaiting partner", a Crews door under RUN YOUR BUSINESS, the
  chrome titles. Shared: `features/people/PeoplePicker` + `searchPeopleAction`
  (the one people search). 14-check proof, the events proof re-run on the new
  `book_event` (16), both e2e specs green.
  **Step 21 landed 28 Aug 2026: events, competitions, ticketing ⚠** — the
  prototype's event record with its two sides (EVENT_STORE 912): the people who
  come to DANCE (entries by format — solo / duet / crew, each its own fee and
  places) and the people who come to WATCH (ticket tiers, each a name, a price
  and seats). Migration `20260828180000_create_events.sql` (`events`,
  `event_entry_tiers`, `event_ticket_tiers`, `event_bookings`; RLS for members /
  the public-of-listed / holders; **no direct writes** — `save_event`,
  `publish_event` with the blockers in the prototype's own sentences,
  `set_event_status`, `delete_event`, the aggregate-only `event_counts`,
  `book_event`, `cancel_event_booking`, `check_in_event_booking`,
  `add_event_walk_in`) plus `20260828210000_fix_event_blockers_array.sql`, a
  fix the proof found (`text[] || 'literal'` is array‖array to Postgres — the
  blocker came back as `malformed array literal`). **Money, honestly:** every
  seat and entry books FREE; a priced tier or entry is refused with Step 9's
  sentence, because the rail has no account and `orders` is class-shaped. Sold
  counts are COUNTED from live bookings, never stored, so a cancellation frees a
  seat by arithmetic. Screens lifted: the desk (S_eventsmod), the two-step form
  (S_eventform), **the event page `/e/{slug}`** (S_event — sleeve, the card on
  the page, PRIZE MONEY, WHEN, VENUE, FORMAT, TICKETS, POLICY, the booking bar,
  the confirm sheet and the payment step, the held ticket, the completed
  figures), **the manager** (S_eventmanage — Details, Participants, Spectators
  with check-in and walk-ins), Discover's **Events** tab with the kind chips
  (S_eventslist), the **Your tickets** shelf on /my-classes, the register's
  **Events ›** chip and the chrome titles. 16-check proof, both e2e specs green.
  **Rail swap landed 28 Aug 2026 (no new step): Cashfree replaces Razorpay ⚠.**
  The user chose Cashfree because it does BOTH directions under one account
  (Payment Gateway in, Payouts out, one sandbox, test keys before KYC) where
  Razorpay's money-out is a separate RazorpayX current account. Migration
  `20260828230000_provider_neutral_rail.sql`: the ledger stops naming a vendor —
  `provider_order_id` / `provider_payment_id` / `provider_refund_id` and a
  `provider` column on orders, payments and refunds (existing rows stamped
  'razorpay', new ones 'cashfree'); every function reading those columns
  recreated (`attach_provider_order`, `apply_*` with `p_provider_*`,
  `attach_provider_refund`, `cancel_booking`, `decide_refund`,
  `settle_refund_offline`, `attach_settled_refund_reference`), grants re-stated,
  no policy touched. The edge is `lib/cashfree/` (orders → payment sessions,
  fetch an order's payments, refunds; Base64-HMAC webhook verification on
  timestamp + raw body) and `/api/webhooks/cashfree`; `PayFlow` opens Cashfree's
  JS SDK v3 modal and the server then asks Cashfree what happened on OUR order —
  the browser's word is never trusted. **Multi-studio money, decided:** DanceOS
  must not collect into one account and pay studios out (payment-aggregator
  territory) — studios are settled by Cashfree **Easy Split** (each tenant a
  KYC'd vendor, their share to their own bank; needs Cashfree's account manager
  to enable), and a studio still pays its own people (Step 13). So Payouts is
  NOT wired: the sandbox pair is valid but IP-gated (403 until this machine's
  IPv4 is whitelisted). Verified: sandbox smoke proof (order created in our
  grammar, read back, refunds refused on an unpaid order, wrong key refused),
  the five money proofs re-run on the renamed RPCs (payments 12, refunds 12,
  class earnings 9, studio income 13, attendance 10), both e2e specs — the
  paid-webhook spec now signs as Cashfree and also proves a RETRY with a fresh
  timestamp is a no-op at the RPC.
  **The desk is
  reachable only by URL until the chip lands.** (The denominator grew from 27 as
  Step 12b was split out of Step 12, and again as Step 13b was split out of
  Step 13.) **Step 18 landed 28 Aug 2026: the Inbox** — the prototype's
  `S_chats` after it removed internal chat: two desks that count what is waiting
  on you. **Requests** reads rows that already exist from BOTH ends (class
  claims and team invites — Received: confirm or reject; Sent: what your
  business asked and is still waiting on, withdraw). **Enquiries** is new:
  migration `20260828150000` (`enquiries` + `enquiry_quotes`, RLS for the two
  ends only, no public policy, five RPCs) — the five-type enquiry system sent
  from a business's public page (EnquirySheet), quoted by the business (a quote
  is a LIST; a revision supersedes, never erases), accepted or declined by the
  person quoted, the stage DERIVED from the live quote, and the advance and
  balance RECORDED as received by the business (Step 13's honest limit — no
  rail yet). `/inbox`, `/inbox/enquiries/{id}`, the profile's Enquiry button.
  12-check proof, both e2e specs green (the full loop: send → quote → accept →
  advance recorded). **Step 15 landed 28 Aug 2026: follows + public profiles** — the
  first migration since the DB password was reset: `follows` (a person follows a
  business; rows private to the follower and the business's members, no public
  policy at all; the COUNT public through the aggregate-only `follower_counts`;
  one idempotent door, `set_follow`, that refuses an unlisted business and one
  you belong to). Public pages at `/studio/{id}` and `/artist/{id}` lifted from
  S_profiletab's `publicEntity` render — the lit hero, the figures, the styles
  it teaches (off its published classes), Follow, the Schedule bar, Faculty off
  public confirmed claims — plus the **public schedule** (`pubSchedule`, the
  piece Step 14 left for this) at `/…/schedule`, follower pills and links on
  Discover's cards, and Following on your own profile. Readable signed out:
  RLS decides what a stranger sees. 12-check proof, both e2e specs green.
  **Step 14 landed 28 Aug 2026: the calendar** — S_profiletab in its
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
- **Phase 3 re-scoped against the prototype (28 Aug 2026).** Rule 2 says every
  screen is lifted from `prototype/DanceOSApp.jsx`; a full inventory of its
  screens (`grep -oE "^const (S|G)_[A-Za-z0-9]+"`) shows four roadmap rows
  describe features the prototype **deliberately removed**, in its own words:
  **16 Reviews + ratings** — "There is no rating anywhere in DanceOS any more"
  (4218); no review screen exists. **17 Social feed** — "the Feed is what got
  left behind when that changed. Removed deliberately rather than left to rot"
  (4895-4896); `__DOSTAB("feed")` maps to Discover (19082). **19 Moderation** —
  "Moderation (Report on posts and comments) went with it: it existed to police
  this surface" (4897). **20 Video/reels** — no reel, post or feed screen
  anywhere. **18 Messaging** — "Internal chat is removed from the product"
  (6080, 10892): `S_chats` is the **Inbox**, two desks that count what is
  waiting on you — **Requests** (asks to be put on a class, a crew, a team) and
  **Enquiries** (the five-type enquiry system, ENQ_TYPES 4900-4923: celebrations,
  corporate, judge, private sessions, collaboration — quoted, advanced, won or
  lost; `S_enqdetail` 5380; the EnquirySheet a profile opens). So 16, 17, 19 and
  20 are **not built** (nothing to lift — building them would invent UI), and
  **18 is the Inbox**. Screens the roadmap never assigned are now listed at the
  foot of the parity backlog so none is forgotten.
- **Next: Step 26 — WhatsApp-first OTP ⚠ (the last step).** It is mostly the
  user's accounts, not code: the code change is `channel: "whatsapp"` in
  `signInWithOtp` (Step 1 decided this and parked it), and what it waits on
  is a Twilio account wired into Supabase's WhatsApp channel, Meta business
  verification with an approved authentication template, and India DLT
  registration for the SMS fallback. Scope it against Step 1's record and the
  existing S_auth screens (the 📱 Mobile tab already exists and works against
  Supabase's test numbers), decide whether to ship it behind a flag while the
  verifications are pending, and note that the notification prefs' **WhatsApp**
  switch (Step 24) becomes real with the same provider. After 26 the roadmap is
  done and what remains is the **parity backlog** — start with the rows that
  block nothing: person pages, the media slice (photos and posters), memberships
  and rentals, S_managed, and web push.
  Migrations apply with `npx supabase db push --db-url` over the pooler through
  the scratchpad `push-migration.js` pattern (spawn `npx` with `shell: true` —
  Node refuses `npx.cmd` without a shell, EINVAL). Still parity, tracked in the backlog: 13b **(b)** the
  source bar / SHARE OF GROSS waits for a second PAID source — tickets exist now
  but every one is free until the Cashfree account is live (KYC); **(c)** the
  fee, GST, TDS and settlement lines wait for that live account and Easy Split —
  printing them first would be the half-truth the prototype's own comment at
  18086-18092 was written about. **Money-out for studios is Easy Split, not
  platform Payouts** (see the rail-swap record); Payouts stays unwired.

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
| 9 | Payments ⚠ (Razorpay 24 Aug → **Cashfree** 28 Aug 2026, ledger provider-neutral) | ✅ done — sandbox live; pending ops: Cashfree KYC for live keys, Easy Split enablement |
| 10 | Attendance + waitlist management | ✅ done (24 Aug 2026) |
| 11 | Rooms & people (full class form) | ✅ done (25 Aug 2026) |
| 12 | Studio CRM (leads/trials/conversions) | ✅ done (25 Aug 2026) |
| 12b | Staff invites (split out of 12) | ✅ done (25 Aug 2026) |
| 13 | Earnings & payouts ⚠ | ✅ done (25 Aug 2026) |
| 13b | Earnings income half + refund settlement queue (split out of 13) ⚠ | ✅ done (28 Aug 2026) — source bar and fee/settlement lines stay on the parity backlog by design |
| 14 | Calendar views | ✅ done (28 Aug 2026) |
| 15 | Follows + public profiles | ✅ done (28 Aug 2026) — business pages; person pages and person-follows tracked in the backlog |
| 16 | Reviews + ratings | ❌ not in the prototype ("There is no rating anywhere in DanceOS any more", 4218) — not built |
| 17 | Social feed (images first) | ❌ removed from the prototype ("Removed deliberately rather than left to rot", 4895) — not built |
| 18 | Inbox: Requests + Enquiries desks (was "Messaging" — internal chat is removed from the prototype, 6080) | ✅ done (28 Aug 2026) |
| 19 | Moderation + reporting | ❌ removed with the feed ("went with it", 4897) — not built |
| 20 | Video/reels (Mux/Cloudflare Stream) | ❌ no reel/post screen in the prototype — not built; photo uploads (posters, studio photos) stay a media slice |
| 21 | Events, competitions, ticketing ⚠ | ✅ done (28 Aug 2026) — free seats and entries end to end; paid tickets/entries wait on the Razorpay account; bracket/rounds/judges/scoring/earnings/refunds segments on the backlog |
| 22 | Crews (auditions are gone from the prototype, 13520; the open call was declined, 13565) | ✅ done (28 Aug 2026) — crews, rosters by consent, the crew entry and the duet partner as a person; results/points and Follow-a-crew on the backlog |
| 23 | Search + Discover filters (Postgres, not Typesense — the reason is in the migration) | ✅ done (28 Aug 2026) — the map view stays on the backlog |
| 24 | Notifications (in-app, raised by triggers where the facts happen; the three delivery channels are stored and wait on their senders) | ✅ done (28 Aug 2026) |
| 25 | Analytics / Stats (Your record · History · Global Rankings; no new table — aggregates over existing rows, with wins and decay honestly absent) | ✅ done (28 Aug 2026) |
| 26 | WhatsApp OTP unpark ⚠ | ⬜ ⬅ next (mostly the user's accounts: Twilio + Meta verification + DLT) |

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

### Step 15 — Follows + public profiles ✅ (done 28 Aug 2026)
- Migration `20260828120000_create_follows.sql` (⚠ RLS): `follows` (follower →
  profiles, tenant → tenants, audit, soft delete; a partial unique index keeps
  ONE live follow per person per business while ended rows stay on record).
  **Rows are private, the count is public.** Two SELECT policies — the follower
  reads their own (live and ended: a soft-deleting role must see the row it just
  ended, Step 3's lesson), the followed business's members read who follows
  them (the prototype's Followers sheet is the profile owner's) — and **no
  public policy at all**: who follows whom is nobody else's business. No
  insert/update/delete policies: `set_follow(tenant, on)` is the one door,
  idempotent (following twice is one follow; unfollowing what you never followed
  is a no-op), refusing an **unlisted** business ("not open to the public" — the
  same line "anyone reads listed tenants" draws) and a business you **belong
  to** (a member's follow would count the business's own people). The count
  rides `follower_counts(uuid[])`, aggregate-only and granted to anon — the
  pattern `session_seat_counts` set — answering for listed businesses to
  everybody and for an unlisted one to its own members only. Targets are
  tenants for now: following a person or a crew arrives with the screens that
  show them.
- Repository `repositories/follows.ts` (every "mine" query says `follower_id =
  auth.uid()` out loud — a studio member reads their tenant's follows too),
  `repositories/publicProfile.ts` (the tenant as the caller may see it; styles
  from its published classes, most-taught first; Faculty from CONFIRMED claims
  on published classes — Step 11's public policy, so an unanswered ask never
  puts a name on the page; rows without a readable name are left out rather
  than printed as "Someone", because `profiles` is readable by signed-in users
  only), `findPublicTenantSchedule` in `repositories/calendar.ts` (published,
  upcoming, nothing else), Zod action `features/follows/server-actions/follows.ts`.
- UI lifted from S_profiletab's `publicEntity` render (10565-11060) as
  `features/profiles/components/PublicProfile.tsx`: THE PROFILE, LIT LIKE A
  PLAYER — the business's colour bleeding off the top, the picture as a sharp
  206px square with the sleeve's thrown shadow, STUDIO/ARTIST over the name, the
  QR beside it (`ProfileShare`: the drawn code, the link, copy — "what it shares
  is the thing it is next to", 10688), the place under it opening Maps, the
  figures set like figures (Followers, Upcoming), the styles as coins
  (DosStyleCoin 3400), the action row — **Follow/Following** (`FollowButton`,
  10930: "a state does not get to become a different object", the lit edge in
  the page's own colour; a stranger's Follow leads to sign-in) or, for a member,
  "You are on this team · Manage ›" — the one white **Schedule** bar (10919), and
  Faculty as a row per person headed with a count (11000-11060). Routes
  `/studio/[tenantId]` and `/artist/[tenantId]` are one component in two dresses
  (`PubStudio`/`PubTrainer`, 19133); a studio opened under /artist redirects to
  its own address; an unlisted business is `notFound()` to a stranger, because
  RLS returns nothing. `/…/schedule` is `CalendarScreen` in its new **public**
  mode (`PubCal` 19140): no hero, no switcher, no sides, no day gutter, one
  view, published-and-upcoming only, the room picker kept. Discover's
  `StudioCard` is a link to the page and carries the prototype's follower pill
  (DosFollowers 4277) off `follower_counts`; `/profile` gained the Following
  figure and list (10714).
- **Deliberately not lifted, tracked in the backlog:** the Following figure and
  the rank on a business's page (a business follows nobody and holds no rank),
  About (no bio field — the prototype's default sentence would be one studio's
  words on every page), the founding year (`Since 2016` — no field; the page
  says "On DanceOS since {year}" from `created_at`, which is true), Call and
  Enquiry, Photos and the albums/plans tabs, Stats, the owner's Followers sheet
  (the read exists — `findTenantFollowers` — the sheet does not), person pages
  and person-follows.
- Verified: `scripts/rls-proof-follows.ps1` — 12 checks green (a stranger reads
  the listed studio and not the private one; count starts at 0, not missing;
  **following twice is one follow**; direct insert refused; a second follower
  moves the public count; **rows private, count public** — L1 reads own row
  only, the owner reads both with names, rival and public read none; unfollow
  keeps the ended row and re-follow starts a fresh live one; a private business
  and your own business are refused with the right words; the public cannot call
  set_follow; a private business's count is absent for a stranger and 0 for its
  owner; the public schedule shows the published upcoming session and hides the
  draft's for a stranger while the owner sees both; public styles come off
  published classes only). e2e extended — the learner finds the studio on
  Discover, opens its page (followers 0), follows (Following · 1), opens the
  Schedule and finds the class, sees the studio under Following on their
  profile; **a guest context with no account reads the same page**, is offered
  Follow (→ sign-in) and reads the count 1. typecheck / lint / production build
  / both specs green. **PowerShell lesson:** `,@(...)` belongs on `return`, not
  in an assignment — `$rows = ,@(...)` nests the array and an empty answer reads
  as 0 through member enumeration.

### Step 18 — the Inbox: Requests + Enquiries ⚠ ✅ (done 28 Aug 2026)
- **What the prototype's Inbox is** (S_chats 5617-6098, after internal chat was
  removed): "what remains is the work — something somebody has asked of you, and
  something somebody wants to book. The badge counts only what waits on YOU."
  Two desks and a combined All, newest first. **Requests** are rows that already
  exist — class claims (Step 11) and team invites (Step 12b) — read from BOTH
  ends: Received is somebody claiming you (Confirm / Reject through the RPCs
  those steps already have), Sent is what your businesses asked of other people
  and are still waiting on (Withdraw). `findAskedClaimsForTenants` and
  `findPendingInvites` say which tenants out loud; `class_claims` gained
  `created_at` on its read so the desk orders by it.
- Migration `20260828150000_create_enquiries.sql` (⚠ RLS, ⚠ money-adjacent):
  `enquiries` (tenant → business asked, from_user → person asking, type_key in
  the five kinds, `fields` jsonb of [label, value] pairs exactly as the type
  collected them, dates, where, message, mobile, a manual `status`) and
  `enquiry_quotes` (n, cost, advance %, advance, status sent | accepted |
  declined | superseded, advance_paid_at, full_paid_at). **The prototype's own
  correction is the design** (4939-4952): "A QUOTE IS A CONVERSATION, NOT A
  FIELD … It is a LIST now, newest last … Revising a price adds a quote rather
  than erasing one" — `send_enquiry_quote` supersedes the live quote and inserts
  #n+1; the stage is DERIVED from the live quote (`enquiryStage`, after
  enqStage 4977) so "a quote can be accepted and paid while the enquiry still
  said New" cannot happen. RLS: the two ends only — sender (`from_user_id =
  auth.uid()`) and the business's members (every member: the desk is the
  studio's CRM, Step 12's rule) — **no public policy, no direct writes.** Five
  RPCs: `send_enquiry` (onboarded; listed business; not one you belong to;
  **Invite as Judge is refused for a studio** — judging is a person's job, 4934;
  a date and a message required), `set_enquiry_status` (members), `send_enquiry_quote`
  (members; a won/lost enquiry takes no quote), `answer_enquiry_quote` (**the
  person quoted, only**, on a `sent` quote), `record_enquiry_payment` (members;
  advance once, balance closes it Won). **Money, honestly:** the advance and the
  balance are RECORDED as received by the business — Step 13's limit ("DanceOS
  records it, it does not move the money") — because the rail has no account;
  the sender's "Pay the advance" prints Step 9's own sentence ("Payments aren't
  switched on yet") instead of pretending. The columns are the ones a capture
  will stamp when the rail is on.
- Repository `repositories/enquiries.ts`, `types/enquiry.ts` (ENQ_TYPES lifted
  whole from 4900-4923 with each type's own fields and audience; ENQ_TINT;
  stages in the prototype's words), Zod actions
  `features/enquiries/server-actions/enquiries.ts`.
- UI lifted: **`InboxScreen`** (S_chats — the profile-tinted wash, "N waiting on
  you", the All / Requests / Enquiries pills each carrying only what waits on
  you, the combined desk, the Requests desk's Received / Sent with the linkCard
  anatomy 5757-5810, the Enquiries desk's Received / Sent, the three counted
  tiles that name the side you are on, Pipeline breakup BY TYPE / BY STAGE, the
  type and stage chips, the enquiry card 5990-6000); **`EnquiryDetail`**
  (S_enqdetail 5380-5616 — DosHero in the type's tint, Call as a real `tel:`
  hand-off or "no number on this enquiry", the STATUS menu for the business,
  WHAT THEY ASKED FOR, THEIR MESSAGE, the QUOTES history oldest first with
  "Replaced / Waiting on an answer / Accepted / Declined / Advance paid / Paid in
  full", and THE QUOTE, FROM BOTH ENDS — the sender's Decline / Accept, the
  business's Mark advance / balance received, Send / Revise the quote with the
  0 · 30 · 50 · 100 advance chips and the cost / advance / on-completion rows);
  **`EnquirySheet`** (5051-5193 — what's it for, only the kinds that make sense
  for who it is going TO, single or multiple dates, the type's fields, location
  + city, a number, a message, "Enquiry sent") opened by the profile's new
  **Enquiry** button beside Follow (10883); the shared atoms `Surface`,
  `Eyebrow`, `Figure`, `DosHero`, `EnqIcon` in `features/inbox/components/inbox-kit.tsx`
  (2713-2745, 5195). Routes `/inbox` (the tab's placeholder is gone) and
  `/inbox/enquiries/[enquiryId]`.
- **Deliberately not lifted, tracked in the backlog:** studio rental requests on
  the Requests desk (S_rentals is unbuilt), the Remind button (needs
  notifications, Step 24), the judge type's "Pick from DanceOS" event picker
  (events are Step 21 — the event is named in words), the inline quote / Take
  payment controls on the list card (the prototype's own detail page supersedes
  that older design), the sender's real payment (Razorpay), and the earnings
  page's ALSO COLLECTED card, which can now be counted from recorded advances.
- Verified: `scripts/rls-proof-enquiries.ps1` — 12 checks green (filed New
  with its fields; **judge refused for a studio, accepted for an artist
  business**; own business and a private business refused with the right words;
  reads are the two ends — sender 2, studio owner 1 AND staff 1, artist 1,
  bystander 0, public 0; direct insert refused; **staff quote** #1 with a 30%
  advance moves the enquiry to Quoted and the sender cannot quote; **a revision
  supersedes** — #1 superseded, #2 live; **only the person quoted answers** — the
  studio cannot, a superseded quote cannot, the sender accepts → Confirmed;
  **money is recorded by the business** — the sender cannot, the advance once
  (→ Advance paid), again refused, the balance → Won; the stage menu is the
  business's and a closed enquiry takes no quote; quotes as private as the
  enquiry; the public cannot send). Regression: follows proof re-run green. e2e
  extended with the full loop — the learner sends Private Sessions from the
  studio's page, the owner finds "1 waiting on you", opens it from the Enquiries
  pill, quotes ₹5,000 (Quoted), the learner opens it under Sent, accepts
  (Confirmed) and is told payments aren't switched on yet, the owner records the
  advance (Advance paid). typecheck / lint / production build / both specs green.
  **PowerShell lesson:** 5.1's `Invoke-RestMethod` does not always surface the
  response body in `$_.ErrorDetails` — read
  `$_.Exception.Response.GetResponseStream()` or a refusal's own words cannot be
  asserted (three checks first read as "(400) Bad Request").

### Step 21 — Events, competitions, ticketing ⚠ ✅ (done 28 Aug 2026)
- **What the prototype's event is** (EVENT_STORE 912, S_eventform 15759): one
  record with two sides — the people who come to DANCE, entered by format (solo /
  duet / crew, "a solo dancer and a nine-person crew are not the same product",
  16070, each its own fee and places) and the people who come to WATCH, seated
  by ticket tier. Three kinds remain (showcase · battle · tournament — auditions
  were removed, 2989), and **a showcase is watched**: its line-up is the host's
  to build, so it has no public entry (13245). Publishing has one rule, stated
  once (dosEventBlockers 3061): a venue, a city and a map link; tickets on need a
  tier with seats; an entered event needs a way in with places; a showcase must
  sell tickets. `publish_event` is that rule server-side, in the prototype's own
  sentences, and `types/event.ts`'s `eventBlockers` says the same words while
  you type.
- Migration `20260828180000_create_events.sql` (⚠ RLS, ⚠ money-adjacent):
  `events` (tenant, cat, title ≤ 64 chars, style, start/end date, doors time,
  venue, address, city, maps_url, about, the entry headline, bracket, rounds,
  prizes int[], tickets_on, status draft | published | completed, a `share_slug`
  stamped by a BEFORE INSERT trigger in Step 8's grammar, audit + soft delete),
  `event_entry_tiers` (one live row per format; capacity 0 = up to 500),
  `event_ticket_tiers` (name, price, capacity 1–5000, sort), `event_bookings`
  (a seat — tier + qty — or an entry — format, entrant_name for a crew,
  partner_name for a duet; user_id nullable for a walk-in the desk recorded by
  name; amount_inr; booked | cancelled; checked_in_at). RLS: members read their
  tenant's rows drafts included (no deleted_at filter — Step 3's lesson); anyone
  reads a LISTED tenant's published events and their tiers; bookings are the
  holder's (`user_id = auth.uid()`) and the organiser's members'. **No
  insert/update/delete policies anywhere.** `can_run_events` (owner or trainer)
  gates `save_event` (create or edit; tiers RECONCILED, not replaced — a tier
  that keeps its id keeps its bookings), `publish_event`, `set_event_status`
  and `delete_event`; `is_tenant_member` gates the door — `check_in_event_booking`
  and `add_event_walk_in` (a walk-in "is recorded, not asked": the person is
  standing at the desk, 14208; a showcase performer added by the desk is NOT
  checked in). `event_counts(uuid[])` is aggregate-only and granted to anon
  (the `session_seat_counts` pattern) so a card can say how full each side is
  without naming anybody. `book_event` locks the event row and enforces the
  lot: published, listed, not over, the caller onboarded and **not a member of
  the organiser** ("you run this event — the register is yours, not a ticket";
  the prototype's "Studios can't book", 13273); a spectator needs a live tier
  with seats left (1–20 at a time); a participant needs an open format, a
  partner for a duet, a name for a crew, one entry per person per format, a
  place left; and **a priced seat or entry is refused with Step 9's sentence** —
  "payments aren't switched on yet" — because `orders` carries class_id and
  session_id and no Razorpay account exists. Sold counts are never stored, so
  `cancel_event_booking` (your own, until the event ends) frees a seat by
  arithmetic.
- Migration `20260828210000_fix_event_blockers_array.sql`: **found by the proof
  (check 2), not by reading.** `event_blockers` appended with
  `out := out || 'A showcase is watched …'`; with an untyped literal on the right
  Postgres resolves `||` to anyarray‖anyarray and parses the sentence AS an
  array, so `publish_event` raised `malformed array literal: "A showcase is
  watched — put tickets on sale before publishing"`. The refusal was right and
  the words were wrong — the form never showed it (it computes the same blockers
  client-side and disables the button) but the desk's Publish pill would have
  printed the parser's complaint. Same signature and grants, `array_append` with
  `::text`. **Lesson: append to a text[] with array_append or cast the literal.**
  The proof's check 2 now anchors on the START of the sentence so the fix is
  what it proves. Never edit the applied migration (Rule 4).
- Repository `repositories/events.ts` (the list hydrated with `event_counts` so
  `entered` and `sold` ride on the tiers; `findEventBySlug` for the public page —
  RLS decides who resolves a draft; `findPublishedEvents(todayKey, city)` for
  Discover; `findEventBookings` for the register; `findMyEventBookings` and
  `findMyBookingsForEvent` saying `user_id = me` out loud — an organiser's
  member reads every booking on their events, and RLS is a ceiling, not a
  scope), `types/event.ts` (EV_TINT, TYPE_LABEL, EV_FORMATS, EVENT_CRITERIA,
  the ceilings, `eventBlockers`, the card's arithmetic — `entryLabelOf`,
  `eventPriceLabel`, the capacity sums), Zod actions in
  `features/events/server-actions/events.ts` (shape only — the RPCs hold every
  rule). `PassSheet` gained `path` and `ariaLabel` so an event's pass prints
  /e/{slug} and calls itself "Event pass".
- UI lifted: **`EventCard`** (2800-2925 — the kind as a filled cap in its own
  colour, the format beside it with its mark, the poster, the date and the price,
  TWO BARS, TWO AUDIENCES, ONE ROW — one card for Discover, the desk and the page
  itself); **`EventsDesk`** at `/business/{id}/events` (S_eventsmod 13811 — the
  Events hero, Create event, the live banner, Published · Draft · Completed with
  counts, each event's lifecycle under its card); **`EventForm`** at
  `/events/new` and `/events/{id}/edit` (S_eventform — TWO STEPS LIKE ADD CLASS:
  the kind, the name clamped to 8 words / 64 chars, the style, when, the venue
  that is not optional and the map link; then who competes, bracket or rounds,
  prize money, FOR HOW MUCH AND HOW MANY per format, spectator tickets and their
  tiers with the presets, BEFORE THIS CAN GO ON DISCOVER, Save draft / Publish);
  **`EventPage`** at `/e/{slug}` (S_event 12810-13516 — the same player-lit
  sleeve as the class page, THE CARD ITSELF ON THE PAGE, LIVE NOW inside its
  days, PRIZE MONEY with the pool and 1st/2nd/3rd, WHEN with the span, VENUE
  opening Maps, FORMAT with the ways in and "Scored on …", TICKETS as
  radio-shaped tiers with SELLING FAST and the seats bar or ENTRY when there
  are none, WHAT TO KNOW off `about`, POLICY in words the code keeps, the bar
  stuck to the bottom — "Book as participant" / "Book as a spectator", Sign in
  to book, Sold out, YOUR EVENT · Check-in / entry for a member, Event completed
  with Full report › — the confirm sheet (ENTERING AS from the open formats, YOUR
  PARTNER, WHICH CREW, HOW MANY with the stepper), THE PAYMENT STEP (one sheet,
  both kinds; free confirms; priced prints Step 9's sentence and disables Pay),
  the held ticket with Cancel ticket / Withdraw entry, the draft footer, the
  pass behind the poster with a DOS-EV code); **`EventManager`** at
  `/business/{id}/events/{eventId}` (S_eventmanage 13946-14340 — the sleeve, the
  title and sub, DETAILS FIRST: the tiles, the two bars, the prize money, the
  venue, EVENT DETAILS; PARTICIPANTS: ADD A PARTICIPANT / ADD A PERFORMER with
  the format, REGISTRATIONS · N with a count per format, a row per entry with
  Check in / In; SPECTATORS: gate sales while seats remain — Event full when
  not — TICKETS · ₹ collected per tier, GATE LIST · in/all arrived); Discover's
  **Events** tab (S_eventslist — the kind chips as URL state, the same card →
  /e/{slug}, "No events match that yet."); the **Your tickets** shelf on
  /my-classes (an event booking is a booking too, S_bookings 6099); the
  register's **Events ›** chip; AppChrome titles for /e, /events, Add event,
  Edit event, Event.
- **Deliberately not lifted, tracked in the backlog:** the manager's Line-up /
  Bracket / Rounds / Judges / Earnings / Refunds / Setup segments and the
  judging sheet (no rows behind them — brackets, judges and scores need their
  own tables; earnings and refunds need paid tickets), the rules textarea and
  theme (no column; ABOUT is printed), the duet partner as a PeoplePicker person
  and the crews you LEAD (typed names today — crews are Step 22), the add
  panel's Scan QR / New user arms, poster upload from the manager, the venue's
  amenity chips (the prototype seeds the same five for every event; we hold no
  venue amenities), WHO ATTENDED on a completed page (names are private; the
  counts are printed), the event waitlist and the sold-out Waitlist action, the
  events search box (Step 23), "Studios can't book" for a studio-role viewer who
  is not a member (only members are refused — the database's rule), and paid
  tickets and entries through `orders`.
- Verified: `scripts/rls-proof-events.ps1` — 16 checks green (a draft is dark to
  the public and to a signed-in stranger while the owner reads it; **the three
  publish blockers arrive as the prototype's whole sentences**; a rival cannot
  publish and staff cannot save, the owner publishes and the public reads the
  event WITH its tiers; a free seat books and the public count moves while no
  name does; **a priced tier is refused with Step 9's sentence**; owner and staff
  are refused a ticket to their own event; a showcase refuses an entry and sells
  a seat; a duet needs a partner and a crew a name; a solo entry books once, is
  refused twice, and the one place is full for the next person; **a cancelled
  seat goes back on sale** — refused while full, booked after the cancel — and
  nobody cancels somebody else's; reads are the holder's own and the
  organiser's members' — rival and public read zero; the door is the
  organiser's — self check-in refused, staff check in and out; a walk-in is
  recorded by name with no account, checked in, and a holder cannot add one;
  direct inserts into bookings and events are refused; duet and crew entries
  carry their names and the public counts each format; delete is soft and the
  organiser's). e2e extended — the owner opens the desk from the register's new
  chip, publishes a free showcase through the two-step form (the Free entry
  preset, 150 seats across 1 tier), the learner finds it on Discover's Events
  tab, opens the page (no participant door on a showcase), books a seat through
  the confirm sheet and the payment step, holds it on the page ("1 booked · 149
  still available") and under Your tickets, and the owner opens the manager's
  Spectators register and checks them in (GATE LIST · 1/1 arrived). typecheck /
  lint / production build / both specs green.
- **Environment lessons (28 Aug 2026):** (1) Windows spawns have a command-length
  ceiling — a Bash heredoc holding a whole component fails with `ENAMETOOLONG` or
  is silently truncated (an "unexpected EOF" that is not in the file); write big
  files with the Write tool and patch with a Node script kept in the scratchpad.
  (2) `next build` beside a running `next dev` wedged the dev server (the overlay
  read "Jest worker encountered 2 child process exceptions") and the e2e failed
  on the first page it touched; recycle the dev server before the e2e. (3) The
  happy path is one long story and each route compiles on first visit — the
  Playwright test timeout is 180 s now, not 90.


### Step 25 — Analytics / Stats ✅ (done 28 Aug 2026)
- **What the prototype's Stats is** — one screen in three dresses, all of
  S_profiletab: **YOUR RECORD** (`historyOnly` 9862) whose own comment is the
  brief ("A LIBRARY, NOT A DASHBOARD … A dashboard is a wall of tiles you scan; a
  library is a place you spend time in", 9866): the colour bleeds off the top and
  dies into the page, your name is set like a name, and the numbers open into the
  lists behind them; **HISTORY** (`classesOnly` 9708), the session library
  with its side / style filters; and **GLOBAL RANKINGS** (`chartsOnly` 9610):
  four segments (Studios · Artists · Crews · Dancers), city and style filters, and
  a HOW POINTS WORK card. The crew desk's "See crew ranking" and the calendar's
  History chip both pointed here.
- **The rule this slice is built on** is the prototype's own (9950): "a number
  and the list behind it are THE SAME NUMBER. The grid used to say 86 students
  and open a list of five, and 5 studios over a list of four, which is how a
  figure stops being believed." So `my_dance_stats` and
  `my_session_history` are two readings of ONE query, and the screen's
  tallies (styles, studios, the artists you learn from, rooms) are computed off
  the very rows the History list prints. Nothing is added up twice.
- Migration `20260829180000_create_stats.sql` — **no new table.** Four
  functions: `dance_points` (the formula, in one place),
  `my_dance_stats`, `my_session_history`, `dance_chart` and
  `my_chart_place`. The two boards are SECURITY DEFINER because a
  leaderboard has to see across people that RLS rightly hides from each other —
  and they are **aggregate-only**, the pattern `session_seat_counts` (Step 4)
  and `follower_counts` (Step 15) set: a name, a place and some counts,
  never a row of somebody's private data. There is **no `p_user_id`
  anywhere**: you can ask for a board, never about a person, and the proof asserts
  the exact column list a chart row carries so a future edit cannot quietly widen
  it. Nothing is granted to `anon`: a person's activity is not public data.
- **What is real, and the three things the prototype's points card claims that we
  cannot.** Real: sessions **conducted** (a confirmed artist claim on a class
  whose session has ENDED), **assisted** (the same for an assistant claim),
  **attended** (an `attendance` row — somebody actually checked in) and the
  hours those sessions ran. Not real, and therefore absent and **said on the
  screen**: (1) a **battle win** is +10 in the prototype's card, and no table
  holds a score — Step 21 left brackets, judges and scoring on the backlog — so
  wins are not counted, and the crew board says a win "would be worth more than
  either" rather than showing a zero that looks like a result; (2) "refresh daily
  at midnight" is a scheduled job we do not run, so points are counted **live**,
  which is better and is what the card now says; (3) a **10% monthly decay** is a
  product rule nobody has decided, and a decay we invented would quietly change
  everybody's standing. **And a booking nobody marked is not a session danced** —
  the record counts check-ins, and the screen prints that sentence, because
  counting bookings would flatter every figure on the page.
- **A rank is only honest with its denominator.** "#4" on a pilot with seven
  dancers in a city is a number pretending to be a league, so every chart row
  carries the `population` it was ranked out of, the hero prints "#2 of 7
  dancers in Pune", the shelf prints "5 of 12", and an empty board says "a board
  of nobody is not a ranking" instead of drawing a podium.
- Migration `20260829190000_fix_dance_chart_ambiguity.sql` — **the proof
  found this, and only a call could.** A set-returning plpgsql function's OUT
  parameters (`id`, `name`, `city`, `style`, `points`)
  are VARIABLES inside its own body. The people branch happened to alias its
  columns (`uid`, `full_name`, `pcity`) and ran; the studio and
  crew branches kept the natural names and Postgres refused both with
  `column reference "id" is ambiguous — it could refer to either a PL/pgSQL
  variable or a table column` (42702). Two of the four boards were dead on
  arrival. Every CTE column inside the function is now named so it cannot
  collide. **Lesson: name a set-returning plpgsql function's OUT parameters as if
  they were globals, because inside the body they are.**
- Repository `repositories/stats.ts` (four reads, nothing summed in
  TypeScript), `types/stats.ts` (the three sides with the calendar's own
  words — a dancer TRAINS, a teacher TEACHES, an assistant is on the floor with
  somebody, DOS_SIDES 6666 — the points rules as data, `hoursWords`). No
  server action: Stats writes nothing.
- UI `features/stats/components/StatsScreen.tsx` at `/stats` (the tab's
  placeholder is gone), the three dresses behind a segment switch as URL state so
  a board is a link: the room lit in its own metal with your name and your place;
  the three sides as figures with their hours; **The numbers** — six rows, each
  opening into the list behind it, numbered like tracks (9990); the sentence that
  says what is counted and what is not; **History** with the Everything / Taught /
  Assisted / Danced pills and a style rail, each row opening its class page;
  **Charts** with the four segments, the city rail, HOW POINTS WORK and the board,
  every row carrying its place, its numbers and its points, and studios and crews
  opening their public pages.
- **Deliberately not lifted, tracked in the backlog (Rule 12):** the metal
  tier / rank ladder on the hero (the prototype's `dosTierOf` needs a rank
  ladder nobody has designed — the hero shows the real place instead), the
  History library's city / room / provider / assistant filters and its search box
  (the side and style ones ship), the Wins metric and the crew ranking's battle
  record (scoring), the "updated daily" cadence and the 10% decay, and the
  studio-side reports (S_reports / S_reportdetail, a different screen).
- Verified: `scripts/rls-proof-stats.ps1` — 14 checks green (the teacher's
  two conducted / one assisted and their hours; **the figure and the list are the
  same number**; an unanswered ask is not teaching and a session still to come is
  not a record; the dancer's two check-ins count and the third BOOKING does not;
  the points are the formula on the screen and carry no wins; styles / studios /
  artists come off those same rows; one record is one person's and there is no
  call that asks about somebody else; the artist board ranks and carries its
  population, and **the row carries exactly thirteen aggregate columns**; the
  dancer board excludes somebody who danced nothing; the studio board counts
  sessions actually HELD and not the one still to come; the crew board scores what
  a crew did; **the public cannot read a board, a record or a history**, and an
  invented segment is refused; a place comes with its denominator and is EMPTY
  rather than #0 off the board; a style filter narrows a board and an empty city
  is honestly empty). e2e extended: the learner's record is honestly empty (the
  story creates no ended session), so the assertion is that it SAYS so, that no
  number pretends to open a list, and that History says "Nothing on the record
  yet" — then Charts, where the crew the story built ranks #1 with "1 event
  entered · 2 members" beside the demo world's crew at #2, place printed with its
  population, and the row opens the crew's page. typecheck / lint / production
  build / both specs green.

### Step 24 — Notifications ✅ (done 28 Aug 2026)
- **What the prototype's screen is** (S_notif 13702-13812, NOTIF_KINDS 13642):
  six kinds — Enquiries · Bookings · Money · People · Events · Classes — each a
  STACK under one card (the count in a coin, the label, the newest title as the
  sub-line, "N NEW", a chevron that turns), opening onto rows that each carry an
  unread dot, a title, a body, an age and a × that clears it, with Mark read /
  Clear all beneath; "All clear · Nothing needs you right now." when empty; and
  the settings sheet, "What reaches you" — a switch per kind ("Switch a kind off
  and its stack disappears from this screen") and three channels under HOW THEY
  REACH YOU. The top bar carries the bell with what is unread on it (19252).
- **Where a notification is raised, and why it is a trigger.** The prototype
  states the principle twice in its own comments — "THE WAITLIST IS TOLD, OR IT
  IS NOT A WAITLIST" (13647) and "A REQUEST NOBODY SEES IS NOT A REQUEST"
  (13659): the notification is raised at the moment the fact happens, not by
  whichever screen remembers to. So migration
  `20260829150000_create_notifications.sql` puts them on the tables that
  already hold the facts: `class_claims` (asked → the person; answered → the
  studio), `enrollments` (booked → the studio; **waitlisted → enrolled → the
  learner**, which is the prototype's `__DOSWAITCALL`), `refunds` (requested →
  the studio; decided → the payer), `payouts` (settled → the payee),
  `enquiries` and `enquiry_quotes` (sent → the studio; quoted → the sender),
  `event_bookings` (a seat or an entry → the organiser; **a duet partner asked
  → the partner**, and their answer → the entrant), `crew_members` (asked → the
  person; answered → the leader). Every path that writes those rows raises the
  same notification — an action, an RPC, the Cashfree webhook, a proof script,
  the demo seeder — because none of them can write the row without passing the
  trigger. The proof asserts this the only way that means anything: **it never
  calls a notify function**, it books, asks, answers, pays and refunds, then
  reads what appeared.
- **⚠ RLS.** `notifications` is per PERSON (`user_id` → profiles): there is no
  such thing as a tenant's notification, only its owner's, which is why
  `notify_tenant_owners` fans out to the owners and nobody else — a trainer has
  no business reading what a studio was told about its money. One SELECT policy
  per table (`user_id = auth.uid()`, no deleted_at filter — Step 3's lesson),
  **no insert policy anywhere**, no public policy at all, and `notify` /
  `notify_tenant_owners` / every trigger function revoked from public, anon
  AND authenticated. `mark_notifications_read`, `clear_notifications`,
  `my_notification_prefs`, `set_notification_prefs` and
  `my_unread_notifications` all scope to `auth.uid()` INSIDE the function, so
  passing somebody else's ids touches nothing (proof check 7 does exactly that).
  `set_notification_prefs` refuses a kind the app cannot act on and a switch
  that is not a boolean.
- **A notification never breaks the fact it observes.** A trigger runs inside
  the transaction it watches, so `notify` drops a notification whose recipient
  has no live profile and swallows anything else that goes wrong. That is the
  whole of its error handling and it is deliberate: an unsent notification is a
  missing line on a screen; a failed insert is a lost seat.
- Migration `20260829163000_notify_auto_refund.sql` — **the proof found this,
  not a reading.** Step 9 files a cancellation OUTSIDE the 48-hour window as
  `pending` (the rail refunds it, nobody decides), and the first cut only spoke
  on an INSERT of `requested` and on the deciding UPDATE. So the commonest
  refund of all was silent to the payer: seat back, money moving, no line
  anywhere. The same trigger now says both things — the studio hears a request
  that needs deciding, the payer hears that money is coming back, whether a
  person decided it or the policy did. (Rule 4: the applied migration is
  untouched.)
- Repository `repositories/notifications.ts`, `types/notification.ts`
  (NOTIF_KINDS with the prototype's tints, the prefs shape, `agoWords` for the
  relative age the prototype prints), Zod actions in
  `features/notifications/server-actions/notifications.ts` (read, clear, prefs
  — nothing raises).
- UI: **`/notifications`** (S_notif lifted — the hero in the notifications tint
  with "What needs you", "N unread · N total", the settings chip and Read all;
  the stacks; the rows opening their `href` and marking themselves read on the
  way; Mark read / Clear all; the empty state, which also says when every kind is
  switched off; the settings sheet) and **the bell in `AppChrome`** with the
  pink badge, its count read once per render of the `(app)` layout and passed
  down — a failed count is zero, never an error page, because the bell is
  decoration on somebody's actual work.
- **Deliberately not lifted / not wired, tracked in the backlog (Rule 12):** a
  real web push (VAPID keys + a service worker + a subscriptions table), WhatsApp
  and email delivery (Step 26's provider; the verified Resend domain), the
  prototype's swipe-left-to-clear gesture (a touch gesture with no test — the ×
  is the way, and the hint line is simply not printed), the theme chip inside
  S_notif's own hero (the chrome already carries one), and the Inbox's Remind
  button, which can now be built on this table.
- Verified: `scripts/rls-proof-notifications.ps1` — 12 checks green (a booking
  tells the studio and the trigger is what tells it; it is ONE person's and
  neither the learner nor a rival nor the public can read it; **no way to write
  one from outside** — direct insert refused, `notify` refused to a signed-in
  caller and to the public; a consent ask reaches the person asked and the answer
  reaches the studio; **the freed seat tells the waitlisted learner**; both ways a
  refund is filed — inside the window the studio hears it and the payer hears the
  decision, outside it the payer is told anyway; a rival marking or clearing the
  owner's rows touches 0; the owner's own read and clear work and the unread count
  follows; prefs are made on first read, a made-up kind and a non-boolean are
  refused, and switching a kind off deletes nothing; prefs are private; **a
  notification never breaks the fact** — a booking lands with no notification for
  a deleted profile; clearing is soft and clearing nothing in particular is
  refused). Regressions re-run green: payments (12), refunds (12), attendance
  (10), crews (14), events (16), enquiries (12) — the triggers sit on those very
  tables, so this was the point. **One of the regressions was already red:
  `rls-proof-enrollments.ps1` had been failing since Step 9 (24 Aug) — it builds
  a ₹300 class and calls `enroll_in_session`, which Step 9 deliberately made
  illegal — and nobody re-ran it for four days.** Repaired: the class is free
  (the capacity and waitlist claims it exists to prove belong to a free one) and
  the paid refusal became check 10. **Lesson: a proof is only true the last time
  it ran — when a rule changes, re-run every script the rule touches, not only
  the one being written.** e2e extended: the owner finds the bell badge, opens
  the screen, reads the Bookings and Events stacks the story itself made, opens a
  row that names the learner's booking, marks the stack read, switches Bookings
  off in the settings sheet and watches the stack disappear and come back with
  its history; the trainer reads their crew ask and clears the People stack.
  typecheck / lint / production build / both specs green.

### Step 23 — Search + Discover filters ✅ (done 28 Aug 2026)
- **Postgres, not Typesense — decided and written down.** The roadmap named
  Typesense. At pilot scale every searchable table holds tens of rows, so a
  prefix match over `lower(name)` answers instantly and a sync pipeline would be
  machinery with nothing to carry (plus a second source of truth to drift). The
  migration says so in its own comment, and `search_dance_os` is the seam: when
  row counts ever warrant an index or an engine, the function keeps its shape and
  the inside changes. No trigger, no reconciliation job, no new dependency.
- Migration `20260829120000_search_dance_os.sql`: one function,
  `search_dance_os(p_q text, p_limit integer default 3)` returning
  `(kind, id, name, sub, href)` — studios, artists, crews and events, at most
  `p_limit` each, ordered inside each kind. **SECURITY INVOKER on purpose**
  (unlike every other function in this codebase): the caller's own RLS decides
  what is found, which is exactly the behaviour a search box needs — a stranger
  finds listed businesses, live crews and published events; the owner of an
  unlisted studio finds it; nobody's draft leaks. The match is the prototype's
  own predicate (`m`, 4546): the name STARTS with the term, or a WORD in it
  does — `like 'term%' or like '% term%'` — so "kothrud" finds "Zq Studio
  Kothrud" and "othrud" finds nothing. An event is found by its title **or its
  organiser's name** (the prototype searches `ev.t` and `ev.org`). The `sub`
  and `href` are built in SQL, so every row knows what it says and where it
  goes. **People are not searched**: `profiles` is readable by signed-in users
  only, and there is no person page for a row to open — the prototype's Dancers
  section navigates to one, and that page is on the backlog. Granted to anon and
  authenticated; revoked from public.
- **The filters are not schema.** `features/discovery/filters.ts` is pure: the
  parse/serialise pair that makes the URL the state (`parseFilters`,
  `filtersToParams` — defaults left out so a clean list has a clean address),
  `filtersOnCount` (what the Filters button counts, 4664), `radiusOf` (the
  sheet's distance becomes the `nearby_tenants` radius), and one predicate set
  per list. The prototype's rule is honoured literally (4456-4460): "Distance
  only bites on records that carry a distance; time-of-day and duration are read
  off the printed clock … A filter that cannot be evaluated does not silently
  empty the list — it stands aside." So distance applies to businesses (the one
  list with a distance), time-of-day and duration to classes (off the IST clock,
  `hourOf`), price bands to classes and events, kind and format to events, and
  style everywhere — a business through the styles of its **published** classes
  (`findPublishedStylesByTenant`, so a draft's style never narrows one in), an
  event or class or crew through its own. "All styles" is never excluded by a
  style filter: an event open to everybody is not narrowed out of a Hip-Hop
  search.
- **The address IS the state**, which is how the prototype's
  `__DOSDISCOVERSTATE` (4427: "Discover remembers its tab, city and style filter
  across drill-ins, so BACK returns exactly where you were") becomes real here
  without a store: every control replaces the URL, the server page re-reads and
  re-filters, and a filtered shelf is a link you can send.
- UI lifted into `features/discovery/components/DiscoverFilters.tsx`: the one
  **search box** ("Search" — "the placeholder listed the same five things a third
  time", 4539) with the bifurcated dropdown (sections in the prototype's order,
  three rows each, "No matches anywhere on DanceOS.", each row a real `Link` to
  the thing it names); **THE STYLE RAIL** as `DosStyleTile` (1754 — the style's
  whole name in white on a tile of its own colour, the ring marking the picked
  one, three rows and a sideways scroll, ordered by class count like
  `STYLES_ORDERED` 4212, with All first); **Filters · N** and the quick chips
  (Free, Evening, and Battles on events / Near me elsewhere — "the button shrinks
  to its own width, and the space it was wasting carries the two or three filters
  people actually reach for", 4655) with **Clear**; **THE FILTER SHEET** (4827,
  editing a draft and applying on **Show results**, Reset all, rows offered only
  where they mean something); and the events tab's own **search box**
  (S_eventslist 13551 — title, style or organiser, debounced into the URL). The
  empty state now distinguishes "nothing here yet" from "nothing matches that",
  the second with a **Clear filters** door.
- **Deliberately not lifted, tracked in the backlog:** the map view (needs a map
  and real addresses — studios still sit at their city centroid), long-press on a
  style tile to open the style page (`S_styleinfo` is unbuilt), the Dancers
  section of the search dropdown (person pages), and the search box's
  nav-bar-hiding behaviour (`__DOSNAVHIDE` — our chrome is a fixed bar per route).
- Verified: `scripts/rls-proof-search.ps1` — 8 checks green (a stranger finds the
  listed studio, the crew and the published event and neither the unlisted studio
  nor the draft; **the unlisted studio is its owner's to find and the draft its
  owner's**, and one owner still cannot find the other's private business; a word
  that starts with the term matches and a mid-word substring does not; an event is
  found by its organiser's name; **a dancer's name returns no row**; `p_limit`
  caps each kind and every row carries the href it opens; an empty or blank term
  finds nothing; and Discover's style filter reads published classes only, so a
  draft's style never narrows a business in). e2e extended: the learner searches
  "E2E Studio", opens the studio from the dropdown, taps Bollywood on the style
  rail (the URL carries `styles=Bollywood`, the class stays), finds a style the
  studio does not teach empties the shelf with a Clear filters door, switches to
  Events and taps **Battles** (the battle stays, the showcase goes), opens the
  sheet and sorts **Cheapest** (the URL carries `sort=price`, the button reads
  "Filters · 2"), clears, then narrows by the events box. typecheck / lint /
  production build / both specs green. **Lessons:** (1) this repo's lint forbids
  creating a component during render (`react-hooks/static-components`) — the
  sheet's `Row` and `chip` are module-level. (2) Two style taps in a row raced
  the URL replace: the second tap read the first render's props and both styles
  ended up in the address; the e2e drives one tap per control and reaches other
  filter states by `goto` (a real user waits for the list to redraw). The
  Playwright test timeout is 300 s now — the story is Steps 6-23 long.

### Step 22 — Crews ✅ (done 28 Aug 2026)
- **Scoped against the prototype first, as the tracker asked.** Auditions do not
  exist in this product (13520-13523) and the open call was declined
  (13565-13573), so the roadmap row's "+ auditions" is not built. What the
  prototype keeps is the crew as a record (CREWS 661-708: name, city, style, a
  roster with roles, the battles it entered) and two relationships (S_bizhub
  2596-2603): "A crew you lead and a crew you dance in are not the same object
  with a flag on it: one has a roster … to keep, and the other has a page you
  read." The crew manager (S_crewmanage 16318) had already lost Bookings,
  Payroll, Practice and Chats in the prototype's own words — none is lifted.
- Migration `20260829090000_create_crews.sql` (⚠ RLS): `crews` (name ≤ 64,
  city, style, leader_id → profiles, photo, audit, soft delete — **no
  tenant_id**: a crew belongs to a person, not a business) and `crew_members`
  (role leader | member | trainee, status asked | confirmed | rejected, sort, one
  live row per person per crew). **Consent is the design** (1792-1812, the same
  rule as class claims and team invites): a crew is a public entity — anyone
  reads the record and the CONFIRMED roster, Discover lists it — while an
  unanswered ask is readable by the leader (`is_crew_leader`) and the person
  asked only, and `respond_to_crew_ask` is theirs alone. No insert/update/delete
  policies: `create_crew` (the leader confirmed by construction, everyone named
  ASKED), `update_crew`, `ask_crew_member` (a no or a withdrawal soft-deletes
  and a fresh ask is a fresh row; asking a member again is refused),
  `withdraw_crew_ask` (unanswered only), `remove_crew_member` (the leader
  removes, a member leaves, **the leader cannot leave — hand the crew to somebody
  first**), `set_crew_member_role` (Promote a trainee; **Make leader** moves
  `leader_id` and demotes the old leader to member — the prototype's "a row only
  offers what it can actually change", 16382), `reorder_crew_members` (the
  public roster's order is the desk's ↑ ↓), and the aggregate-only
  `crew_member_counts` granted to anon.
- **Step 21's two debts, paid here.** `event_bookings.crew_id`: a crew entry
  is made by the person who LEADS the crew, from a crew they lead (13397-13420) —
  `book_event` refuses a crew entry without `p_crew_id`, one whose leader is
  not the caller, and a crew already entered; `entrant_name` carries the crew's
  name at the time. `event_bookings.partner_id` + `partner_status`: a duet
  partner is a PERSON on DanceOS (13362-13395; DOS_LINK_WHAT.partner has
  `offOk:false` — they cannot confirm from outside it), named from their profile
  and ASKED; `respond_to_partner_ask` is the partner's alone; the entry holds
  whatever they answer ("blocking here would only strand money", 1815-1817) — what
  changes is what the organiser sees ("with X · awaiting partner" / "partner
  declined"). A typed partner name no longer books. Two policies added: the
  partner reads the entry naming them; **a crew's entries into published events
  are public** — its battle record (16437). `book_event` was dropped and
  recreated (defaults would have made two overloads ambiguous); the old proof's
  typed-name calls were updated to the rule.
- Repository `repositories/crews.ts` (every "mine" query says `leader_id = me`
  or `user_id = me` out loud; the roster read admits asked rows for the leader
  and confirmed for everybody else, by RLS; `findCrewEntries` is the battle
  record off public rows; the partner asks from both ends), `searchProfiles` in
  `repositories/profiles.ts` (the one people search — live profiles by name,
  the caller left out, at most eight), `types/crew.ts`, Zod actions in
  `features/crews/server-actions/crews.ts` and `features/people/server-actions/people.ts`.
  Two FKs from `event_bookings` to `profiles` now exist, so every embed says
  `profiles!event_bookings_user_id_fkey`.
- UI lifted: **the Crews hub** `/crews` (S_bizhub kind="crews" — the red paint,
  CREWS YOU LEAD with Manage ›, the dashed ＋ Create crew, CREWS YOU ARE IN with
  Profile › — "where a row goes decides what pressing it does"); **Create your
  crew** `/crews/new` (crewFormOnly 9545-9611 — the blue sleeve, DETAILS with
  the city list and the app's own style registry, MEMBERS · N added as a row of
  faces, Save crew, CONFIRM · CREATE CREW "+ you as leader", the manager opens on
  it); **the crew desk** `/crews/{id}/manage` (S_crewmanage — the strip whose
  photo and name both open the crew's page, the three tiles, Members | Battle
  record; a row per person with the role colour on its edge, ASKED IS NOT JOINED
  "⏳ Waiting on them to confirm", Promote / Make leader / Remove or Withdraw, the
  ↑ ↓; ＋ Add member → SEARCH DANCEOS, THEN ASK THEM — "nobody is added by this";
  the battle record's rows each a door to the event's page — "A ROW OPENS ITS
  EVENT, OR IT IS NOT A BUTTON", and every one of ours has an event); **the public
  crew page** `/crew/{id}` (publicEntity="crew" 10565-11060, the branch at
  11044 — the lit profile, CREW over the name, the QR, Since {year} · city, the
  figures Members / Events, the style coin, "You lead this crew · Manage ›" or
  "You are in this crew", Crew leader and Crew members each headed with a count,
  "Nobody else in the crew yet.", the battle record); `CrewCard` on Discover's
  **Crews** tab (CompactCard 4813, two to a row); the Inbox's Requests desk with
  **crew asks** (CREW · "wants to add you to {crew}" · Confirm / Reject; Sent ·
  Withdraw) and **duet-partner asks** (EVENT · "wants to enter with you into
  {event}"); the event page's **Which crew** (the crews you lead as radio rows,
  pre-picked when there is one; "Only the person who leads a crew can put it
  forward" with a Create a crew › door when you lead none) and **Your partner**
  (the PeoplePicker, "They will be asked to confirm — the entry holds either
  way"); the organiser's register row; a Crews door under RUN YOUR BUSINESS on
  Home (the prototype's Crews entry tile, 2495-2512); AppChrome titles. Shared:
  `features/people/components/PeoplePicker.tsx` (the add panel 16413-16447 —
  the glass, "Type a name to find them." / "Nobody on DanceOS by that name." /
  the hits with initials and the word on the right), `features/crews/components/crew-kit.tsx`.
- **Departures, stated and tracked in the backlog:** the desk's tiles read
  Members / Entered / Upcoming where the prototype's read Members / Battles won /
  Points — results and points need scoring, which no table holds; "See crew
  ranking" waits for Step 25; practice attendance and pay per performance are not
  columns; a member row's photo/name door goes nowhere yet (person pages);
  Follow a crew (follows target tenants); a crew photo (media slice); Enquiry a
  crew.
- Verified: `scripts/rls-proof-crews.ps1` — 14 checks green (the leader is
  confirmed and the named member ASKED; a stranger reads the crew and the
  confirmed row only, the count agrees; the asked person reads their ask and
  neither a bystander nor the leader can answer it; no direct writes; confirming
  moves the public roster and the count, a bystander cannot ask; **a no is a no
  and a fresh ask is a fresh row**, asking a member again refused; withdraw is the
  leader's and for an unanswered ask only; **Make leader hands the crew over**
  and the old leader can no longer ask, then back; the leader cannot leave, a
  bystander cannot remove, a member leaves, the leader reorders; **a crew entry
  without a crew, or by a member who does not lead it, is refused, the leader
  enters as the crew and cannot twice**; a stranger reads the crew's entry and no
  other booking; **a typed partner and yourself are refused, a person is named
  and asked**; the partner reads the entry naming them and only they answer,
  once; the hub's two lists come off real rows). `rls-proof-events.ps1` re-run
  green (16) on the new `book_event` — checks 8 and 15 updated to the rule. e2e
  extended: the learner creates a crew from the hub and asks the trainer, sees
  "⏳ Waiting on them to confirm" and one member; the trainer confirms from the
  Requests desk; the desk counts two, the public page counts two and says "You
  are in this crew", the hub lists it under CREWS YOU ARE IN, Discover's Crews
  tab lists it; the owner publishes a crew battle (crews only, eight places,
  tickets off); the learner enters it with the crew pre-picked and holds the
  entry; the organiser's register reads "Crew entry · entered by its leader ·
  registered"; the crew's page carries the event as its battle record.
  typecheck / lint / production build / both specs green. **Lessons:** (1)
  `ConvertTo-Json` defaults to depth 2 — a nested `entry_tiers` array
  serialised as `"System.Collections.Hashtable"` and `save_event` failed on a
  null format; pass `-Depth 8` in a proof's `Rpc`. (2) Node's `spawnSync`
  refuses `npx.cmd` without a shell (EINVAL) — spawn `npx` with `shell: true`.
  (3) Leaked e2e accounts from earlier failed runs made the people search
  return two "E2E Trainer"s and the strict locator failed — the leak was
  cleaned (five `e2e-*@example.com` users); the finally block is the only
  cleanup, so a run killed mid-way leaks.

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

### Rail swap — Cashfree replaces Razorpay ⚠ (28 Aug 2026, no new step)
- **Why.** The user needs money in AND out for many studios. Razorpay's
  money-out is RazorpayX — a separate current-account onboarding with partner
  banks — and Route (marketplace splits) is compliance-gated (switched off for
  merchants who failed review from 1 Jan 2026). Cashfree gives Payment Gateway
  and Payouts under one account with one sandbox, and its test keys are
  auto-generated at sign-up before any KYC. The user signed up and pasted the two
  pairs into `.env.local` (`CASHFREE_ENV`, `CASHFREE_APP_ID`,
  `CASHFREE_SECRET_KEY`, `CASHFREE_PAYOUT_CLIENT_ID`, `CASHFREE_PAYOUT_CLIENT_SECRET`).
- **The multi-studio model, decided with the user.** Many studios collect from
  students and pay their own trainers. Collecting everything into one DanceOS
  account and paying studios out of it is payment-aggregator activity under RBI
  rules — a licence, not a feature. So: DanceOS is the merchant, each studio
  becomes a Cashfree **Easy Split** vendor (Cashfree KYCs the studio and settles
  its share straight to the studio's bank on every order; our commission stays)
  — one `vendor_id` per tenant when Cashfree's account manager enables it — and
  trainer pay stays Step 13's honest record: the studio pays from its own bank.
  Per-studio Payouts (their wallet, their KYC) only if a studio asks. **Payouts is
  therefore not wired into the app**; the sandbox pair is valid (a wrong key gives
  401, this gives `403 IP not whitelisted`) and stays reported, not asserted, by
  the smoke proof.
- Migration `20260828230000_provider_neutral_rail.sql` (⚠ money, ⚠ RLS-adjacent):
  columns renamed `razorpay_* → provider_*` on orders / payments / refunds (their
  unique indexes renamed with them), `provider text check in ('razorpay','cashfree')`
  added to all three — existing rows stamped 'razorpay' (they were the first
  cut's test ids), default 'cashfree' from here. **A plpgsql body is text**: a
  column rename does not follow it into the functions that read it, so every
  function touching those columns is recreated in the same transaction —
  parameters renamed where they named the vendor (`attach_razorpay_order →
  attach_provider_order(p_order_id, p_provider_order_id)`, `apply_captured_payment /
  apply_failed_payment / apply_refund_update` with `p_provider_*`,
  `attach_razorpay_refund → attach_provider_refund`, `attach_settled_refund_reference`
  with `p_provider_refund_id` — dropped and recreated, Postgres refuses to rename
  a parameter in place) and bodies-only changes kept by `create or replace`
  (`cancel_booking` now returns `provider`, `provider_order_id`,
  `provider_payment_id`; `decide_refund` the same; `settle_refund_offline` reads
  `provider_refund_id`). Payment and refund rows written by the appliers inherit
  the order's provider. Grants re-stated verbatim: appliers service_role only,
  the binds authenticated. No policy changed.
- **The Cashfree edge.** `lib/cashfree/api.ts`: `createCashfreeOrder` (our order
  uuid travels as `dos_<hex>` — Cashfree's order_id grammar — with
  `customer_details`; Cashfree REQUIRES a customer phone, so phone-OTP accounts
  send theirs and email accounts send a placeholder the sandbox accepts until
  profiles carry a mobile at Step 26 — the receipt is keyed on OUR user id, never
  on that), `fetchCashfreeOrderPayments` (the authoritative list after the modal
  closes), `refundCashfreePayment` (refunds are filed against the ORDER on
  Cashfree, so `cancel_booking` and `decide_refund` hand back the provider order
  id); rupees ⇄ paise conversions live there once. `lib/cashfree/signature.ts`:
  `Base64(HMAC-SHA256(x-webhook-timestamp + rawBody, SECRET_KEY))` — there is no
  separate webhook secret — plus a ledger id hashed from timestamp + body because
  Cashfree stamps no event id. `/api/webhooks/cashfree`: verify first (401), the
  exactly-once ledger, then the idempotent appliers — PAYMENT_SUCCESS_WEBHOOK →
  `apply_captured_payment` (a seat that cannot be granted fires the refund back),
  PAYMENT_FAILED / USER_DROPPED → `apply_failed_payment`, REFUND_STATUS_WEBHOOK →
  `apply_refund_update` on SUCCESS / CANCELLED only (PENDING / ONHOLD are
  acknowledged and waited out). A Cashfree RETRY carries a fresh timestamp, so it
  is a new ledger row that lands on an RPC idempotent on the provider payment id
  — the e2e proves both the replay and the retry are no-ops.
- **Checkout.** `startCheckoutAction` makes our order, the Cashfree order (amount
  from the database, never the client) and binds the id; `PayFlow` loads
  `sdk.cashfree.com/js/v3/cashfree.js` and opens `Cashfree({mode}).checkout({
  paymentSessionId, redirectTarget: "_modal" })`; when the modal resolves,
  `confirmCheckoutAction({ orderId })` reads OUR order (`user_id = me` out loud),
  fetches its payments from Cashfree and applies the SUCCESS one through the same
  RPC the webhook uses — whichever lands first wins. No signature travels through
  the browser any more; the browser's word is simply never used. Refund approvals
  and cancels call `refundCashfreePayment` and bind `cf_refund_id`; the
  REFUND_STATUS_WEBHOOK closes the row. The Razorpay files are deleted
  (`lib/razorpay/`, `/api/webhooks/razorpay`); `.env.local.example` documents the
  Cashfree keys and the webhook URL to register.
- **Verified:** `scripts/cashfree-sandbox-proof.ps1` — 4 checks + 1 informational
  against the live sandbox (order created in our grammar with a payment session;
  read back with 0 payments / 0 refunds; a refund on an unpaid order refused by
  Cashfree; a wrong secret refused; Payouts pair reported as valid-but-IP-gated).
  The five money proofs re-run green on the renamed RPCs: payments (12), refunds
  (12), class earnings (9), studio income (13), attendance (10). typecheck / lint
  / production build / both e2e specs green — the paid-webhook spec now signs as
  Cashfree (timestamp + body, Base64), asserts `provider = 'cashfree'` on the
  order, and adds the retry-with-fresh-timestamp case. **Lessons:** (1) PowerShell
  5.1 reads a JSON `[]` as ONE item even through a null filter — count off the raw
  text. (2) A stale `.next/types/validator.ts` from a previous build keeps
  importing a deleted route and fails `tsc`; delete `.next/types` after removing a
  route. (3) Cashfree's Payouts sandbox is IP-gated even for a valid pair — a 403
  "IP not whitelisted" is not a key problem. (4) `powershell -File` from Git Bash
  trips the execution policy; run proofs through the PowerShell tool.
- **What still waits on the user (ops):** Cashfree KYC (live PG keys), the
  webhook registered at `{deployment}/api/webhooks/cashfree` for the payment and
  refund events, Easy Split enablement via their account manager, and — only if
  payouts are ever wanted — this machine's IPv4 whitelisted or the 2FA public key.

### UI parity backlog — gaps vs the prototype, tracked so none is forgotten

Rule 2 says the prototype's UI is the spec. These are the known, deliberate gaps
between the built screens and their prototype counterparts, each tagged with the
slice that closes it. **Add to this list whenever a screen ships simplified;
remove entries as they close** (Rule 12).

**Audited 28 Aug 2026 (third session)** — every step record's "Deliberately not
lifted" / "Departures" / "Deliberately absent" list was read against this table
and reconciled: one row per gap, nothing in prose only. Two rows were stale and
are corrected below (the events search box landed with Step 23; the
unassigned-screens row still said Razorpay and "after Step 22"). Gaps that are
NOT parity — the features the prototype deliberately removed (16, 17, 19, 20) —
are recorded in the Phase 3 re-scope above rather than here, because there is
nothing to lift.

| Gap | Prototype ref | Closes with |
|-----|--------------|-------------|
| Notifications: a real web **push** (VAPID keys + a service worker + a `push_subscriptions` table), **WhatsApp** and **email** delivery — the three switches are stored and honest about waiting; the prototype's swipe-left-to-clear gesture (the × is the way; no test drives a touch gesture); the theme chip inside S_notif's own hero (the chrome carries one) | S_notif 13800-13810, 13746, 13727 | push as its own slice; WhatsApp with Step 26; email with the verified Resend domain |
| Home: QR share sheet, rank row, style row, full PassDeck (session codes, invoices) | Home 7248+, PassDeck | Phase 2-3 slices |
| Profile tab: full S_profiletab (stats, achievements, reviews, settings, the Followers/Following sheets) — today it is identity + the Following figure and list + log out | S_profiletab | Phase 3 |
| Public profile: About (needs a bio field), the founding year (needs a field — the page prints "On DanceOS since {year}" from created_at), Call and Enquiry, Photos and the albums/plans tabs, Stats, the Following figure and rank (a business has neither); the owner's Followers sheet (`findTenantFollowers` exists, no sheet); **person pages** (dancers, artists as people — `PubTrainer` is a person in the prototype; the crew desk's member rows and the Requests desk's View › would open them) and following a person or a crew | S_profiletab publicEntity 10565-11380 | bio/photos with the media slice; Stats with 25; person pages + person/crew follows as their own slice |
| Stats: the metal tier / rank ladder on the hero (`dosTierOf` — a ladder nobody has designed; the hero shows the real place instead), the History library's city / room / provider / assistant filters and its search box (side and style ship), the **Wins** metric and a crew's battle record (both need scoring), the "updated daily" cadence and the 10% monthly decay (a product rule nobody has decided), and the studio-side S_reports / S_reportdetail | S_profiletab 9862-10520, 9610-9707; S_reportdetail | scoring with a later event slice; the rest need a product decision or their own slice |
| Inbox: studio rental requests on the Requests desk (S_rentals unbuilt); the Remind button (a nudge — buildable on Step 24's `notifications` table now); the judge enquiry's "Pick from DanceOS" event picker (events exist since Step 21 — the picker is not wired); the sender's real "Pay the advance" (Razorpay account); the earnings page's ALSO COLLECTED card counted from recorded advances | S_chats 5830, 5798, EnquirySheet 5135, S_enqdetail 5507, S_earn 18124 | an inbox slice / Step 24; the rest with a live Cashfree account |
| Refunds: the learner's own view of a decision. **No prototype screen exists to lift** — its only learner-side refund UI files the request (RefundSheet); the decision lives business-side. The learner-shaped `REFUNDS` array at 8506 is never rendered (its literals appear nowhere else). Needs a product decision, not a lift. | — (gap in the prototype itself) | unscheduled — decide first |
| Earnings: `Earnings by source` / SHARE OF GROSS, the stacked source bar and the source filter chips; the month statement's WHERE IT CAME FROM prints its one real source row (Classes) for the same reason. Tickets exist since Step 21 but every one is free until the rail has an account, so today it would still be one bar reading "Classes 100%" and a filter that filters nothing | S_earn 18020-18026, 18050-18053, 18139-18155 | with a live Cashfree account (paid tickets are the second source) |
| Earnings: the Settled / In transit tiles (they count bank settlements) and the gross card's "Settles T+2 · DanceOS fee 0.9% at source" subtitle. Today the GROSS card's first two tiles read **Net** and **Asked back** — the two real states of this money — beside REFUNDED | S_earn 18014, 18037-18047 | blocked with the deductions panel below |
| Earnings: the deductions + settlement panel only — `DanceOS fee · 0.9%`, `GST on fee · 18%`, `PAYOUTS TO YOUR BANK`, and the statements' Fee / GST deduction rows (Deductions hold only Refunds today, which is the truth) | S_earn 18156-18183 | blocked on a live Cashfree account + Easy Split (a platform fee that does not exist yet, and settlements with no account behind them) |
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
| Discover: the map view (studios still sit at their city centroid — it needs real addresses), studio photos, long-press a style tile to open the style page (`S_styleinfo` unbuilt), the Dancers section of the search dropdown (person pages), `__DOSNAVHIDE` while searching (our chrome is per-route) | S_discover 4100+, 4611, 4551 | a map/media slice; person pages as their own slice |
| Crews: the desk's Battles won / Points tiles (results need scoring — no table holds a score) and its "See crew ranking" button (the board exists since Step 25 at `/stats?tab=charts&seg=crew`; the button is not drawn), practice attendance and pay per performance on a member row, the photo/name door to a person's page, Follow a crew (follows target tenants), Enquiry a crew, a crew photo | S_crewmanage 16343-16348, 16368, 16460; publicEntity crew 10871 | scoring with a later event slice; person pages; a follows extension; media slice |
| Calendar: the Classes/Events switch above the sides — events exist since Step 21, the calendar still draws classes only; the event compose door on the studio calendar's FAB | SideTiles 6836, 10541 | a calendar parity slice |
| Events: the manager's Line-up / Bracket / Rounds / Judges / Earnings / Refunds / Setup segments, the judging sheet and WHO CAN SEE THE SCORES, the rules textarea and the theme (no columns — ABOUT is printed), the poster upload from the manager | S_eventmanage 14119-14960, S_event 13096-13131 | later event slices (brackets / judges / scores need their own tables; earnings and refunds need paid tickets); poster with the media slice |
| Events: paid tickets and entries through `orders` (the rail is class-shaped — class_id, session_id), the payment step's saved-methods list, the event waitlist and the sold-out Waitlist action, the completed page's CHECKED IN / REVENUE tiles | S_event 13452-13510, 13265, 12968-12995 | a live Cashfree account + an `orders` extension |
| Events: the add panel's Scan QR / New user arms, WHO ATTENDED on a completed page (names are private — the counts are printed), the venue amenity chips (the prototype seeds five for every event; no field), "Studios can't book" for a studio-role viewer who is not a member (only members are refused — the database's rule) — the duet partner as a person and the crews you lead landed with Step 22, the events search box with Step 23 | S_event 13040, 12985, 13273; WalkIn 13904 | real scanning; the rest need fields or a product decision |
| Calendar: hold-to-reorder on the side pills (a saved preference that also decides which side Home opens on), and `__DOSCALSTATE` remembering view + day across drill-ins | DosSidePill 6700, 8651 | Home parity slice |
| Calendar: the History chip in the hero — the record page exists since Step 25 (`/stats?tab=history`); the chip is not drawn | 9070-9074 | a calendar parity slice |
| **Prototype screens no roadmap step names** (inventoried 28 Aug 2026), so they are not lost: S_memberships (class packs / plans ⚠) 16846, S_rentals (room rental rates + requests ⚠) 16489, S_invoices 16691 and S_payments 16531 (the studio's payments ledger), S_expenses 16720, S_assets 16791, S_choreos + S_routinedetail (routines) 17115/17215, S_people + S_persondetail (the student pool and a person's record) 17293/17516, S_subscr (DanceOS Pro · Artist plan ⚠) 16935, S_settings (the studio settings segments beyond Rooms) 18352, S_bookings (the learner's bookings list — /my-classes stands in) 6099, S_managed / G_managed ("everything you manage") | as listed | after Step 26: memberships + rentals + invoices need the live **Cashfree** account (they are money screens); people / routines / settings / S_managed are their own slices, none blocked by anything |

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
| 16 | ~~Reviews + rating rollups~~ — **no such screen in the prototype**; it says so itself (4218). Not built. | — | — |
| 17 | ~~Social feed~~ — **removed from the prototype** (4895-4896). Not built. | — | — |
| 18 | **Inbox** (re-scoped 28 Aug 2026): the Requests desk (asks waiting on you — class claims, team invites, crew asks) and the Enquiries desk (the five-type enquiry system: sent from a profile's EnquirySheet, quoted with an advance, staged New · Quoted · Won · Lost) | `enquiries` table + RLS + RPCs; requests read off existing rows | S_chats 5617, S_enqdetail 5380, ENQ_TYPES 4900, EnquirySheet |
| 19 | ~~Moderation~~ — **removed with the feed** (4897). Not built. | — | — |

**Phase 4 — Performance & events**

| # | Slice | Backend | Prototype UI source |
|---|-------|---------|---------------------|
| 20 | ~~Video/reels~~ — **no reel, post or feed screen in the prototype.** Not built. Photo uploads (class posters, studio photos, profile pictures) remain a media slice with Storage. | — | — |
| 21 | ⚠ Events, competitions, ticketing (reuses the Step 9 Razorpay rails) | events/tickets | event screens |
| 22 | Crews (auditions are gone from the prototype — fills Discover's crews tab; pays Step 21's crew-entry and duet-partner debts) | crews/crew_members + event_bookings.crew_id/partner_id | S_bizhub 2585, crewFormOnly 9545, S_crewmanage 16318, publicEntity crew 11044 |

**Phase 5 — Scale & intelligence**

| # | Slice | Backend | Prototype UI source |
|---|-------|---------|---------------------|
| 23 | Search + Discover filters — **Postgres, not Typesense** (the reason is in the migration: tens of rows per table at pilot scale, so a sync pipeline would carry nothing); the map view stays on the backlog | `search_dance_os` (SECURITY INVOKER) + pure URL-state predicates | S_discover 4535, 4596, 4655, 4827; S_eventslist 13551 |
| 24 | Notifications — in-app, raised by TRIGGERS where the facts happen (a claim, a booking, a freed seat, a refund, a payout, an enquiry, a quote, an event entry, a duet partner, a crew ask); the bell with its badge; the prefs sheet. Delivery channels stored, not yet sending — no OneSignal/FCM dependency taken on | `notifications` + `notification_prefs` + 8 trigger functions | S_notif 13702, NOTIF_KINDS 13642, the bell 19252 |
| 25 | Analytics / Stats — the person's record (conducted · assisted · attended, in sessions and hours), the History library, and the four Global Rankings boards. Aggregate-only definer functions, no new table; wins, the daily refresh and the monthly decay are absent because nothing behind them is real. DAU/MAU/GMV would be an ADMIN screen the prototype does not have | `dance_points`, `my_dance_stats`, `my_session_history`, `dance_chart`, `my_chart_place` | S_profiletab historyOnly 9862 / classesOnly 9708 / chartsOnly 9610 |
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
12. **Nothing is deferred without a row.** Every time a slice ships something
    simplified, absent, or "for later" — a prototype control not lifted, a
    figure that needs a field, a feature waiting on an account — it goes into
    the **UI parity backlog** table in the SAME push, with three things: what
    the gap is, the prototype line it comes from, and what closes it. The step
    record's "Deliberately not lifted" list and the backlog table must agree;
    a deferral that lives only in prose is a deferral that gets skipped. When a
    later slice closes a gap, edit or remove its row in that push too — a
    backlog row for something already built is the same bug pointing the other
    way. Audit the two against each other whenever a step lands (the last audit
    is dated at the head of the table).

## Session log

Four lines per session, written when the user ends it. The step records above hold
the technical detail; this log is the at-a-glance history.

### 28 Aug 2026 — third session
- **This session:** **Step 22 — crews**, **Step 23 — search + Discover
  filters**, one-command **demo data** with **Rule 12** (nothing is deferred
  without a backlog row) and a dated backlog audit, **Step 24 —
  notifications**, and **Step 25 — analytics / Stats** (the record, the History
  library and the four ranking boards; no new table, aggregate-only definer
  functions, and wins / daily refresh / monthly decay left out because nothing
  behind them is real — a second migration fixed two boards the proof found dead
  on plpgsql OUT-parameter shadowing). 14-check proof. Step 24: two migrations — `notifications` +
  `notification_prefs` with eight TRIGGERS that raise a notification where the
  fact happens (so every path that writes the fact raises it, and `notify` is
  revoked from every client role and can never break the fact), then a
  proof-found follow-up because an automatic refund told nobody. The screen is
  S_notif lifted (stacks per kind, Mark read / Clear all, the "What reaches you"
  sheet) plus the bell and its badge in the chrome; in-app is the only delivery
  and the three channel switches say so. 12-check proof, six regressions — one of
  which (`rls-proof-enrollments`) had been red since Step 9 and is repaired. Step 23: one migration holding one function
  (`search_dance_os`, SECURITY INVOKER — the caller's RLS decides what is
  found; Postgres rather than Typesense, with the reason written into the
  migration), the filters as pure URL-state predicates
  (`features/discovery/filters.ts`) applied on the server, and
  `DiscoverFilters` lifting the prototype's search box + dropdown, the style
  rail, Filters · N with the quick chips, the filter sheet and the events search
  box. 8-check proof; the e2e leg searches, filters by style, filters events by
  kind, sorts Cheapest from the sheet and narrows by the events box. Step 22 — crews, scoped against the prototype first (no
  auditions, no open call): migration `20260829090000_create_crews.sql` — `crews`
  and `crew_members` with rosters by consent (asked → confirmed, only the person
  asked answers, the leader alone asks / withdraws / removes / promotes / hands
  over / arranges, the leader cannot leave), and Step 21's two debts paid in the
  same migration: `event_bookings.crew_id` (a crew is entered by its leader from
  the crews they lead) and `partner_id` + `partner_status` (the duet partner is a
  person on DanceOS, asked). Screens lifted: the Crews hub, Create your crew, the
  crew desk, the public crew page, Discover's Crews tab, crew and partner asks on
  the Inbox's Requests desk, the event page's Which crew / Your partner pickers,
  the shared PeoplePicker, a Crews door on Home. 14-check proof, the events proof
  re-run (16) on the recreated `book_event`, both e2e specs green with a new crew
  leg (hub → ask → confirm → public page → Discover → a crew battle entered as
  the leader → the organiser's register → the battle record).
- **Done so far:** 24 / 29 steps (0–15, 18, 21–25). Live at
  https://dancestudio-orcin.vercel.app once this push deploys. The hosted project
  also carries a demo world (`node scripts/demo-data.js seed | status | wipe`).
- **Remaining:** Step 26 (WhatsApp OTP — mostly the user's accounts), then the
  parity backlog (scoring, web push, person pages, Discover's map, the media
  slice, memberships and rentals). Ops still open: Cashfree KYC + Easy Split, the
  webhook registration, a verified Resend domain, pilot invites.
- **Next session:** Step 26 — the last roadmap step, and mostly ops: the code is
  `channel: "whatsapp"` in `signInWithOtp`, and it waits on a Twilio
  account wired into Supabase, Meta business verification with an approved
  template, and DLT registration for the SMS fallback. Decide whether to ship it
  behind a flag while those are pending. Then the parity backlog, starting with
  what blocks nothing. Verify with `npm run typecheck`, `npm run lint`,
  `npm run build` (with nothing on :3000), the proofs through the PowerShell
  tool, and `npx playwright test` against a FRESH `npm run dev`.

### 28 Aug 2026 — second session
- **This session:** finished **Step 21 — events, competitions, ticketing ⚠** from
  the scaffolding: the public event page `/e/{slug}` (S_event lifted whole — the
  sleeve, the card on the page, PRIZE MONEY / WHEN / VENUE / FORMAT / TICKETS /
  POLICY, the booking bar, the confirm sheet and the payment step, the held
  ticket), the manager with Details / Participants / Spectators and real
  check-in and walk-ins, Discover's Events tab with the kind chips, the Your
  tickets shelf, the register's Events › chip, the chrome titles, a 16-check
  proof and the e2e leg from the desk to Discover to the door. The proof found a
  real bug in the applied migration — `text[] || 'literal'` made Postgres return
  `malformed array literal` instead of the publish blocker's sentence — fixed by
  a second migration, applied over the pooler and re-proven. Three environment
  lessons recorded (Windows command-length ceiling → Write tool + scratchpad
  scripts; `next build` beside `next dev` wedges the dev server; the e2e
  timeout is 180 s). Then, at the user's decision, **the rail swap — Cashfree
  replaces Razorpay** (both directions under one account; sandbox keys before
  KYC): a provider-neutral migration recreating every money function, the
  Cashfree edge (orders, payment sessions, refunds, webhook signature), the
  checkout modal, a sandbox smoke proof, the five money proofs re-run, both e2e
  specs green. The multi-studio money model was decided: Easy Split settles
  studios, no platform payouts.
- **Done so far:** 20 / 29 steps (0–15, 18, 21). Live at
  https://dancestudio-orcin.vercel.app. Free seats and entries book end to end;
  a priced one refuses with Step 9's sentence until the Cashfree account is live (KYC).
- **Remaining:** Steps 22–26 (crews — scoped without auditions, search,
  notifications, analytics, WhatsApp OTP), then the parity backlog. Ops still
  open: Cashfree KYC + Easy Split enablement (paid classes, tickets, entries and
  enquiry advances all wait on the live account), a verified Resend domain,
  pilot invites.
- **Next session:** Step 22 — crews, scoped against the prototype first (the
  tracker's Next block says how). Register the Cashfree webhook on the live
  deployment once KYC lands; ask Cashfree for Easy Split. Verify with `npm run typecheck`, `npm run
  lint`, `npm run build`, the proof via `powershell -File`, and `npx playwright
  test` against a FRESH `npm run dev` (recycle it if a build ran beside it).

### 28 Aug 2026
- **This session:** a fresh clone on a new Windows machine (no pnpm, new-format
  Supabase keys, a stale DB password) — three environment lessons recorded, all
  proof scripts patched with a non-browser UserAgent, migrations re-enabled once
  the user reset the password. Then four steps: **13b part 2b** (the studio's
  money IN — GROSS by IST month, the ▲/▼ badge, Net/Asked back/Refunded, HOW
  STUDENTS PAID, month statements with a real CSV; 13-check proof; `bcd734b`),
  **14** (the calendar — S_profiletab's `calendarOnly` lifted whole, personal
  and studio routes, Train·Teach·Assist off real rows; fixed `findMyPendingClaims`'s
  missing `user_id` filter; `40d6a2b`), **15** (follows + public profiles —
  `follows` table, public `/studio/{id}` and `/artist/{id}`, the public schedule,
  follower pills on Discover; 12-check proof; `7543cb3`), and **18** (the Inbox —
  Requests from existing claims/invites, Enquiries with quotes as a conversation;
  migration + 12-check proof + the full e2e loop; `908b4d7`). Between 15 and 18,
  **Phase 3 was re-scoped against the prototype**: 16, 17, 19 and 20 describe
  features the prototype deliberately removed (its own words, line-referenced),
  so they are marked not built. **Step 21 (events) is scaffolded and committed**:
  migration applied, types/repository/actions, EventCard, the desk and the
  two-step form; build green.
- **Done so far:** 19 / 29 steps (0–15, 18) plus the Step 21 scaffolding. Live at
  https://dancestudio-orcin.vercel.app; migrations apply from this machine via
  `npx supabase db push --db-url` over the pooler; `SUPABASE_ACCESS_TOKEN` is a
  management-API fallback.
- **Remaining:** finish Step 21 (event page, manager, Discover tab, tickets shelf,
  chip, proof, e2e, docs — the ordered list is in the tracker's Next), then
  22–26, then the parity backlog. Ops still open: Razorpay account + keys (paid
  classes, tickets and enquiry advances all wait on it), a verified Resend
  domain, pilot invites.
- **Next session:** finish Step 21 from the tracker's numbered list, starting
  with `/e/[slug]` (S_event 12810). Verify with `npm run typecheck`, `npm run
  lint`, `npm run build`, the proof scripts via `powershell -File`, and `npx
  playwright test` against `npm run dev` (Playwright's config launches `pnpm dev`,
  which this machine lacks — start the dev server yourself; `reuseExistingServer`
  picks it up).

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
npm run dev         → run locally (http://localhost:3000)  [this machine has no pnpm]
npm run build       → production build (never beside a running dev server)
npm run lint        → eslint
npm run typecheck   → tsc --noEmit
npx playwright test → both e2e specs, against a FRESH npm run dev

node scripts/demo-data.js seed     → build the demo world in the live project
node scripts/demo-data.js status   → what demo data exists right now
node scripts/demo-data.js wipe     → remove ALL of it, in one step
```

### Demo data — one command in, one command out (28 Aug 2026)

`scripts/demo-data.js` fills the **hosted** project with a world to click
around in: eight people, two studios and an artist business, rooms, a trainer
who accepted a real invite, eight classes (free, paid, a full one with a real
waitlist, a draft, and one three days past with a register that was run), a
captured ₹300 payment and a refund waiting on the studio's queue, a settled
trainer payout, three leads at three stages, four follows, an enquiry quoted at
₹24,000, a crew with one member confirmed and one still asked, and four events
(a ticketed showcase, a solo/duet/crew battle with entries including a crew
entered by its leader and a duet awaiting its partner, another studio's battle,
and a draft).

Two properties make it safe to leave lying around:

* **It is written through the app's own doors.** Every demo user signs in for
  real and the rows are created by the same RPCs the screens call, so consent,
  capacity and the waitlist are all genuine — the demo world cannot contain a
  state the real one couldn't. The service role is used for exactly three things
  no user may do: creating the accounts, back-dating a session so a past class
  exists, and standing in for the Cashfree webhook (`apply_captured_payment`)
  so the money screens have real rows.
* **The wipe is total and precise.** Every account is
  `demo.<name>@example.com` and every row is owned by one of them, so the wipe
  deletes the demo businesses (cascading rooms, classes, sessions, enrollments,
  claims, invites, leads, orders, payments, refunds, payouts, events and event
  bookings) and then the demo accounts (cascading profiles, and with them crews,
  follows, bookings and enquiries). It never issues a delete that is not keyed
  on a demo id it just looked up, so nothing real can be caught by it.

The cast is the prototype's own (Bounce Dance Academy, EEE Crew, Rhea Kapoor…),
which is what makes demo data recognisable as demo data at a glance. The
password is printed by `seed`; sign-in is by email, so use the ✉️ Email tab.
`supabase/seed.sql` is a different thing and stays as it was: LOCAL ONLY, for
`supabase db reset`.

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
