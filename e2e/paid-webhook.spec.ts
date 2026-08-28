import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";

/**
 * Step 9 (rail: Cashfree since 28 Aug 2026): the payment webhook pipeline, end
 * to end against the dev server — without a browser checkout. A real signed
 * delivery is Base64(HMAC-SHA256(timestamp + rawBody, SECRET KEY)), so the test
 * plays Cashfree: it creates a paid order through the real RPCs (as the
 * test-number users), then posts a PAYMENT_SUCCESS_WEBHOOK to
 * /api/webhooks/cashfree and watches the seat land.
 *
 * Proves: signature rejection, signature acceptance, the capture → enrollment
 * pipeline, and exactly-once replay handling (the event ledger + the RPC's own
 * idempotency on the provider payment id).
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const secretKey = process.env.CASHFREE_SECRET_KEY ?? "";

const serviceHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function signInTestNumber(phone: string): Promise<{ token: string; userId: string }> {
  const h = { apikey: anonKey, "Content-Type": "application/json" };
  await fetch(`${supabaseUrl}/auth/v1/otp`, { method: "POST", headers: h, body: JSON.stringify({ phone }) });
  const res = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ type: "sms", phone, token: "123456" }),
  });
  if (!res.ok) {
    throw new Error(`test-number sign-in failed for ${phone}: ${res.status}`);
  }
  const session = (await res.json()) as { access_token: string; user: { id: string } };
  return { token: session.access_token, userId: session.user.id };
}

function userHeaders(token: string) {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

async function rpc<T>(headers: Record<string, string>, fn: string, body: unknown): Promise<T> {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${fn} failed: ${res.status} ${await res.text()}`);
  }
  // a void RPC (attach_provider_order) comes back 204 with an empty body
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function rows<T>(headers: Record<string, string>, path: string): Promise<T[]> {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers });
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T[];
}

test("cashfree webhook: bad signature rejected, capture books the seat, replay is a no-op", async ({
  request,
  browser,
}) => {
  test.skip(
    !supabaseUrl || !anonKey || !serviceKey || !secretKey,
    "Supabase keys or CASHFREE_SECRET_KEY missing (.env.local or env)"
  );

  const stamp = Date.now().toString(36);
  const owner = await signInTestNumber("+919999999999");
  const learner = await signInTestNumber("+918888888888");

  const tenant = await rpc<{ id: string }>(userHeaders(owner.token), "create_tenant_with_owner", {
    p_name: `Webhook Proof Studio ${stamp}`,
    p_type: "studio",
    p_area: "Kothrud",
    p_city: "Pune",
  });

  try {
    const inSevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const created = await rpc<{ id: string }>(userHeaders(owner.token), "create_class_with_session", {
      p_tenant_id: tenant.id,
      p_title: `Webhook Paid ${stamp}`,
      p_style: "Hip-Hop",
      p_level: "beginner",
      p_room: "Studio A",
      p_price_inr: 300,
      p_capacity: 5,
      p_status: "published",
      p_starts_at: `${inSevenDays}T19:00:00+05:30`,
      p_ends_at: `${inSevenDays}T20:00:00+05:30`,
    });
    const sessions = await rows<{ id: string }>(serviceHeaders, `class_sessions?class_id=eq.${created.id}&select=id`);
    const sessionId = sessions[0].id;

    // the learner starts a paid booking through the real RPCs
    const order = await rpc<{ id: string }>(userHeaders(learner.token), "create_payment_order", {
      p_session_id: sessionId,
    });
    const providerOrderId = `dos_${order.id.replace(/-/g, "")}`;
    await rpc(userHeaders(learner.token), "attach_provider_order", {
      p_order_id: order.id,
      p_provider_order_id: providerOrderId,
    });

    // ---- the webhook delivery, exactly as Cashfree sends it -----------------
    // amounts are rupees with decimals on the wire; the body must reach the
    // route as this exact text or the signature breaks
    const cfPaymentId = Number(`${Date.now()}`.slice(-9));
    const body = JSON.stringify({
      data: {
        order: { order_id: providerOrderId, order_amount: 300.0, order_currency: "INR" },
        payment: {
          cf_payment_id: cfPaymentId,
          payment_status: "SUCCESS",
          payment_amount: 300.0,
          payment_currency: "INR",
          payment_group: "upi",
          payment_method: { upi: { channel: "collect", upi_id: "testsuccess@gocash" } },
        },
      },
      event_time: new Date().toISOString(),
      type: "PAYMENT_SUCCESS_WEBHOOK",
    });
    const timestamp = String(Date.now());
    const signature = createHmac("sha256", secretKey).update(`${timestamp}${body}`).digest("base64");

    // 1. a forged signature is turned away before anything else happens
    const forged = await request.post("/api/webhooks/cashfree", {
      headers: { "content-type": "application/json", "x-webhook-signature": Buffer.from("0".repeat(32)).toString("base64"), "x-webhook-timestamp": timestamp },
      data: body,
    });
    expect(forged.status()).toBe(401);

    // 2. the signed capture books the seat
    const delivered = await request.post("/api/webhooks/cashfree", {
      headers: { "content-type": "application/json", "x-webhook-signature": signature, "x-webhook-timestamp": timestamp },
      data: body,
    });
    expect(delivered.status()).toBe(200);
    const outcome = (await delivered.json()) as { result?: { outcome?: string } };
    expect(outcome.result?.outcome).toBe("enrolled");

    const enrollments = await rows<{ status: string }>(
      userHeaders(learner.token),
      `enrollments?session_id=eq.${sessionId}&select=status`
    );
    expect(enrollments).toHaveLength(1);
    expect(enrollments[0].status).toBe("enrolled");
    const orderRows = await rows<{ status: string; provider: string }>(
      userHeaders(learner.token),
      `orders?id=eq.${order.id}&select=status,provider`
    );
    expect(orderRows[0].status).toBe("paid");
    expect(orderRows[0].provider).toBe("cashfree");

    // 3. the same delivery again is acknowledged and changes nothing
    const replayed = await request.post("/api/webhooks/cashfree", {
      headers: { "content-type": "application/json", "x-webhook-signature": signature, "x-webhook-timestamp": timestamp },
      data: body,
    });
    expect(replayed.status()).toBe(200);
    // …and so is a RETRY with a fresh timestamp — a new ledger row, but the RPC
    // is idempotent on the provider payment id, so still one payment
    const retryTs = String(Date.now() + 1);
    const retried = await request.post("/api/webhooks/cashfree", {
      headers: { "content-type": "application/json", "x-webhook-signature": createHmac("sha256", secretKey).update(`${retryTs}${body}`).digest("base64"), "x-webhook-timestamp": retryTs },
      data: body,
    });
    expect(retried.status()).toBe(200);
    expect(((await retried.json()) as { result?: { outcome?: string } }).result?.outcome).toBe("duplicate");
    const payments = await rows<{ id: string; provider_payment_id: string }>(
      userHeaders(learner.token),
      `payments?order_id=eq.${order.id}&select=id,provider_payment_id`
    );
    expect(payments).toHaveLength(1);
    expect(payments[0].provider_payment_id).toBe(String(cfPaymentId));

    // 4. the studio's own screen counts that money (Step 13b part 2b): the owner
    //    signs in through the real screens — test number, OTP 123456 — and the
    //    GROSS card reads the one captured payment, paid by UPI. This is the
    //    only place a REAL captured payment meets the income half's queries.
    const page = await browser.newPage();
    try {
      await page.goto("/login/phone");
      await page.getByRole("button", { name: /Mobile/ }).click();
      await page.getByPlaceholder("10-digit mobile number").fill("9999999999");
      // the API half of this spec requested an OTP for the same number moments
      // ago, and Supabase rate-limits a second request ("you can only request
      // this after N seconds") — so ask again until the cooldown has passed
      await expect(async () => {
        await page.getByRole("button", { name: "Send OTP" }).click();
        await page.waitForURL(/\/login\/verify/, { timeout: 4_000 });
      }).toPass({ intervals: [2_500, 3_000, 4_000], timeout: 40_000 });
      // the code goes into a visually hidden input behind the six boxes
      await page.getByLabel("One-time password").focus();
      await page.keyboard.type("123456");
      await page.waitForURL((url) => !url.pathname.startsWith("/login"));
      await page.goto(`/business/${tenant.id}/earnings`);
      await expect(page.getByText(/^GROSS · [A-Z]+$/)).toBeVisible();
      await expect(page.getByText("₹300", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("UPI 100%")).toBeVisible();
    } finally {
      await page.close();
    }
  } finally {
    // tenant delete cascades class → session → enrollment → order → payment;
    // the webhook_events ledger row is machine history and stays
    await fetch(`${supabaseUrl}/rest/v1/tenants?id=eq.${tenant.id}`, {
      method: "DELETE",
      headers: serviceHeaders,
    });
  }
});
