import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";

/**
 * Step 9: the Razorpay webhook pipeline, end to end against the dev server —
 * without a Razorpay account. A real signed delivery is just an HMAC over the
 * raw body with OUR webhook secret, so the test plays Razorpay: it creates a
 * paid order through the real RPCs (as the test-number users), then posts a
 * payment.captured event to /api/webhooks/razorpay and watches the seat land.
 *
 * Proves: signature rejection, signature acceptance, the capture → enrollment
 * pipeline, and exactly-once replay handling (the event ledger).
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";

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
  // a void RPC (attach_razorpay_order) comes back 204 with an empty body
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

test("razorpay webhook: bad signature rejected, capture books the seat, replay is a no-op", async ({
  request,
  browser,
}) => {
  test.skip(
    !supabaseUrl || !anonKey || !serviceKey || !webhookSecret,
    "Supabase keys or RAZORPAY_WEBHOOK_SECRET missing (.env.local or env)"
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
    const rzpOrderId = `order_e2e${stamp}`;
    await rpc(userHeaders(learner.token), "attach_razorpay_order", {
      p_order_id: order.id,
      p_razorpay_order_id: rzpOrderId,
    });

    // ---- the webhook delivery, exactly as Razorpay sends it ----------------
    const rzpPaymentId = `pay_e2e${stamp}`;
    const body = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: { entity: { id: rzpPaymentId, order_id: rzpOrderId, amount: 30000, method: "upi" } },
      },
    });
    const signature = createHmac("sha256", webhookSecret).update(body).digest("hex");
    const eventId = `evt_e2e${stamp}`;

    // 1. a forged signature is turned away before anything else happens
    const forged = await request.post("/api/webhooks/razorpay", {
      headers: { "content-type": "application/json", "x-razorpay-signature": "0".repeat(64), "x-razorpay-event-id": eventId },
      data: body,
    });
    expect(forged.status()).toBe(401);

    // 2. the signed capture books the seat
    const delivered = await request.post("/api/webhooks/razorpay", {
      headers: { "content-type": "application/json", "x-razorpay-signature": signature, "x-razorpay-event-id": eventId },
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
    const orderRows = await rows<{ status: string }>(
      userHeaders(learner.token),
      `orders?id=eq.${order.id}&select=status`
    );
    expect(orderRows[0].status).toBe("paid");

    // 3. the same delivery again is acknowledged and changes nothing
    const replayed = await request.post("/api/webhooks/razorpay", {
      headers: { "content-type": "application/json", "x-razorpay-signature": signature, "x-razorpay-event-id": eventId },
      data: body,
    });
    expect(replayed.status()).toBe(200);
    const payments = await rows<{ id: string }>(
      userHeaders(learner.token),
      `payments?order_id=eq.${order.id}&select=id`
    );
    expect(payments).toHaveLength(1);

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
