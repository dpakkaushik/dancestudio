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
     a STUDIO OWNER → their studio → /business/{id}: the empty header and the
       initials disc, with NO ＋ and NO Add tile on them; the owner's pencil
       opens Edit studio, where the disc's picture goes up, the header's photos
       go up, the only picture's ✕ is disabled (a header never empties) and a
       second one's is not; the location is LOCKED behind Change address; the
       Media desk shows the same two pictures; the PUBLIC page shows the header
       to the owner AND to a signed-out stranger (the storage policy for a
       listed studio's photos); then their own Home — the photo on the disc, an
       empty header, the QR;
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
  await page.getByLabel("Choose a city").first().click();
  await page.getByRole("option", { name: city, exact: true }).click();
}

/* the onboarding, as e2e/happy-path.spec.ts walks it.
   ⚠ THE `role` ARGUMENT AND ITS WHOLE BRANCH WENT ON 29 Sep 2026. Onboarding
   asked who was signing up — a person or an ORGANIZATION — and an organization
   was given a Logo rather than a profile photo and a shorter walk with no
   styles and no links. The organization LOGIN was retired on 26 Sep, so both
   callers had been passing "User" since then and the branch had rendered for
   nobody for three days: a parameter every caller passes the same value to is
   a parameter that is lying about the choice it offers. */
