# DanceOS — review, fixes, and the suites running

**16 Aug 2026 · third pass.** `DanceOSApp.jsx` 19,176 lines (from 19,298). Both artefacts built
from it by `build.sh` and tested.

**Your Playwright suites now run.** 22 of 24 green. The 2 red are one real product contradiction,
described in §A — they were red on your original file too, so nothing here caused them.

Backups: `/tmp/pre-fixes.jsx` (as received) · `pre-round2` · `pre-round3` · `/tmp/pre-consent-suite.js`.

---

## Chromium, unblocked

`npx playwright install chromium` fails here:

```
403 'Host not in allowlist: cdn.playwright.dev'
```

and `apt install chromium-browser` on Ubuntu noble resolves to `2:1snap1-0ubuntu2` — a snap shim
needing snapd, useless in a container.

**npm is allowlisted, and `@sparticuz/chromium` ships a real Chromium *inside the package tarball*
(brotli-compressed) rather than downloading one post-install.** So the binary arrives over an
allowed host. `setup-chromium.sh` does it in one command and verifies at the end:

```
Chromium 149.0.7827.0
Playwright + Chromium: WORKING
```

Two things that are not obvious and cost time:

- `libEGL.so` / `libGLESv2.so` / `libvk_swiftshader.so` must be extracted **beside the binary**,
  or it dies at startup with `Failed to load GLES library`.
- The container is root with no user namespaces, so the sandbox cannot start. `run-suites.js`
  launches with no args, so rather than edit it, `/opt/pw-browsers/chromium` — the path it already
  expects — is a **wrapper** adding `--no-sandbox --disable-gpu --use-gl=swiftshader`. Your runner
  is unmodified.

`build.sh` produces both artefacts your runner compares. It is `set -euo pipefail` deliberately:
the runner's own comment records a `bash build.sh | tail -1 && node run-suites.js` reporting ALL
GREEN on a build that never happened, because a pipeline exits with the status of `tail`.

### Suite results

```
PASS  smoke49 · 51 · 52 · 55 · 56 · 58 · 87   [both builds]
PASS  smoke-students · smoke-booking · smoke-safari · smoke-consent   [both builds]
FAIL  smoke-enquiry  [both builds]  the enquiry page offers no way to chat
```

Verified against your **unmodified upload**: identical 4 red. My work did not cause either.

---

## §A · The one unresolved failure — a product decision, not a bug

**`smoke-enquiry` claim 3 is red because internal chat has been removed from the app.**

The enquiry page offers **Call** and **Send a quote**. There is no Chat control, and there is no
thread to open. In `03-chats-home.jsx` the removal is deliberate and documented in place:

> `readIds`, `msg`, `attachOpen`, `info`, `open`, `byName` and `openT` all went with internal
> chat: there is no thread to open, no message to compose and no read state to keep.

The Chats sections are now `All · Requests · Enquiries` — the "Messages" section went with it.

**This contradicts the product specification in three places:**

- §13 lists **Chats** as one of five bottom-nav tabs
- §6.1: *"There is no 'Send enquiry' form. **Chat** replaces it"* — the app's answer to v1.0 open
  question #5
- §18: *"Its question about chat is answered — chat is built."*

So either the spec is stale and chat was intentionally dropped (in which case §6.1, §13 and §18
need revising, and this claim should be retired with the reasoning recorded), or chat was removed
by accident and a documented core feature is missing.

**I have deliberately left this suite red.** Restating the claim to match what the app now does
would be weakening it, and a red suite that names a real contradiction is worth more than a green
one that hides it. This is your call, and I did not want to make it silently.

---

## §B · The suite I did repair — `smoke-consent` claim 9

Red on your original too, and this one was a genuinely **stale suite, not an app bug**. The app is
correct; the suite had stopped testing it.

It tapped "Add member" and then clicked the last `role="button"` whose text looked like a person's
name — **without typing anything**. That worked while the sheet opened onto a list. It does not
now: the sheet opens on *"Type a name to find them."*, so the last name-shaped button on screen is
a **member row behind the sheet** — and member rows became navigable when the roster's photo and
name were wired to the profile.

So the claim was clicking *"Open Dev Malhotra's profile"*, navigating away, and reporting that
adding somebody to a crew asked nobody.

Verified in Chromium that the app does the right thing:

```
typed "Ananya" → hits: [ 'Ask Ananya Rao to join the crew' ]
   consent links with what=member: [ 'Ananya Rao | member | pending', ... ]
```

**The claim is unchanged** — putting a name on a public roster must ask that person first. The
suite now drives the picker the way a leader does: type, then tap the row whose `aria-label` says
who it is asking, so initials cannot fool it again and nothing behind the sheet can be picked by
accident.

Proven red by deleting the `dosLinkAsk` call and rebuilding:

```
FAIL  smoke-consent  adding Ananya Rao to the crew asked nobody — a roster is a public page
```

Stable green across three consecutive full runs.

---

## Fixed — thirteen defects

### Round one

1. **A stray `}` rendered as visible text on the Create Event form** — *live in production*. A
   `{cond&&<>` lost its condition, leaving a bare `<>` closed by `</>}`; JSX took the orphan as
   literal text. The shipped bundle contained `,"}",`. **esbuild only warns; Babel treats it as
   fatal** — which is why it shipped, and why no other lint rule could run until it was fixed.
2. **`dosDancers()` ran on half its sources.** `PROFILES`/`DANCERS` are `const`s inside the
   `S_discover` IIFE, invisible at module scope; both reads sat in `try{…}catch(dosWarn)`, so the
   `ReferenceError` was filed and the function returned short. Four Discover artists could not be
   added to any crew. 12 → **16** people; `__DOSWARNINGS` `["PROFILES is not defined","DANCERS is
   not defined"]` → `[]`. Fixed with your own cross-module `let` pattern.
