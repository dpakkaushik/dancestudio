import { notFound, redirect } from "next/navigation";
import { MembershipForm } from "@/features/memberships/components/MembershipForm";
import { MembershipsScreen } from "@/features/memberships/components/MembershipsScreen";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findBusinessMemberships } from "@/repositories/memberships";
import { findMyMemberships as findMyTeams } from "@/repositories/tenants";

/** /business/{tenantId}/memberships — THE STUDIO'S OWN MEMBERSHIPS DESK.
 *
 *  ⚠⚠ THIS WAS A "NOTHING HERE YET" STUB UNTIL 21 Sep 2026, and that is the
 *  whole of the user's "fix memberships for studio". The tile was drawn on
 *  18 Sep with the prototype's shrug behind it because no desk existed; the desk
 *  landed on 19 Sep at `/memberships` — the four-field form, the two sides, the
 *  usage page — and NOBODY CAME BACK FOR THE TILE. So for two days a studio
 *  owner pressing Memberships on their own studio's home was told the feature
 *  does not exist, while the same feature was live one address away.
 *
 *  ⚠ AND THE SECOND HALF, WHICH IS WHY THIS ADDRESS HAD TO EXIST RATHER THAN
 *  REDIRECT: `/memberships` sells from "the first business you own"
 *  (`teams.find(...)`), so an organization running two studios could only ever
 *  reach ONE of them, arbitrarily, and the form would have made the second
 *  studio's membership against the first. Every other per-studio desk — Classes,
 *  Rooms, Team, Students, Earnings — hangs off the studio's own home for exactly
 *  this reason, and memberships belong there with them.
 *
 *  A studio holds no passes of its own (a business is not a person,
 *  `guard_person_only`), so this is the MANAGE side alone. `/memberships` keeps
 *  being the PERSON's desk: the passes they hold, and what their artist page
 *  sells. */
export default async function StudioMembershipsPage({ params, searchParams }: { params: Promise<{ tenantId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { tenantId } = await params;
  const opening = (await searchParams).new === "1";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  /* MEMBERSHIP IS THE SPINE (the standing rule — RLS is a ceiling, not a scope):
     `findMyTeams` says `user_id = auth.uid()` out loud, so this asks whether
     THIS person is on THIS business rather than whether the row is readable. */
  const teams = await findMyTeams(supabase).catch(() => []);
  const seat = teams.find((m) => m.tenant.id === tenantId);
  if (!seat) {
    notFound();
  }
  /* ⚠ the OWNER's, like the studio's Earnings desk: `save_membership` admits the
     owner alone, so a trainer opening this would read a list they could add
     nothing to and press a button the database refuses. */
  if (seat.memberRole !== "owner") {
    redirect(`/business/${tenantId}`);
  }
  /* ⚠⚠ AND AN ORGANIZATION SELLS NO MEMBERSHIPS (22 Sep 2026, the user:
     "membership not required for organization" — the same answer they gave the
     tile audit a day earlier). No grid has ever drawn this tile for one, so the
     ask is not about the grid: it is about THIS address, which admits the owner
     of any business they are on — and an organization OWNS its hosting row
     (R15). So an organization could type its way here and file a membership
     **nothing could ever buy**, because that row is `unlisted` for ever.
     The redirect is its events desk, which is what `type = 'org'` means on
     every other per-studio route (`/business/{id}` has sent one there since
     15 Sep), so the shape is the one already in this app rather than a new one.
     ⚠ THIS IS A PRESENTATION GATE: `save_membership` still admits the owner of
     ANY business with no type check, so a direct RPC call can still make one.
     That clause is owed to the next migration that touches memberships (NEXT TO
     DO #0al) — it is a rule change, and this file's standing rule is that the
     list goes in front of the user before `db push`. */
  if (seat.tenant.type === "org") {
    redirect(`/business/${tenantId}/events`);
  }
  const selling = await findBusinessMemberships(supabase, tenantId).catch(() => []);
  /* the form opens over THIS studio's desk (22 Sep 2026), so the seller is the
     route's own business — the `?business=` pointer `/memberships/new` needs is
     one the URL here already carries, and one this page has already authorized */
  return (
    <>
      <MembershipsScreen passes={[]} selling={selling} canSell business={{ id: tenantId, name: seat.tenant.name }} />
      {opening ? <MembershipForm sellerId={tenantId} sellerName={seat.tenant.name} backTo={`/business/${tenantId}/memberships`} sheet /> : null}
    </>
  );
}