async function onboard(page, name, city) {
  await page.waitForURL(/\/onboarding/);
  await page.locator('input[name="name"]').fill(name);
  await pickCity(page, city);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Add a photo").setInputFiles(FILE);
  await useIt(page);
  await page.getByLabel("Your profile photo", { exact: true }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByText("Your dance styles").waitFor();
  await page.getByRole("button", { name: "Hip-Hop", exact: true }).click();
  await page.getByRole("button", { name: "Continue · 1 style" }).click();
  await page.getByText("Your social links").waitFor();
  await page.getByRole("button", { name: "Skip for now →" }).click();
  await page.getByText(/Take a bow, /).waitFor();
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
/* EDIT MODE (26 Sep 2026): every editor on a home appears with the corner pencil,
   so a script presses it first — idempotent, because a page reload turns it off */
const enterEdit = async (page) => {
  const pencil = page.getByRole("button", { name: "Edit profile", exact: true });
  await pencil.waitFor({ timeout: 20000 });
  if ((await pencil.getAttribute("aria-pressed")) !== "true") await pencil.click();
};

(async () => {
  const browser = await chromium.launch();
  const stamp = Date.now().toString(36);
  let ownerId = null;
  let userId = null;
  let studioId = null;
  const today = new Date().toISOString().slice(0, 10);
  const until = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  try {
    /* ── ONE: the studio owner and their studio ───────────────────────────── */
    const owner = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
    /* the browser's own complaints are the first thing to read when a wait
       below times out — printed, never asserted (a third-party warning is not
       a failed check) */
    owner.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 300)); });
    owner.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 300)));
    /* and every failed request, with its body — a 400 from Storage or PostgREST
       says in words what a blank "Failed to load resource" does not */
    owner.on("response", async (r) => {
      if (r.status() >= 400 && !r.url().includes("/_next/")) {
        let body = "";
        try { body = (await r.text()).slice(0, 300); } catch { /* no body */ }
        console.log("HTTP", r.status(), r.request().method(), r.url().slice(0, 180), body);
      }
    });
    const shot = shotOf(owner);
    ownerId = await signUp(owner, `hero-owner-${stamp}@example.com`);
    /* 26 Sep 2026: a PERSON. "EEE Dance Company" is this person's own name and
       they open the studio themselves.
       ⚠ AN ORG BUSINESS WAS MADE HERE UNTIL 29 Sep 2026 — "EEE Dance Company
       Events", with a GST number and a granted ₹5,000 mandate through the
       service role so it read PUBLIC (org_is_public) — and its own home and its
       public page were driven at the foot of this script. It is gone, and so is
       everything it was for. */
    await onboard(owner, "EEE Dance Company", "New Delhi");
    await owner.goto(`${BASE}/business`);
    /* ⚠ BY ITS ACCESSIBLE NAME, NOT ITS TEXT (20 Sep 2026, the user: "fix add
       studio button also similarly"). It was a dashed row whose whole content
       was the string "＋ Add studio"; it is the shared `DeskAddButton` pill now,
       whose ＋ is an aria-hidden SVG — so the text node is "Add studio" and the
       NAME is what every other add button in the app is found by. */
    await owner.getByRole("button", { name: "Add studio" }).first().click();
    await owner.locator('input[name="name"]').fill("EEE Dance Studio");
    await owner.locator('input[name="area"]').fill("Kothrud");
    await pickCity(owner, "Pune");
    /* the sheet asks for a number and an email now (26 Sep 2026) */
    await owner.locator('input[name="phone"]').fill("+919876543210");
    await owner.locator('input[name="contact_email"]').fill(`hero-studio-${stamp}@example.com`);
    await owner.getByLabel("Room 1 name").fill("Studio A");
    /* the app's one style picker, never a native select (parity F4/W2) */
    await owner.getByRole("button", { name: "Add a dance style", exact: true }).click();
    await owner.getByRole("button", { name: "Hip-Hop", exact: true }).click();
    await owner.getByRole("button", { name: "Create studio" }).click();
    await owner.getByText("EEE Dance Studio").first().waitFor();
    const rows = await rest(`business_members?user_id=eq.${ownerId}&member_role=eq.owner&deleted_at=is.null&select=business_id,businesses(type)`);
    studioId = (rows.find((r) => r.businesses && r.businesses.type === "studio") || {}).business_id;
    if (!studioId) throw new Error("the studio was not created");
    /* the badge, a granted ₹0 subscription and the listing, so the page is the one a live studio sees */
    await fetch(`${supabaseUrl}/rest/v1/businesses?id=eq.${studioId}`, { method: "PATCH", headers: adminHeaders, body: JSON.stringify({ verified_at: new Date().toISOString() }) });
    await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
      method: "POST", headers: adminHeaders,
      body: JSON.stringify({ kind: "studio", user_id: ownerId, business_id: studioId, plan_key: "studio_monthly", price_inr: 0, period: "monthly", status: "active", current_period_start: today, current_period_end: until, granted: true, note: "Granted by shoot-hero.js — nothing charged", created_by: ownerId, updated_by: ownerId }),
    });
    await fetch(`${supabaseUrl}/rest/v1/businesses?id=eq.${studioId}`, { method: "PATCH", headers: adminHeaders, body: JSON.stringify({ visibility: "listed" }) });

    /* ── THE HUB, ONE CARD PER STUDIO (15 Sep 2026) ── */
    await owner.goto(`${BASE}/business`);
    const card = owner.getByTestId("studio-card").first();
    await card.waitFor();
    check((await owner.getByTestId("studio-card").count()) === 1, "hub: one card for the one studio");
    check((await owner.getByText("VERIFIED STUDIO").count()) === 0, "hub: no VERIFIED STUDIO line — the tick beside the name is the whole state");
    check((await card.getByLabel("Verified").count()) === 1, "hub: the verified tick sits beside the studio name");
    check((await owner.getByText("Manage ›").count()) === 0, "hub: no Manage word — the card itself is the door");
    check((await card.getByRole("link", { name: /open the studio/ }).getAttribute("href")) === `/business/${studioId}`, "hub: the card opens the manage screen");
    check((await owner.getByTestId("studio-live").count()) === 1, "hub: LIVE, not PUBLIC + RENEWS");
    check((await owner.getByText("Stop renewing").count()) === 0, "hub: the renewal detail is off the card");
    /* ⚠ "the hub carries no Your-events block" was checked here from 15 Sep 2026
       until 29 Sep, when events went: a check that can only ever pass is not a
       check, so it went with them rather than being kept as reassurance. */
    await shot("hub-one-card");
    /* pressing the card lands on the studio's home */
    await card.getByRole("link", { name: /open the studio/ }).click();
    await owner.waitForURL(new RegExp(`/business/${studioId}$`));
    check(true, "hub: pressing the card opened the studio's home");
    /* ⚠ AND THE CANCEL DOOR SURVIVED ITS SECOND MOVE (20 Sep 2026, the user:
       "remove your conversation with dance os and subscription from just the home
       tab for studio and organization profiles as already being handled from
       settings"). It was on the hub until 15 Sep, on the studio's own home until
       today, and it is on `/subscription` — Settings' own Subscription tile —
       now. There is exactly ONE Stop renewing in this app; this check is what
       stops a move from quietly becoming a deletion. */
    check((await owner.getByTestId("studio-subscription").count()) === 0, "studio home: NO subscription strip — it is Settings' Subscription tile now (20 Sep 2026)");
    await owner.goto(`${BASE}/subscription`);
    const strip = owner.getByTestId("studio-subscription").first();
    await strip.waitFor({ timeout: 15000 }).catch(() => {});
    check(await strip.isVisible(), "subscription: the studio's own strip is here, under Settings › Subscription");
    check(await strip.getByText("EEE Dance Studio", { exact: true }).isVisible(), "subscription: and it NAMES the studio — one person can run several, so the heading is which one");
    /* this studio's plan is a GRANT (₹0, set up above) and a grant does not
       renew — so the strip says so and offers no Stop renewing, which is the
       honest answer. The paid-mandate path that DOES offer it needs a real
       Cashfree authorisation, which no script can drive; `rls-proof-*` and the
       live sandbox cover that. */
    /* scoped to THE STUDIO's strip: this account owned an organization business
       too until 29 Sep 2026, and its own granted strip sat under YOUR
       ORGANIZATIONS on this same page. The scoping stays — a second studio
       would put a second strip here for the same reason. */
    check(await strip.getByText("GRANTED", { exact: true }).isVisible(), "subscription: the strip names the standing (GRANTED)");
    check((await owner.getByRole("button", { name: /Stop .* renewing/ }).count()) === 0, "subscription: a grant offers no Stop renewing — there is nothing to stop");
    await owner.goto(`${BASE}/business/${studioId}`);

    /* the studio's own home: an empty header and the initials disc, and NOTHING
       on either of them to press (16 Sep 2026) */
    await owner.goto(`${BASE}/business/${studioId}`);
    const hero = owner.getByTestId("studio-hero");
    await hero.waitFor();
    check(await owner.getByRole("heading", { name: "EEE Dance Studio", exact: true }).isVisible(), "studio home: the name is the heading");
    /* ⚠ THE WORD CARRIES THE NUMBER (20 Sep 2026, the user: "Id should be placed
       like for eg. Artist-000123 together there should be no gap"). They are ONE
       span now, not two flex siblings, so the exact text is "Studio-000123" —
       which is also what a screen reader says, and was the reason for nesting
       them: side by side they looked joined and read as two words with a space. */
    check(await owner.getByText(/^Studio(-\d{6})?$/).first().isVisible(), "studio home: STUDIO over the name, with the studio's number against it");
    check((await hero.locator("img").count()) === 0, "studio home: no picture anywhere yet → initials on the disc, no <img>");
    check((await disc(owner).count()) === 1, "studio home: the disc is there");
    /* 16 Sep 2026, the user: "the update image option should be inside the edit profile" */
    /* ⚠ A STUDIO'S PICTURES ARE EDITED WHERE A PERSON'S ARE (20 Sep 2026, the
       user: "edit profile for studio not consistent with how its done for Artist
       and users. for social media links, photos etc."). Until today every one of
       them lived in the Edit sheet behind the pencil; now the disc is the
       picture, a ⊕ beside it changes it, and the posters rail has its own ⊕ —
       the same two controls, with the same two names, a person's home has. */
    /* ⚠ AND NONE OF THEM UNTIL THE PENCIL IS PRESSED (26 Sep 2026, the user:
       "clicking on the edit pencil button from top right on every profile should
       open the option to edit everything from the home tab thats when the button
       to edits need to appear") — both states, because a ⊕ that is always there
       is exactly what was asked to go */
    check((await owner.getByRole("button", { name: "Change profile picture" }).count()) === 0 && (await owner.getByRole("button", { name: "Add a link" }).count()) === 0, "studio home: read-only until the pencil — no ⊕, no ＋ (26 Sep 2026)");
    await enterEdit(owner);
    check((await owner.getByRole("button", { name: "Change profile picture" }).count()) === 1, "studio home: a ⊕ beside the disc, and only that changes the picture (20 Sep 2026)");
    check((await owner.getByRole("button", { name: "Edit posters" }).count()) === 1, "studio home: the posters have their OWN ⊕ on the rail");
    check((await owner.getByRole("button", { name: "Add a link" }).count()) === 1, "studio home: and ＋ Add link in the band, exactly as on a person's home");
    check((await owner.getByRole("button", { name: "Add a dance style" }).count()) === 1, "studio home: and ＋ on the styles");
    check((await owner.getByRole("button", { name: "Edit contact buttons" }).count()) === 1, "studio home: and the ⊕ that makes and unmakes Call · Mail · Message · Enquiry (26 Sep 2026)");
    check((await owner.getByRole("link", { name: "Edit details" }).getAttribute("href")) === `/business/${studioId}?edit=1`, "studio home: Edit details lands on the sheet's own address (?edit=1)");
    check((await owner.getByLabel("Add a header picture").count()) === 0, "studio home: no Add tile ON the header itself — the ⊕ opens the grid");
    /* ⚠ 3 Oct 2026, later: "poster if not updated on should leave space on home
       as well" — an empty header KEEPS the banner's space (it drew no rail for a
       few hours that day, which threw the alignment) */
    {
      const rb = (await rail(owner).count()) === 1 ? await rail(owner).boundingBox() : null;
      check(Boolean(rb && rb.height > 150), `studio home: an empty header keeps the banner's space (3 Oct 2026) — ${rb ? `${Math.round(rb.width)}x${Math.round(rb.height)}` : "no rail"}`);
    }
    check((await owner.getByText(/^Managing/).count()) === 0, "studio home: no Managing strip");
    /* ⚠ THE BAND, THE SAME ONE EVERY PROFILE WEARS (20 Sep 2026). A studio's home
       had the hero and then went straight to the deck — no figures at all — while
       Home and the Profile tab both lead with Followers. It is a plain number
       here, not a door: the list already has its own control on the public page. */
    check((await hero.getByTestId("studio-followers").count()) === 1, "studio home: the Followers figure, like every other profile (20 Sep 2026)");
    /* ⚠ AND THE SECOND FIGURE (20 Sep 2026, the user: "Organization and Studio
       still dont have Following section in profile and home"). A studio cannot
       follow anything of its own — `follows.follower_id` references `profiles` —
       so what is counted is what the account that RUNS it follows. The person
       owning this studio exists, so the figure is drawn. */
    check((await hero.getByTestId("studio-following").count()) === 1, "studio home: the Following figure too — the owner's, since a studio has nothing to follow with (20 Sep 2026)");
    /* ⚠⚠ AND IT OPENS ITS LIST (27 Sep 2026, the user: "following list not
       opening properly crew and organization"). It was a plain `Figure` — a
       DEAD NUMBER — while Followers beside it had been a door since that
       morning, and the check above could not tell the difference because a
       count is 1 either way. The thing to assert is that it is a BUTTON and
       that pressing it opens the sheet, which is what the user pressed. */
    const followingChip = hero.getByTestId("studio-following");
    check((await followingChip.evaluate((el) => el.tagName)) === "BUTTON", "studio home: the Following figure is a DOOR, not a dead number (27 Sep 2026)");
    await followingChip.click();
    /* ⚠ the sheet is on the PAGE, not inside `hero`: it is `position: fixed`
       over the whole screen, which is the same reason `pick()` looks for a
       portalled option on the page rather than in its trigger's scope */
    const followingSheet = owner.getByRole("dialog", { name: "Following" });
    check(await followingSheet.isVisible().catch(() => false), "studio home: pressing it opens the Following sheet, like Followers beside it");
    await followingSheet.getByRole("button", { name: "Done" }).click();
    await followingSheet.waitFor({ state: "detached", timeout: 10000 });
    /* ⚠ AND IN THE RIGHT ORDER — figures, THEN the styles (20 Sep 2026). The
       first cut of the band left a studio using `IdentityHero`'s own `styles`
       prop, which renders BEFORE children, so it read styles → figures → links
       where Home reads figures → styles → links: the same three rows at the same
       sizes, in the wrong order. Positions, not presence, is the whole ask. */
    const followersTop = await hero.getByTestId("studio-followers").evaluate((el) => el.getBoundingClientRect().top);
    const styleTile = hero.locator('[aria-label$="a style this studio teaches"]').first();
    const styleTop = (await styleTile.count()) ? await styleTile.evaluate((el) => el.getBoundingClientRect().top) : Infinity;
    check(followersTop < styleTop, "studio home: the figures come BEFORE the styles, as on Home and the Profile tab");
    /* ⚠ NO MEDIA TILE (21 Sep 2026, the user: "remove media from all tool in all
       profiles"). The desk showed the studio's two pictures — and since 20 Sep
       the disc's ⊕ and the posters' ⊕ on this very home ARE the editor, so the
       tile was a third door to a job whose controls sit on the pictures. The
       ROUTE stays (Rule 14) and is driven further down this file. */
    check((await owner.getByRole("link", { name: "Media", exact: true }).count()) === 0, "studio home: NO Media tile — the pictures are edited on the pictures (21 Sep 2026)");
    check((await owner.getByRole("link", { name: "Assets", exact: true }).getAttribute("href")) === `/business/${studioId}/assets`, "studio home: the Assets tile opens THIS studio's desk");
    check((await owner.getByRole("link", { name: "Stats", exact: true }).count()) === 1, "studio home: one Stats door — the chip beside the QR (it left the grid on 18 Sep 2026)");
    /* ⚠ AND THE CHIPS ARE IN THE FIGURES ROW, NOT THE HERO'S RIGHT EDGE (20 Sep
       2026, the user: "should be placed in same row as follower following numbers
       on its right side"). Measured, because nothing about the DOM says which
       row a chip is in: the Stats chip's vertical centre has to line up with the
       Followers figure's, and it has to sit to its RIGHT. This is the only kind
       of check that can catch the chips drifting back into their own column —
       the same reason the style-tile size is measured rather than asserted. */
    const figBox = await hero.getByTestId("studio-followers").evaluate((el) => el.getBoundingClientRect().toJSON());
    const statsBox = await owner.getByRole("link", { name: "Stats", exact: true }).evaluate((el) => el.getBoundingClientRect().toJSON());
    check(Math.abs(figBox.top + figBox.height / 2 - (statsBox.top + statsBox.height / 2)) < 26 && statsBox.left > figBox.left, "studio home: the QR and Stats chips ride the FIGURES row, to the right of the numbers (20 Sep 2026)");
    /* ⚠ "no Events tile on a studio's home" was R15's check (15 Sep 2026) and
       went on 29 Sep with events: it drew the line between a studio and the
       organization that hosted, and neither side of that line is there now. */
    /* ⚠⚠ AND THE PENCIL HAS LEFT THE CORNER (22 Sep 2026, the user: "studio edit
       profile should be in settings … and profile view button similar to other
       profiles"). BOTH ENDS, because a check that only looks at the new place
       cannot tell you the old one was cleared — the lesson this file has paid
       for four times. What is asserted here is the absence; the Settings tile
       that replaced it is driven in `shoot-tiles`, which is where Settings is. */
    /* ⚠ RE-CUT 26 Sep 2026: the pencil is BACK over the eye, at the user's word
       ("edit profile to be removed from all profiles settings and should be a
       button on top right with public page view right now") — and it toggles
       every editor rather than opening one form. Settings' tile is gone (driven
       in shoot-tiles). */
    check((await owner.getByRole("button", { name: "Edit studio", exact: true }).count()) === 0, "studio home: no 'Edit studio' button — the corner's pencil is 'Edit profile' and toggles edit mode");
    check((await owner.getByTestId("hero-corner").locator("a").count()) === 1 && (await owner.getByTestId("hero-corner").getByRole("button", { name: "Edit profile", exact: true }).count()) === 1, "studio home: the corner is the pencil over the eye, like every other profile's (26 Sep 2026)");
    /* ⚠⚠ THE CORNER OPENS **THIS STUDIO'S** PUBLIC PAGE (21 Sep 2026, the user:
       "studio and crew pages on home tab should have option to view their
       profile pages currently taking to organizations page and user/artist
       page"). Written twice in one day, and the second is the correction: the
       morning's cut pointed every home's corner at the Profile tab to end a
       two-screen loop, and on a studio's home that door opens the ORGANIZATION
       behind it — true, and nothing to do with this studio. The loop is still
       cut, because a profile page has no corner at all; what changed is that a
       corner goes to the public face of the thing you are standing on. Both ends
       asserted, because a check that only looks for what was added lets what it
       replaced live on. */
    check((await owner.getByRole("link", { name: "Public view", exact: true }).getAttribute("href")) === `/studio/${studioId}`, "studio home: the corner opens THIS studio's public page (21 Sep 2026)");
    check((await owner.getByRole("link", { name: "Your profile", exact: true }).count()) === 0, "studio home: and not the organization behind it");
    /* AND THE BUTTONS ABOVE THE SCHEDULE, the row its public page carries */
    check((await owner.getByRole("button", { name: /enquiries come to you here/ }).count()) === 1, "studio home: Enquiry is drawn and disabled with its reason, as on your own page");
    /* ⚠ THE DISC IS THE PICTURE, NOT A THIRD DOOR (20 Sep 2026). It opened the
       studio's public page from 19 Sep — a SECOND door beside the eye, and a
       third beside the QR chip, all to one address — while a person's disc has
       opened their own picture since the same day. It opens the picture now, and
       the eye above is the one door out. This asserts the old link is gone as
       well as the new control being there: a check that only looks for what was
       added lets the thing it replaced live on. */
    check((await owner.getByRole("link", { name: "Open the studio's public page", exact: true }).count()) === 0, "studio home: the disc is no longer a link to the public page — the eye is that door (20 Sep 2026)");
    check((await owner.getByRole("button", { name: "EEE Dance Studio — profile picture" }).count()) === 0, "studio home: and with no picture yet the disc is not a button either — there is nothing to open");
    /* Discover joined the entity's bar on 19 Sep 2026: allowed, while booking is
       not. ⚠ ENQUIRIES IS THE FOURTH SINCE 27 Sep 2026 — the user asked for the
       enquiry desk off Settings and out of the Inbox ("enquiries should be
       removed from settings and inbox merged into a section on home tab"), and
       chose the tab over a section. Asserted by NAME as well as by count, so a
       fifth tab added without one cannot pass this line. */
    const studioBar = owner.getByRole("navigation", { name: "Studio" });
    /* ⚠ THREE AGAIN (27 Sep 2026, evening): Enquiries was the fourth tab for a
       few hours this morning and is a TOOL TILE now, on this studio's own grid.
       The count alone would pass on the wrong three, so the absent one is named
       as well as the present ones. */
    /* ⚠ AND TWO SINCE 2 Oct 2026 (the user: "discover should not be visible in
       navbar when in crew or studio profile") — Discover is named as absent too */
    check(
      (await studioBar.getByRole("link", { name: "Discover" }).count()) === 0 &&
        (await studioBar.getByRole("link", { name: "Enquiries" }).count()) === 0 &&
        (await studioBar.getByRole("link").count()) === 2,
      "studio bar: Inbox · Home — two; neither Discover nor Enquiries is on it (2 Oct 2026)"
    );
    await shot("studio-initials");

    /* ⚠⚠ THE MEMBERSHIPS TILE OPENS A DESK, NOT A SHRUG (21 Sep 2026, the user:
       "fix memberships for studio"). The tile was drawn on 18 Sep over the
       prototype's "nothing here yet" because no desk existed; the desk landed on
       19 Sep at `/memberships` and nobody came back for the tile — so a studio
       owner pressing it was told the feature does not exist while it was live
       one address away. Driven from the tile, because the tile is what was
       broken. */
    check((await owner.getByRole("link", { name: "Memberships", exact: true }).getAttribute("href")) === `/business/${studioId}/memberships`, "studio home: the Memberships tile opens THIS studio's desk (21 Sep 2026)");
    await owner.goto(`${BASE}/business/${studioId}/memberships`);
    await owner.getByRole("heading", { name: "Memberships" }).waitFor({ timeout: 15000 });
    check((await owner.getByText("Class packs and plans this studio sells").count()) === 0, "studio memberships: not the 'nothing here yet' shrug any more");
    check((await owner.getByText(/^What .* sells$/).count()) === 1, "studio memberships: the desk says WHOSE it is — an organization runs several");
    /* a studio holds no passes (a business is not a person), so one side, no switch */
    check((await owner.getByRole("button", { name: /^Booked/ }).count()) === 0, "studio memberships: no Booked side — a studio holds no pass");
    /* ⚠ STALE SINCE STAGE 2 AND ONLY FOUND TODAY (22 Sep 2026). This asserted
       `/memberships/new?business={studio}` — right on 21 Sep, when the desk's
       add control was a LINK to a page that had to be told which studio it was
       for. Stage 2 (C54) made every add control a SHEET at `?new=1` on the
       desk's own URL, so the studio is the ADDRESS now and there is nothing to
       pass. The page still exists and still takes `?business=` (Rule 14), which
       `shoot-tiles` drives. The lesson is this file's own: shoot-hero had not
       been run since stage 1, and a proof is only true the last time it ran. */
    check((await owner.getByRole("link", { name: "New membership" }).getAttribute("href")) === "?new=1", "studio memberships: the form opens over THIS studio's desk, so the studio is the address (22 Sep 2026)");
    await owner.goto(`${BASE}/business/${studioId}`);

    /* ⚠ AND IT IS OFF THE DESKS TOO NOW (18 Sep 2026, the user: "remove the blue
       bar which shows exit studio from all pages"). It was kept there on 16 Sep
       with the argument that a tool hero names the tool and nothing names the
       studio; the user has answered that argument, and `WorkspaceStrip` is
       deleted rather than hidden. The back chip is the way out of a desk. */
    await owner.goto(`${BASE}/business/${studioId}/classes`);
    /* the register's hero is the tool card, not a heading element (the 18 Sep
       class-form re-cut drew it as a div) — its one stable control is the
       Create class pill, so that is what says the page is up */
    await owner.getByRole("link", { name: /Create class/ }).waitFor();
    check((await owner.getByText(/^Managing/).count()) === 0, "a desk: no Managing strip either — it is gone from every page");
    check((await owner.getByRole("link", { name: /Leave this studio/ }).count()) === 0, "a desk: and no blue Exit studio pill");

    /* ── A STUDIO'S TWO PICTURES, WHERE A PERSON'S ARE (20 Sep 2026) ──────────
       The user: "edit profile for studio not consistent with how its done for
       Artist and users. for social media links, photos etc." Until today every
       one of them was inside the Edit sheet, reached through the pencil; now the
       disc has a ⊕ beside it and the posters rail has its own, exactly as on a
       person's home. This block drives the NEW controls and keeps every claim it
       made before — above all the destroy-on-cancel regression, which is the
       whole reason it exists. */
    await owner.goto(`${BASE}/business/${studioId}`);
    await hero.waitFor();

    /* ⚠ THE SHEET IS AN ADDRESS NOW (22 Sep 2026) — `?edit=1` on the studio's own
       home, the way `?new=1` opens every add form and `?settings=1` the Settings
       sheet. Settings' THIS STUDIO tile navigates here; driving the URL is what
       proves the door survives whichever control points at it, and the gate is
       still the owner-only read behind it rather than the query. */
    await owner.goto(`${BASE}/business/${studioId}?edit=1`);
    const sheet = owner.getByRole("dialog", { name: "Edit business" });
    await sheet.waitFor();
    check((await sheet.getByText("Update profile", { exact: true }).count()) === 0, "edit studio: NO picture block in the sheet any more — the disc's own ⊕ changes it (20 Sep 2026)");
    check((await sheet.getByText("Update header", { exact: true }).count()) === 0, "edit studio: and no header block — the posters rail's ⊕ does");
    check((await sheet.getByText("Links", { exact: true }).count()) === 0, "edit studio: and no Links block — ＋ Add link is in the band on the home");
    /* 16 Sep 2026: ONE label style for every field on the form — the second,
       larger heading that briefly headed two blocks out of five is gone */
    /* 26 Sep 2026: and no Phone or Email at all — they are the contact ⊕ beside the buttons on the studio's home */
    check((await sheet.getByLabel("Phone", { exact: true }).count()) === 0 && (await sheet.getByLabel("Email", { exact: true }).count()) === 0, "edit studio: NO phone and NO email field — the contact ⊕ on the home is where Call and Mail are made (26 Sep 2026)");
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
    await sheet.getByRole("button", { name: "Cancel" }).click();
    await sheet.waitFor({ state: "detached" });

    /* ── THE DISC (businesses.profile_photo_path, through set_business_profile_photo).
       It commits on upload, because replacing a picture is not destroying one —
       the same rule a person's disc keeps. ── */
    await enterEdit(owner);
    await owner.getByRole("button", { name: "Change profile picture" }).click();
    const picSheet = owner.getByRole("dialog", { name: "Profile picture" });
    await picSheet.waitFor();
    await picSheet.getByLabel("Add a photo").setInputFiles(FILE);
    await useIt(owner);
    const discUp = await disc(owner).locator("img").first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
    if (!discUp) {
      const words = await picSheet.locator('[role="status"], [role="alert"]').allTextContents().catch(() => []);
      console.log("DISC DID NOT LAND — sheet says:", JSON.stringify(words), "| open dialogs:", await owner.getByRole("dialog").count(), "| disc imgs:", await discImgs(owner), "| url:", owner.url());
    }
    check(discUp && (await discImgs(owner)) === 1, "studio picture: it landed on the disc behind the sheet");
    check((await railImgs(owner)) === 0, "studio picture: and not in the header");
    await picSheet.getByRole("button", { name: "Done" }).click();
    await picSheet.waitFor({ state: "detached" });
    const photoPath = await rest(`businesses?id=eq.${studioId}&select=profile_photo_path`);
    check(String(photoPath[0] && photoPath[0].profile_photo_path).startsWith(`tenants/${studioId}/`), "businesses.profile_photo_path is set, in the studio's own folder");
    /* and now that there IS one, the disc is a button that opens it */
    check((await owner.getByRole("button", { name: "EEE Dance Studio — profile picture" }).count()) === 1, "studio picture: the disc is now a button that opens the picture full size");

    /* ── THE POSTERS ARE A DRAFT (16 Sep 2026, carried through every move since) ──
       The user pressed ✕ on four pictures, pressed CANCEL, and lost all four.
       These checks are that sentence, both ways round: staged work shows in the
       sheet and NOT on the page behind it; Cancel leaves everything alone; Save
       is what moves anything at all. ⚠ The sheet moved off the pencil today and
       the rules came with it — that is what this block is here to prove. */
    const studioRows = async () => {
      const live = await rest(`studio_photos?business_id=eq.${studioId}&deleted_at=is.null&select=id`);
      return Array.isArray(live) ? live.length : -1;
    };
    const posters = owner.getByRole("dialog", { name: "Posters", exact: true });
    /* ⚠ `openStudioPosters`, not `openPosters` — the USER's half of this script
       further down already has one of those, and two `const`s of one name in one
       scope is a parse error that only `node --check` (or the run) finds */
    const openStudioPosters = async () => {
      await enterEdit(owner);
      const edit = owner.getByRole("button", { name: "Edit posters" });
      await edit.waitFor({ timeout: 20000 });
      await edit.click();
      await posters.waitFor();
    };
    await openStudioPosters();
    await posters.getByLabel("Add photos of your space").setInputFiles(FILE);
    await useIt(owner);
    const headerUp = await posters
      .getByLabel(/is the only one/)
      .first()
      .waitFor({ timeout: 25000 })
      .then(() => true)
      .catch(() => false);
    if (headerUp) {
      check(true, "studio posters: a staged picture appears in the sheet");
      check((await railImgs(owner)) === 0, "studio posters: and NOT on the page behind it — nothing is saved yet");
      check((await studioRows()) === 0, "studio posters: and the database still holds nothing");
      check((await posters.getByLabel(/is the only one/).count()) === 1, "studio posters: the only picture's ✕ is disabled and says why — a header never empties");
      await posters.getByRole("button", { name: /^Save/ }).click();
      await waitRailImgs(owner, 1);
      check((await studioRows()) === 1, "studio posters: Save is what put the picture on the record");

      /* ⚠ THE REPORTED BUG, AS A STANDING CHECK */
      await openStudioPosters();
      await posters.getByLabel("Add photos of your space").setInputFiles(FILE);
      await useIt(owner);
      await posters.getByLabel("Remove photo 1").first().waitFor({ timeout: 25000 });
      check((await posters.getByLabel(/^Remove photo/).count()) === 2, "studio posters: two pictures, two live ✕");
      await posters.getByLabel("Remove photo 1").click();
      check((await posters.getByLabel(/^Undo removing photo/).count()) === 1, "studio posters: ✕ marks it and offers ↩ — the picture is not gone");
      check((await studioRows()) === 1, "⚠ THE BUG: a pressed ✕ has not touched the database");
      await posters.getByRole("button", { name: "Cancel" }).click();
      check((await studioRows()) === 1, "⚠ THE BUG: and Cancel left the picture exactly where it was");
      await openStudioPosters();
      check((await posters.getByLabel(/is the only one/).count()) === 1, "studio posters: reopening shows it still there, and still the only one");

      /* the gallery opens a picture full size */
      await posters.getByLabel("Open picture 1").click();
      check((await owner.getByRole("dialog", { name: /picture 1 of/ }).count()) === 1, "studio posters: pressing a picture opens it full size");
      await owner.getByRole("button", { name: "Close the picture" }).click();
      check((await owner.getByRole("dialog", { name: /picture 1 of/ }).count()) === 0, "studio posters: and it closes again");
      await shot("studio-header");

      /* a second picture, saved — then a removal, saved */
      await posters.getByLabel("Add photos of your space").setInputFiles(FILE);
      await useIt(owner);
      await posters.getByLabel("Remove photo 2").first().waitFor({ timeout: 25000 });
      await posters.getByRole("button", { name: /^Save/ }).click();
      await waitRailImgs(owner, 2);
      check((await studioRows()) === 2, "studio posters: Save committed the second one too");
      await openStudioPosters();
      await posters.getByLabel("Remove photo 1").click();
      await posters.getByRole("button", { name: /^Save/ }).click();
      await waitRailImgs(owner, 1);
      check((await studioRows()) === 1, "studio posters: and Save is what removes one, too");

      /* the Media desk: the same two pictures as a desk.
         ⚠ ITS TILE IS OFF THE GRID SINCE 21 Sep 2026 and the ROUTE STAYS
         (Rule 14: a link handed out is a promise, and the installed TWA reopens
         on the last URL it showed) — which is why it is still reached by URL
         here and still has to work. */
      await owner.goto(`${BASE}/business/${studioId}/media`);
      await owner.getByRole("heading", { name: "Media", exact: true }).waitFor();
      check((await owner.getByTestId("media-disc").locator("img").count()) === 1, "media desk: the disc with its picture");
      check(await owner.getByText("1 / 5–10").isVisible(), "media desk: the header count");
      check((await owner.getByLabel(/is the only one/).count()) === 1, "media desk: the only picture's ✕ is disabled and says why");
      await shot("studio-media");

      /* the public page reads the header through business_header_photos, which
         arrives with migration 20260915090000 — say so on the line when it is
         not there yet, so a red line reads as "apply the migration" and not
         as a broken page */
      const rpcProbe = await fetch(`${supabaseUrl}/rest/v1/rpc/business_header_photos`, { method: "POST", headers: adminHeaders, body: JSON.stringify({ p_business_id: studioId }) });
      const rpcNote = rpcProbe.ok ? "" : " (NEEDS migration 20260915090000 — business_header_photos is not on the database)";
      /* to the organization … */
      await owner.goto(`${BASE}/studio/${studioId}`);
      await owner.getByTestId("public-hero").waitFor();
      check((await railImgs(owner)) === 1, `public studio page (owner): the header picture is there${rpcNote}`);
      check((await discImgs(owner)) === 1, "public studio page (owner): the disc is there");
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

    /* THE OWNER'S OWN HOME (26 Sep 2026: a PERSON's — the organization login is
       retired, so this is a user's Home wearing the same hero: the profile photo
       on the disc, an empty header (a user holds one), and a QR to its own page.
       ⚠ The organization's own home at `/business/{orgId}` was driven at the end
       of this script until 29 Sep 2026, when organizations went. */
    await owner.goto(`${BASE}/`);
    await owner.getByRole("heading", { name: "EEE Dance Company", exact: true }).waitFor();
    check((await discImgs(owner)) === 1, "owner home: the profile photo is on the disc");
    check((await railImgs(owner)) === 0, "owner home: an empty header — nothing added yet (a user holds one)");
    /* ⚠ THE QR AND THE SHARE ARE TWO CHIPS NOW (21 Sep 2026, the user: "Seprate
       current Qr Code from share option and share to directly send link of that
       profile"). The QR's own name dropped "Share this profile — ", because the
       chip beside it is what shares; this asserts BOTH, and asserts the old
       combined name is gone, so nothing is left answering to two jobs. */
    check((await owner.getByLabel("QR code").count()) === 1, "owner home: a QR — every person has a page of its own to share");
    check((await owner.getByLabel("Share EEE Dance Company").count()) === 1, "owner home: the Share chip beside it, which sends the link itself (21 Sep 2026)");
    check((await owner.getByLabel("Share this profile — QR code").count()) === 0, "owner home: nothing answers to the old combined name");
    /* THE ORDER THE USER GAVE: Follow bell · Stats · QR · Share. There is no bell
       on your own home, so on this page it is Stats · QR · Share — measured by
       LEFT EDGE rather than by DOM position, because the row is `flex` and a
       re-order that only changed the markup would pass a DOM check and still
       draw them in the old order. */
    const chipX = async (label) => (await owner.getByLabel(label).first().boundingBox())?.x ?? -1;
    const [xStats, xQr, xShare] = [await chipX("Stats"), await chipX("QR code"), await chipX("Share EEE Dance Company")];
    check(xStats > 0 && xStats < xQr && xQr < xShare, `owner home: the chips read Stats · QR · Share, left to right (${xStats} < ${xQr} < ${xShare})`);
    /* ⚠ THE QR IS A REAL CODE NOW, AND THE SHEET IS ONLY THE CODE (21 Sep 2026,
       the user: "qr code button should just open qr not link on all profiles
       code should look better as well"). Both halves are asserted here because
       only a browser can: the square was a HASH pattern until today — it looked
       like a code and encoded nothing, which is why the app's own Scan sheet
       could never read a DanceOS profile (backlog R27). `data-qr-modules` is the
       version the encoder chose, and `data-qr-scannable` is whether it is drawn
       big enough for a camera; a profile link is a version-5 square (37
       modules) on the deployment and a version-4 one (33) against `:3100`,
       because the encoder picks the SMALLEST version the data fits in and
       `localhost:3100` is fourteen characters shorter than the live host.
       ⚠ So the exact version is deliberately NOT asserted — the first cut of
       this check said 37 and went red against `:3100`, which was the assertion
       measuring the PORT. What is asserted is the claim underneath it: a legal
       QR size (21 + 4k), and one big enough that it must have grown with the
       data — the square it replaced was a fixed 13×13 whatever you gave it.
       And the printed link and the Copy button are asserted GONE,
       because a check that only looks for what was added lets what it replaced
       live on — this file's own recurring lesson. */
    await owner.getByLabel("QR code").first().click();
    const qrSheet = owner.getByRole("dialog", { name: /^Share / });
    await qrSheet.waitFor({ state: "visible", timeout: 15000 });
    const qrSvg = qrSheet.locator("svg[data-qr-modules]");
    check((await qrSvg.count()) === 1, "owner QR sheet: one code square, and it came out of the encoder");
    const qrModules = Number(await qrSvg.getAttribute("data-qr-modules"));
    check(qrModules >= 29 && qrModules <= 45 && (qrModules - 21) % 4 === 0, `owner QR sheet: a real QR size, sized to the link rather than fixed (drew ${qrModules}; the old square was always 13)`);
    check((await qrSvg.getAttribute("data-qr-scannable")) === "yes", "owner QR sheet: drawn big enough for a camera to resolve a module");
    check((await qrSvg.locator("rect").count()) > 40, "owner QR sheet: real modules, not three drawn eyes and a hash field");
    check((await qrSheet.getByRole("button", { name: "Copy link" }).count()) === 0, "owner QR sheet: no Copy link — the chip beside it is the share (21 Sep 2026)");
    check((await qrSheet.getByText(/vercel\.app|localhost:/).count()) === 0, "owner QR sheet: the link is not printed — the button opens a QR, not a link");
    /* the one thing no assertion settles: "should look better" is a thing to
       look at, so it is shot on its own rather than buried in a full-page grab */
    await qrSvg.screenshot({ path: path.join(OUT, "hero-qr-code.png") });
    await qrSheet.getByRole("button", { name: "Done" }).click();
    await qrSheet.waitFor({ state: "hidden", timeout: 15000 });
    check(await owner.getByText(/^User(-\d{6})?$/).first().isVisible(), "owner home: the role word — User, since 26 Sep 2026 — with the account number against it");
    /* BOTH FIGURES, on this person's Home like everybody's */
    check(
      (await owner.getByTestId("home-followers").count()) === 1 && (await owner.getByTestId("home-following").count()) === 1,
      "owner home: Followers AND Following, both drawn and both clickable (20 Sep 2026)"
    );
    await owner.getByTestId("home-following").click();
    check(await owner.getByRole("dialog", { name: "Following", exact: true }).isVisible(), "owner home: and the Following figure opens its list");
    await owner.keyboard.press("Escape").catch(() => {});
    await owner.goto(`${BASE}/`);
    await owner.getByRole("heading", { name: "EEE Dance Company", exact: true }).waitFor();
    check((await owner.getByLabel("Change your photo").count()) === 0, "owner home: no ＋ on the disc — the picture is changed behind the pencil beside it");
    /* the chrome, re-cut 19 Sep 2026: THREE in the bar, the DISC is the door to the public page (the eye left Home
       later the same day — the user: "clicking on the profile photo on home tab takes to profile so can remove
       the eye from top right on home"), Stats the chip */
    const bar = owner.getByRole("navigation", { name: "Main" });
    check((await bar.getByRole("link", { name: "Stats" }).count()) === 0 && (await bar.getByRole("link", { name: "Profile" }).count()) === 0, "bar: neither Stats nor Profile is a tab any more");
    check((await bar.getByRole("link", { name: "Public view" }).count()) === 0, "bar: the eye left the bar (19 Sep 2026, the user: 'remove profile tab from navbar')");
    check((await bar.getByRole("link", { name: "Enquiries" }).count()) === 0 && (await bar.getByRole("link").count()) === 3, "bar: Home · Discover · Inbox — three, Enquiries off it (27 Sep 2026)");
    /* 19 Sep 2026: the corner is the EYE alone — the pencil went into Settings
       ("all edit profile options to be removed from home and profile pages") and
       the DISC became the door to both picture sections ("should be able to click
       and view both pictures sections when clicking on that photo") */
    /* ⚠ THE DESTINATION, NOT THE SPELLING (22 Sep 2026). This asserted the href
       was literally "/profile" — a redirect whose whole job is to resolve to
       this very address (C40), and which Home has never needed, because Home
       knows the viewer's id. So the check was pinned to one implementation of
       the door rather than to where the door goes, and it went red for a change
       that moved nobody anywhere. Asserting the resolved address is STRICTER:
       a corner pointing at the wrong account would have passed the old line. */
    /* the corner opens this PERSON's own profile (26 Sep 2026: `/person/{id}`, C40) */
    check((await owner.getByRole("link", { name: "Your profile", exact: true }).count()) === 1 && (await owner.getByRole("link", { name: "Your profile", exact: true }).getAttribute("href")) === `/person/${ownerId}`, "owner home: the corner opens this person's own profile (21 Sep 2026; a person's since 26 Sep)");
    check((await owner.getByRole("link", { name: "Public view", exact: true }).count()) === 0, "owner home: no eye — its public page is the Share chip, and the corner no longer loops");
    /* a plain user's Home carries no Enquiry — they have no artist page for one to land on */
    check((await owner.getByRole("button", { name: /enquiries come to you here/ }).count()) === 0, "owner home: no Enquiry on a plain user's Home — they hold no artist page for one to land on");
    /* INVERTED 26 Sep 2026: the pencil is BACK on the corner, and it toggles
       edit mode ("should be a button on top right with public page view") */
    check((await owner.getByRole("button", { name: "Edit profile", exact: true }).count()) === 1, "owner home: the pencil on the corner, over the door (26 Sep 2026)");
    check((await owner.getByRole("link", { name: "Stats", exact: true }).count()) === 1, "owner home: one Stats door — the chip beside the name (a tile until 18 Sep 2026)");
    /* AND IT IS THIS PERSON'S OWN ADDRESS (C57): the chip builds `${subject}/stats` */
    check((await owner.getByRole("link", { name: "Stats", exact: true }).getAttribute("href")) === `/person/${ownerId}/stats`, "owner home: the Stats chip opens this person's own address");
    /* ⚠ NO "YOUR PICTURES" SHEET SINCE 20 Sep 2026 (the user: "Profile pic edit
       should just be a pencil besides and clciking on photo to view it not
       together in one. Similarly seprate for poster photos"). The in-between
       screen that showed both and edited neither is gone: the picture is pressed
       to SEE it, the pencil beside it CHANGES it, and the posters have a pencil
       of their own on the rail. */
    check((await owner.getByRole("button", { name: "Your pictures", exact: true }).count()) === 0, "owner home: the in-between 'Your pictures' sheet is gone (20 Sep 2026)");
    check((await owner.getByRole("button", { name: "Change profile picture" }).count()) === 0, "owner home: read-only until the pencil (26 Sep 2026)");
    await enterEdit(owner);
    check((await owner.getByRole("button", { name: "Change profile picture" }).count()) === 1, "owner home: a pencil beside the disc, and only that changes the picture");
    check((await owner.getByRole("button", { name: "Edit posters" }).count()) === 1, "owner home: the posters have their OWN pencil on the rail");
    check((await owner.getByRole("button", { name: "Edit contact buttons" }).count()) === 1, "owner home: and the ⊕ for the contact buttons (26 Sep 2026)");
    await owner.getByRole("button", { name: "Change profile picture" }).click();
    /* "Profile picture", not "Logo" (26 Sep 2026): a person's disc is a picture — the Logo editor went with the organization login */
    const ownerLogo = owner.getByRole("dialog", { name: "Profile picture" });
    await ownerLogo.waitFor();
    check((await owner.getByRole("dialog", { name: "Logo" }).count()) === 0, "owner pictures: no Logo editor — a person's disc is a Profile picture (26 Sep 2026)");
    check((await ownerLogo.getByLabel("Change your photo").count()) === 1, "owner pictures: the picker is in the picture's own editor, reached in ONE press");
    await shot("owner-pictures");
    await ownerLogo.getByRole("button", { name: "Done" }).click().catch(() => {});
    /* ⚠ THE WORDS ARE THE EDIT DETAILS CHIP, NOT A SETTINGS TILE (26 Sep 2026,
       the user: "edit profile to be removed from all profiles settings and
       should be a button on top right"). Both ends: Settings carries no Edit
       profile tile, and the chip beside the name opens the sheet. */
    await owner.goto(`${BASE}/profile?settings=1`);
    const ownerSettings = owner.getByRole("dialog", { name: "Settings" });
    await ownerSettings.waitFor();
    await ownerSettings.getByText("ACCOUNT").waitFor();
    check((await ownerSettings.getByRole("button", { name: "Edit profile", exact: true }).count()) === 0 && !(await ownerSettings.innerText()).includes("YOU\n"), "settings: NO Edit profile tile and no YOU block — the pencil is on Home's corner (26 Sep 2026)");
    await owner.goto(`${BASE}/`);
    await enterEdit(owner);
    const ownerEdit = owner.getByRole("button", { name: "Edit details", exact: true });
    await ownerEdit.waitFor();
    check((await ownerEdit.count()) === 1, "home: Edit details appears with the pencil (26 Sep 2026)");
    await ownerEdit.click();
    const ownerSheet = owner.getByRole("dialog", { name: "Edit profile" });
    await ownerSheet.waitFor();
    /* a PERSON's sheet asks their date of birth (an organization's never did — that sheet is gone with the login) */
    check((await ownerSheet.getByLabel("Date of birth", { exact: true }).count()) === 1, "edit profile: a date-of-birth field — this is a person's sheet (26 Sep 2026)");
    check((await ownerSheet.getByLabel("Change your photo").count()) === 0 && (await ownerSheet.getByLabel("Add picture").count()) === 0, "edit profile: and NO pictures in it — they are behind the disc on Home");
    check((await ownerSheet.getByLabel("Phone", { exact: true }).count()) === 0 && (await ownerSheet.getByLabel("Email", { exact: true }).count()) === 0, "edit profile: and NO number or email — they are the contact ⊕ beside the buttons (26 Sep 2026)");
    await shot("owner-edit");
    await ownerSheet.getByRole("button", { name: "Cancel" }).click().catch(() => {});
    await ownerSheet.waitFor({ state: "detached" }).catch(() => {});
    /* the contact sheet: a number in, the button appears; the number out, the button goes */
    await owner.getByRole("button", { name: "Edit contact buttons" }).click();
    const contacts = owner.getByRole("dialog", { name: "Contact buttons" });
    await contacts.waitFor();
    await contacts.getByLabel("WhatsApp", { exact: true }).fill("+91 98765 00000");
    await contacts.getByRole("button", { name: "Save" }).click();
    await contacts.waitFor({ state: "detached", timeout: 15000 });
    /* the entry is a chip in the links row (a button while editing, a link when
       not) — and ⚠ a PLAIN USER's Home draws NO Message button, by the 19 Sep
       list ("user — nothing"): the sheet said so, and this asserts it */
    const waChip = owner.getByRole("button", { name: /^WhatsApp — / }).or(owner.getByRole("link", { name: /^WhatsApp — / }));
    await waChip.first().waitFor({ timeout: 15000 }).catch(() => {});
    check((await waChip.count()) === 1, "contact ⊕: the WhatsApp number is a chip in the links row — one list, two readings (26 Sep 2026)");
    check((await owner.getByRole("link", { name: "Message", exact: true }).count()) === 0, "contact ⊕: and a plain user's Home draws no Message button — their page carries no buttons");
    /* on a BUSINESS it becomes the button: the studio's own contact ⊕ */
    await owner.goto(`${BASE}/business/${studioId}`);
    await enterEdit(owner);
    await owner.getByRole("button", { name: "Edit contact buttons" }).click();
    const bizContacts = owner.getByRole("dialog", { name: "Contact buttons" });
    await bizContacts.waitFor();
    /* ⚠ THE TAKE-ENQUIRIES SWITCH IS NOT HERE ANY MORE (27 Sep 2026). It was, and
       rightly, while Enquiries was a BUTTON somebody makes and unmakes — the ⊕ is
       where the button row is built. It is a TOOL now, so the switch and the kinds
       moved to its desk, and BOTH ENDS are asserted: gone from here, present
       there. A check that only looks at the new place cannot tell you the old one
       was cleared. */
    check((await bizContacts.getByRole("switch", { name: "Take enquiries" }).count()) === 0, "studio contact ⊕: the Take-enquiries switch has LEFT it — the ⊕ draws the button row and nothing else (27 Sep 2026)");
    /* ⚠ A CARD PER BUTTON (3 Oct 2026, the user: "better add contact button form
       can be managed better") — a studio's sheet carries all five, in the order
       its page draws them, and a filled box turns its card live */
    const cardCount = async (k) => bizContacts.getByTestId(`contact-card-${k}`).count();
    check((await cardCount("enquiry")) === 1 && (await cardCount("call")) === 1 && (await cardCount("mail")) === 1 && (await cardCount("message")) === 1 && (await cardCount("location")) === 1, "studio contact ⊕: one card per button — Enquiry · Call · Mail · Message · Location (3 Oct 2026)");
    await bizContacts.getByLabel("WhatsApp", { exact: true }).fill("+91 98765 00001");
    await bizContacts.getByTestId("contact-card-message").getByText("Shown on the page").waitFor({ timeout: 5000 }).catch(() => {});
    check((await bizContacts.getByTestId("contact-card-message").getByText("Shown on the page").count()) === 1 && (await bizContacts.getByRole("button", { name: "Remove Message" }).count()) === 1, "studio contact ⊕: a filled box makes its card live, with its own Remove (3 Oct 2026)");
    await bizContacts.screenshot({ path: path.join(OUT, "hero-contacts-studio.png") });
    await bizContacts.getByRole("button", { name: "Save" }).click();
    await bizContacts.waitFor({ state: "detached", timeout: 15000 });
    const msg = owner.getByRole("link", { name: "Message", exact: true });
    await msg.waitFor({ timeout: 15000 }).catch(() => {});
    check((await msg.count()) === 1 && (await msg.getAttribute("href")) === "https://wa.me/919876500001", "studio contact ⊕: a WhatsApp number becomes the Message button, a wa.me link (26 Sep 2026)");

    /* ⚠⚠ AND NOT ONE OF THOSE BUTTONS IS CUT (28 Sep 2026, the user: *"contact
       buttons getting cut on all profiles"*). MEASURED rather than eyeballed,
       which is this repo's own method and has paid three times now: the label is
       CLIPPED exactly when its own `scrollWidth` exceeds its `clientWidth`, so
       the check reads the painted box instead of arguing about the CSS.
       ⚠ Twice — at the app's own 430px and again at 360px, the narrowest phone
       this is really read on, because 430 was only ever a hair short and 360 is
       where the word lost half its letters.

       ⚠⚠ AND THE OTHER AXIS, WHICH A RECT CANNOT SEE (28 Sep 2026, the same
       person hours later: *"the top part of contact buttons getting cut on home
       and profile"*). The row is pulled up 6px under `IdentityHero` by
       `marginTop: -6`, the hero is `position: relative` with an opaque
       background, and a positioned element paints above a later STATIC sibling
       — so the top 6px of every button was painted over, on all eight surfaces,
       from the day that margin went negative. Every rect in the place was
       right: the box is 38px tall and sits 8px below the links, which is why
       the 27 Sep "re-measured at 8px" was true of a screen that still read 14.
       `document.elementFromPoint` at the button's own top edge is the question
       a rect cannot answer, so that is what is asked. */
    const measureContacts = () =>
      owner.evaluate(() => {
        const btn = [...document.querySelectorAll("a,button")].find((el) => (el.getAttribute("aria-label") || "") === "Message");
        const grid = btn ? btn.parentElement : null;
        if (!grid) return null;
        const cells = [...grid.children];
        /* the label is the span that is not the glyph's wrapper */
        const words = cells
          .map((c) => [...c.querySelectorAll("span")].find((s) => !s.querySelector("svg") && s.textContent.trim().length > 1))
          .filter(Boolean)
          .map((s) => ({ word: s.textContent.trim(), over: Math.round(s.scrollWidth - s.clientWidth) }));
        /* WHO IS PAINTED AT EACH BUTTON'S TOP EDGE — hit testing follows paint
           order, so the answer is what the eye sees there */
        const tops = cells.map((c) => {
          const b = c.getBoundingClientRect();
          const at = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top) + 2);
          return {
            label: c.getAttribute("aria-label") || "?",
            ownsTop: !!at && (c === at || c.contains(at)),
            covering: at ? at.tagName.toLowerCase() : "nothing",
          };
        });
        return {
          cells: cells.length,
          cols: getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length,
          rowW: Math.round(grid.getBoundingClientRect().width),
          words,
          tops,
        };
      });
    for (const w of [430, 360]) {
      await owner.setViewportSize({ width: w, height: 932 });
      await owner.waitForTimeout(150);
      const cr = await measureContacts();
      check(Boolean(cr && cr.words.length), `contact row @${w}: the row is on the studio's home with its labels readable`);
      if (!cr) continue;
      const cut = cr.words.filter((x) => x.over > 0);
      check(cut.length === 0, `contact row @${w}: NOT ONE label is cut — ${cr.words.map((x) => x.word).join(" · ")}${cut.length ? ` (cut: ${cut.map((x) => `${x.word} by ${x.over}px`).join(", ")})` : ""}`);
      check(cr.cols <= 4, `contact row @${w}: at most four to a line — ${cr.cells} buttons over ${cr.cols} columns in ${cr.rowW}px`);
      const covered = cr.tops.filter((t) => !t.ownsTop);
      check(covered.length === 0, `contact row @${w}: every button owns its own TOP edge — nothing is painted over it${covered.length ? ` (covered: ${covered.map((t) => `${t.label} by a <${t.covering}>`).join(", ")})` : ""}`);
    }
    await owner.setViewportSize({ width: 430, height: 932 });
    /* …and the other end: the Enquiries DESK, opened the way its tile opens it —
       `?as={studio}`, because one screen serves the whole account and the settings
       would otherwise have no subject at all. */
    /* ⚠ RE-CUT 2 Oct 2026: enquiries are the studio INBOX's third desk again, and
       the old address is a redirect onto it (Rule 14) */
    await owner.goto(`${BASE}/enquiries?as=${studioId}`, { waitUntil: "networkidle" });
    check(new RegExp(`/business/${studioId}/inbox\\?show=enquiries$`).test(owner.url()), `enquiries: the old ?as= address lands on the studio's own Inbox (${owner.url()})`);
    check((await owner.getByRole("button", { name: /^Enquiries — / }).getAttribute("aria-pressed").catch(() => null)) === "true", "studio inbox: it opens on the Enquiries desk");
    const enqTypes = owner.getByRole("button", { name: /^Enquiry settings/ }).first();
    check((await enqTypes.count()) === 1, "enquiries desk: the studio's own What-you-take disclosure is here — the settings moved with the tool");
    await enqTypes.click();
    check((await owner.getByRole("switch", { name: "Take enquiries" }).count()) === 1, "enquiries desk: and the Take-enquiries switch is the first thing under it");
    await owner.goto(`${BASE}/`);
    await shot("owner-home");

    /* ⚠ THE ORGANIZATION'S OWN HOME AND ITS PUBLIC PAGE were driven here — the
       business's home rendering for its owner with an Events tile on it, and
       the public organization page answering a STRANGER 200 while listing no
       studios. Both went on 29 Sep 2026, and the earlier pair this block had
       replaced (`/business/stats` and the "Studios · combined" dashboard) had
       already gone on 26 Sep with the organization LOGIN. Nothing to drive. */

    await owner.close();

    /* ── TWO: a person — one header picture; then an artist — up to five (19 Sep 2026; ten before) ── */
    const me = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
    const shotMe = shotOf(me);
    userId = await signUp(me, `hero-user-${stamp}@example.com`);
    await onboard(me, "Rhea Kapoor", "Pune");
    await me.goto(`${BASE}/`);
    await me.getByRole("heading", { name: "Rhea Kapoor", exact: true }).waitFor();
    check((await discImgs(me)) === 1, "user home: the profile photo is on the disc");
    {
      /* ⚠ the empty banner keeps its space on a home too (3 Oct 2026, later) */
      const rb = (await rail(me).count()) === 1 ? await rail(me).boundingBox() : null;
      check(Boolean(rb && rb.height > 150), `user home: an empty header keeps the banner's space (3 Oct 2026) — ${rb ? `${Math.round(rb.width)}x${Math.round(rb.height)}` : "no rail"}`);
    }
    check((await me.getByLabel("Add a header picture").count()) === 0, "user home: NO Add tile on the hero — the header is filled behind the disc");
    check((await me.getByLabel("Change your photo").count()) === 0, "user home: NO ＋ on the disc either");
    check(await me.getByText(/^User(-\d{6})?$/).first().isVisible(), "user home: the role word, with the account number against it");
    /* the destination rather than the spelling — see the owner's own corner above */
    check((await me.getByRole("link", { name: "Your profile", exact: true }).count()) === 1 && (await me.getByRole("link", { name: "Your profile", exact: true }).getAttribute("href")) === `/person/${userId}`, "user home: the corner opens this person's own profile (21 Sep 2026)");
    check((await me.getByRole("link", { name: "Public view", exact: true }).count()) === 0, "user home: no eye — this is the end of the loop the user reported");
    /* ⚠ A PLAIN USER'S ROW IS NOT DRAWN AT ALL, which is what the public page
       does too ("user — nothing", the 19 Sep list): they have no artist page for
       an enquiry to land on, so a dead Enquiry would be worse than none */
    check((await me.getByRole("button", { name: /enquiries come to you here/ }).count()) === 0, "user home: no Enquiry — a plain user's page carries no buttons, and Home matches it");
    check((await me.getByRole("button", { name: "Edit profile", exact: true }).count()) === 1, "user home: the pencil on the corner, and it toggles edit mode (26 Sep 2026)");
    /* THE BAND ON HOME (19 Sep 2026): the two figures, the styles with their ＋,
       the links right under them with theirs — and NO rank */
    check((await me.getByTestId("home-followers").count()) === 1 && (await me.getByTestId("home-following").count()) === 1, "user home: Followers and Following, both clickable (19 Sep 2026)");
    check((await me.getByRole("button", { name: "Add a dance style" }).count()) === 0 && (await me.getByRole("button", { name: "Add a link" }).count()) === 0, "user home: read-only until the pencil — no ＋ (26 Sep 2026)");
    await enterEdit(me);
    check((await me.getByRole("button", { name: "Add a dance style" }).count()) === 1, "user home: the styles are edited HERE and nowhere else");
    check((await me.getByRole("button", { name: "Add a link" }).count()) === 1, "user home: and the links, right below them");
    /* a plain user's contact sheet: a number and an email, NO Call switch (the plan adds it) */
    await me.getByRole("button", { name: "Edit contact buttons" }).click();
    const myContacts = me.getByRole("dialog", { name: "Contact buttons" });
    await myContacts.waitFor();
    check((await myContacts.getByRole("switch", { name: "Show Call on my profile" }).count()) === 0, "user contact ⊕: no Call switch — a plain user's page draws no buttons");
    await myContacts.getByRole("button", { name: "Cancel" }).click();
    await myContacts.waitFor({ state: "detached" });
    check((await me.getByRole("link", { name: /rank/i }).count()) === 0, "user home: no rank (19 Sep 2026, the user: 'Remove rank from home')");
    /* the chips ride the figures row here too (20 Sep 2026) — measured, because
       nothing in the DOM says which row a chip landed in */
    const homeFig = await me.getByTestId("home-following").evaluate((el) => el.getBoundingClientRect().toJSON());
    const homeStats = await me.getByRole("link", { name: "Stats", exact: true }).evaluate((el) => el.getBoundingClientRect().toJSON());
    check(Math.abs(homeFig.top + homeFig.height / 2 - (homeStats.top + homeStats.height / 2)) < 26 && homeStats.left > homeFig.left, "user home: the QR and Stats chips ride the FIGURES row, to the right of the numbers (20 Sep 2026)");
    /* ⚠ AND THE TYPE AND THE ID ARE ONE TOKEN — "User-000482", no gap (20 Sep
       2026, the user: "Id should be placed like for eg. Artist-000123 together
       there should be no gap in that on both profile and home"). They shared a
       line already, as the two ends of a `space-between` row, so the gap between
       them was whatever the column had spare. The check is on the TEXT rather
       than on pixels, because the first cut put them side by side in a zero-gap
       flex row — which looks joined and is two text nodes, so the accessible
       text read "User -000482" with a space nothing on screen has. Contiguous
       text is the property that was actually wanted. */
    const eyebrowText = (await me.getByText(/^User(-\d{6})?$/).first().textContent()) || "";
    check(/^User-\d{6}$/.test(eyebrowText.trim()), `user home: the type and the ID are ONE token with no gap — read "${eyebrowText.trim()}" (20 Sep 2026)`);

    /* ⚠ THE BAND IS ONE SIZE ON EVERY PROFILE (20 Sep 2026, the user: "check all
       profile pages look similar according to their Profile Type in terms of
       placement of things for both home and profile tab").
       This is the check that would have caught the drift it was asked about:
       Home drew FULL-SIZE style tiles (12.5px) while the Profile tab, a studio's
       home and a crew's home all drew the same styles `small` (11.5px). Nothing
       about a NAME or a test id differs between the two — only the rendered
       size — so only a measurement finds it. Both screens are measured and
       compared; the number itself is deliberately not asserted, because the day
       the design changes it should change for all of them at once. */
    const tileFontOf = async (pg) => {
      const tile = pg.locator('[aria-label$="one of your styles"]').first();
      if ((await tile.count()) === 0) return null;
      return tile.evaluate((el) => getComputedStyle(el.querySelector("span") ?? el).fontSize);
    };
    const homeTileFont = await tileFontOf(me);
    await me.goto(`${BASE}/profile`);
    await me.getByTestId("my-hero").waitFor();
    const profileTileFont = await tileFontOf(me);
    check(
      homeTileFont !== null && homeTileFont === profileTileFont,
      `the style tiles are the SAME SIZE on Home and the Profile tab (home ${homeTileFont}, profile ${profileTileFont})`
    );
    await me.goto(BASE);
    await me.getByTestId("home-followers").waitFor();

    /* ── THE ONE PLACE A PICTURE CHANGES (16 Sep 2026; behind the disc since 19 Sep;
       ⚠ TWO PENCILS AND NO SHEET IN BETWEEN SINCE 20 Sep 2026 — the user: "Profile
       pic edit should just be a pencil besides and clciking on photo to view it not
       together in one. Similarly seprate for poster photos"). The picture is a
       picture: pressing it OPENS it. Each editor is one press from the hero. ── */
    check((await me.getByRole("button", { name: "Your pictures", exact: true }).count()) === 0, "user home: the in-between 'Your pictures' sheet is gone (20 Sep 2026)");
    check((await me.getByRole("button", { name: "Rhea Kapoor — profile picture" }).count()) === 1, "user home: pressing the disc opens the picture, nothing else");
    await enterEdit(me);
    check((await me.getByRole("button", { name: "Change profile picture" }).count()) === 1, "user home: and a pencil beside it is the only way to change it");
    check((await me.getByRole("button", { name: "Edit posters" }).count()) === 1, "user home: the posters have their OWN pencil on the rail");
    /* the disc's lightbox — what "clicking on profile pic should open the profile pic" means */
    await me.getByRole("button", { name: "Rhea Kapoor — profile picture" }).click();
    check((await me.getByLabel("Rhea Kapoor — picture 1 of 1").count()) === 1, "user home: and it is the PICTURE that opens, full size");
    await me.getByRole("button", { name: "Close the picture" }).click();
    /* the posters' draft grid, reached in ONE press from the rail */
    const myPosters = me.getByRole("dialog", { name: "Posters", exact: true });
    const openPosters = async () => {
      /* Save and Cancel close it outright now that it is not nested in anything,
         so each visit is one press — and this WAITS for the pencil rather than
         racing the page after a re-render. */
      await enterEdit(me);
      const edit = me.getByRole("button", { name: "Edit posters" });
      await edit.waitFor({ timeout: 20000 });
      await edit.click();
      await myPosters.waitFor();
    };
    await openPosters();
    check(await myPosters.getByText("0 / 1", { exact: true }).isVisible(), "posters: a user is offered ONE poster");
    await myPosters.getByRole("button", { name: "Cancel" }).click();
    const personRows = async () => {
      const live = await rest(`profile_header_photos?user_id=eq.${userId}&deleted_at=is.null&select=id`);
      return Array.isArray(live) ? live.length : -1;
    };
    await openPosters();
    await myPosters.getByLabel("Add picture").setInputFiles(FILE);
    await useIt(me);
    const userHeader = await myPosters
      .getByLabel("Remove photo 1")
      .first()
      .waitFor({ timeout: 25000 })
      .then(() => true)
      .catch(() => false);
    if (userHeader) {
      check(true, "edit profile: a staged picture appears in the sheet");
      check((await myPosters.getByLabel("Add picture").count()) === 0, "edit profile: and the tile is gone — one is the ceiling for a user");
      check((await railImgs(me)) === 0 && (await personRows()) === 0, "edit profile: nothing on the page or in the database until Save");
      await shotMe("profile-edit");
      /* Cancel discards a staged ADD as completely as a staged removal */
      await myPosters.getByRole("button", { name: "Cancel" }).click();
      check((await personRows()) === 0, "edit profile: Cancel threw the staged picture away — nothing was uploaded");
      await openPosters();
      await myPosters.getByLabel("Add picture").setInputFiles(FILE);
      await useIt(me);
      await myPosters.getByLabel("Remove photo 1").first().waitFor({ timeout: 25000 });
      await myPosters.getByRole("button", { name: "Save" }).click();
      await waitRailImgs(me, 1);
      check((await personRows()) === 1, "edit profile: and Save is what puts one on the record");
      await shotMe("user-home");

      /* the Artist plan, granted — what makes a person an artist, and the ceiling ten */
      await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
        method: "POST", headers: adminHeaders,
        body: JSON.stringify({ kind: "artist", user_id: userId, plan_key: "artist_monthly", price_inr: 0, period: "monthly", status: "active", current_period_start: today, current_period_end: until, granted: true, note: "Granted by shoot-hero.js — nothing charged", created_by: userId, updated_by: userId }),
      });
      await me.goto(`${BASE}/`);
      await me.getByText(/^Artist(-\d{6})?$/).first().waitFor();
      check((await railImgs(me)) === 1, "artist home: the header picture is still there");
      await openPosters();
      check((await myPosters.getByLabel("Add picture").count()) === 1, "artist edit profile: the Add tile is back — an artist holds five");
      await myPosters.getByLabel("Add picture").setInputFiles(FILE);
      await useIt(me);
      await myPosters.getByLabel("Remove photo 2").first().waitFor({ timeout: 25000 });
      await myPosters.getByRole("button", { name: "Save" }).click();
      await waitRailImgs(me, 2);
      check((await rail(me).getAttribute("role")) === "region", "artist home: two pictures, so the header swipes");
      check((await personRows()) === 2, "profile_header_photos holds the two rows, in the person's folder");
      await shotMe("artist-home");
      /* a person's floor is 0 — `remove_my_header_photo` has no minimum */
      await openPosters();
      await myPosters.getByLabel("Remove photo 1").click();
      check((await personRows()) === 2, "artist edit profile: a pressed ✕ has not touched the database");
      await myPosters.getByRole("button", { name: "Save" }).click();
      await waitRailImgs(me, 1);
      check((await personRows()) === 1, "artist edit profile: Save is what takes one out");

      /* the Profile tab: the same hero, as bare as Home's */
      await me.goto(`${BASE}/profile`);
      await me.getByTestId("my-hero").waitFor();
      check((await discImgs(me)) === 1 && (await railImgs(me)) === 1, "profile tab: the same disc and header");
      check((await me.getByLabel("Change your photo").count()) === 0 && (await me.getByLabel(/^Remove photo/).count()) === 0, "profile tab: and the same bare hero — no ＋, no ✕");
      /* 19 Sep 2026: the disc is a door here too, and there is no rank beside the figures */
      /* ⚠ RE-CUT 21 Sep 2026 — the claim it was making no longer exists to be made.
     `/profile` is a redirect to `/person/{me}` now, so this screen IS your public
     address and the disc's old "Open your public page" pointed at the page it was
     standing on. What must still be true is the pair: your own profile really is
     served at `/person/{you}`, and the disc is not a door to nowhere. */
  check(me.url().includes(`/person/${userId}`), "profile tab: /profile is this address now — one page per subject");
  check((await me.getByRole("link", { name: "Open your public page", exact: true }).count()) === 0, "profile tab: and the disc is no longer a door to the page you are on");
      check((await me.getByText(/rank$/).count()) === 0, "profile tab: no rank (19 Sep 2026, the user: 'remove rank from profile tab')");
      /* and no editing at all: the pencil went into Settings and the styles and
         links kept their rows and lost their ＋ (19 Sep 2026) */
      check((await me.getByRole("button", { name: "Edit profile", exact: true }).count()) === 0, "profile tab: NO pencil — the pencil is HOME's corner, and a profile page has none (26 Sep 2026)");
      check((await me.getByRole("button", { name: "Add a dance style" }).count()) === 0 && (await me.getByRole("button", { name: "Add a link" }).count()) === 0, "profile tab: the styles and the links are SHOWN here and changed on Home");
      /* ⚠ AND THE TAB HAS NO CORNER EITHER (21 Sep 2026, on the user's reading
         that the Profile tab and a profile page are the same thing). The check
         above is what makes it safe: the DISC is the door to the public page and
         names it, so the eye was a second door to one address. Both halves are
         asserted — the corner gone AND the disc still opening it — because
         removing a door is only safe while the other one is there. */
      check((await me.getByRole("link", { name: "Public view", exact: true }).count()) === 0 && (await me.getByRole("link", { name: "Your profile", exact: true }).count()) === 0, "profile tab: NO corner — the disc opens your public page and the Share chip sends it");
      /* ⚠⚠ RE-CUT 21 Sep 2026, AND IT RECORDS A REAL LOSS RATHER THAN A MOVED
         LOCATOR. `/person/{me}` used to draw the PUBLIC component with `isMe` —
         your page without the owner's extras, which is as close to "what a
         visitor sees" as this app ever offered. Your own profile is served at
         that address now, so that preview does not exist any more: there is ONE
         screen per subject and, for you, it is the owner's.
         What is asserted instead is the thing the merge must not have broken —
         the address really is your profile, it really is the OWNER's version
         (the Settings door is on it), and it still carries no corner, which is
         C37's rule. If a real visitor-preview is ever wanted back it is a
         parameter on this page, not the second page that just went. */
      await me.goto(`${BASE}/person/${userId}`);
      await me.getByTestId("my-hero").waitFor();
      /* ⚠ `exact: true`, AND IT IS NOT PEDANTRY (21 Sep 2026) — a bare string is
         a case-insensitive SUBSTRING match, and this screen's own figure buttons
         are named "3 followers" and "0 following", both of which contain
         "Follow". Without it this check reads the owner's own figures as a
         Follow bell and fails on a page that is right. Same trap as 20 Sep's
         "An organization does not follow", in a new coat. */
      /* ⚠ `/person/{you}/stats`, NOT `/stats` (22 Sep 2026). Those were two
         addresses for one person's stats drawing two different screens, and the
         merge makes the chip say the same thing to everybody — so the assertion
         reads the resolved address rather than the spelling the owner used to
         get. `/stats` is the redirect now, and is checked as one below. */
      check((await me.getByRole("button", { name: "Follow", exact: true }).count()) === 0 && (await me.getByRole("link", { name: "Stats", exact: true }).getAttribute("href")) === `/person/${userId}/stats`, "your own page at /person/{you}: no Follow bell, and the Stats chip opens your own record");
      check((await me.getByTestId("my-followers").count()) === 1, "your own page at /person/{you}: it is the OWNER's version — the figures open your own lists");
      /* ⚠ NO CORNER ON A PROFILE PAGE (21 Sep 2026, the user: "no top right
         button required on profile pages"). This is the OTHER end of the loop:
         C29 put a "Your profile" door here on 20 Sep, and with Home's eye
         pointing in it cycled two screens for ever. Both names are asserted
         absent, because the corner has worn each of them. */
      check((await me.getByRole("link", { name: "Your profile", exact: true }).count()) === 0 && (await me.getByRole("link", { name: "Public view", exact: true }).count()) === 0, "your own page at /person/{you}: NO corner at all — the back chip is how you leave a page you drilled into");

      /* ⚠⚠ `/stats` IS A REDIRECT NOW, AND THE QUERY IS THE HALF THAT COULD
         BREAK IN SILENCE (22 Sep 2026). Every tab, board, city, metric and
         style on that screen is URL state, and a live control opens it with
         one — a crew home's Stats chip, which does not know the viewer's id,
         and is why the address survives at all. (The crew DESK's "See crew
         ranking" and OrgDashboard's per-studio door were the other two, and
         went on 29 Sep 2026.) A redirect that dropped the parameters would answer
         every one of them with somebody's own record instead, and nothing on
         screen would say so. */
      /* ⚠ `waitForURL`, NOT `me.url()` STRAIGHT AFTER `goto` — and the reason is
         worth keeping. A redirect under a `loading.tsx` does NOT go out as a
         307: once a boundary streams, Next answers 200 and does the hop on the
         CLIENT (19 Sep 2026, when four specs went red on `expect(status).toBe(404)`
         for the same reason). So the first cut of this check read `/stats` off a
         page that was already rendering the right screen. `/stats`' own
         boundary is deleted now — a skeleton over a pure redirect is a flash of
         a thing that is not loading — but `/business/stats` still sits under
         `/business`'s, so the wait is what makes both honest. */
      await me.goto(`${BASE}/stats`);
      await me.waitForURL(/\/person\/[^/]+\/stats/, { timeout: 15_000 }).catch(() => {});
      check(new URL(me.url()).pathname === `/person/${userId}/stats`, `/stats resolves to this person's own address (read ${new URL(me.url()).pathname})`);
      await me.goto(`${BASE}/stats?tab=charts&seg=crew`);
      await me.waitForURL(/\/person\/[^/]+\/stats\?/, { timeout: 15_000 }).catch(() => {});
      const carried = new URL(me.url());
      check(carried.pathname === `/person/${userId}/stats` && carried.searchParams.get("tab") === "charts" && carried.searchParams.get("seg") === "crew", `/stats carries its whole query through the redirect (read ${carried.pathname}${carried.search})`);
      /* ⚠⚠ AND THE QUERY IS READ AGAIN (29 Sep 2026, the user: "it was supposed
         to be the one with the graphs and number grid, history and rankings in 3
         columns for all profiles").
         For one day this asserted the OPPOSITE — "no tab strip, the History
         library went with the second screen" — because that morning the two
         stats screens had been collapsed into the thin one. The three-column
         screen is back and universal, so `?tab=charts` lands on the Rankings
         column and the strip is there to be read. Both halves are checked: the
         column the query asked for, and the strip that makes it a column. */
      const standings = await me.getByTestId("standing-card").count().catch(() => 0);
      check(standings > 0, `/stats?tab=charts lands on the Rankings column — ${standings} standing card(s)`);
      /* ⚠ TWO COLUMNS SINCE 2 Oct 2026 (the user: "remove history from stats") */
      const tabs = await me.getByRole("link", { name: "History", exact: true }).count().catch(() => 0);
      const record = await me.getByRole("link", { name: "Record", exact: true }).count().catch(() => 0);
      check(tabs === 0 && record === 1, `the strip is Record · Rankings — no History column (read History ${tabs}, Record ${record})`);
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
    /* every business either account owns goes with it (18 Sep 2026): until
       29 Sep that meant the organization business as well, and what it still
       catches is the artist page Home provisions for the user once the plan is
       granted — otherwise an ownerless row is left behind */
    for (const uid of [ownerId, userId]) {
      if (!uid) continue;
      const owned = await rest(`business_members?user_id=eq.${uid}&member_role=eq.owner&select=business_id`);
      if (Array.isArray(owned) && owned.length) {
        await fetch(`${supabaseUrl}/rest/v1/businesses?id=in.(${owned.map((o) => o.business_id).join(",")})`, { method: "DELETE", headers: adminHeaders });
      }
    }
    if (ownerId) await fetch(`${supabaseUrl}/auth/v1/admin/users/${ownerId}`, { method: "DELETE", headers: adminHeaders });
    if (userId) await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: adminHeaders });
    await browser.close();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
  }
})();
