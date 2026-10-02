import { redirect } from "next/navigation";
import type { Tile } from "@/features/home/components/home-kit";
import { toolsLayoutKey } from "@/features/home/toolOrder";
import { DOS_TOOLS } from "@/features/businesses/components/biz-kit";
import { StudioHome } from "@/features/businesses/components/StudioHome";
import { photoUrl } from "@/lib/media/photo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPublishedStylesByBusiness } from "@/repositories/classes";
import { findFollowerCounts } from "@/repositories/follows";
import { findMyToolOrder } from "@/repositories/layout";
import { findStudioDeck } from "@/repositories/home";
import { findPublicStudioTeam, findPublicBusiness } from "@/repositories/publicProfile";
import { studioTeamRows } from "@/features/profiles/teamFollowing";
import { countRoomsByBusinesses } from "@/repositories/rooms";
import { findStudioProofPhotos } from "@/repositories/studioVerification";
import { findMyMemberships, runsTheBusiness } from "@/repositories/businesses";

/* the clock lives outside the component (react-hooks/purity) — the deck's one
   Live badge is arithmetic over the moment the page was served */
const stampNowIso = (): string => new Date().toISOString();

/** /business/{businessId} — ONE STUDIO'S HOME (14 Sep 2026). The hub row used to
 *  open the classes register; it opens this now, and the register is one of the
 *  tools. An artist page's desk IS its register, so that address redirects. */
