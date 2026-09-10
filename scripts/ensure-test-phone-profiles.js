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
 * SINCE 9 SEP 2026 (R14) a studio needs a verified AND SUBSCRIBED organization,
 * so this also grants the owner a year's subscription — the same row an admin's
 * grant writes, at zero, because nothing is charged yet. Without it every
 * phone-number proof that creates a studio is refused in words.
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
  { phone: "919999999999", full_name: "Proof Owner (test number)", role: "org", city: "Pune", styles: [], socials: [{ platform: "Instagram", url: "https://instagram.com/danceos-proof-owner" }], verified: true },
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
    const fields = { full_name: w.full_name, role: w.role, city: w.city, styles: w.styles, socials: w.socials, deleted_at: null, verified_at: w.verified ? new Date().toISOString() : null, updated_by: u.id };
    const patched = await call("PATCH", `${BASE}/rest/v1/profiles?id=eq.${u.id}`, fields);
    if (Array.isArray(patched) && patched.length) {
      console.log(`+${w.phone}: profile set — ${w.role}${w.verified ? " · verified" : ""} (${u.id})`);
    } else {
      await call("POST", `${BASE}/rest/v1/profiles`, { id: u.id, created_by: u.id, ...fields });
      console.log(`+${w.phone}: profile created — ${w.role}${w.verified ? " · verified" : ""} (${u.id})`);
    }

    /* R14: the subscription half of the studio gate. Idempotent — a live row is
       left alone rather than stacked on, so rerunning this does not extend it. */
    if (w.role === "org") {
      const live = await call("GET", `${BASE}/rest/v1/org_plans?org_id=eq.${u.id}&deleted_at=is.null&ended_at=is.null&select=id,until`);
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
      if (Array.isArray(live) && live.some((r) => r.until >= today)) {
        console.log(`+${w.phone}: subscription already live until ${live[0].until}`);
      } else {
        const until = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
        await call("POST", `${BASE}/rest/v1/org_plans`, {
          org_id: u.id, plan: "granted", until, amount_inr: 0,
          note: "Granted by ensure-test-phone-profiles (R14) — nothing charged",
          created_by: u.id, updated_by: u.id,
        });
        console.log(`+${w.phone}: subscription granted until ${until} (nothing charged)`);
      }
    }
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
