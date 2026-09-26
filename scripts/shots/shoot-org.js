/**
 * Look at a studio owner's three changed screens for real (11 Sep 2026; re-cut
 * 26 Sep 2026 for the retired organization login):
 *
 *   1. Home — no "Verified organization" card, and the organization's events
 *      desk is the ORGANIZATION BUSINESS's own, not a tile on the person's Home
 *      (the user: "after verification I don't need this box"; "I can't see
 *      events on my org page — where is it?").
 *   2. /business with the New-studio sheet open — the map picker is IN the sheet
 *      ("wherever we are giving an address there should be a location picker").
 *   3. Discover as a map — the shelf drawn as pins.
 *
 * Makes a PERSON who owns a subscribed studio and an organization business (GST
 * verified, mandate granted), signs in as them, shoots and ASSERTS each, and
 * deletes everything it made. Fails on any console error, the way shoot-admin.js does.
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

  /* a PERSON (26 Sep 2026: the organization login is retired; any account opens a studio) */
  await rest("POST", "/rest/v1/profiles", { id: link.id, full_name: `Shot Owner ${stamp}`, role: "user", city: "Pune", styles: ["Hip-Hop"], created_by: link.id, updated_by: link.id });
  /* their ORGANIZATION, a business of its own: GST verified and its own mandate granted (org_is_public) */
  const [orgBiz] = await rest("POST", "/rest/v1/businesses", { type: "org", name: `Shot Org ${stamp}`, city: "Pune", visibility: "unlisted", gstin: `SHO${String(Date.now() % 100000).padStart(5, "0")}`, gstin_verified_at: new Date().toISOString(), created_by: link.id, updated_by: link.id });
  await rest("POST", "/rest/v1/business_members", { business_id: orgBiz.id, user_id: link.id, member_role: "owner", created_by: link.id, updated_by: link.id });
  await rest("POST", "/rest/v1/subscriptions", {
    kind: "org", user_id: link.id, business_id: orgBiz.id, plan_key: "org_monthly", price_inr: 0, period: "monthly", status: "active", granted: true,
    current_period_start: new Date().toISOString().slice(0, 10), current_period_end: new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10),
    note: "Granted by a screenshot script - nothing charged", created_by: link.id, updated_by: link.id,
  });
  const [tenant] = await rest("POST", "/rest/v1/businesses", { type: "studio", name: `Shot Studio ${stamp}`, area: "Kothrud", city: "Pune", lat: 18.5204, lng: 73.8567, visibility: "unlisted", styles: ["Hip-Hop"], created_by: link.id, updated_by: link.id });
  await rest("POST", "/rest/v1/business_members", { business_id: tenant.id, user_id: link.id, member_role: "owner", created_by: link.id, updated_by: link.id });
  await rest("POST", "/rest/v1/subscriptions", {
    kind: "studio", user_id: link.id, business_id: tenant.id, plan_key: "studio_monthly", price_inr: 0, period: "monthly", status: "active", granted: true,
    current_period_start: new Date().toISOString().slice(0, 10), current_period_end: new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10),
    note: "Granted by a screenshot script - nothing charged", created_by: link.id, updated_by: link.id,
  });
  await rest("PATCH", `/rest/v1/businesses?id=eq.${tenant.id}`, { visibility: "listed" });

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
  check((await page.locator('[role="status"][aria-label^="Verification:"]').count()) === 0, "Home: no Verified-organization card - a person's Home has nothing to verify (26 Sep 2026)");
  /* 26 Sep 2026: "the tick is on the name" is DELETED - a person carries none;
     the tick is the STUDIO's. And the events desk is the ORGANIZATION BUSINESS's
     own home, reached by its id, not a tile on the person's grid. */
  await page.goto(`${BASE}/business/${orgBiz.id}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(OUT, "org-1b-org-home.png"), fullPage: true });
  const eventsHref = await page.getByRole("link", { name: "Events", exact: true }).first().getAttribute("href").catch(() => null);
  check(eventsHref === `/business/${orgBiz.id}/events`, `Org home: an Events tile that opens THIS organization's desk (${eventsHref})`);
  await page.goto(`${BASE}/business/${orgBiz.id}/events`, { waitUntil: "networkidle" });
  check((await page.getByRole("link", { name: "Create event" }).count()) === 1, "Org events desk: Create event is offered - its own GST number is on file");

  /* 2. the hub: the studio above was made on Pune's centroid and never placed,
        so it must be ASKED for its pin — and the ask goes away once placed */
  await page.goto(`${BASE}/business`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(OUT, "org-2a-hub-nudge.png"), fullPage: true });
  check((await page.getByText(/Not on the map yet/).count()) === 1, "Hub: a studio on its city centroid is asked for its pin");
  check((await page.getByRole("link", { name: /Put .* on the map/ }).count()) === 1, "Hub: the ask carries the door to the map");

  await rest("PATCH", `/rest/v1/businesses?id=eq.${tenant.id}`, { location_set_at: new Date().toISOString() });
  await page.reload({ waitUntil: "networkidle" });
  check((await page.getByText(/Not on the map yet/).count()) === 0, "Hub: the ask is gone once the studio is placed");
  await rest("PATCH", `/rest/v1/businesses?id=eq.${tenant.id}`, { location_set_at: null });

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
  /* Google draws into the container it is given — `.gm-style` is the root it
     puts there, so its presence is the map having actually rendered, not just
     the box having been reserved for it. (This looked for OpenStreetMap tiles
     until 11 Sep 2026, which after the Google move could only ever fail.) */
  check((await sheetMap.locator(".gm-style").count()) > 0, "Add studio: Google Maps rendered in the picker");

  /* 4. Discover — ⚠ THE MAP VIEW IS GONE (18 Sep 2026, the user: "remove map
     from discover which is on the right side on near me"). This used to open
     ?view=map and assert the toggle's two words; it asserts the absence now,
     and that `view=map` in a bookmarked URL degrades to the list rather than
     breaking. Near me is the one control left beside the city. */
  await page.goto(`${BASE}/discover?city=Pune&tab=studios&view=map`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, "org-3-discover.png"), fullPage: true });
  check((await page.getByRole("application", { name: /on the map/i }).count()) === 0, "Discover: no map, even when the old view=map is in the URL");
  check((await page.getByRole("link", { name: "Show as a list" }).count()) === 0, "Discover: and no List toggle");
  await page.goto(`${BASE}/discover?city=Pune&tab=studios`, { waitUntil: "networkidle" });
  check((await page.getByRole("link", { name: "Show on a map" }).count()) === 0, "Discover: no Map toggle beside the place chip");
  /* ⚠ ONE CONTROL, NOT TWO (21 Sep 2026, the user: "merge near me and city
     filter on discover"). Near me was its own chip beside the city and was never
     independent of it — it only moves the point INSIDE the city. So the check is
     that the merged chip exists, offers Near me as a row, and that no separate
     Near me button is left standing beside it. */
  const place = page.getByLabel("Where to look");
  check((await place.count()) === 1, "Discover: ONE place control — where the list is measured from");
  check((await place.locator('option[value="__near__"]').count()) === 1, "Discover: Near me is a row on it, on the studios tab");
  check((await page.getByRole("button", { name: /Near me/ }).count()) === 0, "Discover: and no separate Near me chip beside it");
  /* and it is offered only where it does something — the radius search is Studios' */
  await page.goto(`${BASE}/discover?city=Pune&tab=crews`, { waitUntil: "networkidle" });
  check((await page.getByLabel("Where to look").locator('option[value="__near__"]').count()) === 0, "Discover: no Near me row on a shelf that is not measured");

  await browser.close();

  for (const id of [tenant.id, orgBiz.id]) {
    await rest("DELETE", `/rest/v1/subscriptions?business_id=eq.${id}`);
    await rest("DELETE", `/rest/v1/business_members?business_id=eq.${id}`);
    await rest("DELETE", `/rest/v1/businesses?id=eq.${id}`);
  }
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
