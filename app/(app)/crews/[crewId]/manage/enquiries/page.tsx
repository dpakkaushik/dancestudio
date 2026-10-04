import { redirect } from "next/navigation";

/** ⚠ AN ADDRESS, NOT A PAGE (2 Oct 2026) — and since 4 Oct 2026 a crew takes
 *  no enquiries at all (the user: "remove enquiries for crew"), so an old link
 *  lands on the crew's Inbox, which is Requests · Invites. Kept for Rule 14. */
export default async function CrewEnquiriesPage({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  redirect(`/crews/${crewId}/inbox`);
}
