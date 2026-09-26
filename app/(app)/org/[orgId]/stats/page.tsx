import { redirect } from "next/navigation";

/** `/org/{id}/stats` IS AN ADDRESS NOW, NOT A SCREEN (26 Sep 2026).
 *
 *  It drew an organization's standing as its STUDIOS' rows (push 2), and the
 *  owner's combined dashboard off `my_org_stats` when the id was the caller's
 *  (22 Sep). Both stood on things that are gone: an organization runs no studios
 *  since `20260926120000`, and there is no organization LOGIN whose id could be
 *  the caller's — an organization is a business a person opens. What is left to
 *  say about it is on its public page, so the address goes there.
 *
 *  ⚠ THE ROUTE STAYS (Rule 14): the Stats chip pointed here from two screens,
 *  and the installed TWA reopens on the last URL it showed. */
export default async function OrgStatsAddress({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  redirect(`/org/${orgId}`);
}
