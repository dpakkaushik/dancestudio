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
      kind: "studio", user_id: ownerId, business_id: tenantId, plan_key: "studio_monthly", price_inr: 0, period: "monthly",
      status: "active", current_period_start: today, current_period_end: until, granted: true,
      note: "Granted by the webhook spec — nothing charged", created_by: ownerId, updated_by: ownerId,
    }),
  });
  if (!granted.ok) throw new Error(`could not grant the studio a subscription: ${granted.status} ${await granted.text()}`);
  const listed = await fetch(`${supabaseUrl}/rest/v1/businesses?id=eq.${tenantId}`, {
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

  const tenant = await rpc<{ id: string }>(userHeaders(owner.token), "create_business_with_owner", {
    p_name: `Webhook Proof Studio ${stamp}`,
    p_type: "studio",
    p_area: "Kothrud",
    p_city: "Pune",
    // a studio says what it dances (19 Sep 2026) — the RPC refuses one without
    p_styles: ["Hip-Hop"],
  });

  try {
    await subscribeStudio(tenant.id, owner.userId);
    const inSevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const created = await rpc<{ id: string }>(userHeaders(owner.token), "create_class_with_session", {
      p_business_id: tenant.id,
      /* a class has no name (17 Sep 2026): its title is "{style} · {level}", what the app writes.
         And since 18 Sep 2026 it is born a DRAFT: publishing waits for the teacher's
         yes, which the learner gives below — so a seat can be sold at all. */
      p_title: "Hip-Hop · Beginner",
      p_style: "Hip-Hop",
      p_level: "beginner",
      p_room: "Studio A",
      p_price_inr: 300,
      p_capacity: 5,
      p_status: "draft",
      p_starts_at: `${inSevenDays}T19:00:00+05:30`,
      p_ends_at: `${inSevenDays}T20:00:00+05:30`,
    });
    /* the ask and the yes, then the owner publishes — what the register does. The
       service role stands in for the ask-and-accept the way it stands in for the
       admin's grant above; the PUBLISH itself still goes through the trigger. */
    const seated = await fetch(`${supabaseUrl}/rest/v1/class_people`, {
      method: "POST",
      headers: serviceHeaders,
      body: JSON.stringify({
        class_id: created.id,
        business_id: tenant.id,
        user_id: learner.userId,
        kind: "artist",
        status: "confirmed",
        can_attendance: false,
        can_refunds: false,
        pay_per_session_inr: 0,
        created_by: learner.userId,
        updated_by: learner.userId,
      }),
    });
    if (!seated.ok) throw new Error(`could not seat the teacher: ${seated.status} ${await seated.text()}`);
    const published = await fetch(`${supabaseUrl}/rest/v1/classes?id=eq.${created.id}`, {
      method: "PATCH",
      headers: userHeaders(owner.token),
      body: JSON.stringify({ status: "published" }),
    });
    if (!published.ok) throw new Error(`could not publish the class: ${published.status} ${await published.text()}`);
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

    const class_bookings = await rows<{ status: string }>(
      userHeaders(learner.token),
      `class_bookings?session_id=eq.${sessionId}&select=status`
    );
    expect(class_bookings).toHaveLength(1);
    expect(class_bookings[0].status).toBe("enrolled");
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
      /* ⚠ RE-CUT 21 Sep 2026. This asked for the `GROSS · SEPTEMBER` card, which
         the shared `EarningsScreen` replaced: the same money is REVENUE now, of
         the period you are looking at rather than of the month whatever you
         picked. The claim underneath was never the card — it was "the ₹300 this
         webhook captured reaches the studio's earnings desk, and it says it came
         by UPI" — so that is what is asserted, on the day it was captured.
         HOW STUDENTS PAID is untouched: the method split is a fact nothing else
         on the page carries. */
      await page.goto(`/business/${tenant.id}/earnings?period=day`);
      await expect(page.getByTestId("earn-revenue")).toHaveText("₹300");
      await expect(page.getByTestId("earn-left")).toHaveText("₹300");
      await expect(page.getByText("UPI 100%")).toBeVisible();
    } finally {
      await page.close();
    }
  } finally {
    // tenant delete cascades class → session → enrollment → order → payment;
    // the webhook_events ledger row is machine history and stays
    await fetch(`${supabaseUrl}/rest/v1/businesses?id=eq.${tenant.id}`, {
      method: "DELETE",
      headers: serviceHeaders,
    });
  }
});

