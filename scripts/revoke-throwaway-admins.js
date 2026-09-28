#!/usr/bin/env node
/**
 * REVOKE PLATFORM ADMIN FROM THE PROOF/E2E THROWAWAYS (29 Sep 2026).
 *
 * ⚠⚠ THIS CLOSES A CONFIRMED LIVE EXPOSURE. Found while checking what was left
 *    after the organization/event sweep: production carried **485
 *    `platform_admins` rows on a pilot with 35 people**, and 484 of them belong
 *    to `@example.com` accounts the proof scripts and the e2e suite create —
 *    one per run, since 14 Sep, never cleaned up.
 *
 *    That is not merely clutter. `scripts/rls-proof-studio-verification.ps1`
 *    creates its admin with a password that is a LITERAL IN THIS REPO
 *    (`Proof-passw0rd!`), and signing in as `sv-admin-*` with it was verified
 *    to work against production: `is_platform_admin()` answered **true**.
 *    A platform admin reads every account, every business and every support
 *    thread, and can suspend anybody.
 *
 * WHY REVOKE RATHER THAN DELETE: `is_platform_admin()` tests
 * `deleted_at is null`, so soft-deleting the row removes the rights the instant
 * it lands — and one UPDATE puts them back. Deleting 484 auth accounts is
 * irreversible and is a separate decision; this is the part that should not
 * wait for one.
 *
 * ⚠ THE RAIL IS IN THE CODE: only an `@example.com` address is ever revoked.
 *   A real admin is listed and SKIPPED, whatever the query returned.
 *
 * Usage:
 *   node scripts/revoke-throwaway-admins.js           # dry run
 *   node scripts/revoke-throwaway-admins.js --apply   # revoke (reversible)
 */
"use strict";

const fs = require("fs");
const path = require("path");

const APPLY = process.argv.includes("--apply");
const REVOCABLE = /@example\.com$/i;

function env() {
  const raw = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
function dbUrl(e) {
  const ref = new URL(e.NEXT_PUBLIC_SUPABASE_URL).host.split(".")[0];
  return `postgresql://postgres.${ref}:${encodeURIComponent(e.SUPABASE_DB_PASSWORD)}` +
         `@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;
}

let Client;
try { ({ Client } = require("pg")); }
catch { console.error("This script needs the `pg` client:  npm i -D pg"); process.exit(1); }

(async () => {
  const e = env();
  const c = new Client({ connectionString: dbUrl(e), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const { rows } = await c.query(`
      select a.user_id, u.email, u.last_sign_in_at
      from platform_admins a
      left join auth.users u on u.id = a.user_id
      where a.deleted_at is null
      order by u.email nulls last`);

    const go = rows.filter((r) => REVOCABLE.test(r.email || ""));
    const keep = rows.filter((r) => !REVOCABLE.test(r.email || ""));

    console.log(APPLY ? "=== APPLYING (reversible — one UPDATE puts any of it back) ===\n"
                      : "=== DRY RUN (nothing is written) ===\n");
    console.log(`live platform_admins rows        : ${rows.length}`);
    console.log(`  to revoke (@example.com)       : ${go.length}`);
    console.log(`  ⚠ KEPT — a real admin          : ${keep.length}\n`);
    for (const k of keep) {
      console.log(`  ⚠ KEPT  ${k.email || "(no email)"}  last sign-in ` +
        `${k.last_sign_in_at ? new Date(k.last_sign_in_at).toISOString().slice(0, 10) : "never"}`);
    }

    const byPrefix = {};
    for (const g of go) {
      const p = (g.email.split("@")[0] || "").replace(/[0-9a-z]{4,}$/i, "*");
      byPrefix[p] = (byPrefix[p] || 0) + 1;
    }
    console.log("\n  revoking, by address prefix:");
    for (const [p, n] of Object.entries(byPrefix).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
      console.log(`     ${String(n).padStart(4)}  ${p}`);
    }

    if (!APPLY) {
      console.log("\n=== DRY RUN — nothing written. Pass --apply to revoke. ===");
      return;
    }

    const ids = go.map((g) => g.user_id);
    const r = await c.query(
      `update platform_admins set deleted_at = now()
       where deleted_at is null and user_id = any($1::uuid[])`, [ids]);
    console.log(`\nrevoked: ${r.rowCount}`);

    const left = await c.query(`select count(*)::int n from platform_admins where deleted_at is null`);
    console.log(`live platform admins now: ${left.rows[0].n}`);
    console.log("\n=== APPLIED. `is_platform_admin()` tests deleted_at, so this took effect at once. ===");
  } catch (err) {
    console.error("\nFAILED:", err.message);
    process.exit(1);
  } finally {
    await c.end();
  }
})();
