/* THE IDENTITY HERO, DRIVEN FOR REAL (14 Sep 2026) — the four pages that wear
   it, each with its picture set through the hero itself, shot to
   scripts/shots/shots/hero-<key>.png (gitignored), with a PASS/FAIL line per
   check the way shoot-verify-form.js does.

   Two throwaway accounts (the e2e's admin generate_link trick):
     an ORGANIZATION → its studio → /business/{id}: the initials square, then
       the ＋ sets the studio's own picture and the square shows it; then its
       Home, the logo in the big square and no QR;
     a USER → Home: one square, no dots; then the service role grants the
       Artist plan (₹0, nothing charged) → Home swipes: the photo, the Add tile,
       a gallery photo added through the tile, its ✕ removing it again.

   The gallery half needs migration 20260914170000 on the database; without it
   the tile's error is printed and the run carries on.

   Needs `npm run dev` on :3000 and .env.local. Cleans up both accounts. */
const path = require("path");
const fs = require("fs");
const { chromium } = require("@playwright/test");

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
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
const FILE = { name: "face.png", mimeType: "image/png", buffer: PNG };

let pass = 0;
let fail = 0;
const check = (ok, what) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (ok) pass += 1; else fail += 1; };

async function signUp(page, email) {
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, { method: "POST", headers: adminHeaders, body: JSON.stringify({ type: "magiclink", email }) });
  if (!res.ok) throw new Error(`generate_link ${res.status} ${await res.text()}`);
  const link = await res.json();
  await page.goto(`${BASE}/auth/confirm?token_hash=${link.hashed_token}&type=${link.verification_type ?? "magiclink"}`);
  return link.id;
}

/* the onboarding, as e2e/happy-path.spec.ts walks it */
async function onboard(page, name, role, city) {
  await page.waitForURL(/\/onboarding/);
  const isOrg = role === "Organization";
  if (isOrg) await page.getByText("Organization", { exact: true }).click();
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="city"]').fill(city);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Add a photo").setInputFiles(FILE);
  await page.getByLabel(isOrg ? "Your logo" : "Your profile photo", { exact: true }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  if (isOrg) {
    await page.getByText(/Welcome, /).waitFor();
  } else {
    await page.getByText("Your dance styles").waitFor();
    await page.getByRole("button", { name: "Hip-Hop", exact: true }).click();
    await page.getByRole("button", { name: "Continue · 1 style" }).click();
    await page.getByText("Your social links").waitFor();
    await page.getByRole("button", { name: "Skip for now →" }).click();
    await page.getByText(/Take a bow, /).waitFor();
  }
  await page.getByRole("button", { name: "Open DanceOS →" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/onboarding"));
}

const shotOf = (page) => async (name) => {
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, `hero-${name}.png`), fullPage: true });
  console.log("shot", name);
};

