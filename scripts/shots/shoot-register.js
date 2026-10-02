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

/* ⚠ EVERY "Attendance" LOCATOR IN THIS FILE IS `exact` (28 Sep 2026), and the
   reason is worth keeping: a bare string in `getByRole({ name })` is a
   case-insensitive SUBSTRING match — this repo's own lesson, met for the fourth
   time. The class page gained the artist's powers switch the same day, whose
   accessible name is "{their name} holds Attendance", so the TAB and the SWITCH
   both matched and Playwright refused with a strict-mode violation. The product
   is right — an owner has both — and the check was the thing that was loose. */

/** the app's one dropdown, an in-app sheet since 27 Sep — the e2e's own helper */
const pick = async (page, label, option) => {
  await page.getByRole("button", { name: label, exact: true }).first().click();
  const row = page.getByRole("option", { name: option, exact: true });
  await row.or(page.getByRole("button", { name: option, exact: true })).first().click();
};

/** a date in IST, `n` days from now, in the shape the date input wants */
const istDay = (n) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + n * 86400000));

/** what a number field actually holds right now */
const valueOf = (page, label) => page.getByLabel(label).inputValue();

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
    await page.getByRole("button", { name: "Attendance", exact: true }).click();
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

    /* ⚠⚠ SOMEBODY WITH AN ACCOUNT AND NO BOOKING — THE DOOR (29 Sep 2026).
       This check used to assert the OPPOSITE ("Not booked for this class …"),
       which was the honest answer while classes had no walk-in of any kind. It
       is re-cut rather than deleted, because what changed is a DECISION and the
       old wording is exactly what would tell us the door had stopped working. */
    await scanLink(page, stranger.id);
    await sheet.getByTestId("scan-confirm").waitFor({ timeout: 20000 });
    await sheet.getByRole("button", { name: `Check in ${stranger.name}` }).click();
    await sheet.getByText("booked in at the door", { exact: false }).waitFor({ timeout: 20000 });
    check(true, "⚠ somebody with no booking is BOOKED IN at the door — the sentence that used to end the errand");
    check(
      !(await sheet.textContent()).includes("Not booked for this class"),
      "and the old dead end is gone from the sheet"
    );
    check(
      (await sheet.getByTestId("scan-confirm").count()) === 0,
      "and the camera comes back for the next person — one press, not two"
    );

    await sheet.getByRole("button", { name: "Cancel" }).click();
    await sheet.waitFor({ state: "detached", timeout: 20000 });

    /* ── 3. THE REGISTER ITSELF, READ BACK ──────────────────────────────────── */
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Attendance", exact: true }).click();
    const outRow = page.getByRole("button", { name: `Check ${learner.name} out` });
    await outRow.waitFor({ timeout: 20000 });
    check(true, "⚠ the register row reads ✓ In afterwards — the scan wrote a real attendance row");

    /* the database's own answer, not the screen's */
    const att = await rows(owner.h, `attendance?class_id=eq.${cls.id}&user_id=eq.${learner.id}&deleted_at=is.null&select=id`);
    check(att.length === 1, `and the database holds exactly one live attendance row (found ${att.length})`);
    /* ⚠ THE DOOR, READ OUT OF THE DATABASE RATHER THAN OFF THE SCREEN. The
       message said it happened; these two say WHAT happened. */
    const walkBk = await rows(
      owner.h,
      `class_bookings?class_id=eq.${cls.id}&user_id=eq.${stranger.id}&deleted_at=is.null&select=id,status,user_id,created_by`
    );
    check(walkBk.length === 1, `the walk-in holds exactly one seat (found ${walkBk.length})`);
    check(walkBk[0] && walkBk[0].status === "enrolled", "and it is ENROLLED — a door never waitlists somebody standing in front of it");
    check(
      walkBk[0] && walkBk[0].created_by === owner.id && walkBk[0].user_id !== owner.id,
      "⚠ and the row records WHO OPENED THE DOOR, not the person who walked in — that is what makes it a walk-in without a column saying so"
    );
    const strangerAtt = await rows(owner.h, `attendance?class_id=eq.${cls.id}&user_id=eq.${stranger.id}&deleted_at=is.null&select=id`);
    check(strangerAtt.length === 1, `and they are on the register in the same press (found ${strangerAtt.length})`);

    /* ── 3b. THE WALK-IN WITH NO ACCOUNT AT ALL (29 Sep 2026, shape 2) ───────
       The scanner can do nothing for somebody off the street — there is no code
       to scan — so the register asks for a name. */
    const walkName = `Walk In ${stamp}`;
    const nameField = page.getByTestId("walk-in-name");
    await nameField.waitFor({ timeout: 20000 });
    check(
      (await page.getByTestId("walk-in-add").getAttribute("aria-label")) === "Type a name first",
      "⚠ the Add button NAMES the missing answer while the field is empty — this app's own form grammar"
    );
    await nameField.fill(walkName);
    await page.getByTestId("walk-in-add").click();
    await page.getByText(`${walkName} is in`, { exact: false }).waitFor({ timeout: 20000 });
    check(true, "⚠⚠ somebody with NO DanceOS account is recorded at the door by name");

    /* the database's own answer, not the screen's */
    const wRow = await rows(
      owner.h,
      `class_bookings?class_id=eq.${cls.id}&attendee_name=eq.${encodeURIComponent(walkName)}&deleted_at=is.null&select=id,status,user_id,attendee_name,created_by`
    );
    check(wRow.length === 1, `the walk-in holds exactly one seat (found ${wRow.length})`);
    check(wRow[0] && wRow[0].user_id === null, "⚠ and it names NO PERSON — the column is nullable now");
    check(wRow[0] && wRow[0].attendee_name === walkName, "the name is on the booking, which is the one place it lives");
    check(wRow[0] && wRow[0].created_by === owner.id, "and the row records who opened the door");
    const wAtt = await rows(owner.h, `attendance?class_booking_id=eq.${wRow[0].id}&deleted_at=is.null&select=id,user_id`);
    check(wAtt.length === 1, "they are checked in in the same press");
    check(wAtt[0] && wAtt[0].user_id === null, "⚠ and the attendance row names nobody either");

    /* the register draws them, and NOT as a door to /person/null */
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Attendance", exact: true }).click();
    await page.getByText(walkName, { exact: false }).first().waitFor({ timeout: 20000 });
    check(
      (await page.locator('a[href="/person/null"]').count()) === 0,
      "⚠⚠ and the row is NOT a link to /person/null — a template literal swallows a null and nothing typed can see it"
    );

    /* ⚠ AND IT CAN BE TAKEN BACK OFF, which a real learner's seat cannot be:
       they cancel their own, and a walk-in has no account to do it. */
    await page.getByRole("button", { name: `Remove ${walkName} from the register` }).click();
    await page.getByText("removed", { exact: false }).first().waitFor({ timeout: 20000 });
    const wGone = await rows(
      owner.h,
      `class_bookings?id=eq.${wRow[0].id}&deleted_at=is.null&select=id`
    );
    check(wGone.length === 0, "the walk-in's seat is released");
    const wAttGone = await rows(owner.h, `attendance?class_booking_id=eq.${wRow[0].id}&deleted_at=is.null&select=id`);
    check(wAttGone.length === 0, "⚠ and the attendance row goes with it — the register stops counting somebody who was never here");

    /* ── 3c. PAID AT THE DOOR (2 Oct 2026, `set_door_paid`, 20261002140000) ──
       The user: "option to complete due in attendance sheet for walk in students
       with button next to check in called paid. for booked students it cant
       change." The class above is FREE, so nothing is due there; this one costs
       ₹300. A walk-in is marked paid and unmarked through the real button, read
       back out of the database each time; and a seat the learner booked
       THEMSELVES gets no button, and the database refuses it too. */
    const paidCls = await rpc(owner.h, "create_class_with_session", {
      p_business_id: studio.id,
      p_title: "Hip-Hop · All levels",
      p_venue_business_id: null,
      p_room_id: null,
      p_lat: null,
      p_lng: null,
      p_maps_url: null,
      p_style: "Hip-Hop",
      p_level: "all",
      p_room: "Studio B",
      p_price_inr: 300,
      p_capacity: 12,
      p_status: "draft",
      p_starts_at: at(60 * 24 * 31),
      p_ends_at: at(60 * 24 * 31 + 60),
    });
    await rpc(owner.h, "ask_class_person", { p_class_id: paidCls.id, p_user_id: owner.id, p_kind: "artist", p_pay_per_session_inr: 0 });
    await patch(owner.h, `classes?id=eq.${paidCls.id}`, { status: "published" });
    const paidSession = (await rows(owner.h, `class_sessions?class_id=eq.${paidCls.id}&select=id&deleted_at=is.null`))[0];
    await patch(H_SERVICE, `class_sessions?id=eq.${paidSession.id}`, { starts_at: at(-10), ends_at: at(50) });
    /* a seat the learner booked THEMSELVES — planted the way the payment rail
       leaves one (a priced class is booked through Cashfree, which a script
       cannot drive), so `created_by` is the learner */
    await call("POST", "/rest/v1/class_bookings", H_SERVICE, {
      session_id: paidSession.id,
      class_id: paidCls.id,
      business_id: studio.id,
      user_id: learner.id,
      status: "enrolled",
      created_by: learner.id,
      updated_by: learner.id,
    }, "plant a self-booked seat");
    const paidSlug = (await rows(owner.h, `classes?id=eq.${paidCls.id}&select=share_slug`))[0].share_slug;

    await page.goto(`${BASE}/c/${paidSlug}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Attendance", exact: true }).click();
    const payName = `Cash Walk ${stamp}`;
    await page.getByTestId("walk-in-name").waitFor({ timeout: 20000 });
    await page.getByTestId("walk-in-name").fill(payName);
    await page.getByTestId("walk-in-add").click();
    await page.getByText(`${payName} is in`, { exact: false }).waitFor({ timeout: 20000 });

    const markPaid = page.getByRole("button", { name: `Mark ${payName} paid`, exact: true });
    await markPaid.waitFor({ timeout: 20000 });
    check(true, "⚠ a walk-in on a priced class has a Paid button beside its row");
    check(
      (await page.getByText("₹300 due at the door", { exact: false }).count()) >= 1,
      "and the row says what is owed at the door before it is pressed"
    );
    check(
      (await page.getByRole("button", { name: `Mark ${learner.name} paid`, exact: true }).count()) === 0,
      "⚠ a seat the learner booked THEMSELVES has no Paid button — that money is the rail's, not the door's"
    );

    await markPaid.click();
    await page.getByRole("button", { name: `Mark ${payName} not paid`, exact: true }).waitFor({ timeout: 20000 });
    const payRow = await rows(
      owner.h,
      `class_bookings?class_id=eq.${paidCls.id}&attendee_name=eq.${encodeURIComponent(payName)}&deleted_at=is.null&select=id,door_paid_at,door_paid_by`
    );
    check(payRow.length === 1 && payRow[0].door_paid_at !== null, "⚠⚠ pressing Paid records it in the database — door_paid_at is set");
    check(payRow[0] && payRow[0].door_paid_by === owner.id, "and it records WHO marked it paid");
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Attendance", exact: true }).click();
    await page.getByRole("button", { name: `Mark ${payName} not paid`, exact: true }).waitFor({ timeout: 20000 });
    check(
      (await page.getByText("paid at the door · ₹300", { exact: false }).count()) >= 1,
      "and after a reload the row reads \"paid at the door · ₹300\" — it was saved, not just drawn"
    );

    /* a mis-press can be taken back */
    await page.getByRole("button", { name: `Mark ${payName} not paid`, exact: true }).click();
    await page.getByRole("button", { name: `Mark ${payName} paid`, exact: true }).waitFor({ timeout: 20000 });
    const unpaid = await rows(owner.h, `class_bookings?id=eq.${payRow[0].id}&select=door_paid_at,door_paid_by`);
    check(unpaid[0] && unpaid[0].door_paid_at === null && unpaid[0].door_paid_by === null, "⚠ and pressing it again takes it back, in the database too");

    /* the database's own refusal for the self-booked seat — the screen not
       drawing a button is presentation; this is the rule */
    const selfSeat = (await rows(owner.h, `class_bookings?class_id=eq.${paidCls.id}&user_id=eq.${learner.id}&deleted_at=is.null&select=id`))[0];
    let refusal = "ACCEPTED";
    try {
      await rpc(owner.h, "set_door_paid", { p_class_booking_id: selfSeat.id, p_paid: true });
    } catch (e) {
      refusal = e.message;
    }
    check(/booked this seat themselves/.test(refusal), `⚠ and the database refuses the self-booked seat in words (${refusal.slice(0, 90)})`);

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

    /* ── 5. THE CLASS FORM: NO BACKDATING, THE NUMBER FIELDS, AND THE WORD ──
       28 Sep 2026, the user: "should not be able to create a class in backdate …
       save & ask button in add class form to be changed to send request … fix
       both what a session pays them and price fields while typing 0 becomes
       stagnant." All three are drivable here, on the real form. */
    await page.goto(`${BASE}/business/${studio.id}/classes/new`, { waitUntil: "networkidle" });

    /* the picker's own floor — today in IST, so yesterday cannot be chosen at all */
    check((await page.getByLabel("Class date").getAttribute("min")) === istDay(0), `the date picker's floor is today in IST (${istDay(0)})`);

    /* ⚠ AND THE RULE IS THE START INSTANT, not the date: a date alone cannot say
       that 19:00 today has already gone. A past date is refused BY NAME — the
       button wears the missing answer, which is this form's own grammar. */
    await page.getByLabel("Class date").fill(istDay(-3));
    await page.getByLabel("Dance style", { exact: true }).click();
    await page.getByRole("button", { name: "Hip-Hop", exact: true }).click();
    const backdatedBtn = page.getByRole("button", { name: /already gone/ });
    await backdatedBtn.waitFor({ timeout: 20000 });
    check(true, "⚠ a class dated three days ago cannot go on — the button names the refusal");

    await page.getByLabel("Class date").fill(istDay(4));
    await page.getByRole("button", { name: "Continue", exact: true }).waitFor({ timeout: 20000 });
    check(true, "…and a date ahead lets it through");
    await page.getByRole("button", { name: "Continue", exact: true }).click();

    /* ⚠⚠ THE NUMBER FIELDS (the "stagnant 0"). Holding these as numbers made the
       field impossible to empty — `Number("")` is 0, so React put the 0 straight
       back and the only way to type over it was to leave it in front. The test is
       the one a person actually does: clear it, then type. */
    const price = page.getByLabel("Price per session");
    await price.fill("");
    check((await valueOf(page, "Price per session")) === "", "⚠ the price field can be CLEARED — the 0 no longer snaps back");
    await price.fill("300");
    check((await valueOf(page, "Price per session")) === "300", `the price reads exactly 300, not 0300 (read "${await valueOf(page, "Price per session")}")`);
    await price.blur();
    check((await valueOf(page, "Price per session")) === "300", "and it still says 300 after leaving the field");
    await price.fill("");
    await price.blur();
    check((await valueOf(page, "Price per session")) === "0", "⚠ a field left empty settles at its floor on blur — it never means one thing and says another");
    await price.fill("0");

    /* ⚠ THE PAY FIELD ONLY EXISTS ONCE THERE IS SOMEBODY TO PAY — it is drawn
       inside the teacher block, so the person is picked first. Found by running
       this: the field simply was not on the page yet. */
    await page.getByLabel("Search DanceOS for who takes this class").fill(stranger.name);
    await page.getByRole("button", { name: `${stranger.name} takes this class` }).click();

    const pay = page.getByLabel("What a session pays the artist");
    await pay.waitFor({ timeout: 20000 });
    await pay.fill("");
    check((await valueOf(page, "What a session pays the artist")) === "", "⚠ the session-pay field can be CLEARED too");
    await pay.fill("900");
    check((await valueOf(page, "What a session pays the artist")) === "900", `the pay reads exactly 900 (read "${await valueOf(page, "What a session pays the artist")}")`);
    await pay.fill("0");
    await pay.blur();

    /* ⚠ THE WORD: "Send request", not "Save & ask" — what the person pressing it
       is DOING is asking somebody; the draft is the mechanism, not the act. */
    const sendBtn = page.getByRole("button", { name: "Send request", exact: true });
    await sendBtn.waitFor({ timeout: 20000 });
    check(true, "the form's own button reads Send request");
    check((await page.getByRole("button", { name: /Save & ask/ }).count()) === 0, "…and nothing anywhere still says Save & ask");
    await sendBtn.click();
    const confirmSheet = page.getByRole("dialog", { name: "Send this request?" });
    await confirmSheet.waitFor({ timeout: 20000 });
    check(true, "the confirm sheet asks the same question the button asked");
    await confirmSheet.getByRole("button", { name: "Send request", exact: true }).click();
    await page.waitForURL(/\/classes$/, { timeout: 30000 });
    check(true, "the request is sent and the register is underneath it");

    /* ── 6. AS SOON AS THE TEACHER CONFIRMS, THEY HOLD THE REGISTER ──────────
       28 Sep 2026, the user: "as soon as the teacher confirms the class they
       should get access to attendance." This is the half the app cannot do:
       `check_in` asks `can_run_register_for_class`, which reads the claim's
       `can_attendance` — false by default until the migration applied today. */
    const asked = (await rows(owner.h, `class_people?business_id=eq.${studio.id}&user_id=eq.${stranger.id}&kind=eq.artist&deleted_at=is.null&select=id,class_id,can_attendance,status`))[0];
    check(Boolean(asked), "the studio's request reached the person by name");
    check(asked.can_attendance === true, "⚠⚠ the claim is BORN holding attendance — the rule is on the row, so every door that makes one gets it");
    await rpc(stranger.h, "respond_to_class_ask", { p_class_person_id: asked.id, p_accept: true });
    await patch(owner.h, `classes?id=eq.${asked.class_id}`, { status: "published" });
    const slug2 = (await rows(owner.h, `classes?id=eq.${asked.class_id}&select=share_slug`))[0].share_slug;

    /* the database's own answer first, then the screen's */
    const mayRun = await rpc(stranger.h, "can_run_register_for_class", { p_class_id: asked.class_id });
    check(mayRun === true, "⚠ the DATABASE says the person taking the class may run its register");

    const sCtx = await browser.newContext({ viewport: { width: 430, height: 932 } });
    const sPage = await sCtx.newPage();
    sPage.on("pageerror", (e) => errs.push(`PAGEERROR ${e.message}`));
    await sPage.goto(`${BASE}/login/email`, { waitUntil: "networkidle" });
    await sPage.locator('input[name="email"]').fill(stranger.email);
    await sPage.locator('input[name="password"]').fill(PASSWORD);
    await sPage.getByRole("button", { name: "Sign in" }).click();
    await sPage.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });
    await sPage.goto(`${BASE}/c/${slug2}`, { waitUntil: "networkidle" });
    const attTab = sPage.getByRole("button", { name: "Attendance", exact: true });
    await attTab.waitFor({ timeout: 20000 });
    check(true, "⚠⚠ and the TEACHER sees the Attendance tab on the class they confirmed — which is the whole of the ask");
    await attTab.click();
    await sPage.getByText("LIVE REGISTER", { exact: false }).waitFor({ timeout: 20000 });
    check(true, "…and the register itself opens for them, not a refusal");

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
