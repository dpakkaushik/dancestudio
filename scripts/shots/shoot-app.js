/* Screenshot the APP's screens the way shoot-proto.js shoots the prototype's: a
   throwaway account (the e2e's admin generate_link trick) onboarded as an
   ORGANIZATION with a studio, then every route →
   scripts/shots/shots/app-<key>.png (gitignored).

   It walks the gate as a real organization meets it (R13-R16, 9 Sep 2026, and
   per-studio subscriptions, 10 Sep 2026): who first, the logo, the links, then
   FIVE PHOTOS OF THE SPACE — without which request_org_verification refuses and
   nothing downstream exists. The service role then stands in for a platform
   admin twice, because a developer tool cannot wait for a human: the
   verification tick, and one granted studio subscription (₹0, nothing charged),
   which is what puts the studio on Discover.

   Needs `npm run dev` on :3000 and .env.local. Cleans up its account. */
const path = require("path");
const fs = require("fs");
const { chromium } = require("@playwright/test");

/* the repo root, from scripts/shots/ */
const ROOT = path.resolve(__dirname, "..", "..");

const OUT = path.join(__dirname, "shots");
fs.mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const adminHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
const BASE = "http://localhost:3000";
/* a 1x1 PNG — the smallest thing the bucket's mime list accepts */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");

