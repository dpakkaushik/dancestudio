import { notFound, redirect } from "next/navigation";
import { EnquiryDetail } from "@/features/enquiries/components/EnquiryDetail";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyLedCrews } from "@/repositories/crews";
import { findEnquiryById } from "@/repositories/enquiries";
import { findMyTenants } from "@/repositories/tenants";

const stampNowIso = (): string => new Date().toISOString();

/** One enquiry (prototype S_enqdetail). RLS admits the two ends only — the
 *  sender, and the business's members or the crew's leader (18 Sep 2026) — so
 *  anybody else gets "not found". Which end the viewer is decides what the page
 *  offers: the side that was asked quotes and records, the sender answers. */
export default async function EnquiryPage({ params }: { params: Promise<{ enquiryId: string }> }) {
  const { enquiryId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const [enquiry, businesses, ledCrews] = await Promise.all([findEnquiryById(supabase, enquiryId), findMyTenants(supabase), findMyLedCrews(supabase).catch(() => [])]);
  if (!enquiry) {
    notFound();
  }
  const mine = enquiry.crewId ? ledCrews.some((c) => c.id === enquiry.crewId) : businesses.some((t) => t.id === enquiry.tenantId);

  return <EnquiryDetail enquiry={enquiry} mine={mine} nowIso={stampNowIso()} />;
}
