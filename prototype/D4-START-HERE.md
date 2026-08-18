# D4 — START HERE (written 16 Aug 2026, supersedes claude_NEXT-SESSION.md and claude_D3-START-HERE.md)

The project docs in knowledge are stale in ways that will mislead you. This file is current.

## State of the board

**ALL GREEN.** 13 Playwright suites × 2 builds, zero jsdom errors across 312 route steps /
127 screens, 22/22 poisoned boots, ESLint 0 errors / 117 warnings (all cross-module IIFE
duplicates — verified none is declared only once; leave them). The 2 long-red enquiry claims
were retired by product decision (see SPEC-ERRATA.md), not weakened.

## Corrections to the old docs

- `__DOSCHATSTATE` is `{sect}` — not `{tab, open, sect}`. Threads, `open`, `readIds`, `msg`
  all died with internal chat.
- The suites RUN now. `setup-chromium.sh` gets Chromium 149 from the `@sparticuz/chromium`
  npm tarball (cdn.playwright.dev is blocked; apt chromium is a snap shim). The wrapper at
  `/opt/pw-browsers/chromium` adds `--no-sandbox --use-gl=swiftshader`; the runner is unmodified.
- `__DOSHOMESTATE` no longer exists. The deck's side/type filters and their persistence were
  removed; `side` is the tile order, asked fresh.
- D3 brief: items 1, 2, 4, 7 were already done; battle→scoring is done (16 Aug); practice-as-
  timeline is the one still open.
- The business layer described in REVIEW-D3 Addendum 3 was BUILT AND REVERTED on instruction.
  The discarded state was at /tmp/with-business.jsx (tmp does not survive sessions).

## Rules that keep working here

0. **Three artifacts, three staleness traps.** `build.sh` writes DanceOS.html and dev.html but
   NOT `/tmp/app.js` (the harness bundle) — rebuild it explicitly before running harness.js.
   The suite runner refuses stale builds; direct single-suite runs and the harness do not.
   And a multi-edit python script must WRITE PER EDIT — a failed assert at the end silently
   discards every edit that already printed "ok". All three bit on 16 Aug; all three are now
   in this file so they only bite once.


1. **No test claim is trusted until proven red.** Every claim in every suite added since D2 has
   an individually-proven regression; keep that bar.
2. **Back up before large edits** (`cp DanceOSApp.jsx /tmp/pre-<thing>.jsx`) and **verify the
   file after any restore** — a restore command clobbered the working copy mid-session once
   (caught only because ESLint went 0→3), and the suites folder lost edits the same way.
3. **Never pipe build.sh into anything** (`| tail` eats `set -e`). The runner refuses stale
   builds; direct single-suite runs DO NOT — rebuild first or you are testing the past.
4. **Look at the screen.** deckdump/diff proved a 10-identifier deletion render-identical;
   screenshots caught the truncated studio name and the wrong branch address.
5. **IIFE scope is the house monster.** `dosDancers` (PROFILES), the class form's style list
   (`dosStyleCode`), and GSTIN duplication were all the same bug: a helper invisible one module
   over grows a private copy. Fix by hoisting to module 00 with a note, alias locally.

## Checks (all in checks/, run from the repo root)

`harness.js` route walk (fingerprinted) · `test-poison.js` 22 corrupt-storage boots ·
`unreachable.js` duplicate-guard shadows · `states.js` frozen/dead useState ledger (11 remain,
all accounted: 9 documented ticks, `profileMobile`, nothing else) · `a11y.js`/`keycheck.js`
(13 flags are false positives — every flagged component carries role/tabIndex/onKeyDown inside
its definition; re-verified 16 Aug) · `suites/smoke-boundary.js` — standalone real-Chromium
walk that fails on boundary-swallowed render errors; now covers the studio workspace and all
four settings tabs. Not in run-suites; run it separately.

## Open work

**None.** The 16 Aug decisions closed the queue: contact row removed (the mobile chain proved
never-wired end to end — the sheet's draft never contained `mobile`, so the guarded save had
never fired), spec re-issued as `DanceOS-Product-Specification-v1.1.md`, and `ci.sh` runs the
whole board (build → 13 suites × 2 builds → boundary walk) with exit codes proven honest three
ways: red on a suite failure, red on a broken build, green restored. The audition remnants —
Discover's chip that could only filter to nothing, and the "Audition / crew" enquiry kind —
went with the crew-auditions decision. §18's three product questions (trials, multi-studio
artists/payout splits, payment gateway) remain the only open product thinking, and they are
questions, not gaps.

## Unexplained-edit protocol

Twice this project, working files contained edits with no author in the transcript (the
enquiry-suite retirement; the battle-row render logic). Both were audited — run, then proven
red — rather than trusted or reverted. If you find another: same treatment, and say so in the
report.
