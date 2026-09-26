import { redirect } from "next/navigation";

/** `/business/earnings` IS AN ADDRESS NOW, NOT A SCREEN (26 Sep 2026).
 *
 *  It summed the organization LOGIN's businesses — its studios and its hosting
 *  row — into one combined ledger. That login is retired: an organization is a
 *  business a person opens, runs no studios, and has its own Earnings desk at
 *  `/business/{id}/earnings`, the tile on its home. Somebody standing on the old
 *  address is sent to the hub that lists their organizations.
 *
 *  ⚠ THE ROUTE STAYS (Rule 14): the installed TWA reopens on the last URL it
 *  showed. `OrgEarnings` went with the screen — nothing else drew it. */
export default function OrgEarningsAddress() {
  redirect("/organizations");
}
