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
 *
 * The second test (10 Sep 2026) plays Cashfree SUBSCRIPTIONS against the same
 * route — the events a recurring mandate raises over its life — because the
 * mandate window itself is Cashfree's UI and no browser test drives it. It is
 * the one place the paid path of a studio's subscription is proved end to end.
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

/** 10 Sep 2026: a studio is born UNLISTED and goes public on ITS OWN subscription.
 *  The service role stands in for an admin's grant here — a granted, active row at
 *  ₹0 — and lists the studio as the grant would, so the class below is public. */
async function subscribeStudio(tenantId: string, ownerId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const until = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const granted = await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify({
      kind: "studio", user_id: ownerId, tenant_id: tenantId, plan_key: "studio_monthly", price_inr: 0, period: "monthly",
      status: "active", current_period_start: today, current_period_end: until, granted: true,
      note: "Granted by the webhook spec — nothing charged", created_by: ownerId, updated_by: ownerId,
    }),
  });
  if (!granted.ok) throw new Error(`could not grant the studio a subscription: ${granted.status} ${await granted.text()}`);
  const listed = await fetch(`${supabaseUrl}/rest/v1/tenants?id=eq.${tenantId}`, {
    method: "PATCH",
    headers: serviceHeaders,
    body: JSON.stringify({ visibility: "listed" }),
  });
  if (!listed.ok) throw new Error(`could not list the studio: ${listed.status} ${await listed.text()}`);
}

const sign = (timestamp: string, body: string) => createHmac("sha256", secretKey).update(`${timestamp}${body}`).digest("base64");

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
    await subscribeStudio(tenant.id, owner.userId);
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
    //    signs in through the real screens and the GROSS card reads the one
    //    captured payment, paid by UPI. This is the only place a REAL captured
    //    payment meets the income half's queries.
    //
    //    SIGN-IN IS EMAIL + PASSWORD NOW (7 Sep 2026, second session). The
    //    phone screens this block used to drive are gone. This test still lands
    //    a minted link on /auth/confirm rather than typing credentials: it needs
    //    a session, not a password, and the admin API is the cheapest way to one.
    //    A link WITHOUT type=recovery still routes to onboarding/Home, which is
    //    what this needs; only recovery links divert to /login/reset. The route
    //    under test is the one a real person uses.
    const page = await browser.newPage();
    try {
      const ownerEmail = `e2e-owner-${Date.now()}@example.com`;
      const patched = await fetch(`${supabaseUrl}/auth/v1/admin/users/${owner.userId}`, {
        method: "PUT",
        headers: serviceHeaders,
        body: JSON.stringify({ email: ownerEmail, email_confirm: true }),
      });
      if (!patched.ok) {
        throw new Error(`could not set owner email: ${patched.status} ${await patched.text()}`);
      }
      const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
        method: "POST",
        headers: serviceHeaders,
        body: JSON.stringify({ type: "magiclink", email: ownerEmail }),
      });
      if (!linkRes.ok) {
        throw new Error(`generate_link failed: ${linkRes.status} ${await linkRes.text()}`);
      }
      const link = (await linkRes.json()) as {
        hashed_token: string;
        verification_type?: string;
      };
      await page.goto(
        `/auth/confirm?token_hash=${link.hashed_token}&type=${link.verification_type ?? "magiclink"}`
      );
      await page.waitForURL((url) => !url.pathname.startsWith("/auth"));
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

