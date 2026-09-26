import { redirect } from "next/navigation";
import type { Tile } from "@/features/home/components/home-kit";
import { toolsLayoutKey } from "@/features/home/toolOrder";
import { DOS_TOOLS } from "@/features/tenants/components/biz-kit";
import { OrgHome } from "@/features/tenants/components/OrgHome";
import { StudioHome } from "@/features/tenants/components/StudioHome";
import { photoUrl } from "@/lib/media/photo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPublishedStylesByTenant } from "@/repositories/classes";
import { findFollowerCounts } from "@/repositories/follows";
import { findMyToolOrder } from "@/repositories/layout";
import { findStudioDeck } from "@/repositories/home";
import { findPublicStudioTeam, findPublicTenant } from "@/repositories/publicProfile";
import { findPersonFollowerCounts } from "@/repositories/publicPerson";
import { countRoomsByTenants } from "@/repositories/rooms";
import { findStudioProofPhotos } from "@/repositories/studioVerification";
import { findMyMemberships } from "@/repositories/tenants";

/* the clock lives outside the component (react-hooks/purity) — the deck's one
   Live badge is arithmetic over the moment the page was served */
const stampNowIso = (): string => new Date().toISOString();

/** /business/{tenantId} — ONE STUDIO'S HOME (14 Sep 2026), AND SINCE 26 Sep 2026
 *  ONE ORGANIZATION'S. The hub row used to open the classes register; it opens
 *  this now, and the register is one of the tools. An artist page's desk IS its
 *  register, so that address redirects. ⚠ An `org` row used to redirect to its
 *  events desk, because it was the retired organization login's hosting row;
 *  an organization is a business a person opens now, with a home of its own. */
