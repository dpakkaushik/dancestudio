/** TWO SHAPES THIS REPO HAS SHIPPED MORE THAN ONCE, LOOKED FOR MECHANICALLY
 *  (30 Sep 2026).
 *
 *  Neither is a type error, neither fails a build, and neither shows on a screen
 *  — which is why both kept coming back. They are grep-shaped, so they are
 *  grepped.
 *
 *  ── 1 · "RLS IS A CEILING, NOT A SCOPE" ──────────────────────────────────────
 *  Found SEVEN times in this project, most recently in `findMyEnrolledSessionIds`
 *  on 30 Sep 2026: a read of a table whose policies admit more than the caller's
 *  own rows, with nothing in the query saying WHOSE rows it wants. A studio's
 *  member reads their studio's whole roster, so `select … from class_bookings
 *  where status in (…)` returns every learner's booking and the screen believes
 *  they are yours. The rule the repo has settled on is that such a read says its
 *  scope OUT LOUD — `user_id`, `business_id`, `class_id`, `session_id`, whatever
 *  it means — rather than leaning on the policy to mean it.
 *
 *  ⚠ The check is "does it scope at ALL", not "does it scope by user": a studio
 *  reading its own roster by `business_id` is correct and must not be flagged. A
 *  check that cries wolf is worse than no check, because the next person
 *  switches it off.
 *
 *  ── 2 · A WRITE WHOSE REFUSAL IS SILENT ─────────────────────────────────────
 *  Found in `softDeleteClass` on 30 Sep 2026, and it is the nastier of the two:
 *  soft delete is this app's rule, and a soft-deleted row satisfies no SELECT
 *  policy — so an UPDATE that RLS refuses comes back with **zero rows and no
 *  error**, indistinguishable from success. A trainer pressing Delete was told
 *  the class was deleted and it was not. `.select()` on the chain is what turns
 *  that into something the caller can count.
 *
 *  Both checks are opt-outable with a comment on the line above:
 *      /* audit-ok: <the reason> *​/
 *  — because there ARE honest exceptions, and the useful artefact is the
 *  REASON beside each one rather than a number nobody reads.
 *
 *  Run: npm run audit:reads   (exit 1 when anything is unexplained; in CI after
 *  typecheck and before the build)
 *
 *  ⚠ TO PROVE IT STILL BITES — because a check that can pass for the wrong
 *  reason is not a check, and this one's scope list is generous enough to go
 *  vacuous if somebody widens it carelessly — drop a file in `repositories/`
 *  holding both shapes and confirm it reports two, then delete it:
 *
 *      export async function bad(supabase: any) {
 *        const { data } = await supabase.from("class_bookings")
 *          .select("id").in("status", ["enrolled"]);
 *        await supabase.from("rooms").update({ name: "x" }).eq("id", "y");
 *        return data;
 *      }
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const DIRS = ["repositories", "features", "app", "services", "lib"];

/** ⚠ A FILE WHOSE EVERY READ IS A PLATFORM ADMIN'S, and is therefore UNSCOPED
 *  BY DESIGN: the queue an admin opens IS the whole queue, and the desk refuses
 *  a non-admin before it asks (`requireAdmin()` on every route). Exempting the
 *  file is one exemption with one true reason; the alternative was four
 *  identical `audit-ok` comments, which is the noise that gets a check
 *  switched off. */
const ADMIN_ONLY_FILES = new Set(["repositories/admin.ts"]);

/** Tables whose RLS deliberately admits MORE than the caller's own rows — a
 *  business's members, a class's studio, a platform admin. A read of one of
 *  these that scopes nothing is reading somebody else's rows. */
const CEILING_TABLES = new Set([
  "class_bookings",
  "class_people",
  "attendance",
  "orders",
  "payments",
  "refunds",
  "payouts",
  "payout_lines",
  "leads",
  "enquiries",
  "enquiry_quotes",
  "membership_passes",
  "membership_uses",
  "business_members",
  "business_invites",
  "crew_members",
  "crew_practice_people",
  "crew_practice_attendance",
  "follows",
  "notifications",
  "subscriptions",
  "studio_verification_requests",
]);

/** Saying whose rows you want. Any ONE of these in the chain is enough — the
 *  point is that the query STATES a scope, not which scope it states: a studio
 *  reading its own roster by `business_id` is exactly right and must not be
 *  flagged.
 *
 *  ⚠ AN EMBED PREFIX COUNTS, and leaving it out is what made the check's first
 *  run cry wolf twelve times. `payments` carries no `class_id`, so the money on
 *  a class is scoped `.eq("orders.class_id", …)` through an `!inner` join — a
 *  scope stated through the spine it has to be stated through. Twelve of the
 *  sixteen "findings" on the first run were that, and a check with a 75% false
 *  rate is one the next person switches off rather than reads. */