export default async function StudioHomePage({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { businessId } = await params;
  /* ⚠ `?edit=1` — Settings' "Edit studio" navigates here with it (22 Sep 2026),
     the way its Invoices, Refunds and Payments siblings navigate to their desks.
     The gate is re-checked below rather than trusted from the query: the sheet
     is drawn only when `editable` came back, which is the owner-only read. */
  const editOpen = (await searchParams).edit === "1";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // membership is the spine — findMyMemberships says user_id = auth.uid() out loud
  const memberships = await findMyMemberships(supabase);
  const membership = memberships.find((m) => m.business.id === businessId);
  /** ⚠⚠ AND THE SEAT HAS TO BE ONE THAT RUNS THE PLACE (28 Sep 2026, the user:
   *  "that profile switcher and rights should never be given for faculty,
   *  visiting faculty, assistant, event team or other team members").
   *
   *  The switcher stopped listing a business a faculty seat is on, and a door
   *  closed only in the menu that opens it is not closed — this page is where the
   *  tool grid lives, and every desk under it is reached from here. A seat that
   *  may not act as the business lands back on the hub, which is the screen that
   *  tells them what they DO have.
   *
   *  ⚠ SAID PLAINLY: this is a PRESENTATION gate, like the students desk's own
   *  (21 Sep). RLS still admits every live member to the rows underneath, so a
   *  determined seat with an API client reads them; narrowing THAT is a policy
   *  change on several tables and is not this slice. What changes today is that
   *  the app stops handing it over. */
  if (!membership || !runsTheBusiness(membership.memberRole)) {
    redirect("/business");
  }
  const { business, memberRole } = membership;
  const isOwner = memberRole === "owner";

  /* ⚠⚠ THE ORGANIZATION'S HOME WENT WITH ORGANIZATIONS (29 Sep 2026, the user:
     "remove Organization and Events completely"). It was this route's first
     branch from 26 Sep — `OrgHome`, its own tool grid (Events · Enquiries ·
     Team · Earnings · Assets · Subscription) and its own five reads — and
     before that an `org` row redirected here to its events desk, because it was
     the retired organization login's hosting row. There is no such row now. */
  if (business.type !== "studio") {
    /* an artist page's register is the Manage segment of Your classes — ONE hop
       (19 Sep 2026): the old two-hop chain through /classes left a URL in the
       history that could only ever redirect, and back onto it looped forward */
    redirect("/my-classes?show=manage");
  }

  /* the pair that may change the studio's picture — the same pair the storage
     policy and set_business_profile_photo admit (20260829230000) */
  const canEditPhoto = isOwner || memberRole === "trainer";
  const nowIso = stampNowIso();
  const [photos, deck, roomCounts, stylesByBusiness, editable, followerCounts, team, toolOrder] = await Promise.all([
    /* the header pictures — the photos of its space, as shown to DanceOS;
       signed, and since 15 Sep 2026 readable by the whole team */
    findStudioProofPhotos(supabase, businessId),
    findStudioDeck(supabase, business, nowIso),
    countRoomsByBusinesses(supabase, [businessId]),
    findPublishedStylesByBusiness(supabase, [businessId]).catch(() => new Map<string, string[]>()),
    /* ⚠ NO EVENTS TILE ON A STUDIO'S HOME (15 Sep 2026): R15 makes an event the
       ORGANIZATION's, and `save_event` refuses a studio host outright. */
    /* the studio as its Edit sheet reads it (About, Since, the pin…) — the owner's pencil */
    isOwner ? findPublicBusiness(supabase, businessId).catch(() => null) : Promise.resolve(null),
    /* HOW MANY FOLLOW THIS STUDIO (20 Sep 2026) — `follower_counts` is
       aggregate-only, so it names nobody; a failed read is a 0 on a figure */
    findFollowerCounts(supabase, [businessId]).catch(() => new Map<string, number>()),
    /* ⚠ AND WHAT IT FOLLOWS, WHICH IS WHAT ITS OWNER FOLLOWS (20 Sep 2026): a
       studio has nothing to follow WITH, so the honest count is the account that
       runs it; `public_studio_team` already names the owner */
    findPublicStudioTeam(supabase, businessId).catch(() => []),
    /* ⚠ HOW THIS MEMBER HAS ARRANGED THIS STUDIO'S TOOLS (22 Sep 2026), keyed by
       the STUDIO so two people on one team each get their own */
    findMyToolOrder(supabase, user.id, toolsLayoutKey("studio", businessId)),
  ]);
  /* ⚠ A STUDIO'S FOLLOWING IS ITS TEAM (2 Oct 2026, the user: "following for
     crew and studio should by default show list of team members") — the team
     read above is the whole of it, so the owner's follow count and its extra
     round trip are gone */

  /* ⚠⚠ THE THREE STANDING READS ARE GONE FROM THIS ROUTE (21 Sep 2026): the
     verification, the subscription and the price list are read by the pages
     that show them, in the studio's own Settings. */

  /* A STUDIO'S GRID, IN THE USER'S ORDER (18 Sep 2026, deviation row R18):
     Classes · Calendar · Team · Students · Earnings · Memberships · Assets ·
     Rooms. Earnings, Memberships and Assets are the OWNER's, and the Students
     tile is not drawn for a seat that may not read them (21 Sep 2026). MEDIA is
     off the grid (21 Sep 2026); STATS is the chip beside the QR (18 Sep). */
  const desk = (path: string) => `/business/${businessId}/${path}`;
  const tiles: Tile[] = [
    { name: DOS_TOOLS.classes.name, href: desk("classes"), k: "classesmod", c: DOS_TOOLS.classes.c },
    { name: DOS_TOOLS.calendar.name, href: desk("calendar"), k: "calendar", c: DOS_TOOLS.calendar.c },
    { name: DOS_TOOLS.team.name, href: desk("staff"), k: "team", c: DOS_TOOLS.team.c },
    ...(memberRole === "visiting_faculty" || memberRole === "assistant"
      ? []
      : ([{ name: DOS_TOOLS.students.name, href: desk("students"), k: "students", c: DOS_TOOLS.students.c }] as Tile[])),
    ...(isOwner ? [{ name: DOS_TOOLS.earn.name, href: desk("earnings"), k: "earn", c: DOS_TOOLS.earn.c } as Tile] : []),
    ...(isOwner
      ? ([
          { name: DOS_TOOLS.memberships.name, href: desk("memberships"), k: "memberships", c: DOS_TOOLS.memberships.c },
          { name: DOS_TOOLS.assets.name, href: desk("assets"), k: "assets", c: DOS_TOOLS.assets.c },
        ] as Tile[])
      : []),
    { name: DOS_TOOLS.rooms.name, href: desk("rooms"), k: "rooms", c: DOS_TOOLS.rooms.c },
    /* ⚠ NO ENQUIRIES TILE (2 Oct 2026): a studio's enquiries are its INBOX tab's
       third desk again — the user: "shift back enquiries to inbox from home tools
       for all profiles" */
    /* THE STUDIO'S OWN MANDATE IS A TILE ON ITS HOME (26 Sep 2026, the user:
       "studio and organization subscription managed separately from their
       subscription options … subscriptions also become an option on home tab
       for all profiles and is removed from settings for all") — the owner's,
       because only the owner starts or stops it */
    ...(isOwner ? [{ name: DOS_TOOLS.subscription.name, href: desk("subscription"), k: "subscription", c: DOS_TOOLS.subscription.c } as Tile] : []),
  ];

  return (
    <StudioHome
      business={business}
      photo={photoUrl(business.photoPath)}
      canEditPhoto={canEditPhoto}
      header={photos}
      ownerId={isOwner ? user.id : null}
      editable={editable}
      editOpen={editOpen}
      deck={deck}
      roomCount={roomCounts[businessId] ?? 0}
      /* WHAT IT SAYS IT DANCES, then what it teaches (19 Sep 2026) — the field
         first, the derived list only for a row that predates it */
      styles={business.styles.length ? business.styles : (stylesByBusiness.get(businessId) ?? [])}
      followers={followerCounts.get(businessId) ?? 0}
      followingRows={studioTeamRows(team)}
      tiles={tiles}
      order={toolOrder}
    />
  );
}
