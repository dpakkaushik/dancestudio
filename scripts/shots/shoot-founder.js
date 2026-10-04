/**
 * THE FOUNDER TAKES IT BACK (30 Sep 2026) — `20260930090000`'s two doors, driven.
 *
 * The user: *"main person who created the studio should be able to remove the
 * other owner. same applies for crew when 2 or more crew leaders are there."*
 *
 * ⚠⚠ WHAT MADE THIS WORTH A SCRIPT rather than a dry-run check: both halves are
 * a CONTROL THAT IS DRAWN OR NOT DRAWN, decided on the client from a value the
 * server reads. The RPCs are proven (dry run 27/27, rolled back) and typecheck,
 * lint and the build are all green whether the button appears for the right
 * person, the wrong person, or nobody at all — which is the exact shape of the
 * 21 Sep tile audit (a door that would be refused, offered; and a door that
 * would open, missing). Only a browser can answer it.
 *
 * ⚠ AND IT ASSERTS THE ABSENCES BY OPENING THE SHEET FIRST, because "no Remove"
 * and "the sheet did not open" look identical from outside — the 28 Sep lesson
 * about a control that does not exist being a stall rather than a red.
 *
 * ⚠ A crew CANNOT have two leaders (`set_crew_member_role` demotes every other
 * leader row in the same statement), so the crew half proves the thing the ask
 * was really about: handing one over was a ONE-WAY DOOR.
 *
 *   npm run build && npx next start -p 3100
 *   NODE_PATH=$(pwd)/node_modules DANCEOS_BASE_URL=http://localhost:3100 \
 *     node scripts/shots/shoot-founder.js
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

/** open a member's sheet on the Team desk and hand back what it offers */
const openMemberSheet = async (page, memberName) => {
  await page.getByRole("button", { name: `Manage ${memberName}`, exact: true }).click();
  /* the sheet's own heading is the person's name — waiting for it is what makes
     an ABSENT Remove a real absence rather than a sheet that never opened */
  await page.getByRole("button", { name: `Remove ${memberName} from the team` }).or(page.getByRole("button", { name: "Save label" })).first().waitFor({ state: "attached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(400);
};

(async () => {
  const stamp = Date.now().toString(36);
  const made = { users: [], businesses: [], crews: [] };
  const browser = await chromium.launch();
  const errs = [];

  try {
    /* ── THE WORLD: a founder, and somebody they hand things to ─────────────── */
    const founder = await account(`shot.founder.${stamp}@example.com`, `Found Er ${stamp}`, "Pune");
    const second = await account(`shot.second.${stamp}@example.com`, `Sec Ond ${stamp}`, "Pune");
    made.users.push(founder.id, second.id);

    /* ══ A STUDIO WITH TWO OWNERS ═════════════════════════════════════════════ */
    const studio = await rpc(founder.h, "create_business_with_owner", {
      p_type: "studio",
      p_name: `Founder Studio ${stamp}`,
      p_area: "Kothrud",
      p_city: "Pune",
      p_styles: ["Hip-Hop"],
    });
    made.businesses.push(studio.id);

    /* a REAL seat through the real door, then handed the owner label — which is
       exactly how a studio comes to have two owners in the first place (R39) */
    const invite = await rpc(founder.h, "invite_person_to_business", { p_business_id: studio.id, p_user_id: second.id, p_role: "trainer" });
    await rpc(second.h, "accept_business_invite", { p_code: invite.code });
    await rpc(founder.h, "set_member_role", { p_business_id: studio.id, p_user_id: second.id, p_role: "owner" });

    const owners = await rows(founder.h, `business_members?business_id=eq.${studio.id}&member_role=eq.owner&deleted_at=is.null&select=user_id,created_at&order=created_at.asc`);
    check(owners.length === 2, `the studio has TWO owners, which is the state the ask is about — ${owners.length}`);

    const principal = await rpc(founder.h, "business_principal_owner", { p_business_id: studio.id });
    check(principal === founder.id, `⚠ the PRINCIPAL is the oldest live owner seat, and it is the founder — ${principal === founder.id ? "founder" : principal === second.id ? "THE SECOND OWNER" : String(principal)}`);

    /* ── 1. THE FOUNDER IS OFFERED THE REMOVAL ─────────────────────────────── */
    const fCtx = await browser.newContext({ viewport: { width: 430, height: 932 } });
    fCtx.on("weberror", (e) => errs.push(`PAGEERROR ${e.error().message}`));
    const fPage = await signIn(fCtx, founder.email);
    fPage.on("pageerror", (e) => errs.push(`PAGEERROR ${e.message}`));

    await fPage.goto(`${BASE}/business/${studio.id}/staff`, { waitUntil: "networkidle" });
    /* ⚠ THE SHEET OPENS ON AN OWNER AT ALL — it did not until today, because
       `manageable` excluded owners, which also hid Pay and History from them */
    await openMemberSheet(fPage, second.name);
    const fRemove = fPage.getByRole("button", { name: `Remove ${second.name} from the team` });
    check((await fRemove.count()) === 1, `the founder's own desk opens the other OWNER's sheet and offers Remove — ${await fRemove.count()}`);
    check((await fPage.getByRole("button", { name: `Pay ${second.name}` }).count()) === 1, "…and Pay, which the same gate used to close for every owner");

    /* ── 2. AND NOT ON THEIR OWN ROW ───────────────────────────────────────── */
    await fPage.goto(`${BASE}/business/${studio.id}/staff`, { waitUntil: "networkidle" });
    await openMemberSheet(fPage, founder.name);
    check(
      (await fPage.getByRole("button", { name: `Remove ${founder.name} from the team` }).count()) === 0,
      "⚠ …and the principal is offered no way to remove THEMSELVES — the RPC refuses it and the row offers only what it can do"
    );

    /* ── 3. THE OTHER OWNER IS OFFERED NOTHING ─────────────────────────────── */
    const sCtx = await browser.newContext({ viewport: { width: 430, height: 932 } });
    sCtx.on("weberror", (e) => errs.push(`PAGEERROR ${e.error().message}`));
    const sPage = await signIn(sCtx, second.email);
    sPage.on("pageerror", (e) => errs.push(`PAGEERROR ${e.message}`));

    await sPage.goto(`${BASE}/business/${studio.id}/staff`, { waitUntil: "networkidle" });
    await openMemberSheet(sPage, founder.name);
    check((await sPage.getByRole("button", { name: `Pay ${founder.name}` }).count()) === 1, "the SECOND owner's desk opens the founder's sheet (so the next check is an absence, not a closed sheet)");
    check(
      (await sPage.getByRole("button", { name: `Remove ${founder.name} from the team` }).count()) === 0,
      "⚠⚠ …and offers NO Remove — an owner who is not the principal cannot unseat the person who started the studio"
    );

    /* ── 4. THE REMOVAL ITSELF, END TO END ─────────────────────────────────── */
    await fPage.goto(`${BASE}/business/${studio.id}/staff`, { waitUntil: "networkidle" });
    await openMemberSheet(fPage, second.name);
    await fPage.getByRole("button", { name: `Remove ${second.name} from the team` }).click();
    /* ⚠ IT ASKS FIRST since 4 Oct 2026 */
    await fPage.getByRole("alertdialog", { name: `Remove ${second.name} from the team?` }).getByRole("button", { name: "Remove", exact: true }).click();
    await fPage.getByText(`${second.name} taken off the team`).waitFor({ timeout: 20000 });

    const after = await rows(founder.h, `business_members?business_id=eq.${studio.id}&deleted_at=is.null&select=user_id,member_role`);
    check(after.length === 1 && after[0].user_id === founder.id && after[0].member_role === "owner", `the seat is gone from the database and the founder's is the one that stands — [${after.map((r) => r.member_role).join(", ")}]`);

    /* ⚠ AND THE SEAT IS REALLY GONE FROM WHERE IT MATTERED — the switcher, which
       is what a seat on a business BUYS (R55) */
    await sPage.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await sPage.getByRole("button", { name: "Switch profile" }).click();
    await sPage.waitForTimeout(300);
    const sRows = await sPage.evaluate(() => [...document.querySelectorAll('[role="dialog"] a, [role="menu"] a, a[href^="/business/"]')].map((a) => a.textContent.replace(/\s+/g, " ").trim()).filter(Boolean));
    check(!sRows.some((r) => r.includes("Founder Studio")), `…and the removed owner's switcher no longer offers the studio — [${sRows.join(" / ") || "own row only"}]`);

    /* ══ A CREW HANDED OVER, AND TAKEN BACK ═══════════════════════════════════ */
    const crew = await rpc(founder.h, "create_crew", {
      p_name: `Founder Crew ${stamp}`,
      p_city: "Pune",
      p_style: "Hip-Hop",
      p_member_ids: [second.id],
    });
    made.crews.push(crew.id);

    const ask = (await rows(founder.h, `crew_members?crew_id=eq.${crew.id}&user_id=eq.${second.id}&deleted_at=is.null&select=id,status`))[0];
    await rpc(second.h, "respond_to_crew_ask", { p_member_id: ask.id, p_accept: true });
    /* THE HAND-OVER — `set_crew_member_role(_, 'leader')` demotes every other
       leader row in the same statement, which is why a crew cannot have two */
    await rpc(founder.h, "set_crew_member_role", { p_member_id: ask.id, p_role: "leader" });

    const handed = (await rows(founder.h, `crews?id=eq.${crew.id}&select=leader_id,created_by`))[0];
    check(handed.leader_id === second.id && handed.created_by === founder.id, "the crew is handed over: the leader is the other person and `created_by` still names the founder");

    /* ── 5. THE FOUNDER FINDS IT IN THE COLUMN THEY ARE NOW IN ─────────────── */
    await fPage.goto(`${BASE}/crews?show=in`, { waitUntil: "networkidle" });
    const inText = (await fPage.locator("body").innerText()).replace(/\s+/g, " ");
    check(inText.includes(`Founder Crew ${stamp}`), "⚠ the handed-over crew is in the founder's You-are-in column — they are a member of it now");
    check(inText.includes("You started this crew and handed it over"), "…and the row says so, rather than offering a button with no reason beside it");

    const takeBack = fPage.getByRole("button", { name: `Take Founder Crew ${stamp} back` });
    check((await takeBack.count()) === 1, `…with one Take it back — ${await takeBack.count()}`);

    /* ── 6. AND NOBODY ELSE HAS IT ─────────────────────────────────────────── */
    await sPage.goto(`${BASE}/crews`, { waitUntil: "networkidle" });
    const sLed = (await sPage.locator("body").innerText()).replace(/\s+/g, " ");
    check(sLed.includes(`Founder Crew ${stamp}`), "the person it was handed to has it under Yours — they lead it");
    check((await sPage.getByRole("button", { name: /^Take .* back$/ }).count()) === 0, "⚠⚠ …and is offered NO Take it back, on either column — the door is the FOUNDER's, not the leader's");

    /* ── 7. THE DOOR ITSELF ────────────────────────────────────────────────── */
    await takeBack.click();
    await fPage.waitForTimeout(1500);
    await fPage.goto(`${BASE}/crews`, { waitUntil: "networkidle" });
    const back = (await fPage.locator("body").innerText()).replace(/\s+/g, " ");
    check(back.includes(`Founder Crew ${stamp}`), "one press and the crew is back under the founder's Yours column");

    const reclaimed = (await rows(founder.h, `crews?id=eq.${crew.id}&select=leader_id`))[0];
    check(reclaimed.leader_id === founder.id, "…read back out of the database: the founder leads it again");
    const roster = await rows(founder.h, `crew_members?crew_id=eq.${crew.id}&deleted_at=is.null&select=user_id,role&order=role.asc`);
    const leaders = roster.filter((r) => r.role === "leader");
    check(leaders.length === 1 && leaders[0].user_id === founder.id, `⚠ exactly ONE leader row at any moment — [${roster.map((r) => r.role).join(", ")}]`);
    check(roster.some((r) => r.user_id === second.id && r.role === "member"), "…and the person who was leading it is a member, not removed — taking it back is not taking it away");

    check(errs.length === 0, `no page error on any of it${errs.length ? ` — ${errs.slice(0, 3).join(" | ")}` : ""}`);
  } catch (error) {
    check(false, `threw: ${error.message}`);
  } finally {
    /* ⚠ READ THE STATUS OF EVERY CLEANUP WRITE (29 Sep's own lesson) — a delete
       nobody checks is not a cleanup, and this script's leftovers are studios */
    for (const id of made.crews) {
      await call("DELETE", `/rest/v1/crews?id=eq.${id}`, H_SERVICE, undefined, `clean crew ${id}`).catch((e) => console.log(`  (crew ${id} not deleted: ${e.message})`));
    }
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
