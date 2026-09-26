import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GstCard } from "@/features/orgs/components/GstCard";
import { BizPage } from "@/features/settings/components/settings-kit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findBusinessGst } from "@/repositories/gst";
import { findMyMemberships } from "@/repositories/tenants";

export const metadata: Metadata = { title: "GST number — DanceOS" };

/** /business/{id}/gst — AN ORGANIZATION'S GST NUMBER, ON ITS OWN SCREEN (11 Sep
 *  2026 as `/gst`; keyed on the BUSINESS since 26 Sep 2026, when the organization
 *  login was retired and an organization became a business a person opens).
 *
 *  Reached from the organization's own Settings (THIS ORGANIZATION → GST number)
 *  and from its events desk, which sends anybody who has not done it yet here
 *  with `?from=events` — all that changes is one line of copy, so the screen
 *  says why the person is standing on it.
 *
 *  ⚠ OWNER-ONLY, and checked here rather than trusted from the sheet:
 *  `verify_business_gstin` is the owner's, so a teammate who types this address
 *  is sent back to the organization rather than shown a form that would be
 *  refused. A studio has no GST number; its address here is sent to its home. */
export default async function BusinessGstPage({ params, searchParams }: { params: Promise<{ tenantId: string }>; searchParams: Promise<{ from?: string }> }) {
  const { tenantId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  /* membership is the spine — `findMyMemberships` says user_id = auth.uid() out loud */
  const membership = (await findMyMemberships(supabase)).find((m) => m.tenant.id === tenantId);
  if (!membership) {
    redirect("/organizations");
  }
  if (membership.tenant.type !== "org" || membership.memberRole !== "owner") {
    redirect(`/business/${tenantId}`);
  }
  const { from } = await searchParams;
  const gst = await findBusinessGst(supabase, tenantId);

  return (
    <BizPage title="GST number" sub={`${membership.tenant.name} · entered once · it opens events and the subscription`} grad="linear-gradient(135deg,#64748B,#0EA5E9)">
      <GstCard businessId={tenantId} gstin={gst.gstin} verifiedAt={gst.verifiedAt} cameForEvents={from === "events"} />
    </BizPage>
  );
}
