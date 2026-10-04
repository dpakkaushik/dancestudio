import { redirect } from "next/navigation";

/** ⚠ AN ADDRESS, NOT A PAGE (4 Oct 2026). A crew's only money was its enquiry
 *  money, and a crew takes no enquiries any more (the user: "remove enquiries
 *  for crew"), so its Earnings desk could only ever read ₹0. An old link lands on
 *  the crew's home (Rule 14). */
export default async function CrewEarningsPage({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  redirect(`/crews/${crewId}/manage`);
}
