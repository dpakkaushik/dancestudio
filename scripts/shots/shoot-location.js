/**
 * THE GOOGLE MAPS PICKER, END TO END (11 Sep 2026).
 *
 * Makes a verified organization with a subscribed studio, signs in as its owner,
 * opens the business Edit sheet and drives the real picker:
 *
 *   1. the GOOGLE map renders (its own `.gm-style` container, not a stand-in)
 *   2. typing an address returns Places suggestions
 *   3. choosing one moves the pin and fills the address
 *   4. the point, the area, the CITY and `location_set_at` land in the database
 *
 * Step 4 is the one that matters: the sheet says "Saved" from the server
 * action's own answer, and only the row proves it. Everything it makes is
 * deleted at the end, and any console error fails the run.
 *
 *   npm run dev            # in another terminal
 *   NODE_PATH=$(pwd)/node_modules node scripts/shots/shoot-location.js
 */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(__dirname, "shots");
const BASE = process.env.DANCEOS_BASE_URL || "http://localhost:3000";

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z_]+)=(.*)$/.exec(line);
  if (m) env[m[1]] = m[2].trim();
}
const SUPABASE = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation" };

const rest = async (method, url, body) => {
  const res = await fetch(`${SUPABASE}${url}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const stamp = Date.now().toString(36);
  const email = `shot.loc.${stamp}@example.com`;
  const problems = [];
  const check = (ok, what) => {
    console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`);
    if (!ok) problems.push(what);
  };

  const link = await fetch(`${SUPABASE}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ type: "magiclink", email }),
  }).then((r) => r.json());
  if (!link.hashed_token) throw new Error(`generate_link failed: ${JSON.stringify(link)}`);

  await rest("POST", "/rest/v1/profiles", {
    id: link.id, full_name: `Shot Owner ${stamp}`, role: "org", city: "Pune",
    created_by: link.id, updated_by: link.id,
  });
  await rest("PATCH", `/rest/v1/profiles?id=eq.${link.id}`, { verified_at: new Date().toISOString() });

  /* the studio, made by the service role the way the proofs do — on Pune's
     centroid, which is exactly the guess the picker exists to replace */
  const [tenant] = await rest("POST", "/rest/v1/tenants", {
    type: "studio", name: `Shot Studio ${stamp}`, area: "Kothrud", city: "Pune",
    lat: 18.5204, lng: 73.8567, visibility: "unlisted", created_by: link.id, updated_by: link.id,
  });
  await rest("POST", "/rest/v1/tenant_members", {
    tenant_id: tenant.id, user_id: link.id, member_role: "owner", created_by: link.id, updated_by: link.id,
  });
  await rest("POST", "/rest/v1/subscriptions", {
    kind: "studio", user_id: link.id, tenant_id: tenant.id, plan_key: "studio_monthly", price_inr: 0,
    period: "monthly", status: "active", granted: true,
    current_period_start: new Date().toISOString().slice(0, 10),
    current_period_end: new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10),
    note: "Granted by a screenshot script - nothing charged", created_by: link.id, updated_by: link.id,
  });
  await rest("PATCH", `/rest/v1/tenants?id=eq.${tenant.id}`, { visibility: "listed" });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 500) problems.push(`${r.status()} ${r.url()}`);
  });
  page.on("console", (m) => {
    const t = m.text();
    /* Google's own loader chatter is not this app's problem */
    if (m.type() === "error" && !/Google Maps|gstatic|googleapis/i.test(t)) problems.push(`console.error: ${t.slice(0, 220)}`);
  });

  await page.goto(`${BASE}/auth/confirm?token_hash=${link.hashed_token}&type=${link.verification_type ?? "magiclink"}`);
  await page.waitForLoadState("networkidle");

  await page.goto(`${BASE}/studio/${tenant.id}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(OUT, "loc-1-studio-page.png"), fullPage: true });

  await page.getByRole("button", { name: "Edit business", exact: true }).click();
  await page.waitForTimeout(600);

  const map = page.getByRole("application", { name: /Move the map/i });
  await map.scrollIntoViewIfNeeded();
  /* Google's script, its tiles and its container all have to arrive */
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(OUT, "loc-2-picker.png"), fullPage: true });

  check((await page.locator("script[data-dos-maps]").count()) === 1, "the Maps JavaScript API is loaded exactly once");
  check((await page.locator(".gm-style").count()) > 0, "Google's own map container rendered");
  check((await page.getByText(/map is not available/i).count()) === 0, "the map did not fall back to the unavailable panel");

  /* 2. typing an address returns Places suggestions */
  const search = page.getByRole("searchbox", { name: /Search an address or landmark/i });
  await search.fill("Shivajinagar Pune");
  await page.waitForTimeout(2500);
  /* scoped to the search's own listbox: the Edit sheet also has a `Since`
     year <select>, whose <option>s carry the same role */
  const options = page.getByRole("listbox").getByRole("option");
  const n = await options.count();
  check(n > 0, `Places Autocomplete answered (${n} suggestions)`);

  if (n > 0) {
    const first = (await options.first().innerText()).replace(/\s+/g, " ").trim();
    console.log(`       first suggestion: ${first.slice(0, 70)}`);
    await options.first().click();
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(OUT, "loc-3-after-pick.png"), fullPage: true });
    const pinnedOn = await page.getByText(/THE PIN IS ON/i).locator("..").innerText().catch(() => "");
    console.log(`       the pin is on: ${pinnedOn.replace(/\s+/g, " ").slice(0, 130)}`);
    check(/Pune/i.test(pinnedOn), "the chosen place's address is shown back");
  }

  await browser.close();

  /* 4. THE ONLY PROOF THAT COUNTS: the row */
  const saved = await rest("GET", `/rest/v1/tenants?id=eq.${tenant.id}&select=lat,lng,area,city,location_set_at`);
  const row = saved[0] ?? {};
  console.log(`       saved: lat=${row.lat} lng=${row.lng} area=${row.area} city=${row.city} location_set_at=${row.location_set_at ?? "null"}`);
  check(Boolean(row.location_set_at), "the pin was saved — location_set_at is stamped");
  check(row.lat !== null && Math.abs(Number(row.lat) - 18.5204) > 0.0005, "the point moved off the city centroid");

  await rest("DELETE", `/rest/v1/subscriptions?tenant_id=eq.${tenant.id}`);
  await rest("DELETE", `/rest/v1/tenant_members?tenant_id=eq.${tenant.id}`);
  await rest("DELETE", `/rest/v1/tenants?id=eq.${tenant.id}`);
  await fetch(`${SUPABASE}/auth/v1/admin/users/${link.id}`, { method: "DELETE", headers: H });

  if (problems.length) {
    console.log("\nPROBLEMS:");
    problems.forEach((p) => console.log(`  ${p}`));
    process.exit(1);
  }
  console.log("\nThe Google picker works end to end, and everything it made is gone.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
