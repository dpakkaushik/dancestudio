/* AN ENQUIRY'S MONEY, END TO END, AGAINST THE REAL CASHFREE SANDBOX (3 Oct 2026).
   The user: "fix last 2 as well" — the second being that no real Cashfree refund
   had ever been driven through an accepted ending.

   Everything is the app's own code except ONE thing no script can press:
   Cashfree's checkout window. The probe stands in for that window only — it
   captures the payment session the APP opened (startEnquiryCheckoutAction) and
   pays it through Cashfree's sandbox Order Pay API with the sandbox UPI handle
   `testsuccess@gocash`, which really captures. Then the app's own
   confirmCheckoutAction asks Cashfree what happened; the sender proposes ending
   terms; the owner presses "Accept these terms" in a browser, whose action files
   the refund AND sends it to Cashfree (sendEnquiryRefunds); and the refund is read
   back from Cashfree itself and from the database after the studio's ledger
   reconciles it.

   ⚠ Sandbox only — it refuses to run unless CASHFREE_ENV=sandbox.

   Run:  $env:DANCEOS_BASE_URL="http://localhost:3100"; $env:NODE_PATH="$pwd\node_modules"; node scripts/shots/shoot-enquiry-money.js  */
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
const CF = "https://sandbox.cashfree.com/pg";
const cfH = { "x-client-id": env.CASHFREE_APP_ID, "x-client-secret": env.CASHFREE_SECRET_KEY, "x-api-version": "2025-01-01", "Content-Type": "application/json" };