3. Duplicate `cat` key. 4. Sparse-array `[,""]` → `["",""]`.
5. **33 dead `useState` pairs**, zero-reference by AST scope. `name`/`setName` in
   `ClassCreationForm` looks like a missing feature and is not one — classes are titled by
   `dosClassLabel({style,level})` in all three publish paths.
6. Three uncalled nav helpers.

### Round two

7. **261 unreachable lines in `ProfileTab`.** Two consecutive `if(historyOnly){…}` blocks with
   byte-identical opening lines; the first returns, so the second had never executed once. It was
   the **old My Dance page** — the single "AWARDS & ACHIEVEMENTS" row that the "TWO SHELVES"
   comment above explicitly describes replacing.
8. **Four dead award controls.** Two tiles ran `setAward(a)`, two ran `setAddAw({…})`; neither was
   read, and `myAwards` had four reads and no setter. All four carried `role="button"`, `tabIndex`
   and an `aria-label`. Two were inside the unreachable block. Built the missing detail sheet
   (showing the `v` verification code `AWARDS` already carried) and the add-achievement form.
9. **The publish confirmation contradicted itself.** The "Entry" row read raw `entryFee` — no
   setter anywhere, `""` for a new event — so it always said *"free to compete"* while the next row
   said "Solo ₹500 · Crew ₹1200", and the record saved 500. Both now derive from one `entryLow`.
10. Two self-referential `tab` loops; the `rosterPhone` stub.

### Round three

11. **The class form's Confirm & publish was unreachable from a keyboard.**
    `EVENTS-CLASSES-AUDIT` §5 records fixing exactly this on the *event* form; the class form has
    the identical shape and was missed — Cancel one line above carried `role`/`tabIndex`/
    `onKeyDown`, the button that publishes carried none. Also: a `<b onClick>`, gallery
    `<img onClick>` tiles with `alt=""`, and two 10-segment score bars where every segment was an
    unnamed button.
12. **The app could be bricked by its own saved state.** `dosRead()`'s `try/catch` covered
    unparseable text, but `"null"`, `"5"` and `"true"` all *parse* and none is an object.
    `JSON.parse("null")` returns `null`, and `dosRegister`'s `dosRead()[name]` throws — at module
    scope, before the first render. The app did not degrade; it did not start, and kept not
    starting on every reload until the key was cleared by hand. `JSON.stringify(null)` is `"null"`,
    so anything that ever wrote a null snapshot bricked it permanently. **22/22 poison cases pass.**
13. A `mode==="trainer"?"Taught by":"Taught by"` ternary that could never branch.

---

## Verification

| Check | As received | Now |
|---|---|---|
| **Playwright suites** | **could not run** | **22 / 24** |
| `@babel/parser` | fatal syntax error | parses clean |
| esbuild warnings | 2 | 0 |
| ESLint errors / warnings | 4 / 230 | **0** / 151 |
| Unreachable guard blocks | 1 (261 lines) | 0 |
| Suspicious logic sites | 1 | 0 |
| Keyboard-unreachable controls | 3 | 0 |
| `role="button"` with no name | 2 | 0 |
| Poisoned-storage boots | 1 total failure / 22 | **22 / 22** |
| jsdom route walk | 0 errors / 312 steps | 0 errors / 312 steps |
| Distinct screens rendered | 128 | 128 |

---

## Files

```
DanceOSApp.jsx  DanceOS.html      the fixed builds
build.sh                          builds both artefacts; fails loudly
setup-chromium.sh                 Chromium via npm, one command
run-suites.js  suites/            your runner, unmodified; smoke-consent restated
checks/                           nine jsdom checks (below)
```

`checks/` — each finds a class of bug the others structurally cannot:

| Script | Finds |
|---|---|
| `harness.js` | Crashes across 47 routes × 3 roles × 6 tabs; fingerprints renders (**128 distinct**) so it cannot pass vacuously |
| `test-poison.js` | Boot survival across 22 corrupt `danceos.v1` states |
| `unreachable.js` | Guard blocks shadowed by an identical earlier guard that returns |
| `states.js` | Every `useState` pair: both-dead, frozen, write-only |
| `a11y.js` / `keycheck.js` | Keyboard-unreachable controls; unnamed buttons |
| `logic.js` | Identical ternary arms, duplicate operands, self-comparisons |
| `test-awards.js` / `probe.js` | The two features repaired, proven red then green |
| `diag.js` | Browser-side diagnosis of a failing suite |

`unreachable.js` is validated against your original: it finds exactly that block and nothing in the
fixed file. **ESLint's `no-unreachable` cannot find this class** — it reasons within a statement
list, not across duplicate guards. Worth adding to CI.

---

## Still open

- **§A — the chat contradiction.** The decision, and then either revise §6.1/§13/§18 or restore chat.
- **`smoke-crew.spec.js` still does not exist.** Four claims now exist that would have caught four
  of these, each provable red by reverting one line: `__DOSDANCERS()` returns the Discover artists;
  booting on `danceos.v1="null"` still renders; tapping an award tile opens a sheet with its code;
  no two sibling guards share a test where the first returns.
- **Twenty-one frozen state values** — read, rendered, no setter. `entryFee` was one of these and
  turned out to be a real bug, so the rest deserve a look. Run `node checks/states.js`.
- **The "Taught by" word for artists** — the collapsed ternary means somebody intended a different
  label and never wrote it. Flagged at the site.
- **151 lint warnings** — components repeated across module IIFEs. Inherent to the concatenated
  build, not a bug; **zero** of the 151 names is declared only once in the file. Left alone.
- **Stale docs.** The D3 brief's items 1, 2, 4 and 7 are already done. `NEXT-SESSION.md` documents
  `__DOSCHATSTATE` as `{tab, open, sect}`; it is now `{sect}`.
- **The six Playwright audits** are not in the project files — only the twelve suites are. If they
  exist elsewhere, they will now run.

---

# Addendum — the studio Home hero (16 Aug 2026)

**Scope as agreed:** hero only. The studio's today-card, counters, live-now strip and tools grid
are untouched. **24 of 26 Playwright claims green** — the 2 red are the pre-existing enquiry-chat
contradiction in §A, unchanged.

