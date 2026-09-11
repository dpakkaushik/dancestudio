/**
 * Look at the LOCATION PICKER for real (11 Sep 2026).
 *
 * Makes a verified organization, gives it a subscribed studio, signs in as its
 * owner, opens the business Edit sheet, and shoots the map — then drags the map
 * and shoots it again, so the tiles, the pin and the reverse-geocoded address
 * are all seen rather than assumed. Everything it makes is deleted at the end.
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

  /* the studio, made by the service role the way the proofs do — Pune's
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
  const problems = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 500) problems.push(`${r.status()} ${r.url()}`);
  });
  /* a console warning is what Next's dev overlay counts as an "Issue", and a
     screenshot cannot tell you which one — so they are read here */
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(`console.${m.type()}: ${m.text().slice(0, 300)}`);
  });

  await page.goto(`${BASE}/auth/confirm?token_hash=${link.hashed_token}&type=${link.verification_type ?? "magiclink"}`);
  await page.waitForLoadState("networkidle");

  await page.goto(`${BASE}/studio/${tenant.id}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(OUT, "loc-1-studio-page.png"), fullPage: true });

  await page.getByRole("button", { name: "Edit business", exact: true }).click();
  await page.waitForTimeout(600);

  /* the map is at the foot of the sheet */
  const map = page.getByRole("application", { name: /Move the map/i });
  await map.scrollIntoViewIfNeeded();
  /* tiles are images from a third party — give them a moment to land */
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(OUT, "loc-2-picker.png"), fullPage: true });

  const tiles = await page.locator('img[src*="tile.openstreetmap.org"]').count();
  console.log(`  tiles rendered: ${tiles}`);

  /* drag the map, which is the whole gesture: the pin stays, the world moves,
     and letting go asks the server what the pin is standing on */
  const box = await map.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 90, box.y + box.height / 2 - 60, { steps: 12 });
    await page.mouse.up();
  }
  await page.waitForTimeout(4000);
  await map.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, "loc-3-after-drag.png"), fullPage: true });

  const pinnedOn = await page.getByText(/THE PIN IS ON/i).locator("..").innerText().catch(() => "");
  console.log(`  after the drag: ${pinnedOn.replace(/\s+/g, " ").slice(0, 160)}`);

  /* THE PIN IS ONLY PLACED IF IT IS SAVED (11 Sep 2026). Reading it back from
     the database is the only way to know: the sheet says "Saved" from the
     server action's own answer, and `location_set_at` is what every screen
     downstream actually reads. */
  const saved = await rest("GET", `/rest/v1/tenants?id=eq.${tenant.id}&select=lat,lng,area,location_set_at`);
  const row = saved[0] ?? {};
  const moved = row.lat !== null && Math.abs(Number(row.lat) - 18.5204) > 0.0005;
  console.log(`  saved in the database: lat=${row.lat} lng=${row.lng} area=${row.area} location_set_at=${row.location_set_at ?? "null"}`);
  if (!row.location_set_at) problems.push("the pin was NOT saved — location_set_at is still null");
  if (!moved) problems.push(`the point did not move off the city centroid (lat=${row.lat})`);

  await browser.close();

  /* clean up, hardest first */
  await rest("DELETE", `/rest/v1/subscriptions?tenant_id=eq.${tenant.id}`);
  await rest("DELETE", `/rest/v1/tenant_members?tenant_id=eq.${tenant.id}`);
  await rest("DELETE", `/rest/v1/tenants?id=eq.${tenant.id}`);
  await fetch(`${SUPABASE}/auth/v1/admin/users/${link.id}`, { method: "DELETE", headers: H });

  if (problems.length) {
    console.log("\nPROBLEMS:");
    problems.forEach((p) => console.log(`  ${p}`));
    process.exit(1);
  }
  console.log("\nShot clean, and everything it made is gone.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
