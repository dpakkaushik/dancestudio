/* Proof-script leftovers on the live database — soft-deleted, never erased.
 *
 * The RLS proof scripts create throwaway accounts (ev-*, mng-*, pp-*, follow-*,
 * srch-*, e2e-*@example.com, sv-admin-*, the shot scripts' shot.*@example.com,
 * and two very early ones with no email) and businesses ("Webhook Proof Studio",
 * "Enroll Studio", "Managed A/B", "Near Studio", "Event Proof Studio", "Rival
 * Studio", "Shot Studio", "Mandate Test"…). A run that dies before its
 * `finally` leaves them behind, on production, as public studios. This stamps
 * `deleted_at` on those profiles, on every business they own (and on any
 * business with no live owner at all), and on those businesses' classes,
 * sessions, events and memberships. Every read in the app filters on
 * deleted_at, so they vanish; nothing is erased, so a mistake is one UPDATE
 * back. Demo accounts (demo.*) are left alone — `demo-data.js wipe` owns them.
 *
 *   node scripts/cleanup-proof-leftovers.js              # dry run: lists what would go
 *   node scripts/cleanup-proof-leftovers.js --show-kept  # dry run, and lists what STAYS
 *   node scripts/cleanup-proof-leftovers.js --apply      # writes
 *
 * ⚠ TWO THINGS IT GOT WRONG UNTIL 18 Sep 2026, found by counting before the
 * first real run: (1) it read `businesses` with one GET, and PostgREST caps a
 * response at 1,000 rows — production held 1,021, so 21 would never have been
 * looked at; every list is PAGED now. (2) Its patterns missed two whole
 * families the newer scripts leave — `sv-admin-*` (studio-verification proofs)
 * and `shot.*` (the shot scripts, dotted not hyphenated) — plus the names
 * "Shot Studio …" and "Mandate Test …" (no "Studio"), which were sitting LISTED
 * on Discover. And a PATCH with a thousand ids in its URL is a request some
 * gateways refuse, so writes go in chunks of 80.
 *
 * Needs the service role key in .env.local (it is the only key that may write
 * another account's rows).
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
const SHOW_KEPT = process.argv.includes("--show-kept");

/* every throwaway account is @example.com — a real person never is, so nothing
   real can match whatever the prefix. Hyphenated prefixes are the proofs' and
   the e2e's; `sv-admin-` is the studio-verification proof's admin; `shot.` is
   the shot scripts' (dotted). */
const JUNK_EMAIL =
  /^((ev|mng|pp|follow|srch|e2e|prof|st|stats|crew|evt|enq|mgd|pay|rf|wh|inv|cls|near|sl|mod|panel|shots|orghome|proof|att|set|rooms|leads|enroll|ratecheck|sv-admin)-[^@]*|shot\.[^@]*)@example\.com$/i;
const JUNK_NAMES = new Set(["Studio Test", "Priya Test"]);

/* THE BUSINESSES THE PROOF SCRIPTS NAME, verbatim. Ownership alone is not
   enough: the two test PHONE accounts are kept on purpose (below), so every
   studio they leave behind was kept with them — eight of them, LISTED, on
   Discover, called things like "Enroll Studio 142804" (found 10 Sep 2026); and
   the demo owner holds a "Mandate Test …" from an early paid-webhook run. A name
   match sweeps one too, but only when its owner is a junk account, one of those
   kept phones or a demo account, so a real business can never be caught by it. */
const JUNK_TENANT_NAME =
  /^(Webhook Proof Studio|Enroll Studio|Managed [AB]|Near Studio|Event Proof Studio|Rival Studio|Rooms Proof Studio|Leads Proof Studio|Class Studio|Att Proof Studio|Pay Proof Studio|Refund Proof Studio|Crew Proof Studio|Follow Proof Studio|Media Studio|Notif Proof Studio|Stat Proof Studio|Income Proof Studio|Settings Proof Studio|Slug Proof Studio|Enquiry Proof Studio|Earn Proof Studio|Staff Proof Studio|PP (Listed|Private) Studio|Private Studio|Other Studio|Artist Business|Studio [AB]|Mandate (Test|Proof)( Studio)?|Mod (Studio|Org)|E2E (Studio|Owner)|Shot (Studio|Org|Owner)|Timeline Test|Zq)\b/i;
/* the two Supabase TEST PHONE numbers are how paid-webhook.spec.ts and the older
   proofs sign in. They have no email, so "no email" alone would sweep them up on
   every run and the next phone-based proof would fail with "finish onboarding
   first" — they are kept, and scripts/ensure-test-phone-profiles.js shapes them. */
const KEEP_PHONES = new Set(["919999999999", "918888888888"]);
const isDemo = (email) => Boolean(email && /^demo\./i.test(email));

