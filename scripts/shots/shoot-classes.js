/**
 * THE CLASSES SLICE (30 Sep 2026) — the end-to-end audit's findings, driven.
 *
 * ⚠⚠ EVERY ONE OF THESE IS A CONTROL THAT IS DRAWN OR NOT DRAWN, or a row that
 * is in a list or not in it. typecheck, lint and `next build` are green either
 * way — they were green through all of it for weeks — so only a browser can
 * answer any of it. That is the 21 Sep tile audit's shape for the fourth time:
 * a door that would be refused, offered; and a door that would open, missing.
 *
 * What it proves, in order:
 *   1. A MANAGER may open the register (R55). 11 Oct 2026: and is offered Add
 *      Class, Edit and Withdraw, which the database admits a manager to now;
 *      a manager may not BOOK the studio's classes.
 *      Delete was the sharp one: the update is refused as zero rows with NO
 *      error, so the action reported success and deleted nothing.
 *   2. The COMPLETED tab fills off the CLOCK. Nothing in this app has ever
 *      written `status = 'completed'`, so that tab was permanently empty and
 *      every class that had run sat under Published for ever.
 *   3. A studio ANSWERS A ROOM REQUEST from its own classes desk. A venue ask
 *      is a class owned by the ARTIST's page, so it never appeared here at all.
 *   4. A teacher ask can be TAKEN BACK from the row that names it.
 *   5. A class whose session has passed is OFF the learner shelf, and a LIVE
 *      one says so instead of offering a Book button that always fails.
 *   6. ⚠⚠ A STUDIO'S OWNER IS NOT SHOWN A LEARNER'S BOOKING AS THEIR OWN —
 *      `findMyEnrolledSessionIds` filtered on neither `user_id` nor the
 *      business, and `class_bookings` lets a member read the whole roster.
 *   7. A person ASKED to take a class answers it in the Classes section.
 *  13. (11 Oct 2026, 20261017090000) The teacher steps down from the class page,
 *      the booking bar then reads "Waiting for a new teacher", a draft whose
 *      date passed is a closed card with Pick a new date + Delete, and a booked
 *      card's Add to calendar answers text/calendar.
 *
 *   npm run build && npx next start -p 3100
 *   NODE_PATH=$(pwd)/node_modules DANCEOS_BASE_URL=http://localhost:3100 \
 *     node scripts/shots/shoot-classes.js
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
const patch = (h, q, body, what) => call("PATCH", `/rest/v1/${q}`, h, body, what);

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
  /* return=minimal (6 Oct 2026): `profiles.phone` is not selectable by a signed-in
     role since 20261006092000, so RETURNING * is refused for a column reason */
  await call("POST", "/rest/v1/profiles", { ...h, Prefer: "return=minimal" }, { id: created.id, full_name: fullName, role: "user", city, styles: ["Hip-Hop"] }, `profile ${email}`);
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

const iso = (minutes) => new Date(Date.now() + minutes * 60000).toISOString();

/** minutes from now to `hour`:00 IST, `days` days ahead.
 *  ⚠ FOUND 5 Oct 2026, AND IT IS THE "1480s DRIFT" OF 4 Oct: a class planted at
 *  now + N days inherits the clock's time of day, so a run just before midnight
 *  planted a session from 23:40 to 00:40 the NEXT day. The class form holds one
 *  date and two times, so it read that as "ends before it starts", never drew a
 *  Continue button, and the run timed out. A class the FORM must open is planted
 *  at a fixed evening hour, on the hour, so it never crosses midnight and the
 *  form's HH:MM never drops seconds off it. */
const atIst = (days, hour) => {
  const istNow = new Date(Date.now() + 330 * 60000);
  const target = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate() + days, hour, 0, 0) - 330 * 60000;
  return (target - Date.now()) / 60000;
};

/** a draft class through the one creation door.
 *  ⚠ A CLASS IN THE PAST IS PLANTED THE SEEDER'S WAY (30 Sep 2026): created
 *  AHEAD as the owner, then its session back-dated by the SERVICE ROLE. The
 *  database refuses a past start from anybody else (`class_sessions_start_ahead`,
 *  20260930130000 — the form's own 28 Sep rule, kept by the row), and this
 *  script used to ask the RPC for `-180` minutes directly, which is exactly the
 *  door that migration closes. */
/* ⚠ 11 Oct 2026 (20261017090000, B12): A CLASS THAT HAS STARTED TAKES NO NEW
   ASK — so a past class's teacher has to be asked while it is still AHEAD.
   `beforeBackdate` runs between the create and the back-dating for exactly that
   (the ask, the yes and the publish). */
const draftClass = async (h, businessId, roomId, style, fromMin, toMin, beforeBackdate) => {
  const past = fromMin < 0;
  const c = await rpc(h, "create_class_with_session", {
    p_business_id: businessId,
    p_title: `${style} · All levels`,
    p_style: style,
    p_level: "all",
    p_room: null,
    p_price_inr: 0,
    p_capacity: 10,
    p_status: "draft",
    p_starts_at: iso(past ? fromMin + 60 * 24 * 30 : fromMin),
    p_ends_at: iso(past ? toMin + 60 * 24 * 30 : toMin),
    p_room_id: roomId,
    p_poster: null,
    p_venue_business_id: null,
    p_lat: null,
    p_lng: null,
    p_maps_url: null,
  });
  if (beforeBackdate) await beforeBackdate(c.id);
  if (past) {
    await patch(H_SERVICE, `class_sessions?class_id=eq.${c.id}`, { starts_at: iso(fromMin), ends_at: iso(toMin) }, "back-date the session");
  }
  return c.id;
};

const text = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");

/** ⚠ THE CLASS PAGE'S OWN BOOK CONTROL, WHICH IS NOT THE SHELF'S. The shelf
 *  draws `EnrollButton` ("Book a spot"); the page's booking bar reads "Book free
 *  trial" on a free class and "Book this class" on a priced one (ClassDetail
 *  2143). Asking a class page for "Book a spot" counts 0 forever — which is how
 *  one check here passed for the wrong reason until 30 Sep 2026. */
/* ⚠ "Book Now" on every booking button since 4 Oct 2026 (the user: "book a class
   and book a spot buttons on class should be Book Now") — the card's and the
   page's are one word now, so on a class PAGE this finds the bar's own button */
const BOOK_ON_PAGE = /^Book Now$/;

