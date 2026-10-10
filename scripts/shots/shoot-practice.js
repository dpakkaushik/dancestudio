/* A CREW PRACTISES, DRIVEN FOR REAL (27 Sep 2026) — the whole loop the user
   asked for: *"crew should also get an option on home tab called Practice —
   which allows crew leader to create practice which sends invite to members and
   leader can mange attendace like how its done class for the same. practice also
   get added to calendar. crews should also have a calendar tab."*

   Two throwaway accounts (the e2e's admin generate_link trick): a LEADER who
   opens a crew and asks a MEMBER, the member confirming the seat, then

     · the Practice tile on the crew's home, and the Calendar tile beside it;
     · the leader arranges a practice through the `?new=1` sheet, whose button
       NAMES THE MISSING ANSWER at each step (ClassForm's rule);
     · the member is ASKED — the row is in their Inbox, in the Accept · Reject
       group rather than the invitations one, because a practice is about ONE
       OCCASION — and the LEADER is not asked, which is the thing most likely to
       be got wrong;
     · the member says they are coming, and the leader's REGISTER says so;
     · the leader checks them in, and undoing it is a soft delete that leaves the
       row on the register rather than erasing the person;
     · it is on the CREW's calendar and on BOTH people's own calendars;
     · and calling it off says so rather than making the practice disappear.

   ⚠ It asserts BOTH ENDS of the one thing that is easy to get wrong: the leader
   has no "I am coming" pair (they arranged it) and the member has no register.

   Needs the app on DANCEOS_BASE_URL (default :3000) and `20260927140000`
   applied. Cleans up both accounts and the crew. */
const path = require("path");
const fs = require("fs");
const { chromium } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..", "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
const BASE = process.env.DANCEOS_BASE_URL || "http://localhost:3000";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
const FILE = { name: "face.png", mimeType: "image/png", buffer: PNG };
const stamp = Date.now().toString(36);

let pass = 0;
let fail = 0;
const check = (ok, what) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (ok) pass += 1; else fail += 1; };

const useIt = async (page, n = 1) => {
  const d = page.getByRole("dialog", { name: "Crop & preview" });
  for (let k = 0; k < n; k += 1) {
    if (n > 1) await d.getByText(`${k + 1} of ${n}`).waitFor();
    await d.getByRole("button", { name: "Use this photo" }).click();
  }
  await d.waitFor({ state: "detached" });
};

async function signUp(page, email) {
  const r = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, { method: "POST", headers: H, body: JSON.stringify({ type: "magiclink", email }) });
  if (!r.ok) throw new Error(`generate_link ${r.status} ${await r.text()}`);
  const link = await r.json();
  await page.goto(`${BASE}/auth/confirm?token_hash=${link.hashed_token}&type=${link.verification_type ?? "magiclink"}`);
  return link.id;
}

async function pickCity(page, city) {
  await page.getByLabel("Choose a city").first().click();
  await page.getByRole("option", { name: city, exact: true }).click();
}

