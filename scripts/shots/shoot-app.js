/* Screenshot the APP's screens the way shoot-proto.js shoots the prototype's: a
   throwaway account (the e2e's admin generate_link trick), onboarded as an
   artist with a business, then every route → scripts/shots/shots/app-<key>.png (gitignored).
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
    await page.getByPlaceholder("First name").fill("Rhea");
    await page.getByPlaceholder("Last name").fill("Kapoor");
    await page.getByText("Artist / Trainer", { exact: true }).click();
    await page.locator('input[name="city"]').fill("New Delhi");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/onboarding"));
    await page.goto(`${BASE}/`);
    await shot("home-artist-empty");
    /* a business, so the tools have somewhere to go */
    await page.goto(`${BASE}/business`);
    await shot("business-hub-empty");
    await page.getByText("＋ Add studio or business").click();
    await page.locator('input[name="name"]').fill("EEE Dance Studio");
    await page.locator('input[name="area"]').fill("Kothrud");
    await page.locator('select[name="city"]').selectOption("Pune");
    await page.getByLabel("Room 1 name").fill("Studio A");
    await shot("new-studio-sheet");
    await page.getByRole("button", { name: "Create studio" }).click();
    await page.getByText("EEE Dance Studio").first().waitFor();
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
