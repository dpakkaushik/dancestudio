/* The two Supabase TEST PHONE NUMBERS (+919999999999, +918888888888) are how
 * the older proof scripts and e2e/paid-webhook.spec.ts sign in without an
 * inbox. The two accounts must hold the right kind of profile: 9999… is the
 * OWNER (a USER who opens studios and owns one organization), 8888… is the
 * LEARNER (a user with a style). This makes it so, idempotently: it restores a
 * soft-deleted row, creates a missing one, and sets role, city and styles
 * through the service role (the only key the guards let write these). Run it
 * once after a cleanup, or whenever a phone-number proof says "finish
 * onboarding first".
 *
 * 26 Sep 2026 (20260926090000 + 20260926120000): THE ORGANIZATION LOGIN IS
 * RETIRED. Any person opens a studio, and an organization is a `businesses`
 * row of type `org` a person owns — with a GST number OF ITS OWN and its own
 * mandate. So the owner is role `user` now (it was `org`, verified, carrying a
 * GST number on its profile), and it additionally owns ONE org business,
 * "Proof Owner Org" in Pune, with a placeholder GST stamped verified and a
 * granted, active `org` subscription — which is what makes it PUBLIC
 * (org_is_public) so the event proofs and paid-webhook.spec.ts can host on it.
 *
 * 10 Sep 2026: a studio's subscription is per STUDIO (one `subscriptions` row
 * each, ₹1,200 a month through Cashfree), so nothing is granted per account —
 * every proof subscribes the studio it makes (Subscribe-Studio in the .ps1
 * files) and deletes it afterwards.
 *
 *   node scripts/ensure-test-phone-profiles.js
 */
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const val = (k) => (env.split(/\r?\n/).find((l) => l.startsWith(k + "=")) || "").split("=").slice(1).join("=").trim();
const BASE = val("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE = val("SUPABASE_SERVICE_ROLE_KEY");
if (!BASE || !SERVICE) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be in .env.local");
const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", "User-Agent": "danceos-proof-setup/1.0", Prefer: "return=representation" };

/* the owner's ONE organization business (26 Sep 2026) */
const OWNER_ORG = { name: "Proof Owner Org", city: "Pune", gstin: "PRF00001" }; // three letters, five digits — the placeholder shape verify_business_gstin keeps; unique across businesses

const WANTED = [
  { phone: "919999999999", full_name: "Proof Owner (test number)", role: "user", city: "Pune", styles: ["Hip-Hop"], socials: [{ platform: "Instagram", url: "https://instagram.com/danceos-proof-owner" }], org: OWNER_ORG },
  { phone: "918888888888", full_name: "Proof Learner (test number)", role: "user", city: "Pune", styles: ["Hip-Hop"], socials: [] },
];

async function call(method, url, body) {
  const res = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function findUserByPhone(phone) {
  for (let page = 1; page < 50; page++) {
    const r = await call("GET", `${BASE}/auth/v1/admin/users?page=${page}&per_page=200`);
    const hit = (r.users || []).find((u) => (u.phone || "").replace(/^\+/, "") === phone);
    if (hit) return hit;
    if ((r.users || []).length < 200) break;
  }
  return null;
}

/* ONE org business the account OWNS, made the way retire-organization-logins.js
   makes Deepak's: the row, the owner seat, the GST stamped verified, the granted
   mandate. Idempotent — an existing live one is kept and only completed. */
async function ensureOwnerOrg(userId, org) {
  const seats = await call("GET", `${BASE}/rest/v1/business_members?user_id=eq.${userId}&member_role=eq.owner&deleted_at=is.null&select=business_id,businesses!inner(id,name,type,gstin,gstin_verified_at,deleted_at)`);
  let row = (seats || []).map((s) => s.businesses).find((b) => b && b.type === "org" && !b.deleted_at);
  const now = new Date().toISOString();
  if (!row) {
    [row] = await call("POST", `${BASE}/rest/v1/businesses`, {
      type: "org", name: org.name, city: org.city, visibility: "unlisted",
      gstin: org.gstin, gstin_verified_at: now,
      created_by: userId, updated_by: userId,
    });
    await call("POST", `${BASE}/rest/v1/business_members`, { business_id: row.id, user_id: userId, member_role: "owner", created_by: userId, updated_by: userId });
    console.log(`   org business created — "${org.name}" (${row.id}), GST ${org.gstin} verified`);
  } else if (!row.gstin_verified_at) {
    await call("PATCH", `${BASE}/rest/v1/businesses?id=eq.${row.id}`, { gstin: row.gstin ?? org.gstin, gstin_verified_at: now, updated_by: userId });
    console.log(`   org business "${row.name}" (${row.id}) — GST stamped verified`);
  } else {
    console.log(`   org business "${row.name}" (${row.id}) — already there, GST verified`);
  }
  /* its own mandate: the row admin_grant_subscription writes — granted, active, ₹0 */
  const live = await call("GET", `${BASE}/rest/v1/subscriptions?business_id=eq.${row.id}&kind=eq.org&status=eq.active&deleted_at=is.null&select=id`);
  if (!live || live.length === 0) {
    await call("POST", `${BASE}/rest/v1/subscriptions`, {
      kind: "org", user_id: userId, business_id: row.id, plan_key: "org_monthly", price_inr: 0, period: "monthly", status: "active",
      current_period_start: new Date().toISOString().slice(0, 10),
      current_period_end: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      granted: true, note: "Granted by ensure-test-phone-profiles.js — nothing charged", created_by: userId, updated_by: userId,
    });
    console.log(`   org subscription granted (active, ₹0) — the organization is public`);
  }
  return row;
}

(async () => {
  for (const w of WANTED) {
    const u = await findUserByPhone(w.phone);
    if (!u) { console.log(`+${w.phone}: no auth user yet — sign in with the test number once, then rerun`); continue; }
    /* 26 Sep 2026: no verified_at, no gstin on a PROFILE — both belonged to the
       retired organization login; a person's profile carries neither */
    const fields = { full_name: w.full_name, role: w.role, city: w.city, styles: w.styles, socials: w.socials, deleted_at: null, updated_by: u.id };
    const patched = await call("PATCH", `${BASE}/rest/v1/profiles?id=eq.${u.id}`, fields);
    if (Array.isArray(patched) && patched.length) {
      console.log(`+${w.phone}: profile set — ${w.role} (${u.id})`);
    } else {
      await call("POST", `${BASE}/rest/v1/profiles`, { id: u.id, created_by: u.id, ...fields });
      console.log(`+${w.phone}: profile created — ${w.role} (${u.id})`);
    }
    if (w.org) await ensureOwnerOrg(u.id, w.org);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