export default async function StudioHomePage({ params, searchParams }: { params: Promise<{ tenantId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { tenantId } = await params;
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
  const membership = memberships.find((m) => m.tenant.id === tenantId);
  if (!membership) {
    redirect("/business");
  }
  const { tenant, memberRole } = membership;
  const isOwner = memberRole === "owner";

  if (tenant.type === "org") {
    /* ── AN ORGANIZATION'S HOME (26 Sep 2026) ── */
    const [photos, row, followerCounts, toolOrder] = await Promise.all([
      /* its header pictures — `studio_photos` rows in the private bucket, the same
         read a studio's home makes; the owner and, once public, anyone may sign them */
      findStudioProofPhotos(supabase, tenantId),
      /* the row as the Edit sheet reads it — the owner's pencil, and everybody's
         "Since": an RLS read of one row the member already owns a seat on */
      findPublicTenant(supabase, tenantId).catch(() => null),
      findFollowerCounts(supabase, [tenantId]).catch(() => new Map<string, number>()),
      /* keyed by the ORGANIZATION (`tools:org:{id}`): one account may own several */
      findMyToolOrder(supabase, user.id, toolsLayoutKey("org", tenantId)),
    ]);
    /* AN ORGANIZATION'S GRID: Events · Team · Earnings · Assets · Subscription —
       the owner's alone where the desk behind the tile is the owner's, so a door
       that would be refused is not offered */
    const desk = (path: string) => `/business/${tenantId}/${path}`;
    const tiles: Tile[] = [
      { name: DOS_TOOLS.events.name, href: desk("events"), k: "events", c: DOS_TOOLS.events.c },
      ...(isOwner
        ? ([
            { name: DOS_TOOLS.team.name, href: desk("team"), k: "team", c: DOS_TOOLS.team.c },
            { name: DOS_TOOLS.earn.name, href: desk("earnings"), k: "earn", c: DOS_TOOLS.earn.c },
            { name: DOS_TOOLS.assets.name, href: desk("assets"), k: "assets", c: DOS_TOOLS.assets.c },
            { name: DOS_TOOLS.subscription.name, href: desk("subscription"), k: "subscription", c: DOS_TOOLS.subscription.c },
          ] as Tile[])
        : []),
    ];
    return (
      <OrgHome
        tenant={tenant}
        photo={photoUrl(tenant.photoPath)}
        canEditPhoto={isOwner || memberRole === "trainer"}
        header={photos}
        ownerId={isOwner ? user.id : null}
        editable={isOwner ? row : null}
        since={row?.createdAt ?? null}
        editOpen={editOpen}
        followers={followerCounts.get(tenantId) ?? 0}
        tiles={tiles}
        order={toolOrder}
      />
    );
  }
  if (tenant.type !== "studio") {
    /* an artist page's register is the Manage segment of Your classes — ONE hop
       (19 Sep 2026): the old two-hop chain through /classes left a URL in the
       history that could only ever redirect, and back onto it looped forward */
    redirect("/my-classes?show=manage");
  }

  /* the pair that may change the studio's picture — the same pair the storage
     policy and set_business_profile_photo admit (20260829230000) */
  const canEditPhoto = isOwner || memberRole === "trainer";
  const nowIso = stampNowIso();
  const [photos, deck, roomCounts, stylesByTenant, editable, followerCounts, team, toolOrder] = await Promise.all([
    /* the header pictures — the photos of its space, as shown to DanceOS;
       signed, and since 15 Sep 2026 readable by the whole team */
    findStudioProofPhotos(supabase, tenantId),
    findStudioDeck(supabase, tenant, nowIso),
    countRoomsByTenants(supabase, [tenantId]),
    findPublishedStylesByTenant(supabase, [tenantId]).catch(() => new Map<string, string[]>()),
    /* ⚠ NO EVENTS TILE ON A STUDIO'S HOME (15 Sep 2026): R15 makes an event the
       ORGANIZATION's, and `save_event` refuses a studio host outright. */
    /* the studio as its Edit sheet reads it (About, Since, the pin…) — the owner's pencil */
    isOwner ? findPublicTenant(supabase, tenantId).catch(() => null) : Promise.resolve(null),
    /* HOW MANY FOLLOW THIS STUDIO (20 Sep 2026) — `follower_counts` is
       aggregate-only, so it names nobody; a failed read is a 0 on a figure */
    findFollowerCounts(supabase, [tenantId]).catch(() => new Map<string, number>()),
    /* ⚠ AND WHAT IT FOLLOWS, WHICH IS WHAT ITS OWNER FOLLOWS (20 Sep 2026): a
       studio has nothing to follow WITH, so the honest count is the account that
       runs it; `public_studio_team` already names the owner */
    findPublicStudioTeam(supabase, tenantId).catch(() => []),
    /* ⚠ HOW THIS MEMBER HAS ARRANGED THIS STUDIO'S TOOLS (22 Sep 2026), keyed by
       the STUDIO so two people on one team each get their own */
    findMyToolOrder(supabase, user.id, toolsLayoutKey("studio", tenantId)),
  ]);
  const ownerUserId = team.find((m) => m.role === "owner")?.userId ?? null;
  const ownerCounts = ownerUserId ? await findPersonFollowerCounts(supabase, [ownerUserId]).catch(() => new Map()) : new Map();

  /* ⚠⚠ THE THREE STANDING READS ARE GONE FROM THIS ROUTE (21 Sep 2026): the
     verification, the subscription and the price list are read by the pages
     that show them, in the studio's own Settings. */

  /* A STUDIO'S GRID, IN THE USER'S ORDER (18 Sep 2026, deviation row R18):
     Classes · Calendar · Team · Students · Earnings · Memberships · Assets ·
     Rooms. Earnings, Memberships and Assets are the OWNER's, and the Students
     tile is not drawn for a seat that may not read them (21 Sep 2026). MEDIA is
     off the grid (21 Sep 2026); STATS is the chip beside the QR (18 Sep). */
  const desk = (path: string) => `/business/${tenantId}/${path}`;
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
  ];

  return (
    <StudioHome
      tenant={tenant}
      photo={photoUrl(tenant.photoPath)}
      canEditPhoto={canEditPhoto}
      header={photos}
      ownerId={isOwner ? user.id : null}
      editable={editable}
      editOpen={editOpen}
      deck={deck}
      roomCount={roomCounts[tenantId] ?? 0}
      /* WHAT IT SAYS IT DANCES, then what it teaches (19 Sep 2026) — the field
         first, the derived list only for a row that predates it */
      styles={tenant.styles.length ? tenant.styles : (stylesByTenant.get(tenantId) ?? [])}
      followers={followerCounts.get(tenantId) ?? 0}
      followingN={ownerUserId ? (ownerCounts.get(ownerUserId)?.following ?? null) : null}
      tiles={tiles}
      order={toolOrder}
    />
  );
}
