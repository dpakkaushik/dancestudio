/* THE INBOX HOLDS EACH PROFILE'S ENQUIRIES, AND DISCOVER LOOKS EVERYWHERE
   (2 Oct 2026). The user, in a run of messages: "shift back enquiries to inbox
   from home tools for all profiles", "lost enquiries also in done section",
   "done should be called completed and should be section with received and sent",
   "should remove your own photo from the enquiry cards", "better cards for
   invites", and "location drop down on discover should also have option to view
   for all cities together called all".

   A real studio, a real sender, two real enquiries (one open, one LOST) and a
   real team invite, driven from both ends in a browser — and Discover's All
   cities read signed out. Everything it makes it deletes, reading the status.

   ⚠⚠ RE-CUT 11 Oct 2026 — THE INBOX IS ENQUIRIES ONLY (the user: "only
   enquiries to be handled from inbox and rest all from their respective home
   tile section how we did for classes"). Its Requests and Invites columns are
   gone; what is left of them is one POINTER LINE each, drawn only while
   something waits: class requests → Classes' To do, team invites → the Studios
   hub's Team column, crew invites → the Crews hub's Member column. So this
   script now asserts the shape (enquiries' three sides, no columns, the
   pointers and where they go, an old ?show=invites landing on Enquiries) and
   then answers a team invite and a crew ask ON THE HUBS — Join, and Decline
   behind its question.

   Run:  $env:DANCEOS_BASE_URL="http://localhost:3100"; $env:NODE_PATH="$pwd\node_modules"; node scripts/shots/shoot-inbox.js  */
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
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const UA = "danceos-proof";
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation", "User-Agent": UA };

let ok = 0, bad = 0;
const check = (c, m) => { console.log((c ? "  ok   " : "  FAIL ") + m); c ? ok++ : bad++; };

