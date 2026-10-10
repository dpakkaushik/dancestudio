/* LEFTOVER GUARD — READ-ONLY. Fails loudly when a test run left something live
 * that matters (10 Oct 2026).
 *
 * The user's rule: "Make every proof and shoot clean up in a 'finally' that checks
 * its own result, and add one guard script that fails loudly if any throwaway
 * admin or test-named listed studio is live. Nothing deletes on a schedule."
 *
 * So this deletes NOTHING. It asks three questions and exits 1, naming every
 * offender, if any answer is yes:
 *
 *   1. Is any LIVE platform_admins row held by an account that is not
 *      ai@eeetaxi.com? (29 Sep 2026: 484 throwaway admins were live on production,
 *      one signing in with a password committed in this repo.)
 *   2. Is any LIVE, LISTED business named like a proof/shoot/e2e business AND owned
 *      by a junk email, a kept test phone, or nobody live? (A listed studio is on
 *      Discover — in front of real visitors.) ⚠ A name match under a REAL or a demo
 *      owner is never an offender; "EEE Dance Studio" counts only under a junk
 *      email, because the demo world has a real one.
 *   3. Is any LIVE profile held by a junk email?
 *
 * Every PostgREST read is PAGED (it caps a response at 1,000 rows whatever the
 * filter says — the 18 Sep 2026 lesson), and so is the auth users list.
 *
 *   node scripts/leftover-guard.js        (or: npm run guard:leftovers)
 *
 * When it fails: read the list, then decide — `cleanup-proof-leftovers.js` (dry run
 * first, --show-kept, then --apply) and `revoke-throwaway-admins.js` are the tools.
 * The guard never runs them for you.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const {
  isJunkEmail,
  JUNK_TENANT_NAME,
  JUNK_OWNER_ONLY_NAME,
  KEEP_PHONES,
  isDemo,
} = require("./proof-patterns");

const KEEP_ADMIN = "ai@eeetaxi.com";

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const val = (k) => (env.split(/\r?\n/).find((l) => l.startsWith(k + "=")) || "").split("=").slice(1).join("=").trim();
const BASE = val("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE = val("SUPABASE_SERVICE_ROLE_KEY");
if (!BASE || !SERVICE) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be in .env.local");
  process.exit(2);
}
const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "User-Agent": "danceos-leftover-guard/1.0" };

async function get(url, extra) {
  const res = await fetch(url, { method: "GET", headers: { ...H, ...(extra || {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
/* PAGED: PostgREST answers at most 1,000 rows to one GET */
async function getAll(p) {
  const out = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const rows = await get(`${BASE}/rest/v1/${p}`, { Range: `${from}-${from + PAGE - 1}` });
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}
async function allAuthUsers() {
  const out = [];
  for (let page = 1; page < 200; page++) {
    const r = await get(`${BASE}/auth/v1/admin/users?page=${page}&per_page=200`);
    const users = r.users || [];
    out.push(...users);
    if (users.length < 200) break;
  }
  return out;
}

(async () => {
  const users = await allAuthUsers();
  const emailOf = new Map(users.map((u) => [u.id, (u.email || "").toLowerCase() || null]));
  const phoneOf = new Map(users.map((u) => [u.id, (u.phone || "").replace(/^\+/, "")]));
  const who = (id) => {
    const e = emailOf.get(id);
    const p = phoneOf.get(id);
    if (e && p) return `${e} / phone +${p}`;
    return e || (p ? `phone +${p}` : `no account (${id})`);
  };

  const offenders = [];

  /* 1. throwaway admins */
  const admins = await getAll("platform_admins?select=user_id&deleted_at=is.null&order=user_id");
  const badAdmins = admins.filter((a) => emailOf.get(a.user_id) !== KEEP_ADMIN);
  for (const a of badAdmins) offenders.push(`[admin]    live platform_admins row for <${who(a.user_id)}>`);

  /* 2. test-named LISTED businesses under a test owner, or under nobody live */
  const profiles = await getAll("profiles?select=id&deleted_at=is.null&order=id");
  const liveProfile = new Set(profiles.map((p) => p.id));
  const listed = await getAll("businesses?select=id,name,type&deleted_at=is.null&visibility=eq.listed&order=id");
  const owners = await getAll("business_members?select=business_id,user_id&member_role=eq.owner&deleted_at=is.null&order=business_id");
  const ownersOf = new Map();
  for (const m of owners) {
    if (!liveProfile.has(m.user_id)) continue; // a soft-deleted owner is no live owner
    if (!ownersOf.has(m.business_id)) ownersOf.set(m.business_id, []);
    ownersOf.get(m.business_id).push(m.user_id);
  }
  let namedListed = 0;
  for (const b of listed) {
    const ids = ownersOf.get(b.id) || [];
    const junkOwner = (id) => isJunkEmail(emailOf.get(id));
    const keptPhoneOwner = (id) => KEEP_PHONES.has(phoneOf.get(id)) && !isDemo(emailOf.get(id));
    if (JUNK_TENANT_NAME.test(b.name)) {
      namedListed++;
      const noOwner = ids.length === 0;
      const testOwner = ids.length > 0 && ids.every((id) => junkOwner(id) || keptPhoneOwner(id));
      if (noOwner || testOwner) {
        offenders.push(`[studio]   LISTED ${b.type} "${b.name}" (${b.id}) owner ${noOwner ? "<nobody live>" : ids.map((id) => `<${who(id)}>`).join(", ")}`);
      }
    } else if (JUNK_OWNER_ONLY_NAME.test(b.name)) {
      namedListed++;
      if (ids.length > 0 && ids.every(junkOwner)) {
        offenders.push(`[studio]   LISTED ${b.type} "${b.name}" (${b.id}) owner ${ids.map((id) => `<${who(id)}>`).join(", ")}`);
      }
    }
  }

  /* 3. live profiles held by a throwaway email */
  /* ⚠ A KEPT TEST PHONE carrying a throwaway email is its own finding: that is
     paid-webhook.spec.ts rewriting the phone owner's address and (before 10 Oct
     2026) never putting it back. The account is KEPT — never a sweep target — so
     it is reported for a person to restore, not as a profile to delete. */
  const junkProfiles = profiles.filter((p) => isJunkEmail(emailOf.get(p.id)));
  for (const p of junkProfiles) {
    if (KEEP_PHONES.has(phoneOf.get(p.id))) {
      offenders.push(`[phone]    kept test-phone account <${who(p.id)}> carries a throwaway email — restore its address, never delete it`);
    } else {
      offenders.push(`[profile]  live profile <${who(p.id)}>`);
    }
  }

  console.log(
    `read: ${users.length} accounts, ${profiles.length} live profiles, ${admins.length} live admin rows, ` +
      `${listed.length} listed businesses (${namedListed} carry a script's name)`
  );
  if (offenders.length) {
    console.log(`\n!! LEFTOVER GUARD FAILED — ${offenders.length} live leftover(s):`);
    offenders.forEach((o) => console.log(`  ${o}`));
    console.log(
      "\nNothing was changed. Decide, then use the tools: node scripts/cleanup-proof-leftovers.js --show-kept " +
        "(dry run) / --apply, and node scripts/revoke-throwaway-admins.js (dry run) / --apply."
    );
    process.exit(1);
  }
  console.log(
    `\nOK — no throwaway admin (${admins.length} live admin row(s), all ${KEEP_ADMIN}), ` +
      `no test-named listed studio under a test owner, no live throwaway profile.`
  );
})().catch((e) => {
  console.error(`LEFTOVER GUARD COULD NOT RUN: ${e.message}`);
  process.exit(2);
});
