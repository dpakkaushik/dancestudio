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

const pill = (page, re) => page.getByRole("button", { name: re }).first();
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
    const base = { business_id: studio.id, from_user_id: sender.id, type_key: "private", fields: [["Session format", "One-on-one"]], dates: ["2026-11-01"], message: "Probe enquiry", created_by: sender.id, updated_by: sender.id };
    const [open] = await call("POST", "/rest/v1/enquiries", svc, { ...base, status: "new" });
    const [lost] = await call("POST", "/rest/v1/enquiries", svc, { ...base, fields: [["Session format", "Couple"]], status: "declined", close_reason: "Booked that weekend", closed_at: new Date().toISOString(), closed_by: owner.id });
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
    /* ⚠ and a crew ask the leader WITHDRAWS — a soft delete, which both Inboxes
       used to drop on the floor */
    const crew = await call("POST", "/rest/v1/rpc/create_crew", owner.h, { p_name: `Mu Crew ${stamp}`, p_city: "Pune", p_style: "Hip-Hop", p_member_ids: [sender.id] });
    made.crews.push(crew.id);
    const [ask] = await call("GET", `/rest/v1/crew_members?crew_id=eq.${crew.id}&user_id=eq.${sender.id}&select=id`, svc);
    await call("POST", "/rest/v1/rpc/withdraw_crew_ask", owner.h, { p_member_id: ask.id });

    /* ── THE SENDER'S OWN INBOX ── */
    const sp = await (await browser.newContext({ viewport: { width: 430, height: 932 } })).newPage();
    await signIn(sp, sender);
    await sp.goto(`${BASE}/inbox`, { waitUntil: "networkidle" });
    /* ⚠ THREE COLUMNS, ENQUIRIES FIRST, NO COMPLETED PILL (2 Oct 2026, the user:
       "completed … with received and sent in their respective section. enquiry
       should be first. all requests, invites and enquiries should be 3 columns") */
    const order = await sp.getByRole("button", { name: /^(Enquiries|Requests|Invites|Completed) — / }).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label").split(" — ")[0]));
    check(order.join(",") === "Enquiries,Requests,Invites", `sender inbox: the columns are Enquiries · Requests · Invites (${order.join(" · ")})`);
    check(await pressed(pill(sp, /^Enquiries — /)), "sender inbox: it opens on Enquiries, the first column");
    for (const noun of ["enquiries", "requests", "invitations"]) {
      if (noun === "requests") await pill(sp, /^Requests — /).click();
      if (noun === "invitations") await pill(sp, /^Invites — /).click();
      const sides = ["Received", "Sent", "Completed"].map((s) => sp.getByRole("button", { name: `${s} ${noun}`, exact: true }));
      check((await Promise.all(sides.map((l) => l.count()))).every((n) => n === 1), `${noun}: Received · Sent · Completed inside the column`);
    }
    /* the withdrawn crew ask is NOT live and IS under Invites › Completed */
    check((await sp.getByRole("button", { name: `Join Mu Crew ${stamp}` }).count()) === 0, "a withdrawn crew ask offers no Join");
    await sp.getByRole("button", { name: "Completed invitations", exact: true }).click();
    const gone = sp.getByTestId("request-row").filter({ hasText: `Mu Crew ${stamp}` });
    check((await gone.getByTestId("answer-stamp").getAttribute("data-status").catch(() => null)) === "withdrawn", `invitee › Invites › Completed: the withdrawn crew ask is still there, stamped (${(await gone.first().innerText().catch(() => "missing")).replace(/\s+/g, " ").slice(0, 90)})`);
    check((await sp.getByTestId("request-row").filter({ hasText: `Lambda Hall ${stamp}` }).count()) <= 1, "invitee: the declined invite is at most once (it needs the held migration to show here)");
    await sp.getByRole("button", { name: "Received invitations", exact: true }).click();
    const inv = sp.getByTestId("request-row").filter({ hasText: `Kappa Hall ${stamp}` });
    await inv.first().waitFor({ timeout: 15000 }).catch(() => {});
    const invText = await inv.first().innerText().catch(() => "");
    check(/Faculty/i.test(invText), `invite card: the seat reads "Faculty" (${invText.replace(/\s+/g, " ").slice(0, 120)})`);
    check(!/trainer/i.test(invText), "invite card: the column's word \"trainer\" is not printed");
    check((await sp.getByRole("button", { name: `Join Kappa Hall ${stamp}` }).count()) === 1, "invite card: Join is offered");

    await sp.goto(`${BASE}/inbox?show=enquiries`, { waitUntil: "networkidle" });
    check(await pressed(pill(sp, /^Enquiries — /)), "?show=enquiries opens on the Enquiries desk");
    await sp.getByRole("button", { name: "Sent enquiries" }).click();
    const sentCard = sp.getByRole("link", { name: `Private Sessions enquiry to Kappa Hall ${stamp}` });
    check((await sentCard.count()) === 1, "sender: the OPEN enquiry is on the Sent side, and only it (the declined one is not on the live desk)");
    const sentText = await sentCard.first().innerText().catch(() => "");
    check(/\bKH\b/.test(sentText) && !/\bZQ\b/.test(sentText), `enquiry card: the studio's face, not your own (${/\bKH\b/.test(sentText) ? "KH" : "-"} / ${/\bZQ\b/.test(sentText) ? "ZQ shown" : "no ZQ"})`);

    await sp.getByRole("button", { name: "Completed enquiries", exact: true }).click();
    check((await sp.getByRole("link", { name: `Private Sessions enquiry to Kappa Hall ${stamp}` }).count()) === 1, "Enquiries › Completed: the DECLINED enquiry is here");

    /* ── THE STUDIO'S INBOX ── */
    const op = await (await browser.newContext({ viewport: { width: 430, height: 932 } })).newPage();
    await signIn(op, owner);
    await op.goto(`${BASE}/enquiries?as=${studio.id}`, { waitUntil: "networkidle" });
    check(new RegExp(`/business/${studio.id}/inbox\\?show=enquiries$`).test(op.url()), `the old ?as= address lands on the studio's Inbox (${op.url().replace(BASE, "")})`);
    const recvCard = op.getByRole("link", { name: `Private Sessions enquiry from Zed Quill ${stamp}` });
    check((await recvCard.count()) === 1, "studio inbox: the open enquiry is on its Enquiries desk");
    const recvText = await recvCard.first().innerText().catch(() => "");
    check(/\bZQ\b/.test(recvText) && !/\bKH\b/.test(recvText), "studio's card: the sender's face, not the studio's own");
    check((await op.getByRole("button", { name: /^Enquiry settings/ }).count()) === 1, "studio inbox: the studio's Enquiry settings moved with the desk");
    check((await op.getByRole("button", { name: "Sent enquiries" }).count()) === 0, "studio inbox: no Sent enquiries side — a studio sends none");
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
    check((await op.getByRole("link", { name: `Private Sessions enquiry from Zed Quill ${stamp}` }).count()) === 1, "studio › Enquiries › Completed: the DECLINED enquiry is here");

    /* ── THE OWNER'S OWN INBOX: what they sent, answered or withdrawn ── */
    await op.goto(`${BASE}/inbox`, { waitUntil: "networkidle" });
    await pill(op, /^Invites — /).click();
    await op.getByRole("button", { name: "Completed invitations", exact: true }).click();
    const declined = op.getByTestId("request-row").filter({ hasText: `Lambda Hall ${stamp}` });
    check((await declined.getByTestId("answer-stamp").getAttribute("data-status").catch(() => null)) === "rejected", "owner › Invites › Completed: the DECLINED invite is kept, stamped");
    const withdrew = op.getByTestId("request-row").filter({ hasText: `Mu Crew ${stamp}` });
    check(/You withdrew it/.test(await withdrew.first().innerText().catch(() => "")), "owner › Invites › Completed: the crew ask they took back says so");
    await op.getByRole("button", { name: "Sent invitations", exact: true }).click();
    check((await op.getByTestId("request-row").filter({ hasText: `Kappa Hall ${stamp}` }).count()) === 1, "owner › Invites › Sent: the invite still waiting is live, and only there");

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