test("cashfree subscription webhook: the authorisation pays the first period and lists the studio, the mandate's second event is a no-op, a renewal buys the next period, a failed charge is grace, a cancelled mandate keeps what was paid for", async ({
  request,
}) => {
  test.skip(
    !supabaseUrl || !anonKey || !serviceKey || !secretKey,
    "Supabase keys or CASHFREE_SECRET_KEY missing (.env.local or env)"
  );

  const stamp = Date.now().toString(36);
  const owner = await signInTestNumber("+919999999999");
  const tenant = await rpc<{ id: string; visibility: string }>(userHeaders(owner.token), "create_tenant_with_owner", {
    p_name: `Mandate Proof Studio ${stamp}`,
    p_type: "studio",
    p_area: "Kothrud",
    p_city: "Pune",
  });

  const post = (body: string) => {
    const ts = String(Date.now());
    return request.post("/api/webhooks/cashfree", {
      headers: { "content-type": "application/json", "x-webhook-signature": sign(ts, body), "x-webhook-timestamp": ts },
      data: body,
    });
  };
  const outcomeOf = async (res: Awaited<ReturnType<typeof post>>) => ((await res.json()) as { result?: { outcome?: string } }).result?.outcome;
  const subRow = async () =>
    (
      await rows<{ status: string; current_period_end: string | null; granted: boolean; cancel_at_period_end: boolean; failure_reason: string | null }>(
        userHeaders(owner.token),
        `subscriptions?id=eq.${sub.id}&select=status,current_period_end,granted,cancel_at_period_end,failure_reason`
      )
    )[0];
  const visibilityNow = async () => (await rows<{ visibility: string }>(serviceHeaders, `tenants?id=eq.${tenant.id}&select=visibility`))[0].visibility;
  const paymentsNow = () =>
    rows<{ kind: string; provider_payment_id: string; amount_inr: number }>(
      userHeaders(owner.token),
      `payments?subscription_id=eq.${sub.id}&select=kind,provider_payment_id,amount_inr&order=created_at.asc`
    );

  // a studio is born PRIVATE (10 Sep 2026)
  expect(tenant.visibility).toBe("unlisted");

  // the owner starts the subscription through the real RPC: OUR row first, at the
  // price list's price, waiting on the mandate
  const sub = await rpc<{ id: string; status: string; price_inr: number; period: string }>(userHeaders(owner.token), "subscribe", {
    p_plan_key: "studio_monthly",
    p_tenant_id: tenant.id,
  });
  try {
    expect(sub.status).toBe("pending_auth");
    expect(sub.price_inr).toBeGreaterThan(0);
    const providerSubscriptionId = `dos_sub_${sub.id.replace(/-/g, "")}_1`;
    const cfSubscriptionId = `${Date.now()}`.slice(-9);
    await rpc(userHeaders(owner.token), "attach_provider_subscription", {
      p_id: sub.id,
      p_provider_subscription_id: providerSubscriptionId,
      p_cf_subscription_id: cfSubscriptionId,
      p_provider_plan_id: "dos_plan_studio_monthly_spec",
      p_provider_status: "INITIALIZED",
    });
    const nextMonth = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const details = (subscription_status: string) => ({
      cf_subscription_id: cfSubscriptionId,
      subscription_id: providerSubscriptionId,
      subscription_status,
      next_schedule_date: nextMonth,
    });
    const authPaymentId = Number(`${Date.now()}`.slice(-9));

    // 1. the AUTHORISATION carries the first period's fee (payment_type AUTH):
    //    the plan is live, the period is set, and the studio is on Discover
    const authorised = await post(
      JSON.stringify({
        type: "SUBSCRIPTION_PAYMENT_SUCCESS",
        event_time: new Date().toISOString(),
        data: {
          cf_payment_id: authPaymentId,
          payment_id: `auth_${stamp}`,
          payment_type: "AUTH",
          payment_amount: sub.price_inr,
          payment_status: "SUCCESS",
          subscription_details: details("ACTIVE"),
          authorization_details: { authorization_amount: sub.price_inr, authorization_status: "ACTIVE", payment_group: "upi" },
        },
      })
    );
    expect(authorised.status()).toBe(200);
    expect(await outcomeOf(authorised)).toBe("subscribed");
    let row = await subRow();
    expect(row.status).toBe("active");
    expect(row.granted).toBe(false);
    expect(row.current_period_end).not.toBeNull();
    const firstPeriodEnd = row.current_period_end as string;
    expect(await visibilityNow()).toBe("listed");

    // 2. Cashfree ALSO sends AUTH_STATUS for the same mandate — one first period,
    //    never two: the applier is keyed on the subscription for an authorisation
    const authStatus = await post(
      JSON.stringify({
        type: "SUBSCRIPTION_AUTH_STATUS",
        event_time: new Date().toISOString(),
        data: {
          payment_id: `auth_${stamp}`,
          subscription_details: details("ACTIVE"),
          authorization_details: { authorization_amount: sub.price_inr, authorization_status: "ACTIVE", payment_group: "upi" },
        },
      })
    );
    expect(authStatus.status()).toBe(200);
    expect(await outcomeOf(authStatus)).toBe("duplicate");
    let payments = await paymentsNow();
    expect(payments).toHaveLength(1);
    expect(payments[0].kind).toBe("subscription_auth");
    expect(payments[0].provider_payment_id).toBe(`sub_auth_${cfSubscriptionId}`);
    expect(payments[0].amount_inr).toBe(sub.price_inr);

    // 3. a renewal CHARGE buys the next period, starting where the first ends
    const charged = await post(
      JSON.stringify({
        type: "SUBSCRIPTION_PAYMENT_SUCCESS",
        event_time: new Date().toISOString(),
        data: {
          cf_payment_id: authPaymentId + 1,
          payment_id: `charge_${stamp}`,
          payment_type: "CHARGE",
          payment_amount: sub.price_inr,
          payment_status: "SUCCESS",
          subscription_details: details("ACTIVE"),
        },
      })
    );
    expect(charged.status()).toBe(200);
    expect(await outcomeOf(charged)).toBe("subscribed");
    row = await subRow();
    expect(row.status).toBe("active");
    expect((row.current_period_end as string) > firstPeriodEnd).toBeTruthy();
    payments = await paymentsNow();
    expect(payments.map((p) => p.kind)).toEqual(["subscription_auth", "subscription_charge"]);
    expect(payments[1].provider_payment_id).toBe(String(authPaymentId + 1));

    // 4. a FAILED charge is three days of grace, not a lockout: past_due, the
    //    reason kept, the studio still on Discover
    const failed = await post(
      JSON.stringify({
        type: "SUBSCRIPTION_PAYMENT_FAILED",
        event_time: new Date().toISOString(),
        data: {
          cf_payment_id: authPaymentId + 2,
          payment_id: `fail_${stamp}`,
          payment_type: "CHARGE",
          payment_amount: sub.price_inr,
          payment_status: "FAILED",
          failure_details: { failure_reason: "Insufficient funds" },
          subscription_details: details("ACTIVE"),
        },
      })
    );
    expect(failed.status()).toBe(200);
    row = await subRow();
    expect(row.status).toBe("past_due");
    expect(row.failure_reason).toBe("Insufficient funds");
    expect(await visibilityNow()).toBe("listed");
    expect(await paymentsNow()).toHaveLength(2);

    // 5. the mandate is cancelled at Cashfree: what was paid for stands, nothing renews
    const cancelled = await post(
      JSON.stringify({
        type: "SUBSCRIPTION_STATUS_CHANGED",
        event_time: new Date().toISOString(),
        data: { subscription_details: details("CANCELLED") },
      })
    );
    expect(cancelled.status()).toBe(200);
    row = await subRow();
    expect(row.status).toBe("canceled");
    expect(row.cancel_at_period_end).toBe(true);
    expect(row.current_period_end).not.toBeNull();
    expect(await visibilityNow()).toBe("listed");
  } finally {
    // the tenant delete cascades the subscription; its payments keep their rows
    // with subscription_id set null (a ledger does not forget money)
    await fetch(`${supabaseUrl}/rest/v1/tenants?id=eq.${tenant.id}`, {
      method: "DELETE",
      headers: serviceHeaders,
    });
  }
});
