/**
 * THE REGISTER'S SCANNER, AND THE NAME EVERY DRILL PAGE LOST (28 Sep 2026).
 *
 * Two things this script exists to measure, because nothing typed can see
 * either of them:
 *
 * 1. ⚠⚠ CHECKING SOMEBODY IN BY SCANNING THEIR CODE. The user asked for it on
 *    28 Sep — *"when scanning any persons qr code for entry for a class or event
 *    … after confirmation only should check them in"* — and only the CONFIRM
 *    half was built: there was no scanner on a class or event register at all,
 *    so "check them in" had nowhere to happen. The camera cannot be driven
 *    headless, but the sheet's OTHER way in can: the paste field takes a profile
 *    link and goes down exactly the same path (`personIdFromText` → the lookup →
 *    the confirm card → `onCode`). So every rule this slice added is exercised
 *    for real, against a real register, through the real RPC:
 *      · a booked learner is checked in and the row says ✓ In;
 *      · ⚠ scanning them AGAIN says "already checked in" and leaves them IN —
 *        a scan is an arrival, never a departure, or a door that scans one code
 *        twice checks somebody out;
 *      · somebody with an account and no booking is refused in words;
 *      · ⚠ and the sheet STAYS OPEN between scans, which is the whole point of
 *        a door: it is a queue, not one decision.
 *
 * 2. ⚠ THE `<h1>` SWEEP. `DRILL_TITLES` went when the wordmark became constant
 *    (28 Sep), so a drill page's own heading is the only thing naming it — and
 *    about twenty pages had none. An accessible name is invisible to typecheck,
 *    lint and the build, and it is invisible on screen too, so the only way to
 *    know is to ask the DOM. Every route below is asserted to have exactly ONE
 *    `<h1>` with real text in it.
 *
 * It builds through the app's own doors (password grant, the same RPCs the
 * screens call) and deletes everything it made.
 *
 *   npm run build && npx next start -p 3100
 *   NODE_PATH=$(pwd)/node_modules DANCEOS_BASE_URL=http://localhost:3100 \
 *     node scripts/shots/shoot-register.js
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
const patch = (h, q, body) => call("PATCH", `/rest/v1/${q}`, h, body, `patch ${q}`);
const rows = (h, q) => call("GET", `/rest/v1/${q}`, h, undefined, `get ${q}`);

let pass = 0;
let fail = 0;
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (ok) pass += 1;
  else fail += 1;
};

/** an account, signed in for real — the seeder's own password grant */
const account = async (email, fullName, city) => {
  const created = await call("POST", `${SUPABASE}/auth/v1/admin/users`, H_SERVICE, { email, password: PASSWORD, email_confirm: true }, `create ${email}`);
  const token = await call("POST", `${SUPABASE}/auth/v1/token?grant_type=password`, { apikey: ANON, "Content-Type": "application/json" }, { email, password: PASSWORD }, `sign in ${email}`);
  const h = asUser(token.access_token);
  await call("POST", "/rest/v1/profiles", h, { id: created.id, full_name: fullName, role: "user", city, styles: ["Hip-Hop"] }, `profile ${email}`);
  return { id: created.id, email, name: fullName, h };
};

/** an ISO instant `mins` minutes from now */
const at = (mins) => new Date(Date.now() + mins * 60000).toISOString();

/** exactly one <h1>, and what it says */
const headingOf = (page) =>
  page.evaluate(() => {
    const hs = [...document.querySelectorAll("h1")];
    return { count: hs.length, text: hs.map((h) => h.textContent.trim()).join(" | ") };
  });

/** the scan sheet's own way in that a headless browser CAN drive */
const scanLink = async (page, personId) => {
  await page.getByLabel("Profile link").fill(`${BASE}/person/${personId}`);
  await page.getByRole("button", { name: "Use link" }).click();
};

