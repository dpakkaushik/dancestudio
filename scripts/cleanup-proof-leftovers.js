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
/* ⚠ THREE MORE FAMILIES, ADDED 30 Sep 2026 — the 18 Sep lesson repeating, found
   the same way (by reading what the sweep KEPT rather than what it took). Each
   was traced to the script that makes it before it was added, because a filter
   widened on a guess is the defect this file warns about:
     · `staffproof-` — rls-proof-staff.ps1:85-89 (owner/join/rival/ghost)
     · `tiles.`      — scripts/shots/shoot-tiles.js:39, `tiles.${who}.${stamp}@…`
     · `em-`         — the event-money proof, introduced by 27908d8 and deleted
                       with the events removal in e556eef, so nothing makes them
                       any more and the eleven on production are pure residue.
   ⚠ All three are `@example.com`, which is the rail: a real person never is, so
   however broad a prefix looks it cannot reach one. `demo.*` is anchored
   separately by isDemo() and is unaffected. */
/* ⚠ 10 Oct 2026: THE PATTERNS LIVE IN scripts/proof-patterns.js NOW — this file and
   remove-accounts.js had drifted apart, and both missed a dozen families the newer
   scripts mint. One list, read by both, and by scripts/leftover-guard.js. */
const {
  JUNK_EMAIL,
  JUNK_NAMES,
  JUNK_TENANT_NAME,
  JUNK_OWNER_ONLY_NAME,
  JUNK_CREW_NAME,
  KEEP_PHONES,
  isDemo,
} = require("./proof-patterns");

/* THE BUSINESSES THE PROOF SCRIPTS NAME, verbatim. Ownership alone is not
   enough: the two test PHONE accounts are kept on purpose (below), so every
   studio they leave behind was kept with them — eight of them, LISTED, on
   Discover, called things like "Enroll Studio 142804" (found 10 Sep 2026); and
   the demo owner holds a "Mandate Test …" from an early paid-webhook run. A name
   match sweeps one too, but only when its owner is a junk account, one of those
   kept phones or a demo account, so a real business can never be caught by it.
   (JUNK_TENANT_NAME, KEEP_PHONES and isDemo come from scripts/proof-patterns.js.)
   ⚠ "EEE Dance Studio" is ALSO the demo world's real studio, so that name
   (JUNK_OWNER_ONLY_NAME) counts only under a junk-EMAIL owner — never under a
   demo account or a kept test phone.
   The two Supabase TEST PHONE numbers are how paid-webhook.spec.ts and the older
   proofs sign in. They have no email, so "no email" alone would sweep them up on
   every run and the next phone-based proof would fail with "finish onboarding
   first" — they are kept, and scripts/ensure-test-phone-profiles.js shapes them. */

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
    (t) =>
      !ownedByGood.has(t.id) ||
      (JUNK_TENANT_NAME.test(t.name) && testOwned(t)) ||
      (JUNK_OWNER_ONLY_NAME.test(t.name) && junkIds.has(ownerOf.get(t.id)))
  );
  const junkTenantIds = new Set(junkTenants.map((t) => t.id));

  /* ⚠ CREWS, ADDED 5 Oct 2026. Until today this script swept studios and
     accounts only, so every crew a proof or an e2e run left behind stayed live
     on Discover's Crews tab ("E2E Crew mtvy5vpy", "Proof Crew 020158",
     "Zq060518 Crew") — six of them, every one led by an account this script
     had ALREADY soft-deleted. The rule is the businesses' own: a crew whose
     leader is no live, non-junk profile is a leftover; a name a proof uses is
     one too, but only under a test leader, so a real crew can never be caught
     by its name. A real person's crew (led by a kept profile) is never touched. */
  const crews = await getAll("crews?select=id,name,city,leader_id&deleted_at=is.null&order=id");
  const testLed = (c) =>
    junkIds.has(c.leader_id) || KEEP_PHONES.has(phoneOf.get(c.leader_id)) || isDemo(emailOf.get(c.leader_id));
  const junkCrews = crews.filter((c) => !liveGood.has(c.leader_id) || (JUNK_CREW_NAME.test(c.name) && testLed(c)));
  const junkCrewIds = new Set(junkCrews.map((c) => c.id));

  const who = (id) => emailOf.get(id) || (phoneOf.get(id) ? `phone ${phoneOf.get(id)}` : "no email");
  console.log(`live profiles read: ${profiles.length} · live businesses read: ${businesses.length} · owner rows read: ${owners.length}`);
  console.log(`profiles to soft-delete: ${junkProfiles.length}`);
  junkProfiles.forEach((p) => console.log(`  - ${p.role.padEnd(8)} ${p.full_name}  <${who(p.id)}>`));
  console.log(`businesses to soft-delete (owned by one of those, or by nobody live, or a proof's own name under a test owner): ${junkTenants.length}`);
  junkTenants.forEach((t) =>
    console.log(`  - ${t.type.padEnd(11)} ${t.name}${ownedByGood.has(t.id) ? `   (kept owner <${who(ownerOf.get(t.id))}>, junk NAME)` : ""}`)
  );
  console.log(`crews to soft-delete (led by nobody live, or a proof's own name under a test leader): ${junkCrews.length}`);
  junkCrews.forEach((c) => console.log(`  - ${c.name} · ${c.city}  (leader <${who(c.leader_id)}>${liveGood.has(c.leader_id) ? ", junk NAME" : ", not live"})`));
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
    const keptCrews = crews.filter((c) => !junkCrewIds.has(c.id));
    console.log(`CREWS KEPT: ${keptCrews.length}`);
    keptCrews.forEach((c) => console.log(`    - ${c.name} · ${c.city}  leader <${who(c.leader_id)}>`));
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
  const cids = junkCrews.map((c) => c.id);
  if (cids.length) {
    /* what hangs off a crew first, the crew last — the same order as businesses.
       `crew_practice_people` carries no crew_id (it hangs off the practice), so
       it goes with its practice rather than being named here. */
    for (const table of ["crew_practices", "crew_header_photos", "crew_contacts", "follows", "crew_members"]) {
      counts[table] = await patchIn(table, "crew_id", cids);
    }
    counts.crews = await patchIn("crews", "id", cids);
  }
  if (pids.length) counts.profiles = await patchIn("profiles", "id", pids);
  console.log("\napplied:", JSON.stringify(counts));
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
