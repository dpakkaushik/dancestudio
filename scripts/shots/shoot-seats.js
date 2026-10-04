/**
 * WHO MAY ACT AS A BUSINESS (28 Sep 2026).
 *
 * The user: *"only these 2 get the right to get studio or organization in the
 * profile switcher. that profile switcher and rights should never be given for
 * faculty, visiting faculty, assistant, event team or other team members"*.
 *
 * ⚠⚠ THE SWITCHER WAS EVERY BUSINESS THE ACCOUNT HELD ANY SEAT ON. So a visiting
 * teacher who accepted ONE class — which is how `visiting_faculty` is created,
 * automatically, by `respond_to_class_ask` (R19) — could switch INTO the studio
 * and land on its home, with its Team desk, its Students desk (every student's
 * name and PHONE NUMBER), its Rooms editor, its invoice ledger and its refunds
 * one tap away. Nothing in the app said that was a thing; nothing failed either.
 *
 * ⚠ A GATE CLOSED ONLY IN THE MENU THAT OPENS IT IS NOT CLOSED, which is why
 * this script drives the ADDRESSES rather than the switcher: every desk is
 * visited by URL as the faculty seat, and every one of them has to bounce.
 * Typecheck, lint and the build are all green on a page that lets the wrong
 * person in, so a browser is the only thing that can answer this.
 *
 * ⚠ AND IT ASSERTS WHAT THEY KEEP, because that is half the decision: the hub
 * still lists the studio under STUDIOS YOU HAVE TAUGHT AT with a door to its
 * PUBLIC page, and `/my-classes` still opens. What faculty lose is the business,
 * not their own work.
 *
 * The seat is made through the app's own door — `invite_person_to_business`
 * then `accept_business_invite` — so it is a real, consented seat, and the join
 * screen's own sentence is read on the way past (it promised "students ✓" until
 * this morning, to the one person deciding whether to say yes).
 *
 *   npm run build && npx next start -p 3100
 *   NODE_PATH=$(pwd)/node_modules DANCEOS_BASE_URL=http://localhost:3100 \
 *     node scripts/shots/shoot-seats.js
 */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..", "..");
const BASE = process.env.DANCEOS_BASE_URL || "http://localhost:3000";

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z_]+)=(.*)$/.exec(line);
  if (m) env[m[1]] = m[2].trim();
}
const SUPABASE = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = "Shoot-passw0rd!";

const H_SERVICE = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation" };
const asUser = (t) => ({ apikey: ANON, Authorization: `Bearer ${t}`, "Content-Type": "application/json", Prefer: "return=representation" });

const call = async (method, url, headers, body, what) => {
  const res = await fetch(url.startsWith("http") ? url : `${SUPABASE}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${what}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
};
const rpc = (h, fn, args) => call("POST", `/rest/v1/rpc/${fn}`, h, args, `rpc ${fn}`);
const rows = (h, q) => call("GET", `/rest/v1/${q}`, h, undefined, `get ${q}`);

let pass = 0;
let fail = 0;
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (ok) pass += 1;
  else fail += 1;
};

const account = async (email, fullName, city) => {
  const created = await call("POST", `${SUPABASE}/auth/v1/admin/users`, H_SERVICE, { email, password: PASSWORD, email_confirm: true }, `create ${email}`);
  const token = await call("POST", `${SUPABASE}/auth/v1/token?grant_type=password`, { apikey: ANON, "Content-Type": "application/json" }, { email, password: PASSWORD }, `sign in ${email}`);
  const h = asUser(token.access_token);
  await call("POST", "/rest/v1/profiles", h, { id: created.id, full_name: fullName, role: "user", city, styles: ["Hip-Hop"] }, `profile ${email}`);
  return { id: created.id, email, name: fullName, h };
};

const signIn = async (ctx, email) => {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login/email`, { waitUntil: "networkidle" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });
  return page;
};

/** open the switcher on the DanceOS mark and read the rows it offers */
const switcherRows = async (page) => {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Switch profile" }).click();
  await page.waitForTimeout(250);
  return page.evaluate(() => [...document.querySelectorAll('[role="dialog"] a, [role="menu"] a, a[href^="/business/"]')].map((a) => a.textContent.replace(/\s+/g, " ").trim()).filter(Boolean));
};

