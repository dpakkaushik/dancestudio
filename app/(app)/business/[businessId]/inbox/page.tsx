import { redirect } from "next/navigation";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";
import { buildRequests } from "@/features/inbox/requestItems";
import { gradientOf } from "@/features/profiles/components/profile-kit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findAskedClaimsForTenants } from "@/repositories/classPeople";
import { findVenueRequestsForTenants } from "@/repositories/classes";
import { findPendingInvites } from "@/repositories/invites";
import { findMyMemberships, runsTheBusiness } from "@/repositories/businesses";

const stampNowIso = (): string => new Date().toISOString();

/** ONE STUDIO'S INBOX (18 Sep 2026, the user: "both crew and studios should get a
 *  home and inbox tab below on their home pages as both have enquiries to deal
 *  with and studios have their requests to deal with as well"). The Inbox tab
 *  on a studio's own home. The same two desks the person's Inbox draws, scoped
 *  to THIS studio: the enquiries sent to it, the rooms artists have asked it
 *  for, the teachers it has asked and the invites it has sent. Every member of
 *  the team reads it — the desk is the studio's CRM and staff answer the phone
 *  (Step 12's rule), and RLS already admits them to each of these rows. */
export default async function StudioInboxPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const memberships = await findMyMemberships(supabase);
  const membership = memberships.find((m) => m.business.id === businessId);
  /* ⚠ and the seat has to RUN the business (28 Sep 2026) — this is the Inbox TAB
     of a home a faculty seat can no longer open, so admitting it here would be a
     door into a house whose front door is shut */
  if (!membership || !runsTheBusiness(membership.memberRole)) {
    redirect("/business");
  }
  const { business } = membership;
  /* ⚠ AN ORGANIZATION'S HOME WORE THIS BAR TOO from 26 Sep 2026, so its Inbox
     tab landed here — its team asks, for its owner. Both went with
     organizations on 29 Sep. An artist page's inbox is the person's own. */
  if (business.type !== "studio") {
    redirect(`/business/${businessId}`);
  }

  /* ⚠⚠ THIS DESK STOPPED READING ENQUIRIES (27 Sep 2026). They left the Inbox
     that morning for a desk of their own, and `InboxScreen desk="inbox"` draws
     neither an Enquiries section nor an enquiry in its Done — so the read was
     still being made on every visit by every member of the team and its result
     was drawn NOWHERE. That is this repo's own recurring shape (a field that
     exists and a screen that never reads it) met from the other side, and the
     kind of thing nothing fails on: the page was correct, just paying for a
     query it threw away. A studio's enquiries are the Enquiries TOOL on its own
     home, scoped to it by `?as=`. */
  const [venueIn, claimsOut, invitesOut] = await Promise.all([
    findVenueRequestsForTenants(supabase, [businessId]).catch(() => []),
    findAskedClaimsForTenants(supabase, [businessId]),
    findPendingInvites(supabase, businessId).then((rows) => rows.map((i) => ({ ...i, businessName: business.name }))),
  ]);
  const { requestsIn, requestsOut } = buildRequests({ venueIn, claimsOut, invitesOut });

  return <InboxScreen accent={gradientOf(business.name)[1]} requestsIn={requestsIn} requestsOut={requestsOut} enquiriesIn={[]} enquiriesOut={[]} nowIso={stampNowIso()} />;
}
