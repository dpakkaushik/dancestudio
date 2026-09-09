/* Proof-script leftovers on the live database — soft-deleted, never erased.
 *
 * The RLS proof scripts create throwaway accounts (ev-*, mng-*, pp-*, follow-*,
 * srch-*, e2e-*@example.com, and two very early ones with no email) and
 * businesses ("Webhook Proof Studio", "Enroll Studio", "Managed A/B", "Near
 * Studio", "Event Proof Studio", "Rival Studio"). A run that dies before its
 * `finally` leaves them behind, on production, as public studios. This stamps
 * `deleted_at` on those profiles, on every business they own (and on any
 * business with no live owner at all), and on those businesses' classes,
 * sessions, events and memberships. Every read in the app filters on
 * deleted_at, so they vanish; nothing is erased, so a mistake is one UPDATE
 * back. Demo accounts (demo.*) are left alone — `demo-data.js wipe` owns them.
 *
 *   node scripts/cleanup-proof-leftovers.js            # dry run: lists what would go
 *   node scripts/cleanup-proof-leftovers.js --apply    # writes
 *
 * Run it BEFORE 20260908120000_users_orgs_admins.sql: that migration
 * grandfathers every organization that owns a live business as verified, and
 * a proof owner should not be one of them. Needs the service role key in
 * .env.local (it is the only key that may write another account's rows).
 */
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const val = (k) => (env.split(/\r?\n/).find((l) => l.startsWith(k + "=")) || "").split("=").slice(1).join("=").trim();
const BASE = val("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE = val("SUPABASE_SERVICE_ROLE_KEY");
if (!BASE || !SERVICE) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be in .env.local");
const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", "User-Agent": "danceos-cleanup/1.0", Prefer: "return=representation" };
const APPLY = process.argv.includes("--apply");

const JUNK_EMAIL = /^(ev|mng|pp|follow|srch|e2e|prof|st|stats|crew|evt|enq|mgd|pay|rf|wh|inv|cls|near|sl)-[^@]*@example\.com$/i;
const JUNK_NAMES = new Set(["Studio Test", "Priya Test"]);

async function call(method, url, body) {
  const res = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const get = (p) => call("GET", `${BASE}/rest/v1/${p}`);
const patch = (p, body) => call("PATCH", `${BASE}/rest/v1/${p}`, body);

async function allAuthUsers() {
  const out = [];
  for (let page = 1; page < 50; page++) {
    const r = await call("GET", `${BASE}/auth/v1/admin/users?page=${page}&per_page=200`);
    const users = r.users || [];
    out.push(...users);
    if (users.length < 200) break;
  }
  return out;
}

(async () => {
  const users = await allAuthUsers();
  const emailOf = new Map(users.map((u) => [u.id, u.email || null]));
  const profiles = await get("profiles?select=id,full_name,role&deleted_at=is.null");
  const junkProfiles = profiles.filter((p) => {
    const email = emailOf.get(p.id);
    /* an auth user with no email is one of the two very first test accounts */
    return email === null || (email && JUNK_EMAIL.test(email)) || JUNK_NAMES.has(p.full_name);
  });
  const junkIds = new Set(junkProfiles.map((p) => p.id));
  const liveGood = new Set(profiles.filter((p) => !junkIds.has(p.id)).map((p) => p.id));

  const tenants = await get("tenants?select=id,type,name&deleted_at=is.null");
  const owners = await get("tenant_members?select=tenant_id,user_id&member_role=eq.owner&deleted_at=is.null");
  const ownedByGood = new Set(owners.filter((m) => liveGood.has(m.user_id)).map((m) => m.tenant_id));
  const junkTenants = tenants.filter((t) => !ownedByGood.has(t.id));

  console.log(`profiles to soft-delete: ${junkProfiles.length}`);
  junkProfiles.forEach((p) => console.log(`  - ${p.role.padEnd(8)} ${p.full_name}  <${emailOf.get(p.id) || "no email"}>`));
  console.log(`businesses to soft-delete (owned by one of those, or by nobody live): ${junkTenants.length}`);
  junkTenants.forEach((t) => console.log(`  - ${t.type.padEnd(17)} ${t.name}`));
  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to soft-delete these.");
    return;
  }
  const now = new Date().toISOString();
  const inList = (ids) => `in.(${ids.join(",")})`;
  const tids = junkTenants.map((t) => t.id);
  const pids = junkProfiles.map((p) => p.id);
  const counts = {};
  if (tids.length) {
    for (const table of ["class_sessions", "classes", "events", "tenant_members"]) {
      const rows = await patch(`${table}?tenant_id=${inList(tids)}&deleted_at=is.null`, { deleted_at: now });
      counts[table] = Array.isArray(rows) ? rows.length : "?";
    }
    counts.tenants = (await patch(`tenants?id=${inList(tids)}&deleted_at=is.null`, { deleted_at: now })).length;
  }
  if (pids.length) counts.profiles = (await patch(`profiles?id=${inList(pids)}&deleted_at=is.null`, { deleted_at: now })).length;
  console.log("\napplied:", JSON.stringify(counts));
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