/** ⚠ THE DESKS A SEAT THAT RUNS THE BUSINESS REACHES — the register, the rooms,
 *  the people, and the ledgers it may READ. Invoices, Payments and
 *  Refunds are on this list because they were readable by ANY member until
 *  28 Sep 2026: a manager reading them is a narrowing that stops short of the
 *  owner, not a widening, and every CONTROL on them is still `role === "owner"`.
 *  ⚠ `/events` left this list on 29 Sep 2026 with events themselves, so the
 *  seventeen addresses this script drove are sixteen. The gate is unchanged —
 *  `runsTheBusiness` is still asked at every one of them. */
const RUN_DESKS = ["", "/classes", "/calendar", "/rooms", "/staff", "/students", "/invoices", "/payments", "/refunds", "/media", "/inbox"];

/** ⚠ …and the ones that stay the OWNER's, which a manager is bounced off — back
 *  to the business's own home rather than out to the hub, because they DO run the
 *  place. Earnings is the prototype's own rule (payout approval is ungrantable,
 *  §10.9); the other four are the money, the plan and the badge. */
const OWNER_DESKS = ["/earnings", "/memberships", "/assets", "/subscription", "/verification"];

/** every desk, for the seat that should reach none of them */
const DESKS = [...RUN_DESKS, ...OWNER_DESKS];

