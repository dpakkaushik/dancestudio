#!/usr/bin/env node
/**
 * DELETE THE AUTH ACCOUNTS BEHIND THE RETIRED ORGANIZATION LOGINS (29 Sep 2026).
 *
 * ⚠⚠ THIS IS THE ONE IRREVERSIBLE THING IN THE WHOLE REMOVAL. Every other step
 *    was a soft delete — a `deleted_at` and one UPDATE back. An auth account
 *    has no such column: deleted is deleted, and the person can no longer sign
 *    in with that address, ever.
 *
 * Until 27 Sep this was impossible anyway: four columns carried a foreign key
 * into `auth.users` with no `on delete` clause, so any account that had ever
 * acted as a platform admin was permanently undeletable and answered 23503.
 * `20260927110000` dropped those four, which is what makes this run at all.
 *
 * ⚠ THE SAFETY RAIL IS IN THE CODE, NOT IN THE QUERY. The candidate set is
 *   "an auth account whose profile is a soft-deleted role='org' row", and
 *   ONLY those whose email ends in @example.com are ever deleted. Anything
 *   else — a real address, a phone-only account, an address this script does
 *   not recognise — is listed and SKIPPED, whatever the query returned.
 *
 *   That rail exists because of a specific near-miss: on 27 Sep the same set
 *   contained three real addresses, and the user's answer was "test addresses
 *   only". A filter in SQL can be widened by accident; this one cannot be
 *   widened without editing the guard and reading this comment.
 *
 * Usage:
 *   node scripts/delete-retired-org-logins.js           # dry run
 *   node scripts/delete-retired-org-logins.js --apply   # do it, permanently
 */
"use strict";

const fs = require("fs");
const path = require("path");

const APPLY = process.argv.includes("--apply");

/** ⚠ THE RAIL. Only an address matching this is ever deleted. */
const DELETABLE = /@example\.com$/i;

/** ⚠ THE ONLY WAY PAST THE RAIL, and it must NAME the address.
 *
 *  `--also <email>` adds exactly one address, matched in full. There is
 *  deliberately no pattern, no list file and no "--all": widening the rail has
 *  to be a decision about one account, typed out, every time. On 29 Sep 2026
 *  this was used once, for jishnu.nanda@gmail.com, after its two live Cashfree
 *  mandates had been cancelled — the account looked empty and was not, so the
 *  flag exists to make that check deliberate rather than habitual. */
const ALSO = (() => {
  const i = process.argv.indexOf("--also");
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1].trim().toLowerCase() : null;
})();
const deletable = (email) =>
  DELETABLE.test(email || "") || (ALSO !== null && (email || "").toLowerCase() === ALSO);

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

  let deleted = 0, failed = 0, skipped = 0;
  try {
    const { rows } = await c.query(`
      select u.id, u.email, u.phone, u.last_sign_in_at, p.full_name
      from auth.users u
      join public.profiles p on p.id = u.id
      where p.role = 'org' and p.deleted_at is not null
      order by u.email nulls last`);

    const go = rows.filter((r) => deletable(r.email));
    const hold = rows.filter((r) => !deletable(r.email));
    const named = ALSO ? go.filter((r) => (r.email || "").toLowerCase() === ALSO) : [];

    console.log(APPLY ? "=== APPLYING — THIS CANNOT BE UNDONE ===\n" : "=== DRY RUN (nothing is deleted) ===\n");
    console.log(`candidates (auth accounts on a soft-deleted 'org' profile): ${rows.length}`);
    console.log(`  to delete (@example.com)                               : ${go.length - named.length}`);
    if (ALSO) {
      console.log(`  ⚠ NAMED BY --also (past the rail, deliberately)        : ${named.length}`);
      for (const n of named) {
        console.log(`       ${n.email}  "${n.full_name}"  last sign-in ` +
          `${n.last_sign_in_at ? new Date(n.last_sign_in_at).toISOString().slice(0, 10) : "never"}`);
      }
      if (!named.length) console.log(`       ⚠ --also ${ALSO} matched NOTHING in the candidate set`);
    }
    console.log(`  ⚠ HELD BACK — not a test address                       : ${hold.length}\n`);

    for (const h of hold) {
      console.log(`  ⚠ SKIPPED  ${h.email || h.phone || "(no handle)"}  "${h.full_name}"` +
        `  last sign-in ${h.last_sign_in_at ? new Date(h.last_sign_in_at).toISOString().slice(0, 10) : "never"}`);
    }
    if (hold.length) console.log("");

    if (!APPLY) {
      for (const g of go.slice(0, 10)) console.log(`     would delete  ${g.email}`);
      if (go.length > 10) console.log(`     … and ${go.length - 10} more`);
      console.log("\n=== DRY RUN — nothing deleted. Pass --apply to do it, permanently. ===");
      return;
    }

    // The ADMIN API rather than a raw DELETE: the auth schema carries
    // identities, sessions, refresh tokens and mfa factors of its own, and the
    // API is what knows about all of them.
    const base = e.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
    const key = e.SUPABASE_SERVICE_ROLE_KEY;
    for (const g of go) {
      const r = await fetch(`${base}/auth/v1/admin/users/${g.id}`, {
        method: "DELETE",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "User-Agent": "danceos-sweep" },
      });
      if (r.ok) { deleted++; }
      else {
        failed++;
        const body = await r.text();
        console.log(`  FAILED  ${g.email}  ${r.status}  ${body.slice(0, 160)}`);
      }
    }
    skipped = hold.length;
    console.log(`\ndeleted: ${deleted} · failed: ${failed} · held back: ${skipped}`);

    const left = await c.query(`
      select count(*)::int n from auth.users u
      join public.profiles p on p.id = u.id
      where p.role = 'org' and p.deleted_at is not null`);
    console.log(`auth accounts still on a soft-deleted 'org' profile: ${left.rows[0].n}`);
    console.log(deleted ? "\n=== APPLIED. This cannot be undone. ===" : "");
  } catch (err) {
    console.error("\nFAILED:", err.message);
    process.exit(1);
  } finally {
    await c.end();
  }
})();
