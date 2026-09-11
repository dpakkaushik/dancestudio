/**
 * Look at a VERIFIED ORGANIZATION's three changed screens for real (11 Sep 2026):
 *
 *   1. Home — no "Verified organization" card any more, and an Events tile in
 *      Studio Tools (the user: "after verification I don't need this box";
 *      "I can't see events on my org page — where is it?").
 *   2. /business with the New-studio sheet open — the map picker is IN the sheet
 *      ("wherever we are giving an address there should be a location picker").
 *   3. Discover as a map — the shelf drawn as pins.
 *
 * Makes a verified organization with a subscribed studio, signs in as its owner,
 * shoots and ASSERTS each, and deletes everything it made. Fails on any console
 * error, the way shoot-admin.js does.
 *
 *   npm run dev            # in another terminal
 *   NODE_PATH=$(pwd)/node_modules node scripts/shots/shoot-org.js
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
  const email = `shot.org.${stamp}@example.com`;
  const problems = [];
  const check = (ok, what) => {
    console.log(`  ${ok ? "ok " : "FAIL"} ${what}`);
    if (!ok) problems.push(what);
  };

  const link = await fetch(`${SUPABASE}/auth/v1/admin/generate_link`, { method: "POST", headers: H, body: JSON.stringify({ type: "magiclink", email }) }).then((r) => r.json());
  if (!link.hashed_token) throw new Error(`generate_link failed: ${JSON.stringify(link)}`);

  await rest("POST", "/rest/v1/profiles", { id: link.id, full_name: `Shot Org ${stamp}`, role: "org", city: "Pune", created_by: link.id, updated_by: link.id });
  await rest("PATCH", `/rest/v1/profiles?id=eq.${link.id}`, { verified_at: new Date().toISOString() });
  const [tenant] = await rest("POST", "/rest/v1/tenants", { type: "studio", name: `Shot Studio ${stamp}`, area: "Kothrud", city: "Pune", lat: 18.5204, lng: 73.8567, visibility: "unlisted", created_by: link.id, updated_by: link.id });
  await rest("POST", "/rest/v1/tenant_members", { tenant_id: tenant.id, user_id: link.id, member_role: "owner", created_by: link.id, updated_by: link.id });
  await rest("POST", "/rest/v1/subscriptions", {
    kind: "studio", user_id: link.id, tenant_id: tenant.id, plan_key: "studio_monthly", price_inr: 0, period: "monthly", status: "active", granted: true,
    current_period_start: new Date().toISOString().slice(0, 10), current_period_end: new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10),
    note: "Granted by a screenshot script - nothing charged", created_by: link.id, updated_by: link.id,
  });
  await rest("PATCH", `/rest/v1/tenants?id=eq.${tenant.id}`, { visibility: "listed" });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("response", (r) => { if (r.status() >= 500) problems.push(`${r.status()} ${r.url()}`); });
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console.error: ${m.text().slice(0, 300)}`); });

  await page.goto(`${BASE}/auth/confirm?token_hash=${link.hashed_token}&type=${link.verification_type ?? "magiclink"}`);
  await page.waitForLoadState("networkidle");

  /* 1. Home */
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(OUT, "org-1-home.png"), fullPage: true });
  check((await page.locator('[role="status"][aria-label^="Verification:"]').count()) === 0, "Home: no Verified-organization card once verified");
  check((await page.getByLabel("Verified").count()) >= 1, "Home: the tick is on the name");
  check((await page.getByRole("link", { name: "Events", exact: true }).count()) === 1, "Home: an Events tile in Studio Tools");
  const eventsHref = await page.getByRole("link", { name: "Events", exact: true }).getAttribute("href");
  check(/^\/business\/[0-9a-f-]+\/events$/.test(eventsHref ?? ""), `Home: Events tile opens the organization's desk (${eventsHref})`);

  /* 2. the hub: the studio above was made on Pune's centroid and never placed,
        so it must be ASKED for its pin — and the ask goes away once placed */
  await page.goto(`${BASE}/business`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(OUT, "org-2a-hub-nudge.png"), fullPage: true });
  check((await page.getByText(/Not on the map yet/).count()) === 1, "Hub: a studio on its city centroid is asked for its pin");
  check((await page.getByRole("link", { name: /Put .* on the map/ }).count()) === 1, "Hub: the ask carries the door to the map");

  await rest("PATCH", `/rest/v1/tenants?id=eq.${tenant.id}`, { location_set_at: new Date().toISOString() });
  await page.reload({ waitUntil: "networkidle" });
  check((await page.getByText(/Not on the map yet/).count()) === 0, "Hub: the ask is gone once the studio is placed");
  await rest("PATCH", `/rest/v1/tenants?id=eq.${tenant.id}`, { location_set_at: null });

  /* 3. the New-studio sheet, with the map in it */
  await page.goto(`${BASE}/business`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add studio" }).first().click();
  await page.waitForTimeout(800);
  const sheetMap = page.getByRole("application", { name: /Move the map/i });
  await sheetMap.scrollIntoViewIfNeeded().catch(() => undefined);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, "org-2-add-studio.png"), fullPage: true });
  check((await sheetMap.count()) === 1, "Add studio: the map picker is in the sheet");
  check((await page.locator('input[name="lat"]').count()) === 1 && (await page.locator('input[name="lng"]').count()) === 1, "Add studio: the pin rides in as lat/lng fields");
  check((await page.locator('img[src*="tile.openstreetmap.org"]').count()) > 0, "Add studio: tiles rendered");

  /* 4. Discover as a map */
  await page.goto(`${BASE}/discover?city=Pune&tab=studios&view=map`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, "org-3-discover-map.png"), fullPage: true });
  check((await page.getByRole("application", { name: /on the map/i }).count()) === 1, "Discover: the map view draws");
  check((await page.getByRole("link", { name: "Show as a list" }).count()) === 1, "Discover: the toggle reads List while on the map");
  await page.goto(`${BASE}/discover?city=Pune&tab=studios`, { waitUntil: "networkidle" });
  check((await page.getByRole("link", { name: "Show on a map" }).count()) === 1, "Discover: the toggle reads Map while on the list");

  await browser.close();

  await rest("DELETE", `/rest/v1/subscriptions?tenant_id=eq.${tenant.id}`);
  await rest("DELETE", `/rest/v1/tenant_members?tenant_id=eq.${tenant.id}`);
  await rest("DELETE", `/rest/v1/tenants?id=eq.${tenant.id}`);
  await fetch(`${SUPABASE}/auth/v1/admin/users/${link.id}`, { method: "DELETE", headers: H });

  if (problems.length) {
    console.log("\nPROBLEMS:");
    problems.forEach((p) => console.log(`  ${p}`));
    process.exit(1);
  }
  console.log("\nAll three screens shot clean, and everything made is gone.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