async function onboard(page, name, city) {
  await page.waitForURL(/\/onboarding/);
  await page.locator('input[name="name"]').fill(name);
  await pickCity(page, city);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Add a photo").setInputFiles(FILE);
  await useIt(page);
  await page.getByLabel("Your profile photo", { exact: true }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  // the styles to LEARN (11 Oct 2026): one picked, so the private list is exercised
  await page.getByText("Styles you want to learn").waitFor();
  await page.getByRole("button", { name: "Kathak", exact: true }).click();
  await page.getByRole("button", { name: "Continue · 1 to learn" }).click();
  await page.getByText("Styles you already dance").waitFor();
  await page.getByRole("button", { name: "Hip-Hop", exact: true }).click();
  await page.getByRole("button", { name: "Continue · 1 style" }).click();
  await page.getByText("Your social links").waitFor();
  await page.getByRole("button", { name: /^(Continue|Skip)/ }).first().click();
  await page.getByRole("button", { name: /Open DanceOS/ }).click();
  await page.waitForURL((u) => !/\/onboarding/.test(u.pathname), { timeout: 30000 });
}

/** ⚠ THE INBOX IS THREE DESKS SINCE C68 (27 Sep 2026) — Requests · Invites ·
 *  Done — so a crew JOIN is behind the Invites pill and a PRACTICE ask is on
 *  Requests, which is the split working: one is about belonging and one is about
 *  one evening. Pressing a pill before hydration does nothing, so this retries
 *  until `aria-pressed` says it took (the e2e's own `pressPill`). */
const pressPill = async (page, name) => {
  const pill = page.getByRole("button", { name }).first();
  await pill.waitFor({ timeout: 20000 });
  for (let i = 0; i < 4; i += 1) {
    await pill.click();
    if ((await pill.getAttribute("aria-pressed")) === "true") return;
    await page.waitForTimeout(700);
  }
};

/* tomorrow in IST, as the date input wants it */
const tomorrowIst = () => {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(new Date(Date.now() + 26 * 60 * 60 * 1000));
};

(async () => {
  const browser = await chromium.launch();
  const leaderCtx = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const memberCtx = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const leader = await leaderCtx.newPage();
  const member = await memberCtx.newPage();
  const errs = [];
  for (const p of [leader, member]) {
    p.on("pageerror", (e) => errs.push(`PAGEERROR ${e.message}`));
  }
  const ids = [];
  let crewId = "";
  const leaderName = `Prac Leader ${stamp}`;
  const memberName = `Prac Member ${stamp}`;
  const crewName = `Prac Crew ${stamp}`;

  try {
    ids.push(await signUp(leader, `prac.lead.${stamp}@example.com`));
    await onboard(leader, leaderName, "Pune");
    ids.push(await signUp(member, `prac.mem.${stamp}@example.com`));
    await onboard(member, memberName, "Pune");

    /* ── the crew, with the member asked ── */
    await leader.goto(`${BASE}/crews`, { waitUntil: "networkidle" });
    await leader.getByRole("link", { name: "Add Crew", exact: true }).click();
    await leader.getByRole("heading", { name: "Create crew" }).waitFor();
    await leader.getByLabel("Crew name").fill(crewName);
    /* a crew dances a LIST since 2 Oct 2026: the multi picker's add control */
    await leader.getByRole("button", { name: "Add a dance style", exact: true }).click();
    await leader.getByRole("button", { name: "Hip-Hop", exact: true }).click();
    await leader.getByLabel("Mobile", { exact: true }).fill("+91 90000 44440");
    await leader.getByLabel("Email", { exact: true }).fill(`prac-crew-${stamp}@example.com`);
    await leader.getByRole("button", { name: "Add a member" }).click();
    await leader.getByLabel("Search DanceOS for a dancer").fill(memberName);
    await leader.getByRole("button", { name: `Add ${memberName} to the crew` }).click();
    await leader.getByRole("button", { name: "Create crew", exact: true }).click();
    await leader.getByRole("dialog", { name: "Create this crew?" }).getByRole("button", { name: "Create crew", exact: true }).click();
    /* ⚠ under the welcome bow since 2 Oct 2026 (`?welcome=crew`); the goto to
       the crew's home below leaves it behind */
    await leader.waitForURL(/\/crews\/[0-9a-f-]+\/manage(\?welcome=crew)?$/, { timeout: 30000 });
    crewId = leader.url().match(/\/crews\/([0-9a-f-]+)\/manage/)[1];

    /* the member confirms the SEAT — only a confirmed member is asked to a practice */
    await member.goto(`${BASE}/inbox`, { waitUntil: "networkidle" });
    await pressPill(member, /^Invites/);
    await member.getByRole("button", { name: `Join ${crewName}` }).click();
    await member.waitForTimeout(1800);

    /* ── 1 · THE TWO TILES ── */
    await leader.goto(`${BASE}/crews/${crewId}/manage`, { waitUntil: "networkidle" });
    const practiceTile = leader.getByRole("link", { name: "Practice", exact: true });
    check((await practiceTile.count()) === 1, "crew home: a Practice tile (27 Sep 2026, the user's own word)");
    check((await leader.getByRole("link", { name: "Calendar", exact: true }).count()) === 1, "crew home: and a Calendar tile beside it");
    await practiceTile.click();
    await leader.waitForURL(/\/manage\/practice$/, { timeout: 20000 });
    check(await leader.getByRole("heading", { level: 1, name: "Practice" }).isVisible().catch(() => false), "practice desk: headed Practice — a drill page with its own title, not the path segment");
    check(await leader.getByText(/Nothing arranged yet/).isVisible().catch(() => false), "practice desk: an empty crew says so rather than drawing an empty list");

    /* ── 2 · ARRANGE ONE, and the button names each missing answer ── */
    await leader.getByRole("link", { name: "Arrange a practice" }).click();
    await leader.waitForURL(/\?new=1$/, { timeout: 20000 });
    const sheet = leader.getByRole("dialog");
    check(await leader.getByRole("heading", { name: "Arrange a practice" }).isVisible().catch(() => false), "the form opens as a SHEET over the desk (?new=1, C54's grammar)");
    check(await leader.getByRole("button", { name: "Pick a day" }).isVisible().catch(() => false), "the bar NAMES the missing answer — its accessible name IS its visible text (ClassForm's rule)");
    await leader.locator("#practice-date").fill(tomorrowIst());
    await leader.locator("#practice-from").fill("19:00");
    await leader.locator("#practice-to").fill("21:00");
    check(await leader.getByRole("button", { name: "Say where" }).isVisible().catch(() => false), "…and the next one, once the hours are in");
    await leader.locator("#practice-place").fill("Studio 4, Baner");
    await leader.locator("#practice-note").fill("Knee pads");
    await leader.getByRole("button", { name: "Arrange it", exact: true }).first().click();
    await leader.getByRole("dialog", { name: "Arrange this practice?" }).getByRole("button", { name: "Arrange it", exact: true }).click();
    await leader.waitForURL((u) => !/new=1/.test(u.search), { timeout: 25000 });
    /* ⚠ WAIT FOR THE ROW, DO NOT READ IN THE SAME TICK. The sheet closing and
       the desk re-reading are two things: `back()` changes the URL at once and
       `refresh()` is a round trip to the server behind it. Asserting on the tick
       the URL changed read as "the practice is not on the desk" four times over
       — which is the shape this file already records for a click before
       hydration: the screen was right and the check was early. */
    await leader.getByText("Studio 4, Baner").waitFor({ timeout: 20000 }).catch(() => {});
    check(await leader.getByText("Studio 4, Baner").isVisible().catch(() => false), "the practice is on the desk as soon as the sheet closes, with where it is");
    check(await leader.getByText("Knee pads").isVisible().catch(() => false), "…and what to bring");
    check(await leader.getByText("YOU ARRANGED IT").isVisible().catch(() => false), "⚠ THE LEADER IS NOT ASKED — they arranged it, and the desk says so instead of offering them a yes/no");
    check((await leader.getByRole("button", { name: /^I am coming/ }).count()) === 0, "…so there is no I-am-coming pair on the leader's own row");
    check(await leader.getByText("0 of 1 coming").isVisible().catch(() => false), "and one person was asked — the confirmed member, and nobody else");

    /* ── 3 · THE MEMBER IS ASKED, IN THE ASK GROUP ── */
    await member.goto(`${BASE}/inbox`, { waitUntil: "networkidle" });
    /* ⚠ RE-CUT 3 Oct 2026: the Inbox has OPENED ON ENQUIRIES since 2 Oct (C96),
       so the ask is one press away, on the Requests column — shoot-inbox's own way in */
    await pressPill(member, /^Requests/);
    /* ⚠ ON **REQUESTS**, NOT INVITES — which is the C68 split working: joining a
       crew is about belonging and goes to Invites; a practice is about one
       evening and belongs with the class and duet asks. `JOIN_KINDS` decides it
       by omission, and this is the check that says so. */
    const ask = member.getByText(/have you at a practice of/);
    check(await ask.first().isVisible().catch(() => false), "the member's INBOX carries the ask, on REQUESTS (an occasion, not a joining)");
    check((await member.getByText("PRACTICE", { exact: true }).count()) >= 1, "…labelled PRACTICE, in the Accept · Reject group");
    await member.getByRole("button", { name: `Accept ${crewName}` }).first().click();
    await member.waitForTimeout(2000);

    /* ── 4 · THE REGISTER ── */
    await leader.goto(`${BASE}/crews/${crewId}/manage/practice`, { waitUntil: "networkidle" });
    check(await leader.getByText("1 of 1 coming").isVisible().catch(() => false), "the leader's desk counts the yes");
    /* 2 Oct 2026: the card leads with the crew it is for, then a date block */
    const card = leader.getByTestId("practice-card").first();
    check((await card.innerText()).includes(crewName), "the practice card names its crew at the top");
    await card.screenshot({ path: require("path").join(__dirname, "shots", "practice-card.png") }).catch(() => {});
    await leader.getByRole("button", { name: /^Register for/ }).first().click();
    await leader.waitForTimeout(1200);
    check(await leader.getByText(memberName).first().isVisible().catch(() => false), "the register lists the member, read ON THE PRESS");
    check(await leader.getByText("Leader").first().isVisible().catch(() => false), "…and the leader first, who is on it without having been asked");
    const checkIn = leader.getByRole("button", { name: `Check ${memberName} in` });
    check((await checkIn.count()) === 1, "…with a Check in button, like a class register");
    await checkIn.click();
    await leader.waitForTimeout(1500);
    check((await leader.getByRole("button", { name: `Take ${memberName} off the register` }).count()) === 1, "checking in flips to an undo — one live row per person means present");
    await leader.getByRole("button", { name: `Take ${memberName} off the register` }).click();
    await leader.waitForTimeout(1500);
    check((await leader.getByRole("button", { name: `Check ${memberName} in` }).count()) === 1, "…and undoing SOFT-deletes: the person is still on the register, just not marked in");

    /* ── 5 · THE CALENDARS ── */
    await leader.goto(`${BASE}/crews/${crewId}/manage/calendar`, { waitUntil: "networkidle" });
    /* ⚠ THE CALENDAR ROW IS A PILL NOW (28 Sep 2026, the user: "calendar should
       only have pills with infor instead of cards"), so it reads
       `{crew} · {place}` on one line where the card read `{crew}` over
       `Practice · {place}`. Better information, not less: the crew's NAME is the
       fact a person on three crews needs and "Practice" was a word the Practice
       half of the switch had already said.
       ⚠ TWO LINES since 5 Oct 2026 — the crew's name on the first, the standing
       chip and the place on the second — because one line cut every name at
       390px. These checks match the words, so they read either shape. */
    check(await leader.getByText(/Studio 4, Baner/).first().isVisible().catch(() => false), "the CREW's calendar carries it");
    /* ⚠ 10 Oct 2026: the filters are Google's "My calendars" checkboxes in the
       drawer the bar's ☰ opens, and a crew's drawer offers views only */
    await leader.getByRole("button", { name: "Calendar menu" }).click();
    check((await leader.getByRole("checkbox", { name: /^Classes:/ }).count()) === 0, "…and is never offered Classes · Practice — a crew's calendar IS its practices");
    await leader.getByRole("button", { name: "Close the menu" }).click();
    await member.goto(`${BASE}/calendar`, { waitUntil: "networkidle" });
    /* ⚠ CLASSES AND PRACTICE TOGETHER (10 Oct 2026, the user): the practice is
       on a person's schedule without pressing anything, and the drawer counts it */
    check(await member.getByText(/Studio 4, Baner/).first().isVisible().catch(() => false), "a PERSON's calendar shows the practice beside the classes, with nothing pressed");
    await member.getByRole("button", { name: "Calendar menu" }).click();
    check((await member.getByRole("checkbox", { name: /^Practice: 1$/ }).count()) === 1, "…and the drawer's Practice checkbox counts one");
    await member.getByRole("button", { name: "Close the menu" }).click();
    check(await member.getByText(new RegExp(crewName)).first().isVisible().catch(() => false), "…naming WHICH crew");
    check(await member.getByText(/^Coming ·/).first().isVisible().catch(() => false), "…wearing what they said");

    /* ── 6 · THE MEMBER CAN SEE IT AND ANSWER IT (28 Sep 2026, the user: *"no
       way to check practices you have been a part of fix that"*).
       ⚠ This is a gap I WROTE DOWN AND SHIPPED — `#0at` said in so many words
       that a member who does not lead the crew cannot open the desk and their
       calendar row goes to the crew's public page instead. A backlog row naming
       a defect is not a decision to accept it. ── */
    /* ⚠⚠ `/practice` — ITS OWN TILE, THE THIRD ADDRESS THIS CHECK HAS HAD IN
       THREE DAYS (29 Sep 2026, the user: *"practice should be seprate tab in
       home tab not in crew"*).
       27 Sep: a section stacked under both crew lists. 28 Sep: a COLUMN of the
       Crews hub — and that move made this check stale for a day, because
       `SegmentedPanels` mounts only the shown panel, so the practices were not
       in the DOM at all until the second pill was pressed and the script was
       asking `/crews` and reading `isVisible()`. 29 Sep: a Home tile of its own,
       because the person looking for a practice is asking what they are dancing,
       not a question about crews. */
    await member.goto(`${BASE}/practice`, { waitUntil: "networkidle" });
    check(await member.getByTestId("my-practices").isVisible().catch(() => false), "the Practice tile's own screen carries the practices of somebody who only BELONGS to a crew");
    check(await member.getByText("Studio 4, Baner").first().isVisible().catch(() => false), "…with the practice on it, where and when");
    check(await member.getByText(crewName).first().isVisible().catch(() => false), "…and WHICH CREW, because this list can hold three crews' practices in one evening");
    check((await member.getByRole("button", { name: /^Coming to/ }).count()) === 1, "…and the answer pair, so a member can change their mind from the one screen that shows it");
    check((await member.getByRole("button", { name: /^Register for/ }).count()) === 0, "⚠ and NO register — that is the leader's, and a member is not offered a control the database would refuse");
    /* change the answer HERE, which is the whole point of the screen */
    await member.getByRole("button", { name: /^Cannot make/ }).first().click();
    await member.waitForTimeout(2200);
    await member.reload({ waitUntil: "networkidle" });
    check(await member.getByText("NOT COMING").first().isVisible().catch(() => false), "answering on the hub really writes — the standing changes and the page says so");
    await member.getByRole("button", { name: /^Coming to/ }).first().click();
    await member.waitForTimeout(2200);

    /* the leader's own hub shows the same practice with the door to the register
       instead of an answer they were never asked for */
    await leader.goto(`${BASE}/practice`, { waitUntil: "networkidle" });
    check(await leader.getByTestId("my-practices").isVisible().catch(() => false), "the leader's Practice screen carries it too — one list, every crew");
    check((await leader.getByRole("link", { name: /^Open the register for/ }).count()) === 1, "…with Register › to their own desk");
    check((await leader.getByRole("button", { name: /^Coming to/ }).count()) === 0, "…and no answer pair, because they arranged it");

    /* ⚠ TWO COLUMNS (1 Oct 2026, the user: *"practice also in 2 columns"*) — the
       Crews hub's own split. The pill's accessible name is its `aria` plus its
       count, never the visible word (SegmentedNav:78). */
    const yoursPill = (pg) => pg.getByRole("link", { name: /^Practices of the crews you lead/ });
    const inPill = (pg) => pg.getByRole("link", { name: /^Practices of the crews you are a part of/ });
    check((await yoursPill(leader).count()) === 1 && (await inPill(leader).count()) === 1, "⚠⚠ the Practice screen is two columns — Yours · You are in");
    check(/[?&]show=/.test(leader.url()) === false && (await leader.getByRole("link", { name: /^Open the register for/ }).count()) === 1, "…the leader lands on Yours, where the practice they arranged is");
    await inPill(leader).click();
    await leader.waitForTimeout(500);
    check((await leader.getByText("Studio 4, Baner").count()) === 0, "…and it is NOT under You are in — a practice sits in exactly one column");
    await member.goto(`${BASE}/practice`, { waitUntil: "networkidle" });
    check((await member.getByRole("button", { name: /^Coming to/ }).count()) === 1, "…while a member who leads nothing lands on You are in, with the practice and its answer pair");
    await yoursPill(member).click();
    await member.waitForTimeout(500);
    check((await member.getByText("Studio 4, Baner").count()) === 0 && (await member.getByText(/practices you arrange/).count()) === 1, "…and their Yours column is empty and says what would land there");

    /* ⚠ AND THE CALENDAR ROW NOW OPENS A SCREEN THAT CAN ACT ON IT. A member's
       used to carry the crew's PUBLIC page — true, and useless: that page says
       nothing about practices and can answer none. */
    await member.goto(`${BASE}/calendar`, { waitUntil: "networkidle" });
    const memberHref = await member.evaluate(() => {
      const a = [...document.querySelectorAll("a")].find((x) => /Studio 4, Baner/.test(x.textContent || ""));
      return a ? a.getAttribute("href") : null;
    });
    check(memberHref === "/practice?show=in", `a member's calendar row opens the Practice screen's "You are in" column, which can answer it — it reads ${memberHref}`);

    /* ── 7 · CALLING IT OFF SAYS SO ── */
    await leader.goto(`${BASE}/crews/${crewId}/manage/practice`, { waitUntil: "networkidle" });
    await leader.getByRole("button", { name: /^Call off/ }).first().click();
    await leader.waitForTimeout(2000);
    await leader.reload({ waitUntil: "networkidle" });
    check(await leader.getByText("CALLED OFF").first().isVisible().catch(() => false), "calling it off is a STATUS — the row stays and says so, because a practice that vanishes tells nobody anything");

    check(errs.length === 0, `no page error on any screen${errs.length ? ` — ${errs[0]}` : ""}`);
  } catch (e) {
    check(false, `the run died: ${e.message}`);
  } finally {
    if (crewId) await fetch(`${supabaseUrl}/rest/v1/crews?id=eq.${crewId}`, { method: "DELETE", headers: H }).catch(() => {});
    for (const id of ids) await fetch(`${supabaseUrl}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: H }).catch(() => {});
    await browser.close();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
