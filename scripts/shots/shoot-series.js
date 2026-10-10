/* A WEEKLY CLASS, END TO END (13 Oct 2026): an artist makes one through the real
   RPC, the card says "Weekly · N left", the class page draws a chip per week, a
   learner books WEEK TWO from its chip, the artist calls week two off (the seat
   comes off, week one stays), Run longer adds weeks, and the Add Class form's
   switch counts its sessions. The class is soft-deleted afterwards. */
const fs = require("fs");
const { chromium } = require("@playwright/test");
const { createClient } = require("@supabase/supabase-js");
const root = "C:/Users/ADMIN/Desktop/Dancing App/dancestudio";
const env = {};
for (const line of fs.readFileSync(`${root}/.env.local`, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const BASE = process.env.DANCEOS_BASE_URL || "http://localhost:3100";
const PASSWORD = "Demo-passw0rd!";
const ARTIST = "demo.aditya@example.com";
const LEARNER = "demo.kabir@example.com";
let ok = 0, bad = 0;
const check = (c, m) => { if (c) { ok++; console.log("PASS  " + m); } else { bad++; console.log("FAIL  " + m); } };
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const istDate = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const shift = (d, days) => new Date(Date.parse(`${d}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

async function signIn(page, email) {
  await page.goto(`${BASE}/login/email`, { waitUntil: "networkidle" });
  const btn = page.getByRole("button", { name: "Sign in" });
  await btn.waitFor({ timeout: 60000 });
  for (let i = 0; i < 20; i++) {
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    if (await btn.isEnabled()) break;
    await page.waitForTimeout(800);
  }
  await btn.click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });
}

(async () => {
  const artistDb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: au, error: ae } = await artistDb.auth.signInWithPassword({ email: ARTIST, password: PASSWORD });
  if (ae) throw ae;
  const { data: page0 } = await admin.from("business_members").select("business_id, businesses!inner(type)").eq("user_id", au.user.id).eq("member_role", "owner").eq("businesses.type", "artist_page").is("deleted_at", null).limit(1);
  const pageId = page0?.[0]?.business_id;
  check(Boolean(pageId), "the artist has a page");

  const first = shift(istDate(Date.now()), 2);
  const until = shift(first, 21); // four sessions
  const { data: created, error: ce } = await artistDb.rpc("create_class_series", {
    p_business_id: pageId, p_title: "Salsa · All levels", p_style: "Salsa", p_level: "all", p_room: null,
    p_price_inr: 0, p_capacity: 10, p_status: "draft",
    p_starts_at: `${first}T19:00:00+05:30`, p_ends_at: `${first}T20:00:00+05:30`,
    p_room_id: null, p_poster: null, p_venue_business_id: null,
    p_lat: 18.52, p_lng: 73.85, p_maps_url: "https://maps.google.com/?q=18.52,73.85", p_repeat_until: until,
  });
  check(!ce && created?.id, `create_class_series made the class ${ce ? ce.message : ""}`);
  const classId = created.id;
  const slug = created.share_slug;
  try {
    const { data: ses } = await admin.from("class_sessions").select("id, starts_at").eq("class_id", classId).is("deleted_at", null).order("starts_at");
    check(ses.length === 4, `four weekly sessions (${ses.length})`);
    const { error: pe } = await artistDb.from("classes").update({ status: "published" }).eq("id", classId).select("id");
    check(!pe, `the artist publishes it ${pe ? pe.message : ""}`);

    const b = await chromium.launch();
    const errs = [];
    // ── the learner: the card's chip, the chips, booking week two
    const lctx = await b.newContext({ viewport: { width: 390, height: 860 } });
    const lp = await lctx.newPage();
    lp.on("pageerror", (e) => errs.push(e.message));
    await signIn(lp, LEARNER);
    await lp.goto(`${BASE}/c/${slug}`, { waitUntil: "networkidle" });
    const chips = lp.getByTestId("series-chip");
    check((await chips.count()) === 4, `four date chips on the class page (${await chips.count()})`);
    check((await chips.first().getAttribute("aria-current")) === "true", "the first week is picked by default");
    await chips.nth(1).click();
    await lp.waitForURL((u) => u.searchParams.get("session") === ses[1].id, { timeout: 15000 });
    check(true, "the second chip puts ?session= on the address");
    await lp.waitForTimeout(800);
    check((await lp.getByTestId("series-chip").nth(1).getAttribute("aria-current")) === "true", "the second chip reads as picked");
    await lp.getByRole("button", { name: "Book Now", exact: true }).click();
    const sheet = lp.getByRole("dialog", { name: "Confirm — no payment" });
    await sheet.getByRole("button", { name: "Confirm free trial" }).click();
    await lp.getByText(/You.re booked/).waitFor({ timeout: 15000 });
    const { data: bks } = await admin.from("class_bookings").select("id, session_id, status").eq("class_id", classId).eq("status", "enrolled").is("deleted_at", null);
    check(bks.length === 1 && bks[0].session_id === ses[1].id, "the seat is on WEEK TWO, not week one");
    await lp.goto(`${BASE}/c/${slug}`, { waitUntil: "networkidle" });
    check((await lp.getByText(/You.re booked/).count()) === 0, "week one shows no seat for the learner");
    await lp.goto(`${BASE}/discover?tab=classes&city=all`, { waitUntil: "networkidle" });
    const seriesChip = lp.locator('[data-testid="class-series"]');
    check((await seriesChip.count()) >= 1, "Discover's card wears the Weekly chip");
    check(/Weekly · 4 left/.test((await seriesChip.allInnerTexts()).join("|")), `…reading "Weekly · 4 left" (${(await seriesChip.allInnerTexts()).join("|")})`);

    // ── the artist: call week two off, run longer, the form's switch
    const actx = await b.newContext({ viewport: { width: 390, height: 860 } });
    const ap = await actx.newPage();
    ap.on("pageerror", (e) => errs.push(e.message));
    await signIn(ap, ARTIST);
    await ap.goto(`${BASE}/c/${slug}?session=${ses[1].id}`, { waitUntil: "networkidle" });
    await ap.getByTestId("series-call-off").click();
    const dlg = ap.getByRole("alertdialog");
    await dlg.waitFor();
    await ap.waitForTimeout(600);
    try {
      await dlg.getByRole("button", { name: "Call it off" }).click({ timeout: 10000 });
    } catch (e) {
      await ap.screenshot({ path: `${__dirname}/fail-dialog.png` });
      console.log("dialogs:", await ap.locator('[role="alertdialog"]').count(), "url:", ap.url());
      throw e;
    }
    await ap.waitForURL((u) => !u.searchParams.get("session"), { timeout: 20000 });
    await ap.waitForTimeout(1000);
    const { data: s2 } = await admin.from("class_sessions").select("deleted_at").eq("id", ses[1].id).single();
    check(Boolean(s2.deleted_at), "week two is called off");
    const { data: b2 } = await admin.from("class_bookings").select("status").eq("id", bks[0].id).single();
    check(b2.status === "cancelled", `the learner's seat on it is cancelled (${b2.status})`);
    const { data: n } = await admin.from("notifications").select("title").eq("user_id", (await admin.from("class_bookings").select("user_id").eq("id", bks[0].id).single()).data.user_id).ilike("title", "%called off%").order("created_at", { ascending: false }).limit(1);
    check(n?.length === 1, `the learner is told (${n?.[0]?.title ?? "nothing"})`);
    check((await ap.getByTestId("series-chip").count()) === 3, `three chips left (${await ap.getByTestId("series-chip").count()})`);

    await ap.getByTestId("series-run-longer").click();
    await ap.getByTestId("series-run-longer-go").click();
    await ap.getByTestId("series-msg").waitFor({ timeout: 20000 });
    const msg = await ap.getByTestId("series-msg").innerText();
    check(/Added \d+ weeks?/.test(msg), `Run longer adds weeks (${msg})`);
    const { count: live } = await admin.from("class_sessions").select("id", { count: "exact", head: true }).eq("class_id", classId).is("deleted_at", null);
    check(live > 3, `the class has more live sessions now (${live})`);

    await ap.goto(`${BASE}/my-classes?show=mine&new=1`, { waitUntil: "networkidle" });
    const sw = ap.getByRole("switch", { name: "Repeats weekly" });
    check((await sw.count()) === 1, "the Add Class form offers Repeats weekly");
    if (await sw.count()) {
      await ap.getByLabel("Class date").fill(first);
      await sw.click();
      const count = await ap.getByTestId("repeat-count").innerText();
      check(/8 sessions/.test(count), `…counting its sessions (${count})`);
    }
    const scroll = await ap.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(scroll <= 0, `no sideways scroll (${scroll})`);
    check(errs.length === 0, `no page error ${errs.join(" | ")}`);
    await b.close();
  } finally {
    const now = new Date().toISOString();
    await admin.from("class_bookings").update({ status: "cancelled", deleted_at: now }).eq("class_id", classId);
    await admin.from("class_sessions").update({ deleted_at: now }).eq("class_id", classId).is("deleted_at", null);
    const { error: de } = await admin.from("classes").update({ deleted_at: now }).eq("id", classId);
    console.log(de ? `cleanup FAILED: ${de.message}` : "cleanup: the probe class soft-deleted");
  }
  console.log(`${ok} passed, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
