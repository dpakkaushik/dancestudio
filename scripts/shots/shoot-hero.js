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

   Also: the "Managing {studio}" strip is gone from EVERY page (18 Sep 2026).

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
/* THE CROPPER (18 Sep 2026): every picture stops in "Crop & preview" first, so a
   file put in is followed by one press of "Use this photo" per picture */
const useIt = async (page, n = 1) => {
  const dialog = page.getByRole("dialog", { name: "Crop & preview" });
  for (let k = 0; k < n; k += 1) {
    if (n > 1) await dialog.getByText(`${k + 1} of ${n}`).waitFor();
    await dialog.getByRole("button", { name: "Use this photo" }).click();
  }
  await dialog.waitFor({ state: "detached" });
};

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

/* the one city dropdown (19 Sep 2026): always through "Search another city…" */
async function pickCity(page, city) {
  /* a closed list since later on 19 Sep 2026: the city is one of the registry's options */
  await page.getByLabel("Choose a city").first().selectOption(city);
}

/* the onboarding, as e2e/happy-path.spec.ts walks it */
async function onboard(page, name, role, city) {
  await page.waitForURL(/\/onboarding/);
  const isOrg = role === "Organization";
  if (isOrg) await page.getByText("Organization", { exact: true }).click();
  await page.locator('input[name="name"]').fill(name);
  await pickCity(page, city);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Add a photo").setInputFiles(FILE);
  await useIt(page);
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
    /* the browser's own complaints are the first thing to read when a wait
       below times out — printed, never asserted (a third-party warning is not
       a failed check) */
    org.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 300)); });
    org.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 300)));
    /* and every failed request, with its body — a 400 from Storage or PostgREST
       says in words what a blank "Failed to load resource" does not */
    org.on("response", async (r) => {
      if (r.status() >= 400 && !r.url().includes("/_next/")) {
        let body = "";
        try { body = (await r.text()).slice(0, 300); } catch { /* no body */ }
        console.log("HTTP", r.status(), r.request().method(), r.url().slice(0, 180), body);
      }
    });
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
    await pickCity(org, "Pune");
    await org.getByLabel("Room 1 name").fill("Studio A");
    await org.getByLabel("Add a dance style").selectOption("Hip-Hop");
    await org.getByRole("button", { name: "Create studio" }).click();
    await org.getByText("EEE Dance Studio").first().waitFor();
    const rows = await rest(`business_members?user_id=eq.${orgId}&member_role=eq.owner&deleted_at=is.null&select=business_id,businesses(type)`);
    studioId = (rows.find((r) => r.businesses && r.businesses.type === "studio") || {}).business_id;
    if (!studioId) throw new Error("the studio was not created");
    /* the badge, a granted ₹0 subscription and the listing, so the page is the one a live studio sees */
    await fetch(`${supabaseUrl}/rest/v1/businesses?id=eq.${studioId}`, { method: "PATCH", headers: adminHeaders, body: JSON.stringify({ verified_at: new Date().toISOString() }) });
    await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
      method: "POST", headers: adminHeaders,
      body: JSON.stringify({ kind: "studio", user_id: orgId, business_id: studioId, plan_key: "studio_monthly", price_inr: 0, period: "monthly", status: "active", current_period_start: today, current_period_end: until, granted: true, note: "Granted by shoot-hero.js — nothing charged", created_by: orgId, updated_by: orgId }),
    });
    await fetch(`${supabaseUrl}/rest/v1/businesses?id=eq.${studioId}`, { method: "PATCH", headers: adminHeaders, body: JSON.stringify({ visibility: "listed" }) });

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
    /* WAIT, not a one-shot look (19 Sep 2026): the studio home streams behind a
       loading boundary now, so the URL changes before the page arrives */
    await org.getByText("SUBSCRIPTION", { exact: true }).waitFor({ timeout: 15000 }).catch(() => {});
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
    check((await org.getByText(/^Managing/).count()) === 0, "studio home: no Managing strip");
    check((await org.getByRole("link", { name: "Media", exact: true }).count()) === 1, "studio home: a Media tile among the tools");
    check((await org.getByRole("link", { name: "Stats", exact: true }).count()) === 1, "studio home: one Stats door — the chip beside the QR (it left the grid on 18 Sep 2026)");
    /* R15, 15 Sep 2026: a studio cannot host an event, so its home offers no door to one */
    check((await org.getByRole("link", { name: "Events", exact: true }).count()) === 0, "studio home: NO Events tile — a studio does not host events");
    check((await org.getByRole("button", { name: "Edit studio", exact: true }).count()) === 1, "studio home: the owner's pencil on the hero's corner");
    check((await org.getByRole("link", { name: "Public view", exact: true }).getAttribute("href")) === `/studio/${studioId}`, "studio home: the eye opens the studio's public page");
    /* 19 Sep 2026, the user: "clicking on profile photo on any home tab should
       take to the profile page for that user" — the disc is the SECOND door to
       the same page, and it says which page it opens so the eye stays tellable
       apart from it (two controls answering to one name is not a hierarchy) */
    check((await org.getByRole("link", { name: "Open the studio's public page", exact: true }).getAttribute("href")) === `/studio/${studioId}`, "studio home: the DISC opens the same public page (19 Sep 2026)");
    /* Discover joined the entity's bar the same day: allowed, while booking is not */
    const studioBar = org.getByRole("navigation", { name: "Studio" });
    check((await studioBar.getByRole("link", { name: "Discover" }).count()) === 1 && (await studioBar.getByRole("link").count()) === 3, "studio bar: Home · Discover · Inbox — three (19 Sep 2026)");
    await shot("studio-initials");

    /* ⚠ AND IT IS OFF THE DESKS TOO NOW (18 Sep 2026, the user: "remove the blue
       bar which shows exit studio from all pages"). It was kept there on 16 Sep
       with the argument that a tool hero names the tool and nothing names the
       studio; the user has answered that argument, and `WorkspaceStrip` is
       deleted rather than hidden. The back chip is the way out of a desk. */
    await org.goto(`${BASE}/business/${studioId}/classes`);
    /* the register's hero is the tool card, not a heading element (the 18 Sep
       class-form re-cut drew it as a div) — its one stable control is the
       Create class pill, so that is what says the page is up */
    await org.getByRole("link", { name: /Create class/ }).waitFor();
    check((await org.getByText(/^Managing/).count()) === 0, "a desk: no Managing strip either — it is gone from every page");
    check((await org.getByRole("link", { name: /Leave this studio/ }).count()) === 0, "a desk: and no blue Exit studio pill");

    /* ── EVERY PICTURE, THROUGH THE PENCIL (16 Sep 2026) ── */
    await org.goto(`${BASE}/business/${studioId}`);
    await hero.waitFor();
    await org.getByRole("button", { name: "Edit studio", exact: true }).click();
    const sheet = org.getByRole("dialog", { name: "Edit business" });
    await sheet.waitFor();
    check(await sheet.getByText("Update profile", { exact: true }).isVisible(), "edit studio: an Update profile block");
    check(await sheet.getByText("Update header", { exact: true }).isVisible(), "edit studio: an Update header block");
    /* 16 Sep 2026: ONE label style for every field on the form — the second,
       larger heading that briefly headed two blocks out of five is gone */
    check((await sheet.getByText("Phone", { exact: true }).count()) === 1, "edit studio: the phone field is called Phone, not Phone (Call button)");
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

    /* the disc's picture — businesses.profile_photo_path, through set_business_profile_photo */
    await sheet.getByLabel("Add a photo").setInputFiles(FILE);
    await useIt(org);
    /* a wait that says what it saw when it fails, rather than ending the run:
       the sheet's own status line and how many dialogs are open */
    const discUp = await disc(org).locator("img").first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
    if (!discUp) {
      const words = await sheet.locator('[role="status"], [role="alert"]').allTextContents().catch(() => []);
      console.log("DISC DID NOT LAND — sheet says:", JSON.stringify(words), "| open dialogs:", await org.getByRole("dialog").count(), "| disc imgs:", await discImgs(org), "| url:", org.url());
    }
    check(discUp && (await discImgs(org)) === 1, "edit studio: the picture landed on the disc behind the sheet");
    check((await railImgs(org)) === 0, "edit studio: and not in the header");
    const photoPath = await rest(`businesses?id=eq.${studioId}&select=profile_photo_path`);
    check(String(photoPath[0] && photoPath[0].profile_photo_path).startsWith(`tenants/${studioId}/`), "businesses.profile_photo_path is set, in the studio's own folder");

    /* ── THE HEADER IS A DRAFT (16 Sep 2026) ────────────────────────────────
       The user pressed ✕ on four pictures, pressed CANCEL, and lost all four.
       These checks are that sentence, both ways round: staged work shows in the
       sheet and NOT on the page behind it; Cancel leaves everything alone; Save
       is what moves anything at all. ⚠ This block used to assert the BUG — it
       pressed ✕ and then waited for the rail behind the sheet to drop. */
    const studioRows = async () => {
      const live = await rest(`studio_photos?business_id=eq.${studioId}&deleted_at=is.null&select=id`);
      return Array.isArray(live) ? live.length : -1;
    };
    await sheet.getByLabel("Add photos of your space").setInputFiles(FILE);
    await useIt(org);
    const headerUp = await sheet
      .getByLabel(/is the only one/)
      .first()
      .waitFor({ timeout: 25000 })
      .then(() => true)
      .catch(() => false);
    if (headerUp) {
      check(true, "edit studio: a staged picture appears in the sheet");
      check((await railImgs(org)) === 0, "edit studio: and NOT on the page behind it — nothing is saved yet");
      check((await studioRows()) === 0, "edit studio: and the database still holds nothing");
      check((await sheet.getByLabel(/is the only one/).count()) === 1, "edit studio: the only picture's ✕ is disabled and says why — a header never empties");
      await sheet.getByRole("button", { name: "Save" }).click();
      await waitRailImgs(org, 1);
      check((await studioRows()) === 1, "edit studio: Save is what put the picture on the record");

      /* ⚠ THE REPORTED BUG, AS A STANDING CHECK */
      await org.getByRole("button", { name: "Edit studio", exact: true }).click();
      await sheet.waitFor();
      await sheet.getByLabel("Add photos of your space").setInputFiles(FILE);
      await useIt(org);
      await sheet.getByLabel("Remove photo 1").first().waitFor({ timeout: 25000 });
      check((await sheet.getByLabel(/^Remove photo/).count()) === 2, "edit studio: two pictures, two live ✕");
      await sheet.getByLabel("Remove photo 1").click();
      check((await sheet.getByLabel(/^Undo removing photo/).count()) === 1, "edit studio: ✕ marks it and offers ↩ — the picture is not gone");
      check((await studioRows()) === 1, "⚠ THE BUG: a pressed ✕ has not touched the database");
      await sheet.getByRole("button", { name: "Cancel" }).click();
      check((await studioRows()) === 1, "⚠ THE BUG: and Cancel left the picture exactly where it was");
      await org.getByRole("button", { name: "Edit studio", exact: true }).click();
      await sheet.waitFor();
      check((await sheet.getByLabel(/is the only one/).count()) === 1, "edit studio: reopening shows it still there, and still the only one");

      /* the gallery opens a picture full size */
      await sheet.getByLabel("Open picture 1").click();
      check((await org.getByRole("dialog", { name: /picture 1 of/ }).count()) === 1, "edit studio: pressing a picture opens it full size");
      await org.getByRole("button", { name: "Close the picture" }).click();
      check((await org.getByRole("dialog", { name: /picture 1 of/ }).count()) === 0, "edit studio: and it closes again");
      await shot("studio-header");

      /* a second picture, saved — then a removal, saved */
      await sheet.getByLabel("Add photos of your space").setInputFiles(FILE);
      await useIt(org);
      await sheet.getByLabel("Remove photo 2").first().waitFor({ timeout: 25000 });
      await sheet.getByRole("button", { name: "Save" }).click();
      await waitRailImgs(org, 2);
      check((await studioRows()) === 2, "edit studio: Save committed the second one too");
      await org.getByRole("button", { name: "Edit studio", exact: true }).click();
      await sheet.waitFor();
      await sheet.getByLabel("Remove photo 1").click();
      await sheet.getByRole("button", { name: "Save" }).click();
      await waitRailImgs(org, 1);
      check((await studioRows()) === 1, "edit studio: and Save is what removes one, too");

      /* the Media desk: the same two pictures as a desk */
      await org.goto(`${BASE}/business/${studioId}/media`);
      await org.getByRole("heading", { name: "Media", exact: true }).waitFor();
      check((await org.getByTestId("media-disc").locator("img").count()) === 1, "media desk: the disc with its picture");
      check(await org.getByText("1 / 5–10").isVisible(), "media desk: the header count");
      check((await org.getByLabel(/is the only one/).count()) === 1, "media desk: the only picture's ✕ is disabled and says why");
      await shot("studio-media");

      /* the public page reads the header through business_header_photos, which
         arrives with migration 20260915090000 — say so on the line when it is
         not there yet, so a red line reads as "apply the migration" and not
         as a broken page */
      const rpcProbe = await fetch(`${supabaseUrl}/rest/v1/rpc/business_header_photos`, { method: "POST", headers: adminHeaders, body: JSON.stringify({ p_business_id: studioId }) });
      const rpcNote = rpcProbe.ok ? "" : " (NEEDS migration 20260915090000 — business_header_photos is not on the database)";
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

    /* the organization's Home — the same hero, its logo on the disc, an empty header (none added yet — it may hold ten since 19 Sep 2026), and a QR to its own page */
    await org.goto(`${BASE}/`);
    await org.getByRole("heading", { name: "EEE Dance Company", exact: true }).waitFor();
    check((await discImgs(org)) === 1, "org home: the logo is on the disc");
    check((await railImgs(org)) === 0, "org home: an empty header — nothing added yet (an organization holds up to ten since 19 Sep 2026)");
    check((await org.getByLabel("Share this profile — QR code").count()) === 1, "org home: a QR — an organization has a page of its own (18 Sep 2026)");
    check(await org.getByText("Organization", { exact: true }).isVisible(), "org home: the role word under the sleeve");
    check((await org.getByLabel("Change your photo").count()) === 0, "org home: no ＋ on the disc — the logo is changed behind it, in Your pictures");
    /* the chrome, re-cut 19 Sep 2026: THREE in the bar, the DISC is the door to the public page (the eye left Home
       later the same day — the user: "clicking on the profile photo on home tab takes to profile so can remove
       the eye from top right on home"), Stats the chip */
    const bar = org.getByRole("navigation", { name: "Main" });
    check((await bar.getByRole("link", { name: "Stats" }).count()) === 0 && (await bar.getByRole("link", { name: "Profile" }).count()) === 0, "bar: neither Stats nor Profile is a tab any more");
    check((await bar.getByRole("link", { name: "Public view" }).count()) === 0, "bar: the eye left the bar (19 Sep 2026, the user: 'remove profile tab from navbar')");
    check((await bar.getByRole("link").count()) === 3, "bar: Home · Discover · Inbox — three");
    /* 19 Sep 2026: the corner is the EYE alone — the pencil went into Settings
       ("all edit profile options to be removed from home and profile pages") and
       the DISC became the door to both picture sections ("should be able to click
       and view both pictures sections when clicking on that photo") */
    check((await org.getByRole("link", { name: "Public view", exact: true }).count()) === 1 && (await org.getByRole("link", { name: "Public view", exact: true }).getAttribute("href")) === `/org/${orgId}`, "org home: one eye in the corner, opening the organization's own page as a stranger sees it");
    check((await org.getByRole("button", { name: "Edit profile", exact: true }).count()) === 0, "org home: NO pencil — Edit profile is Settings' first option (19 Sep 2026)");
    check((await org.getByRole("button", { name: "Your pictures", exact: true }).count()) === 1, "org home: the disc opens Your pictures");
    check((await org.getByRole("link", { name: "Stats", exact: true }).count()) === 1, "org home: one Stats door — the chip beside the name (a tile until 18 Sep 2026)");
    await org.getByRole("button", { name: "Your pictures", exact: true }).click();
    const orgPics = org.getByRole("dialog", { name: "Your pictures" });
    await orgPics.waitFor();
    check(await org.getByText("Logo", { exact: true }).isVisible(), "org pictures: an organization's disc is its Logo");
    check((await orgPics.getByLabel("Change your photo").count()) === 1, "org pictures: and the logo is changed HERE — the one place a picture changes");
    await shot("org-pictures");
    await orgPics.getByRole("button", { name: "Cancel" }).click().catch(() => {});
    /* and the words are behind the gear */
    await org.goto(`${BASE}/profile?settings=1`);
    const orgSettings = org.getByRole("dialog", { name: "Settings" });
    await orgSettings.waitFor();
    check((await orgSettings.getByRole("button", { name: "Edit profile" }).count()) === 1, "settings: Edit profile is the first option (19 Sep 2026)");
    await orgSettings.getByRole("button", { name: "Edit profile" }).click();
    const orgSheet = org.getByRole("dialog", { name: "Edit profile" });
    await orgSheet.waitFor();
    /* exact: getByLabel is a case-insensitive SUBSTRING match, so a bare "Age"
       finds any label on the page that merely contains those three letters */
    check((await org.getByLabel("Age", { exact: true }).count()) === 0, "org edit profile: no age for an organization");
    check((await orgSheet.getByLabel("Change your photo").count()) === 0 && (await orgSheet.getByLabel("Add picture").count()) === 0, "org edit profile: and NO pictures in it — they are behind the disc on Home");
    await shot("org-edit");
    await org.keyboard.press("Escape").catch(() => {});
    await orgSheet.getByRole("button", { name: "Cancel" }).click().catch(() => {});
    await org.goto(`${BASE}/`);
    await shot("org-home");
    await org.close();

    /* ── TWO: a person — one header picture; then an artist — up to five (19 Sep 2026; ten before) ── */
    const me = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
    const shotMe = shotOf(me);
    userId = await signUp(me, `hero-user-${stamp}@example.com`);
    await onboard(me, "Rhea Kapoor", "User", "Pune");
    await me.goto(`${BASE}/`);
    await me.getByRole("heading", { name: "Rhea Kapoor", exact: true }).waitFor();
    check((await discImgs(me)) === 1, "user home: the profile photo is on the disc");
    check((await rail(me).getAttribute("role")) === null, "user home: an empty header, so no swipe");
    check((await me.getByLabel("Add a header picture").count()) === 0, "user home: NO Add tile on the hero — the header is filled behind the disc");
    check((await me.getByLabel("Change your photo").count()) === 0, "user home: NO ＋ on the disc either");
    check(await me.getByText("User", { exact: true }).isVisible(), "user home: the role word");
    check((await me.getByRole("link", { name: "Public view", exact: true }).count()) === 1 && (await me.getByRole("link", { name: "Public view", exact: true }).getAttribute("href")) === `/person/${userId}`, "user home: one eye in the corner, opening their person page");
    check((await me.getByRole("button", { name: "Edit profile", exact: true }).count()) === 0, "user home: NO pencil — Edit profile is Settings' first option (19 Sep 2026)");
    /* THE BAND ON HOME (19 Sep 2026): the two figures, the styles with their ＋,
       the links right under them with theirs — and NO rank */
    check((await me.getByTestId("home-followers").count()) === 1 && (await me.getByTestId("home-following").count()) === 1, "user home: Followers and Following, both clickable (19 Sep 2026)");
    check((await me.getByRole("button", { name: "Add a dance style" }).count()) === 1, "user home: the styles are edited HERE and nowhere else");
    check((await me.getByRole("button", { name: "Add a link" }).count()) === 1, "user home: and the links, right below them");
    check((await me.getByRole("link", { name: /rank/i }).count()) === 0, "user home: no rank (19 Sep 2026, the user: 'Remove rank from home')");

    /* ── THE ONE PLACE A PICTURE CHANGES (16 Sep 2026; behind the disc since 19 Sep) ── */
    await me.getByRole("button", { name: "Your pictures", exact: true }).click();
    const mySheet = me.getByRole("dialog", { name: "Your pictures" });
    await mySheet.waitFor();
    check(await me.getByText("Profile picture", { exact: true }).isVisible(), "your pictures: a Profile picture block");
    check(await me.getByText("Header pictures", { exact: true }).isVisible(), "your pictures: and a Header pictures block — BOTH sections, which is the ask");
    check((await mySheet.getByLabel("Add picture").count()) === 1, "your pictures: a user is offered ONE header picture");
    const personRows = async () => {
      const live = await rest(`profile_header_photos?user_id=eq.${userId}&deleted_at=is.null&select=id`);
      return Array.isArray(live) ? live.length : -1;
    };
    await mySheet.getByLabel("Add picture").setInputFiles(FILE);
    await useIt(me);
    const userHeader = await mySheet
      .getByLabel("Remove photo 1")
      .first()
      .waitFor({ timeout: 25000 })
      .then(() => true)
      .catch(() => false);
    if (userHeader) {
      check(true, "edit profile: a staged picture appears in the sheet");
      check((await mySheet.getByLabel("Add picture").count()) === 0, "edit profile: and the tile is gone — one is the ceiling for a user");
      check((await railImgs(me)) === 0 && (await personRows()) === 0, "edit profile: nothing on the page or in the database until Save");
      await shotMe("profile-edit");
      /* Cancel discards a staged ADD as completely as a staged removal */
      await mySheet.getByRole("button", { name: "Cancel" }).click();
      check((await personRows()) === 0, "edit profile: Cancel threw the staged picture away — nothing was uploaded");
      await me.getByRole("button", { name: "Your pictures", exact: true }).click();
      await mySheet.waitFor();
      await mySheet.getByLabel("Add picture").setInputFiles(FILE);
      await useIt(me);
      await mySheet.getByLabel("Remove photo 1").first().waitFor({ timeout: 25000 });
      await mySheet.getByRole("button", { name: "Save" }).click();
      await waitRailImgs(me, 1);
      check((await personRows()) === 1, "edit profile: and Save is what puts one on the record");
      await shotMe("user-home");

      /* the Artist plan, granted — what makes a person an artist, and the ceiling ten */
      await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
        method: "POST", headers: adminHeaders,
        body: JSON.stringify({ kind: "artist", user_id: userId, plan_key: "artist_monthly", price_inr: 0, period: "monthly", status: "active", current_period_start: today, current_period_end: until, granted: true, note: "Granted by shoot-hero.js — nothing charged", created_by: userId, updated_by: userId }),
      });
      await me.goto(`${BASE}/`);
      await me.getByText("Artist", { exact: true }).first().waitFor();
      check((await railImgs(me)) === 1, "artist home: the header picture is still there");
      await me.getByRole("button", { name: "Your pictures", exact: true }).click();
      await mySheet.waitFor();
      check((await mySheet.getByLabel("Add picture").count()) === 1, "artist edit profile: the Add tile is back — an artist holds ten");
      await mySheet.getByLabel("Add picture").setInputFiles(FILE);
      await useIt(me);
      await mySheet.getByLabel("Remove photo 2").first().waitFor({ timeout: 25000 });
      await mySheet.getByRole("button", { name: "Save" }).click();
      await waitRailImgs(me, 2);
      check((await rail(me).getAttribute("role")) === "region", "artist home: two pictures, so the header swipes");
      check((await personRows()) === 2, "profile_header_photos holds the two rows, in the person's folder");
      await shotMe("artist-home");
      /* a person's floor is 0 — `remove_my_header_photo` has no minimum */
      await me.getByRole("button", { name: "Your pictures", exact: true }).click();
      await mySheet.waitFor();
      await mySheet.getByLabel("Remove photo 1").click();
      check((await personRows()) === 2, "artist edit profile: a pressed ✕ has not touched the database");
      await mySheet.getByRole("button", { name: "Save" }).click();
      await waitRailImgs(me, 1);
      check((await personRows()) === 1, "artist edit profile: Save is what takes one out");

      /* the Profile tab: the same hero, as bare as Home's */
      await me.goto(`${BASE}/profile`);
      await me.getByTestId("my-hero").waitFor();
      check((await discImgs(me)) === 1 && (await railImgs(me)) === 1, "profile tab: the same disc and header");
      check((await me.getByLabel("Change your photo").count()) === 0 && (await me.getByLabel(/^Remove photo/).count()) === 0, "profile tab: and the same bare hero — no ＋, no ✕");
      /* 19 Sep 2026: the disc is a door here too, and there is no rank beside the figures */
      check((await me.getByRole("link", { name: "Open your public page", exact: true }).getAttribute("href")) === `/person/${userId}`, "profile tab: the disc opens your own public page");
      check((await me.getByText(/rank$/).count()) === 0, "profile tab: no rank (19 Sep 2026, the user: 'remove rank from profile tab')");
      /* and no editing at all: the pencil went into Settings and the styles and
         links kept their rows and lost their ＋ (19 Sep 2026) */
      check((await me.getByRole("button", { name: "Edit profile", exact: true }).count()) === 0, "profile tab: NO pencil — Edit profile is Settings' first option");
      check((await me.getByRole("button", { name: "Add a dance style" }).count()) === 0 && (await me.getByRole("button", { name: "Add a link" }).count()) === 0, "profile tab: the styles and the links are SHOWN here and changed on Home");
      /* the person's own PUBLIC view is what a visitor sees, and nothing else */
      await me.goto(`${BASE}/person/${userId}`);
      await me.getByTestId("person-hero").waitFor();
      /* "This is you · Your record" is gone (19 Sep 2026): no Follow on your own page, and Stats is the chip */
      check((await me.getByRole("button", { name: "Follow" }).count()) === 0 && (await me.getByRole("link", { name: "Stats", exact: true }).getAttribute("href")) === "/stats", "public view of yourself: no Follow, and the Stats chip opens your own record");
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
    if (studioId) await fetch(`${supabaseUrl}/rest/v1/businesses?id=eq.${studioId}`, { method: "DELETE", headers: adminHeaders });
    /* every business either account owns goes with it (18 Sep 2026): the
       organization's hosting row, and the artist page Home provisions for the
       user once the plan is granted — otherwise an ownerless row is left behind */
    for (const uid of [orgId, userId]) {
      if (!uid) continue;
      const owned = await rest(`business_members?user_id=eq.${uid}&member_role=eq.owner&select=business_id`);
      if (Array.isArray(owned) && owned.length) {
        await fetch(`${supabaseUrl}/rest/v1/businesses?id=in.(${owned.map((o) => o.business_id).join(",")})`, { method: "DELETE", headers: adminHeaders });
      }
    }
    if (orgId) await fetch(`${supabaseUrl}/auth/v1/admin/users/${orgId}`, { method: "DELETE", headers: adminHeaders });
    if (userId) await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: adminHeaders });
    await browser.close();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
  }
})();
