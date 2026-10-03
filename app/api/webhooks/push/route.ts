import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendPush, vapidKeys } from "@/lib/push/webpush";

/** THE PUSH DISPATCH (3 Oct 2026, the user: "phone push notifications").
 *
 *  Called by the DATABASE, not by a browser: `notifications_push_dispatch`
 *  (20261003130000) posts `{ id }` here through pg_net, after the transaction
 *  that wrote the notification commits, carrying the shared secret it reads out
 *  of Supabase Vault. So every path that raises a notification — an action, an
 *  RPC, the Cashfree webhook, a cron — reaches the phone, and none of them knows.
 *
 *  Safety order, the same as the other two webhook routes':
 *    1. no secret configured → 503 and say so, never "accept anything";
 *    2. the secret compared in constant time → 401 on mismatch;
 *    3. the notification, its person's devices and their prefs read with the
 *       service role — the row is taken from the DATABASE by id, so a caller who
 *       somehow had the secret could at most re-send a real notification to its
 *       own owner, never write a message of their own;
 *    4. a device the push service has thrown away (404 / 410) is dropped, so a
 *       phone that unsubscribed stops costing a call.
 *  It lives under `api/webhooks`, which the proxy matcher already skips: a call
 *  from the database has no session to refresh. */

export const runtime = "nodejs";

const sameSecret = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.PUSH_DISPATCH_SECRET;
  const keys = vapidKeys();
  if (!secret || !keys) {
    return NextResponse.json({ error: "push not configured" }, { status: 503 });
  }
  const given = req.headers.get("x-push-secret") ?? "";
  if (!sameSecret(given, secret)) {
    return NextResponse.json({ error: "bad secret" }, { status: 401 });
  }
  let id: string | null = null;
  try {
    const body = (await req.json()) as { id?: unknown };
    id = typeof body.id === "string" && /^[0-9a-f-]{36}$/.test(body.id) ? body.id : null;
  } catch {
    id = null;
  }
  if (!id) {
    return NextResponse.json({ error: "no notification" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: n } = await admin
    .from("notifications")
    .select("id, user_id, kind, title, body, href, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (!n || n.deleted_at) {
    return NextResponse.json({ outcome: "ignored", reason: "no such notification" });
  }
  /* the trigger already asked these, and it is asked again here because the
     person may have switched Push off in the second between */
  const { data: prefs } = await admin.from("notification_prefs").select("push, kinds").eq("user_id", n.user_id).maybeSingle();
  const kinds = (prefs?.kinds ?? {}) as Record<string, boolean>;
  if (prefs && (prefs.push === false || kinds[n.kind] === false)) {
    return NextResponse.json({ outcome: "ignored", reason: "switched off" });
  }
  const { data: devices } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", n.user_id)
    .is("deleted_at", null)
    .limit(20);

  const message = { title: n.title, body: n.body ?? "", href: n.href ?? "/notifications", tag: n.id };
  let sent = 0;
  let dropped = 0;
  for (const d of devices ?? []) {
    try {
      const status = await sendPush({ endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth }, message, keys);
      if (status >= 200 && status < 300) sent++;
      else if (status === 404 || status === 410) {
        await admin.from("push_subscriptions").update({ deleted_at: new Date().toISOString() }).eq("id", d.id);
        dropped++;
      }
    } catch {
      /* one phone that times out must not stop the others */
    }
  }
  return NextResponse.json({ outcome: "sent", sent, dropped });
}
