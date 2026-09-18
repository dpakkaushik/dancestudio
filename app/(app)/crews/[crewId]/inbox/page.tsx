import { InboxScreen } from "@/features/inbox/components/InboxScreen";
import { buildRequests } from "@/features/inbox/requestItems";
import { requireLedCrew } from "@/features/crews/server/requireLedCrew";
import { findAskedForMyCrews } from "@/repositories/crews";
import { CREW_TINT } from "@/types/crew";

const stampNowIso = (): string => new Date().toISOString();

/** ONE CREW'S INBOX (18 Sep 2026) — the Inbox tab on a crew's own home. What the
 *  crew has asked of people and is still waiting on: the roster asks, each
 *  withdrawable from here as from the person's Inbox. ⚠ Enquiries to a CREW —
 *  "crews can also get enquiries" — need the database to let an enquiry name a
 *  crew (`enquiries.crew_id`); that migration is written and waits on the user's
 *  word, and this desk gains its Enquiries side the moment it lands. */
export default async function CrewInboxPage({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  const { supabase } = await requireLedCrew(crewId);
  const asked = (await findAskedForMyCrews(supabase)).filter((m) => m.crewId === crewId);
  const { requestsIn, requestsOut } = buildRequests({ crewOut: asked });
  return <InboxScreen accent={CREW_TINT} requestsIn={requestsIn} requestsOut={requestsOut} enquiriesIn={[]} enquiriesOut={[]} nowIso={stampNowIso()} />;
}
