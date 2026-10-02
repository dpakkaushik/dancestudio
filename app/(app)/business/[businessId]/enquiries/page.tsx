import { redirect } from "next/navigation";

/** ⚠ AN ADDRESS, NOT A PAGE (2 Oct 2026): a studio's enquiries are its Inbox's
 *  third desk again (the user: "shift back enquiries to inbox from home tools
 *  for all profiles"). The Inbox re-checks the seat (Rule 14 keeps this alive). */
export default async function StudioEnquiriesPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  redirect(`/business/${businessId}/inbox?show=enquiries`);
}
