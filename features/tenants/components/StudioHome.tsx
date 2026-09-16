import Link from "next/link";
import { ToolGrid, type Tile } from "@/features/home/components/home-kit";
import { HEAD_LINK, PILL_DARK, PILL_LIGHT, TodayShelf } from "@/features/home/components/TodayShelf";
import { PhotoPicker } from "@/features/media/components/PhotoPicker";
import { BusinessEditButton } from "@/features/profiles/components/BusinessEditSheet";
import { HeaderRemove } from "@/features/profiles/components/HeaderRemove";
import type { HeroShot } from "@/features/profiles/components/HeroRail";
import { HeroDot, HeroPlace, IdentityHero } from "@/features/profiles/components/hero-kit";
import { ProfileShare } from "@/features/profiles/components/ProfileShare";
import { EyeIcon, cornerChip, gradientOf } from "@/features/profiles/components/profile-kit";
import { StudioSubscriptionStrip } from "@/features/tenants/components/StudioSubscriptionStrip";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { PROOF_MAX } from "@/lib/media/proof";
import type { PlanCatalogRow } from "@/repositories/plans";
import type { StudioSubscriptionState } from "@/repositories/subscriptions";
import type { DeckItem } from "@/types/home";
import type { PublicTenant } from "@/types/publicProfile";
import type { Tenant } from "@/types/tenant";

/** ONE STUDIO'S OWN HOME (14 Sep 2026) — what a studio row on the hub opens.
 *
 *  The user, pressing a verified studio on the hub and landing on the classes
 *  register: *"I should get something like [the prototype's studio Home], with
 *  a scrollable header."* So this is the prototype's S_homebiz (7354-7660) —
 *  today's schedule as the deck asked the studio's question, then the Studio
 *  Tools grid — under the identity hero every identity page wears, because an
 *  organization runs several studios and each one is its own place, with its
 *  own pictures, its own rooms and its own day.
 *
 *  THE HERO'S TWO PICTURES (15 Sep 2026, the user: "I need a profile picture
 *  for the studio"): the round disc is the studio's OWN picture —
 *  `tenants.photo_path`, set right here by the ＋ on its rim, by the owner or a
 *  trainer — and the header is the photos of its space it showed DanceOS for
 *  the badge, which are its header pictures now. The owner adds to them from
 *  the Add tile and takes one away from its ✕; the database keeps at least one
 *  ("make sure he can't delete all"), so the ✕ is not drawn on the last. The
 *  Media tool is the same pictures as a desk. Nothing here is a second
 *  implementation: the hero is `IdentityHero`, the shelf is `TodayShelf`, the
 *  grid is Home's `ToolGrid`. */
