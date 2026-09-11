/**
 * The New-studio sheet, in the order the user asked for (11 Sep 2026):
 *
 *   "after filling the studio name the user gets the option to use my location;
 *    location and address are picked, city is picked from the Google address;
 *    when the user fills 'where it is' it auto-suggests the address from the
 *    Google API" — and then: "city, rather than picking from a hardcoded list,
 *    should be picked from API".
 *
 * So this drives exactly that: opens the sheet as a verified organization,
 * types a name, checks "Where it is" and "Use my location" come BEFORE Area
 * and City, types an address, takes Google's first suggestion, and ASSERTS
 * that Area and City filled themselves from it — City marked "from the
 * address" — with no chips anywhere. Then presses Change on the city to prove
 * the way out is a Google city search, not a list. Nothing is created: the
 * sheet is closed, and the one user it made is deleted.
 *
 *   npm run dev            # in another terminal
 *   NODE_PATH=$(pwd)/node_modules node scripts/shots/shoot-new-studio.js
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
  const email = `shot.newstudio.${stamp}@example.com`;
  const problems = [];
  const check = (ok, what) => {
    console.log(`  ${ok ? "ok " : "FAIL"} ${what}`);
    if (!ok) problems.push(what);
  };

  const link = await fetch(`${SUPABASE}/auth/v1/admin/generate_link`, { method: "POST", headers: H, body: JSON.stringify({ type: "magiclink", email }) }).then((r) => r.json());
  if (!link.hashed_token) throw new Error(`generate_link failed: ${JSON.stringify(link)}`);
  await rest("POST", "/rest/v1/profiles", { id: link.id, full_name: `Shot New Studio ${stamp}`, role: "org", city: "Pune", created_by: link.id, updated_by: link.id });
  await rest("PATCH", `/rest/v1/profiles?id=eq.${link.id}`, { verified_at: new Date().toISOString() });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("response", (r) => { if (r.status() >= 500) problems.push(`${r.status()} ${r.url()}`); });
  page.on("console", (m) => {
    const t = m.text();
    /* Google's own loader chatter is not this app's problem */
    if (m.type() === "error" && !/Google Maps|gstatic|googleapis/i.test(t)) problems.push(`console.error: ${t.slice(0, 300)}`);
  });

  try {
    await page.goto(`${BASE}/auth/confirm?token_hash=${link.hashed_token}&type=${link.verification_type ?? "magiclink"}`);
    await page.waitForLoadState("networkidle");

    await page.goto(`${BASE}/business`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Add studio" }).first().click();
    const sheet = page.getByRole("dialog", { name: "New studio" });
    await sheet.waitFor();
    await sheet.locator('input[name="name"]').fill(`Shot Studio ${stamp}`);

    /* 1. THE ORDER: name, then where it is, then area and city */
    const text = (await sheet.innerText()).replace(/\s+/g, " ");
    const at = (s) => text.indexOf(s);
    check(at("Studio name") >= 0 && at("Where it is") > at("Studio name"), "the sheet asks Where it is right after the name");
    check(at("Use my location") > at("Where it is") && at("Use my location") < at("Area"), "Use my location is offered before Area and City");
    check(at("Area") < at("City"), "Area comes before City");
    check((await sheet.getByRole("searchbox", { name: /Search an address or landmark/i }).count()) === 1, "the address search is in the sheet");
    check((await sheet.getByRole("button", { name: "Use my location" }).count()) === 1, "Use my location is one button");
    check((await sheet.getByRole("searchbox", { name: /Search your city/i }).count()) === 1, "with no pin yet, City is a search — not chips");
    check((await sheet.getByRole("button", { name: /Another city/ }).count()) === 0, "no 'Another city' chip anywhere");
    check((await sheet.getByRole("button", { name: "Pune", exact: true }).count()) === 0, "no city chips at all");

    await sheet.getByRole("application", { name: /Move the map/i }).scrollIntoViewIfNeeded().catch(() => undefined);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(OUT, "newstudio-1-empty.png"), fullPage: true });
    /* THE MAP OPENING IS NOT A PIN. Google fires `idle` on first render; until
       11 Sep 2026 that counted as a placement and the sheet quietly filled
       Area and City with the village under India's centroid. Four seconds is
       long enough for the map to have rendered and settled. */
    check((await sheet.locator('input[name="lat"]').inputValue()) === "", "the map opening does not place a pin");
    check((await sheet.locator('input[name="city"]').inputValue()) === "", "…nor name a city nobody chose");
    check((await sheet.locator('input[name="area"]').inputValue()) === "", "…nor an area");
    check((await sheet.getByText(/THE PIN IS ON/).count()) === 0, "…and there is no address to show yet");

    /* 2. TYPING THE ADDRESS SUGGESTS FROM GOOGLE */
    const search = sheet.getByRole("searchbox", { name: /Search an address or landmark/i });
    await search.fill("Kothrud Pune");
    await page.waitForTimeout(2500);
    const options = sheet.getByRole("listbox").getByRole("option");
    const n = await options.count();
    check(n > 0, `typing the address returned Google suggestions (${n})`);
    if (n > 0) {
      console.log(`       first suggestion: ${(await options.first().innerText()).replace(/\s+/g, " ").trim().slice(0, 70)}`);
      await page.screenshot({ path: path.join(OUT, "newstudio-2-suggestions.png"), fullPage: true });

      /* 3. PICKING ONE FILLS AREA AND CITY FROM THE ADDRESS */
      await options.first().click();
      await page.waitForTimeout(3500);
      const area = await sheet.locator('input[name="area"]').inputValue();
      const city = await sheet.locator('input[name="city"]').inputValue();
      const lat = await sheet.locator('input[name="lat"]').inputValue();
      console.log(`       filled: area=${JSON.stringify(area)} city=${JSON.stringify(city)} lat=${lat}`);
      check(area.trim().length > 0, "Area filled itself from the address");
      check(/pune/i.test(city), `City filled itself from the Google address (${city})`);
      check(lat !== "", "the pin rides in as lat/lng");
      /* exact: the Area label says "filled from the address" too, and a
         substring match would count it */
      check((await sheet.getByText("from the address", { exact: true }).count()) === 1, "City says it came from the address");
      check((await sheet.getByRole("searchbox", { name: /Search your city/i }).count()) === 0, "the city search is out of the way once the address named it");
      await page.screenshot({ path: path.join(OUT, "newstudio-3-filled.png"), fullPage: true });

      /* 4. CHANGING THE CITY IS A GOOGLE SEARCH, NOT A LIST */
      await sheet.getByRole("button", { name: "Change city" }).click();
      check((await sheet.getByRole("searchbox", { name: /Search your city/i }).count()) === 1, "Change opens a city search");
      check((await sheet.getByRole("button", { name: "Pune", exact: true }).count()) === 0, "…and still no chips");
      await sheet.getByRole("button", { name: `Keep ${city}` }).click();
      check((await sheet.locator('input[name="city"]').inputValue()) === city, "Keep leaves the city as it was");
    }

    /* nothing is created — the sheet is closed */
    await page.keyboard.press("Escape").catch(() => undefined);
  } finally {
    await browser.close();
    /* the sheet was never submitted, so the only thing to remove is the user */
    await rest("DELETE", `/rest/v1/tenants?created_by=eq.${link.id}`).catch(() => undefined);
    await fetch(`${SUPABASE}/auth/v1/admin/users/${link.id}`, { method: "DELETE", headers: H });
  }

  if (problems.length) {
    console.log("\nPROBLEMS:");
    problems.forEach((p) => console.log(`  ${p}`));
    process.exit(1);
  }
  console.log("\nThe New-studio sheet fills itself from the address, and everything made is gone.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