## This was already the code's own intent

The identity kit in `01-shared` carries this comment:

> the answer lives here, and both screens ask for it. Same ring, same row, same rank.

The dancer/artist Home adopted it. **The studio Home never did** — it kept the header written
before the kit existed: a 48px circle, the name at 19px, and `A.sub` as a grey line. So a studio's
standing, its ID and the styles it teaches had nowhere to appear, and the screen a studio owner
opens most looked like a different application.

`dosProfile()` had been answering for a studio the whole time — `STUDIO`, `STU-00482`, rank 2 from
`DOS_RANK.studio`, and the **gold** ring in `DOS_RINGS.studio`. Nothing was invented; the studio
now asks the question the artist already asks. It reads gold where the artist reads silver, which
is the metal saying which kind of account this is.

## Two bugs the change surfaced

**1 · The address was hardcoded for every branch.** `dosProfile()` returned the literal
`"Kothrud, Pune"` regardless of which studio you were managing. A studio account holds several
branches and you switch between them, so the top bar would read *"Managing EEE Dance Studio —
Baner · Baner, Pune"* above a header saying **Kothrud** — and the Maps link opened the wrong
address. It went unnoticed because the old studio Home used `dosAccount().sub`, which *does*
resolve the active studio, and only the profile page asked `dosProfile()`. Both ask it now, so it
has to be true. Fixed in the kit, which fixes the profile page too.

**2 · The studio name did not fit.** My first attempt truncated it to *"EEE Dance Stu…"* — the kit
sets 24px because it was written for "Rhea Kapoor". A dashboard that cannot say what it is the
dashboard **for** is worse than the header it replaced. Type now steps down with length and past
~21 characters **wraps to two lines** rather than shrinking to ~15px, which beside an 86px picture
reads as a caption. `max-height`, not `-webkit-box` — the same one-layout-model rule the file
already states.

## The styles are derived, not typed

`dosMyStyles()` is the *person's* saved list. A studio has none, and should not: a studio's styles
are not a claim it types, they are **what it actually runs**. `dosStudioStyles()` reads them off
the classes on its timetable — the way §9 reads My Dance off the session history — ordered by how
much of the timetable each style is, capped at four so a nine-style studio cannot wrap the hero.

A studio with nothing on its timetable shows no rail rather than an empty one. The Baner branch
has no seeded classes, so it correctly shows none.

## `suites/smoke-studiohome.spec.js` — new, and proven red three ways

Registered in `run-suites.js`. Twelve claims. Three regressed independently, each turning it red on
both builds:

| Regression | Claim that caught it |
|---|---|
| Restore the old 48px-circle header | *the studio home shows no account ID — the kit supplies one* |
| `dosStudioStyles(A.name)` → `dosMyStyles()` | *the studio hero is showing the PERSON's saved styles, not the ones the studio teaches* |
| Hardcode the address again | *the header says "Baner, Pune" and the hero does not — it is naming a different branch* |

Claims 8–11 exist to pin the **scope**: they fail if the today-card, the counters, the live-now
strip or the tools grid ever disappear, so "hero only" is enforced rather than remembered.

## Nothing else moved

| Check | Result |
|---|---|
| Playwright | 24 / 26 (2 pre-existing, §A) |
| esbuild warnings | 0 |
| ESLint | 0 errors / 151 warnings |
| Unreachable blocks · logic sites | 0 · 0 |
| jsdom route walk | 0 errors / 312 steps |
| Poisoned-storage boots | 22 / 22 |
| Artist & dancer Home | unchanged — verified by screenshot and by suite |

Screenshots: `hero-studio.png`, `hero-studio-branch.png` (the wrapping case), `hero-artist.png`.
Light theme checked; the gold gradient holds on both.

---

# Addendum 2 — the studio workspace (16 Aug 2026)

Four changes. **26 of 28 Playwright claims green** — the 2 red remain the pre-existing
enquiry-chat contradiction in §A, untouched.

## 1 · The middle is the schedule now — and the old one was fiction

The middle held a "Today at the studio" card, a row of counters and a live-now strip. **Every
figure in all three was a literal.** `today` was
`[["Sessions today","6","+2"],["Checked in","64","91%"],…]` and the live strip named
`"Hip-Hop · Beginner … 17 of 20 checked in"` in hardcoded text. So the studio said **six sessions
on a day holding fifteen**, would have said six on a day holding none, and announced a class as
live at four in the morning.

It is the artist's deck now, asked the studio's question: every class and event running at this
studio today, one card each, in the order the day happens, live badge from the clock. Same
component (`PassDeck studio`), same card, same rail — not a second deck written beside it.

**Scoping it turned up a real bug.** Room was the obvious key and is wrong: room names are not
unique across studios, so `"Studio B"` matched **Fusion Dance Center's** Contemporary class and put
another studio's class on EEE's Home — the exact kind of claim about somebody else this app
refuses to make everywhere else. It cut the other way too: EEE's own Arangetram runs in the
Auditorium, which is not in its `rooms` list, so a room filter dropped a session that really is
theirs. Every row carries `e.studio`; that is the answer. Room survives only as the fallback for
rows recording no studio at all.

## 2 · Exit is larger, and it is now the only way out

It was **10px** — the smallest type anywhere in the app — grey on a 10% wash, with a target under
the 44px every other control here meets. It is a bordered button now: 12.5px label, the studio
name at 13.5px, a 34px minimum target, and an `aria-label` saying where it goes rather than "Exit".

## 3 · The tab bar belongs to the workspace

Four of the five tabs **did not navigate — they left.** Tapping Stats, Inbox or Profile called
`__DOSEXITTO`, which dropped the studio, switched you back to your personal account and landed you
on that tab as yourself. A studio owner could reach exactly one screen of their own workspace from
the bar; the other three were an exit dressed as navigation, with nothing warning you, and getting
back in meant Home ▸ Run your business ▸ Studios.

