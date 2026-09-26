import { redirect } from "next/navigation";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";
import { buildRequests } from "@/features/inbox/requestItems";
import { gradientOf } from "@/features/profiles/components/profile-kit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findAskedClaimsForTenants } from "@/repositories/claims";
import { findVenueRequestsForTenants } from "@/repositories/classes";
import { findReceivedEnquiries } from "@/repositories/enquiries";
import { findPendingInvites } from "@/repositories/invites";
import { findAskedByOrganizations } from "@/repositories/organizationTeam";
import { findMyMemberships } from "@/repositories/tenants";

const stampNowIso = (): string => new Date().toISOString();

/** ONE STUDIO'S INBOX (18 Sep 2026, the user: "both crew and studios should get a
 *  home and inbox tab below on their home pages as both have enquiries to deal
 *  with and studios have their requests to deal with as well"). The Inbox tab
 *  on a studio's own home. The same two desks the person's Inbox draws, scoped
 *  to THIS studio: the enquiries sent to it, the rooms artists have asked it
 *  for, the teachers it has asked and the invites it has sent. Every member of
 *  the team reads it — the desk is the studio's CRM and staff answer the phone
 *  (Step 12's rule), and RLS already admits them to each of these rows. */
export default async function StudioInboxPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const memberships = await findMyMemberships(supabase);
  const membership = memberships.find((m) => m.tenant.id === tenantId);
  if (!membership) {
    redirect("/business");
  }
  const { tenant, memberRole } = membership;
  /* ⚠ AN ORGANIZATION'S HOME WEARS THE SAME BAR (26 Sep 2026), so its Inbox
     tab lands here too: its enquiries, and — for its owner — the team asks it
     is waiting on. An artist page's inbox is the person's own. */
  if (tenant.type !== "studio" && tenant.type !== "org") {
    redirect(`/business/${tenantId}`);
  }
  const isOrg = tenant.type === "org";

  const [enquiriesIn, venueIn, claimsOut, invitesOut, orgAsked] = await Promise.all([
    findReceivedEnquiries(supabase, [tenantId]),
    isOrg ? Promise.resolve([]) : findVenueRequestsForTenants(supabase, [tenantId]).catch(() => []),
    isOrg ? Promise.resolve([]) : findAskedClaimsForTenants(supabase, [tenantId]),
    isOrg ? Promise.resolve([]) : findPendingInvites(supabase, tenantId).then((rows) => rows.map((i) => ({ ...i, tenantName: tenant.name }))),
    isOrg && memberRole === "owner" ? findAskedByOrganizations(supabase, [tenantId], ["asked", "confirmed", "rejected"]).catch(() => []) : Promise.resolve([]),
  ]);
  const { requestsIn, requestsOut } = buildRequests({ venueIn, claimsOut, invitesOut, orgOut: orgAsked.map((m) => ({ ...m, orgName: tenant.name })) });

  return <InboxScreen accent={gradientOf(tenant.name)[1]} requestsIn={requestsIn} requestsOut={requestsOut} enquiriesIn={enquiriesIn} enquiriesOut={[]} nowIso={stampNowIso()} />;
}
