import { redirect } from "next/navigation";

/** ⚠ AN ADDRESS, NOT A PAGE (2 Oct 2026): a crew's enquiries are its Inbox's
 *  third desk again (the user: "shift back enquiries to inbox from home tools
 *  for all profiles"). The Inbox re-checks the leader (Rule 14 keeps this alive). */
export default async function CrewEnquiriesPage({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  redirect(`/crews/${crewId}/inbox?show=enquiries`);
}