export function StudioHome({
  tenant,
  /** the studio's own picture — `tenants.photo_path`, served from the public bucket */
  photo,
  /** an owner or trainer — the pair that may change the picture */
  canEditPhoto,
  /** the photos of its space, as shown to DanceOS — signed URLs */
  header,
  /** the owner — the one who adds to the header and takes from it */
  canEditHeader,
  /** the owner's own id: the folder in the private bucket a new picture goes into */
  ownerId,
  /** the studio as its Edit sheet reads it — About, Since, the number, the links,
   *  the pin; null for anybody but the owner, and the pencil is not drawn */
  editable = null,
  /** WHERE THIS STUDIO'S SUBSCRIPTION STANDS — the owner's only door to
   *  cancelling since the hub collapsed to one card (15 Sep 2026); null for a
   *  trainer, who neither pays nor cancels */
  subscription = null,
  studioPrice = null,
  deck,
  roomCount,
  /** what it teaches, off its PUBLISHED classes — a studio with none says nothing (7419-7421) */
  styles,
  tiles,
}: {
  tenant: Tenant;
  photo: string | null;
  canEditPhoto: boolean;
  header: Array<{ id: string; path: string; url: string }>;
  canEditHeader: boolean;
  ownerId: string | null;
  editable?: PublicTenant | null;
  subscription?: StudioSubscriptionState | null;
  studioPrice?: PlanCatalogRow | null;
  deck: DeckItem[];
  roomCount: number;
  styles: string[];
  tiles: Tile[];
}) {
  const RG = gradientOf(tenant.name);
  const place = [tenant.area, tenant.city].filter(Boolean).join(", ");
  const roomsWords = `${roomCount} room${roomCount === 1 ? "" : "s"}`;
  const shots: HeroShot[] = header.map((p, i) => ({
    key: p.id,
    src: p.url,
    alt: `Header picture ${i + 1} of ${tenant.name} — its space`,
    signed: true,
    /* the last picture has no ✕: the database refuses to empty a header, so a
       control that can only ever be refused is not offered */
    corner: canEditHeader && header.length > 1 ? <HeaderRemove target={{ kind: "studio", id: p.id }} path={p.path} /> : undefined,
  }));

  return (
    <div
      style={{
        background: LILAC,
        color: INK,
        maxWidth: 430,
        margin: "0 auto",
        fontFamily: DOS_UI,
        boxSizing: "border-box",
        paddingBottom: "var(--dos-foot)",
      }}
    >
      <div style={{ padding: "0 16px" }}>
        {/* ── the studio, lit like a player: its colour bleeding off the top, its
            pictures as a swipe, its own picture on the disc, then who it is in
            the order you read a business ── */}
        <IdentityHero
          testId="studio-hero"
          name={tenant.name}
          grad={RG}
          tint={RG[1]}
          eyebrow="Studio"
          /* the badge — set when a DanceOS admin approved this studio */
          verified={Boolean(tenant.verifiedAt)}
          /* the studio's own code, to be held up at its door — the app's one share sheet (7381, 7424) */
          share={<ProfileShare path={`/studio/${tenant.id}`} name={tenant.name} />}
          meta={
            <>
              {place ? <HeroPlace text={place} query={`${tenant.name} ${place}`} /> : null}
              {place ? <HeroDot /> : null}
              {/* "· N rooms" is the hub row's own sub-line (2655), and here it is a door */}
              <Link href={`/business/${tenant.id}/rooms`} aria-label="Rooms at this studio" style={{ color: SUB, textDecoration: "none", fontWeight: 800 }}>
                {roomsWords}
              </Link>
            </>
          }
          styles={styles}
          styleAria={(s) => `${s} — a style this studio teaches`}
          avatar={photo}
          avatarAlt={tenant.name}
          avatarPicker={canEditPhoto ? <PhotoPicker owner={{ kind: "tenant", id: tenant.id }} hasPhoto={Boolean(tenant.photoPath)} label="Change the photo" overlay /> : undefined}
          shots={shots}
          addTile={
            canEditHeader && ownerId && header.length < PROOF_MAX ? (
              <PhotoPicker owner={{ kind: "studioHeader", id: tenant.id, orgId: ownerId }} hasPhoto={false} label="Add a header picture" tile />
            ) : undefined
          }
          addLabel="Add a header picture"
          /* the corner (10613, 15 Sep 2026): the owner's pencil — About, Since,
             the number, the links, the pin — and for everyone on the team the
             eye, the page as a stranger sees it */
          corner={
            <>
              {editable ? <BusinessEditButton tenant={editable} corner /> : null}
              <Link href={`/studio/${tenant.id}`} aria-label="Public view" style={cornerChip}>
                <EyeIcon />
              </Link>
            </>
          }
        />

        {/* ── TODAY, AS THE SCHEDULE IT ACTUALLY IS (7500-7520): every class and
            event running in THIS studio's rooms today, one card each, in the
            order the day happens; a studio's doors are its own (7143-7150) ── */}
        <TodayShelf
          deck={deck}
          right={
            <>
              <Link href={`/business/${tenant.id}/classes`} aria-label="Classes at this studio" style={HEAD_LINK}>
                Classes
              </Link>
              <Link href={`/business/${tenant.id}/calendar`} aria-label="Open the studio calendar" style={HEAD_LINK}>
                Calendar ›
              </Link>
            </>
          }
          emptyTitle="Nothing in your rooms today"
          emptyBody="Every class and event running in this studio’s rooms shows up here on the day."
          emptyActions={
            <>
              <Link href="/managed" style={PILL_LIGHT}>
                See everything you manage
              </Link>
              <Link href={`/business/${tenant.id}/calendar`} aria-label="Open the studio calendar" style={PILL_DARK}>
                Open the calendar
              </Link>
            </>
          }
        />

        {/* ── the subscription, for the owner (15 Sep 2026): what it is doing,
              and the one control. It lived under the studio's row on the hub
              until that collapsed to one card — and the hub was the only door
              to cancelling, so it came here rather than being lost. ── */}
        {subscription ? (
          <div style={{ position: "relative", zIndex: 1, background: LILAC }}>
            <StudioSubscriptionStrip
              tenantId={tenant.id}
              tenantName={tenant.name}
              verified={Boolean(tenant.verifiedAt)}
              state={subscription}
              studioPrice={studioPrice}
            />
          </div>
        ) : null}

        {/* ── STUDIO TOOLS (7590-7620): the same tile language as Home's grid, and
            every door is THIS studio's ── */}
        <div style={{ position: "relative", zIndex: 1, background: LILAC, marginBottom: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: -0.3, color: INK, fontFamily: DOS_DISPLAY, margin: "4px 0 7px" }}>Studio Tools</div>
          <ToolGrid tiles={tiles} />
        </div>
      </div>
    </div>
  );
}
