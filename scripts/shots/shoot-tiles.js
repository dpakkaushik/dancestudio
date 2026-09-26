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

/* 26 Sep 2026: every account is a USER - the organization login is retired
   (20260926120000); an organization is a business a person opens from its hub */
async function makeAccount(stamp, who) {
  const email = `tiles.${who}.${stamp}@example.com`;
  const password = `Tiles!${stamp}aA1`;
  const made = await rest("POST", "/auth/v1/admin/users", { email, password, email_confirm: true });
  await rest("POST", "/rest/v1/profiles", {
    id: made.id, full_name: `Tiles ${who} ${stamp}`, role: "user", city: "Pune", styles: ["Hip-Hop"],
    created_by: made.id, updated_by: made.id,
  });
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

/** press every tile on the grid in front of us and report what came back.
 *  `startPath` is the home the grid is on - a person's `/`, or a business's own
 *  home (`/business/{id}`) since 26 Sep 2026, when an organization became one */
async function pressEveryTile(page, who, expectedNames, startPath = "/") {
  await page.goto(`${BASE}${startPath}`, { waitUntil: "networkidle" });
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

/** ARRANGING A GRID, END TO END (22 Sep 2026) — the control on top of the
 *  storage `20260922090000` applied, driven the way somebody would.
 *
 *  ⚠ THE CHECK THAT MATTERS IS THE RELOAD. The user's own answer to where the
 *  order lives was **"on the account, all devices"**, so an arrangement that
 *  only holds in React state would pass every other assertion here and be
 *  exactly the feature they did not ask for. */
async function arrangeGrid(page, who, url) {
  await page.goto(url, { waitUntil: "networkidle" });
  const read = () => page.evaluate(() => {
    const head = [...document.querySelectorAll("*")].find((e) => /Tools$/.test((e.textContent || "").trim()) && e.children.length === 0);
    const root = head ? head.closest("div")?.parentElement : null;
    return [...(root || document.body).querySelectorAll("a[href]")].map((a) => (a.textContent || "").trim()).filter(Boolean);
  });

  const before = await read();
  const arrange = page.getByRole("button", { name: "Arrange tools", exact: true });
  check(await arrange.isVisible().catch(() => false), `${who} · the grid offers "Arrange tools" at its foot, not on the head (C34)`);
  await arrange.click();

  /* the arranging list is ONE COLUMN, which is why the arrows are honest: in a
     two-up grid "up" would mean up-AND-right */
  const up = page.getByRole("button", { name: `Move ${before[1]} up` });
  check(await up.isVisible().catch(() => false), `${who} · every row carries its own named arrows ("Move ${before[1]} up")`);
  const topUp = page.getByRole("button", { name: `Move ${before[0]} up` });
  check(await topUp.isDisabled().catch(() => false), `${who} · and the first row's ▲ is disabled — a move off the top is not offered`);

  await up.click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.waitForTimeout(600);
  const after = await read();
  check(after[0] === before[1] && after[1] === before[0], `${who} · the grid is re-ordered (${before[0]}·${before[1]} -> ${after[0]}·${after[1]})`);

  /* ⚠ THE ONE THAT PROVES THE FEATURE */
  await page.reload({ waitUntil: "networkidle" });
  const reloaded = await read();
  check(reloaded.join("|") === after.join("|"), `${who} · and it SURVIVES a reload — the order is on the account (${reloaded.slice(0, 2).join(" · ")})`);
  check(reloaded.length === before.length, `${who} · with every tile still drawn (${reloaded.length} of ${before.length}) — an arrangement never costs a door`);

  /* Reset forgets the key rather than storing an empty list.
     ⚠ THE FIRST OF THESE TWO IS THE ONE THAT CAUGHT A REAL DEFECT: Reset used to
     derive "the default" from the tiles it was HANDED, which are already
     arranged once somebody has arranged them — so it stored exactly the right
     thing and the list did not move until the next navigation. Reset is only
     honest if it is visible before a reload. */
  await page.getByRole("button", { name: "Arrange tools", exact: true }).click();
  await page.getByRole("button", { name: "Reset to default", exact: true }).click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.waitForTimeout(400);
  const resetNow = await read();
  check(resetNow.join("|") === before.join("|"), `${who} · Reset moves the grid AT ONCE, not on the next navigation (${resetNow.slice(0, 2).join(" · ")})`);
  await page.reload({ waitUntil: "networkidle" });
  const reset = await read();
  check(reset.join("|") === before.join("|"), `${who} · Reset puts the code's own order back, and that survives a reload too`);
  /* nothing to reset, so nothing is offered — a control that can only be a no-op */
  await page.getByRole("button", { name: "Arrange tools", exact: true }).click();
  check((await page.getByRole("button", { name: "Reset to default", exact: true }).count()) === 0, `${who} · and Reset is not offered when there is nothing to reset`);
  await page.getByRole("button", { name: "Done", exact: true }).click();
}

/** A PERSON OPENS A STUDIO, AND TAKES THEIR OWN CLASS IN IT (26 Sep 2026, the
 *  user: "allow user and artist to create studios now from studios tab at home
 *  in a section … so studio profiles can be managed from the profile switcher
 *  … when the same user is creating classes from studio … no verification is
 *  required but keeps a log in the inbox"). Driven the way somebody would: the
 *  sheet on the hub, then every place the studio must now appear — the card,
 *  the switcher, THIS STUDIO in Settings, YOUR STUDIOS under the plan — then a
 *  class the owner takes themselves, which the register may publish at once.
 *  ⚠ Until `20260926090000` is applied the live gate still refuses a person;
 *  the segment says SKIP in that case rather than reporting a red that means
 *  "not applied yet". */
async function personOpensAStudio(page, who, acc, stamp) {
  const name = `Tiles Own Studio ${stamp}`;
  await page.goto(`${BASE}/business`, { waitUntil: "networkidle" });
  const gate = await page.getByRole("status").filter({ hasText: "Add studio" }).innerText().catch(() => "");
  if (/Only an organization/.test(gate)) { console.log(`  SKIP ${who} · the live gate still refuses a person — apply 20260926090000 first`); return null; }
  check(await page.getByRole("button", { name: "Add studio" }).isVisible().catch(() => false), `${who} · the Studios hub offers Add studio to a person`);
  await page.getByRole("button", { name: "Add studio" }).click();
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="area"]').fill("Baner");
  await page.getByLabel("Choose a city").first().selectOption("Pune");
  /* the sheet asks for a number and an email now (26 Sep 2026) */
  await page.locator('input[name="phone"]').fill("+919876543210");
  await page.locator('input[name="contact_email"]').fill(`tiles.${who}.studio.${stamp}@example.com`);
  await page.getByLabel("Room 1 name").fill("Floor 1");
  await page.getByLabel("Add a dance style").selectOption("Hip-Hop");
  await page.getByRole("button", { name: "Create studio" }).click();
  const card = page.getByTestId("studio-card").filter({ hasText: name });
  await card.waitFor({ timeout: 20_000 }).catch(() => {});
  check(await card.isVisible().catch(() => false), `${who} · the studio is a card under YOUR STUDIOS`);
  const strip = card.getByTestId("studio-verification");
  check((await strip.getAttribute("aria-label").catch(() => "")) === "Studio verification: Not verified", `${who} · and the same verification form stands under it — the process is the same`);
  const href = await card.getByRole("link", { name: `${name} — open the studio` }).getAttribute("href").catch(() => "");
  const studioId = (href || "").split("/")[2] || "";
  check(/^[0-9a-f-]{36}$/.test(studioId), `${who} · the card opens the studio's own home (${href})`);
  if (!studioId) return null;

  /* the switcher is where it is run from */
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /switch profile/i }).click();
  const row = page.getByRole("menuitem", { name: new RegExp(name) }).or(page.getByRole("link", { name: new RegExp(name) }));
  check(await row.first().isVisible().catch(() => false), `${who} · the profile switcher lists the studio`);
  await page.keyboard.press("Escape");

  /* THIS STUDIO in its own Settings — verification progress and the subscription */
  await page.goto(`${BASE}/business/${studioId}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Settings" });
  await sheet.waitFor({ state: "visible", timeout: 15_000 });
  const sTxt = await sheet.innerText();
  check(sTxt.includes("THIS STUDIO") && sTxt.includes(name), `${who} · its Settings are THE STUDIO'S (THIS STUDIO · ${name})`);
  check(/Verification/.test(sTxt) && /not yet/i.test(sTxt), `${who} · with Verification reading "not yet"`);
  /* the Subscription tile is the studio's own GRID's (26 Sep 2026), not Settings' */
  check(!/Subscription/.test(sTxt), `${who} · and NO Subscription tile in Settings — it is on the studio's home`);
  await page.keyboard.press("Escape");
  await page.goto(`${BASE}/business/${studioId}`, { waitUntil: "networkidle" });
  check((await page.getByRole("link", { name: "Subscription", exact: true }).getAttribute("href").catch(() => null)) === `/business/${studioId}/subscription`, `${who} · the studio's home carries a Subscription tile onto its own mandate`);
  await page.goto(`${BASE}/subscription`, { waitUntil: "networkidle" });
  const subTxt = await page.locator("body").innerText().catch(() => "");
  check(subTxt.includes("YOUR STUDIOS") && subTxt.includes(name), `${who} · /subscription lists the studio under YOUR STUDIOS, beside the person's own plan`);
  check((await page.getByTestId("studio-subscription").filter({ hasText: name }).getByRole("button", { name: /^Subscribe/ }).count()) === 0, `${who} · and Subscribe is NOT offered before the badge`);

  /* the owner takes their own class: nobody is asked, Publish is open at once, the Inbox keeps the line */
  await page.goto(`${BASE}/business/${studioId}/classes?new=1`, { waitUntil: "networkidle" });
  const form = page.getByRole("dialog", { name: "Add class" });
  await form.waitFor({ timeout: 15_000 }).catch(() => {});
  check(await form.isVisible().catch(() => false), `${who} · Create class opens over the studio's register`);
  await form.getByLabel("Class date").fill(new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10));
  await form.getByRole("button", { name: "Pick a dance style" }).or(form.getByRole("button", { name: /dance style/i })).first().click().catch(() => {});
  await form.getByPlaceholder(/search/i).first().fill("Hip").catch(() => {});
  await form.getByRole("option", { name: "Hip-Hop" }).or(form.getByRole("button", { name: "Hip-Hop", exact: true })).first().click().catch(() => {});
  await form.getByRole("radio", { name: "Floor 1" }).or(form.getByText("Floor 1", { exact: true })).first().click().catch(() => {});
  await form.getByRole("button", { name: "Continue" }).click();
  const selfBtn = form.getByRole("button", { name: /I take this class myself/ });
  check(await selfBtn.isVisible().catch(() => false), `${who} · the form offers "I take this class myself" to the owner`);
  await selfBtn.click();
  check(await form.getByTestId("self-teacher").isVisible().catch(() => false), `${who} · and says no confirmation is needed`);
  await form.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("button", { name: "Save draft", exact: true }).last().click();
  await form.waitFor({ state: "detached", timeout: 20_000 }).catch(() => {});
  await page.goto(`${BASE}/business/${studioId}/classes`, { waitUntil: "networkidle" });
  /* a new class is a DRAFT, and the register opens on Published — the Draft
     segment is where its Publish pill is (the happy path presses the same pill) */
  await page.getByRole("button", { name: /^Draft, \d+ classes$/ }).click().catch(() => {});
  const publish = page.getByRole("button", { name: "Publish", exact: true });
  await publish.first().waitFor({ timeout: 15_000 }).catch(() => {});
  check((await publish.count()) >= 1, `${who} · the register offers Publish with nothing in its way — nobody was asked (${(await page.getByRole("button", { name: /^Publish/ }).allTextContents().catch(() => [])).join(" | ") || "no Publish pill at all"})`);
  /* the log: the Requests desk's SENT side — an ask the studio made and its answer */
  await page.goto(`${BASE}/inbox`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Requests/ }).click().catch(() => {});
  await page.getByRole("button", { name: "Sent requests" }).click().catch(() => {});
  const inbox = await page.locator("body").innerText().catch(() => "");
  check(/Hip-Hop/.test(inbox) && /confirmed/i.test(inbox), `${who} · the Inbox keeps the line, wearing its answer`);
  await page.goto(`${BASE}/notifications`, { waitUntil: "networkidle" });
  check(/You take Hip-Hop/.test(await page.locator("body").innerText().catch(() => "")), `${who} · and the bell says "You take …" — the log the user asked for`);
  return studioId;
}

