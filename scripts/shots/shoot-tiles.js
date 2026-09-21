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
    await p2.close();

    // ── 3. an ORGANIZATION, verified, with no studio yet
    const org = await makeAccount(stamp, "org", "org");
    made.push(org.id);
    const p3 = await b.newPage({ viewport: { width: 420, height: 1000 } });
    p3.on("pageerror", (e) => { console.log("PAGEERROR(org) " + e.message); bad++; });
    await signIn(p3, org);
    await pressEveryTile(p3, "org", ["Events", "Studios", "Calendar", "Team", "Earnings", "Assets"]);

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
