import { NextResponse, type NextRequest } from "next/server";
import { confirmSubscriptionAction } from "@/features/payments/server-actions/subscriptions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMySubscriptions } from "@/repositories/subscriptions";

/** WHERE CASHFREE SENDS A PHONE BACK FROM A MANDATE (2 Oct 2026).
 *
 *  `/pay/return`'s twin for a subscription. On a phone the mandate window often
 *  leaves the page — a UPI app, a bank's page — and comes back by REDIRECT, so
 *  `SubscribeButton`'s own confirm never runs: the plan waited for the webhook
 *  and an artist who had just paid saw no welcome bow. This is the mandate's
 *  `return_url`. It asks Cashfree what happened on OUR subscription through the
 *  same action the modal path calls (the browser's word is never the answer, and
 *  a webhook landing first is a no-op), then lands:
 *
 *  * an ARTIST plan on `/subscription`, with `?welcome=artist` only when the
 *    server says the plan is ACTIVE — the same rule the modal path keeps;
 *  * a STUDIO's plan on that studio's own Subscription screen.
 *
 *  ⚠ The subscription id in the address is a REQUEST: it is looked up among the
 *  caller's OWN subscriptions, so somebody else's id lands on `/subscription`
 *  and confirms nothing. */
export async function GET(req: NextRequest) {
  const subscriptionId = req.nextUrl.searchParams.get("sub") ?? "";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (!/^[0-9a-f-]{36}$/i.test(subscriptionId)) {
    return NextResponse.redirect(new URL("/subscription", req.url));
  }
  const row = (await findMySubscriptions(supabase)).find((s) => s.id === subscriptionId);
  if (!row) {
    return NextResponse.redirect(new URL("/subscription", req.url));
  }
  const out = await confirmSubscriptionAction({ subscriptionId });
  const active = out.outcome === "subscribed";
  if (row.kind === "studio" && row.businessId) {
    return NextResponse.redirect(new URL(`/business/${row.businessId}/subscription`, req.url));
  }
  return NextResponse.redirect(new URL(active ? "/subscription?welcome=artist" : "/subscription", req.url));
}