(async () => {
  const stamp = Date.now().toString(36);
  const made = [];
  const b = await chromium.launch();
  try {
    // ── 1. a plain USER, brand new and empty
    const user = await makeAccount(stamp, "user");
    made.push(user.id);
    const p1 = await b.newPage({ viewport: { width: 420, height: 1000 } });
    p1.on("pageerror", (e) => { console.log("PAGEERROR(user) " + e.message); bad++; });
    await signIn(p1, user);
    /* ⚠ Memberships is on a USER's grid since 21 Sep — they are who a membership
       is FOR, and a pass they had bought was reachable only by typing the URL */
    await pressEveryTile(p1, "user", ["Classes", "Events", "Calendar", "Crews", "Studios", "Routines", "Memberships", "Earnings"]);
    /* the grid is arrangeable, and the arrangement is the account's (22 Sep 2026) */
    await arrangeGrid(p1, "user", `${BASE}/`);
    /* a person opens a studio, runs it from the switcher, takes their own class (26 Sep 2026) */
    await personOpensAStudio(p1, "user", user, stamp);
    await p1.close();

    // ── 2. an ARTIST — a user with a live plan; Home provisions the page itself
    const artist = await makeAccount(stamp, "artist");
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

    /* ⚠ AND THE TWO NOBODY LINKS TO ANY MORE (22 Sep 2026, found by auditing
       what still points at each route). `/memberships/new` and `/crews/new`
       were pages until C54 made both a sheet; every door in the app now opens
       the sheet, so the ROUTES survive on Rule 14 alone — a link somebody was
       handed, a bookmark, the installed TWA's last URL. Nothing drove either
       one, which is exactly how a kept promise rots unnoticed: the previous
       session found `shoot-hero` red for four days for the same reason.
       An unlinked route needs a check MORE than a linked one, not less. */
    await p2.goto(`${BASE}/memberships/new`, { waitUntil: "networkidle" });
    check((await p2.locator("h1").first().innerText().catch(() => "")) === "Add membership", "artist · /memberships/new is still a page, though nothing links to it (Rule 14)");
    check((await p2.getByRole("dialog").count()) === 0, "artist · and that page is not a sheet");
    await p2.goto(`${BASE}/crews/new`, { waitUntil: "networkidle" });
    check((await p2.locator("h1").first().innerText().catch(() => "")) === "Create crew", "artist · /crews/new is still a page, though nothing links to it (Rule 14)");
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

    // ── 3. an ORGANIZATION — a BUSINESS a person opens (26 Sep 2026, the user:
    //       "make organization a tab on home for artist and users and mechanism
    //       to create and open an organization similar to studios"). The account
    //       is a USER; the organization is opened from the Organizations hub
    //       through the sheet, the way a studio is, and then run from ITS OWN
    //       home, where its tiles are pressed.
    const org = await makeAccount(stamp, "org");
    made.push(org.id);
    const p3 = await b.newPage({ viewport: { width: 420, height: 1000 } });
    p3.on("pageerror", (e) => { console.log("PAGEERROR(org) " + e.message); bad++; });
    await signIn(p3, org);
    const orgName = `Tiles Org ${stamp}`;
    await p3.goto(`${BASE}/organizations`, { waitUntil: "networkidle" });
    check(await p3.getByRole("button", { name: "Add organization" }).isVisible().catch(() => false), "org · the Organizations hub offers Add organization to a person");
    await p3.getByRole("button", { name: "Add organization" }).click();
    await p3.locator('input[name="name"]').fill(orgName);
    await p3.locator('input[name="area"]').fill("Kothrud");
    await p3.getByLabel("Choose a city").first().selectOption("Pune");
    await p3.locator('input[name="phone"]').fill("+919876543210");
    await p3.locator('input[name="contact_email"]').fill(`tiles.org.biz.${stamp}@example.com`);
    /* "Open organization" — the sheet's own word (a studio's is "Create studio") */
    await p3.getByRole("button", { name: "Open organization" }).click();
    await p3.getByText(orgName, { exact: true }).first().waitFor({ timeout: 20_000 }).catch(() => {});
    const orgRows = await rest("GET", `/rest/v1/businesses?name=eq.${encodeURIComponent(orgName)}&type=eq.org&deleted_at=is.null&select=id,visibility`);
    const hostId = (orgRows && orgRows[0] && orgRows[0].id) || "";
    check(/^[0-9a-f-]{36}$/.test(hostId), `org · the sheet made an org business (${hostId || "none"})`);
    check(orgRows && orgRows[0] && orgRows[0].visibility === "unlisted", "org · born PRIVATE - its own GST number and its own mandate are what make it public");

    /* the organization's OWN home carries its tools - the person's Home does not */
    await pressEveryTile(p3, "org", ["Events", "Team", "Earnings", "Assets", "Subscription"], `/business/${hostId}`);

    /* ⚠ AN ORGANIZATION SELLS NO MEMBERSHIPS, AND THE DESK SAYS SO BY URL
       (22 Sep 2026, the user: "membership not required for organization"). No
       grid has ever drawn that tile for one, so the only way in was to type it —
       and the desk admitted the owner of any business they are on, which
       includes an organization's own row. Asserted at BOTH ends, the way every
       redirect in this repo is. */
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
         `verify_business_gstin` accepts; the digits are this run's own.
         26 Sep 2026: the number is the ORG BUSINESS's, stamped on its row. */
      const gstin = `DOS${String(Math.floor(Math.random() * 90000) + 10000)}`;
      await rest("PATCH", `/rest/v1/businesses?id=eq.${hostId}`, { gstin, gstin_verified_at: new Date().toISOString() });
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

    // ── 4. and a STUDIO's own home, owned by the same person (an organization
    //       runs no studios since 26 Sep 2026 - the person does)
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
    for (const want of ["Verification", "Invoices", "Refunds", "Payments", "Enquiry types"]) {
      check(sTxt.includes(want), `studio · Settings carries ${want}`);
    }
    /* ⚠⚠ NO EDIT TILE AND NO SUBSCRIPTION TILE HERE (26 Sep 2026, the user: "edit
       profile to be removed from all profiles settings and should be a button on
       top right … subscriptions also become an option on home tab for all
       profiles and is removed from settings for all"). Both are the studio's own
       home's now — the pencil on its corner, the Subscription tile in its grid. */
    check(!sTxt.includes("Edit studio") && !/Subscription/.test(sTxt), "studio · Settings carries NO Edit tile and NO Subscription tile — both are the home's (26 Sep 2026)");
    await p3.keyboard.press("Escape");
    await p3.goto(`${BASE}/business/${studio.id}`, { waitUntil: "networkidle" });
    /* THE PENCIL TOGGLES EDIT MODE, AND EDIT DETAILS IS THE SHEET'S ADDRESS.
       Driven rather than read, because a chip that is drawn and lands nowhere is
       the Memberships bug of 21 Sep: press it, and the studio's own Edit sheet
       has to open over its home. */
    check((await p3.getByRole("link", { name: "Edit details" }).count()) === 0, "studio · no Edit details before the pencil");
    const pencil = p3.getByRole("button", { name: "Edit profile", exact: true });
    await pencil.click();
    await p3.getByRole("link", { name: "Edit details" }).click();
    const sEdit = p3.getByRole("dialog", { name: "Edit business" });
    await sEdit.waitFor({ state: "visible", timeout: 15_000 });
    check(new URL(p3.url()).searchParams.get("edit") === "1", "studio · Edit details opens the sheet at ?edit=1 on the studio's own home");
    check(new URL(p3.url()).pathname === `/business/${studio.id}`, "studio · …over THIS studio, not the first one the account owns");
    await sEdit.getByRole("button", { name: "Cancel" }).click();
    await sEdit.waitFor({ state: "detached", timeout: 15_000 });
    check(!new URL(p3.url()).searchParams.has("edit"), "studio · and Cancel spends the entry rather than leaving ?edit=1 live under it");
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

    /* ⚠ THE LAST TWO "ADD SOMETHING" FORMS (22 Sep 2026, the user: "form for
       adding asset and adding room should be same way"). These two are the
       reason the ask exists: ADD ASSET was a card standing on the desk whether
       or not you were adding anything, and ADD ROOM was no form at all — the ＋
       created "Room N" holding twenty people on the press.
       ⚠ Both are SHEET-ONLY, so unlike the other five there is no page to assert
       at the other end: neither ever had an address, and Rule 14 protects the
       ones that were handed out rather than inventing new ones. */
    for (const [tool, label, dialog, blocker] of [
      ["assets", "Add asset", "Add asset", "Name the asset first"],
      ["rooms", "Add room", "Add room", null],
    ]) {
      await p3.goto(`${BASE}/business/${studio.id}/${tool}`, { waitUntil: "networkidle" });
      const before = await p3.locator("h1").first().innerText().catch(() => "");
      await p3.getByRole("link", { name: label }).click();
      const sheet = p3.getByRole("dialog", { name: dialog });
      await sheet.waitFor({ timeout: 15_000 }).catch(() => {});
      check(await sheet.isVisible().catch(() => false), `studio · ${label} opens a sheet over the ${tool} desk`);
      check(new URL(p3.url()).search === "?new=1", `studio · the ${tool} sheet is the URL (${new URL(p3.url()).search})`);
      check((await p3.locator("h1").first().innerText().catch(() => "")) === before, `studio · the ${tool} desk is still underneath it`);
      /* ⚠ THE BAR NAMES THE MISSING ANSWER rather than greying out (15573-15578),
         and it is the button's ACCESSIBLE NAME that says so, not just its text:
         a fixed `aria-label` here would tell a screen reader "Add asset" while
         the screen says "Name the asset first". `ClassForm`, the page all of
         these are matched to, has never had one — I put one on all five on
         22 Sep and the suite caught it within the hour. */
      if (blocker) {
        check(await sheet.getByRole("button", { name: blocker }).isVisible().catch(() => false), `studio · and the ${tool} bar names what is missing ("${blocker}")`);
      } else {
        check(await sheet.getByRole("button", { name: label }).isVisible().catch(() => false), `studio · and the ${tool} bar is ready, because its defaults are prefilled`);
      }
      await p3.goBack();
      await p3.waitForTimeout(600);
      check(!(await sheet.isVisible().catch(() => false)), `studio · back closes the ${tool} sheet and leaves the desk`);
    }
    /* ⚠ AND THE CARD THAT USED TO STAND ON THE ASSETS DESK IS GONE — a check
       that only looks at the new place cannot tell you the old one was cleared,
       which this file has been wrong about twice */
    await p3.goto(`${BASE}/business/${studio.id}/assets`, { waitUntil: "networkidle" });
    check((await p3.getByLabel("Asset name").count()) === 0, "studio · and the ADD ASSET card has LEFT the desk");

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

    /* ⚠ AND A STUDIO'S OWN GRID IS ARRANGED BY THE STUDIO (22 Sep 2026) — the
       key carries the business id, so an organization's two studios are two
       arrangements and two people on one team each get their own. This is the
       case that a `tools:studio` key alone would have got wrong. */
    await arrangeGrid(p3, "studio", `${BASE}/business/${studio.id}`);
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