test("cashfree subscription webhook, in the shapes Cashfree really sends: the authorisation pays the first period and lists the studio, the mandate's second event is a no-op, a renewal buys the next period, a failed charge is grace, a cancelled mandate keeps what was paid for", async ({
  request,
}) => {
  test.skip(
    !supabaseUrl || !anonKey || !serviceKey || !secretKey,
    "Supabase keys or CASHFREE_SECRET_KEY missing (.env.local or env)"
  );

  const stamp = Date.now().toString(36);
  const owner = await signInTestNumber("+919999999999");

  /* ⚠ SWEEP THIS TEST'S OWN LEFTOVERS FIRST (20 Sep 2026).
   *
   *  The `finally` below deletes this studio, so a run that COMPLETES leaves
   *  nothing — but a run that is killed part-way leaves one behind, on the one
   *  account every phone-based check shares. On 19 Sep that happened nine times,
   *  and the next morning the test number owned fifteen studios and
   *  `why_no_studio` refused the sixteenth: "An organization runs at most 15
   *  studios on DanceOS". That is the cap doing its job, and it took out this
   *  spec AND nine proof scripts at their first line, with a bare 400.
   *
   *  So the test cleans up after its own past selves before it starts. It is
   *  narrow on purpose — only studios named "Mandate Proof Studio …", only ones
   *  this very test could have made, and a hard DELETE exactly as the `finally`
   *  does. Nothing else on the account is touched. */
  const mine = (await rows<{ id: string }>(
    serviceHeaders,
    `businesses?name=like.Mandate%20Proof%20Studio%20*&deleted_at=is.null&select=id`
  )) ?? [];
  for (const old of mine) {
    await fetch(`${supabaseUrl}/rest/v1/businesses?id=eq.${old.id}`, { method: "DELETE", headers: serviceHeaders });
  }

  const tenant = await rpc<{ id: string; visibility: string }>(userHeaders(owner.token), "create_business_with_owner", {
    p_name: `Mandate Proof Studio ${stamp}`,
    p_type: "studio",
    p_area: "Kothrud",
    p_city: "Pune",
    p_styles: ["Hip-Hop"],
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
  const visibilityNow = async () => (await rows<{ visibility: string }>(serviceHeaders, `businesses?id=eq.${tenant.id}&select=visibility`))[0].visibility;
  const paymentsNow = () =>
    rows<{ kind: string; provider_payment_id: string; amount_inr: number }>(
      userHeaders(owner.token),
      `payments?subscription_id=eq.${sub.id}&select=kind,provider_payment_id,amount_inr&order=created_at.asc`
    );

  // a studio is born PRIVATE (10 Sep 2026)
  expect(tenant.visibility).toBe("unlisted");

  /* ⚠ AND SINCE 14 SEP 2026 IT IS ALSO BORN UNVERIFIED, and `subscribe()`
     refuses one: "DanceOS has not verified this studio yet — the badge comes
     first, then the subscription puts it on Discover." The badge is an admin's
     decision, which this spec has no admin for and is not what it is testing —
     so the service role stamps it, exactly as the proof scripts do. Without
     this the whole mandate story stops at its first line. */
  const badged = await fetch(`${supabaseUrl}/rest/v1/businesses?id=eq.${tenant.id}`, {
    method: "PATCH",
    headers: serviceHeaders,
    body: JSON.stringify({ verified_at: new Date().toISOString() }),
  });
  expect(badged.ok).toBeTruthy();

  // the owner starts the subscription through the real RPC: OUR row first, at the
  // price list's price, waiting on the mandate
  const sub = await rpc<{ id: string; status: string; price_inr: number; period: string }>(userHeaders(owner.token), "subscribe", {
    p_plan_key: "studio_monthly",
    p_business_id: tenant.id,
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
    /* CASHFREE SENDS TWO SHAPES, and the difference is what made a real ₹700
       authorisation land as 400 "malformed subscription entity" while this very
       test was green (10 Sep 2026 — it had been signing OUR shape, not theirs).
       A payment or authorisation event carries the identity at the TOP of data: */
    const paymentIdentity = {
      subscription_id: providerSubscriptionId,
      cf_subscription_id: cfSubscriptionId,
    };
    /* ...while only SUBSCRIPTION_STATUS_CHANGED nests it: */
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
          ...paymentIdentity,
          cf_payment_id: authPaymentId,
          payment_id: `auth_${stamp}`,
          payment_type: "AUTH",
          payment_amount: sub.price_inr,
          payment_status: "SUCCESS",
          failure_details: { failure_reason: null },
          payment_remarks: "auth payment",
          /* a live UPI AutoPay authorisation carries payment_method, NOT payment_group */
          authorization_details: {
            payment_id: `auth_${stamp}`,
            instrument_id: "test@upi",
            payment_method: "upi",
            authorization_amount: sub.price_inr,
            authorization_status: "ACTIVE",
            authorization_amount_refund: false,
          },
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
          ...paymentIdentity,
          payment_id: `auth_${stamp}`,
          cf_payment_id: authPaymentId,
          payment_type: "AUTH",
          payment_amount: sub.price_inr,
          payment_status: "SUCCESS",
          authorization_details: {
            payment_id: `auth_${stamp}`,
            instrument_id: "test@upi",
            payment_method: "upi",
            authorization_amount: sub.price_inr,
            authorization_status: "ACTIVE",
            authorization_amount_refund: false,
          },
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
          ...paymentIdentity,
          cf_payment_id: authPaymentId + 1,
          payment_id: `charge_${stamp}`,
          payment_type: "CHARGE",
          payment_amount: sub.price_inr,
          payment_status: "SUCCESS",
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
          ...paymentIdentity,
          cf_payment_id: authPaymentId + 2,
          payment_id: `fail_${stamp}`,
          payment_type: "CHARGE",
          payment_amount: sub.price_inr,
          payment_status: "FAILED",
          failure_details: { failure_reason: "Insufficient funds" },
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
        /* the one event that really does nest it */
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
    await fetch(`${supabaseUrl}/rest/v1/businesses?id=eq.${tenant.id}`, {
      method: "DELETE",
      headers: serviceHeaders,
    });
  }
});

test("cashfree webhook for an EVENT TICKET (17 Sep 2026): a priced seat waits for its money, the signed capture books it, a replay is a no-op, and cancelling ten days out files an automatic refund", async ({ request }) => {
  test.skip(
    !supabaseUrl || !anonKey || !serviceKey || !secretKey,
    "Supabase keys or CASHFREE_SECRET_KEY missing (.env.local or env)"
  );

  const stamp = Date.now().toString(36);
  const owner = await signInTestNumber("+919999999999");
  const learner = await signInTestNumber("+918888888888");

  /* AN EVENT IS HOSTED ON AN ORGANIZATION BUSINESS THE OWNER OWNS (26 Sep 2026:
     the organization login is retired; `my_org_business` and `verify_gstin` are
     dropped). scripts/ensure-test-phone-profiles.js leaves the test-phone owner
     with ONE — "Proof Owner Org", GST verified, mandate granted — so the usual
     path is to find it; a database the restorer has not been run on gets one
     made here, the way the restorer makes it: the business through the owner's
     own door, its GST number through verify_business_gstin, and its mandate by
     the service role (what makes it PUBLIC, so the learner may book). */
  const ownedOrgs = await rows<{ business_id: string; businesses: { id: string; type: string; gstin_verified_at: string | null; deleted_at: string | null } | null }>(
    serviceHeaders,
    `business_members?user_id=eq.${owner.userId}&member_role=eq.owner&deleted_at=is.null&select=business_id,businesses!inner(id,type,gstin_verified_at,deleted_at)&businesses.type=eq.org&businesses.deleted_at=is.null`
  );
  let hostId = ownedOrgs.find((r) => r.businesses && r.businesses.type === "org" && !r.businesses.deleted_at)?.business_id ?? null;
  let madeOrgHere = false;
  if (!hostId) {
    const made = await rpc<{ id: string }>(userHeaders(owner.token), "create_business_with_owner", { p_name: `Webhook Org ${stamp}`, p_type: "org", p_area: null, p_city: "Pune" });
    hostId = made.id;
    madeOrgHere = true;
  }
  const why = await rpc<string | null>(userHeaders(owner.token), "why_no_event", { p_business_id: hostId });
  if (why) {
    /* the placeholder shape is THREE LETTERS then five digits — "E2E" has a digit in it */
    await rpc(userHeaders(owner.token), "verify_business_gstin", { p_business_id: hostId, p_gstin: `WEB${String(Date.now()).slice(-5)}` });
  }
  const liveMandate = await rows<{ id: string }>(serviceHeaders, `subscriptions?business_id=eq.${hostId}&kind=eq.org&status=eq.active&deleted_at=is.null&select=id`);
  if (liveMandate.length === 0) {
    const granted = await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
      method: "POST",
      headers: serviceHeaders,
      body: JSON.stringify({
        kind: "org", user_id: owner.userId, business_id: hostId, plan_key: "org_monthly", price_inr: 0, period: "monthly", status: "active",
        current_period_start: new Date().toISOString().slice(0, 10),
        current_period_end: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10),
        granted: true, note: "Granted by paid-webhook.spec.ts — nothing charged", created_by: owner.userId, updated_by: owner.userId,
      }),
    });
    expect(granted.ok).toBeTruthy();
  }
  const inTenDays = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const eventId = await rpc<string>(userHeaders(owner.token), "save_event", {
    p_business_id: hostId,
    p_event_id: null,
    p_event: {
      category: "battle", title: `Webhook Ticket ${stamp}`, style: "All styles",
      start_date: inTenDays, end_date: inTenDays, start_time: "18:00",
      venue: "Webhook Hall", address: null, city: "Pune", maps_url: "https://maps.google.com/?q=Webhook+Hall",
      about: null, entry_format: "solo", bracket: 16, rounds: 0, prizes: [1000, 0, 0], tickets_on: true,
      entry_tiers: [{ format: "solo", fee_inr: 0, capacity: 10 }],
      ticket_tiers: [{ name: "Door", price_inr: 250, capacity: 3, sort: 0 }],
    },
  });

  try {
    await rpc(userHeaders(owner.token), "publish_event", { p_event_id: eventId });
    const tiers = await rows<{ id: string }>(serviceHeaders, `event_ticket_tiers?event_id=eq.${eventId}&select=id`);
    const tierId = tiers[0].id;

    // a PRICED ticket is a pending booking that holds no seat
    const booking = await rpc<{ id: string; status: string; amount_inr: number }>(userHeaders(learner.token), "book_event", {
      p_event_id: eventId, p_kind: "spectator", p_ticket_tier_id: tierId, p_qty: 1,
    });
    expect(booking.status).toBe("pending_payment");
    expect(booking.amount_inr).toBe(250);
    const countBefore = await rpc<Array<{ n: number }>>({ apikey: anonKey, "Content-Type": "application/json" }, "event_counts", { p_event_ids: [eventId] });
    expect(countBefore).toHaveLength(0);

    // the order against it, the rail's id bound
    const order = await rpc<{ id: string; amount_inr: number; event_id: string }>(userHeaders(learner.token), "create_event_payment_order", {
      p_event_booking_id: booking.id,
    });
    expect(order.amount_inr).toBe(250);
    expect(order.event_id).toBe(eventId);
    const providerOrderId = `dos_${order.id.replace(/-/g, "")}`;
    await rpc(userHeaders(learner.token), "attach_provider_order", { p_order_id: order.id, p_provider_order_id: providerOrderId });

    // the delivery, exactly as Cashfree sends a PAYMENT_SUCCESS
    const cfPaymentId = Number(`${Date.now()}`.slice(-9));
    const body = JSON.stringify({
      data: {
        order: { order_id: providerOrderId, order_amount: 250.0, order_currency: "INR" },
        payment: { cf_payment_id: cfPaymentId, payment_status: "SUCCESS", payment_amount: 250.0, payment_currency: "INR", payment_group: "upi", payment_method: { upi: { channel: "collect", upi_id: "testsuccess@gocash" } } },
      },
      event_time: new Date().toISOString(),
      type: "PAYMENT_SUCCESS_WEBHOOK",
    });
    const timestamp = String(Date.now());
    const delivered = await request.post("/api/webhooks/cashfree", {
      headers: { "content-type": "application/json", "x-webhook-signature": sign(timestamp, body), "x-webhook-timestamp": timestamp },
      data: body,
    });
    expect(delivered.status()).toBe(200);
    const outcome = (await delivered.json()) as { result?: { outcome?: string; kind?: string } };
    expect(outcome.result?.outcome).toBe("enrolled");
    expect(outcome.result?.kind).toBe("event");

    // the seat is theirs, the order paid, the count public
    const held = await rows<{ status: string }>(userHeaders(learner.token), `event_bookings?id=eq.${booking.id}&select=status`);
    expect(held[0].status).toBe("booked");
    const orderRows = await rows<{ status: string }>(userHeaders(learner.token), `orders?id=eq.${order.id}&select=status`);
    expect(orderRows[0].status).toBe("paid");
    const countAfter = await rpc<Array<{ n: number }>>({ apikey: anonKey, "Content-Type": "application/json" }, "event_counts", { p_event_ids: [eventId] });
    expect(countAfter).toHaveLength(1);
    expect(Number(countAfter[0].n)).toBe(1);

    // a replay changes nothing
    const replayed = await request.post("/api/webhooks/cashfree", {
      headers: { "content-type": "application/json", "x-webhook-signature": sign(timestamp, body), "x-webhook-timestamp": timestamp },
      data: body,
    });
    expect(replayed.status()).toBe(200);
    const payments = await rows<{ id: string }>(userHeaders(learner.token), `payments?order_id=eq.${order.id}&select=id`);
    expect(payments).toHaveLength(1);

    // ten days out, cancelling is an AUTOMATIC refund (the class rule)
    const cancelled = await rpc<{ status: string; refund: { status: string; amount_inr: number } | null }>(userHeaders(learner.token), "cancel_event_booking", {
      p_booking_id: booking.id, p_reason: "Plans changed",
    });
    expect(cancelled.refund?.status).toBe("pending");
    expect(cancelled.refund?.amount_inr).toBe(250);
    const orderAfter = await rows<{ status: string }>(userHeaders(learner.token), `orders?id=eq.${order.id}&select=status`);
    expect(orderAfter[0].status).toBe("refund_pending");
  } finally {
    // the event delete cascades its tiers, bookings, orders and payments
    await fetch(`${supabaseUrl}/rest/v1/events?id=eq.${eventId}`, { method: "DELETE", headers: serviceHeaders });
    /* an org business THIS run made goes with it; the restorer's own one stays,
       because nine phone-based proofs share it */
    if (madeOrgHere && hostId) {
      await fetch(`${supabaseUrl}/rest/v1/businesses?id=eq.${hostId}`, { method: "DELETE", headers: serviceHeaders });
    }
  }
});
