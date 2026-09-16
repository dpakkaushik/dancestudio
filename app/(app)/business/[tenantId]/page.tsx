import { redirect } from "next/navigation";
import type { Tile } from "@/features/home/components/home-kit";
import { DOS_TOOLS } from "@/features/tenants/components/biz-kit";
import { StudioHome } from "@/features/tenants/components/StudioHome";
import { photoUrl } from "@/lib/media/photo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPublishedStylesByTenant } from "@/repositories/classes";
import { findStudioDeck } from "@/repositories/home";
import { findMyOrgTenantId } from "@/repositories/orgStanding";
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
     policy and set_tenant_photo admit (20260829230000) */
  const canEditPhoto = isOwner || memberRole === "trainer";
  const nowIso = stampNowIso();
  const [photos, deck, roomCounts, stylesByTenant, eventsHostId, editable, subs, catalog] = await Promise.all([
    /* the header pictures — the photos of its space, as shown to DanceOS;
       signed, and since 15 Sep 2026 readable by the whole team */
    findStudioProofPhotos(supabase, tenantId),
    findStudioDeck(supabase, tenant, nowIso),
    countRoomsByTenants(supabase, [tenantId]),
    findPublishedStylesByTenant(supabase, [tenantId]).catch(() => new Map<string, string[]>()),
    /* R15: events are the ORGANIZATION's — the tile points at its one desk, owner only */
    isOwner ? findMyOrgTenantId(supabase).catch(() => null) : Promise.resolve(null),
    /* the studio as its Edit sheet reads it (About, Since, the pin…) — the owner's pencil */
    isOwner ? findPublicTenant(supabase, tenantId).catch(() => null) : Promise.resolve(null),
    /* WHERE ITS SUBSCRIPTION STANDS (15 Sep 2026) — the owner's only door to
       cancelling, now that the hub is one card per studio */
    isOwner
      ? findMyStudioSubscriptions(supabase, [tenantId]).catch(() => ({}) as Record<string, StudioSubscriptionState>)
      : Promise.resolve({} as Record<string, StudioSubscriptionState>),
    isOwner ? findPlanCatalog(supabase).catch(() => []) : Promise.resolve([]),
  ]);

  /* a photo whose URL could not be signed is left out — the rail says what it
     has, and the Media desk is where a missing one is chased */
  const header = photos.flatMap((p) => (p.url ? [{ id: p.id, path: p.path, url: p.url }] : []));

  /* the prototype's studio grid (7359-7373) minus the doors that do not exist —
     Expenses, Assets and Reports have no page, and a tile that opens nothing
     is a lie. Earnings is the owner's (the desk is server-checked owner-only).
     MEDIA (15 Sep 2026, the user: "create a tab for media along with classes,
     calendar, earnings") is the studio's two pictures as a desk. */
  const tiles: Tile[] = [
    { name: "Classes", href: `/business/${tenantId}/classes`, k: "classesmod", c: "#0D9488" },
    ...(eventsHostId ? [{ name: "Events", href: `/business/${eventsHostId}/events`, k: "events", c: "#F59E0B" } as Tile] : []),
    { name: "Calendar", href: `/business/${tenantId}/calendar`, k: "calendar", c: "#5AC8FA" },
    /* Stats left the tab bar for the grid (15 Sep 2026) — a studio's is the studio board */
    { name: DOS_TOOLS.stats.name, href: "/stats?tab=charts&seg=studio", k: "stats", c: DOS_TOOLS.stats.c },
    { name: DOS_TOOLS.media.name, href: `/business/${tenantId}/media`, k: "media", c: DOS_TOOLS.media.c },
    { name: "Students", href: `/business/${tenantId}/students`, k: "students", c: "#8B5CF6" },
    { name: "Team", href: `/business/${tenantId}/staff`, k: "team", c: "#F97316" },
    ...(isOwner ? [{ name: "Earnings", href: `/business/${tenantId}/earnings`, k: "earn", c: "#22C55E" } as Tile] : []),
    { name: "Rooms", href: `/business/${tenantId}/rooms`, k: "rooms", c: "#3498DB" },
  ];

  return (
    <StudioHome
      tenant={tenant}
      photo={photoUrl(tenant.photoPath)}
      canEditPhoto={canEditPhoto}
      header={header}
      canEditHeader={isOwner}
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
