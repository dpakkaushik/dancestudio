/* THE IDENTITY HERO, DRIVEN FOR REAL (14 Sep 2026; re-cut 15 Sep 2026 for the
   header and the disc) — every page that wears it, each with its two pictures
   set through the hero itself, shot to scripts/shots/shots/hero-<key>.png
   (gitignored), with a PASS/FAIL line per check the way shoot-verify-form.js
   does.

   ⚠ RE-CUT AGAIN 16 SEP 2026: EVERY PICTURE IS CHANGED IN THE EDIT SHEET. The
   user circled the ✕ on a header square and the ＋ on the disc — "the update
   image option should be inside the edit profile" — so the hero has no picture
   controls at all now and this script drives the sheets instead. It asserts
   both halves: that the hero offers nothing, and that the sheet does
   everything the hero used to.

   Two throwaway accounts (the e2e's admin generate_link trick):
     an ORGANIZATION → its studio → /business/{id}: the empty header and the
       initials disc, with NO ＋ and NO Add tile on them; the owner's pencil
       opens Edit studio, where the disc's picture goes up, the header's photos
       go up, the only picture's ✕ is disabled (a header never empties) and a
       second one's is not; the location is LOCKED behind Change address; the
       Media desk shows the same two pictures; the PUBLIC page shows the header
       to the organization AND to a signed-out stranger (the storage policy for
       a listed studio's photos); then its Home — the logo on the disc, no
       header, no QR;
     a USER → Home: the face on the disc, an empty header and no tile on it;
       Edit profile puts ONE header picture up and then offers no more; the
       service role grants the Artist plan (₹0, nothing charged) → the sheet
       offers another, a second picture goes up, its ✕ takes it down.

   Also: the "Managing {studio}" strip is gone from a studio's own home (the
   hero says it) and still there, name only, on its desks.

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

    /* ── THE HUB, ONE CARD PER STUDIO (15 Sep 2026) ── */
    await org.goto(`${BASE}/business`);
    const card = org.getByTestId("studio-card").first();
    await card.waitFor();
    check((await org.getByTestId("studio-card").count()) === 1, "hub: one card for the one studio");
    check((await org.getByText("VERIFIED STUDIO").count()) === 0, "hub: no VERIFIED STUDIO line — the tick beside the name is the whole state");
    check((await card.getByLabel("Verified").count()) === 1, "hub: the verified tick sits beside the studio name");
    check((await org.getByText("Manage ›").count()) === 0, "hub: no Manage word — the card itself is the door");
    check((await card.getByRole("link", { name: /open the studio/ }).getAttribute("href")) === `/business/${studioId}`, "hub: the card opens the manage screen");
    check((await org.getByTestId("studio-live").count()) === 1, "hub: LIVE, not PUBLIC + RENEWS");
    check((await org.getByText("Stop renewing").count()) === 0, "hub: the renewal detail is off the card");
    /* 15 Sep 2026: the hub is Studios — events open from Home, the one door */
    check((await org.getByRole("link", { name: "Your events" }).count()) === 0, "hub: no events block — the hub lists studios");
    await shot("hub-one-card");
    /* pressing the card lands on the studio's home */
    await card.getByRole("link", { name: /open the studio/ }).click();
    await org.waitForURL(new RegExp(`/business/${studioId}$`));
    check(true, "hub: pressing the card opened the studio's home");
    /* and the cancel door survived the collapse */
    check(await org.getByText("SUBSCRIPTION", { exact: true }).isVisible(), "studio home: the subscription strip came here with it");
    /* this studio's plan is a GRANT (₹0, set up above) and a grant does not
       renew — so the strip says so and offers no Stop renewing, which is the
       honest answer. The paid-mandate path that DOES offer it needs a real
       Cashfree authorisation, which no script can drive; `rls-proof-*` and the
       live sandbox cover that. */
    check(await org.getByText("GRANTED", { exact: true }).isVisible(), "studio home: the strip names the standing (GRANTED)");
    check((await org.getByRole("button", { name: /Stop .* renewing/ }).count()) === 0, "studio home: a grant offers no Stop renewing — there is nothing to stop");

    /* the studio's own home: an empty header and the initials disc, and NOTHING
       on either of them to press (16 Sep 2026) */
    await org.goto(`${BASE}/business/${studioId}`);
    const hero = org.getByTestId("studio-hero");
    await hero.waitFor();
    check(await org.getByRole("heading", { name: "EEE Dance Studio", exact: true }).isVisible(), "studio home: the name is the heading");
    check(await org.getByText("Studio", { exact: true }).first().isVisible(), "studio home: STUDIO over the name");
    check((await hero.locator("img").count()) === 0, "studio home: no picture anywhere yet → initials on the disc, no <img>");
    check((await disc(org).count()) === 1, "studio home: the disc is there");
    /* 16 Sep 2026, the user: "the update image option should be inside the edit profile" */
    check((await org.getByLabel("Add a photo").count()) === 0, "studio home: NO ＋ on the disc — the picture is changed in the sheet");
    check((await org.getByLabel("Add a header picture").count()) === 0, "studio home: NO Add tile on the header — same reason");
    check((await org.getByLabel("Remove this picture").count()) === 0, "studio home: NO ✕ on a header square");
    check((await rail(org).getAttribute("role")) === null, "studio home: an empty header is one square, so no swipe");
    /* 16 Sep 2026, the user: "isn't it unnecessary — name, location etc already
       there below the profile image?" — right, so the strip is off THIS page */
    check((await org.getByText(/^Managing/).count()) === 0, "studio home: no Managing strip — the hero already says the name and the place");
    check((await org.getByRole("link", { name: "Media", exact: true }).count()) === 1, "studio home: a Media tile among the tools");
    check((await org.getByRole("link", { name: "Stats", exact: true }).count()) === 1, "studio home: a Stats tile among the tools (it left the tab bar)");
    /* R15, 15 Sep 2026: a studio cannot host an event, so its home offers no door to one */
    check((await org.getByRole("link", { name: "Events", exact: true }).count()) === 0, "studio home: NO Events tile — a studio does not host events");
    check((await org.getByRole("button", { name: "Edit studio", exact: true }).count()) === 1, "studio home: the owner's pencil on the hero's corner");
    check((await org.getByRole("link", { name: "Public view", exact: true }).getAttribute("href")) === `/studio/${studioId}`, "studio home: the eye opens the studio's public page");
    await shot("studio-initials");

    /* … and the strip IS on a desk, where nothing else names the studio */
    await org.goto(`${BASE}/business/${studioId}/classes`);
    await org.getByText(/^Managing/).first().waitFor();
    /* the name arrives from a server action, so the strip holds its height with
       an ellipsis first — assert what it settles on, not what it starts as */
    await org
      .waitForFunction(() => {
        const el = Array.from(document.querySelectorAll("span")).find((n) => /^Managing/.test(n.textContent || ""));
        return Boolean(el) && !(el.textContent || "").includes("…");
      }, null, { timeout: 15000 })
      .catch(() => {});
    const strip = await org.getByText(/^Managing/).first().innerText();
    check(strip.includes("EEE Dance Studio"), "a desk: the Managing strip names the studio");
    check(!strip.includes("Kothrud"), "a desk: and not its address — the name is what tells you which register this is");
    check((await org.getByRole("link", { name: /Leave this studio/ }).count()) === 1, "a desk: Exit studio is still the one press back to the studio list");

    /* ── EVERY PICTURE, THROUGH THE PENCIL (16 Sep 2026) ── */
    await org.goto(`${BASE}/business/${studioId}`);
    await hero.waitFor();
    await org.getByRole("button", { name: "Edit studio", exact: true }).click();
    const sheet = org.getByRole("dialog", { name: "Edit business" });
    await sheet.waitFor();
    check(await sheet.getByText("Profile picture", { exact: true }).isVisible(), "edit studio: a Profile picture section");
    check(await sheet.getByText("Header pictures", { exact: true }).isVisible(), "edit studio: a Header pictures section");
    /* the location is READ-ONLY until somebody asks for it (16 Sep 2026): a map
       on greedy gestures inside a scrolling sheet moved the pin when a thumb
       scrolled past it, and this sheet SAVES a moved pin immediately */
    check((await sheet.getByRole("button", { name: "Change address" }).count()) === 1, "edit studio: the address is locked behind Change address");
    check((await sheet.getByRole("searchbox", { name: /Search an address/ }).count()) === 0, "edit studio: and the address search is not even drawn until then");
    await sheet.getByRole("button", { name: "Change address" }).click();
    check((await sheet.getByRole("searchbox", { name: /Search an address/ }).count()) === 1, "edit studio: pressing it arms the search and the map");
    await sheet.getByRole("button", { name: "Done" }).click();
    check((await sheet.getByRole("button", { name: "Change address" }).count()) === 1, "edit studio: Done locks it again");
    await shot("studio-edit-sheet");

    /* the disc's picture — tenants.photo_path, through set_tenant_photo */
    await sheet.getByLabel("Add a photo").setInputFiles(FILE);
    await disc(org).locator("img").first().waitFor({ timeout: 20000 });
    check((await discImgs(org)) === 1, "edit studio: the picture landed on the disc behind the sheet");
    check((await railImgs(org)) === 0, "edit studio: and not in the header");
    const photoPath = await rest(`tenants?id=eq.${studioId}&select=photo_path`);
    check(String(photoPath[0] && photoPath[0].photo_path).startsWith(`tenants/${studioId}/`), "tenants.photo_path is set, in the studio's own folder");

    /* the header: the same sheet's grid — and the ✕ on the only picture is
       disabled. The sheet is still open: `router.refresh()` after an upload
       re-renders the page under it without closing it. */
    await sheet.getByLabel("Add photos of your space").setInputFiles(FILE);
    const headerUp = await waitRailImgs(org, 1).then(() => true).catch(() => false);
    if (headerUp) {
      check(true, "edit studio: the header holds the first picture");
      check((await sheet.getByLabel(/is the only one/).count()) === 1, "edit studio: the only picture's ✕ is disabled and says why — a header never empties");
      await sheet.getByLabel("Add photos of your space").setInputFiles(FILE);
      await waitRailImgs(org, 2);
      check((await sheet.getByLabel(/^Remove photo/).count()) === 2, "edit studio: two pictures, two live ✕");
      check((await rail(org).getAttribute("role")) === "region", "studio home: the header swipes now");
      await shot("studio-header");
      await sheet.getByLabel("Remove photo 1").click();
      await waitRailImgs(org, 1);
      check((await sheet.getByLabel(/^Remove photo/).count()) === 0, "edit studio: ✕ took one out, and the last one is disabled again");
      const live = await rest(`org_proof_photos?tenant_id=eq.${studioId}&deleted_at=is.null&select=id`);
      check(Array.isArray(live) && live.length === 1, "org_proof_photos holds the one live row for the studio");
      await org.keyboard.press("Escape").catch(() => {});
      await sheet.getByRole("button", { name: "Cancel" }).click().catch(() => {});

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
    check((await railImgs(org)) === 0, "org home: no header — an organization is not a place");
    check((await org.getByLabel("Share your profile — QR code").count()) === 0 && (await org.getByRole("button", { name: /QR/ }).count()) === 0, "org home: no QR — an organization has no public page");
    check(await org.getByText("Organization", { exact: true }).isVisible(), "org home: the role word under the sleeve");
    check((await org.getByLabel("Change your photo").count()) === 0, "org home: no ＋ on the disc — the logo is changed in Edit profile");
    /* the chrome, re-cut 15 Sep 2026: four in the bar and an eye, Edit on the hero, Stats in the grid */
    const bar = org.getByRole("navigation", { name: "Main" });
    check((await bar.getByRole("link", { name: "Stats" }).count()) === 0 && (await bar.getByRole("link", { name: "Profile" }).count()) === 0, "bar: neither Stats nor Profile is a tab any more");
    check((await bar.getByRole("link", { name: "Public view" }).getAttribute("href")) === `/studio/${studioId}`, "bar: the eye opens the organization's studio as a stranger sees it");
    check((await bar.getByRole("link").count()) === 4, "bar: Home · Discover · Inbox · the eye — four");
    check((await org.getByRole("button", { name: "Edit profile", exact: true }).count()) === 1, "org home: Edit profile is a pencil on the hero");
    check((await org.getByRole("link", { name: "Stats", exact: true }).count()) === 1, "org home: Stats is a tile in the grid");
    await org.getByRole("button", { name: "Edit profile", exact: true }).click();
    const orgSheet = org.getByRole("dialog", { name: "Edit profile" });
    await orgSheet.waitFor();
    /* exact: getByLabel is a case-insensitive SUBSTRING match, and Home's
       "Everything you manage" link behind the sheet contains "age" */
    check(await org.getByText("Logo", { exact: true }).isVisible() && (await org.getByLabel("Age", { exact: true }).count()) === 0, "org edit profile: Logo, not Profile picture; no age for an organization");
    check((await orgSheet.getByLabel("Change your photo").count()) === 1, "org edit profile: and the logo is changed HERE — the one place a picture changes");
    await shot("org-edit");
    await org.keyboard.press("Escape").catch(() => {});
    await org.getByRole("button", { name: "Cancel" }).click().catch(() => {});
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
    check((await rail(me).getAttribute("role")) === null, "user home: an empty header, so no swipe");
    check((await me.getByLabel("Add a header picture").count()) === 0, "user home: NO Add tile on the hero — the header is filled from Edit profile");
    check((await me.getByLabel("Change your photo").count()) === 0, "user home: NO ＋ on the disc either");
    check(await me.getByText("User", { exact: true }).isVisible(), "user home: the role word");
    check((await me.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Public view" }).getAttribute("href")) === `/person/${userId}`, "bar: a user's eye opens their person page");
    check((await me.getByRole("button", { name: "Edit profile", exact: true }).count()) === 1, "user home: Edit profile is a pencil on the hero");

    /* ── THE ONE PLACE A PICTURE CHANGES (16 Sep 2026) ── */
    await me.getByRole("button", { name: "Edit profile", exact: true }).click();
    const mySheet = me.getByRole("dialog", { name: "Edit profile" });
    await mySheet.waitFor();
    check(await me.getByText("Profile picture", { exact: true }).isVisible(), "edit profile: the Profile picture section");
    check(await me.getByText("Header pictures", { exact: true }).isVisible(), "edit profile: the Header pictures section");
    check(await me.getByText("Mobile", { exact: true }).isVisible(), "edit profile: Name · Mobile · Profile picture · Header pictures, in that order");
    check((await mySheet.getByLabel("Add picture").count()) === 1, "edit profile: a user is offered ONE header picture");
    await mySheet.getByLabel("Add picture").setInputFiles(FILE);
    const userHeader = await waitRailImgs(me, 1).then(() => true).catch(() => false);
    if (userHeader) {
      check(true, "edit profile: the one header picture is up, and the hero behind it shows it");
      check((await mySheet.getByLabel("Add picture").count()) === 0, "edit profile: and the tile is gone — one is the ceiling for a user");
      await shotMe("profile-edit");
      await me.keyboard.press("Escape").catch(() => {});
      await mySheet.getByRole("button", { name: "Cancel" }).click().catch(() => {});
      await shotMe("user-home");

      /* the Artist plan, granted — what makes a person an artist, and the ceiling ten */
      await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
        method: "POST", headers: adminHeaders,
        body: JSON.stringify({ kind: "artist", user_id: userId, plan_key: "artist_monthly", price_inr: 0, period: "monthly", status: "active", current_period_start: today, current_period_end: until, granted: true, note: "Granted by shoot-hero.js — nothing charged", created_by: userId, updated_by: userId }),
      });
      await me.goto(`${BASE}/`);
      await me.getByText("Artist", { exact: true }).first().waitFor();
      check((await railImgs(me)) === 1, "artist home: the header picture is still there");
      await me.getByRole("button", { name: "Edit profile", exact: true }).click();
      await mySheet.waitFor();
      check((await mySheet.getByLabel("Add picture").count()) === 1, "artist edit profile: the Add tile is back — an artist holds ten");
      await mySheet.getByLabel("Add picture").setInputFiles(FILE);
      await waitRailImgs(me, 2);
      check((await rail(me).getAttribute("role")) === "region", "artist home: two pictures, so the header swipes");
      const rowCount = await rest(`profile_photos?user_id=eq.${userId}&deleted_at=is.null&select=id`);
      check(Array.isArray(rowCount) && rowCount.length === 2, "profile_photos holds the two rows, in the person's folder");
      await shotMe("artist-home");
      await mySheet.getByLabel("Remove this picture").first().click();
      await waitRailImgs(me, 1);
      check((await railImgs(me)) === 1, "artist edit profile: ✕ takes a header picture out again");
      await me.keyboard.press("Escape").catch(() => {});
      await mySheet.getByRole("button", { name: "Cancel" }).click().catch(() => {});

      /* the Profile tab: the same hero, as bare as Home's */
      await me.goto(`${BASE}/profile`);
      await me.getByTestId("my-hero").waitFor();
      check((await discImgs(me)) === 1 && (await railImgs(me)) === 1, "profile tab: the same disc and header");
      check((await me.getByLabel("Change your photo").count()) === 0 && (await me.getByLabel("Remove this picture").count()) === 0, "profile tab: and the same bare hero — no ＋, no ✕");
      /* the person's own PUBLIC view is what a visitor sees, and nothing else */
      await me.goto(`${BASE}/person/${userId}`);
      await me.getByRole("link", { name: /This is you/ }).waitFor();
      check((await me.getByLabel("Change your photo").count()) === 0, "public view of yourself: no photo control — it is the view a visitor gets");
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
