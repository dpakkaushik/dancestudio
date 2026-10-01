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
 *   1. A MANAGER may open the register (R55) and is offered NONE of the three
 *      controls RLS refuses them — Edit, Publish, Delete — and reads why.
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

const iso = (minutes) => new Date(Date.now() + minutes * 60000).toISOString();

/** a draft class through the one creation door.
 *  ⚠ A CLASS IN THE PAST IS PLANTED THE SEEDER'S WAY (30 Sep 2026): created
 *  AHEAD as the owner, then its session back-dated by the SERVICE ROLE. The
 *  database refuses a past start from anybody else (`class_sessions_start_ahead`,
 *  20260930130000 — the form's own 28 Sep rule, kept by the row), and this
 *  script used to ask the RPC for `-180` minutes directly, which is exactly the
 *  door that migration closes. */
const draftClass = async (h, businessId, roomId, style, fromMin, toMin) => {
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
const BOOK_ON_PAGE = /^Book (free trial|this class)$/;

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
    const ahead = await draftClass(owner.h, studio.id, roomA[0].id, "Hip-Hop", 60 * 24 * 5, 60 * 24 * 5 + 60);
    const ran = await draftClass(owner.h, studio.id, roomB[0].id, "Kathak", -180, -120);
    const live = await draftClass(owner.h, studio.id, roomB[0].id, "Salsa", -10, 50);
    for (const id of [ahead, ran, live]) {
      /* the owner takes their own class — confirmed at birth (26 Sep 2026) */
      await rpc(owner.h, "ask_class_person", { p_class_id: id, p_user_id: owner.id, p_kind: "artist" });
      await patch(owner.h, `classes?id=eq.${id}`, { status: "published" }, `publish ${id}`);
    }
    /* a draft whose teacher has been ASKED and not answered */
    const asked = await draftClass(owner.h, studio.id, roomA[0].id, "Bhangra", 60 * 24 * 9, 60 * 24 * 9 + 60);
    await rpc(owner.h, "ask_class_person", { p_class_id: asked, p_user_id: artist.id, p_kind: "artist" });

    /* the learner takes a seat on the class that is AHEAD */
    const aheadSes = (await rows(owner.h, `class_sessions?class_id=eq.${ahead}&select=id`))[0].id;
    await rpc(learner.h, "book_class_session", { p_session_id: aheadSes });

    /* ══ 1 · THE MANAGER'S REGISTER ═══════════════════════════════════════════ */
    const mCtx = await browser.newContext();
    mCtx.on("weberror", (e) => errs.push(String(e.error())));
    const mPage = await signIn(mCtx, manager.email);
    mPage.on("pageerror", (e) => errs.push(String(e)));
    await mPage.goto(`${BASE}/business/${studio.id}/classes`, { waitUntil: "networkidle" });
    check(/\/classes$/.test(new URL(mPage.url()).pathname), "a MANAGER reaches the classes register — R55 let them in on 28 Sep");

    const mBody = await text(mPage);
    check(/Only the owner of this studio creates and changes its classes/.test(mBody), "…and reads, once, what is and is not theirs here");
    check((await mPage.getByRole("link", { name: "Roster", exact: true }).count()) > 0, "…and Roster stays: seeing who booked IS a manager's job");
    check((await mPage.getByRole("button", { name: "Delete", exact: true }).count()) === 0, "⚠⚠ no Delete on a published row — the one that reported SUCCESS and deleted nothing");

    /* ⚠ THE DRAFT TAB IS WHERE Edit AND Publish LIVE, so asserting their absence
       on the Published tab proves nothing — "not drawn" and "not on this tab"
       look identical from outside (the 28 Sep lesson about an absent control). */
    await mPage.getByRole("button", { name: /^Draft,/ }).click();
    await mPage.waitForTimeout(400);
    check((await mPage.getByRole("link", { name: "Edit", exact: true }).count()) === 0, "⚠⚠ no Edit on a DRAFT either — the edit page redirects a manager away without a word");
    /* ⚠ `/^Publish/` ALSO MATCHES THE "Published, 2 classes" TAB PILL — which
       made this read 1 for the manager and, worse, made the owner's own version
       below pass for the WRONG REASON. A check that can pass for the wrong
       reason is not a check (11 Sep 2026). The control's accessible name is
       "Publish", or "Publish — {the blocker}" when it cannot go yet. */
    check((await mPage.getByRole("button", { name: /^Publish($| —)/ }).count()) === 0, "⚠⚠ no Publish — RLS answers it *Class not found or not yours to change*");
    check((await mPage.getByRole("button", { name: "Delete", exact: true }).count()) === 0, "⚠⚠ …and no Delete here either");
    check(/Bhangra/.test(await text(mPage)), "…while the draft itself is right there to read — the desk is not hidden, only its writes");

    /* ══ 2 · THE COMPLETED TAB FILLS OFF THE CLOCK ════════════════════════════ */
    const oCtx = await browser.newContext();
    oCtx.on("weberror", (e) => errs.push(String(e.error())));
    const oPage = await signIn(oCtx, owner.email);
    oPage.on("pageerror", (e) => errs.push(String(e)));
    await oPage.goto(`${BASE}/business/${studio.id}/classes`, { waitUntil: "networkidle" });

    await oPage.getByRole("button", { name: /^Draft,/ }).click();
    await oPage.waitForTimeout(400);
    check((await oPage.getByRole("link", { name: "Edit", exact: true }).count()) > 0, "the OWNER is offered Edit on the same draft — the gate is the SEAT, not the screen");
    check((await oPage.getByRole("button", { name: /^Publish($| —)/ }).count()) > 0, "…and Publish");
    check((await oPage.getByRole("button", { name: "Delete", exact: true }).count()) > 0, "…and Delete");

    const completedPill = oPage.getByRole("button", { name: /^Completed,/ });
    check(/Completed, 1 classes/.test(await completedPill.getAttribute("aria-label")), `⚠⚠ the Completed tab counts the class that has RUN — nothing ever writes 'completed' (read "${await completedPill.getAttribute("aria-label")}")`);
    const publishedPill = oPage.getByRole("button", { name: /^Published,/ });
    check(/Published, 2 classes/.test(await publishedPill.getAttribute("aria-label")), `…and it is OFF Published, which held it for ever before (read "${await publishedPill.getAttribute("aria-label")}")`);

    await completedPill.click();
    await oPage.waitForTimeout(400);
    const doneBody = await text(oPage);
    check(/Kathak/.test(doneBody), "…and the class that ran is actually listed there");

    /* ══ 3 · A ROOM REQUEST, ANSWERED FROM THE CLASSES DESK ═══════════════════ */
    check((await oPage.getByRole("button", { name: /^Requests,/ }).count()) === 0, "⚠ with nothing asked, there is NO Requests tab — a door onto an empty room is worse than no door");

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
      await oPage.reload({ waitUntil: "networkidle" });
      const reqPill = oPage.getByRole("button", { name: /^Requests,/ });
      check((await reqPill.count()) === 1, "⚠⚠ an artist asks for one of this studio's rooms and it appears ON THE CLASSES DESK — it had no home here at all");
      await reqPill.click();
      await oPage.waitForTimeout(400);
      const reqBody = await text(oPage);
      check(new RegExp(`Cls Asker ${stamp}`).test(reqBody) && /wants Room A/.test(reqBody), "…naming who wants which room, on the app's own class card");
      await oPage.getByRole("button", { name: "Accept the room" }).first().click();
      await oPage.waitForTimeout(2000);
      const vs = (await rows(owner.h, `classes?id=eq.${venueClassId}&select=venue_status`))[0];
      check(vs.venue_status === "accepted", `…and one press holds the room, read back out of the database (venue_status "${vs.venue_status}")`);
    } else {
      check(false, "could not plant a venue request (artist page or class refused)");
    }

    /* ══ 4 · AN ASK CAN BE TAKEN BACK FROM THE ROW THAT NAMES IT ══════════════ */
    await oPage.goto(`${BASE}/business/${studio.id}/classes`, { waitUntil: "networkidle" });
    await oPage.getByRole("button", { name: /^Draft,/ }).click();
    await oPage.waitForTimeout(400);
    const draftBody = await text(oPage);
    check(new RegExp(`${artist.name} ASKED`, "i").test(draftBody.replace(/⏳ ?/g, "")), "a draft says who it is waiting on");
    const withdraw = oPage.getByRole("button", { name: "Withdraw ask" });
    check((await withdraw.count()) === 1, "⚠ …and now offers to stop waiting, which only the Inbox could do before");
    await withdraw.click();
    await oPage.waitForTimeout(2000);
    const stillAsked = await rows(owner.h, `class_people?class_id=eq.${asked}&deleted_at=is.null&select=id`);
    check(stillAsked.length === 0, `…and the ask is gone from the database (${stillAsked.length} live rows)`);

    /* ══ 5 · THE LEARNER SHELF TELLS THE TRUTH ABOUT TIME ═════════════════════ */
    const lCtx = await browser.newContext();
    lCtx.on("weberror", (e) => errs.push(String(e.error())));
    const lPage = await signIn(lCtx, learner.email);
    lPage.on("pageerror", (e) => errs.push(String(e)));
    /* ⚠ EVERY SHELF ASSERTION IS SCOPED TO THE CLASS'S OWN LINK, never to its
       style word. `/classes` lists the whole city and production carries a demo
       world with a Kathak class in it — matching on "Kathak" made a check that
       passed or failed on somebody else's data, which is a check that measures
       nothing. `a[href^="/c/{slug}"]` is this class and no other. */
    const slugOf = async (id) => (await rows(owner.h, `classes?id=eq.${id}&select=share_slug`))[0].share_slug;
    const [aheadSlug, ranSlug, liveSlug] = await Promise.all([slugOf(ahead), slugOf(ran), slugOf(live)]);
    const onShelf = async (page, slug) => (await page.locator(`a[href^="/c/${slug}"]`).count()) > 0;

    await lPage.goto(`${BASE}/classes`, { waitUntil: "networkidle" });
    check(await onShelf(lPage, aheadSlug), "the class that is AHEAD is on the Upcoming shelf");
    check(!(await onShelf(lPage, ranSlug)), "⚠⚠ the class that already RAN is not — it was listed under *Upcoming classes* with a Book button that always failed");
    check(!(await onShelf(lPage, liveSlug)), "⚠ nor is the one running right now: it cannot be booked either, so a shelf whose job is *what can I book* has no business drawing it");

    await lPage.goto(`${BASE}/c/${liveSlug}`, { waitUntil: "networkidle" });
    check((await lPage.getByTestId("class-already-started").count()) === 1, "⚠⚠ …and its own page SAYS it has started rather than offering a press the database refuses");
    /* ⚠⚠ THIS ASKED FOR "Book a spot" UNTIL 30 Sep 2026 AND PASSED VACUOUSLY.
       That is the SHELF's label (`EnrollButton`); the class page's own control
       reads "Book free trial" on a free class and "Book this class" on a priced
       one, so the count was 0 whether or not a bar was drawn. A check that can
       pass for the wrong reason is not a check (11 Sep 2026). */
    check((await lPage.getByRole("button", { name: BOOK_ON_PAGE }).count()) === 0, "…with no Book button left to press");

    /* ══ 6 · A LEARNER'S SEAT IS NOT THE OWNER'S ══════════════════════════════ */
    await lPage.goto(`${BASE}/classes`, { waitUntil: "networkidle" });
    check(/Enrolled ✓/.test(await text(lPage)), "the learner who booked reads Enrolled ✓ on their own seat");

    await oPage.goto(`${BASE}/classes`, { waitUntil: "networkidle" });
    check(await onShelf(oPage, aheadSlug), "the owner sees their own studio's class on the shelf");
    check(!/Enrolled ✓/.test(await text(oPage)), "⚠⚠ …and is NOT told they are enrolled on it — a learner's seat, read through the roster policy, was being drawn as the viewer's own");
    check((await oPage.getByRole("button", { name: "Cancel booking" }).count()) === 0, "…and is offered no Cancel aimed at somebody else's booking");

    /* ══ 7 · THE PERSON ASKED ANSWERS IT WHERE THE CLASS IS ═══════════════════ */
    const second = await draftClass(owner.h, studio.id, roomA[0].id, "Contemporary", 60 * 24 * 15, 60 * 24 * 15 + 60);
    await rpc(owner.h, "ask_class_person", { p_class_id: second, p_user_id: learner.id, p_kind: "artist" });
    await lPage.goto(`${BASE}/my-classes?show=manage`, { waitUntil: "networkidle" });
    const myBody = await text(lPage);
    check(/ASKED TO TAKE/.test(myBody), "⚠⚠ somebody asked to TAKE a class finds it in the Classes section — they own no page, so Manage was not even drawn for them");
    check(!/you say yes in your Inbox/.test(myBody), "⚠ …and nothing still sends them to the Inbox for something this screen does");
    await lPage.getByRole("button", { name: "Accept", exact: true }).first().click();
    await lPage.waitForTimeout(2500);
    const seated = await rows(owner.h, `class_people?class_id=eq.${second}&status=eq.confirmed&deleted_at=is.null&select=user_id`);
    check(seated.length === 1 && seated[0].user_id === learner.id, "…one press and they are on it, read back out of the database");

    /* ══ 7b · A CLASS TAKEN ELSEWHERE IS FILED IN ITS OWN COLUMN (1 Oct 2026) ══
       It was one block under the register, so every tab ended on the same list.
       The class just accepted is a DRAFT at somebody else's studio: it belongs
       under Draft and nowhere else. */
    const [secondRow] = await rows(owner.h, `classes?id=eq.${second}&select=share_slug`);
    await lPage.goto(`${BASE}/my-classes?show=manage`, { waitUntil: "networkidle" });
    const draftPill = lPage.getByRole("button", { name: /^Draft, \d+ classes$/ });
    const pubPill = lPage.getByRole("button", { name: /^Published, \d+ classes$/ });
    check((await draftPill.count()) === 1 && (await pubPill.count()) === 1, "⚠⚠ somebody with NO page of their own now gets the register's columns over the classes they take");
    check((await lPage.getByRole("button", { name: "Create class" }).count()) === 0 && (await lPage.getByTestId("why-no-class").count()) === 0, "…with no Create control, and no owner-only sentence about a studio they do not run");
    const elsewhereHas = async () => (await lPage.locator(`[data-testid="classes-elsewhere"] a[href="/c/${secondRow.share_slug}"]`).count()) > 0;
    check(!(await elsewhereHas()), "⚠⚠ the DRAFT they take elsewhere is NOT at the foot of Published");
    await draftPill.click();
    await lPage.waitForTimeout(400);
    check(await elsewhereHas(), "…it is under Draft, where it belongs");
    check(/Draft, 1 classes/.test((await draftPill.getAttribute("aria-label")) || ""), "…and the Draft pill counts it");
    await lPage.getByRole("button", { name: /^Completed, \d+ classes$/ }).click();
    await lPage.waitForTimeout(400);
    check(!(await elsewhereHas()), "…and it is not under Completed either");

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

    await oPage.goto(`${BASE}/business/${studio.id}/classes`, { waitUntil: "networkidle" });
    await oPage.getByRole("button", { name: /^Published,/ }).click();
    await oPage.waitForTimeout(400);
    /* ⚠ THE ROW IS THE CONTAINER THAT HOLDS BOTH THE TITLE AND THE BUTTON.
       Filtering on the text alone matches an inner box that holds no button
       (and an outer one that holds every row's), so it is narrowed by BOTH and
       `.last()` takes the deepest — document order puts an ancestor first. */
    const row = oPage
      .locator("div")
      .filter({ hasText: "Contemporary" })
      .filter({ has: oPage.getByRole("button", { name: "Delete", exact: true }) })
      .last();
    await row.getByRole("button", { name: "Delete", exact: true }).click();
    await oPage.waitForTimeout(400);

    const sheet = await text(oPage);
    check(/1 enrolled student must be refunded/.test(sheet), "⚠ the sheet still makes the promise it has made since 29 Aug 2026");
    const go = oPage.getByRole("button", { name: "Delete & manage refunds", exact: true });
    check((await go.count()) === 1, "…and the button still names the refunds");
    await go.click();

    /* the desk the sheet sends them to — where there was never anything to settle */
    await oPage.waitForURL(/\/earnings$/, { timeout: 30000 });
    check(/\/earnings$/.test(new URL(oPage.url()).pathname), "…and it lands on the money desk, as it always said it would");

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
    check(after[0]?.status === "pending", "…AUTOMATIC, not 'requested': the 48-hour rule is about a learner cancelling late, not a class the studio called off");
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
    await rpc(owner.h, "ask_class_person", { p_class_id: passCls, p_user_id: owner.id, p_kind: "artist" });
    await patch(owner.h, `classes?id=eq.${passCls}`, { status: "published" }, "publish the pass class");
    const passSes = (await rows(owner.h, `class_sessions?class_id=eq.${passCls}&select=id`))[0].id;
    const mem = await rpc(owner.h, "save_membership", { p_membership_id: null, p_business_id: studio.id, p_name: `Shoot Pass ${stamp}`, p_unit: "classes", p_units: 2, p_price_inr: 0, p_total_count: 5, p_status: "live" });
    /* ⚠ A FRESH BUYER, not the learner: accepting a class in segment 7 seated the
       learner `visiting_faculty` (R19), and the database rightly refuses a member
       of the seller's team a membership — "a membership is for the people who
       come to dance". The first run of this segment was that refusal. */
    const buyer = await account(`shot.cls.buy.${stamp}@example.com`, `Cls Buyer ${stamp}`, "Pune");
    made.users.push(buyer.id);
    const passRow = await rpc(buyer.h, "buy_membership", { p_membership_id: mem.id });
    await rpc(buyer.h, "book_with_membership", { p_session_id: passSes, p_pass_id: passRow.id });

    const bCtx = await browser.newContext();
    const bPage = await signIn(bCtx, buyer.email);
    bPage.on("pageerror", (e) => errs.push(String(e)));
    await bPage.goto(`${BASE}/memberships`, { waitUntil: "networkidle" });
    const myPass = bPage.getByTestId("my-pass").filter({ hasText: `Shoot Pass ${stamp}` });
    check((await myPass.getByTestId("spent-on").count()) === 1, "the holder's own pass card carries SPENT ON under its bar");
    check(/Bharatanatyam/.test(await myPass.innerText()), "…naming the class the unit went on");
    check((await myPass.getByTestId("pass-progress").getAttribute("aria-label")) === "1 of 2 used", "…and the bar agrees with the list — one number (Step 25)");

    await oPage.goto(`${BASE}/memberships/${mem.id}`, { waitUntil: "networkidle" });
    const holder = oPage.getByTestId("membership-holder");
    check((await holder.count()) === 1 && (await holder.getByTestId("spent-on").count()) === 1, "⚠ the seller's usage page says which class THIS holder spent theirs on — the cross of its two lists");
    check(/1 class still owed to the people holding one/.test(await text(oPage)), "…and says what is still OWED: one class sold and not yet danced");

    /* ══ 10 · EDITING A CLASS IS ONE ACT (#0b4) ═══════════════════════════════
       ⚠⚠ NOTHING HAD EVER DRIVEN THIS FORM. The register's Edit LINK is checked
       above (drawn for the owner, absent for a manager) and no test has ever
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
    await oPage.getByRole("button", { name: "Continue" }).click();
    await oPage.waitForTimeout(400);
    await oPage.getByLabel("Price per session").fill("450");
    await oPage.getByRole("button", { name: "Save changes" }).click();
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

    /* ══ 11 · A TEAM MEMBER MAY BOOK A CLASS AT THEIR OWN STUDIO ══════════════
       ⚠⚠ `showBar = !isMember` gave faculty who wanted to TRAIN where they teach
       a page with nothing to press and no sentence saying why — while the LEARNER
       SHELF has always drawn them a Book button with no membership gate at all,
       so the two surfaces disagreed and the database refused neither
       (`book_class_session` has no membership test).

       What is still refused is a seat on a class you are RUNNING, and these three
       checks are the three people that rule has to tell apart. */
    await mPage.goto(`${BASE}/c/${aheadSlug}`, { waitUntil: "networkidle" });
    check(
      (await mPage.getByRole("button", { name: BOOK_ON_PAGE }).count()) > 0,
      "⚠⚠ a MANAGER — on the team, not the owner, not on this class — is offered a seat at their own studio"
    );

    await oPage.goto(`${BASE}/c/${aheadSlug}`, { waitUntil: "networkidle" });
    check(
      (await oPage.getByRole("button", { name: BOOK_ON_PAGE }).count()) === 0,
      "…the OWNER is not: it is their class, and selling somebody their own seat is not a thing to offer"
    );

    /* ⚠ THE CLAUSE THAT IS NOT THE OWNER TEST, ISOLATED. The learner accepted an
       ask to TAKE `second` two segments ago, which seats them `visiting_faculty`
       (R19) — so they are a member, they are NOT the owner, and without the
       confirmed-classPerson clause this change would have offered the teacher a
       ticket to the class they are about to teach. */
    const secondSlug = await slugOf(second);
    await lPage.goto(`${BASE}/c/${secondSlug}`, { waitUntil: "networkidle" });
    check(
      (await lPage.getByRole("button", { name: BOOK_ON_PAGE }).count()) === 0,
      "⚠⚠ …and the person TAKING a class is offered no seat on it, though they are a member and not the owner"
    );

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
