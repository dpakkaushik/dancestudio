import { InboxScreen } from "@/features/inbox/components/InboxScreen";
import { buildRequests } from "@/features/inbox/requestItems";
import { requireLedCrew } from "@/features/crews/server/requireLedCrew";
import { findAskedForMyCrews } from "@/repositories/crews";
import { CREW_TINT } from "@/types/crew";

const stampNowIso = (): string => new Date().toISOString();

/** ONE CREW'S INBOX (18 Sep 2026) — the Inbox tab on a crew's own home: the
 *  roster asks this crew has out, withdrawable here as from the person's Inbox.
 *
 *  ⚠⚠ IT STOPPED READING ENQUIRIES (27 Sep 2026). It carried them from 18 Sep
 *  (`20260918160000_a_crew_can_be_asked`) and they left the Inbox that morning
 *  for a desk of their own — so `InboxScreen desk="inbox"` draws neither an
 *  Enquiries section nor an enquiry in its Done, and this read was still being
 *  made on every visit with its result shown NOWHERE. Nothing fails on that: the
 *  page was correct, it was just paying for a query it threw away. A crew's
 *  enquiries are the Enquiries TOOL on its own home, which carries
 *  `?as=crew-{id}` so the desk it opens is this crew's. */
export default async function CrewInboxPage({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  const { supabase } = await requireLedCrew(crewId);
  const askedAll = await findAskedForMyCrews(supabase);
  const asked = askedAll.filter((m) => m.crewId === crewId);
  const { requestsIn, requestsOut } = buildRequests({ crewOut: asked });
  return <InboxScreen accent={CREW_TINT} requestsIn={requestsIn} requestsOut={requestsOut} enquiriesIn={[]} enquiriesOut={[]} nowIso={stampNowIso()} />;
}
