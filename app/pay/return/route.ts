import { NextResponse, type NextRequest } from "next/server";
import { confirmCheckoutAction } from "@/features/payments/server-actions/payments";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyOrderLanding } from "@/repositories/payments";

/** WHERE CASHFREE SENDS A PHONE BACK (2 Oct 2026, the user: "when trying to make
 *  payment devices get stucked … should take to class detail or membership detail
 *  page after payment is done").
 *
 *  On a phone the checkout often leaves the page — a UPI app, a bank's 3-D Secure
 *  page — and returns by REDIRECT instead of closing the modal, so the page that
 *  opened it never hears back. This is the order's `return_url`: it asks Cashfree
 *  what happened on OUR order through the same action the modal path calls (the
 *  browser's word is never the answer, and the webhook landing first is a no-op),
 *  then lands on the class or the membership with the outcome in the address. */
export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("order") ?? "";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return NextResponse.redirect(new URL("/my-classes", req.url));
  }
  const out = await confirmCheckoutAction({ orderId });
  const landing = await findMyOrderLanding(supabase, orderId, user.id);
  const to = new URL(landing, req.url);
  to.searchParams.set("paid", out.outcome ?? "failed");
  return NextResponse.redirect(to);
}
