import { EnquiriesDesk } from "@/features/enquiries/components/EnquiriesDesk";

/** A STUDIO'S OWN ENQUIRIES DESK (2 Oct 2026) — under the studio, so the chrome
 *  stays the studio's. `EnquiriesDesk` re-checks that this account runs it. */
export default async function BusinessEnquiriesPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  return <EnquiriesDesk as={businessId} />;
}