async function signUp(page, email) {
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, { method: "POST", headers: adminHeaders, body: JSON.stringify({ type: "magiclink", email }) });
  if (!res.ok) throw new Error(`generate_link ${res.status} ${await res.text()}`);
  const link = await res.json();
  await page.goto(`${BASE}/auth/confirm?token_hash=${link.hashed_token}&type=${link.verification_type ?? "magiclink"}`);
  return link.id;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
  const stamp = Date.now().toString(36);
  const email = `shots-${stamp}@example.com`;
  let userId = null;
  let tenantId = null;
  const shot = async (name) => {
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, `app-${name}.png`), fullPage: true });
    console.log("shot", name);
  };
  try {
    userId = await signUp(page, email);
    await page.waitForURL(/\/onboarding/);
    await shot("onboarding");
    /* onboarded as an ORGANIZATION (8 Sep 2026) — the only account that opens studios */
    await page.getByText("Organization", { exact: true }).click();
    await page.locator('input[name="name"]').fill("EEE Dance Company");
    await page.locator('input[name="city"]').fill("New Delhi");
    await page.getByRole("button", { name: "Continue" }).click();
    /* the four screens (U2): the photo is required, then styles, then socials, then the bow */
    await page.getByLabel("Add a photo").setInputFiles({ name: "face.png", mimeType: "image/png", buffer: PNG });
    await page.getByLabel("Your logo", { exact: true }).waitFor({ timeout: 20000 });
    await shot("onboarding-photo");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    /* an organization is not asked what it dances; since 11 Sep 2026 its links
       are optional too — DanceOS checks each STUDIO's links and photos instead */
    await shot("onboarding-links");
    await page.getByRole("button", { name: "Skip for now →" }).click();
    await page.getByText(/Welcome, /).waitFor();
    await shot("onboarding-done");
    await page.getByRole("button", { name: "Open DanceOS →" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/onboarding"));
    await page.goto(`${BASE}/`);
    /* 11 Sep 2026: Home carries the GST card — NOT VERIFIED first */
    await shot("home-org-gst");
    /* the number is the organization's own to verify; the service role stands in
       for the Verify button, exactly as it stands in for the webhook below */
    await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH", headers: adminHeaders,
      body: JSON.stringify({ gstin: `27SHOTA${String(Date.now() % 10000).padStart(4, "0")}A1Z5`, gstin_verified_at: new Date().toISOString() }),
    });
    await page.goto(`${BASE}/`);
    await shot("home-org-verified");

    /* a studio, which since 10 Sep 2026 is born PRIVATE */
    await page.goto(`${BASE}/business`);
    await shot("business-hub-empty");
    await page.getByText("＋ Add studio").click();
    await page.locator('input[name="name"]').fill("EEE Dance Studio");
    await page.locator('input[name="area"]').fill("Kothrud");
    /* the city picker replaced the select (11 Sep 2026) — a Google city search,
       with the typed name as the fallback a test can rely on */
    await page.getByRole("searchbox", { name: /Search your city/i }).fill("Pune");
    await page.getByRole("listbox").getByRole("option", { name: 'Use "Pune"' }).click();
    await page.getByLabel("Room 1 name").fill("Studio A");
    await shot("new-studio-sheet");
    await page.getByRole("button", { name: "Create studio" }).click();
    await page.getByText("EEE Dance Studio").first().waitFor();
    /* NOT PUBLIC, with the database's own sentence and its Subscribe button */
    await shot("business-hub-studio-unsubscribed");

    /* the studio's own subscription — the row an admin's grant writes, at ₹0,
       which is also what puts the studio on Discover */
    const studioRows = await (await fetch(
      `${supabaseUrl}/rest/v1/tenant_members?user_id=eq.${userId}&member_role=eq.owner&deleted_at=is.null&select=tenant_id,tenants(type)`,
      { headers: adminHeaders }
    )).json();
    const studioId = (studioRows.find((r) => r.tenants && r.tenants.type === "studio") || {}).tenant_id;
    if (!studioId) throw new Error("the studio was not created");
    /* the BADGE (11 Sep 2026): an admin's approval, which the service role
       stands in for — the studio is verified before it is subscribed */
    await fetch(`${supabaseUrl}/rest/v1/tenants?id=eq.${studioId}`, {
      method: "PATCH", headers: adminHeaders, body: JSON.stringify({ verified_at: new Date().toISOString() }),
    });
    const today = new Date().toISOString().slice(0, 10);
    const until = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
      method: "POST", headers: adminHeaders,
      body: JSON.stringify({
        kind: "studio", user_id: userId, tenant_id: studioId, plan_key: "studio_monthly",
        price_inr: 0, period: "monthly", status: "active", current_period_start: today,
        current_period_end: until, granted: true, note: "Granted by shoot-app.js — nothing charged",
        created_by: userId, updated_by: userId,
      }),
    });
    await fetch(`${supabaseUrl}/rest/v1/tenants?id=eq.${studioId}`, {
      method: "PATCH", headers: adminHeaders, body: JSON.stringify({ visibility: "listed" }),
    });
    await page.goto(`${BASE}/business`);
    await shot("business-hub");
    await page.getByText("EEE Dance Studio").first().click();
    await page.waitForURL(/\/business\/[0-9a-f-]+\/classes/);
    tenantId = page.url().match(/\/business\/([0-9a-f-]+)\//)?.[1] ?? null;
    await shot("classes-desk");
    for (const [name, url] of [
      ["home", "/"],
      ["profile", "/profile"],
      ["settings-sheet", "/profile?settings=1"],
      ["discover", "/discover"],
      ["discover-classes", "/discover?tab=classes"],
      ["stats", "/stats"],
      ["stats-history", "/stats?tab=history"],
      ["stats-charts", "/stats?tab=charts&seg=artist"],
      ["inbox", "/inbox"],
      ["notifications", "/notifications"],
      ["my-classes", "/my-classes"],
      ["managed", "/managed"],
      ["calendar", "/calendar"],
      ["crews", "/crews"],
      ["classes", "/classes"],
      ["earnings", "/earnings"],
      /* the subscriptions slice, 10 Sep 2026 */
      ["subscription", "/subscription"],
      ["payments", "/payments"],
      ["support", "/support"],
      ["person", `/person/${userId}`],
      ["studio-public", `/studio/${tenantId}`],
      ["class-form", `/business/${tenantId}/classes/new`],
      ["events-desk", `/business/${tenantId}/events`],
      ["event-form", `/business/${tenantId}/events/new`],
      ["students", `/business/${tenantId}/students`],
      ["team", `/business/${tenantId}/staff`],
      ["rooms", `/business/${tenantId}/rooms`],
      ["studio-earnings", `/business/${tenantId}/earnings`],
      ["studio-calendar", `/business/${tenantId}/calendar`],
    ]) {
      await page.goto(`${BASE}${url}`);
      await shot(name);
    }
  } catch (e) {
    console.log("FAILED", String(e).slice(0, 300));
  } finally {
    if (tenantId) await fetch(`${supabaseUrl}/rest/v1/tenants?id=eq.${tenantId}`, { method: "DELETE", headers: adminHeaders });
    if (userId) await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: adminHeaders });
    await browser.close();
  }
})();
