import { InboxScreen } from "@/features/inbox/components/InboxScreen";
import { buildRequests } from "@/features/inbox/requestItems";
import { requireLedCrew } from "@/features/crews/server/requireLedCrew";
import { loadEnquiries } from "@/features/enquiries/server/loadEnquiries";
import { findAskedForMyCrews } from "@/repositories/crews";
import { CREW_TINT } from "@/types/crew";

const stampNowIso = (): string => new Date().toISOString();

/** ONE CREW'S INBOX (18 Sep 2026) — the Inbox tab on a crew's own home: the
 *  roster asks this crew has out, withdrawable here as from the person's Inbox,
 *  and — again since 2 Oct 2026 (the user: *"shift back enquiries to inbox from
 *  home tools for all profiles"*) — the enquiries sent to this crew, as the
 *  Inbox's third desk. A crew keeps no enquiry-type settings: its three kinds
 *  are fixed in `send_enquiry`. */
export default async function CrewInboxPage({ params, searchParams }: { params: Promise<{ crewId: string }>; searchParams: Promise<{ show?: string }> }) {
  const { crewId } = await params;
  const { supabase, crew } = await requireLedCrew(crewId);
  const [askedAll, enq, { show }] = await Promise.all([findAskedForMyCrews(supabase, ["asked", "confirmed", "rejected"], { withdrawn: true }), loadEnquiries(supabase, { kind: "crew", id: crewId }), searchParams]);
  const asked = askedAll.filter((m) => m.crewId === crewId);
  const { requestsIn, requestsOut } = buildRequests({ crewOut: asked });
  return (
    <InboxScreen
      accent={CREW_TINT}
      requestsIn={requestsIn}
      requestsOut={requestsOut}
      enquiriesIn={enq.enquiriesIn}
      enquiriesOut={[]}
      receivedOnly
      deskSub={crew.name}
      initialSection={show === "enquiries" ? "enq" : show === "done" ? "done" : undefined}
      nowIso={stampNowIso()}
    />
  );
}