async function call(method, url, headers, body) {
  const r = await fetch(url.startsWith("http") ? url : `${SUPA}${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${url} -> ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

async function makeAccount(stamp, who, fullName) {
  const email = `inbox.${who}.${stamp}@example.com`;
  const password = `Inbox!${stamp}aA1`;
  const made = await call("POST", "/auth/v1/admin/users", svc, { email, password, email_confirm: true });
  await call("POST", "/rest/v1/profiles", svc, { id: made.id, full_name: fullName, role: "user", city: "Pune", styles: ["Hip-Hop"], created_by: made.id, updated_by: made.id });
  const token = await call("POST", "/auth/v1/token?grant_type=password", { apikey: ANON, "Content-Type": "application/json", "User-Agent": UA }, { email, password });
  return { id: made.id, email, password, name: fullName, h: { apikey: ANON, Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json", "User-Agent": UA } };
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

const pressed = async (loc) => (await loc.getAttribute("aria-pressed").catch(() => null)) === "true";

(async () => {
  const stamp = Date.now().toString(36);
  const made = { users: [], businesses: [], enquiries: [], crews: [] };
  const browser = await chromium.launch();
  try {
    const owner = await makeAccount(stamp, "owner", `Kappa Owner ${stamp}`);
    made.users.push(owner.id);
    const sender = await makeAccount(stamp, "sender", `Zed Quill ${stamp}`);
    made.users.push(sender.id);
    const studio = await call("POST", "/rest/v1/rpc/create_business_with_owner", owner.h, { p_type: "studio", p_name: `Kappa Hall ${stamp}`, p_area: "Kothrud", p_city: "Pune", p_styles: ["Hip-Hop"] });
    made.businesses.push(studio.id);
    /* ⚠ LISTED, because an enquiry can only ever go to a listed studio — born
       unlisted, the sender may not read its name and every card says "A
       business" (the first run's three reds). The service role stands in for the
       admin's grant, the way shoot-classes does. */
    await call("POST", "/rest/v1/subscriptions", svc, {
      kind: "studio", user_id: owner.id, business_id: studio.id, plan_key: "studio_monthly",
      price_inr: 0, period: "monthly", status: "active",
      current_period_start: new Date().toISOString().slice(0, 10),
      current_period_end: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
      granted: true, note: "Granted by a shoot script — nothing charged", created_by: owner.id, updated_by: owner.id,
    });
    await call("PATCH", `/rest/v1/businesses?id=eq.${studio.id}`, svc, { verified_at: new Date().toISOString(), visibility: "listed" });

    /* two enquiries from the sender, planted with the service role (the studio is
       born unlisted, so `send_enquiry` would rightly refuse) — one open, one
       DECLINED (3 Oct 2026: the business declines with a reason; "lost" is gone) */
    const base = { business_id: studio.id, from_user_id: sender.id, type_key: "choreographer", fields: [["What for", "Classes"]], dates: ["2026-11-01"], message: "Probe enquiry", created_by: sender.id, updated_by: sender.id };
    const [open] = await call("POST", "/rest/v1/enquiries", svc, { ...base, status: "new" });
    const [lost] = await call("POST", "/rest/v1/enquiries", svc, { ...base, fields: [["What for", "Event"]], status: "declined", close_reason: "Booked that weekend", closed_at: new Date().toISOString(), closed_by: owner.id });
    made.enquiries.push(open.id, lost.id);

    /* a team invite for the sender, through the owner's own door */
    await call("POST", "/rest/v1/rpc/invite_person_to_business", owner.h, { p_business_id: studio.id, p_user_id: sender.id, p_role: "trainer" });
    /* ⚠ and a SECOND invite the sender DECLINES, from a second studio — the
       owner's Sent side must keep it, under Invites › Completed (2 Oct 2026: a
       sent invite was a pending-only read, so an answered one vanished) */
    const studio2 = await call("POST", "/rest/v1/rpc/create_business_with_owner", owner.h, { p_type: "studio", p_name: `Lambda Hall ${stamp}`, p_area: "Baner", p_city: "Pune", p_styles: ["Hip-Hop"] });
    made.businesses.push(studio2.id);
    const inv2 = await call("POST", "/rest/v1/rpc/invite_person_to_business", owner.h, { p_business_id: studio2.id, p_user_id: sender.id, p_role: "staff" });
    await call("POST", "/rest/v1/rpc/decline_business_invite", sender.h, { p_code: inv2.code });
    /* ⚠ and a crew ask the leader WITHDRAWS — a soft delete, so it waits on
       nobody: no pointer counts it and no hub card offers it */
    const crew = await call("POST", "/rest/v1/rpc/create_crew", owner.h, { p_name: `Mu Crew ${stamp}`, p_city: "Pune", p_style: "Hip-Hop", p_member_ids: [sender.id] });
    made.crews.push(crew.id);
    const [ask] = await call("GET", `/rest/v1/crew_members?crew_id=eq.${crew.id}&user_id=eq.${sender.id}&select=id`, svc);
    await call("POST", "/rest/v1/rpc/withdraw_crew_ask", owner.h, { p_member_id: ask.id });
    /* …and a crew ask that STILL WAITS — the one the Crews hub answers (11 Oct 2026) */
    const crew2 = await call("POST", "/rest/v1/rpc/create_crew", owner.h, { p_name: `Nu Crew ${stamp}`, p_city: "Pune", p_style: "Hip-Hop", p_member_ids: [sender.id] });
    made.crews.push(crew2.id);

    /* ── THE SENDER'S OWN INBOX ── */
    const sp = await (await browser.newContext({ viewport: { width: 430, height: 932 } })).newPage();
    await signIn(sp, sender);
    await sp.goto(`${BASE}/inbox`, { waitUntil: "networkidle" });
    /* ⚠⚠ ENQUIRIES ONLY (11 Oct 2026): no Requests and no Invites column — the
       three sides are the enquiries' own, in the top squircle */
    check((await sp.getByRole("button", { name: /^(Enquiries|Requests|Invites) — / }).count()) === 0, "sender inbox: no columns any more — the Inbox is enquiries only");
    const sides = ["Received", "Sent", "Completed"].map((s) => sp.getByRole("button", { name: `${s} enquiries`, exact: true }));
    check((await Promise.all(sides.map((l) => l.count()))).every((n) => n === 1), "sender inbox: Received · Sent · Completed enquiries");
    check(await pressed(sides[0]), "sender inbox: it opens on Received");
    for (const noun of ["requests", "invitations"]) {
      check((await sp.getByRole("button", { name: `Received ${noun}`, exact: true }).count()) === 0, `sender inbox: no "${noun}" sides left`);
    }
    /* THE POINTERS — one line each, only while something waits there */
    const teamPtr = sp.getByTestId("team-invites-pointer");
    check((await teamPtr.count()) === 1 && /1 team invite\b/.test(await teamPtr.innerText().catch(() => "")), `team-invites pointer counts the one invite still waiting (${(await teamPtr.innerText().catch(() => "missing")).replace(/\s+/g, " ")})`);
    check((await teamPtr.getAttribute("href").catch(() => null)) === "/business?show=team", "…and opens the Studios hub's Team column");
    const crewPtr = sp.getByTestId("crew-invites-pointer");
    check((await crewPtr.count()) === 1 && /1 crew invite\b/.test(await crewPtr.innerText().catch(() => "")), "crew-invites pointer counts the live ask, and not the withdrawn one");
    check((await crewPtr.getAttribute("href").catch(() => null)) === "/crews?show=in", "…and opens the Crews hub's Member column");
    check((await sp.getByTestId("class-requests-pointer").count()) === 0, "no class-requests pointer while no class ask waits (drawn only when n > 0)");
    check(/2 waiting on you/.test(await sp.getByTestId("inbox-sub").innerText().catch(() => "")), "the head counts what the pointers count");
    /* ⚠ an old address still lands — on Enquiries (Rule 14) */
    for (const old of ["invites", "requests"]) {
      await sp.goto(`${BASE}/inbox?show=${old}`, { waitUntil: "networkidle" });
      check((await sp.getByRole("button", { name: "Received enquiries", exact: true }).count()) === 1 && /\/inbox\?show=/.test(sp.url()), `?show=${old} lands on the Inbox's Enquiries`);
    }

    /* ── THE TEAM INVITE IS ANSWERED ON THE STUDIOS HUB ── */
    await sp.goto(`${BASE}/business`, { waitUntil: "networkidle" });
    check((await sp.getByTestId("team-invites").count()) === 1, "the Studios hub OPENS on Team while an invitation waits, with the invitations block");
    const inv = sp.getByTestId("team-invite").filter({ hasText: `Kappa Hall ${stamp}` });
    const invText = await inv.first().innerText().catch(() => "");
    check(/Faculty/i.test(invText), `invite card: the seat reads "Faculty" (${invText.replace(/\s+/g, " ").slice(0, 120)})`);
    check(!/trainer/i.test(invText), "invite card: the column's word \"trainer\" is not printed");
    check((await sp.getByTestId("team-invite").filter({ hasText: `Lambda Hall ${stamp}` }).count()) === 0, "the DECLINED invite is not offered again");
    check((await sp.getByTestId("studios-settings").count()) === 1, "the team-invite switch is behind the hub's gear");
    await inv.getByTestId("team-invite-join").click();
    await sp.getByTestId("team-invite").filter({ hasText: `Kappa Hall ${stamp}` }).waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    check((await sp.getByTestId("team-invite").filter({ hasText: `Kappa Hall ${stamp}` }).count()) === 0, "Join: the invitation leaves the hub");
    await sp.getByRole("link", { name: `Kappa Hall ${stamp} — open the profile` }).first().waitFor({ timeout: 15000 }).catch(() => {});
    check(/[?&]show=team\b/.test(sp.url()), `…the address stays on the Team column (${sp.url()})`);
    check((await sp.getByRole("link", { name: `Kappa Hall ${stamp} — open the profile` }).count()) >= 1, "…and the studio is in the Team column");

    /* ── THE CREW ASK IS ANSWERED ON THE CREWS HUB — and a no asks first ── */
    await sp.goto(`${BASE}/crews`, { waitUntil: "networkidle" });
    const cInv = sp.getByTestId("crew-invite").filter({ hasText: `Nu Crew ${stamp}` });
    check((await cInv.count()) === 1, "the Crews hub OPENS on Member while an ask waits, with the ask's card");
    check((await sp.getByTestId("crew-invite").filter({ hasText: `Mu Crew ${stamp}` }).count()) === 0, "the WITHDRAWN ask is not offered");
    check(/invited by/i.test(await cInv.first().innerText().catch(() => "")), "the card says who asked");
    check((await sp.getByTestId("crews-settings").count()) === 1, "the crew-invite switch is behind the hub's gear");
    await cInv.getByTestId("crew-invite-decline").click();
    const q = sp.getByRole("alertdialog", { name: `Decline Nu Crew ${stamp}?` });
    check(await q.isVisible().catch(() => false), "Decline asks first");
    await q.getByRole("button", { name: "Keep it", exact: true }).click();
    check((await cInv.count()) === 1, "Keep it keeps the ask");
    await cInv.getByTestId("crew-invite-decline").click();
    await q.getByRole("button", { name: "Decline", exact: true }).click();
    await cInv.first().waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    check((await sp.getByTestId("crew-invite").filter({ hasText: `Nu Crew ${stamp}` }).count()) === 0, "Decline: the ask leaves the hub");
    const [ans] = await call("GET", `/rest/v1/crew_members?crew_id=eq.${crew2.id}&user_id=eq.${sender.id}&select=status`, svc);
    check(ans && ans.status === "rejected", `…and the database says rejected (${ans ? ans.status : "no row"})`);

    /* and with nothing left waiting, the pointers are gone */
    await sp.goto(`${BASE}/inbox`, { waitUntil: "networkidle" });
    check((await sp.getByTestId("team-invites-pointer").count()) === 0 && (await sp.getByTestId("crew-invites-pointer").count()) === 0, "nothing waits: neither pointer is drawn");

    await sp.goto(`${BASE}/inbox?show=enquiries`, { waitUntil: "networkidle" });
    check(await pressed(sp.getByRole("button", { name: "Received enquiries", exact: true })), "?show=enquiries opens on Received enquiries");
    await sp.getByRole("button", { name: "Sent enquiries" }).click();
    const sentCard = sp.getByRole("link", { name: `Choreographer enquiry to Kappa Hall ${stamp}` });
    check((await sentCard.count()) === 1, "sender: the OPEN enquiry is on the Sent side, and only it (the declined one is not on the live desk)");
    const sentText = await sentCard.first().innerText().catch(() => "");
    check(/\bKH\b/.test(sentText) && !/\bZQ\b/.test(sentText), `enquiry card: the studio's face, not your own (${/\bKH\b/.test(sentText) ? "KH" : "-"} / ${/\bZQ\b/.test(sentText) ? "ZQ shown" : "no ZQ"})`);

    await sp.getByRole("button", { name: "Completed enquiries", exact: true }).click();
    check((await sp.getByRole("link", { name: `Choreographer enquiry to Kappa Hall ${stamp}` }).count()) === 1, "Enquiries › Completed: the DECLINED enquiry is here");

    /* ── THE STUDIO'S INBOX ── */
    const op = await (await browser.newContext({ viewport: { width: 430, height: 932 } })).newPage();
    await signIn(op, owner);
    await op.goto(`${BASE}/enquiries?as=${studio.id}`, { waitUntil: "networkidle" });
    check(new RegExp(`/business/${studio.id}/inbox\\?show=enquiries$`).test(op.url()), `the old ?as= address lands on the studio's Inbox (${op.url().replace(BASE, "")})`);
    const recvCard = op.getByRole("link", { name: `Choreographer enquiry from Zed Quill ${stamp}` });
    check((await recvCard.count()) === 1, "studio inbox: the open enquiry is on its Enquiries desk");
    const recvText = await recvCard.first().innerText().catch(() => "");
    check(/\bZQ\b/.test(recvText) && !/\bKH\b/.test(recvText), "studio's card: the sender's face, not the studio's own");
    check((await op.getByRole("button", { name: /^Enquiry settings/ }).count()) === 1, "studio inbox: the studio's Enquiry settings moved with the desk");
    check((await op.getByRole("button", { name: "Sent enquiries" }).count()) === 0, "studio inbox: no Sent enquiries side — a studio sends none");
    check((await op.getByRole("button", { name: /^(Requests|Invites) — / }).count()) === 0 && (await op.getByTestId("class-requests-pointer").count()) === 0, "studio inbox: enquiries only, and no room-request pointer while no room is asked for (11 Oct 2026)");
    /* ⚠ THREE SHAPES (3 Oct 2026, the user: "Received, sent, completed part of
       upper half. everything below this and above search enquiries is the middle
       half … search enquiries to till end of page third half") */
    check((await op.getByTestId("top-panel").getByTestId("inbox-sides").count()) === 1, "inbox: Received · Completed are in the TOP squircle (3 Oct 2026)");
    check((await op.getByTestId("inbox-overview").getByTestId("pipeline-breakup").count()) === 1, "inbox: the Breakup is in the MIDDLE squircle, its own shape (3 Oct 2026)");
    check((await op.getByTestId("inbox-panel").getByRole("searchbox").or(op.getByTestId("inbox-panel").getByRole("textbox")).count()) >= 1 && (await op.getByTestId("inbox-overview").getByRole("textbox").count()) === 0, "inbox: the search starts the THIRD panel, under the overview (3 Oct 2026)");
    check((await op.getByTestId("inbox-overview").getByRole("heading", { name: "Breakup", exact: true }).count()) === 1 && (await op.getByText("Pipeline breakup").count()) === 0, "inbox: it is called Breakup now, not Pipeline breakup (3 Oct 2026)");
    check(/Total · \d+ enquir/.test(await op.getByTestId("pipeline-breakup").innerText().catch(() => "")), "inbox: the Breakup leads with its total and how many enquiries make it (3 Oct 2026)");
    await op.screenshot({ path: path.join(__dirname, "shots", "inbox-studio-received.png"), fullPage: true });
    await op.getByRole("button", { name: "Completed enquiries", exact: true }).click();
    await op.screenshot({ path: path.join(__dirname, "shots", "inbox-studio-completed.png"), fullPage: true });
    check((await op.getByRole("link", { name: `Choreographer enquiry from Zed Quill ${stamp}` }).count()) === 1, "studio › Enquiries › Completed: the DECLINED enquiry is here");

    /* ── THE OWNER'S OWN INBOX: no invitations it sent (11 Oct 2026) — those are
       on each studio's Team desk and each crew's Team desk, with Withdraw ── */
    await op.goto(`${BASE}/inbox`, { waitUntil: "networkidle" });
    check((await op.getByRole("button", { name: /^(Invites|Requests) — / }).count()) === 0 && (await op.getByRole("button", { name: "Sent invitations", exact: true }).count()) === 0, "owner inbox: no Invites column and no Sent invitations side");
    check((await op.getByTestId("request-row").count()) === 0, "owner inbox: no request rows at all");
    /* the invite the sender joined is a seat on the studio's Team desk now */
    await op.goto(`${BASE}/business/${studio.id}/staff`, { waitUntil: "networkidle" });
    check((await op.getByText(`Zed Quill ${stamp}`).count()) >= 1, "the studio's Team desk lists the person who joined from the Studios hub");

    /* the personal Inbox of the same owner does NOT carry the studio's enquiries */
    await op.goto(`${BASE}/inbox?show=enquiries`, { waitUntil: "networkidle" });
    check((await op.getByRole("link", { name: /enquiry from Zed Quill/ }).count()) === 0, "owner's own Inbox: the studio's enquiries do NOT overlap onto the person");

    /* no Enquiries tile on either home */
    for (const [label, url] of [["person", "/"], ["studio", `/business/${studio.id}`]]) {
      await op.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
      check((await op.getByRole("link", { name: "Enquiries", exact: true }).count()) === 0, `${label} home: no Enquiries tile`);
    }

    /* ── DISCOVER, ALL CITIES, SIGNED OUT ── */
    const gp = await (await browser.newContext({ viewport: { width: 430, height: 932 } })).newPage();
    await gp.goto(`${BASE}/discover?city=Pune&tab=classes`, { waitUntil: "networkidle" });
    const pune = Number(((await gp.getByTestId("shelf-count").innerText().catch(() => "0")).match(/\d+/) || ["0"])[0]);
    await gp.getByRole("button", { name: "Where to look" }).click();
    const allRow = gp.getByRole("option", { name: "All cities" });
    check((await allRow.count()) === 1, "Discover: the place list offers All cities");
    await allRow.click();
    await gp.waitForURL(/city=all/, { timeout: 15000 }).catch(() => {});
    check(/city=all/.test(gp.url()), "picking it puts city=all in the address");
    await gp.waitForLoadState("networkidle");
    const allText = await gp.getByTestId("shelf-count").innerText().catch(() => "");
    const all = Number((allText.match(/\d+/) || ["0"])[0]);
    check(/in all cities/.test(allText) && all >= pune, `classes: "${allText}" — at least Pune's ${pune}`);
    await gp.goto(`${BASE}/discover?city=all&tab=studios`, { waitUntil: "networkidle" });
    const stText = await gp.getByTestId("shelf-count").innerText().catch(() => "");
    check(/in all cities/.test(stText), `studios: "${stText}"`);
    const chip = await gp.getByRole("button", { name: "Where to look" }).locator("..").innerText().catch(() => "");
    check(/All cities/.test(chip), "the chip says All cities");
    /* ⚠ ANCHORED — "Within 5 km" is the radius quick chip and is not a distance */
    const kms = await gp.locator("text=/^\\d+(\\.\\d+)? k?m$/").count();
    check(kms === 0, `no distance is printed nationwide (${kms})`);
    await gp.goto(`${BASE}/discover?city=all&tab=crews`, { waitUntil: "networkidle" });
    check(/in all cities/.test(await gp.getByTestId("shelf-count").innerText().catch(() => "")), "crews: read across every city");

    /* ── A CLASS ASK POINTS AT CLASSES, NOT THE INBOX (11 Oct 2026, 20261017090000,
       B14). Class requests left the Inbox for Classes on 11 Oct, and the
       notification that tells somebody they were asked used to keep naming
       /inbox. It names /my-classes?tab=todo now, where the ask is answered.
       Planted LAST, so the Inbox checks above read a world with no class ask in it. */
    const day = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
    const cls = await call("POST", "/rest/v1/rpc/create_class_with_session", owner.h, {
      p_business_id: studio.id, p_title: "Hip-Hop · All levels", p_style: "Hip-Hop", p_level: "all", p_room: null,
      p_price_inr: 0, p_capacity: 8, p_status: "draft", p_starts_at: `${day}T19:00:00+05:30`, p_ends_at: `${day}T20:00:00+05:30`,
    });
    await call("POST", "/rest/v1/rpc/ask_class_person", owner.h, { p_class_id: cls.id, p_user_id: sender.id, p_kind: "artist" });
    const askNote = await call("GET", `/rest/v1/notifications?user_id=eq.${sender.id}&kind=eq.class&deleted_at=is.null&select=title,href&order=created_at.desc&limit=1`, svc);
    check(askNote[0] && /wants you as the artist taking/.test(askNote[0].title), `the person asked to teach is told (${askNote[0] ? askNote[0].title : "nothing"})`);
    check(askNote[0] && askNote[0].href === "/my-classes?tab=todo", `⚠ …and the notification opens Classes' To do, where it is answered — not the Inbox (${askNote[0] ? askNote[0].href : "—"})`);
  } catch (e) {
    check(false, `run died: ${e.message}`);
  } finally {
    await browser.close();
    for (const id of made.enquiries) {
      const r = await fetch(`${SUPA}/rest/v1/enquiries?id=eq.${id}`, { method: "DELETE", headers: svc });
      if (!r.ok) console.log(`  ⚠ cleanup enquiry ${id}: ${r.status}`);
    }
    for (const id of made.crews) {
      const r = await fetch(`${SUPA}/rest/v1/crews?id=eq.${id}`, { method: "DELETE", headers: svc });
      if (!r.ok) console.log(`  ⚠ cleanup crew ${id}: ${r.status} ${(await r.text()).slice(0, 160)}`);
    }
    for (const id of made.businesses) {
      const r = await fetch(`${SUPA}/rest/v1/businesses?id=eq.${id}`, { method: "DELETE", headers: svc });
      if (!r.ok) console.log(`  ⚠ cleanup business ${id}: ${r.status} ${(await r.text()).slice(0, 160)}`);
    }
    for (const id of made.users) {
      const r = await fetch(`${SUPA}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: svc });
      if (!r.ok) console.log(`  ⚠ cleanup user ${id}: ${r.status}`);
    }
    console.log(`\n${ok} passed, ${bad} failed`);
    process.exit(bad ? 1 : 0);
  }
})();
