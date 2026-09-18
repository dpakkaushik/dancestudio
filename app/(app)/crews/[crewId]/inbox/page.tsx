import { InboxScreen } from "@/features/inbox/components/InboxScreen";
import { buildRequests } from "@/features/inbox/requestItems";
import { requireLedCrew } from "@/features/crews/server/requireLedCrew";
import { findAskedForMyCrews } from "@/repositories/crews";
import { findReceivedEnquiriesForCrews } from "@/repositories/enquiries";
import { CREW_TINT } from "@/types/crew";

const stampNowIso = (): string => new Date().toISOString();

/** ONE CREW'S INBOX (18 Sep 2026) — the Inbox tab on a crew's own home. Both
 *  desks, scoped to this crew: the roster asks the crew has out (withdrawable
 *  here as from the person's Inbox) and the ENQUIRIES sent to the crew — a
 *  celebration, a corporate show, a collaboration — which its leader quotes and
 *  records exactly as a business does (`20260918160000_a_crew_can_be_asked`). */
export default async function CrewInboxPage({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  const { supabase } = await requireLedCrew(crewId);
  const [askedAll, enquiriesIn] = await Promise.all([findAskedForMyCrews(supabase), findReceivedEnquiriesForCrews(supabase, [crewId])]);
  const asked = askedAll.filter((m) => m.crewId === crewId);
  const { requestsIn, requestsOut } = buildRequests({ crewOut: asked });
  return <InboxScreen accent={CREW_TINT} requestsIn={requestsIn} requestsOut={requestsOut} enquiriesIn={enquiriesIn} enquiriesOut={[]} nowIso={stampNowIso()} />;
}
