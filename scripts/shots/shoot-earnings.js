/* The four earnings surfaces, driven as real accounts against the built app.
   Money screens, so this reads the REAL figures rather than trusting a compile:
   an owner with real payments, a real payout and a real asset, and the net
   between them checked by arithmetic rather than by eye. */
const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const REPO = "C:\\Users\\ADMIN\\Desktop\\Dancing App\\dancestudio";
const BASE = process.env.DANCEOS_BASE_URL || "http://localhost:3100";
const env = Object.fromEntries(
  fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation", "User-Agent": "danceos-proof" };

let ok = 0, bad = 0;
const check = (c, m) => { console.log((c ? "  ok   " : "  FAIL ") + m); c ? ok++ : bad++; };
const rupees = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;

async function rest(method, pathname, body) {
  const r = await fetch(`${SUPA}${pathname}`, { method, headers: admin, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${pathname} → ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

(async () => {
  const stamp = Date.now().toString(36);
  const email = `earn.${stamp}@example.com`;
  const password = `Earn!${stamp}aA1`;
  let userId = null;
  let businessId = null;
  const b = await chromium.launch();

  try {
    // ── a real owner, made the way every proof makes one
    const made = await rest("POST", "/auth/v1/admin/users", { email, password, email_confirm: true });
    userId = made.id;
    await rest("POST", "/rest/v1/profiles", { id: userId, full_name: `Earn Org ${stamp}`, role: "org", city: "Pune", created_by: userId, updated_by: userId });
    await rest("PATCH", `/rest/v1/profiles?id=eq.${userId}`, { verified_at: new Date().toISOString() });

    const [biz] = await rest("POST", "/rest/v1/businesses", {
      type: "studio", name: `Earn Studio ${stamp}`, area: "Kothrud", city: "Pune",
      lat: 18.5204, lng: 73.8567, visibility: "unlisted", styles: ["Hip-Hop"],
      created_by: userId, updated_by: userId,
    });
    businessId = biz.id;
    await rest("POST", "/rest/v1/business_members", { business_id: businessId, user_id: userId, member_role: "owner", created_by: userId, updated_by: userId });

    /* ⚠ an order must name a class+session, an event or a membership — the
       CHECK `orders_subject_check`. A CLASS order is what makes the payment
       bucket as "Classes", which is the residual once memberships and events
       are taken out, so it is the branch worth driving. */
    const [cls] = await rest("POST", "/rest/v1/classes", {
      business_id: businessId, title: "Hip-Hop · All levels", style: "Hip-Hop", level: "all",
      /* a DRAFT on purpose: publishing waits for a teacher to accept (18 Sep),
         and what this probe needs is a class for the ORDER to name, not a
         listing — the earnings read counts payments, never class status */
      capacity: 10, price_inr: 3000, status: "draft", created_by: userId, updated_by: userId,
    });
    const startsAt = new Date(Date.now() - 86400000).toISOString();
    const [session] = await rest("POST", "/rest/v1/class_sessions", {
      class_id: cls.id, business_id: businessId, starts_at: startsAt,
      ends_at: new Date(Date.now() - 82800000).toISOString(), created_by: userId, updated_by: userId,
    });

    // ── REVENUE: a captured class payment of ₹3,000 today
    const [order] = await rest("POST", "/rest/v1/orders", {
      business_id: businessId, user_id: userId, class_id: cls.id, session_id: session.id,
      amount_inr: 3000, status: "paid", provider: "cashfree", created_by: userId, updated_by: userId,
    });
    await rest("POST", "/rest/v1/payments", {
      order_id: order.id, business_id: businessId, user_id: userId, amount_inr: 3000,
      status: "captured", kind: "order", method: "upi", provider: "cashfree",
      provider_payment_id: `earn_${stamp}`, created_by: userId, updated_by: userId,
    });

    // ── EXPENSES: a ₹1,000 payout today, and a ₹500 asset
    const today = new Date().toISOString().slice(0, 10);
    await rest("POST", "/rest/v1/payouts", {
      business_id: businessId, user_id: userId, amount_inr: 1000, status: "done",
      method: "upi", paid_on: today, created_by: userId, updated_by: userId,
    });
    await rest("POST", "/rest/v1/assets", {
      business_id: businessId, name: `Earn PA ${stamp}`, category: "Sound & AV", value_inr: 500,
      created_by: userId, updated_by: userId,
    });
    // ⚠ and a LEGACY asset, which must add NOTHING to expenses
    await rest("POST", "/rest/v1/assets", {
      business_id: businessId, name: `Earn Mirrors ${stamp}`, category: "Mirrors", value_inr: 0,
      created_by: userId, updated_by: userId,
    });
    /* ⚠ WHAT THE STUDIO PAYS DANCEOS — ₹1,200 for the studio plan. The payment
       row carries NO business_id (that is how `20260912140000` writes one), so
       the earnings read has to reach it through the SUBSCRIPTION, with an
       embedded `!inner` filter. A query shaped like that fails at RUNTIME, never
       at compile — PostgREST answers 300 for an ambiguous embed and 400 for a
       bad filter — so it is driven here rather than trusted. */
    const [sub] = await rest("POST", "/rest/v1/subscriptions", {
      kind: "studio", user_id: userId, business_id: businessId, plan_key: "studio_monthly",
      price_inr: 1200, period: "monthly", status: "active", granted: false,
      current_period_start: today, current_period_end: today,
      created_by: userId, updated_by: userId,
    });
    await rest("POST", "/rest/v1/payments", {
      subscription_id: sub.id, user_id: userId, amount_inr: 1200, status: "captured",
      kind: "subscription_charge", method: "upi", provider: "cashfree",
      provider_payment_id: `earnsub_${stamp}`, created_by: userId, updated_by: userId,
    });

    const page = await b.newPage({ viewport: { width: 420, height: 1000 } });
    page.on("pageerror", (e) => { console.log("PAGEERROR " + e.message); bad++; });

    /* ⚠ A FILL IS NOT A FILL UNTIL REACT HAS CLAIMED THE FIELD. The submit is a
       real `disabled` until the form's own state says both fields are valid, so
       typing into a server-rendered page before hydration leaves the button
       dead — which reads exactly like a broken form. This repo learnt the same
       thing on the live QR probe. So: wait for the page, fill, and then wait for
       the button to become enabled rather than clicking hopefully. */
    await page.goto(`${BASE}/login/email`, { waitUntil: "networkidle" });
    const signIn = page.getByRole("button", { name: "Sign in" });
    await signIn.waitFor({ timeout: 60000 });
    for (let i = 0; i < 20; i++) {
      await page.getByLabel("Email address").fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      if (await signIn.isEnabled()) break;
      await page.waitForTimeout(1000);
    }
    await signIn.click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });

    // ───────────────── the studio's own desk ─────────────────
    await page.goto(`${BASE}/business/${businessId}/earnings?period=day`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Earnings" }).waitFor({ timeout: 20000 });

    const rev = (await page.getByTestId("earn-revenue").innerText()).trim();
    const exp = (await page.getByTestId("earn-expenses").innerText()).trim();
    const left = (await page.getByTestId("earn-left").innerText()).trim();
    /* ₹1,000 payout + ₹500 asset + ₹1,200 DanceOS subscription = ₹2,700 out */
    check(rev === rupees(3000), `studio · REVENUE reads ${rupees(3000)} (read ${rev})`);
    check(exp === rupees(2700), `studio · EXPENSES reads ${rupees(2700)} — the payout, the asset AND the subscription (read ${exp})`);
    check(left === rupees(300), `studio · WHAT IS LEFT is revenue − expenses (read ${left})`);

    const lines = await page.getByTestId("earn-line").allInnerTexts();
    const joined = lines.join(" | ");
    check(/Classes/.test(joined), "studio · the revenue breakup names Classes");
    check(/What you paid your people/.test(joined), "studio · the expense breakup names what you paid your people");
    check(/Assets bought/.test(joined), "studio · and Assets bought — the price linked to expenses (21 Sep)");
    check(/DanceOS subscription/.test(joined), "studio · and the DanceOS subscription — what it pays to be on Discover, an expense no ledger had ever shown");
    check(!/Earn Mirrors/.test(joined) && /₹500/.test(joined), "studio · the ₹0 legacy asset adds nothing — only the ₹500 one is counted");

    // the four period filters are links, so the period is in the URL
    for (const p of ["day", "week", "month", "year"]) {
      check((await page.getByRole("link", { name: p[0].toUpperCase() + p.slice(1), exact: true }).count()) === 1, `studio · a ${p} filter`);
    }
    await page.getByRole("link", { name: "Year", exact: true }).click();
    await page.waitForURL(/period=year/, { timeout: 15000 });
    check(/period=year/.test(page.url()), "studio · picking a period puts it in the URL — shareable, and it survives a navigation");
    const yearLeft = (await page.getByTestId("earn-left").innerText()).trim();
    check(yearLeft === rupees(300), `studio · and a wider window still nets the same money (read ${yearLeft})`);

    // the chart: one column per bucket, and the toggles
    await page.goto(`${BASE}/business/${businessId}/earnings?period=day`, { waitUntil: "networkidle" });
    check((await page.locator("[data-bucket]").count()) === 14, `studio · the chart draws 14 day columns (${await page.locator("[data-bucket]").count()})`);
    const revToggle = page.getByRole("button", { name: "Revenue" });
    check((await revToggle.getAttribute("aria-pressed")) === "true", "studio · Revenue is on");
    await revToggle.click();
    check((await revToggle.getAttribute("aria-pressed")) === "false", "studio · and it toggles off");

    // tapping an older column moves the figures, with no round trip
    const first = page.locator("[data-bucket]").first();
    const firstKey = await first.getAttribute("data-bucket");
    await first.click();
    const emptyLeft = (await page.getByTestId("earn-left").innerText()).trim();
    check(emptyLeft === rupees(0), `studio · a bucket with no money reads ${rupees(0)} (${firstKey} → ${emptyLeft})`);
    check(page.url().includes("period=day"), "studio · and picking a bucket does NOT navigate — every bucket came back in one read");

    // ───────────────── the organization's combined ─────────────────
    await page.goto(`${BASE}/business/earnings?period=day`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Earnings" }).waitFor({ timeout: 20000 });
    const orgLeft = (await page.getByTestId("earn-left").innerText()).trim();
    check(orgLeft === rupees(300), `org · combined nets the same ${rupees(300)} (read ${orgLeft})`);
    check((await page.getByTestId("earn-expenses").count()) === 1, "org · and it HAS an expense side, which it never had before 21 Sep");

    // ───────────────── a person's own ─────────────────
    await page.goto(`${BASE}/earnings?period=year`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Earnings" }).waitFor({ timeout: 20000 });
    const mineRev = (await page.getByTestId("earn-revenue").innerText()).trim();
    check(mineRev === rupees(1000), `person · what studios paid them reads ${rupees(1000)} (read ${mineRev})`);
    check((await page.getByTestId("earn-expenses").count()) === 0, "person · no Expenses block — a person employs nobody");
    const mineLeft = (await page.getByTestId("earn-left").innerText()).trim();
    check(mineLeft === rupees(1000), `person · so what is left IS what came in (read ${mineLeft})`);
  } catch (e) {
    console.log("\nTHREW: " + e.message);
    bad++;
  } finally {
    await b.close();
    try {
      if (businessId) await rest("DELETE", `/rest/v1/businesses?id=eq.${businessId}`);
      if (userId) await rest("DELETE", `/auth/v1/admin/users/${userId}`);
      console.log("\n  ·    cleaned up");
    } catch (e) { console.log("\n  ⚠ cleanup: " + e.message); }
  }
  console.log(`\n${ok} passed, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})();