The bar navigates **inside** the studio now — Home · Stats · Inbox · Profile, all four staying —
and leaving goes through the labelled Exit control. `__DOSEXITTO` is removed rather than left as a
second, unlabelled way out.

## 4 · Discover is off the studio bar

It is the consumer marketplace; a studio has no use for it while managing. A tab is remembered
across a mode switch, though, and several entry points still set Discover (`__DOSENTER(false)`,
signing out and back in) — so without a guard, entering a studio from one of those left the
marketplace on screen under a bar with no tab lit and no way home but the logo. `tabKey` falls back
to Home, and the bar highlight follows the same fallback. **This is why the route walk reports 127
distinct screens rather than 128: studio+Discover is no longer a reachable state.**

## `smoke-studiohome.spec.js` — restated, now 28 claims, proven red five ways

Its old claims 8–11 pinned the counters and live-now strip as *scope protection*. That scope
changed deliberately, so they were **restated, not deleted** — they now pin the schedule band and
what must survive beside it. Five independent regressions, five distinct claims:

| Regression | Claim that caught it |
|---|---|
| Discover back on the studio bar | *Discover is still on the studio tab bar* |
| Tabs exit the studio again | *tapping Stats left the studio — role became trainer* |
| Room-name scoping | *another studio's session is on this studio's home: Fusion Dance Center* |
| Exit back to 10px | *the exit control is 10px — it is the only way out* |
| Fabricated count restored | *the heading says 6 today and 9 cards are drawn — the count is not the list* |

That last claim is the one worth keeping: it asserts the heading's number **equals the number of
cards actually rendered**, so the middle cannot quietly go back to fiction.

## Also removed

`money` and `today` — the two literal tables that fed the deleted blocks — were left orphaned by
the change and are gone with it. A literal that nothing renders is a fact waiting to be believed.

## Verification

| Check | Result |
|---|---|
| Playwright | **26 / 28** (2 pre-existing, §A) |
| esbuild warnings | 0 |
| ESLint | 0 errors / 152 warnings |
| Unreachable blocks · logic sites | 0 · 0 |
| jsdom route walk | 0 errors / 312 steps · 127 screens (see §4) |
| Poisoned-storage boots | 22 / 22 |
| Artist & dancer Home | unchanged — `PassDeck` without `studio` takes the original path |

---

# Addendum 3 — the Business layer (16 Aug 2026)

Your three answers taken as given: **Discover identity = the location**, **crew auditions do not
exist and crews are never a business's**, **fresh seed data rather than a migration**.
**28 of 30 Playwright claims green** — the 2 red remain the enquiry-chat contradiction in §A.

## The layer, and why it was already needed

```
BUSINESS   the registered entity — GSTIN, verification, ID, and the events it puts on
STUDIO     a place — address, rooms, classes, team, its own public page
```

This was not a new idea so much as a name for something already leaking. `dosProfile()` returned
`STU-00482` at **account** level and an address at **studio** level, and nothing said which was
which — I patched the symptom two rounds ago when a branch studio showed the wrong address. Each
fact now has exactly one owner.

**Verification follows from that:** a business is verified, not a studio. The ✓ a studio wears on
Discover is inherited from the business that runs it, because the document behind it is a business
document. `dosBizVerified()` requires a GSTIN on file — but a business with no GSTIN still exists,
still runs classes and still sells tickets. It just has no ✓ to pass down. That keeps GST as the
proof without making it the gate, for the reason in Addendum 2: registration is only mandatory
above the turnover threshold.

## What changed

**`BIZ_STORE.business`** — the entity, seeded fresh. Studios carry `biz:"b1"`; `dosBizStudios()`
is the studios-managed list; `dosBiz()` / `dosBizVerified()` are the single place anything asks
what the business is, so no surface can carry its own copy of the name or its own opinion about
verification.

**The Business profile page** (formerly Studios) now names the entity above the list: business
name, legal name, since, and a `✓ GST VERIFIED` pill with the GSTIN — or `NOT YET VERIFIED` and a
line saying what would earn it. Under it, `STUDIOS MANAGED`. The drill-in title says "Business
profile" too, not "Studios".

**Events moved up a level.** `owner` was a studio id and the desk asked *"is this the ACTIVE
studio's event?"* — so a business running two branches saw its own events appear and disappear
depending on which one it was standing in. An event takes a venue, a schedule and somebody
accountable for the money: the studio is the venue, the business is the party. The venue is
already on the record, so nothing is lost by owning it one level up. Verified from both branches:
identical list, three events, three "Yours" markers.

**"Studios" is now a tile inside the workspace.** From inside one studio there was no way to reach
the others — you had to leave the workspace entirely and come back in.

**Crews stay out.** Already true on the workspace side and now pinned by a claim. Note for the
spec: **§10 lists Crews as a business module, which is now wrong** — it belongs to the artist and
dancer profiles only.

**`taughtStudios` removed; `memberCrews` kept.** They looked symmetrical and are not. My Dance
already derives studios-you-have-taught-at from session history (`keyOf` reads `x.e.studio.name`),
so that list was a typed number — `"Faculty · 42 sessions taught"` — beside a derived one.
Removing it relocates the fact. Nothing derives crew membership, so removing that would delete it.

## Suite — now 30 claims, two more proven red

| Regression | Claim that caught it |
|---|---|
| Event ownership back to the active studio | *the events desk changes with the branch you stand in* |
| Crews back in the business workspace | *Crews is in the business workspace — a crew is never a business's* |

Plus the claim that the taught-at list cannot come back to the page that lists what you run.

## Verification

| Check | Result |
|---|---|
| Playwright | **28 / 30** (2 pre-existing, §A) |
| esbuild warnings · ESLint | 0 · 0 errors / 152 warnings |
| Unreachable blocks · logic sites | 0 · 0 |
| jsdom route walk | 0 errors / 312 steps · 128 screens |
| Poisoned-storage boots | 22 / 22 |

## Still open — spec, not code

