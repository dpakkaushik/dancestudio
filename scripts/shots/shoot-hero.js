/* THE IDENTITY HERO, DRIVEN FOR REAL (14 Sep 2026; re-cut 15 Sep 2026 for the
   header and the disc) — every page that wears it, each with its two pictures
   set through the hero itself, shot to scripts/shots/shots/hero-<key>.png
   (gitignored), with a PASS/FAIL line per check the way shoot-verify-form.js
   does.

   Two throwaway accounts (the e2e's admin generate_link trick):
     an ORGANIZATION → its studio → /business/{id}: the empty header and the
       initials disc; the disc's ＋ sets the studio's own picture; the header's
       Add tile puts a photo across the top; the only picture has no ✕ (a
       header never empties), a second one has, and the ✕ takes it out; the
       Media desk shows the same two; the PUBLIC page shows the header to the
       organization AND to a signed-out stranger (the storage policy for a
       listed studio's photos); then its Home — the logo on the disc, no
       header, no QR;
     a USER → Home: the face on the disc, the Add tile, ONE header picture and
       then no tile; the service role grants the Artist plan (₹0, nothing
       charged) → the tile is back, a second picture goes up, its ✕ takes it
       down; the Profile tab's Edit sheet carries the Header pictures section.

   Needs migration 20260915090000 on the database for the header half; without
   it the failures say so and the run carries on.

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
const BASE = process.env.DANCEOS_BASE_URL || "http://localhost:3000";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
const FILE = { name: "face.png", mimeType: "image/png", buffer: PNG };

let pass = 0;
let fail = 0;
const check = (ok, what) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (ok) pass += 1; else fail += 1; };
const rest = async (q) => (await fetch(`${supabaseUrl}/rest/v1/${q}`, { headers: adminHeaders })).json();

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

/* the header rail and the disc, by their test ids */
const rail = (page) => page.getByTestId("hero-rail");
const disc = (page) => page.getByTestId("hero-disc");
const railImgs = async (page) => rail(page).locator("img").count();
const discImgs = async (page) => disc(page).locator("img").count();
/* wait until the rail holds exactly n pictures (a refresh after an upload) */
const waitRailImgs = (page, n) => page.waitForFunction((want) => document.querySelectorAll('[data-testid="hero-rail"] img').length === want, n, { timeout: 25000 });