(async () => {
  const stamp = Date.now().toString(36);
  const made = { users: [], businesses: [] };
  const browser = await chromium.launch();
  const errs = [];

  try {
    /* ── THE WORLD ─────────────────────────────────────────────────────────── */
    const owner = await account(`shot.cls.owner.${stamp}@example.com`, `Cls Owner ${stamp}`, "Pune");
    const manager = await account(`shot.cls.mgr.${stamp}@example.com`, `Cls Mgr ${stamp}`, "Pune");
    const learner = await account(`shot.cls.lrn.${stamp}@example.com`, `Cls Lrn ${stamp}`, "Pune");
    const artist = await account(`shot.cls.art.${stamp}@example.com`, `Cls Art ${stamp}`, "Pune");
    made.users.push(owner.id, manager.id, learner.id, artist.id);

    const studio = await rpc(owner.h, "create_business_with_owner", { p_type: "studio", p_name: `Cls Studio ${stamp}`, p_area: "Kothrud", p_city: "Pune", p_styles: ["Hip-Hop"] });
    made.businesses.push(studio.id);
    /* ⚠ AND IT HAS TO BE LISTED, or none of the learner-side checks mean
       anything: a studio is born UNLISTED, so `findClassBySlug` and the shelf
       hand a non-member NOTHING and every assertion below would pass or fail on
       whatever the demo world happens to contain. The service role stands in for
       the admin's grant exactly as `proof-lib.ps1`'s `Subscribe-Studio` does. */
    await call("POST", "/rest/v1/subscriptions", H_SERVICE, {
      kind: "studio", user_id: owner.id, business_id: studio.id, plan_key: "studio_monthly",
      price_inr: 0, period: "monthly", status: "active",
      current_period_start: new Date().toISOString().slice(0, 10),
      current_period_end: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
      granted: true, note: "Granted by a shoot script — nothing charged",
      created_by: owner.id, updated_by: owner.id,
    }, "grant the studio's plan");
    await patch(H_SERVICE, `businesses?id=eq.${studio.id}`, { verified_at: new Date().toISOString(), visibility: "listed" }, "list the studio");

    const roomA = await call("POST", "/rest/v1/rooms", owner.h, { business_id: studio.id, name: "Room A", capacity: 30 }, "room A");
    const roomB = await call("POST", "/rest/v1/rooms", owner.h, { business_id: studio.id, name: "Room B", capacity: 30 }, "room B");

    /* a manager: a real seat through the real door, then the label (R56) */
    const inv = await rpc(owner.h, "invite_person_to_business", { p_business_id: studio.id, p_user_id: manager.id, p_role: "trainer" });
    await rpc(manager.h, "accept_business_invite", { p_code: inv.code });
    await rpc(owner.h, "set_member_role", { p_business_id: studio.id, p_user_id: manager.id, p_role: "manager" });

    /* three classes: one ahead, one that has ALREADY RUN, one LIVE right now.
       ⚠ different rooms, because a published class holds its room. */
    /* the owner takes their own class — confirmed at birth (26 Sep 2026) — and
       then presses Publish: a confirmed row publishes nothing by itself (11 Oct
       2026, the user: "no auto publish required"). ⚠ Both happen BEFORE the
       session is back-dated: a started class takes no new ask (20261017090000). */
    const takeAndPublish = async (id) => {
      await rpc(owner.h, "ask_class_person", { p_class_id: id, p_user_id: owner.id, p_kind: "artist" });
      await patch(owner.h, `classes?id=eq.${id}`, { status: "published" }, `publish ${id}`);
    };
    const ahead = await draftClass(owner.h, studio.id, roomA[0].id, "Hip-Hop", 60 * 24 * 5, 60 * 24 * 5 + 60, takeAndPublish);
    const ran = await draftClass(owner.h, studio.id, roomB[0].id, "Kathak", -180, -120, takeAndPublish);
    const live = await draftClass(owner.h, studio.id, roomB[0].id, "Salsa", -10, 50, takeAndPublish);
    /* a draft whose teacher has been ASKED and not answered */
    const asked = await draftClass(owner.h, studio.id, roomA[0].id, "Bhangra", atIst(9, 18), atIst(9, 18) + 60);
    await rpc(owner.h, "ask_class_person", { p_class_id: asked, p_user_id: artist.id, p_kind: "artist" });

    /* the learner takes a seat on the class that is AHEAD */
    const aheadSes = (await rows(owner.h, `class_sessions?class_id=eq.${ahead}&select=id`))[0].id;
    await rpc(learner.h, "book_class_session", { p_session_id: aheadSes });

    /* ══ 1 · THE MANAGER'S CLASSES SCREEN ═════════════════════════════════════
       ⚠⚠ RE-CUT 11 Oct 2026 (the user's choice): To do · Upcoming · Past, the
       buttons on every card. A manager reads every draft and what it waits on.
       11 Oct 2026: and WRITES — the classes UPDATE policy admits a manager now. */
    const mCtx = await browser.newContext();
    mCtx.on("weberror", (e) => errs.push(String(e.error())));
    const mPage = await signIn(mCtx, manager.email);
    mPage.on("pageerror", (e) => errs.push(`${mPage.url()} ${e}`));
    await mPage.goto(`${BASE}/business/${studio.id}/classes`, { waitUntil: "networkidle" });
    check(/\/classes$/.test(new URL(mPage.url()).pathname), "a MANAGER reaches the classes screen — R55 let them in on 28 Sep");
    /* 11 Oct 2026: INVERTED — a manager creates, edits and withdraws classes now
       (create_class_with_session, update_class_with_session, ask_class_person for
       the teacher, withdraw_class_ask and the classes UPDATE policy all admit the
       people who RUN the business). Pay and powers stay the owner's. */
    // TODO(11 Oct): confirm the manager's controls on the re-cut Classes screen — selectors: link "Add Class", link "Edit" (in testid "todo-waiting"), testid "card-withdraw".
    check((await mPage.getByRole("link", { name: "Add Class", exact: true }).count()) === 1, "…WITH Add Class — the people who run the business create classes (11 Oct 2026)");
    check((await mPage.getByRole("link", { name: "Roster", exact: true }).count()) === 0, "…and no Roster pill (4 Oct 2026) — the card opens the class page, whose Attendance tab is the register");
    await mPage.getByTestId("classes-tab-todo").click();
    await mPage.waitForTimeout(300);
    const mTodo = await text(mPage);
    check(/Bhangra/.test(mTodo) && new RegExp(`Waiting on ${artist.name}`, "i").test(mTodo), "the draft is in To do, saying who it waits on");
    const mWaiting = mPage.getByTestId("todo-waiting");
    check((await mWaiting.getByRole("link", { name: "Edit", exact: true }).count()) > 0, "⚠⚠ a manager is offered Edit on the draft (11 Oct 2026 — it was refused)");
    check((await mWaiting.getByTestId("card-withdraw").count()) === 1, "⚠⚠ …and Withdraw on the ask it waits on (11 Oct 2026 — it was refused)");
    check((await mPage.getByRole("button", { name: "Delete", exact: true }).count()) === 0, "…and no Delete on any card (it lives on the class page)");

    /* ══ 2 · THE OWNER: TO DO, AND PAST FILLED OFF THE CLOCK ═══════════════════ */
    const oCtx = await browser.newContext();
    oCtx.on("weberror", (e) => errs.push(String(e.error())));
    const oPage = await signIn(oCtx, owner.email);
    oPage.on("pageerror", (e) => errs.push(`${oPage.url()} ${e}`));
    await oPage.goto(`${BASE}/business/${studio.id}/classes`, { waitUntil: "networkidle" });
    check((await oPage.getByRole("link", { name: "Add Class", exact: true }).count()) === 1, "the OWNER is offered Add Class");
    const tabs = await oPage.getByRole("tab").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid").replace("classes-tab-", "")));
    check(tabs.join(",") === "todo,upcoming,past", `the tabs read To do · Upcoming · Past (${tabs.join(" · ")})`);
    await oPage.getByTestId("classes-tab-todo").click();
    await oPage.waitForTimeout(300);
    const oWaiting = oPage.getByTestId("todo-waiting");
    check((await oWaiting.getByRole("link", { name: "Edit", exact: true }).count()) > 0, "the owner is offered Edit on the same draft — the gate is the SEAT, not the screen");
    check((await oWaiting.getByTestId("card-withdraw").count()) === 1, "⚠ …and Withdraw, to stop waiting on the teacher they asked");
    check((await oPage.getByRole("button", { name: "Delete", exact: true }).count()) === 0 && (await oPage.getByTestId("class-delete").count()) === 0, "…and NO Delete on a card — it lives on the class page's top right since 4 Oct 2026");
    check((await oPage.getByRole("link", { name: "Refunds", exact: true }).count()) === 0, "…and no Refunds pill on any card either (4 Oct 2026)");

    await oPage.getByTestId("classes-tab-past").click();
    await oPage.waitForTimeout(300);
    check(/Kathak/.test(await oPage.getByTestId("classes-past").innerText().catch(() => "")), "⚠⚠ Past holds the class that has RUN — nothing ever writes 'completed', so the clock decides");
    await oPage.getByTestId("classes-tab-upcoming").click();
    await oPage.waitForTimeout(300);
    const upBody = await oPage.getByTestId("classes-upcoming").innerText().catch(() => "");
    check(!/Kathak/.test(upBody) && /Hip-Hop/.test(upBody), "…and it is OFF Upcoming, which holds the class still ahead");
    /* ⚠ THE CLASS ON THE CLOCK IS PINNED AS NOW, with the door's two buttons on its card */
    const nowGroup = oPage.getByTestId("timeline-now");
    check(/Salsa/.test(await nowGroup.innerText().catch(() => "")), "the class running right now is pinned under Now");
    /* ⚠ no Register on a card since 11 Oct 2026 (the user) — the card opens the
       class page, whose Attendance tab is the register */
    check((await nowGroup.getByTestId("card-scan").count()) === 1 && (await oPage.getByTestId("card-register").count()) === 0, "…with Scan on its card and no Register button anywhere on the screen");
    check(/\?open=scan$/.test((await nowGroup.getByTestId("card-scan").getAttribute("href")) || ""), "…Scan opening the scanner itself (?open=scan)");
    check((await oPage.getByTestId("classes-settings").count()) === 1, "the room-request switch is behind the gear");

    /* ══ 3 · A ROOM REQUEST, ANSWERED ON ITS CARD ═════════════════════════════ */
    /* ⚠ THE ASKER HAS TO BE AN ARTIST PAGE, and the database is what says so:
       *"a studio holds its classes in its own rooms — a venue is for an artist's
       class"*. So the Artist plan is granted with the service role first, the
       way `proof-lib.ps1` grants a studio's — an artist page carries no class at
       all without one (`why_no_class`). */
    await call("POST", "/rest/v1/subscriptions", H_SERVICE, {
      kind: "artist", user_id: artist.id, business_id: null, plan_key: "artist_monthly",
      price_inr: 0, period: "monthly", status: "active",
      current_period_start: new Date().toISOString().slice(0, 10),
      current_period_end: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
      granted: true, note: "Granted by a shoot script — nothing charged",
      created_by: artist.id, updated_by: artist.id,
    }, "grant the artist plan");
    const other = await rpc(artist.h, "create_business_with_owner", { p_type: "artist_page", p_name: `Cls Asker ${stamp}`, p_area: "Kothrud", p_city: "Pune", p_styles: ["Hip-Hop"] });
    made.businesses.push(other.id);
    const venueClassId = await rpc(artist.h, "create_class_with_session", {
      p_business_id: other.id, p_title: "Hip-Hop · All levels", p_style: "Hip-Hop", p_level: "all",
      p_room: null, p_price_inr: 0, p_capacity: 8, p_status: "draft",
      p_starts_at: iso(60 * 24 * 12), p_ends_at: iso(60 * 24 * 12 + 60),
      p_room_id: roomA[0].id, p_poster: null, p_venue_business_id: studio.id,
      p_lat: null, p_lng: null, p_maps_url: null,
    }).then((r) => r.id).catch((e) => {
      check(false, `could not plant a venue request — ${e.message}`);
      return null;
    });

    if (venueClassId) {
      await oPage.goto(`${BASE}/business/${studio.id}/classes`, { waitUntil: "networkidle" });
      check((await oPage.getByTestId("classes-tab-todo").getAttribute("aria-selected")) === "true", "⚠⚠ the screen opens on To do while something waits on the studio");
      const askedOf = oPage.getByTestId("todo-answer");
      check((await askedOf.getByTestId("card-accept").count()) === 1, "an artist's room request is the first thing under Asked of you, Accept on its card");
      check(new RegExp(`Cls Asker ${stamp} wants a room`, "i").test(await askedOf.innerText()), "…naming who wants a room, on the app's own class card");
      /* ⚠ the old address lands on the tab it meant (Rule 14) */
      await oPage.goto(`${BASE}/business/${studio.id}/classes?show=requests`, { waitUntil: "networkidle" });
      check((await oPage.getByTestId("classes-tab-todo").getAttribute("aria-selected")) === "true", "…and an old ?show=requests link opens To do");
      await oPage.getByTestId("classes-settings").click();
      check((await oPage.getByTestId("request-settings").count()) >= 1, "…the gear carries the room switch, moved here from the Inbox");
      await oPage.goBack();
      await oPage.waitForTimeout(300);
      await oPage.getByTestId("todo-answer").getByTestId("card-accept").first().click();
      await oPage.waitForTimeout(2500);
      const vs = (await rows(owner.h, `classes?id=eq.${venueClassId}&select=venue_status`))[0];
      check(vs.venue_status === "accepted", `…and one press holds the room, read back out of the database (venue_status "${vs.venue_status}")`);
      /* ⚠ ANSWERED IS A BUTTON BESIDE THE GEAR (11 Oct 2026), opening the class
         cards with the reply on each */
      await oPage.getByTestId("classes-answered").click().catch(() => {});
      const answeredText = await oPage.getByTestId("answered-list").innerText().catch(() => "");
      check(/confirmed/i.test(answeredText) && (await oPage.getByTestId("answered-list").locator('[data-card="session"]').count()) >= 1, `…the answered request is kept behind the Answered button, as its class card with the reply (${answeredText.replace(/\s+/g, " ").slice(0, 80) || "none"})`);
      await oPage.goBack();
      await oPage.waitForTimeout(300);
    } else {
      check(false, "could not plant a venue request (artist page or class refused)");
    }

    /* ══ 4 · AN ASK IS TAKEN BACK FROM THE CARD THAT NAMES IT ══════════════════ */
    await oPage.goto(`${BASE}/business/${studio.id}/classes?tab=todo`, { waitUntil: "networkidle" });
    const withdraw = oPage.getByTestId("todo-waiting").getByTestId("card-withdraw");
    check((await withdraw.count()) === 1, "a waiting draft offers Withdraw on its own card");
    await withdraw.click();
    await oPage.waitForTimeout(2000);
    const stillAsked = await rows(owner.h, `class_people?class_id=eq.${asked}&deleted_at=is.null&select=id`);
    check(stillAsked.length === 0, `…and the ask is gone from the database (${stillAsked.length} live rows)`);

    /* ══ 5 · THE LEARNER SHELF TELLS THE TRUTH ABOUT TIME ═════════════════════ */
    const lCtx = await browser.newContext();
    lCtx.on("weberror", (e) => errs.push(String(e.error())));
    const lPage = await signIn(lCtx, learner.email);
    lPage.on("pageerror", (e) => errs.push(`${lPage.url()} ${e}`));
    /* ⚠ EVERY SHELF ASSERTION IS SCOPED TO THE CLASS'S OWN LINK, never to its
       style word — `a[href^="/c/{slug}"]` is this class and no other. */
    const slugOf = async (id) => (await rows(owner.h, `classes?id=eq.${id}&select=share_slug`))[0].share_slug;
    const [aheadSlug, ranSlug, liveSlug] = await Promise.all([slugOf(ahead), slugOf(ran), slugOf(live)]);
    const onShelf = async (page, slug) => (await page.locator(`a[href^="/c/${slug}"]`).count()) > 0;

    await lPage.goto(`${BASE}/classes`, { waitUntil: "networkidle" });
    check(await onShelf(lPage, aheadSlug), "the class that is AHEAD is on the Upcoming shelf");
    check(!(await onShelf(lPage, ranSlug)), "⚠⚠ the class that already RAN is not — it was listed under *Upcoming classes* with a Book button that always failed");
    check(!(await onShelf(lPage, liveSlug)), "⚠ nor is the one running right now: it cannot be booked either");

    await lPage.goto(`${BASE}/c/${liveSlug}`, { waitUntil: "networkidle" });
    check((await lPage.getByTestId("class-already-started").count()) === 1, "⚠⚠ …and its own page SAYS it has started rather than offering a press the database refuses");
    check((await lPage.getByRole("button", { name: BOOK_ON_PAGE }).count()) === 0, "…with no Book button left to press");

    /* ══ 6 · A LEARNER'S SEAT IS NOT THE OWNER'S ══════════════════════════════ */
    await lPage.goto(`${BASE}/classes`, { waitUntil: "networkidle" });
    const bookedChips = async (pg) => pg.getByTestId("relation-chip").filter({ hasText: /^Booked$/ }).count();
    check((await bookedChips(lPage)) >= 1, "the learner who booked reads Booked on their own seat's card");

    await oPage.goto(`${BASE}/classes`, { waitUntil: "networkidle" });
    check(await onShelf(oPage, aheadSlug), "the owner sees their own studio's class on the shelf");
    check((await bookedChips(oPage)) === 0, "⚠⚠ …and is NOT told they are enrolled on it — a learner's seat, read through the roster policy, was being drawn as the viewer's own");
    check((await oPage.getByRole("button", { name: "Cancel booking" }).count()) === 0, "…and is offered no Cancel aimed at somebody else's booking");

    /* ══ 7 · THE PERSON ASKED ANSWERS IT ON THE CLASS'S OWN CARD ══════════════ */
    const second = await draftClass(owner.h, studio.id, roomA[0].id, "Contemporary", 60 * 24 * 15, 60 * 24 * 15 + 60);
    await rpc(owner.h, "ask_class_person", { p_class_id: second, p_user_id: learner.id, p_kind: "artist" });
    await lPage.goto(`${BASE}/my-classes`, { waitUntil: "networkidle" });
    const myBody = await text(lPage);
    check((await lPage.getByTestId("classes-tab-todo").getAttribute("aria-selected")) === "true", "⚠⚠ somebody asked to TAKE a class lands on To do");
    const myAsk = lPage.getByTestId("todo-answer");
    check((await myAsk.getByTestId("card-accept").count()) === 1 && /Asked to teach/i.test(await myAsk.innerText()), "…the ask on its own card under Asked of you, Accept on it");
    check(!/you say yes in your Inbox/.test(myBody), "⚠ …and nothing still sends them to the Inbox for something this screen does");
    await lPage.getByTestId("classes-settings").click();
    check((await lPage.getByTestId("request-settings").count()) >= 1, "…and the gear carries the teach / assist switches, moved here from the Inbox");
    await lPage.goBack();
    await lPage.goto(`${BASE}/inbox`, { waitUntil: "networkidle" });
    await lPage.getByRole("button", { name: /^Requests — / }).click().catch(() => {});
    const ptr = lPage.getByTestId("class-requests-pointer");
    check((await ptr.count()) === 1 && /1 class request/.test(await ptr.innerText()), "…and the Inbox keeps one line counting it and pointing to Classes");
    check((await ptr.getAttribute("href")) === "/my-classes", `…to the Classes screen itself (${await ptr.getAttribute("href")})`);
    await lPage.goto(`${BASE}/my-classes`, { waitUntil: "networkidle" });
    await lPage.getByTestId("todo-answer").getByTestId("card-accept").first().click();
    await lPage.waitForTimeout(2500);
    const seated = await rows(owner.h, `class_people?class_id=eq.${second}&status=eq.confirmed&deleted_at=is.null&select=user_id`);
    check(seated.length === 1 && seated[0].user_id === learner.id, "…one press and they are on it, read back out of the database");
    /* 11 Oct 2026: the yes leaves the class a DRAFT (nothing publishes by itself —
       the user: "no auto publish required"), and it made NO visiting_faculty seat
       on the studio's team */
    const secondNow = (await rows(owner.h, `classes?id=eq.${second}&select=status`))[0];
    check(secondNow && secondNow.status === "draft", `⚠⚠ …and their yes left the class a DRAFT — publishing is a press (status "${secondNow && secondNow.status}")`);
    const lSeat = await rows(H_SERVICE, `business_members?business_id=eq.${studio.id}&user_id=eq.${learner.id}&deleted_at=is.null&select=member_role`);
    check(lSeat.length === 0, `⚠ …and no seat on the studio's team came with the yes (found ${lSeat.length})`);

    /* ══ 7b · ONE LIST, NARROWED BY CHIPS ════════════════════════════════════ */
    const [secondRow] = await rows(owner.h, `classes?id=eq.${second}&select=share_slug`);
    await lPage.goto(`${BASE}/my-classes`, { waitUntil: "networkidle" });
    /* ⚠ nothing waits on THEM now, so the screen opens on Upcoming — and To do
       still holds what they wait on */
    check((await lPage.getByTestId("classes-tab-upcoming").getAttribute("aria-selected")) === "true", "…nothing waits on them now, so Classes opens on Upcoming");
    /* the class they said yes to is still a DRAFT, so it waits in To do — on
       the studio, which has the Publish to press */
    await lPage.getByTestId("classes-tab-todo").click();
    await lPage.waitForTimeout(300);
    const todoText = await lPage.getByTestId("classes-todo").innerText().catch(() => "");
    check(/waiting on cls studio/i.test(todoText), `(${todoText.replace(/\s+/g, " ").slice(-90)}) ⚠ the class they said yes to waits in To do, on the studio — their yes published nothing`);
    /* ⚠⚠ and a MANAGER publishes it by hand (11 Oct 2026 — a manager may publish
       now; the owner's press was the only one before) */
    await patch(manager.h, `classes?id=eq.${second}`, { status: "published" }, "the manager publishes the class").catch((e) => check(false, `the manager's publish was refused — ${e.message}`));
    const secondPub = (await rows(owner.h, `classes?id=eq.${second}&select=status`))[0];
    check(secondPub && secondPub.status === "published", `⚠⚠ …and a MANAGER's press publishes it (status "${secondPub && secondPub.status}")`);
    await lPage.reload({ waitUntil: "networkidle" });
    await lPage.getByTestId("classes-tab-upcoming").click();
    await lPage.waitForTimeout(300);
    check(await onShelf(lPage, secondRow.share_slug), "…it is on Upcoming instead, as a class they teach");
    const cols = await lPage.getByTestId("classes-chips").locator("button").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid").replace("classes-chip-", "")));
    /* ⚠ EVERY CHIP IS ALWAYS DRAWN, a 0 included (11 Oct 2026, the user) */
    check(cols.join(",") === "all,booked,teaching,assisting", `⚠⚠ every chip is drawn, a 0 included — All · Booked · Teaching · Assisting, and no By studios (${cols.join(" · ")})`);
    check(/Assisting · 0/.test(await lPage.getByTestId("classes-chip-assisting").innerText().catch(() => "")), "…Assisting reads 0 rather than vanishing");
    await lPage.goto(`${BASE}/my-classes?role=studio`, { waitUntil: "networkidle" });
    check((await lPage.getByTestId("classes-chip-all").getAttribute("aria-pressed").catch(() => null)) === "true", "…and an old ?role=studio address lands on All (Rule 14)");
    await lPage.goto(`${BASE}/my-classes?tab=upcoming`, { waitUntil: "networkidle" });
    check(await onShelf(lPage, aheadSlug), "…Upcoming holds the class they booked");
    await lPage.getByTestId("classes-chip-teaching").click();
    await lPage.waitForTimeout(300);
    check(!(await onShelf(lPage, aheadSlug)) && /role=teaching/.test(lPage.url()), "…and a chip narrows it in place, the address following it");
    check((await lPage.getByRole("link", { name: "Add Class", exact: true }).count()) === 0 && (await lPage.getByTestId("why-no-class").count()) === 0, "…with no Create control, and no owner-only sentence about a studio they do not run");
    await lPage.goto(`${BASE}/my-classes?show=manage`, { waitUntil: "networkidle" });
    check((await lPage.getByTestId("classes-chip-teaching").getAttribute("aria-pressed")) === "true", "⚠ an old ?show=manage link still lands on what it held — Teaching (Rule 14)");
    void secondRow;

    /* ══ 8 · NEXT SESSIONS ON THE PUBLIC PAGE (#0aj) ══════════════════════════
       The backlog row wanted the whole public schedule folded into the profile
       page. It is a 1,085-line screen with a `position: sticky` controls block
       and a `position: fixed` scrim, so folding it in nests a second screen
       inside a page section — the stacking-context family this repo has paid
       for four times. What lands instead is the part that is only an
       improvement: three cards under the bar that opens the rest. */
    await lPage.goto(`${BASE}/studio/${studio.id}`, { waitUntil: "networkidle" });
    const pubBody = await text(lPage);
    check((await lPage.getByTestId("next-sessions").count()) === 1, "a listed studio's public page carries NEXT SESSIONS under the Schedule bar");
    check(/Next sessions/i.test(pubBody), "…headed in words, not only by a test id");
    check(await onShelf(lPage, aheadSlug), "…and the class that is AHEAD is one of the cards");
    check(!(await onShelf(lPage, ranSlug)), "⚠ …while the one that already RAN is not — the summary reads the SCHEDULE's own window, so it cannot name a class the page behind it does not list");
    check(
      (await lPage.locator('[data-testid="next-sessions"] a[href$="/schedule"]').count()) === 0,
      "⚠ …and it carries no door of its own: the white bar directly above it goes exactly there, and two doors to one subject is the shape C31 and C51 each cost a push to undo"
    );
    /* ⚠ AND THE ORDER, WHICH IS THE USER'S OWN RULE: the bar first, then the
       preview, then what is on sale ("SCHEDULE WILL ALWAYS BE ABOVE
       MEMBERSHIPS", 20 Sep 2026). A summary that landed between them would
       have broken a rule the user has stated by name. */
    const barY = await lPage.getByRole("link", { name: "Schedule" }).first().evaluate((el) => el.getBoundingClientRect().top);
    const sumY = await lPage.getByTestId("next-sessions").evaluate((el) => el.getBoundingClientRect().top);
    check(sumY > barY, `…drawn UNDER the bar rather than above it (bar ${Math.round(barY)}, summary ${Math.round(sumY)})`);
    /* ⚠ AND BETWEEN THEM, THE STUDIO'S PLACE (5 Oct 2026, the user: "below
       Schedule should have full adrees and rooms with amenities mentioned
       alongside membership in a seprate segragation and others from next session
       below that") — its own squircle, with the address and a tile per room */
    const placeY = await lPage.getByTestId("studio-place").evaluate((el) => el.getBoundingClientRect().top).catch(() => null);
    check(placeY != null && placeY > barY && placeY < sumY, `the studio's place sits under the bar and above NEXT SESSIONS (bar ${Math.round(barY)}, place ${placeY == null ? "—" : Math.round(placeY)}, sessions ${Math.round(sumY)})`);
    check((await lPage.getByTestId("studio-address").count()) === 1, "…carrying the full address");
    check((await lPage.getByTestId("studio-room").count()) >= 1, "…and a tile per room");
    /* ⚠ AND A CARD ON THE RAIL CARRIES THE BOOKING CONTROL (5 Oct 2026, the
       user: "Book Now button for the next session on public profile pages") —
       on the class that is AHEAD; ⚠ never on one that has already STARTED, which
       the rail keeps until it ends and which `book_class_session` would refuse */
    const ctl = /Book Now|Class full|Cancel booking|Cancel \/ refund|Sign in to book/;
    const aheadOnRail = lPage.locator('[data-testid="next-session"]').filter({ has: lPage.locator(`a[href^="/c/${aheadSlug}"]`) });
    check((await aheadOnRail.filter({ hasText: ctl }).count()) === 1, "the class that is AHEAD offers Book Now on NEXT SESSIONS");
    const liveOnRail = lPage.locator('[data-testid="next-session"]').filter({ has: lPage.locator(`a[href^="/c/${liveSlug}"]`) });
    if ((await liveOnRail.count()) === 1) {
      check((await liveOnRail.filter({ hasText: /Book Now/ }).count()) === 0, "⚠ …while a class that has already STARTED offers no Book Now there");
    }

    /* ══ 8b · A CLASS THAT IS OVER IS FINAL (4 Oct 2026) ══════════════════════
       The user: "cancel / refund class should not be possible if class is over".
       Its page offers its owner no Delete (calling a finished class off would
       refund every paid seat), its band says why, and a learner holding a seat on
       it is offered no way out of it on their own list. ⚠ The DATABASE half is
       the held migration `20261004170000` — its dry run proves the refusals. */
    await oPage.goto(`${BASE}/c/${ranSlug}`, { waitUntil: "networkidle" });
    check((await oPage.getByTestId("class-delete").count()) === 0, "⚠ a class that has RUN offers its owner no Delete");
    const overBand = oPage.getByTestId("class-over-band");
    check((await overBand.count()) === 1 && /can no longer be cancelled or refunded/.test(await overBand.innerText()), "…its band says it can no longer be cancelled or refunded");
    check(!/Refunds ›/.test(await text(oPage)), "…and carries no Refunds › of its own — the Refunds tab is the queue");
    const ranSes = (await rows(owner.h, `class_sessions?class_id=eq.${ran}&select=id`))[0].id;
    await call("POST", "/rest/v1/class_bookings", H_SERVICE, {
      session_id: ranSes, class_id: ran, business_id: studio.id,
      user_id: learner.id, status: "enrolled", created_by: learner.id, updated_by: learner.id,
    }, "a seat on the class that ran");
    /* ⚠ UPCOMING · PAST ARE TABS since 11 Oct 2026 — the class still ahead is on
       Upcoming, the class that ran on Past, never both on one */
    await lPage.goto(`${BASE}/my-classes?tab=upcoming&role=booked`, { waitUntil: "networkidle" });
    const ranCard = lPage.locator('[data-card="session"]').filter({ has: lPage.locator(`a[href^="/c/${ranSlug}"]`) });
    const aheadCard = lPage.locator('[data-card="session"]').filter({ has: lPage.locator(`a[href^="/c/${aheadSlug}"]`) });
    check((await aheadCard.getByRole("button", { name: /Cancel/ }).count()) + (await aheadCard.getByRole("link", { name: /Cancel/ }).count()) > 0, "…while the class still AHEAD keeps its way out — the gate is the clock, not the list");
    check((await ranCard.count()) === 0, "…and the class that ran is not on Upcoming");
    await lPage.getByTestId("classes-tab-past").click();
    await lPage.waitForTimeout(300);
    const pastList = lPage.getByTestId("classes-past");
    check((await pastList.locator(`a[href^="/c/${aheadSlug}"]`).count()) === 0, "…the class still ahead is not on Past");
    check((await pastList.locator(`a[href^="/c/${ranSlug}"]`).count()) === 1, "the learner's Past carries the class they took — it is the record");
    check((await ranCard.getByRole("button", { name: /Cancel/ }).count()) === 0 && (await ranCard.getByRole("link", { name: /Cancel/ }).count()) === 0, "⚠ …and offers no Cancel or refund on it");

    /* ══ 9 · CALLING A CLASS OFF GIVES THE MONEY BACK (#0b3) ══════════════════
       ⚠⚠ THE SHEET HAS PROMISED THIS SINCE 29 Aug 2026 AND NOTHING DID IT. It
       reads "{n} enrolled students must be refunded — you'll settle each refund
       on the next screen", its button reads "Delete & manage refunds", and it
       then sends the owner to the money desk — where there was nothing, because
       no refund row was ever written by any of it.

       ⚠ Nothing above could catch that. The migration's own dry run was 27/27
       and typecheck, lint and the build are green whether or not `softDeleteClass`
       ever calls the door — which is this repo's oldest shape (28 Sep: a green
       migration and a green typecheck, both true while the feature did nothing).
       Only a browser pressing the button answers it. */
    const priced = await draftClass(owner.h, studio.id, roomA[0].id, "Contemporary", 60 * 24 * 7, 60 * 24 * 7 + 60);
    await patch(owner.h, `classes?id=eq.${priced}`, { price_inr: 300 }, "price the class");
    await rpc(owner.h, "ask_class_person", { p_class_id: priced, p_user_id: owner.id, p_kind: "artist" });
    await patch(owner.h, `classes?id=eq.${priced}`, { status: "published" }, "publish the priced class");
    const pricedSes = (await rows(owner.h, `class_sessions?class_id=eq.${priced}&select=id`))[0].id;

    /* ⚠ A PAID SEAT, PLANTED THE WAY `demo-data.js` PLANTS ONE: a learner cannot
       book a priced class directly (Step 9 refuses it — the money comes first),
       so the service role stands in for the Cashfree webhook, which is the only
       thing that ever writes this state. What is under test is the DELETE, not
       the booking path, which `rls-proof-payments` covers. */
    const seat = await call("POST", "/rest/v1/class_bookings", H_SERVICE, {
      session_id: pricedSes, class_id: priced, business_id: studio.id,
      user_id: learner.id, status: "enrolled", created_by: learner.id, updated_by: learner.id,
    }, "the paid seat");
    /* ⚠ WITH A RAIL ORDER ID (30 Sep 2026), so the delete's new SEND is actually
       attempted: `dos_…` is our grammar, Cashfree has never heard of this order,
       and its refusal is the deterministic way to prove the FAILURE path — the
       row stays pending and unsent, and the desk offers to send it again. */
    const order = await call("POST", "/rest/v1/orders", H_SERVICE, {
      business_id: studio.id, user_id: learner.id, amount_inr: 300,
      class_id: priced, session_id: pricedSes, class_booking_id: seat[0].id,
      status: "paid", provider: "cashfree", provider_order_id: `dos_shoot${stamp}`,
      created_by: learner.id, updated_by: learner.id,
    }, "the paid order");
    await call("POST", "/rest/v1/payments", H_SERVICE, {
      order_id: order[0].id, user_id: learner.id, provider_payment_id: `shoot_${stamp}`,
      amount_inr: 300, status: "captured", method: "upi", business_id: studio.id,
      provider: "cashfree", created_by: learner.id, updated_by: learner.id,
    }, "the captured payment");

    const before = await rows(H_SERVICE, `refunds?order_id=eq.${order[0].id}&select=id`);
    check(before.length === 0, "a paid seat on a published class, and NO refund against it yet");

    /* ⚠ THE DELETE IS ON THE CLASS PAGE NOW (4 Oct 2026, the user: "delete class
       removed from class card and goes on top right of class detail page") — the
       chip on the page's top right, behind the same question in the same words. */
    const pricedSlug = (await rows(H_SERVICE, `classes?id=eq.${priced}&select=share_slug`))[0].share_slug;
    await oPage.goto(`${BASE}/c/${pricedSlug}`, { waitUntil: "networkidle" });
    const chip = oPage.getByTestId("class-delete");
    check((await chip.count()) === 1, "⚠ the class page carries the Delete chip for its owner");
    const chipBox = await chip.boundingBox();
    const vw = oPage.viewportSize()?.width ?? 1280;
    const pageBox = await oPage.locator("[data-testid='class-page-card']").boundingBox();
    check(!!chipBox && !!pageBox && chipBox.x + chipBox.width > pageBox.x + pageBox.width - 40 && chipBox.y < pageBox.y, `…on the page's TOP RIGHT, above the card (chip ${Math.round(chipBox?.x ?? 0)},${Math.round(chipBox?.y ?? 0)} · card right ${Math.round((pageBox?.x ?? 0) + (pageBox?.width ?? 0))} · viewport ${vw})`);
    await chip.click();
    const dialog = oPage.getByRole("alertdialog", { name: "Delete this published class?" });
    await dialog.waitFor({ timeout: 10000 });
    check(/1 enrolled student must be refunded/.test(await dialog.innerText()), "⚠ the question still makes the promise it has made since 29 Aug 2026");
    const go = dialog.getByRole("button", { name: "Delete & manage refunds", exact: true });
    check((await go.count()) === 1, "…and the button still names the refunds");
    await go.click();

    /* the desk the promise sends them to: the refunds, where each one is settled */
    await oPage.waitForURL(/\/refunds$/, { timeout: 30000 });
    check(/\/business\/[^/]+\/refunds$/.test(new URL(oPage.url()).pathname), "…and it lands on the studio's refunds desk — the next screen the sentence names");

    /* ⚠ READ IT BACK OUT OF THE DATABASE. The screen navigating proves nothing
       about whether a refund exists — that was true for a month. */
    await oPage.waitForTimeout(2000);
    const gone = await rows(H_SERVICE, `classes?id=eq.${priced}&select=deleted_at`);
    check(gone[0].deleted_at !== null, "the class really is deleted");
    const seatAfter = await rows(H_SERVICE, `class_bookings?id=eq.${seat[0].id}&select=status,updated_by`);
    check(seatAfter[0].status === "cancelled", "⚠⚠ the learner's seat is CANCELLED — it used to stay `enrolled` on a class that no longer existed");
    check(seatAfter[0].updated_by === owner.id, "…with the OWNER recorded as the actor who did it");
    const after = await rows(H_SERVICE, `refunds?order_id=eq.${order[0].id}&select=status,amount_inr,user_id,created_by`);
    check(after.length === 1, "⚠⚠ ONE REFUND ROW EXISTS — the thing the sheet has promised since 29 Aug and never delivered");
    check(after[0]?.amount_inr === 300, "…for the full ₹300 that was actually captured");
    check(after[0]?.status === "pending", "…AUTOMATIC, not 'requested': the refund window (12 hours since 4 Oct 2026) is about a learner cancelling late, not a class the studio called off");
    check(after[0]?.user_id === learner.id, "⚠⚠ …filed against the LEARNER whose money it is, not the owner who pressed the button");
    check(after[0]?.created_by === owner.id, "…while the owner is the actor on it — the two identities stayed apart");

    /* ══ 9b · AND THE MONEY IS ASKED FOR — THE RAIL, AND THE DESK'S RETRY (30 Sep) ══
       ⚠⚠ Until today the call-off wrote the row above and STOPPED: nothing asked
       Cashfree for the ₹300, so it read "PROCESSING · awaiting the rail" for ever
       and the only exit was the owner paying it back by hand. The delete now sends
       every unsent refund; here Cashfree refuses (it has never seen `dos_shoot…`),
       so what a browser can prove is the honest failure path — the row is still
       pending, still unsent, and the desk says so and offers the retry. */
    const sent = await rows(H_SERVICE, `refunds?order_id=eq.${order[0].id}&select=status,provider_refund_id`);
    check(sent[0]?.status === "pending" && sent[0]?.provider_refund_id === null, "a send the rail refused leaves the row pending and UNSENT — nothing pretended it landed");

    await oPage.goto(`${BASE}/business/${studio.id}/refunds`, { waitUntil: "networkidle" });
    const ledger = await text(oPage);
    check(/not yet with Cashfree/.test(ledger), "⚠ the studio's ledger says the refund is NOT YET WITH CASHFREE — a different fact from 'with Cashfree', and the two used to read alike");
    const sendBtn = oPage.getByRole("button", { name: "Send through Cashfree", exact: true });
    check((await sendBtn.count()) === 1, "⚠⚠ …and offers to SEND it through Cashfree, beside the desk settlement that used to be the only exit");
    check((await oPage.getByRole("button", { name: "Mark refunded at the desk", exact: true }).count()) === 1, "…with Mark refunded at the desk still there for money that never went through the rail");
    await sendBtn.click();
    /* the toast lives 2.4 s, so it is WAITED FOR rather than read after a sleep */
    const refusedInWords = await oPage
      .getByRole("status")
      .filter({ hasText: /did not take the refund/ })
      .waitFor({ timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    check(refusedInWords, "…and pressing it reports the rail's refusal in words rather than claiming the money moved");
    const stillUnsent = await rows(H_SERVICE, `refunds?order_id=eq.${order[0].id}&select=status,provider_refund_id`);
    check(stillUnsent[0]?.status === "pending" && stillUnsent[0]?.provider_refund_id === null, "…and the row is exactly as it was — a refused send changes nothing");

    /* the LEARNER reads their own side of the same row */
    await lPage.goto(`${BASE}/refunds`, { waitUntil: "networkidle" });
    check(/PROCESSING/.test(await text(lPage)) && /Cls Studio/.test(await text(lPage)), "the learner's own Refunds ledger carries the ₹300 as PROCESSING, against the studio that owes it");

    /* ══ 12 · WHAT A PASS WAS SPENT ON, BOTH ENDS (30 Sep 2026) ═══════════════
       `pass_uses` shipped on 19 Sep with no caller: the seller's page said WHICH
       classes and WHO holds one, and never which classes WHICH person spent
       theirs on; the holder's own card had a bar and no history. */
    const passCls = await draftClass(owner.h, studio.id, roomA[0].id, "Bharatanatyam", 60 * 24 * 6, 60 * 24 * 6 + 60);
    /* ⚠ PRICED (11 Oct 2026, 20261017090000): a pass is not spent on a FREE class
       any more — book_with_membership refuses "this class is free — book it
       without a pass" and passes_for_session offers none — so the class a unit is
       spent on has a price, set while it is still a draft */
    await patch(owner.h, `classes?id=eq.${passCls}`, { price_inr: 300 }, "price the pass class");
    await rpc(owner.h, "ask_class_person", { p_class_id: passCls, p_user_id: owner.id, p_kind: "artist" });
    await patch(owner.h, `classes?id=eq.${passCls}`, { status: "published" }, "publish the pass class");
    const passSes = (await rows(owner.h, `class_sessions?class_id=eq.${passCls}&select=id`))[0].id;
    const mem = await rpc(owner.h, "save_membership", { p_membership_id: null, p_business_id: studio.id, p_name: `Shoot Pass ${stamp}`, p_unit: "classes", p_units: 2, p_price_inr: 0, p_total_count: 5, p_status: "live" });
    /* ⚠ A FRESH BUYER, not the learner: until 11 Oct 2026 accepting a class in
       segment 7 seated the learner `visiting_faculty` (R19) and the database
       refuses a member of the seller's team a membership. The yes seats nobody
       now, but the learner is also the teacher of `second`, so a clean buyer
       keeps this segment about passes alone. */
    const buyer = await account(`shot.cls.buy.${stamp}@example.com`, `Cls Buyer ${stamp}`, "Pune");
    made.users.push(buyer.id);
    const passRow = await rpc(buyer.h, "buy_membership", { p_membership_id: mem.id });
    await rpc(buyer.h, "book_with_membership", { p_session_id: passSes, p_pass_id: passRow.id });

    const bCtx = await browser.newContext();
    const bPage = await signIn(bCtx, buyer.email);
    bPage.on("pageerror", (e) => errs.push(`${bPage.url()} ${e}`));
    await bPage.goto(`${BASE}/memberships`, { waitUntil: "networkidle" });
    const myPass = bPage.getByTestId("my-pass").filter({ hasText: `Shoot Pass ${stamp}` });
    check((await myPass.getByTestId("spent-on").count()) === 1, "the holder's own pass card carries SPENT ON under its bar");
    check(/Bharatanatyam/.test(await myPass.innerText()), "…naming the class the unit went on");
    check((await myPass.getByTestId("pass-progress").getAttribute("aria-label")) === "1 of 2 used", "…and the bar agrees with the list — one number (Step 25)");

    /* through the OLD address on purpose (5 Oct 2026): `/memberships/{id}` was a
       second copy of the studio's own details page and only forwards there now,
       looking the seller up — so this proves the forward lands on THIS studio */
    await oPage.goto(`${BASE}/memberships/${mem.id}`, { waitUntil: "networkidle" });
    check(new URL(oPage.url()).pathname === `/business/${studio.id}/memberships/${mem.id}`, `the old /memberships/{id} address forwards to the studio's own details page (${new URL(oPage.url()).pathname})`);
    const holder = oPage.getByTestId("membership-holder");
    check((await holder.count()) === 1 && (await holder.getByTestId("spent-on").count()) === 1, "⚠ the seller's usage page says which class THIS holder spent theirs on — the cross of its two lists");
    check(/1 class still owed to the people holding one/.test(await text(oPage)), "…and says what is still OWED: one class sold and not yet danced");

    /* ══ 10 · EDITING A CLASS IS ONE ACT (#0b4) ═══════════════════════════════
       ⚠⚠ NOTHING HAD EVER DRIVEN THIS FORM. The register's Edit LINK is checked
       above (drawn for the owner — and for a manager since 11 Oct 2026) and no test has ever
       SUBMITTED it — so `updateClassDetails` had no cover at all, and it was
       just rewired from two loose updates onto one RPC. That is the same shape
       as the delete above, found the same way: by grepping for what drives it.

       ⚠ The atomicity itself is the dry run's (check 10: a refused session move
       rolled the class row back). What a browser answers is the half a dry run
       cannot: that the form still reaches the door, under the argument names
       PostgREST resolves by, and that BOTH halves land. */
    const wasAt = (await rows(owner.h, `class_sessions?class_id=eq.${asked}&select=starts_at`))[0].starts_at;
    await oPage.goto(`${BASE}/business/${studio.id}/classes/${asked}/edit`, { waitUntil: "networkidle" });
    check(/\/edit$/.test(new URL(oPage.url()).pathname), "the owner reaches the class edit form");

    /* the style is changed too, because the class's TITLE is derived from it —
       so this proves the label the database stores still follows the form.
       ⚠ The style is `DosStylePicker`, not a row of chips: a CLOSED row carrying
       aria-label "Dance style" that opens onto the registry (30 Aug 2026), so it
       has to be opened before the style is a button at all. */
    await oPage.getByLabel("Dance style", { exact: true }).click();
    await oPage.getByRole("button", { name: "Kathak", exact: true }).first().click();
    // TODO(11 Oct): button "Continue" — present only if the one class form keeps its two steps.
    await oPage.getByRole("button", { name: "Continue" }).click();
    await oPage.waitForTimeout(400);
    await oPage.getByLabel("Price per session").fill("450");
    /* 11 Oct 2026: the edit form's button reads "Save" (was "Save changes") */
    await oPage.getByRole("button", { name: "Save", exact: true }).click();
    await oPage.waitForURL((u) => !/\/edit$/.test(new URL(u).pathname), { timeout: 30000 });
    check(true, "…and Save changes lands rather than hanging on a door that is not there");

    await oPage.waitForTimeout(1500);
    const edited = (await rows(owner.h, `classes?id=eq.${asked}&select=style,title,price_inr`))[0];
    check(edited.price_inr === 450, "⚠ the CLASS half of the edit landed (price 450)", JSON.stringify(edited));
    check(edited.style === "Kathak", "…and the style with it");
    check(
      edited.title === "Kathak · All levels",
      "…and the stored TITLE followed the style, which is what the database's own words read from",
      edited.title
    );
    /* ⚠ THE SAME MINUTE, NOT THE SAME INSTANT, AND THAT IS THE HONEST CLAIM.
       The form's time control is HH:MM, so re-submitting an unchanged time drops
       the SECONDS the row was created with — pre-existing, true of every save
       this form has ever made, and nothing to do with the RPC. Asserting
       equality to the millisecond failed on a correct result; what this is
       really proving is that the session statement RAN and did not move the
       class to some other hour. */
    const stillAt = (await rows(owner.h, `class_sessions?class_id=eq.${asked}&select=starts_at`))[0].starts_at;
    const driftMs = Math.abs(new Date(stillAt).getTime() - new Date(wasAt).getTime());
    check(
      driftMs < 60000,
      `⚠ …and the SESSION half ran in the same act, leaving the time where it was (${Math.round(driftMs / 1000)}s of HH:MM rounding, not a move)`
    );

    /* ══ 10b · AN EDIT ASKS THE TEACHER AGAIN (11 Oct 2026, the user: "if anything
       has been edited should send a new request for confirmation") ═══════════ */
    /* 11 Oct 2026: `second` was published by the manager's press in 7b, and a
       published class's price, style, room, capacity and times are FIXED now
       (guard_published_class_fixed) — so the re-ask is proven on a DRAFT whose
       teacher said yes (a yes publishes nothing), and the published class is
       asserted refused instead. */
    let fixedWhy = "ACCEPTED";
    try {
      await patch(owner.h, `classes?id=eq.${second}`, { price_inr: 350 }, "edit a published class");
    } catch (e) {
      fixedWhy = e.message;
    }
    check(/A published class cannot be edited/.test(fixedWhy), `⚠⚠ a PUBLISHED class's price cannot be changed — delete it and add a new one (${fixedWhy.slice(0, 110)})`);

    const reconfirm = await draftClass(owner.h, studio.id, roomA[0].id, "Bollywood", atIst(20, 18), atIst(20, 18) + 60);
    const rcAsk = await rpc(owner.h, "ask_class_person", { p_class_id: reconfirm, p_user_id: learner.id, p_kind: "artist" });
    await rpc(learner.h, "respond_to_class_ask", { p_class_person_id: rcAsk.id, p_accept: true });
    await oPage.goto(`${BASE}/business/${studio.id}/classes/${reconfirm}/edit`, { waitUntil: "networkidle" });
    await oPage.getByRole("button", { name: "Continue" }).click();
    await oPage.waitForTimeout(400);
    await oPage.getByLabel("Price per session").fill("350");
    // TODO(11 Oct): button "Continue" — present only if the one class form keeps its two steps.
    await oPage.getByRole("button", { name: "Save", exact: true }).click();
    await oPage.waitForURL((u) => !/\/edit$/.test(new URL(u).pathname), { timeout: 30000 });
    await oPage.waitForTimeout(1500);
    const reAsked = await rows(owner.h, `class_people?class_id=eq.${reconfirm}&user_id=eq.${learner.id}&deleted_at=is.null&select=status`);
    /* 11 Oct 2026, the user's decision 8: re-ask ONLY when the time, the place
       or the pay changes — a price edit is none of those, so the yes stands. */
    check(reAsked.length === 1 && reAsked[0].status === "confirmed", `⚠⚠ …and a PRICE edit on a draft leaves its teacher's yes standing — only time, place or pay re-asks (${reAsked.map((r) => r.status).join(",") || "no live row"})`);

    /* ══ 11 · A TEAM MEMBER MAY BOOK A CLASS AT THEIR OWN STUDIO ══════════════
       ⚠⚠ `showBar = !isMember` gave faculty who wanted to TRAIN where they teach
       a page with nothing to press and no sentence saying why — while the LEARNER
       SHELF has always drawn them a Book button with no membership gate at all,
       so the two surfaces disagreed and the database refused neither
       (`book_class_session` has no membership test).

       What is still refused is a seat on a class you are RUNNING, and these three
       checks are the three people that rule has to tell apart. */
    /* 11 Oct 2026: INVERTED — the people who run a business do not book its
       classes ("You run this class — it is not yours to book", in
       book_class_session and the class_bookings trigger). A manager RUNS the
       business, so they are offered no seat any more; the database refuses too. */
    await mPage.goto(`${BASE}/c/${aheadSlug}`, { waitUntil: "networkidle" });
    check(
      (await mPage.getByRole("button", { name: BOOK_ON_PAGE }).count()) === 0,
      "⚠⚠ a MANAGER runs the studio, so they are NOT offered a seat on its class (11 Oct 2026)"
    );
    let mgrBook = "ACCEPTED";
    try {
      await rpc(manager.h, "book_class_session", { p_session_id: aheadSes });
    } catch (e) {
      mgrBook = e.message;
    }
    check(/not yours to book/.test(mgrBook), `…and the database refuses the manager's booking in words (${mgrBook.slice(0, 90)})`);

    await oPage.goto(`${BASE}/c/${aheadSlug}`, { waitUntil: "networkidle" });
    check(
      (await oPage.getByRole("button", { name: BOOK_ON_PAGE }).count()) === 0,
      "…the OWNER is not: it is their class, and selling somebody their own seat is not a thing to offer"
    );

    /* ⚠ THE CLAUSE THAT IS NOT THE OWNER TEST, ISOLATED. The learner accepted an
       ask to TAKE `second` two segments ago — they are NOT the owner, and
       without the confirmed-classPerson clause they would be offered a ticket to
       the class they are about to teach. (11 Oct 2026: the yes no longer seats
       them `visiting_faculty`; they are on no team, which isolates the clause
       even more cleanly.) */
    const secondSlug = await slugOf(second);
    await lPage.goto(`${BASE}/c/${secondSlug}`, { waitUntil: "networkidle" });
    check(
      (await lPage.getByRole("button", { name: BOOK_ON_PAGE }).count()) === 0,
      "⚠⚠ …and the person TAKING a class is offered no seat on it, though they are a member and not the owner"
    );

    /* ══ 13 · THE CLASSES MADE FINAL (11 Oct 2026, 20261017090000) ═════════════
       Four controls the migration added a database half to, each a thing that is
       drawn or not drawn — so only a browser answers them:
         a. the TEACHER steps down from their own class page, behind a confirm;
         b. a published class whose teacher left says "Waiting for a new teacher"
            on its booking bar instead of offering Book Now (D4), the database
            refusing the press too — and its runners are offered Ask a new teacher;
         c. a DRAFT whose date passed unpublished is a closed card in Past with
            "Pick a new date" and Delete (D3);
         d. a booked card's Add to calendar answers text/calendar (D11). */
    const stepCls = await draftClass(owner.h, studio.id, roomB[0].id, "Kathak", atIst(25, 18), atIst(25, 18) + 60);
    const stepAsk = await rpc(owner.h, "ask_class_person", { p_class_id: stepCls, p_user_id: artist.id, p_kind: "artist" });
    await rpc(artist.h, "respond_to_class_ask", { p_class_person_id: stepAsk.id, p_accept: true });
    await patch(owner.h, `classes?id=eq.${stepCls}`, { status: "published" }, "publish the step-down class");
    const stepSlug = await slugOf(stepCls);
    const stepSes = (await rows(owner.h, `class_sessions?class_id=eq.${stepCls}&select=id`))[0].id;

    // a. the teacher's own page offers Step down, and it lands
    const aCtx = await browser.newContext();
    aCtx.on("weberror", (e) => errs.push(String(e.error())));
    const aPage = await signIn(aCtx, artist.email);
    aPage.on("pageerror", (e) => errs.push(`${aPage.url()} ${e}`));
    await aPage.goto(`${BASE}/c/${stepSlug}`, { waitUntil: "networkidle" });
    const stepBtn = aPage.getByTestId("step-down");
    check((await stepBtn.count()) === 1, "⚠ the confirmed TEACHER is offered Step down on their own class page");
    await stepBtn.click();
    const stepDialog = aPage.getByRole("alertdialog", { name: /Step down from/ });
    await stepDialog.waitFor({ timeout: 10000 }).catch(() => {});
    check(/booking pauses/i.test(await stepDialog.innerText().catch(() => "")), "…behind a confirm that says booking pauses until a new teacher says yes");
    await stepDialog.getByRole("button", { name: "Step down", exact: true }).click().catch((e) => check(false, `could not press Step down — ${e.message}`));
    await aPage.waitForTimeout(2500);
    const stepRow = await rows(H_SERVICE, `class_people?id=eq.${stepAsk.id}&select=status,deleted_at`);
    check(stepRow[0] && stepRow[0].deleted_at !== null && stepRow[0].status === "confirmed", `…and their confirmed row is CLOSED, read back out of the database (${JSON.stringify(stepRow[0] || null)})`);
    const waits = await rpc(owner.h, "class_waits_for_teacher", { p_class_id: stepCls });
    check(waits === true, `…which the database reads as a class waiting for a new teacher (${waits})`);

    // b. the booking bar says so, the database refuses the press, the runner can ask again
    await bPage.goto(`${BASE}/c/${stepSlug}`, { waitUntil: "networkidle" });
    check((await bPage.getByTestId("waiting-for-teacher").count()) === 1 && /Waiting for a new teacher/.test(await bPage.getByTestId("waiting-for-teacher").innerText()), "⚠⚠ the booking bar reads Waiting for a new teacher");
    check((await bPage.getByRole("button", { name: BOOK_ON_PAGE }).count()) === 0, "…with no Book Now to press");
    let waitingBook = "ACCEPTED";
    try {
      await rpc(buyer.h, "book_class_session", { p_session_id: stepSes });
    } catch (e) {
      waitingBook = e.message;
    }
    check(/waiting for a new teacher/i.test(waitingBook), `…and the database refuses the booking in the same words (${waitingBook.slice(0, 90)})`);
    await oPage.goto(`${BASE}/c/${stepSlug}`, { waitUntil: "networkidle" });
    check((await oPage.getByTestId("ask-new-teacher").count()) === 1, "…while the owner is offered Ask a new teacher on the class page");

    // c. a draft whose date passed unpublished is a closed card in Past
    const closedId = await draftClass(owner.h, studio.id, roomA[0].id, "Bollywood", -60 * 24 * 2, -60 * 24 * 2 + 60);
    await oPage.goto(`${BASE}/business/${studio.id}/classes?tab=past`, { waitUntil: "networkidle" });
    const newDate = oPage.locator(`[data-testid="closed-new-date"][href$="/classes/${closedId}/edit"]`);
    check((await newDate.count()) === 1, "⚠⚠ a draft whose date passed is in Past with Pick a new date, opening its edit form");
    const closedCard = oPage.locator('[data-card="session"]').filter({ has: newDate });
    const closedDel = closedCard.getByTestId("closed-delete");
    check((await closedDel.count()) === 1, "…and Delete beside it");
    await closedDel.click().catch((e) => check(false, `could not press Delete — ${e.message}`));
    const delDialog = oPage.getByRole("alertdialog", { name: /^Delete / });
    await delDialog.waitFor({ timeout: 10000 }).catch(() => {});
    await delDialog.getByRole("button", { name: "Delete", exact: true }).click().catch((e) => check(false, `could not confirm the delete — ${e.message}`));
    await oPage.waitForTimeout(2500);
    const closedRow = await rows(H_SERVICE, `classes?id=eq.${closedId}&select=deleted_at`);
    check(closedRow[0] && closedRow[0].deleted_at !== null, "…and one confirmed press deletes it, read back out of the database");

    // d. the booked card's Add to calendar answers a real calendar file
    await lPage.goto(`${BASE}/my-classes?tab=upcoming&role=booked`, { waitUntil: "networkidle" });
    const icsCard = lPage.locator('[data-card="session"]').filter({ has: lPage.locator(`a[href^="/c/${aheadSlug}"]`) });
    const icsLink = icsCard.getByTestId("add-to-calendar");
    check((await icsLink.count()) === 1, "⚠ a booked card carries Add to calendar");
    const icsHref = (await icsLink.getAttribute("href").catch(() => null)) || "";
    check(icsHref === `/c/${aheadSlug}/ics`, `…pointing at the class's own .ics (${icsHref})`);
    const icsRes = await lCtx.request.get(`${BASE}${icsHref}`);
    const icsType = icsRes.headers()["content-type"] || "";
    const icsBody = await icsRes.text();
    check(icsRes.status() === 200 && /text\/calendar/.test(icsType) && /BEGIN:VCALENDAR/.test(icsBody) && /BEGIN:VEVENT/.test(icsBody), `…which answers text/calendar with one event (${icsRes.status()} ${icsType})`);

    check(errs.length === 0, `no page error on any of it${errs.length ? ` — ${errs.slice(0, 3).join(" | ")}` : ""}`);
  } catch (error) {
    check(false, `threw: ${error.message}`);
  } finally {
    /* ⚠ READ THE STATUS OF EVERY CLEANUP WRITE — a delete nobody checks is not
       a cleanup, and this script's leftovers are studios on Discover */
    for (const id of made.businesses) {
      await call("DELETE", `/rest/v1/businesses?id=eq.${id}`, H_SERVICE, undefined, `clean business ${id}`).catch((e) => console.log(`  (business ${id} not deleted: ${e.message})`));
    }
    for (const id of made.users) {
      await call("DELETE", `${SUPABASE}/auth/v1/admin/users/${id}`, H_SERVICE, undefined, `clean user ${id}`).catch((e) => console.log(`  (user ${id} not deleted: ${e.message})`));
    }
    await browser.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
