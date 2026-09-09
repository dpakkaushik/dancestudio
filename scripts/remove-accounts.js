/* Delete login accounts for good — the one irreversible script in here.
 *
 * `cleanup-proof-leftovers.js` soft-deletes PROFILES (a row keeps its id, so the
 * account cannot onboard again). This deletes the auth account itself, which
 * cascades its profile and everything hanging off it: bookings, follows, crews,
 * plans, notifications, memberships. Use it to hand an email back to somebody
 * who wants to sign up fresh, and to clear test logins.
 *
 *   node scripts/remove-accounts.js --email a@b.com [--email c@d.com]
 *   node scripts/remove-accounts.js --junk            # every test/proof login
 *   … add --apply to actually delete (dry run otherwise)
 *
 * Guards, deliberately hard to talk past:
 *   · a dry run by default, printing what each account takes with it;
 *   · `demo.*` accounts are refused unless --include-demo (demo-data.js owns them);
 *   · the two Supabase TEST PHONE numbers are refused unless --include-test-phones
 *     (paid-webhook.spec.ts and the phone proofs sign in with them);
 *   · the LAST platform admin is always refused — locking yourself out of the
 *     verification queue needs a database change, not a typo.
 *
 * A business whose owner is deleted is left without a live owner; run
 * `cleanup-proof-leftovers.js --apply` afterwards to soft-delete those.
 */
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const val = (k) => (env.split(/\r?\n/).find((l) => l.startsWith(k + "=")) || "").split("=").slice(1).join("=").trim();
const BASE = val("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE = val("SUPABASE_SERVICE_ROLE_KEY");
if (!BASE || !SERVICE) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be in .env.local");
const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", "User-Agent": "danceos-remove-accounts/1.0", Prefer: "return=representation" };

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const emails = argv.reduce((acc, a, i) => (a === "--email" && argv[i + 1] ? [...acc, argv[i + 1].toLowerCase()] : acc), []);
const APPLY = has("--apply");
const JUNK = has("--junk");
const TEST_PHONES = ["919999999999", "918888888888"];
/* the prefixes the proof scripts and the e2e suites mint, @example.com only */
const JUNK_EMAIL = /^(e2e|ev|mng|pp|follow|srch|prof|st|look|stats|crew|evt|enq|mgd|pay|rf|wh|inv|cls|near|sl)-[^@]*@example\.com$/i;

async function call(method, url, body) {
  const res = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const get = (p) => call("GET", `${BASE}/rest/v1/${p}`);

async function allUsers() {
  const out = [];
  for (let page = 1; page < 50; page++) {
    const r = await call("GET", `${BASE}/auth/v1/admin/users?page=${page}&per_page=200`);
    const users = r.users || [];
    out.push(...users);
    if (users.length < 200) break;
  }
  return out;
}

const count = async (table, col, id) => (await get(`${table}?${col}=eq.${id}&select=id`)).length;

(async () => {
  if (!emails.length && !JUNK) {
    console.log("Nothing named. Pass --email <address> (repeatable) or --junk. Add --apply to delete.");
    return;
  }
  const users = await allUsers();
  const admins = (await get("platform_admins?select=user_id&deleted_at=is.null")).map((a) => a.user_id);

  let targets = users.filter((u) => {
    const email = (u.email || "").toLowerCase();
    if (emails.includes(email)) return true;
    return JUNK && (JUNK_EMAIL.test(email) || (!email && u.phone));
  });

  const refused = [];
  targets = targets.filter((u) => {
    const email = (u.email || "").toLowerCase();
    if (email.startsWith("demo.") && !has("--include-demo")) { refused.push([email, "a demo account — demo-data.js owns it (--include-demo to override)"]); return false; }
    if (TEST_PHONES.includes(u.phone || "") && !has("--include-test-phones")) { refused.push([`+${u.phone}`, "a Supabase test phone number the proofs sign in with (--include-test-phones to override)"]); return false; }
    return true;
  });
  const remainingAdmins = admins.filter((id) => !targets.some((t) => t.id === id));
  if (admins.length && remainingAdmins.length === 0) {
    const last = targets.find((t) => admins.includes(t.id));
    refused.push([last.email || `+${last.phone}`, "the LAST platform admin — the verification queue would have nobody"]);
    targets = targets.filter((t) => t.id !== last.id);
  }

  const named = new Set(emails);
  for (const e of named) if (!users.some((u) => (u.email || "").toLowerCase() === e)) console.log(`not found, nothing to do: ${e}`);

  console.log(`\naccounts to delete: ${targets.length}`);
  for (const u of targets) {
    const who = u.email || `+${u.phone}`;
    const [prof] = await get(`profiles?id=eq.${u.id}&select=full_name,role,deleted_at`);
    const owns = (await get(`tenant_members?user_id=eq.${u.id}&member_role=eq.owner&deleted_at=is.null&select=tenant_id`)).length;
    const takes = {
      bookings: await count("enrollments", "user_id", u.id),
      follows: await count("follows", "follower_id", u.id),
      plans: await count("artist_plans", "user_id", u.id),
      notifications: await count("notifications", "user_id", u.id),
    };
    const admin = admins.includes(u.id) ? " · PLATFORM ADMIN" : "";
    const who2 = prof ? `${prof.full_name} (${prof.role}${prof.deleted_at ? ", already soft-deleted" : ""})` : "no profile";
    console.log(`  - ${who}\n      ${who2}${admin} · owns ${owns} business(es) · ${Object.entries(takes).map(([k, v]) => `${v} ${k}`).join(", ")}`);
  }
  if (refused.length) {
    console.log(`\nrefused (${refused.length}):`);
    refused.forEach(([who, why]) => console.log(`  - ${who} — ${why}`));
  }
  if (!APPLY) {
    console.log("\nDRY RUN — nothing deleted. Re-run with --apply.");
    return;
  }
  console.log("");
  for (const u of targets) {
    const who = u.email || `+${u.phone}`;
    await call("DELETE", `${BASE}/auth/v1/admin/users/${u.id}`);
    console.log(`deleted: ${who}`);
  }
  console.log(`\n${targets.length} account(s) gone. Businesses they owned now have no live owner — run\n  node scripts/cleanup-proof-leftovers.js --apply\nto soft-delete those.`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
