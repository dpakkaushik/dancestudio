/* EVERY TILE ON EVERY HOME, PRESSED (21 Sep 2026, the user: "Check for all
   functions on home tab for all profile types and see whether they are working
   as intended").

   Code review answers "where does this tile point". This answers the only
   question that matters to somebody holding the phone: PRESS IT — does a page
   come back, is it the right page, and does it say something when the account
   is brand new? Every account here is made fresh and empty, which is the state
   most likely to be broken and least likely to be clicked in development.

   Run:  $env:DANCEOS_BASE_URL="http://localhost:3100"; node scripts/shots/shoot-tiles.js  */
const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..", "..");
const BASE = process.env.DANCEOS_BASE_URL || "http://localhost:3100";
const env = Object.fromEntries(
  fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation", "User-Agent": "danceos-proof" };

let ok = 0, bad = 0;
const check = (c, m) => { console.log((c ? "  ok   " : "  FAIL ") + m); c ? ok++ : bad++; };

async function rest(method, pathname, body) {
  const r = await fetch(`${SUPA}${pathname}`, { method, headers: admin, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${pathname} -> ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

async function makeAccount(stamp, who, role) {
  const email = `tiles.${who}.${stamp}@example.com`;
  const password = `Tiles!${stamp}aA1`;
  const made = await rest("POST", "/auth/v1/admin/users", { email, password, email_confirm: true });
  await rest("POST", "/rest/v1/profiles", {
    id: made.id, full_name: `Tiles ${who} ${stamp}`, role, city: "Pune",
    created_by: made.id, updated_by: made.id,
  });
  if (role === "org") await rest("PATCH", `/rest/v1/profiles?id=eq.${made.id}`, { verified_at: new Date().toISOString() });
  return { id: made.id, email, password };
}

async function signIn(page, acc) {
  await page.goto(`${BASE}/login/email`, { waitUntil: "networkidle" });
  const btn = page.getByRole("button", { name: "Sign in" });
  await btn.waitFor({ timeout: 60000 });
  for (let i = 0; i < 20; i++) {
    await page.getByLabel("Email address").fill(acc.email);
    await page.getByLabel("Password", { exact: true }).fill(acc.password);
    if (await btn.isEnabled()) break;
    await page.waitForTimeout(800);
  }
  await btn.click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });
}

/** press every tile on the grid in front of us and report what came back */
async function pressEveryTile(page, who, expectedNames) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const panel = page.getByRole("navigation", { name: /tools/i }).or(page.locator("[data-tools-grid]"));
  // the grid is whatever links sit under the Tools heading; read them off the page
  const tiles = await page.evaluate(() => {
    const head = [...document.querySelectorAll("*")].find((e) => /Tools$/.test((e.textContent || "").trim()) && e.children.length === 0);
    const root = head ? head.closest("div")?.parentElement : null;
    const scope = root || document.body;
    return [...scope.querySelectorAll("a[href]")]
      .map((a) => ({ name: (a.textContent || "").trim(), href: a.getAttribute("href") }))
      .filter((t) => t.name && t.href && !t.href.startsWith("http"));
  });
  const names = tiles.map((t) => t.name);
  console.log(`\n── ${who}: ${names.join(" · ")}`);
  for (const want of expectedNames) {
    check(names.includes(want), `${who} · has a ${want} tile`);
  }

  for (const t of tiles) {
    if (!expectedNames.includes(t.name)) continue;
    const res = await page.goto(`${BASE}${t.href}`, { waitUntil: "domcontentloaded" });
    const status = res ? res.status() : 0;
    await page.waitForTimeout(700);
    const landed = new URL(page.url()).pathname;
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 4000);
    const blank = body.replace(/\s+/g, "").length < 40;
    check(status < 400 && !blank, `${who} · ${t.name} -> ${landed} (${status})${h1 ? ` h1="${h1.split("\n")[0]}"` : " NO h1"}${blank ? " ⚠ BLANK" : ""}`);
  }
}

