import { redirect } from "next/navigation";
import type { Tile } from "@/features/home/components/home-kit";
import { DOS_TOOLS } from "@/features/tenants/components/biz-kit";
import { StudioHome } from "@/features/tenants/components/StudioHome";
import { photoUrl } from "@/lib/media/photo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPublishedStylesByTenant } from "@/repositories/classes";
import { findStudioDeck } from "@/repositories/home";
import { findPlanCatalog, pickPlan } from "@/repositories/plans";
import { findPublicTenant } from "@/repositories/publicProfile";
import { countRoomsByTenants } from "@/repositories/rooms";
import { findStudioProofPhotos } from "@/repositories/studioVerification";
import { findMyStudioSubscriptions, type StudioSubscriptionState } from "@/repositories/subscriptions";
import { findMyMemberships } from "@/repositories/tenants";

/* the clock lives outside the component (react-hooks/purity) — the deck's one
   Live badge is arithmetic over the moment the page was served */
const stampNowIso = (): string => new Date().toISOString();

/** /business/{tenantId} — ONE STUDIO'S HOME (14 Sep 2026). The hub row used to
 *  open the classes register; it opens this now, and the register is one of
 *  the tools. Only a studio has it: an artist page's desk IS its register, and
 *  an organization's hosting row (R15) has only its events desk. */
export default async function StudioHomePage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
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
  if (tenant.type === "org") {
    redirect(`/business/${tenantId}/events`);
  }
  if (tenant.type !== "studio") {
    redirect(`/business/${tenantId}/classes`);
  }

  const isOwner = memberRole === "owner";
  /* the pair that may change the studio's picture — the same pair the storage
     policy and set_business_profile_photo admit (20260829230000) */
  const canEditPhoto = isOwner || memberRole === "trainer";
  const nowIso = stampNowIso();
  const [photos, deck, roomCounts, stylesByTenant, editable, subs, catalog] = await Promise.all([
    /* the header pictures — the photos of its space, as shown to DanceOS;
       signed, and since 15 Sep 2026 readable by the whole team */
    findStudioProofPhotos(supabase, tenantId),
    findStudioDeck(supabase, tenant, nowIso),
    countRoomsByTenants(supabase, [tenantId]),
    findPublishedStylesByTenant(supabase, [tenantId]).catch(() => new Map<string, string[]>()),
    /* ⚠ NO EVENTS TILE ON A STUDIO'S HOME (15 Sep 2026). It was here from
       14 Sep and it was wrong: R15 makes an event the ORGANIZATION's, and
       `save_event` refuses a studio host outright — so a tile here said this
       studio has events when the database will not let it have one. The
       happy path already asserted the same rule on the classes register
       (`Events` absent, line 754); this is that rule, kept. Events opens from
       the organization's Home. */
    /* the studio as its Edit sheet reads it (About, Since, the pin…) — the owner's pencil */
    isOwner ? findPublicTenant(supabase, tenantId).catch(() => null) : Promise.resolve(null),
    /* WHERE ITS SUBSCRIPTION STANDS (15 Sep 2026) — the owner's only door to
       cancelling, now that the hub is one card per studio */
    isOwner
      ? findMyStudioSubscriptions(supabase, [tenantId]).catch(() => ({}) as Record<string, StudioSubscriptionState>)
      : Promise.resolve({} as Record<string, StudioSubscriptionState>),
    isOwner ? findPlanCatalog(supabase).catch(() => []) : Promise.resolve([]),
  ]);

  /* A STUDIO'S GRID, IN THE USER'S ORDER (18 Sep 2026, their list for all four
     kinds of account — deviation row R18): Classes · Calendar · Stats · Team ·
     Students · Earnings · Memberships · Assets · Rooms · Media. Earnings is the
     owner's (the desk is server-checked owner-only). Memberships and Assets have
     a prototype screen (S_memberships 16846, S_assets 16791) and no desk yet, so
     they open the prototype's own "nothing here yet" rather than nothing — a
     tile that opens nothing is a lie, and so is a grid missing what the user
     asked to see on it. MEDIA (15 Sep 2026) is the studio's two pictures as a desk. */
  const desk = (path: string) => `/business/${tenantId}/${path}`;
  const tiles: Tile[] = [
    { name: DOS_TOOLS.classes.name, href: desk("classes"), k: "classesmod", c: DOS_TOOLS.classes.c },
    { name: DOS_TOOLS.calendar.name, href: desk("calendar"), k: "calendar", c: DOS_TOOLS.calendar.c },
    /* Stats left the tab bar for the grid (15 Sep 2026) — a studio's is the studio board */
    { name: DOS_TOOLS.stats.name, href: "/stats?tab=charts&seg=studio", k: "stats", c: DOS_TOOLS.stats.c },
    { name: DOS_TOOLS.team.name, href: desk("staff"), k: "team", c: DOS_TOOLS.team.c },
    { name: DOS_TOOLS.students.name, href: desk("students"), k: "students", c: DOS_TOOLS.students.c },
    ...(isOwner ? [{ name: DOS_TOOLS.earn.name, href: desk("earnings"), k: "earn", c: DOS_TOOLS.earn.c } as Tile] : []),
    { name: DOS_TOOLS.memberships.name, href: desk("memberships"), k: "memberships", c: DOS_TOOLS.memberships.c },
    { name: DOS_TOOLS.assets.name, href: desk("assets"), k: "assets", c: DOS_TOOLS.assets.c },
    { name: DOS_TOOLS.rooms.name, href: desk("rooms"), k: "rooms", c: DOS_TOOLS.rooms.c },
    { name: DOS_TOOLS.media.name, href: desk("media"), k: "media", c: DOS_TOOLS.media.c },
  ];

  return (
    <StudioHome
      tenant={tenant}
      photo={photoUrl(tenant.photoPath)}
      canEditPhoto={canEditPhoto}
      header={photos}
      ownerId={isOwner ? user.id : null}
      editable={editable}
      subscription={subs[tenantId] ?? null}
      studioPrice={pickPlan(catalog, "studio")}
      deck={deck}
      roomCount={roomCounts[tenantId] ?? 0}
      styles={stylesByTenant.get(tenantId) ?? []}
      tiles={tiles}
    />
  );
}