const SCOPE_COLUMNS = [
  "user_id",
  "created_by",
  "follower_id",
  "followee_id",
  "payee_id",
  "from_user_id",
  "leader_id",
  "owner_id",
  "business_id",
  "tenant_id",
  "class_id",
  "class_booking_id",
  "session_id",
  "crew_id",
  "practice_id",
  "membership_id",
  "order_id",
  "enquiry_id",
  "subject_id",
  "id",
];

/** Tables whose writes go through RLS and whose refusal is therefore silent. */
const GUARDED_WRITE_TABLES = new Set([
  ...CEILING_TABLES,
  "classes",
  "class_sessions",
  "businesses",
  "profiles",
  "crews",
  "rooms",
  "memberships",
  "routines",
  "class_routines",
  "assets",
  "crew_practices",
  "support_threads",
  "support_messages",
]);

const files = [];
const walk = (dir) => {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(full)) files.push(full);
  }
};
for (const d of DIRS) walk(join(ROOT, d));

/** Everything from `.from("x")` up to the statement's end — good enough for this
 *  codebase, where every query is one chained expression. */
const chainsIn = (src) => {
  const out = [];
  const re = /\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const start = m.index;
    /* the chain runs to the next `.from(` or to a line that ends a statement at
       depth zero; a generous slice is fine, because we only ask "does this text
       contain X" and an over-long slice can only make the check LENIENT */
    const nextFrom = src.indexOf(".from(", re.lastIndex);
    const semi = src.indexOf(";", re.lastIndex);
    const end = Math.min(nextFrom === -1 ? src.length : nextFrom, semi === -1 ? src.length : semi);
    out.push({ table: m[1], text: src.slice(start, end), at: start });
  }
  return out;
};

const lineOf = (src, index) => src.slice(0, index).split("\n").length;

/** An `audit-ok:` in the comment block immediately above this query.
 *
 *  ⚠ THE WINDOW IS THE TEXT SINCE THE PREVIOUS `.from(`, not "the line above":
 *  a chain in this codebase opens `const { data, error } = await supabase` and
 *  puts `.from(` on the NEXT line, with the reason as a block comment three to
 *  six lines up — so a two-line window excused nothing and the check went on
 *  reporting four queries whose reasons were written directly above them. Only
 *  the text since the previous query is searched, so one comment cannot excuse
 *  a second, unrelated write further down. */
const excused = (src, index) => {
  const prev = src.lastIndexOf(".from(", index - 1);
  const start = Math.max(prev === -1 ? 0 : prev, index - 900);
  return /audit-ok:/.test(src.slice(start, index));
};

const findings = [];
for (const file of files) {
  const src = readFileSync(file, "utf8");
  if (!src.includes(".from(")) continue;
  for (const chain of chainsIn(src)) {
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    const line = lineOf(src, chain.at);

    /* 1 — a ceiling read that names no scope */
    if (CEILING_TABLES.has(chain.table) && /\.select\(/.test(chain.text) && !ADMIN_ONLY_FILES.has(rel)) {
      /* `(?:\w+\.)?` is the embed prefix — `orders.class_id` is a scope */
      const scoped = SCOPE_COLUMNS.some((c) =>
        new RegExp(`\\.(eq|in|neq)\\(\\s*["'\`](?:\\w+\\.)?${c}["'\`]`).test(chain.text)
      );
      if (!scoped && !excused(src, chain.at)) {
        findings.push({
          kind: "unscoped-read",
          rel,
          line,
          detail: `reads \`${chain.table}\` without naming a scope — RLS is a ceiling, not a scope`,
        });
      }
    }

    /* 2 — a guarded write whose refusal would be silent */
    if (GUARDED_WRITE_TABLES.has(chain.table) && /\.(update|delete)\(/.test(chain.text)) {
      if (!/\.select\(/.test(chain.text) && !excused(src, chain.at)) {
        findings.push({
          kind: "silent-write",
          rel,
          line,
          detail: `writes \`${chain.table}\` without \`.select()\` — an RLS refusal returns zero rows and NO error`,
        });
      }
    }
  }
}

const byKind = (k) => findings.filter((f) => f.kind === k);
for (const kind of ["unscoped-read", "silent-write"]) {
  const rows = byKind(kind);
  console.log(`\n${kind} — ${rows.length}`);
  for (const f of rows) console.log(`  ${f.rel}:${f.line}  ${f.detail}`);
}
console.log(`\n${files.length} files scanned · ${findings.length} unexplained`);
process.exit(findings.length === 0 ? 0 : 1);