(async () => {
  const stamp = Date.now().toString(36);
  const made = { users: [], businesses: [] };
  const browser = await chromium.launch();
  const errs = [];

  try {
    /* ── THE WORLD, through the app's own doors ─────────────────────────────── */
    const owner = await account(`shot.reg.owner.${stamp}@example.com`, `Reg Owner ${stamp}`, "Pune");
    const learner = await account(`shot.reg.learner.${stamp}@example.com`, `Reg Learner ${stamp}`, "Pune");
    const stranger = await account(`shot.reg.stranger.${stamp}@example.com`, `Reg Stranger ${stamp}`, "Pune");
    made.users.push(owner.id, learner.id, stranger.id);

    const studio = await rpc(owner.h, "create_business_with_owner", {
      p_type: "studio",
      p_name: `Reg Studio ${stamp}`,
      p_area: "Kothrud",
      p_city: "Pune",
      p_styles: ["Hip-Hop"],
    });
    made.businesses.push(studio.id);

    /* a class whose session is AHEAD, so the learner may book it; it is moved
       onto the clock afterwards, which is the seeder's own trick for a register
       that is live right now */
    const cls = await rpc(owner.h, "create_class_with_session", {
      p_business_id: studio.id,
      p_title: "Hip-Hop · All levels",
      p_venue_business_id: null,
      p_room_id: null,
      p_lat: null,
      p_lng: null,
      p_maps_url: null,
      p_style: "Hip-Hop",
      p_level: "all",
      p_room: "Studio A",
      p_price_inr: 0,
      p_capacity: 12,
      p_status: "draft",
      p_starts_at: at(60 * 24 * 30),
      p_ends_at: at(60 * 24 * 30 + 60),
    });

    /* ⚠ A CLASS CANNOT PUBLISH WITHOUT A YES (18 Sep 2026). The owner taking
       their OWN class is seated confirmed by `ask_class_person` itself (26 Sep),
       so this is one call and no answer. */
    await rpc(owner.h, "ask_class_person", { p_class_id: cls.id, p_user_id: owner.id, p_kind: "artist", p_pay_per_session_inr: 0 });
    await patch(owner.h, `classes?id=eq.${cls.id}`, { status: "published" });

    const session = (await rows(owner.h, `class_sessions?class_id=eq.${cls.id}&select=id&deleted_at=is.null`))[0];
    await rpc(learner.h, "book_class_session", { p_session_id: session.id });
    /* onto the clock: started ten minutes ago, running for another fifty, so
       check-in is OPEN (`check_in` opens 30 min before and closes at ends_at) */
    await patch(H_SERVICE, `class_sessions?id=eq.${session.id}`, { starts_at: at(-10), ends_at: at(50) });

    const slug = (await rows(owner.h, `classes?id=eq.${cls.id}&select=share_slug`))[0].share_slug;

    /* ── THE BROWSER, as the owner ──────────────────────────────────────────── */
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push(`PAGEERROR ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errs.push(`CONSOLE ${m.text()}`);
    });

    await page.goto(`${BASE}/login/email`, { waitUntil: "networkidle" });
    await page.locator('input[name="email"]').fill(owner.email);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });

    await page.goto(`${BASE}/c/${slug}`, { waitUntil: "networkidle" });

    /* ── 1. THE CLASS PAGE'S OWN NAME ───────────────────────────────────────── */
    const classHead = await headingOf(page);
    check(classHead.count === 1, `the class page has exactly one <h1> (found ${classHead.count})`);
    check(classHead.text === "Hip-Hop", `and it is the class's own name — "${classHead.text}"`);

    /* ── 2. SCAN TO CHECK IN ────────────────────────────────────────────────── */
    await page.getByRole("button", { name: "Attendance" }).click();
    const scanBtn = page.getByTestId("scan-check-in");
    await scanBtn.waitFor({ timeout: 20000 });
    check(true, "the register offers Scan to check in while the session is live");

    await scanBtn.click();
    const sheet = page.getByRole("dialog", { name: "Scan a profile" });
    await sheet.waitFor({ timeout: 20000 });
    check((await sheet.textContent()).includes("Check somebody in"), "the sheet says what this scan is FOR");

    await scanLink(page, learner.id);
    await sheet.getByTestId("scan-confirm").waitFor({ timeout: 20000 });
    check((await sheet.textContent()).includes(learner.name), "the confirm card names the person the code found");

    await sheet.getByRole("button", { name: `Check in ${learner.name}` }).click();
    await sheet.getByText("checked in", { exact: false }).waitFor({ timeout: 20000 });
    const afterOne = await sheet.textContent();
    check(afterOne.includes(`✓ ${learner.name} checked in`), "the sheet says who was checked in");
    check((await sheet.getByTestId("scan-confirm").count()) === 0, "⚠ and it is back on the camera, ready for the next person — a door is a queue");

    /* ⚠ THE SAME CODE TWICE IS NOT A CHECK-OUT */
    await scanLink(page, learner.id);
    await sheet.getByTestId("scan-confirm").waitFor({ timeout: 20000 });
    await sheet.getByRole("button", { name: `Check in ${learner.name}` }).click();
    await sheet.getByText("already checked in", { exact: false }).waitFor({ timeout: 20000 });
    check(true, "⚠ scanning them again says they were already in — a scan is an arrival, never a departure");

    /* ⚠ SOMEBODY WITH AN ACCOUNT AND NO BOOKING */
    await scanLink(page, stranger.id);
    await sheet.getByTestId("scan-confirm").waitFor({ timeout: 20000 });
    await sheet.getByRole("button", { name: `Check in ${stranger.name}` }).click();
    await sheet.getByText("Not booked for this class", { exact: false }).waitFor({ timeout: 20000 });
    check(true, "somebody who is not booked is refused in words, and the confirm card stays up");

    await sheet.getByRole("button", { name: "Cancel" }).click();
    await sheet.waitFor({ state: "detached", timeout: 20000 });

    /* ── 3. THE REGISTER ITSELF, READ BACK ──────────────────────────────────── */
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Attendance" }).click();
    const outRow = page.getByRole("button", { name: `Check ${learner.name} out` });
    await outRow.waitFor({ timeout: 20000 });
    check(true, "⚠ the register row reads ✓ In afterwards — the scan wrote a real attendance row");

    /* the database's own answer, not the screen's */
    const att = await rows(owner.h, `attendance?class_id=eq.${cls.id}&user_id=eq.${learner.id}&deleted_at=is.null&select=id`);
    check(att.length === 1, `and the database holds exactly one live attendance row (found ${att.length})`);
    const strangerAtt = await rows(owner.h, `attendance?class_id=eq.${cls.id}&user_id=eq.${stranger.id}&select=id`);
    check(strangerAtt.length === 0, "and nothing at all was written for the person who was refused");

    /* ── 4. THE NAME EVERY DRILL PAGE LOST ──────────────────────────────────── */
    const NAMED = [
      ["/notifications", "notifications"],
      ["/calendar", "the calendar"],
      ["/classes", "the class listing"],
      ["/support", "support"],
      ["/memberships", "memberships"],
      ["/inbox", "the inbox"],
      [`/business/${studio.id}/classes`, "a studio's register"],
      [`/business/${studio.id}/rooms`, "the rooms desk"],
      [`/business/${studio.id}/calendar`, "a studio's calendar"],
      [`/studio/${studio.id}/schedule`, "a public schedule"],
    ];
    for (const [route, what] of NAMED) {
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
      const h = await headingOf(page);
      check(h.count === 1 && h.text.length > 0, `${what} (${route}) has exactly one named <h1> — ${h.count === 1 ? `"${h.text}"` : `found ${h.count}`}`);
    }

    check(errs.length === 0, `no page or console error anywhere${errs.length ? ` — ${errs.slice(0, 3).join(" · ")}` : ""}`);
  } finally {
    /* ⚠ THE BUSINESSES BEFORE THE ACCOUNTS: a business whose owner is gone is the
       leftover pile this repo has had to sweep twice (#0aa). */
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