1. **§10 lists Crews as a business module.** No longer true.
2. **§6.1 "one studio is one location; a branch is its own studio page"** still holds, but the
   parent business is now the verified party — §11 needs to say verification is a business fact.
3. **§7 crew auditions.** You have said auditions do not exist; §7 and open gap #1 still describe
   them as an event category. They should be struck, not left as a gap.
4. **One business per account** is assumed. A person who is a partner in two businesses has no
   representation — worth deciding before it is discovered.
5. **Discover** already lists studios as the followable entity, matching your answer. What it does
   not yet do is inherit the ✓ from the business — right now `PROFILES.verified` is set per studio
   record. That is the next honest piece of this change.

---

# Addendum 4 — the business layer is REVERTED (16 Aug 2026)

On instruction, everything in Addendum 3 is backed out. **Addendum 3 above describes code that no
longer exists** — it is left in place as a record of what was tried, not as a description of the
build.

Restored from `/tmp/pre-biz.jsx`, the snapshot taken immediately before the first business-angle
change. Gone with it:

- `BIZ_STORE.business`, `dosBiz()`, `dosBizVerified()`, `dosBizStudios()`, and the `biz:` field on
  studio records
- The "Business profile" page — it is **Studios** again, with **STUDIOS YOU OWN** and
  **STUDIOS YOU HAVE TAUGHT AT** both back as they were
- Business-level event ownership — `owner` is a studio id again (`s1`), resolved against the
  active studio
- The Studios tile inside the studio workspace grid; the artist grid tile reads **Studios** again,
  not Business
- The `BIZ-00482` id and the single-sourced GSTIN — `dosProfile()` says `STU-00482` and the
  verification desk carries its own GST string, as before

**What stays** (earlier turns, untouched by the revert): the studio home identity-kit hero, the
derived Today's-schedule deck, the enlarged Exit control, the four-tab in-workspace nav with
Discover removed, and the branch-aware `loc` fix in `dosProfile()`.

The suite's business claims went with the code they pinned; the account-ID claim reads `STU-` again.

| Check | Result |
|---|---|
| Playwright | **28 / 30** (2 pre-existing, §A) |
| esbuild warnings · ESLint | 0 · 0 errors / 152 warnings |
| Unreachable · logic sites | 0 · 0 |
| jsdom route walk | 0 errors / 312 steps · 127 screens |
| Poisoned-storage boots | 22 / 22 |

The discarded state is preserved at `/tmp/with-business.jsx` if the decision changes — nothing has
to be rebuilt from memory.

---

# Addendum 5 — full review pass (16 Aug 2026, post-revert)

**32 Playwright claims, 30 green** — the 2 red remain §A's enquiry-chat contradiction, untouched
and waiting on the product decision. ESLint 0 errors and **128 warnings, down from 152**.

## Bugs found and fixed

**Onboarding fabricated a style.** A hidden `learn` list, seeded `["Kathak"]`, had no picker —
the styles step renders one grid, for `mine` — but it was merged into the saved profile. Every
account that completed onboarding claimed Kathak whether they had danced it or not. A fact the
user never stated is not a default; removed, and the profile now says only what was picked.

**Two finished settings screens had never been displayed once.** `SEGS` named four sections and
`body` held all four, but nothing rendered the tab row, so `setSeg` had no caller: "Staff &
permissions" and "Pro" were reachable by no path at all — the ProfileTab disease in different
clothes. The row is drawn now; all four sections verified opening in Chromium.

**A studio could not publish a Belly Dance class.** The class form kept a third private copy of
the style list — sixteen rows, frozen at whenever it was pasted — while the registry holds ~30.
Discover could FILTER by Belly Dance, Flamenco and Capoeira; nobody could PUBLISH in them. This
is the §4.2 audit gap. The form now derives from `DOS_STYLE_REG`; `dosStyleCode` was hoisted out
of the S_discover IIFE to make that possible — the same scope boundary that once halved
`dosDancers()`. All three styles verified searchable and pickable in the live form.

**The taught/student history filter existed and could not be asked.** `hSlice` has filtered the
artist history since it was written — the read sits in the same chain as styles and faculty —
but the sheet never grew its two pills. Added ("Sessions you taught" / "Sessions you took");
verified taught-only removes BOOKED rows in the browser.

**PassDeck kept the state machine of controls that no longer exist.** The Classes/Events switch
and the side row were removed long ago; `type`, `evSide`, `touched`, `curSide`, `pool`,
`sideStats`, `inType`, `cut`, `evPools`, `scopeLine` and the `__DOSHOMESTATE` persistence all
stayed. The live danger: a stale saved `type:"event"` would filter the deck forever, with no
control anywhere to undo it — a trap door, not a preference. All of it removed; the deck's
rendered output verified **byte-identical** before and after, for dancer and artist both.

**Also removed:** a crop-zoom state written twice and read never (DosCropper zooms internally); a
picker toggle nothing called; a requests-desk filter over a store with only one kind; four
states with neither reads nor writes.

**One removal reverted by evidence.** `profileMobile` looked dead and is half-alive: the edit
sheet SAVES a mobile the user types, and no line of the page ever displays it. Deleting it broke
the save (ESLint 0→1 caught it); restored with a comment naming the real question — grow a
contact row, or drop the field.

## `smoke-crew.spec.js` — the last big untested surface, now covered

Six claims, each written against a class of bug this review series actually hit: the halved
data source, the picker fooled by what was on screen, adding-without-asking, a typed count
beside a derived list, and the storage brick. **All six proven red individually**, including the
two owed from the previous turn:

| Regression | Claim that caught it |
|---|---|
| One dancers source made scope-invisible again | *dosDancers() returns 12 people — a source has gone missing again* |
| `dosLinkAsk` removed from crew add | *asking Ananya Rao raised no pending member link* |
| Header count becomes a literal `5+2` | *the desk header says 7 members and the roster lists 5 confirmed — the count is not the list* |
| Null-guard taken off `dosRead` | *a saved "null" snapshot broke the boot — the crew desk never rendered* |

