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

/** a draft class through the one creation door */
const draftClass = async (h, businessId, roomId, style, fromMin, toMin) => {
  const c = await rpc(h, "create_class_with_session", {
    p_business_id: businessId,
    p_title: `${style} · All levels`,
    p_style: style,
    p_level: "all",
    p_room: null,
    p_price_inr: 0,
    p_capacity: 10,
    p_status: "draft",
    p_starts_at: iso(fromMin),
    p_ends_at: iso(toMin),
    p_room_id: roomId,
    p_poster: null,
    p_venue_business_id: null,
    p_lat: null,
    p_lng: null,
    p_maps_url: null,
  });
  return c.id;
};

const text = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");

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
    check((await lPage.getByRole("button", { name: "Book a spot" }).count()) === 0, "…with no Book button left to press");

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