(async () => {
  const stamp = Date.now().toString(36);
  const made = [];
  const b = await chromium.launch();
  try {
    // ── 1. a plain USER, brand new and empty
    const user = await makeAccount(stamp, "user", "user");
    made.push(user.id);
    const p1 = await b.newPage({ viewport: { width: 420, height: 1000 } });
    p1.on("pageerror", (e) => { console.log("PAGEERROR(user) " + e.message); bad++; });
    await signIn(p1, user);
    /* ⚠ Memberships is on a USER's grid since 21 Sep — they are who a membership
       is FOR, and a pass they had bought was reachable only by typing the URL */
    await pressEveryTile(p1, "user", ["Classes", "Events", "Calendar", "Crews", "Studios", "Routines", "Memberships", "Earnings"]);
    await p1.close();

    // ── 2. an ARTIST — a user with a live plan; Home provisions the page itself
    const artist = await makeAccount(stamp, "artist", "user");
    made.push(artist.id);
    const today = new Date().toISOString().slice(0, 10);
    const until = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    await rest("POST", "/rest/v1/subscriptions", {
      kind: "artist", user_id: artist.id, plan_key: "artist_monthly", price_inr: 700,
      period: "monthly", status: "active", granted: true,
      current_period_start: today, current_period_end: until,
      created_by: artist.id, updated_by: artist.id,
    });
    const p2 = await b.newPage({ viewport: { width: 420, height: 1000 } });
    p2.on("pageerror", (e) => { console.log("PAGEERROR(artist) " + e.message); bad++; });
    await signIn(p2, artist);
    /* ⚠ the artist PAGE is provisioned by Home's first render (`ensureArtistPage`),
       so the tiles that point at it are only right on the SECOND look — which is
       itself worth checking, because a first-time artist sees the first one. */
    await p2.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await pressEveryTile(p2, "artist", ["Classes", "Events", "Calendar", "Crews", "Studios", "Routines", "Team", "Students", "Earnings", "Memberships", "Assets"]);

    /* ⚠ A FORM OPENS OVER THE DESK THAT OFFERED IT, AND IS STILL A PAGE OF ITS
       OWN (22 Sep 2026, the user: "All forms and add buttons anywhere in home
       tab should open form like how setting page or edit profile page open from
       the same screen"). BOTH ends are asserted, because the whole design is
       that one form has two shells: the sheet over the desk, and `/routines/new`
       for the link somebody was handed (Rule 14). */
    await p2.goto(`${BASE}/routines`, { waitUntil: "networkidle" });
    const deskH1 = await p2.locator("h1").first().innerText().catch(() => "");
    await p2.getByRole("link", { name: "New routine" }).click();
    const addRoutine = p2.getByRole("dialog", { name: "Add routine" });
    await addRoutine.waitFor({ timeout: 15_000 }).catch(() => {});
    check(await addRoutine.isVisible().catch(() => false), "artist · New routine opens a sheet over the desk");
    check(new URL(p2.url()).search === "?new=1", `artist · the sheet is the URL, so back closes it (${new URL(p2.url()).search})`);
    check((await p2.locator("h1").first().innerText().catch(() => "")) === deskH1, "artist · the desk is still underneath it");
    await p2.goBack();
    await p2.waitForTimeout(600);
    check(!(await addRoutine.isVisible().catch(() => false)), "artist · back closes the sheet and leaves the desk");
    /* and the address still renders the whole form, for the link handed out */
    await p2.goto(`${BASE}/routines/new`, { waitUntil: "networkidle" });
    check((await p2.locator("h1").first().innerText().catch(() => "")) === "Add routine", "artist · /routines/new is still a page of its own (Rule 14)");
    check((await p2.getByRole("dialog").count()) === 0, "artist · and that page is not a sheet");

    /* ⚠ ADD CLASS IS THE ONE THE USER NAMED, and it opens from the section that
       owns it — an artist's register is the Manage segment of Your classes, so
       the href must keep `show=manage` or the list changes under the sheet. */
    await p2.goto(`${BASE}/my-classes?show=manage`, { waitUntil: "networkidle" });
    await p2.getByRole("link", { name: "Create class" }).click();
    const addClass = p2.getByRole("dialog", { name: "Add class" });
    await addClass.waitFor({ timeout: 15_000 }).catch(() => {});
    check(await addClass.isVisible().catch(() => false), "artist · Create class opens a sheet over the register");
    check(new URL(p2.url()).search.includes("show=manage") && new URL(p2.url()).search.includes("new=1"), `artist · and it KEEPS the segment it was opened from (${new URL(p2.url()).search})`);
    await p2.close();

    // ── 3. an ORGANIZATION, verified, with no studio yet
    const org = await makeAccount(stamp, "org", "org");
    made.push(org.id);
    const p3 = await b.newPage({ viewport: { width: 420, height: 1000 } });
    p3.on("pageerror", (e) => { console.log("PAGEERROR(org) " + e.message); bad++; });
    await signIn(p3, org);
    await pressEveryTile(p3, "org", ["Events", "Studios", "Calendar", "Team", "Earnings", "Assets"]);

    /* ⚠ AN ORGANIZATION SELLS NO MEMBERSHIPS, AND THE DESK SAYS SO BY URL
       (22 Sep 2026, the user: "membership not required for organization"). No
       grid has ever drawn that tile for one, so the only way in was to type it —
       and the desk admitted the owner of any business they are on, which
       includes an organization's own hosting row (R15). Asserted at BOTH ends,
       the way every redirect in this repo is: the hosting row's id is read off
       the Events tile, which is the one door that names it. */
    await p3.goto(`${BASE}/`);
    const eventsHref = await p3.getByRole("link", { name: "Events", exact: true }).first().getAttribute("href");
    const hostId = (eventsHref || "").split("/")[2] || "";
    check(/^[0-9a-f-]{36}$/.test(hostId), `org: the Events tile names the hosting row (${eventsHref})`);
    if (hostId) {
      await p3.goto(`${BASE}/business/${hostId}/memberships`);
      /* ⚠ WAIT FOR THE URL, NEVER READ IT ONCE (the 19 Sep lesson, met again).
         Every signed-in desk streams behind a `loading.tsx`, and once a boundary
         streams a server `redirect()` goes out as a **200 with a client-side
         hop** — so the events desk is already painted while the address bar
         still says /memberships for another tick. Four specs went red on
         `expect(status).toBe(404)` for this same reason in September. */
      const landed = await p3
        .waitForURL(`**/business/${hostId}/events`, { timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      check(landed, `org: the memberships desk redirects to its events (${new URL(p3.url()).pathname})`);

      /* ⚠ CREATE EVENT OPENS OVER THE DESK THAT OFFERS IT (22 Sep 2026, ask 6).
         The GST number is stamped first because a door that would be refused is
         not drawn: without one this desk prints the database's sentence where
         the button goes, which is the 21 Sep rule and is the reason the button
         is not simply always there. */
      /* ⚠ a GSTIN is UNIQUE across the table, so it cannot be the documented
         placeholder ABC12345 — a demo account already holds that one, and the
         PATCH answered 23505. Three letters and five digits is the shape
         `verify_gstin` accepts; the digits are this run's own. */
      const gstin = `DOS${String(Math.floor(Math.random() * 90000) + 10000)}`;
      await rest("PATCH", `/rest/v1/profiles?id=eq.${org.id}`, { gstin, gstin_verified_at: new Date().toISOString() });
      await p3.goto(`${BASE}/business/${hostId}/events`, { waitUntil: "networkidle" });
      await p3.getByRole("link", { name: "Create event" }).click();
      const addEvent = p3.getByRole("dialog", { name: "Add event" });
      await addEvent.waitFor({ timeout: 15_000 }).catch(() => {});
      check(await addEvent.isVisible().catch(() => false), "org · Create event opens a sheet over the events desk");
      check(new URL(p3.url()).search === "?new=1", `org · the event sheet is the URL, so back closes it (${new URL(p3.url()).search})`);
      await p3.goBack();
      await p3.waitForTimeout(600);
      check(!(await addEvent.isVisible().catch(() => false)), "org · back closes the event sheet and leaves the desk");
      /* and the route is still a page of its own (Rule 14) — with a real <h1>,
         which it did NOT have until it moved onto FormPage: its title was a div,
         so `/events/new` and `…/edit` rendered no heading for a screen reader */
      await p3.goto(`${BASE}/business/${hostId}/events/new`, { waitUntil: "networkidle" });
      check((await p3.locator("h1").first().innerText().catch(() => "")) === "Add event", "org · /events/new is still a page, and has a real heading at last");
      check((await p3.getByRole("dialog").count()) === 0, "org · and that page is not a sheet");
    }

    // ── 4. and a STUDIO's own home, under that organization
    const [studio] = await rest("POST", "/rest/v1/businesses", {
      type: "studio", name: `Tiles Studio ${stamp}`, area: "Kothrud", city: "Pune",
      lat: 18.5204, lng: 73.8567, visibility: "unlisted", styles: ["Hip-Hop"],
      created_by: org.id, updated_by: org.id,
    });
    await rest("POST", "/rest/v1/business_members", { business_id: studio.id, user_id: org.id, member_role: "owner", created_by: org.id, updated_by: org.id });
    /* ⚠ AND THE STUDIO'S STATS CHIP OPENS THIS STUDIO'S BOARD (21 Sep 2026). It
       pointed at `/stats?tab=charts&seg=studio`, which is the PERSON's stats
       screen on the studios leaderboard — a question about you, on a studio's
       own home. Asserted at both ends so the old target cannot come back. */
    await p3.goto(`${BASE}/business/${studio.id}`, { waitUntil: "networkidle" });
    const statsHref = await p3.getByRole("link", { name: "Stats", exact: true }).getAttribute("href").catch(() => null);
    check(statsHref === `/studio/${studio.id}/stats`, `studio · the Stats chip opens THIS studio's board (read ${statsHref})`);
    const sres = await p3.goto(`${BASE}/studio/${studio.id}/stats`, { waitUntil: "domcontentloaded" });
    check((sres ? sres.status() : 0) < 400, "studio · and that board answers");
    await p3.goto(`${BASE}/business/${studio.id}`, { waitUntil: "networkidle" });
    const stiles = await p3.evaluate(() => [...document.querySelectorAll("a[href]")]
      .map((a) => ({ name: (a.textContent || "").trim(), href: a.getAttribute("href") }))
      .filter((t) => t.href && t.href.includes("/business/") && t.name));
    console.log(`\n── studio home: ${[...new Set(stiles.map((t) => t.name))].join(" · ")}`);
    /* ⚠⚠ WHERE THIS STUDIO STANDS IS IN ITS OWN SETTINGS (21 Sep 2026, the user:
       "Studio-Invoices subscription and refunds to be managed from settings" and
       "settings are seprate for each profile type according to which profile you
       are in"). This block asserted the same four ON THE HOME a few hours
       earlier; the same user moved them, so it asserts the move at BOTH ends —
       gone from the home, present in the sheet — because a check that only
       looks at the new place cannot tell you the old one was cleared.
       ⚠ The sheet is the CHROME's now, which is the whole reason it can be a
       studio's: it used to be rendered by the person's own profile page. */
    const shome = await p3.locator("body").innerText().catch(() => "");
    check(!shome.includes("Get this studio verified"), "studio · the verification form has LEFT its home for Settings");
    check(!shome.includes("NOT LIVE"), "studio · and the subscription standing with it");
    check(
      !stiles.some((t) => t.href === `/business/${studio.id}/refunds`),
      "studio · and the Refunds door — one place per subject, never two"
    );
    /* THE GEAR, ON A STUDIO'S OWN PAGE, OPENS THE STUDIO'S SETTINGS */
    await p3.getByRole("button", { name: "Settings", exact: true }).click();
    const sheet = p3.getByRole("dialog", { name: "Settings" });
    await sheet.waitFor({ state: "visible", timeout: 15_000 });
    const sTxt = await sheet.innerText();
    check(sTxt.includes("THIS STUDIO"), "studio · Settings is THE STUDIO'S — the block is headed THIS STUDIO");
    check(sTxt.includes(studio.name), "studio · and it says whose settings these are");
    for (const want of ["Verification", "Subscription", "Invoices", "Refunds", "Payments", "Enquiry types"]) {
      check(sTxt.includes(want), `studio · Settings carries ${want}`);
    }
    /* ⚠ and NOT the person's own plan switch — that is the account's, and a
       sheet that mixed the two is the "which profile am I changing?" bug */
    check(!sTxt.includes("Artist tools"), "studio · and NOT the account's own plan switch");
    check(sTxt.includes("ACCOUNT"), "studio · while ACCOUNT stays, because signing out is the account's");
    /* the verification form has a page of its own, and it is the owner's */
    const vres = await p3.goto(`${BASE}/business/${studio.id}/verification`, { waitUntil: "domcontentloaded" });
    await p3.waitForTimeout(800);
    const vTxt = await p3.locator("body").innerText().catch(() => "");
    check((vres ? vres.status() : 0) < 400 && vTxt.includes("Get this studio verified"), "studio · and Verification has a page, with the real form on it");
    await p3.goto(`${BASE}/business/${studio.id}`, { waitUntil: "networkidle" });
    for (const want of ["Classes", "Calendar", "Team", "Students", "Earnings", "Memberships", "Assets", "Rooms"]) {
      const t = stiles.find((x) => x.name === want);
      if (!t) { check(false, `studio · has a ${want} tile`); continue; }
      const res = await p3.goto(`${BASE}${t.href}`, { waitUntil: "domcontentloaded" });
      await p3.waitForTimeout(700);
      const landed = new URL(p3.url()).pathname;
      const body = (await p3.locator("body").innerText().catch(() => "")).slice(0, 3000);
      const blank = body.replace(/\s+/g, "").length < 40;
      check((res ? res.status() : 0) < 400 && !blank, `studio · ${want} -> ${landed}${blank ? " ⚠ BLANK" : ""}`);
    }

    /* ⚠⚠ THE SWITCHER IS INSIDE THE MARK, AND BOTH IT AND THE GEAR ARE ON A
       DRILL PAGE (21 Sep 2026, the user: "Profile switcher should be inside the
       dance os logo and should remain constant everywhere").
       ⚠ Asserted on a DESK on purpose — that is the half that has been wrong
       twice. When the switcher lived on the mark (18 Sep) the mark was drawn on
       six screens, so a desk had no switcher; when it moved to a chip to be
       constant (21 Sep) it was no longer on the logo. The mark is drawn
       everywhere now, so a desk must carry both controls AND its back chip. */
    await p3.goto(`${BASE}/business/${studio.id}/rooms`, { waitUntil: "networkidle" });
    const drill = await p3.evaluate(() => ({
      switcher: document.querySelectorAll('[aria-haspopup="menu"]').length,
      gear: [...document.querySelectorAll("button")].filter((b) => b.getAttribute("aria-label") === "Settings").length,
      back: [...document.querySelectorAll('[aria-label="Go back"]')].length,
    }));
    check(drill.switcher === 1, `drill page · the switcher is here, once (${drill.switcher})`);
    check(drill.gear === 1, `drill page · and the gear (${drill.gear})`);
    check(drill.back === 1, `drill page · and the back chip is NOT what the mark replaced (${drill.back})`);
    await p3.getByRole("button", { name: /^Switch profile/ }).click();
    const menu = p3.getByRole("menu", { name: "Your profiles" });
    await menu.waitFor({ state: "visible", timeout: 15_000 });
    const mTxt = await menu.innerText();
    check(mTxt.includes("HERE") && mTxt.includes(studio.name), "drill page · and it opens on the studio you are in, marked HERE");
    check(mTxt.includes("Log out"), "drill page · with Log out, reachable from anywhere");
    await p3.keyboard.press("Escape").catch(() => {});
    await p3.close();
  } catch (e) {
    console.log("\nTHREW: " + e.message);
    bad++;
  } finally {
    await b.close();
    for (const id of made) {
      try {
        const owned = await rest("GET", `/rest/v1/businesses?created_by=eq.${id}&select=id`);
        for (const o of owned || []) await rest("DELETE", `/rest/v1/businesses?id=eq.${o.id}`);
        await rest("DELETE", `/auth/v1/admin/users/${id}`);
      } catch (e) { console.log("  ⚠ cleanup " + id + ": " + e.message); }
    }
    console.log("\n  ·    cleaned up");
  }
  console.log(`\n${ok} passed, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})();