The suite also caught **its own author** on first run: the header deliberately counts CONFIRMED
members, and the first draft counted pending rows and the crew's own profile door too. The claim
was restated to count what the header counts — recorded in the suite as a comment.

## The frozen-state ledger is now closed

`checks/states.js` reports 22 sites and every one is accounted for: nine documented redraw
ticks, the flagged `profileMobile`, and the twelve below that are one product decision, not
twelve bugs.

## Waiting on decisions — nothing else is fixable without them

1. **§A, the only red:** restore internal chat, or revise spec §6.1 / §13 / §18.
2. **The class form's optional extras** (`song`, `choreo`, `notes`, `vidVis`, `linkReveal`,
   `addSong`, `addChoreo`, `addNotes`) and **the event form's `poster` / `qual` / `entryFee`**:
   eleven states saved into every record with no controls. Build the controls, or delete the
   state and stop saving defaults.
3. **The editable, invisible mobile** — contact row on the profile, or remove the field.
4. **The "Taught by" word for artist mode** — the collapsed ternary means a different label was
   intended and never written.
5. **Features, not fixes:** battle-record rows opening the event scoring page; practice as
   timeline events; studio contact links; Outlook sign-in.

| Check | Result |
|---|---|
| Playwright | **30 / 32** (2 pre-existing, §A) |
| esbuild warnings · ESLint | 0 · 0 errors / **128** warnings |
| Unreachable · logic · keyboard | 0 · 0 · 0 |
| jsdom route walk | 0 errors / 312 steps · 127 screens |
| Poisoned-storage boots | 22 / 22 |
| PassDeck render before vs after sweep | byte-identical |

---

# Addendum 6 — ALL GREEN (16 Aug 2026)

Three decisions received, three workstreams landed. **Every Playwright suite is green on both
builds — the first fully green board in this project's recorded history.**

## 1 · The enquiry-chat contradiction is retired, not hidden

Decision: chat stays removed; spec §6.1, §13 and §18 are stale.

The working suite already contained a retirement when I opened it — an edit I did not make,
possibly yours between turns. Rather than trust or revert it, I audited it: the old claim 3
inverts (a Chat/Message control REAPPEARING on the enquiry page is now the defect — a door to a
feature that does not exist behind it), and the ~40 assertions behind the old red claim, which
had NEVER EXECUTED because the runner stops at first failure, are rewritten against the desk as
it is, keeping the invariants (badge==list, multi-person history). The inverted claim was proven
red by planting a fake Chat button. First proof attempt was invalid — the injection broke the
build and the direct runner has no staleness guard, so it tested the old HTML; recorded because
that is exactly the failure mode `run-suites.js` warns about.

## 2 · The eleven phantom form fields are deleted — with two exceptions the code demanded

Decision: delete, don't build.

Class form: `song`, `choreo`, `notes`, `vidVis`, `linkReveal`, `addSong`, `addChoreo`,
`addNotes` — eight answers to questions no control ever asked, no longer saved into any draft.
Old drafts carrying them still restore; the keys are simply never read.

Event form, where uniform deletion would have been wrong: `qual` is deleted outright (every
reader already falls back to 8); `poster` becomes a legacy PASS-THROUGH, because nothing can set
one but an edit must not drop one an older record carries; and `entryFee` is not deleted at all —
it has a real read (the fee fallback for edited legacy events) and becomes a plain `const`,
losing only the setter that never had a caller.

State ledger: 22 → **11**, all accounted for (9 documented redraw ticks, `profileMobile`, and
`entryFee`-as-const no longer counts).

## 3 · Battle-record rows open the event scoring page

The render logic was already present in the working file (same unexplained-author pattern,
audited the same way): a battle carrying `evId` is a labelled door; one without is a plain
record, because a destination that does not exist is the navigate-nowhere defect. What was
missing: **no seeded battle carried an `evId`**, so the feature was invisible and untestable.
Under the fresh-seed licence, one battle now links to `e1` (Delhi Breaking League — Top 16, a
battle with three judges). Verified in Chromium: the door lands on the event's manage page;
"City League Qualifier" has no role, no pointer.

`smoke-crew` claim 7 pins BOTH halves, each proven red independently:

| Regression | Caught by |
|---|---|
| `evId` ignored — the door comes off | *no battle row opens its event* |
| Every row becomes a door, eventless ones included | *a battle with no event pretends to be a door* |
| Fake Chat control on the enquiry page | *the enquiry page offers a Chat/Message control — a door to nowhere* |

## Verification

| Check | Result |
|---|---|
| Playwright | **ALL GREEN** — 13 suites × 2 builds |
| esbuild · ESLint | 0 errors · 0 errors / **117** warnings (was 128) |
| Unreachable · logic | 0 · 0 |
| jsdom route walk | 0 errors / 312 steps · 127 screens |
| Poisoned-storage boots · awards | 22/22 · green |

## Still open (features, all needing decisions or a word)

- Practice as timeline events (declined this round — say when).
- Profile contact row (the invisible-but-editable mobile; declined this round).
- The "Taught by" artist-mode word — still needs the word you intended.
- Outlook sign-in; studio WhatsApp/Instagram/YouTube links.
- Spec revisions §6.1/§13/§18 are now formally stale per the 16 Aug decision — the spec document
  itself still says otherwise and should be edited when convenient.

---

# Addendum 7 — closing the autonomous queue (16 Aug 2026)

Board stays **ALL GREEN**; boundary walk clean; ESLint 0/117.

