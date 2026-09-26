import { redirect } from "next/navigation";

/** `/business/team` IS AN ADDRESS NOW, NOT A SCREEN (26 Sep 2026).
 *
 *  It was the organization LOGIN's one Team desk. That login is retired — an
 *  organization is a business a person opens, and can own several — so the desk
 *  is `/business/{id}/team`, one per organization, reached from that
 *  organization's own home. Somebody standing on the old address is sent to the
 *  hub that lists their organizations, from which each desk is one press away.
 *
 *  ⚠ THE ROUTE STAYS (Rule 14): the installed TWA reopens on the last URL it
 *  showed, and a bare 404 reads as a broken build. */
export default function OrgTeamAddress() {
  redirect("/organizations");
}
