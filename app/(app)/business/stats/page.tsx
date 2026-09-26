import { redirect } from "next/navigation";

/** `/business/stats` IS AN ADDRESS, NOT A SCREEN (22 Sep 2026; re-pointed
 *  26 Sep 2026).
 *
 *  It redirected to `/org/{me}/stats`, the organization LOGIN's combined
 *  dashboard. That login is retired and the dashboard with it — an organization
 *  is a business a person opens and runs no studios, so there is nothing to
 *  combine. The address goes to the hub that lists their organizations.
 *
 *  ⚠ THE ROUTE STAYS (Rule 14): the installed TWA reopens on the last URL it
 *  showed. `OrgDashboard` went with the screen — nothing else drew it. */
export default function OrgStatsAddress() {
  redirect("/organizations");
}
