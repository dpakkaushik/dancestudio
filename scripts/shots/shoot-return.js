/**
 * RETURN A PASS WITHIN 7 DAYS (6 Oct 2026, the user's decision 3) — driven.
 *
 * `return_membership_pass` was proven 26/26 in a rolled-back dry run (a paid pass
 * files a pending refund, a part-used or week-old one is refused in words). This
 * presses the button a holder actually sees, on a FREE pass so no money moves:
 * a throwaway account takes a demo studio's free membership, opens Memberships,
 * presses "Return it", confirms, and the pass is read back cancelled — with its
 * place back on sale and no refund row (there was nothing paid).
 *
 *   NODE_PATH=$(pwd)/node_modules DANCEOS_BASE_URL=http://localhost:3100 \
 *     node scripts/shots/shoot-return.js
 */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..", "..");
const BASE = process.env.DANCEOS_BASE_URL || "http://localhost:3000";
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z_]+)=(.*)$/.exec(line);
  if (m) env[m[1]] = m[2].trim();
}
const SUPABASE = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = "Shoot-passw0rd!";
const UA = "danceos-proof";
const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation", "User-Agent": UA };

const call = async (method, url, body, headers = H) => {
  const res = await fetch(url.startsWith("http") ? url : `${SUPABASE}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : null };
};

let pass = 0;
let fail = 0;
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (ok) pass += 1;
  else fail += 1;
};

(async () => {
  const stamp = Date.now().toString(36);
  const email = `shot.return.${stamp}@example.com`;
  let userId = null;
  const browser = await chromium.launch();
  try {
    /* a FREE membership on a listed studio — the demo world sells two */
    const free = await call("GET", "/rest/v1/memberships?select=id,name,total_count,business_id,businesses!inner(name,visibility,deleted_at)&price_inr=eq.0&deleted_at=is.null&businesses.visibility=eq.listed&businesses.deleted_at=is.null&limit=1");
    if (!free.ok || !free.body || !free.body[0]) throw new Error(`no free membership to take: ${free.status} ${JSON.stringify(free.body)}`);
    const m = free.body[0];
    const soldOf = async () => {
      const r = await call("GET", `/rest/v1/membership_passes?select=id&membership_id=eq.${m.id}&status=in.(active,used_up)&deleted_at=is.null`);
      return (r.body || []).length;
    };
    const soldBefore = await soldOf();

    const made = await call("POST", "/auth/v1/admin/users", { email, password: PASSWORD, email_confirm: true });
    if (!made.ok) throw new Error(`create user: ${made.status}`);
    userId = made.body.id;
    const prof = await call("POST", "/rest/v1/profiles", { id: userId, full_name: `Shot Returner ${stamp}`, role: "user", city: "Gurugram", styles: ["Hip-Hop"], created_by: userId, updated_by: userId });
    if (!prof.ok) throw new Error(`profile: ${prof.status} ${JSON.stringify(prof.body)}`);
    const tok = await call("POST", "/auth/v1/token?grant_type=password", { email, password: PASSWORD }, { apikey: ANON, "Content-Type": "application/json", "User-Agent": UA });
    const U = { apikey: ANON, Authorization: `Bearer ${tok.body.access_token}`, "Content-Type": "application/json", "User-Agent": UA };
    const bought = await call("POST", "/rest/v1/rpc/buy_membership", { p_membership_id: m.id }, U);
    check(bought.ok && bought.body && bought.body.status === "active", `the free pass "${m.name}" is taken and ACTIVE at once (${bought.status} ${bought.body && bought.body.status})`);
    const passId = bought.body && bought.body.id;
    check((await soldOf()) === soldBefore + 1, "…and counts as sold");

    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${BASE}/login/email`, { waitUntil: "networkidle" });
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });

    await page.goto(`${BASE}/memberships`, { waitUntil: "networkidle" });
    const btn = page.getByTestId("return-pass");
    await btn.first().waitFor({ timeout: 15000 }).catch(() => {});
    check((await btn.count()) === 1, "the pass offers Return it on the holder's own Memberships desk");
    await btn.first().click();
    const dlg = page.getByRole("alertdialog", { name: `Return ${m.name}?` });
    await dlg.waitFor({ timeout: 10000 }).catch(() => {});
    check((await dlg.count()) === 1, "…and asks first");
    check(/This cannot be undone/.test((await dlg.innerText().catch(() => "")) || ""), "…saying it cannot be undone (and naming no money, because none was paid)");
    await dlg.getByRole("button", { name: "Return it" }).click();
    await dlg.waitFor({ state: "detached", timeout: 15000 }).catch(() => {});

    const after = await call("GET", `/rest/v1/membership_passes?id=eq.${passId}&select=status`);
    check(Array.isArray(after.body) && after.body[0] && after.body[0].status === "cancelled", `the pass is read back CANCELLED (${after.body && after.body[0] && after.body[0].status})`);
    check((await soldOf()) === soldBefore, "…and its place is back on sale");
    const ref = await call("GET", `/rest/v1/orders?membership_pass_id=eq.${passId}&select=id`);
    check(Array.isArray(ref.body) && ref.body.length === 0, "…and no order or refund was made for a free pass");
    await page.reload({ waitUntil: "networkidle" });
    check((await page.getByTestId("return-pass").count()) === 0, "the desk no longer offers Return it");
    check(errors.length === 0, `no page error${errors.length ? ": " + errors.slice(0, 2).join(" | ") : ""}`);
  } catch (e) {
    check(false, `threw: ${e.message}`);
  } finally {
    await browser.close().catch(() => {});
    if (userId) {
      const d = await call("DELETE", `/auth/v1/admin/users/${userId}`);
      if (!d.ok) { fail += 1; console.log(`FAIL  cleanup: the throwaway account was not deleted (${d.status} ${JSON.stringify(d.body)})`); }
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
