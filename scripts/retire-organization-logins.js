/* RETIRE THE ORGANIZATION LOGINS (26 Sep 2026) — the data half of
 * `20260926120000_an_organization_is_a_business.sql`, kept OUT of the
 * migration because it is a production sweep and this repo's standing rule is
 * that the list of what goes — and what STAYS — sits in front of the user
 * before it runs.
 *
 * The user: "delete all studios linked to organizations owned studios. delete
 * all existing organizations just give one verified one to artist deepak
 * kaushik."
 *
 * So, in order, all SOFT (deleted_at, one UPDATE back):
 *   1. every business — studio, hosting row, anything — OWNED by a profile
 *      whose role is 'org', with the classes, sessions, events, rooms and
 *      memberships beneath it (the cleanup script's pattern);
 *   2. every profile whose role is 'org' (its auth account stays; a soft-deleted
 *      profile cannot sign into anything — Home sends it to onboarding, which no
 *      longer offers "Organization");
 *   3. then ONE organization business is created for Deepak Kaushik, owner seat
 *      and all, with a placeholder GST number stamped verified through the
 *      service role (the shape `verify_business_gstin` accepts: three letters,
 *      five digits).
 *
 *   node scripts/retire-organization-logins.js              # dry run: what goes, what stays, what is made
 *   node scripts/retire-organization-logins.js --apply      # writes
 *
 * Needs the service role key. ⚠ Run AFTER the migration is applied — step 3
 * inserts a `gstin` column the migration adds.
 */
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const val = (k) => (env.split(/\r?\n/).find((l) => l.startsWith(k + "=")) || "").split("=").slice(1).join("=").trim();
const BASE = val("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE = val("SUPABASE_SERVICE_ROLE_KEY");
if (!BASE || !SERVICE) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be in .env.local");
const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", "User-Agent": "danceos-retire/1.0", Prefer: "return=representation" };
const APPLY = process.argv.includes("--apply");

/* THE ONE ORGANIZATION THAT IS MADE (the user's word): Deepak Kaushik, an artist */
const DEEPAK = "5d06589f-5712-4e4d-ac61-6436364c299f";
const ORG_NAME = "Deepak Kaushik";
const ORG_CITY = "Gurugram";
const ORG_GSTIN = "DKO00001"; // three letters, five digits — the placeholder shape verify_business_gstin keeps

async function call(method, url, body, extraHeaders) {
  const res = await fetch(url, { method, headers: { ...H, ...(extraHeaders || {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
/* PAGED: PostgREST answers at most 1,000 rows to one GET whatever the filter says */
async function getAll(p) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = await call("GET", `${BASE}/rest/v1/${p}`, null, { Range: `${from}-${from + 999}` });
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
async function softDelete(table, ids) {
  for (const part of chunk(ids, 80)) {
    await call("PATCH", `${BASE}/rest/v1/${table}?id=in.(${part.join(",")})&deleted_at=is.null`, { deleted_at: new Date().toISOString() });
  }
}
async function users() {
  const out = [];
  for (let page = 1; ; page++) {
    const r = await fetch(`${BASE}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: H });
    const j = await r.json();
    out.push(...(j.users || []));
    if (!j.users || j.users.length < 200) break;
  }
  return Object.fromEntries(out.map((u) => [u.id, u.email || u.phone || "(none)"]));
}

(async () => {
  const email = await users();
  const orgs = await getAll("profiles?select=id,full_name,role,city&role=eq.org&deleted_at=is.null&order=created_at.asc");
  const orgIds = orgs.map((p) => p.id);
  const seats = orgIds.length ? await getAll(`business_members?select=business_id,user_id,member_role&member_role=eq.owner&deleted_at=is.null&user_id=in.(${orgIds.join(",")})`) : [];
  const bizIds = [...new Set(seats.map((s) => s.business_id))];
  const biz = bizIds.length ? await getAll(`businesses?select=id,name,type,visibility,city&deleted_at=is.null&id=in.(${bizIds.join(",")})`) : [];
  const under = async (table, col = "business_id") => (bizIds.length ? await getAll(`${table}?select=id&deleted_at=is.null&${col}=in.(${bizIds.join(",")})`) : []);
  const [classes, sessions, events, rooms, memberships, teamSeats] = await Promise.all([
    under("classes"), under("class_sessions"), under("events"), under("rooms"), under("memberships"), under("business_members"),
  ]);
  const kept = await getAll("profiles?select=id,full_name,role,city&role=eq.user&deleted_at=is.null&order=created_at.asc");
  const deepak = kept.find((p) => p.id === DEEPAK);
  if (!deepak) throw new Error("Deepak Kaushik's profile was not found among the live users");

  console.log("ORGANIZATION LOGINS TO RETIRE:");
  for (const p of orgs) console.log(`  ${p.full_name.padEnd(30)} ${(email[p.id] || "?").padEnd(45)} ${p.id}`);
  console.log(`\nBUSINESSES THEY OWN, ALL GOING (${biz.length}):`);
  for (const b of biz) console.log(`  ${b.type.padEnd(11)} ${b.visibility.padEnd(8)} ${b.name.padEnd(30)} ${b.city ?? ""}`);
  console.log(`\nBENEATH THEM: ${classes.length} classes · ${sessions.length} sessions · ${events.length} events · ${rooms.length} rooms · ${memberships.length} memberships · ${teamSeats.length} team seats`);
  console.log(`\nWHAT STAYS: ${kept.length} user accounts, every business they own untouched`);
  console.log(`\nMADE: an organization "${ORG_NAME}" in ${ORG_CITY}, owned by ${deepak.full_name} (${email[DEEPAK]}), GST ${ORG_GSTIN} stamped verified — private until its ₹5,000 mandate is live`);

  if (!APPLY) { console.log("\nDRY RUN — nothing written. Add --apply to run it."); return; }

  const now = new Date().toISOString();
  await softDelete("classes", classes.map((r) => r.id));
  await softDelete("class_sessions", sessions.map((r) => r.id));
  await softDelete("events", events.map((r) => r.id));
  await softDelete("rooms", rooms.map((r) => r.id));
  await softDelete("memberships", memberships.map((r) => r.id));
  await softDelete("business_members", teamSeats.map((r) => r.id));
  await softDelete("businesses", bizIds);
  await softDelete("profiles", orgIds);
  console.log(`\nRETIRED ${orgIds.length} organization logins and ${bizIds.length} businesses at ${now}`);

  const [org] = await call("POST", `${BASE}/rest/v1/businesses`, {
    type: "org", name: ORG_NAME, city: ORG_CITY, visibility: "unlisted",
    gstin: ORG_GSTIN, gstin_verified_at: now,
    created_by: DEEPAK, updated_by: DEEPAK,
  });
  await call("POST", `${BASE}/rest/v1/business_members`, { business_id: org.id, user_id: DEEPAK, member_role: "owner", created_by: DEEPAK, updated_by: DEEPAK });
  console.log(`MADE   organization ${org.id} "${org.name}" — owner ${deepak.full_name}, GST verified`);
})().catch((e) => { console.error(e.message); process.exit(1); });