(async () => {
  const stamp = Date.now().toString(36);
  const made = { users: [], businesses: [] };
  const browser = await chromium.launch();
  const errs = [];

  try {
    /* ── THE WORLD ──────────────────────────────────────────────────────────── */
    const owner = await account(`shot.seat.owner.${stamp}@example.com`, `Seat Owner ${stamp}`, "Pune");
    const faculty = await account(`shot.seat.faculty.${stamp}@example.com`, `Seat Faculty ${stamp}`, "Pune");
    made.users.push(owner.id, faculty.id);

    const studio = await rpc(owner.h, "create_business_with_owner", {
      p_type: "studio",
      p_name: `Seat Studio ${stamp}`,
      p_area: "Kothrud",
      p_city: "Pune",
      p_styles: ["Hip-Hop"],
    });
    made.businesses.push(studio.id);

    /* ⚠ A REAL SEAT THROUGH THE REAL DOOR — asked by the owner, accepted by the
       person. Anything less and this would be proving a row rather than a seat. */
    const invite = await rpc(owner.h, "invite_person_to_business", {
      p_business_id: studio.id,
      p_user_id: faculty.id,
      p_role: "trainer",
    });

    /* ── THE JOIN SCREEN'S OWN PROMISE, read before it is accepted ─────────── */
    const fCtx = await browser.newContext({ viewport: { width: 430, height: 932 } });
    fCtx.on("weberror", (e) => errs.push(`PAGEERROR ${e.error().message}`));
    const fPage = await signIn(fCtx, faculty.email);
    fPage.on("pageerror", (e) => errs.push(`PAGEERROR ${e.message}`));

    await fPage.goto(`${BASE}/join/${invite.code}`, { waitUntil: "networkidle" });
    const promise = (await fPage.locator("body").innerText()).replace(/\s+/g, " ");
    check(/You would have/.test(promise), "the join screen tells the person what the seat carries before they say yes");
    check(
      !/students ✓/.test(promise),
      `⚠⚠ …and it no longer promises Faculty "students ✓" — a door this push shut${/students ✓/.test(promise) ? " (STILL PROMISED)" : ""}`
    );
    check(/the register on them/.test(promise), `…it promises the classes they accept and the register on them — "${(/You would have ([^.]+)\./.exec(promise) || [, "?"])[1]}"`);

    await rpc(faculty.h, "accept_business_invite", { p_code: invite.code });
    /* ⚠ `business_members` carries no status — a seat IS the consent; the ASK
       lives on `business_invites` and is spent by accepting it */
    const seat = (await rows(owner.h, `business_members?business_id=eq.${studio.id}&user_id=eq.${faculty.id}&deleted_at=is.null&select=member_role`))[0];
    check(seat && seat.member_role === "trainer", `the seat is real, made by the person accepting — ${seat ? seat.member_role : "MISSING"}`);

    /* ── 1. THE SWITCHER DOES NOT OFFER THE STUDIO ─────────────────────────── */
    const fRows = await switcherRows(fPage);
    check(!fRows.some((r) => r.includes("Seat Studio")), `the faculty seat's switcher does NOT offer the studio — [${fRows.join(" / ") || "own row only"}]`);

    /* ── 2. AND NEITHER DOES TYPING THE ADDRESS ────────────────────────────── */
    let bounced = 0;
    const stayed = [];
    for (const d of DESKS) {
      await fPage.goto(`${BASE}/business/${studio.id}${d}`, { waitUntil: "networkidle" });
      const landed = new URL(fPage.url()).pathname;
      if (landed.startsWith(`/business/${studio.id}`)) stayed.push(d || "/(home)");
      else bounced += 1;
    }
    check(stayed.length === 0, `⚠⚠ every one of the ${DESKS.length} desks bounces the faculty seat (${bounced} bounced${stayed.length ? `, STAYED ON: ${stayed.join(", ")}` : ""})`);

    /* ── 3. WHAT THEY KEEP, which is not nothing ───────────────────────────── */
    /* ⚠ `?show=learned` — THE HUB IS TWO COLUMNS NOW (29 Sep 2026, the user:
       "same should be for studios with 2 colums — your own studios and the
       second column with where your learned"). Taught-at rides in the second
       one, and `SegmentedPanels` mounts only the shown panel, so the list is not
       in the DOM at all until the column is asked for — the same trap that made
       shoot-practice stale for a day when Practice became a column. */
    /* ⚠ and the THIRD column since 3 Oct 2026 — Manage · Team · Student */
    await fPage.goto(`${BASE}/business?show=team`, { waitUntil: "networkidle" });
    const hub = (await fPage.locator("body").innerText()).replace(/\s+/g, " ");
    check(/STUDIOS YOU HAVE TAUGHT AT/.test(hub) && hub.includes("Seat Studio"), "the hub still lists the studio under STUDIOS YOU HAVE TAUGHT AT");
    const taughtHref = await fPage.getByRole("link", { name: new RegExp(`Seat Studio ${stamp} — open the profile`) }).getAttribute("href");
    check(taughtHref === `/studio/${studio.id}`, `…and its door is the studio's PUBLIC page, not its manage home — ${taughtHref}`);

    await fPage.goto(`${BASE}/my-classes`, { waitUntil: "networkidle" });
    check(new URL(fPage.url()).pathname === "/my-classes", "…and their own classes still open — the seat lost the business, not their work");

    /* ── 4. THE OWNER IS UNTOUCHED ─────────────────────────────────────────── */
    const oCtx = await browser.newContext({ viewport: { width: 430, height: 932 } });
    const oPage = await signIn(oCtx, owner.email);
    oPage.on("pageerror", (e) => errs.push(`PAGEERROR ${e.message}`));

    const oRows = await switcherRows(oPage);
    check(oRows.some((r) => r.includes("Seat Studio")), `the OWNER's switcher still offers the studio — [${oRows.join(" / ")}]`);

    const opened = [];
    for (const d of DESKS) {
      await oPage.goto(`${BASE}/business/${studio.id}${d}`, { waitUntil: "networkidle" });
      if (!new URL(oPage.url()).pathname.startsWith(`/business/${studio.id}`)) opened.push(d || "/(home)");
    }
    check(opened.length === 0, `…and every one of the ${DESKS.length} desks still opens for them${opened.length ? ` (BOUNCED: ${opened.join(", ")})` : ""}`);

    /* ── 5. THE TEAM DESK STILL NAMES THEM ─────────────────────────────────── */
    await oPage.goto(`${BASE}/business/${studio.id}/staff`, { waitUntil: "networkidle" });
    const team = (await oPage.locator("body").innerText()).replace(/\s+/g, " ");
    check(team.includes(faculty.name), "the owner's Team desk still names the faculty seat — they are on the team, they just do not run it");
    check(/Faculty/.test(team), "…under its own label");

    /* ── 6. ⚠⚠ AND MANAGER, THE WORD `20260928110000` MADE POSSIBLE ─────────
       The same person, relabelled through the real desk — so every check below
       is the SAME human and the SAME studio, and the only thing that moved is
       one word on their seat. That is the strongest form this can take: it
       cannot be explained by anything else about the account. */
    /* ⚠ MANAGE IS A PILL ON THE MEMBER DETAIL PAGE since 4 Oct 2026 */
    await oPage.getByRole("link", { name: `Member Detail — ${faculty.name}` }).click();
    await oPage.waitForURL(/\/staff\/[0-9a-f-]+$/, { timeout: 20000 });
    const manage = oPage.getByRole("button", { name: `Manage ${faculty.name}` });
    await manage.waitFor({ timeout: 20000 });
    await manage.click();
    const sheet = oPage.getByRole("dialog", { name: faculty.name });
    const makeManager = sheet.getByRole("button", { name: `Make ${faculty.name} Manager` });
    check((await makeManager.count()) === 1, "the Team desk OFFERS Manager — the option the migration made possible");
    await makeManager.click();
    await oPage.getByRole("status").filter({ hasText: "Manager" }).waitFor({ timeout: 20000 });
    check(true, "…and the database accepts it (the CHECK refused this word an hour ago)");

    const mRows = await switcherRows(fPage);
    check(mRows.some((r) => r.includes("Seat Studio")), `⚠⚠ the manager's switcher NOW offers the studio — [${mRows.join(" / ")}]`);

    const shut = [];
    for (const d of RUN_DESKS) {
      await fPage.goto(`${BASE}/business/${studio.id}${d}`, { waitUntil: "networkidle" });
      if (!new URL(fPage.url()).pathname.startsWith(`/business/${studio.id}`)) shut.push(d || "/(home)");
    }
    check(shut.length === 0, `…and all ${RUN_DESKS.length} desks a manager runs are open to them${shut.length ? ` (SHUT: ${shut.join(", ")})` : ""}`);

    const leaked = [];
    for (const d of OWNER_DESKS) {
      await fPage.goto(`${BASE}/business/${studio.id}${d}`, { waitUntil: "networkidle" });
      if (new URL(fPage.url()).pathname !== `/business/${studio.id}`) leaked.push(`${d} → ${new URL(fPage.url()).pathname}`);
    }
    check(leaked.length === 0, `⚠ …and all ${OWNER_DESKS.length} that stay the OWNER's send them back to the home${leaked.length ? ` (LEAKED: ${leaked.join(", ")})` : ""}`);

    /* ⚠⚠ AND THE MONEY THEY MAY READ IS STILL MONEY THEY CANNOT MOVE — which is
       the assertion the happy path had to give up this afternoon. It used to
       prove the refusal with a TRAINER on this desk, and a trainer no longer
       reaches it, so the line became unreachable through the UI. A manager is
       the person it was always describing: somebody who runs the place and does
       not own it. ⚠ The switch is DRAWN and refuses rather than hidden, which is
       this app's own rule for a control whose refusal has words. */
    await fPage.goto(`${BASE}/business/${studio.id}/payments`, { waitUntil: "networkidle" });
    await fPage.getByText("ACCEPTED FROM STUDENTS").waitFor({ timeout: 20000 });
    await fPage.getByRole("switch", { name: "Bank transfer" }).click();
    await fPage.getByText("Only the owner changes what the business accepts").waitFor({ timeout: 20000 });
    check(true, "⚠ a manager reads the Payments desk and is refused its switches IN WORDS — the check the happy path lost when a trainer stopped reaching this desk");
    await fPage.goto(`${BASE}/business/${studio.id}/staff`, { waitUntil: "networkidle" });
    check((await fPage.getByRole("button", { name: /^Manage / }).count()) === 0, "…and the Team desk gives them no seat to hand out");

    check(errs.length === 0, `no page or console error anywhere${errs.length ? ` — ${errs.slice(0, 3).join(" · ")}` : ""}`);
  } finally {
    for (const id of made.businesses) {
      await fetch(`${SUPABASE}/rest/v1/businesses?id=eq.${id}`, { method: "DELETE", headers: H_SERVICE }).catch(() => {});
    }
    for (const id of made.users) {
      await fetch(`${SUPABASE}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: H_SERVICE }).catch(() => {});
    }
    await browser.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
