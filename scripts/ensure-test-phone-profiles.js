/* The two Supabase TEST PHONE NUMBERS (+919999999999, +918888888888) are how
 * the older proof scripts and e2e/paid-webhook.spec.ts sign in without an
 * inbox. Since 8 Sep 2026 a business is public only under a VERIFIED
 * organization, and only a user books a seat — so the two accounts must hold
 * the right kind of profile: 9999… is the OWNER (an organization, verified),
 * 8888… is the LEARNER (a user with a style). This makes it so, idempotently:
 * it restores a soft-deleted row, creates a missing one, and sets role, city,
 * styles and the tick through the service role (the only key the guards let
 * write these). Run it once after a cleanup, or whenever a phone-number proof
 * says "finish onboarding first".
 *
 * 9 Sep 2026 (R14): a studio needs a VERIFIED organization, so the owner is
 * stamped verified here. 10 Sep 2026: the subscription is per STUDIO now (one
 * `subscriptions` row each, ₹1,200 a month through Cashfree), so there is nothing
 * to grant per organization any more — every proof subscribes the studio it
 * makes (Subscribe-Studio in the .ps1 files) and deletes it afterwards.
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

const WANTED = [
  { phone: "919999999999", full_name: "Proof Owner (test number)", role: "org", city: "Pune", styles: [], socials: [{ platform: "Instagram", url: "https://instagram.com/danceos-proof-owner" }], verified: true, gstin: "27PHONE9999A1Z5" },
  { phone: "918888888888", full_name: "Proof Learner (test number)", role: "user", city: "Pune", styles: ["Hip-Hop"], socials: [], verified: false },
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

(async () => {
  for (const w of WANTED) {
    const u = await findUserByPhone(w.phone);
    if (!u) { console.log(`+${w.phone}: no auth user yet — sign in with the test number once, then rerun`); continue; }
    /* 11 Sep 2026: the owner also carries a verified GST number — an event needs one */
    const fields = { full_name: w.full_name, role: w.role, city: w.city, styles: w.styles, socials: w.socials, deleted_at: null, verified_at: w.verified ? new Date().toISOString() : null, gstin: w.gstin ?? null, gstin_verified_at: w.gstin ? new Date().toISOString() : null, updated_by: u.id };
    const patched = await call("PATCH", `${BASE}/rest/v1/profiles?id=eq.${u.id}`, fields);
    if (Array.isArray(patched) && patched.length) {
      console.log(`+${w.phone}: profile set — ${w.role}${w.verified ? " · verified" : ""} (${u.id})`);
    } else {
      await call("POST", `${BASE}/rest/v1/profiles`, { id: u.id, created_by: u.id, ...fields });
      console.log(`+${w.phone}: profile created — ${w.role}${w.verified ? " · verified" : ""} (${u.id})`);
    }

    /* 10 Sep 2026: a subscription is per STUDIO now (`subscriptions`, kind 'studio'),
       not per organization, so there is nothing to grant here — each proof
       subscribes the studio it makes (Subscribe-Studio) and deletes it after. */
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