(async () => {
  const browser = await chromium.launch();
  const stamp = Date.now().toString(36);
  let orgId = null;
  let userId = null;
  let studioId = null;
  try {
    /* ── ONE: the organization and its studio ─────────────────────────────── */
    const org = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
    const shot = shotOf(org);
    orgId = await signUp(org, `hero-org-${stamp}@example.com`);
    await onboard(org, "EEE Dance Company", "Organization", "New Delhi");
    await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${orgId}`, {
      method: "PATCH", headers: adminHeaders,
      body: JSON.stringify({ gstin: `HRO${String(Date.now() % 100000).padStart(5, "0")}`, gstin_verified_at: new Date().toISOString() }),
    });
    await org.goto(`${BASE}/business`);
    await org.getByText("＋ Add studio").click();
    await org.locator('input[name="name"]').fill("EEE Dance Studio");
    await org.locator('input[name="area"]').fill("Kothrud");
    await org.getByRole("searchbox", { name: /Search your city/i }).fill("Pune");
    await org.getByRole("listbox").getByRole("option", { name: 'Use "Pune"' }).click();
    await org.getByLabel("Room 1 name").fill("Studio A");
    await org.getByRole("button", { name: "Create studio" }).click();
    await org.getByText("EEE Dance Studio").first().waitFor();
    const rows = await (await fetch(
      `${supabaseUrl}/rest/v1/tenant_members?user_id=eq.${orgId}&member_role=eq.owner&deleted_at=is.null&select=tenant_id,tenants(type)`,
      { headers: adminHeaders }
    )).json();
    studioId = (rows.find((r) => r.tenants && r.tenants.type === "studio") || {}).tenant_id;
    if (!studioId) throw new Error("the studio was not created");
    /* the badge and a granted ₹0 subscription, so the page is the one a live studio sees */
    await fetch(`${supabaseUrl}/rest/v1/tenants?id=eq.${studioId}`, { method: "PATCH", headers: adminHeaders, body: JSON.stringify({ verified_at: new Date().toISOString() }) });
    const today = new Date().toISOString().slice(0, 10);
    const until = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
      method: "POST", headers: adminHeaders,
      body: JSON.stringify({ kind: "studio", user_id: orgId, tenant_id: studioId, plan_key: "studio_monthly", price_inr: 0, period: "monthly", status: "active", current_period_start: today, current_period_end: until, granted: true, note: "Granted by shoot-hero.js — nothing charged", created_by: orgId, updated_by: orgId }),
    });

    /* the studio's own home: initials first, because the sheet sets no picture */
    await org.goto(`${BASE}/business/${studioId}`);
    const hero = org.getByTestId("studio-hero");
    await hero.waitFor();
    check(await org.getByRole("heading", { name: "EEE Dance Studio", exact: true }).isVisible(), "studio home: the name is the heading");
    check(await org.getByText("Studio", { exact: true }).first().isVisible(), "studio home: STUDIO over the name");
    check((await hero.locator("img").count()) === 0, "studio home: no picture yet → initials, no <img>");
    check((await org.getByTestId("hero-rail").getByLabel("EEE Dance Studio").count()) === 1, "studio home: one square, so no swipe");
    check(await org.getByLabel("Add a photo").count() === 1, "studio home: the ＋ offers to add the studio's picture");
    await shot("studio-initials");

    /* the ＋ sets the studio's picture — tenants.photo_path, through set_tenant_photo */
    await org.getByLabel("Add a photo").setInputFiles(FILE);
    await hero.locator("img").first().waitFor({ timeout: 20000 });
    check((await hero.locator("img").count()) === 1, "studio home: the picture is in the square");
    check((await org.getByLabel("Change the photo").count()) === 1, "studio home: the ＋ now says Change the photo");
    const photoPath = await (await fetch(`${supabaseUrl}/rest/v1/tenants?id=eq.${studioId}&select=photo_path`, { headers: adminHeaders })).json();
    check(String(photoPath[0] && photoPath[0].photo_path).startsWith(`tenants/${studioId}/`), "tenants.photo_path is set, in the studio's own folder");
    await shot("studio-photo");

    /* the organization's Home — the same hero, its logo, no QR to share */
    await org.goto(`${BASE}/`);
    await org.getByRole("heading", { name: "EEE Dance Company", exact: true }).waitFor();
    check((await org.getByTestId("hero-rail").locator("img").count()) === 1, "org home: the logo stands in the big square");
    check((await org.getByLabel("Share your profile — QR code").count()) === 0 && (await org.getByRole("button", { name: /QR/ }).count()) === 0, "org home: no QR — an organization has no public page");
    check(await org.getByText("Organization", { exact: true }).isVisible(), "org home: the role word under the sleeve");
    check(await org.getByLabel("Change your photo").count() === 1, "org home: the ＋ changes the logo");
    await shot("org-home");
    await org.close();

    /* ── TWO: a person — one square; then an artist — the gallery ─────────── */
    const me = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
    const shotMe = shotOf(me);
    userId = await signUp(me, `hero-user-${stamp}@example.com`);
    await onboard(me, "Rhea Kapoor", "User", "Pune");
    await me.goto(`${BASE}/`);
    await me.getByRole("heading", { name: "Rhea Kapoor", exact: true }).waitFor();
    check((await me.getByTestId("hero-rail").locator("img").count()) === 1, "user home: the profile photo in the big square");
    check((await me.getByTestId("hero-rail").getAttribute("role")) === null, "user home: one picture, no swipe, no dots");
    check((await me.getByLabel("Add to your gallery").count()) === 0, "user home: no gallery tile for a user");
    check(await me.getByText("User", { exact: true }).isVisible(), "user home: the role word");
    await shotMe("user-home");

    /* the Artist plan, granted — what makes a person an artist */
    await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
      method: "POST", headers: adminHeaders,
      body: JSON.stringify({ kind: "artist", user_id: userId, plan_key: "artist_monthly", price_inr: 0, period: "monthly", status: "active", current_period_start: today, current_period_end: until, granted: true, note: "Granted by shoot-hero.js — nothing charged", created_by: userId, updated_by: userId }),
    });
    await me.goto(`${BASE}/`);
    await me.getByText("Artist", { exact: true }).first().waitFor();
    check((await me.getByLabel("Add to your gallery").count()) === 1, "artist home: the Add tile ends the rail");
    check((await me.getByTestId("hero-rail").getAttribute("role")) === "region", "artist home: the rail swipes (photo, then the tile)");
    await shotMe("artist-home");

    /* one gallery photo through the tile, then its ✕ */
    await me.getByLabel("Add to your gallery").setInputFiles(FILE);
    const added = await Promise.race([
      me.getByLabel("Remove this photo").waitFor({ timeout: 20000 }).then(() => "added"),
      me.getByRole("status").waitFor({ timeout: 20000 }).then(async () => `refused: ${await me.getByRole("status").innerText()}`),
    ]).catch(() => "neither the ✕ nor an error appeared in 20 s");
    if (added === "added") {
      check((await me.getByTestId("hero-rail").locator("img").count()) === 2, "artist home: the gallery photo is the second square");
      const rowCount = await (await fetch(`${supabaseUrl}/rest/v1/profile_photos?user_id=eq.${userId}&deleted_at=is.null&select=id`, { headers: adminHeaders })).json();
      check(Array.isArray(rowCount) && rowCount.length === 1, "profile_photos holds the one row, in the person's folder");
      await shotMe("artist-gallery");
      await me.getByLabel("Remove this photo").click();
      await me.getByLabel("Remove this photo").waitFor({ state: "detached", timeout: 20000 });
      check((await me.getByTestId("hero-rail").locator("img").count()) === 1, "artist home: ✕ takes the gallery photo out again");
    } else {
      console.log(`GALLERY  ${added} — is migration 20260914170000 on the database?`);
      fail += 1;
    }
    await me.close();
  } catch (e) {
    console.log("FAILED", String(e).slice(0, 400));
    fail += 1;
  } finally {
    if (studioId) await fetch(`${supabaseUrl}/rest/v1/tenants?id=eq.${studioId}`, { method: "DELETE", headers: adminHeaders });
    if (orgId) await fetch(`${supabaseUrl}/auth/v1/admin/users/${orgId}`, { method: "DELETE", headers: adminHeaders });
    if (userId) await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: adminHeaders });
    await browser.close();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
  }
})();
