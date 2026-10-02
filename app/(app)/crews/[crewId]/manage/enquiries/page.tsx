import { EnquiriesDesk } from "@/features/enquiries/components/EnquiriesDesk";

/** A CREW'S OWN ENQUIRIES DESK (2 Oct 2026) — under the crew's home, so the
 *  chrome stays the crew's. `EnquiriesDesk` re-checks that this account leads it. */
export default async function CrewEnquiriesPage({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  return <EnquiriesDesk as={`crew-${crewId}`} />;
}
