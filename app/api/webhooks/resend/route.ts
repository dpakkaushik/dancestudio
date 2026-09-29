import { NextResponse } from "next/server";
import { isResendWebhookConfigured, verifyResendWebhook } from "@/lib/resend/signature";
import { recordEmailEvent } from "@/repositories/emailEvents";

/** RESEND'S DELIVERY WEBHOOK (30 Sep 2026) — whether the email actually arrived.
 *
 *  ⚠⚠ THIS IS THE ONLY PLACE THE ANSWER EXISTS. This app sends no email itself:
 *  every message goes Supabase Auth → Resend SMTP, so nothing in the tree knows
 *  whether a sign-in link was delivered, bounced, or was marked as spam. Until
 *  today "the link never arrived" was unanswerable, which on an email-only auth
 *  is the single most expensive support question there is.
 *
 *  Safety order, the same as the Cashfree route's and for the same reasons:
 *    1. the RAW body is read first and the Svix signature verified over it —
 *       401 on mismatch, before anything is parsed or written;
 *    2. the insert is idempotent on Svix's own message id, so a redelivery is a
 *       200 no-op rather than a second bounce in the log;
 *    3. anything else is a 500, because Resend retries and a lost delivery
 *       event is a hole in the one record that answers the question.
 *
 *  ⚠ IT DOES NOTHING UNTIL TWO THINGS THE ACCOUNT OWNER DOES: a webhook at
 *  resend.com/webhooks pointing here, and its signing secret in
 *  `RESEND_WEBHOOK_SECRET`. Unconfigured it answers 503 and says so, rather than
 *  accepting unsigned posts — an open, unauthenticated writer into a table is
 *  not a smaller problem than a missing feature.
 */

interface ResendWebhookBody {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    from?: string;
    subject?: string;
    /* bounce / complaint detail, when the event carries any */
    bounce?: { message?: string; type?: string; subType?: string };
    click?: { link?: string };
    reason?: string;
  };
}

const firstTo = (to: string[] | string | undefined): string | null => {
  if (Array.isArray(to)) return to[0] ?? null;
  return typeof to === "string" && to.length > 0 ? to : null;
};

const detailOf = (body: ResendWebhookBody): string | null => {
  const d = body.data;
  if (!d) return null;
  if (d.bounce?.message) return [d.bounce.type, d.bounce.subType, d.bounce.message].filter(Boolean).join(" · ").slice(0, 400);
  if (d.reason) return String(d.reason).slice(0, 400);
  if (d.click?.link) return String(d.click.link).slice(0, 400);
  return null;
};

export async function POST(req: Request): Promise<NextResponse> {
  if (!isResendWebhookConfigured()) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }

  /* ⚠ THE RAW BODY, BEFORE ANYTHING ELSE — parsing and re-serialising changes
     the bytes the signature was computed over */
  const rawBody = await req.text();
  const ok = verifyResendWebhook({
    id: req.headers.get("svix-id"),
    timestamp: req.headers.get("svix-timestamp"),
    signature: req.headers.get("svix-signature"),
    rawBody,
  });
  if (!ok) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let body: ResendWebhookBody;
  try {
    body = JSON.parse(rawBody) as ResendWebhookBody;
  } catch {
    return NextResponse.json({ error: "malformed body" }, { status: 400 });
  }

  const eventType = typeof body.type === "string" ? body.type : "";
  const eventId = req.headers.get("svix-id");
  if (!eventId || eventType.length === 0) {
    return NextResponse.json({ error: "missing event id or type" }, { status: 400 });
  }

  try {
    /* ⚠ AN EVENT TYPE WE DO NOT KNOW IS RECORDED, NOT DROPPED. Resend adds
       types, and a ledger that silently discards the one new kind of failure is
       worse than no ledger — the column is text and the reader groups by it. */
    const outcome = await recordEmailEvent({
      providerEventId: eventId,
      eventType,
      messageId: body.data?.email_id ?? null,
      toEmail: firstTo(body.data?.to),
      subject: body.data?.subject ?? null,
      detail: detailOf(body),
      payload: body,
    });
    return NextResponse.json({ outcome }, { status: 200 });
  } catch (error: unknown) {
    console.error("[resend webhook] could not record the delivery:", error);
    return NextResponse.json({ error: "could not record" }, { status: 500 });
  }
}