let ok = 0, bad = 0;
const check = (c, m) => { console.log((c ? "  ok   " : "  FAIL ") + m); c ? ok++ : bad++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, url, headers, body) {
  const r = await fetch(url.startsWith("http") ? url : `${SUPA}${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${url} -> ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}
async function cf(method, p, body) {
  const r = await fetch(CF + p, { method, headers: cfH, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`Cashfree ${method} ${p} -> ${r.status} ${t.slice(0, 300)}`);
  return JSON.parse(t);
}

async function makeAccount(stamp, who, fullName) {
  const email = `money.${who}.${stamp}@example.com`;
  const password = `Money!${stamp}aA1`;
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

/* the ONE stand-in: Cashfree's SDK is replaced, for this page only, by a window
   that hands the session to the probe and waits to be told it closed */
const SDK_STUB = `window.Cashfree = function () {
  return { checkout: function (o) { window.__cfSession = o.paymentSessionId; return new Promise(function (r) { window.__cfClose = r; }); } };
};`;

(async () => {
  if (env.CASHFREE_ENV !== "sandbox") throw new Error(`refusing: CASHFREE_ENV is ${env.CASHFREE_ENV}, not sandbox`);
  const stamp = Date.now().toString(36);
  const made = { users: [], businesses: [] };
  const browser = await chromium.launch();
  try {
    const owner = await makeAccount(stamp, "owner", `Omega Owner ${stamp}`);
    made.users.push(owner.id);
    const sender = await makeAccount(stamp, "sender", `Sigma Sender ${stamp}`);
    made.users.push(sender.id);
    const studio = await call("POST", "/rest/v1/rpc/create_business_with_owner", owner.h, { p_type: "studio", p_name: `Omega Hall ${stamp}`, p_area: "Kothrud", p_city: "Pune", p_styles: ["Hip-Hop"] });
    made.businesses.push(studio.id);
    /* listed: an enquiry only ever reaches a listed studio (shoot-inbox's own set-up) */
    await call("POST", "/rest/v1/subscriptions", svc, {
      kind: "studio", user_id: owner.id, business_id: studio.id, plan_key: "studio_monthly",
      price_inr: 0, period: "monthly", status: "active",
      current_period_start: new Date().toISOString().slice(0, 10),
      current_period_end: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
      granted: true, note: "Granted by a shoot script — nothing charged", created_by: owner.id, updated_by: owner.id,
    });
    await call("PATCH", `/rest/v1/businesses?id=eq.${studio.id}`, svc, { verified_at: new Date().toISOString(), visibility: "listed" });

    /* the enquiry through the real doors: sent, accepted, quoted ₹1,000 with a 50%
       advance, and the quote accepted by the person quoted */
    const [enq] = await call("POST", "/rest/v1/enquiries", svc, {
      business_id: studio.id, from_user_id: sender.id, type_key: "private", fields: [["Session format", "One-on-one"]],
      dates: ["2026-11-20"], message: "Money probe", status: "new", created_by: sender.id, updated_by: sender.id,
    });
    await call("POST", "/rest/v1/rpc/respond_to_enquiry", owner.h, { p_enquiry_id: enq.id, p_accept: true, p_reason: null });
    await call("POST", "/rest/v1/rpc/send_enquiry_quote", owner.h, { p_enquiry_id: enq.id, p_items: null, p_lump_inr: 1000, p_advance_pct: 50, p_valid_until: null, p_note: null });
    const [quote] = await call("GET", `/rest/v1/enquiry_quotes?enquiry_id=eq.${enq.id}&deleted_at=is.null&select=id,status&order=created_at.desc&limit=1`, svc);
    await call("POST", "/rest/v1/rpc/answer_enquiry_quote", sender.h, { p_quote_id: quote.id, p_answer: "accept", p_reason: null });
    check(true, `set-up: a listed studio, an enquiry accepted, quoted ₹1,000 at 50% and accepted (${enq.id.slice(0, 8)})`);

    /* ── THE SENDER PAYS THE ADVANCE ── */
    const sp = await (await browser.newContext({ viewport: { width: 430, height: 932 } })).newPage();
    await sp.route("https://sdk.cashfree.com/js/v3/cashfree.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: SDK_STUB }));
    await signIn(sp, sender);
    await sp.goto(`${BASE}/inbox/enquiries/${enq.id}`, { waitUntil: "networkidle" });
    const payBtn = sp.getByTestId("enquiry-pay").first();
    await payBtn.waitFor({ timeout: 30000 });
    check(/₹500/.test(await payBtn.innerText()), `the sender is asked for the advance (${(await payBtn.innerText()).trim()})`);
    await payBtn.click();
    await sp.waitForFunction(() => Boolean(window.__cfSession), null, { timeout: 60000 });
    const session = await sp.evaluate(() => window.__cfSession);
    const [order] = await call("GET", `/rest/v1/orders?enquiry_quote_id=eq.${quote.id}&select=id,status,amount_inr,provider,provider_order_id,enquiry_part&order=created_at.desc&limit=1`, svc);
    check(order && order.amount_inr === 500 && order.provider === "cashfree" && Boolean(order.provider_order_id), `the APP made our order and a Cashfree order: ₹${order?.amount_inr} ${order?.enquiry_part} on ${order?.provider_order_id}`);

    /* the stand-in for the window: pay the app's own session in the sandbox */
    await cf("POST", "/orders/sessions", { payment_session_id: session, payment_method: { upi: { channel: "collect", upi_id: "testsuccess@gocash" } } });
    let cfPay = null;
    for (let i = 0; i < 20 && !cfPay; i++) {
      await sleep(3000);
      const ps = await cf("GET", `/orders/${order.provider_order_id}/payments`);
      cfPay = ps.find((p) => p.payment_status === "SUCCESS") || null;
    }
    check(Boolean(cfPay), `Cashfree captured ₹${cfPay?.payment_amount} on the app's order (payment ${cfPay?.cf_payment_id})`);
    await sp.evaluate(() => window.__cfClose({ paymentDetails: { paymentMessage: "probe" } }));
    await sp.getByText(/Paid — they have been told|Payment received — confirming it now/).first().waitFor({ timeout: 30000 }).catch(() => {});
    const [paidOrder] = await call("GET", `/rest/v1/orders?id=eq.${order.id}&select=status`, svc);
    const pays = await call("GET", `/rest/v1/payments?order_id=eq.${order.id}&select=id,status,amount_inr,provider_payment_id,method`, svc);
    check(paidOrder.status === "paid" && pays.length === 1 && pays[0].status === "captured" && String(pays[0].provider_payment_id) === String(cfPay?.cf_payment_id),
      `confirmCheckoutAction applied the REAL payment: order ${paidOrder.status}, payment ${pays[0]?.status} ₹${pays[0]?.amount_inr} ${pays[0]?.method} (${pays[0]?.provider_payment_id})`);

    /* ── AFTER MONEY, ENDING IS TERMS: the sender proposes ₹300 back ── */
    await call("POST", "/rest/v1/rpc/end_enquiry", sender.h, { p_enquiry_id: enq.id, p_reason: "Plans changed — money probe", p_refund_inr: 300 });
    const [ending] = await call("GET", `/rest/v1/enquiry_endings?enquiry_id=eq.${enq.id}&select=id,status,refund_inr&order=created_at.desc&limit=1`, svc);
    check(ending && ending.refund_inr === 300, `the sender's terms are open: ₹${ending?.refund_inr} back (${ending?.status})`);

    /* ── THE OWNER ACCEPTS IN A BROWSER — the press that sends the money ── */
    const op = await (await browser.newContext({ viewport: { width: 430, height: 932 } })).newPage();
    await signIn(op, owner);
    await op.goto(`${BASE}/inbox/enquiries/${enq.id}`, { waitUntil: "networkidle" });
    const acc = op.getByRole("button", { name: "Accept these terms" });
    await acc.waitFor({ timeout: 30000 });
    await acc.click();
    await op.getByText("Agreed — the enquiry is closed").waitFor({ timeout: 30000 }).catch(() => {});
    const [closed] = await call("GET", `/rest/v1/enquiries?id=eq.${enq.id}&select=status`, svc);
    check(/called_off|withdrawn|ended|cancel/.test(closed.status), `the enquiry is closed by the agreed terms (${closed.status})`);
    let rf = [];
    for (let i = 0; i < 10; i++) {
      rf = await call("GET", `/rest/v1/refunds?order_id=eq.${order.id}&select=id,status,amount_inr,user_id,provider_refund_id`, svc);
      if (rf.length && rf[0].provider_refund_id) break;
      await sleep(1500);
    }
    check(rf.length === 1 && rf[0].amount_inr === 300 && rf[0].user_id === sender.id, `one refund of ₹${rf[0]?.amount_inr}, filed against the PAYER (${rf[0]?.user_id === sender.id ? "the sender" : rf[0]?.user_id})`);
    check(Boolean(rf[0]?.provider_refund_id), `the accept SENT it to Cashfree — cf_refund_id ${rf[0]?.provider_refund_id ?? "missing (the send failed or was skipped)"}`);

    /* ── CASHFREE'S OWN WORD ── */
    const rid = `rf_${rf[0].id.replace(/-/g, "")}`;
    let cfRf = null;
    for (let i = 0; i < 20; i++) {
      cfRf = await cf("GET", `/orders/${order.provider_order_id}/refunds/${rid}`);
      if (cfRf.refund_status === "SUCCESS") break;
      await sleep(3000);
    }
    check(cfRf && Number(cfRf.refund_amount) === 300, `Cashfree holds the refund under OUR id: ₹${cfRf?.refund_amount}, ${cfRf?.refund_status}`);

    /* ── AND THE LEDGER LANDS IT: opening the studio's refunds desk reconciles ── */
    await op.goto(`${BASE}/business/${studio.id}/refunds`, { waitUntil: "networkidle" });
    let after = rf[0];
    for (let i = 0; i < 6; i++) {
      [after] = await call("GET", `/rest/v1/refunds?id=eq.${rf[0].id}&select=status`, svc);
      if (after.status !== "pending") break;
      await sleep(2000);
      await op.reload({ waitUntil: "networkidle" });
    }
    if (cfRf?.refund_status === "SUCCESS") check(after.status === "processed", `the studio's ledger reconciled it against Cashfree: ${after.status}`);
    else console.log(`  info Cashfree still says ${cfRf?.refund_status}; the row reads ${after.status} (it lands on a later open)`);
    const [orderAfter] = await call("GET", `/rest/v1/orders?id=eq.${order.id}&select=status`, svc);
    console.log(`  info order now: ${orderAfter.status}`);
  } catch (e) {
    check(false, `aborted: ${e.message}`);
  } finally {
    await browser.close();
    for (const id of made.businesses) {
      const r = await fetch(`${SUPA}/rest/v1/businesses?id=eq.${id}`, { method: "DELETE", headers: svc });
      if (!r.ok) console.log(`  cleanup: business ${id} -> ${r.status} ${(await r.text()).slice(0, 160)}`);
    }
    for (const id of made.users) {
      const r = await fetch(`${SUPA}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: svc });
      if (!r.ok) console.log(`  cleanup: user ${id} -> ${r.status} ${(await r.text()).slice(0, 160)}`);
    }
    console.log(`\n${ok} passed, ${bad} failed`);
    process.exit(bad ? 1 : 0);
  }
})();
