import { notFound, redirect } from "next/navigation";
import { EnquiryDetail } from "@/features/enquiries/components/EnquiryDetail";
import { isCashfreeConfigured } from "@/lib/cashfree/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyLedCrews } from "@/repositories/crews";
import { findEnquiryById } from "@/repositories/enquiries";
import { findMyMemberships, runsTheBusiness } from "@/repositories/businesses";

const stampNowIso = (): string => new Date().toISOString();

/** One enquiry (prototype S_enqdetail). RLS admits the two ends only — the
 *  sender, and the business's members or the crew's leader (18 Sep 2026) — so
 *  anybody else gets "not found". Which end the viewer is decides what the page
 *  offers: the side that was asked quotes and records, the sender answers.
 *  ⚠ 3 Oct 2026: on the business's side only its OWNERS and MANAGERS work an
 *  enquiry (`can_work_enquiry`) — every other seat reads it and is told so. */
export default async function EnquiryPage({
  params,
  searchParams,
}: {
  params: Promise<{ enquiryId: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { enquiryId } = await params;
  /* ⚠ `?paid=` is how /pay/return brings a phone back from the payment
     (3 Oct 2026, "take back once payment is confirmed") — read for the banner
     only; whether it was paid is the quote's own state, read below */
  const { paid } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const [enquiry, seats, ledCrews] = await Promise.all([findEnquiryById(supabase, enquiryId), findMyMemberships(supabase), findMyLedCrews(supabase).catch(() => [])]);
  if (!enquiry) {
    notFound();
  }
  const seat = seats.find((m) => m.business.id === enquiry.businessId);
  const mine = enquiry.crewId ? ledCrews.some((c) => c.id === enquiry.crewId) : Boolean(seat);
  const canWork = enquiry.crewId ? mine : runsTheBusiness(seat?.memberRole);

  return (
    <EnquiryDetail
      enquiry={enquiry}
      mine={mine}
      canWork={canWork}
      nowIso={stampNowIso()}
      meId={user.id}
      /* online payment is a business's enquiry on a configured rail — a crew has no
         business row for the money to land on, so its sender still settles directly */
      payOnline={isCashfreeConfigured() && !enquiry.crewId}
      paidBack={paid === "booked" ? "paid" : paid === "processing" ? "processing" : paid === "refund_pending" ? "refunded" : paid ? "failed" : null}
    />
  );
}