**`smoke-boundary.js` had never run.** Staged with the suites but never registered (its name
doesn't match `*.spec.js` and it is a standalone walker, not a suite module), and it pointed at
a dev path from the original machine. It exists because the production error boundary turns a
render crash into a polite "hit a snag" card — exactly what fingerprints and screenshots don't
notice. Ported, and extended to walk the studio workspace: its four tabs, the tool routes, and
all four settings sections (two of which were unreachable until this review). **NO RENDER
ERRORS on any screen.** Recommended for CI beside run-suites; it exits 1 on any error.

**The 13 a11y flags are re-verified, not inherited.** Every flagged call site (`CardBtn`,
`ScanBtn`, `DPickRow`, `DToggleRow`, `EventCard`) is a component that carries `role="button"`,
`tabIndex` and `onKeyDown` inside its own definition — the lexical detector cannot see through
a component boundary. Zero real keyboard gaps.

**The "Taught by" branch is finished, not just collapsed.** The dimension groups sessions by
the artist on them. A dancer still reads *Taught by* — those sessions taught them. An artist
now reads *Artist*, because half of an artist's sessions are ones they taught, and "Taught by"
over your own teaching claims a relationship that ran the other way. Verified live in both
modes: `dancer → Dance style | Taught by | Studio`, `trainer → Dance style | Artist | Studio`.
One word, reversible on request — recorded in SPEC-ERRATA.md.

**Two documents added to outputs:** `SPEC-ERRATA.md` (each stale spec section, what is true,
and who decided) and `D4-START-HERE.md` (supersedes the stale NEXT-SESSION/D3 briefs, corrects
`__DOSCHATSTATE`, records the Chromium route, the restore-clobber incident, and the
unexplained-edit audit protocol).

Remaining work is all features awaiting a go: practice-as-timeline, the profile contact row,
Outlook, and folding the errata into the spec proper.

**Post-script to Addendum 7 — the midnight bomb.** The final verification run for this addendum
came back 2 RED, and it would have been easy to blame the code just changed. The app was
correct: `smoke-studiohome`'s hero-slice anchored on the literal `'GOOD EVENING'`, and the
container clock had crossed into morning between runs — a suite that is green for two-thirds of
every day. Both anchors now match `GOOD (MORNING|AFTERNOON|EVENING)`. Recorded because it is the
sharpest possible argument for the house rule: a red suite is a claim about the WORLD, and the
world includes the clock. Board re-verified ALL GREEN; boundary walk clean.

---

# Addendum 8 — the queue closes (16 Aug 2026)

## The contact row is removed — and the removal turned out cleaner than the decision assumed

The mobile chain was described as "the sheet saves it, nothing shows it." Closer inspection:
the edit sheet opens its draft with `{name, location, age, bio}` — **`mobile` was never in the
draft**, so the guarded save had never fired once and the "saved" number was the seed string
forever. Not a field displayed nowhere; a field wired nowhere, end to end. Deleted, and the
sheet's real fields verified saving in Chromium. `socialLinks` (the person's YouTube/Instagram
section) is fully alive — editor, rows, the lot — and untouched.

## The audition remnants went with their decision

The audition event category was removed long ago — its tombstone comments are all through the
event form — but two doors outlived it: Discover's **🎯 Auditions chip**, which could only ever
filter the marketplace down to an empty list, and the **"Audition / crew — Join the team"
enquiry kind**, which was the crew-audition apply flow wearing enquiry clothes. Both contradict
the recorded decision that crew auditions do not exist (a roster grows by the leader asking,
with consent — never by application). Both removed; verified in the browser that the chip row
and the enquiry kinds render without them; the enquiry stats breakdown re-seeded without the
dead kind. Board stays ALL GREEN.

## `ci.sh` — the whole board, one command, exit codes proven honest

build → 13 suites × 2 builds → boundary walk, `set -euo pipefail`, no pipes around steps (the
runner's own history explains why). Proven three ways: **exit 1** when a suite fails (the
planted consent regression was caught by two suites independently), **exit 1** when the build
breaks, **exit 0** restored.

## The specification is re-issued

`DanceOS-Product-Specification-v1.1.md` folds in every decision with a change log at the top:
chat removed (§6.1/§13/§14/§18), auditions gone (§6.3/§7), the registry at its true **66
styles** with Belly Dance resolved (§4 — v1.0 said 38), the deleted form fields, the declined
features, the studio-workspace redesign (§10/§13), the "Artist" word (§9), and engineering
notes that describe the verification that actually exists (§15). **§17 Open Gaps now reads:
none.** §18 keeps the three genuine product questions.

| Check | Result |
|---|---|
| ci.sh | **CI GREEN** — and proven red-capable both ways |
| Playwright | ALL GREEN, 13 suites × 2 builds |
| Boundary walk | no render errors on any screen |
| ESLint · states | 0 errors / 117 warnings · ledger 10, all ticks |
| Poisoned boots | 22 / 22 |

**Post-script to Addendum 8 — auditions, fully out.** Four live remnants survived the door
removals, found by classifying every remaining `audition` reference as live code or tombstone
comment. Two were student-record seed notes describing crew membership arriving BY AUDITION
("Auditioning for the crew in September", "Wants to join the crew audition") — the exact flow
the product refuses to have; both now speak the consent model ("flagged to the leader to ask
her" / "leader to decide whether to ask"). One was the judge invite offering "battles ·
tournaments · auditions" — a category that cannot exist; now "battles · tournaments". One was
enquiry flavor text ("prepping for an audition in October"), reworded to a competition so the
vocabulary is gone entirely. **Zero live audition references remain**; the tombstone comments
documenting each removal stay, because they are the record of why. CI GREEN re-verified.

**Post-script 2 to Addendum 8 — §18 lands.** Trials: free by default — and the build already
agreed by construction (a trial IS a free class; the booking flow keys off the price string; no
paid-trial path exists). The one contradicting seed — a ₹300 refund against a "trial", a refund
against nothing — is corrected to the drop-in it actually was. Multi-studio artists: yes — also
already true by construction; the derived My Dance record shows the seeded artist across two
studios (Studios: 2), and nothing anywhere enforces one. Payout splits are deferred together
with the payment-gateway question, which is now the only open item in the entire project.
CI GREEN re-verified after the seed fix.

---

# Addendum 9 — the booking-page overhaul lands (16 Aug 2026)

All six instructions verified end-to-end; **CI GREEN** (13 suites × 2 builds, boundary walk
clean). Screenshot: `booking-page.png`.

**The card says WHAT; the page says WHERE, once.** The studio line is off the shared
BookingCard and the class hero; the hero's room/city row went with it (the "Change artist"
control was kept). One **AT THE STUDIO** block now owns "where": the studio's photo and name as
a door to its page, room · city as the subline, a bordered **Maps** pill, amenity chips
beneath. The suite asserts the studio's name appears exactly once on the page — and
distinguishes the EVENT card's organiser line, which is decision data and stays.