async function call(method, url, body, extraHeaders) {
  const res = await fetch(url, { method, headers: { ...H, ...(extraHeaders || {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
/* PAGED: PostgREST answers at most 1,000 rows to one GET whatever the filter says */
async function getAll(p) {
  const out = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const rows = await call("GET", `${BASE}/rest/v1/${p}`, null, { Range: `${from}-${from + PAGE - 1}`, Prefer: "count=exact" });
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}
const patch = (p, body) => call("PATCH", `${BASE}/rest/v1/${p}`, body);
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

async function allAuthUsers() {
  const out = [];
  for (let page = 1; page < 100; page++) {
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
  const phoneOf = new Map(users.map((u) => [u.id, (u.phone || "").replace(/^\+/, "")]));
  const profiles = await getAll("profiles?select=id,full_name,role&deleted_at=is.null&order=id");
  const junkProfiles = profiles.filter((p) => {
    if (KEEP_PHONES.has(phoneOf.get(p.id))) return false;
    const email = emailOf.get(p.id);
    /* an auth user with no email and no kept phone is an early test account */
    return email === null || (email && JUNK_EMAIL.test(email)) || JUNK_NAMES.has(p.full_name);
  });
  const junkIds = new Set(junkProfiles.map((p) => p.id));
  const liveGood = new Set(profiles.filter((p) => !junkIds.has(p.id)).map((p) => p.id));

  const businesses = await getAll("businesses?select=id,type,name,visibility&deleted_at=is.null&order=id");
  const owners = await getAll("business_members?select=business_id,user_id&member_role=eq.owner&deleted_at=is.null&order=business_id");
  const ownedByGood = new Set(owners.filter((m) => liveGood.has(m.user_id)).map((m) => m.business_id));
  /* who owns what, so a name match can be bounded to a test-owned row */
  const ownerOf = new Map(owners.map((m) => [m.business_id, m.user_id]));
  const testOwned = (t) => {
    const owner = ownerOf.get(t.id);
    if (!owner) return true;
    if (junkIds.has(owner)) return true;
    return KEEP_PHONES.has(phoneOf.get(owner)) || isDemo(emailOf.get(owner));
  };
  const junkTenants = businesses.filter(
    (t) => !ownedByGood.has(t.id) || (JUNK_TENANT_NAME.test(t.name) && testOwned(t))
  );
  const junkTenantIds = new Set(junkTenants.map((t) => t.id));

  const who = (id) => emailOf.get(id) || (phoneOf.get(id) ? `phone ${phoneOf.get(id)}` : "no email");
  console.log(`live profiles read: ${profiles.length} · live businesses read: ${businesses.length} · owner rows read: ${owners.length}`);
  console.log(`profiles to soft-delete: ${junkProfiles.length}`);
  junkProfiles.forEach((p) => console.log(`  - ${p.role.padEnd(8)} ${p.full_name}  <${who(p.id)}>`));
  console.log(`businesses to soft-delete (owned by one of those, or by nobody live, or a proof's own name under a test owner): ${junkTenants.length}`);
  junkTenants.forEach((t) =>
    console.log(`  - ${t.type.padEnd(11)} ${t.name}${ownedByGood.has(t.id) ? `   (kept owner <${who(ownerOf.get(t.id))}>, junk NAME)` : ""}`)
  );
  if (SHOW_KEPT) {
    const kept = profiles.filter((p) => !junkIds.has(p.id));
    console.log(`\nPROFILES KEPT: ${kept.length}`);
    for (const role of ["user", "org"]) {
      const rows = kept.filter((p) => p.role === role);
      console.log(`  ${role}: ${rows.length}`);
      rows.forEach((p) => console.log(`    - ${p.full_name}  <${who(p.id)}>`));
    }
    const keptBiz = businesses.filter((t) => !junkTenantIds.has(t.id));
    console.log(`BUSINESSES KEPT: ${keptBiz.length}`);
    for (const type of ["studio", "artist_page", "org"]) {
      const rows = keptBiz.filter((t) => t.type === type);
      console.log(`  ${type}: ${rows.length}${type === "studio" ? ` (listed ${rows.filter((t) => t.visibility === "listed").length})` : ""}`);
      rows.forEach((t) => console.log(`    - ${t.name}  [${t.visibility}]  owner <${who(ownerOf.get(t.id))}>`));
    }
  }
  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to soft-delete these.");
    return;
  }
  const now = new Date().toISOString();
  const tids = junkTenants.map((t) => t.id);
  const pids = junkProfiles.map((p) => p.id);
  const counts = {};
  /* chunked: a thousand uuids in one URL is a request some gateways refuse */
  const patchIn = async (table, column, ids) => {
    let n = 0;
    for (const part of chunk(ids, 80)) {
      const rows = await patch(`${table}?${column}=in.(${part.join(",")})&deleted_at=is.null`, { deleted_at: now });
      n += Array.isArray(rows) ? rows.length : 0;
    }
    return n;
  };
  if (tids.length) {
    for (const table of ["class_sessions", "classes", "events", "business_members"]) {
      counts[table] = await patchIn(table, "business_id", tids);
    }
    counts.businesses = await patchIn("businesses", "id", tids);
  }
  if (pids.length) counts.profiles = await patchIn("profiles", "id", pids);
  console.log("\napplied:", JSON.stringify(counts));
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
