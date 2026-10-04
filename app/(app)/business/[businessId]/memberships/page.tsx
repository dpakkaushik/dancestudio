import { notFound, redirect } from "next/navigation";
import { MembershipForm } from "@/features/memberships/components/MembershipForm";
import { MembershipsScreen } from "@/features/memberships/components/MembershipsScreen";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findBusinessMemberships } from "@/repositories/memberships";
import { findMyMemberships as findMyTeams } from "@/repositories/businesses";

/** /business/{businessId}/memberships — THE STUDIO'S OWN MEMBERSHIPS DESK.
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
export default async function StudioMembershipsPage({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { businessId } = await params;
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
  const seat = teams.find((m) => m.business.id === businessId);
  if (!seat) {
    notFound();
  }
  /* ⚠ the OWNER's, like the studio's Earnings desk: `save_membership` admits the
     owner alone, so a trainer opening this would read a list they could add
     nothing to and press a button the database refuses. */
  if (seat.memberRole !== "owner") {
    redirect(`/business/${businessId}`);
  }
  /* ⚠⚠ THE ORGANIZATION REFUSAL WENT WITH ORGANIZATIONS (29 Sep 2026). It was
     the user's answer of 22 Sep ("membership not required for organization") and
     it guarded THIS address, which admits the owner of any business they are on
     — an organization owned its hosting row, so it could type its way here and
     file a membership nothing could ever buy. There is no such row to refuse
     now, and `save_membership`'s own check (read off the live catalog on 28 Sep)
     admits a studio or an artist page and nothing else. */
  const selling = await findBusinessMemberships(supabase, businessId).catch(() => []);
  /* the form opens over THIS studio's desk (22 Sep 2026), so the seller is the
     route's own business — the `?business=` pointer `/memberships/new` needs is
     one the URL here already carries, and one this page has already authorized */
  return (
    <>
      <MembershipsScreen passes={[]} selling={selling} canSell business={{ id: businessId, name: seat.business.name }} seller={{ name: seat.business.name, photoPath: seat.business.photoPath ?? null, kind: "studio", href: `/studio/${businessId}` }} />
      {opening ? <MembershipForm sellerId={businessId} sellerName={seat.business.name} backTo={`/business/${businessId}/memberships`} sheet /> : null}
    </>
  );
}