**The green section is gone.** The booked panel wears the page's clothes: neutral card, a
green DOT instead of a wash, the code right-aligned in mono, and **Invoice + Cancel booking
merged** into one segmented pill (hairline divider, Cancel in red). The component is shared, so
the event page inherited the fix. Pinned structurally: the suite checks the two actions are
siblings inside one control, not just that both exist.

**The clock runs the session.** Both owner surfaces — the class-page strip and the register —
derive `started`/`ended` from `dosSpanOf`, the same arithmetic the Live badge always used.
Check-in and the scanner open at start time and close at end; the strip only SAYS which of the
three moments you are in ("Opens by itself at 19:00 — nothing to press"). Only tombstones
mention the button.

**Verification-pending is visible everywhere the owner looks.** The investigation found the
system MOSTLY built: the form asks on PICK (artist, assistant, studio-room), and the Requests
desk's Sent side already had "⏳ Waiting on {who} — this class stays a draft until they
confirm" with Withdraw/Remind. Two real gaps closed: (1) a save-time duplicate ask I had added
was removed, and the save now RE-KEYS the pick-time asks from the "new-class" placeholder onto
the draft's real id — minted once, shared by the record and every ask about it; (2) the draft
row itself now says "⏳ Verification pending — {names} to confirm".

**And the bug the chip exposed:** the DRAFTS group on the classes History page rendered INSIDE
the collapsible FILTERS panel — a fragment-nesting slip, so drafts only existed on screen while
the filter drawer was open, despite the page's subtitle promising "Published · completed ·
drafts — every filter, one page". Moved out to stand with PUBLISHED and COMPLETED.

**Suite:** the lost-turn's overhaul block was audited (it survived, and its claims are sharper
than my duplicate append, which was removed — recorded in the suite). New claims proven red:

| Regression | Caught by |
|---|---|
| Studio name back on the hero | *appears 2 times on the booking page — it lives in ONE block* |
| Merged pill split into two buttons | *Invoice and Cancel booking are not two segments of one control* |
| Start-session control back on the register | *the register page offers a Start session control* |
| Save stops re-keying picks to the draft | *saving the draft raised 0 artist asks for Vikram* |

Two process notes, recorded because they will recur: a multi-edit script whose LAST assertion
fails silently discards the edits that already printed "ok" (write-per-edit from now on), and
the runner's staleness guard caught me about to test a regressed build after a restore-without-
rebuild — the direct single-suite runner has no such guard, so every red-proof now rebuilds.

---

# Addendum 10 — the dead-code sweep (16 Aug 2026)

Asked: what is left to fix, and can the code be cleaned without touching behaviour. Answers:
**nothing is left but the deferred payment gateway**, and the clean is done — measured, not
promised. ESLint **118 → 78 warnings, 0 errors**; the frozen-state ledger reads **0**;
~120 lines gone; and behaviour verified four ways after the cut: the jsdom walk (312 steps,
0 errors, same 128 screens), 22/22 poisoned boots, the boundary walk, and **CI GREEN**.

## Method — because the method is the safety

Every unused identifier ESLint reported was counted across the whole file. More than one
occurrence = the documented cross-module IIFE duplication: left alone. Exactly one = a true
single, and every single's BODY was read before cutting — which is what kept `scanNow`'s
in-body mutations from mattering (defining a function is pure; it had no caller) and what
caught that `ownName` was a destructured prop, removable without changing any caller.

Removed, each verified zero-callers first: `CardBtn` (orphaned by the merged pill), `liveOne`,
`scanNow`, `RingAv` (definition AND, cascade, its alias and `TYPE_RING`), `CONVO` (chat-era
seed), `DANCE_LOG` (the superseded hand-typed record its own tombstone describes), **both**
copies of `CERTS` (the "used" one wasn't), `SC`, `WD`, `JPOOL`, `rowsFor`, `cand`, `pIn`,
`packLeft`, `provOpts`, `ticketWord`, `isArtist`, the `DRmX`/`DAddTile` alias pair, the unused
gate wrappers (`G_crews`, `G_eventsmod`, `G_crewmanage` — `dosGate` is pure, so unwiring
nothing), six dead colours across three palette chains, and the `ownName` prop. Ten redraw
ticks became comma-holes (`const [,setBump]=`) — identical behaviour, honest shape, ten
warnings gone.

## The two incidents, recorded because they are the lesson

**A lazy regex ate 4,968 lines.** `DANCE_LOG={[\s\S]*?\n};` matched to the first column-0
closer — five thousand lines away, because the object closes INLINE at the end of a long seed
row. The span-cap the very next attempt carried (`assert lines<=20`) is now the rule for every
regex cut; the block itself was ultimately removed by line-indexed surgery with an
end-of-line assertion. Caught within one command by the snapshot taken one command earlier.

**One "tick" was load-bearing.** Eleven `[bump,setBump]` pairs matched the tick pattern;
states.js said ten. The eleventh's VALUE feeds a `useMemo` dependency array — a read the
detector doesn't count — and blanking it crashed `classesmod` in both roles. ESLint caught the
source error; the harness caught it AGAIN in the built bundle, because `/tmp/app.js` is not
produced by build.sh and had gone stale — the third stale-artifact catch today, now noted in
the D4 brief.

## Residue, stated exactly

78 warnings remain: cross-module duplicates inherent to the concatenated build (verified — no
name among them occurs once), plus a handful of parser phantoms from one JSX comment. The
remaining `CONVO`/`DANCE_LOG` mentions are tombstones. File: 19,402 lines (from 19,488).
