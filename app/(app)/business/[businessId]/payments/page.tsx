import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PaymentsScreen } from "@/features/settings/components/PaymentsScreen";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findTenantInvoices, methodUsesOf } from "@/repositories/invoices";
import { findMyMemberships, runsTheBusiness } from "@/repositories/businesses";

export const metadata: Metadata = { title: "Payments & verification — DanceOS" };

/** /business/{id}/payments — Payments & verification (S_payments 16531): how
 *  students paid, the ACCEPTED FROM STUDENTS switches (the owner's to flip,
 *  through the one owner-only door), and the Verification tab reading
 *  `verified_at`. Members read it; the switches move for the owner alone. */
export default async function TenantPaymentsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  /* ⚠ the seat has to RUN the business (28 Sep 2026) — one read, not two: the
     seat carries the business AND the role this page was fetching separately */
  const seat = (await findMyMemberships(supabase)).find((m) => m.business.id === businessId);
  if (!seat || !runsTheBusiness(seat.memberRole)) redirect("/business");
  const { business, memberRole: role } = seat;
  const rows = await findTenantInvoices(supabase, businessId);
  return <PaymentsScreen side="tenant" methods={methodUsesOf(rows)} business={business} canEdit={role === "owner"} />;
}
