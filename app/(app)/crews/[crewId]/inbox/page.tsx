import { InboxScreen } from "@/features/inbox/components/InboxScreen";
import { buildRequests } from "@/features/inbox/requestItems";
import { requireLedCrew } from "@/features/crews/server/requireLedCrew";
import { findAskedForMyCrews } from "@/repositories/crews";
import { CREW_TINT } from "@/types/crew";

const stampNowIso = (): string => new Date().toISOString();

/** ONE CREW'S INBOX (18 Sep 2026) — the Inbox tab on a crew's own home: the
 *  roster asks this crew has out, withdrawable here as from the person's Inbox.
 *  ⚠ NO ENQUIRIES (4 Oct 2026, the user: *"remove enquiries for crew"*): a crew
 *  takes none — `send_enquiry` refuses one in words — so its Inbox is
 *  Requests · Invites. An old `?show=enquiries` link lands on Requests. */
export default async function CrewInboxPage({ params, searchParams }: { params: Promise<{ crewId: string }>; searchParams: Promise<{ show?: string }> }) {
  const { crewId } = await params;
  const { supabase, crew } = await requireLedCrew(crewId);
  const [askedAll, { show }] = await Promise.all([findAskedForMyCrews(supabase, ["asked", "confirmed", "rejected"], { withdrawn: true }), searchParams]);
  const asked = askedAll.filter((m) => m.crewId === crewId);
  const { requestsIn, requestsOut } = buildRequests({ crewOut: asked });
  return (
    <InboxScreen
      accent={CREW_TINT}
      requestsIn={requestsIn}
      requestsOut={requestsOut}
      enquiriesIn={[]}
      enquiriesOut={[]}
      receivedOnly
      noEnquiries
      deskSub={crew.name}
      initialSection={show === "done" ? "done" : undefined}
      nowIso={stampNowIso()}
    />
  );
}
