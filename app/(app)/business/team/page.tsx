import { NotBuiltYet } from "@/features/shell/components/NotBuiltYet";

/** /business/team — the Team tile on an ORGANIZATION's Home (18 Sep 2026, the
 *  user's list: "Organization Users — Events, Studios, Team, Earnings, Stats").
 *  An organization is ONE LOGIN today (the accounts slice, 8 Sep 2026): the
 *  people who run its studios sit on each studio's own Team desk, and nobody
 *  sits at the organization level. Adding them there needs a table nobody has
 *  designed (org members, their powers), so this is the honest door until then. */
export default function OrgTeamPage() {
  return (
    <NotBuiltYet
      tool="team"
      what="The people who run this organization with you. Today each studio has its own Team desk; people at the organization level are on the list."
    />
  );
}