(async () => {
  const browser = await chromium.launch();
  const stamp = Date.now().toString(36);
  let orgId = null;
  let userId = null;
  let studioId = null;
  const today = new Date().toISOString().slice(0, 10);
  const until = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
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
    const rows = await rest(`tenant_members?user_id=eq.${orgId}&member_role=eq.owner&deleted_at=is.null&select=tenant_id,tenants(type)`);
    studioId = (rows.find((r) => r.tenants && r.tenants.type === "studio") || {}).tenant_id;
    if (!studioId) throw new Error("the studio was not created");
    /* the badge, a granted ₹0 subscription and the listing, so the page is the one a live studio sees */
    await fetch(`${supabaseUrl}/rest/v1/tenants?id=eq.${studioId}`, { method: "PATCH", headers: adminHeaders, body: JSON.stringify({ verified_at: new Date().toISOString() }) });
    await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
      method: "POST", headers: adminHeaders,
      body: JSON.stringify({ kind: "studio", user_id: orgId, tenant_id: studioId, plan_key: "studio_monthly", price_inr: 0, period: "monthly", status: "active", current_period_start: today, current_period_end: until, granted: true, note: "Granted by shoot-hero.js — nothing charged", created_by: orgId, updated_by: orgId }),
    });
    await fetch(`${supabaseUrl}/rest/v1/tenants?id=eq.${studioId}`, { method: "PATCH", headers: adminHeaders, body: JSON.stringify({ visibility: "listed" }) });

    /* the studio's own home: an empty header with the Add tile, initials on the disc */
    await org.goto(`${BASE}/business/${studioId}`);
    const hero = org.getByTestId("studio-hero");
    await hero.waitFor();
    check(await org.getByRole("heading", { name: "EEE Dance Studio", exact: true }).isVisible(), "studio home: the name is the heading");
    check(await org.getByText("Studio", { exact: true }).first().isVisible(), "studio home: STUDIO over the name");
    check((await hero.locator("img").count()) === 0, "studio home: no picture anywhere yet → initials on the disc, no <img>");
    check((await disc(org).count()) === 1, "studio home: the disc is there");
    check((await org.getByLabel("Add a photo").count()) === 1, "studio home: the disc's ＋ offers the studio's own picture");
    check((await rail(org).getAttribute("role")) === null, "studio home: the header is one square (the Add tile), so no swipe");
    check((await org.getByLabel("Add a header picture").count()) === 1, "studio home: the owner is offered the header's Add tile");
    check((await org.getByRole("link", { name: "Media", exact: true }).count()) === 1, "studio home: a Media tile among the tools");
    await shot("studio-initials");

    /* the disc's ＋ sets the studio's picture — tenants.photo_path, through set_tenant_photo */
    await org.getByLabel("Add a photo").setInputFiles(FILE);
    await disc(org).locator("img").first().waitFor({ timeout: 20000 });
    check((await discImgs(org)) === 1, "studio home: the picture is on the disc");
    check((await railImgs(org)) === 0, "studio home: and not in the header");
    check((await org.getByLabel("Change the photo").count()) === 1, "studio home: the ＋ now says Change the photo");
    const photoPath = await rest(`tenants?id=eq.${studioId}&select=photo_path`);
    check(String(photoPath[0] && photoPath[0].photo_path).startsWith(`tenants/${studioId}/`), "tenants.photo_path is set, in the studio's own folder");

    /* the header: one picture through the Add tile — and no ✕ on the only one */
    await org.getByLabel("Add a header picture").setInputFiles(FILE);
    const headerUp = await waitRailImgs(org, 1).then(() => true).catch(() => false);
    if (headerUp) {
      check(true, "studio home: the header holds the first picture");
      check((await org.getByLabel("Remove this picture").count()) === 0, "studio home: the only picture has no ✕ — a header never empties");
      await org.getByLabel("Add a header picture").setInputFiles(FILE);
      await waitRailImgs(org, 2);
      check((await org.getByLabel("Remove this picture").count()) === 2, "studio home: two pictures, two ✕");
      check((await rail(org).getAttribute("role")) === "region", "studio home: the header swipes now");
      await shot("studio-header");
      await org.getByLabel("Remove this picture").first().click();
      await waitRailImgs(org, 1);
      check((await org.getByLabel("Remove this picture").count()) === 0, "studio home: ✕ took one out, and the last one has no ✕ again");
      const live = await rest(`org_proof_photos?tenant_id=eq.${studioId}&deleted_at=is.null&select=id`);
      check(Array.isArray(live) && live.length === 1, "org_proof_photos holds the one live row for the studio");

      /* the Media desk: the same two pictures as a desk */
      await org.goto(`${BASE}/business/${studioId}/media`);
      await org.getByRole("heading", { name: "Media", exact: true }).waitFor();
      check((await org.getByTestId("media-disc").locator("img").count()) === 1, "media desk: the disc with its picture");
      check(await org.getByText("1 / 5–10").isVisible(), "media desk: the header count");
      check((await org.getByLabel(/is the only one/).count()) === 1, "media desk: the only picture's ✕ is disabled and says why");
      await shot("studio-media");

      /* the public page reads the header through tenant_header_photos, which
         arrives with migration 20260915090000 — say so on the line when it is
         not there yet, so a red line reads as "apply the migration" and not
         as a broken page */
      const rpcProbe = await fetch(`${supabaseUrl}/rest/v1/rpc/tenant_header_photos`, { method: "POST", headers: adminHeaders, body: JSON.stringify({ p_tenant_id: studioId }) });
      const rpcNote = rpcProbe.ok ? "" : " (NEEDS migration 20260915090000 — tenant_header_photos is not on the database)";
      /* to the organization … */
      await org.goto(`${BASE}/studio/${studioId}`);
      await org.getByTestId("public-hero").waitFor();
      check((await railImgs(org)) === 1, `public studio page (owner): the header picture is there${rpcNote}`);
      check((await discImgs(org)) === 1, "public studio page (owner): the disc is there");
      /* … and to a stranger with no account at all — the storage policy's whole point */
      const guestCtx = await browser.newContext({ viewport: { width: 430, height: 932 } });
      const guest = await guestCtx.newPage();
      await guest.goto(`${BASE}/studio/${studioId}`);
      await guest.getByTestId("public-hero").waitFor();
      const guestImgs = await waitRailImgs(guest, 1).then(() => true).catch(() => false);
      check(guestImgs, `public studio page (signed-out stranger): the header picture is readable — a listed studio's photos are public${rpcNote}`);
      check((await discImgs(guest)) === 1, "public studio page (stranger): the disc too");
      await shotOf(guest)("public-studio-guest");
      await guestCtx.close();
    } else {
      console.log("HEADER  the picture did not land in 25 s — is migration 20260915090000 on the database?");
      fail += 1;
    }

    /* the organization's Home — the same hero, its logo on the disc, an empty header, no QR */
    await org.goto(`${BASE}/`);
    await org.getByRole("heading", { name: "EEE Dance Company", exact: true }).waitFor();
    check((await discImgs(org)) === 1, "org home: the logo is on the disc");
    check((await railImgs(org)) === 0 && (await org.getByLabel("Add a header picture").count()) === 0, "org home: no header and no Add tile — an organization is not a place");
    check((await org.getByLabel("Share your profile — QR code").count()) === 0 && (await org.getByRole("button", { name: /QR/ }).count()) === 0, "org home: no QR — an organization has no public page");
    check(await org.getByText("Organization", { exact: true }).isVisible(), "org home: the role word under the sleeve");
    check((await org.getByLabel("Change your photo").count()) === 1, "org home: the ＋ changes the logo");
    await shot("org-home");
    await org.close();

    /* ── TWO: a person — one header picture; then an artist — up to ten ────── */
    const me = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
    const shotMe = shotOf(me);
    userId = await signUp(me, `hero-user-${stamp}@example.com`);
    await onboard(me, "Rhea Kapoor", "User", "Pune");
    await me.goto(`${BASE}/`);
    await me.getByRole("heading", { name: "Rhea Kapoor", exact: true }).waitFor();
    check((await discImgs(me)) === 1, "user home: the profile photo is on the disc");
    check((await rail(me).getAttribute("role")) === null, "user home: an empty header with the Add tile, no swipe");
    check((await me.getByLabel("Add a header picture").count()) === 1, "user home: a user is offered ONE header picture");
    check(await me.getByText("User", { exact: true }).isVisible(), "user home: the role word");

    await me.getByLabel("Add a header picture").setInputFiles(FILE);
    const userHeader = await waitRailImgs(me, 1).then(() => true).catch(() => false);
    if (userHeader) {
      check(true, "user home: the one header picture is up");
      check((await me.getByLabel("Add a header picture").count()) === 0, "user home: and the tile is gone — one is the ceiling for a user");
      await shotMe("user-home");

      /* the Artist plan, granted — what makes a person an artist, and the ceiling ten */
      await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
        method: "POST", headers: adminHeaders,
        body: JSON.stringify({ kind: "artist", user_id: userId, plan_key: "artist_monthly", price_inr: 0, period: "monthly", status: "active", current_period_start: today, current_period_end: until, granted: true, note: "Granted by shoot-hero.js — nothing charged", created_by: userId, updated_by: userId }),
      });
      await me.goto(`${BASE}/`);
      await me.getByText("Artist", { exact: true }).first().waitFor();
      check((await me.getByLabel("Add a header picture").count()) === 1, "artist home: the Add tile is back — an artist holds ten");
      check((await rail(me).getAttribute("role")) === "region", "artist home: the header swipes (the picture, then the tile)");
      await me.getByLabel("Add a header picture").setInputFiles(FILE);
      await waitRailImgs(me, 2);
      const rowCount = await rest(`profile_photos?user_id=eq.${userId}&deleted_at=is.null&select=id`);
      check(Array.isArray(rowCount) && rowCount.length === 2, "profile_photos holds the two rows, in the person's folder");
      await shotMe("artist-home");
      await me.getByLabel("Remove this picture").first().click();
      await waitRailImgs(me, 1);
      check((await railImgs(me)) === 1, "artist home: ✕ takes a header picture out again");

      /* the Profile tab: the same hero, and the Edit sheet carries the header */
      await me.goto(`${BASE}/profile`);
      await me.getByTestId("my-hero").waitFor();
      check((await discImgs(me)) === 1 && (await railImgs(me)) === 1, "profile tab: the same disc and header");
      /* exact: the About placeholder is a button whose name ENDS in "Edit profile ›" */
      await me.getByRole("button", { name: "Edit profile", exact: true }).click();
      await me.getByRole("dialog", { name: "Edit profile" }).waitFor();
      check(await me.getByText("Header pictures", { exact: true }).isVisible(), "edit profile: the Header pictures section");
      check((await me.getByLabel("Add picture").count()) === 1, "edit profile: the Add tile in the sheet");
      check(await me.getByText("Mobile", { exact: true }).isVisible(), "edit profile: Name · Mobile · Profile picture · Header pictures, in that order");
      await shotMe("profile-edit");
    } else {
      console.log("HEADER  the picture did not land in 25 s — is migration 20260915090000 on the database?");
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
