import Link from "next/link";
import { ToolGrid, ToolsPanel, type Tile } from "@/features/home/components/home-kit";
import { TodayShelf } from "@/features/home/components/TodayShelf";
import { BusinessEditButton } from "@/features/profiles/components/BusinessEditSheet";
import type { HeroShot } from "@/features/profiles/components/HeroRail";
import { HeroDot, HeroId, HeroPlace, IdentityHero } from "@/features/profiles/components/hero-kit";
import { memberNoWords } from "@/types/profile";
import { EntityBand, Figure } from "@/features/profiles/components/profile-band";
import { ProfileLink, ProfileShare } from "@/features/profiles/components/ProfileShare";
import { StatsChip } from "@/features/profiles/components/StatsChip";
import { PROFILE_RING, EyeIcon, cornerChip } from "@/features/profiles/components/profile-kit";
import { ActionRow, CallButton, LocationButton, MailButton, mapsPinHref } from "@/features/profiles/components/ContactButtons";
import { EnquiryButton } from "@/features/enquiries/components/EnquirySheet";
import { StudioLinksRow } from "./StudioLinksRow";
import { StudioStylesRow } from "./StudioStylesRow";
import { StudioPicturesButton, StudioPostersButton } from "./StudioPictures";
import { DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import type { ProofPhoto } from "@/lib/media/proof";
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
 *  `businesses.profile_photo_path` — and the header is the photos of its space it showed
 *  DanceOS for the badge, which are its header pictures now.
 *
 *  ⚠ BOTH ARE CHANGED IN THE PENCIL, NOT ON THE HERO (16 Sep 2026). The user
 *  marked the ✕ on the header and the ＋ on the disc: "the update image option
 *  should be inside the edit profile … for cover photos 1–10 images, profile
 *  only one pic … in case of a studio the user submits at least 5 images, he
 *  can delete but can't delete all — 1 will always remain, order doesn't
 *  matter." So the hero shows them and `BusinessEditSheet` edits them, and the
 *  min-one rule is the database's own (`remove_studio_photo` refuses the
 *  last), said in the grid as a disabled ✕ rather than as a press that can only
 *  be refused. The Media tool is the same pictures as a desk. Nothing here is a
 *  second implementation: the hero is `IdentityHero`, the shelf is
 *  `TodayShelf`, the grid is Home's `ToolGrid`. */
export function StudioHome({
  tenant,
  /** the studio's own picture — `businesses.profile_photo_path`, served from the public bucket */
  photo,
  /** an owner or trainer — the pair that may change the picture */
  canEditPhoto,
  /** the photos of its space, as shown to DanceOS — signed URLs */
  header,
  /** the owner's own id: the folder in the private bucket a new picture goes
   *  into. Null for a trainer, who may look at the header but not change it. */
  ownerId,
  /** the studio as its Edit sheet reads it — About, Since, the number, the links,
   *  the pin; null for anybody but the owner, and the pencil is not drawn */
  editable = null,
  deck,
  roomCount,
  /** what it teaches, off its PUBLISHED classes — a studio with none says nothing (7419-7421) */
  styles,
  /** how many people follow this studio — the figure every profile leads with
   *  (20 Sep 2026). `follower_counts` is aggregate-only and anon-readable, so
   *  it costs one row and names nobody. */
  followers = 0,
  followingN = null,
  tiles,
}: {
  tenant: Tenant;
  photo: string | null;
  canEditPhoto: boolean;
  header: ProofPhoto[];
  ownerId: string | null;
  editable?: PublicTenant | null;
  deck: DeckItem[];
  roomCount: number;
  styles: string[];
  followers?: number;
  /** what the ACCOUNT THAT OWNS this studio follows (20 Sep 2026) — a studio
   *  has nothing to follow with of its own; null draws no figure */
  followingN?: number | null;
  tiles: Tile[];
}) {
  /* ⚠ GOLD, BECAUSE IT IS A STUDIO (20 Sep 2026, the user's colour list) — it
     was `gradientOf(tenant.name)`, a hash, so this screen and the studio's own
     public page could not even agree with each other */
  const RG = PROFILE_RING.studio;
  const place = [tenant.area, tenant.city].filter(Boolean).join(", ");
  const pinHref = editable?.locationSetAt && editable.lat != null && editable.lng != null ? mapsPinHref(editable.lat, editable.lng) : null;
  const roomsWords = `${roomCount} room${roomCount === 1 ? "" : "s"}`;
  /* a photo whose URL could not be signed is not a square the rail can draw —
     it is still one of the studio's pictures, and the Edit sheet still counts it */
  const shots: HeroShot[] = header
    .filter((p) => p.url)
    .map((p, i) => ({
      key: p.id,
      src: p.url as string,
      alt: `Header picture ${i + 1} of ${tenant.name} — its space`,
      signed: true,
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
          /* the number beside the word, exactly as a person's Home prints theirs
             (20 Sep 2026, the user: "Id should be besides profile type on home
             and profilepage both") — `businesses.member_no` is new today */
          eyebrowSub={tenant.memberNo ? <HeroId>{memberNoWords(tenant.memberNo)}</HeroId> : null}
          /* the badge — set when a DanceOS admin approved this studio */
          verified={Boolean(tenant.verifiedAt)}
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
          /* ⚠ EMPTY ON PURPOSE — the band below draws them, so they land AFTER
             the figures and before the links, which is the order Home and the
             Profile tab use. The hero's own row comes before its children. */
          styles={[]}
          avatar={photo}
          avatarAlt={tenant.name}
          /* ⚠ THE DISC IS THE PICTURE, AND THE ⊕ BESIDE IT CHANGES IT (20 Sep
             2026, the user: "edit profile for studio not consistent with how its
             done for Artist and users. for social media links, photos etc.").
             It opened the studio's public page until today — which the eye in
             the corner and the QR chip both already do, three doors to one
             address — while a person's disc has opened their own picture since
             19 Sep and their ⊕ has been the one way to change it. Same two
             controls, same two jobs, on both kinds of home now. */
          avatarSlot={<StudioPicturesButton tenantId={tenant.id} tenantName={tenant.name} grad={RG} avatar={photo} canEdit={canEditPhoto} />}
          shots={shots}
          /* the posters' own ⊕ at the rail's corner — the OWNER's alone, because
             a new picture goes into the owner's folder in the private bucket */
          headerEdit={ownerId ? <StudioPostersButton tenantId={tenant.id} tenantName={tenant.name} ownerId={ownerId} photos={header} /> : null}
          /* the corner (10613, 15 Sep 2026): the owner's pencil — About, Since,
             the number, the links, the pin — over the eye onto THIS STUDIO'S
             public page.
             ⚠⚠ THE EYE IS BACK, AND IT IS A CORRECTION OF MY OWN (21 Sep 2026,
             the user: "studio and crew pages on home tab should have option to
             view their profile pages currently taking to organizations page and
             user/artist page"). Cutting the C37 loop this morning replaced this
             corner with the ONE door every home carries — the Profile tab — and
             on a studio's home that door opens the person or the ORGANIZATION
             behind it, which is not this studio and is two taps away from
             anything about it. The loop it cut was real; the answer to it was
             not "every corner goes to the same place", it was "a corner goes to
             the public face of the thing you are standing on". A profile page
             has no corner (C37), so this still cannot cycle: home → the studio's
             page → the back chip. And nothing is lost at the other end — the
             profile switcher beside the gear is on every screen since this
             morning, and its own row is the way back to you. */
          corner={
            <>
              {/* the pencil edits the WORDS now — the pictures are the two ⊕
                  controls on this hero (20 Sep 2026) */}
              {editable ? <BusinessEditButton tenant={editable} corner /> : null}
              <Link href={`/studio/${tenant.id}`} aria-label="Public view" style={cornerChip}>
                <EyeIcon />
              </Link>
            </>
          }
        >
          {/* ── THE BAND, THE SAME ONE EVERY PROFILE WEARS (20 Sep 2026, the user:
              "check all profile pages look similar according to their Profile
              Type in terms of placement of things"). A studio's home had the
              hero and then went straight to the deck: no figures, no links,
              while Home and the Profile tab both run figures → styles → links
              down the wash. The styles were already there (the hero's own row,
              just above this); these are the two that were missing.

              ⚠ FOLLOWERS IS THE FIGURE EVERY KIND LEADS WITH, and what is
              kind-specific stays in `meta` where it already was — a studio's
              rooms, a crew's members. So this row does not repeat the line above
              it, and the same figure means the same thing on all five screens.
              It is a plain number rather than a door: the list behind it already
              has its own control on the studio's public page ("Followers — see
              who"), and a second door to one list is the duplication this slice
              exists to remove. ── */}
          <EntityBand
            figures={
              <>
                <Figure n={followers} label="Followers" testId="studio-followers" />
                {/* ⚠ THE SECOND FIGURE IS THE OWNER'S (20 Sep 2026, the user:
                    "Organization and Studio still dont have Following section in
                    profile and home"). A studio cannot follow anything itself,
                    so what is counted is what the account that RUNS it follows —
                    which is the honest answer to the question without inventing
                    a column. Null prints nothing at all. */}
                <Figure n={followingN} label="Following" testId="studio-following" />
              </>
            }
            /* the chips at the row's right edge (20 Sep 2026) — the studio's own
               code to be held up at its door (7381, 7424) and the studio board.
               No Follow bell: this is the studio's own home, and its team cannot
               follow it (`set_follow` refuses a business you belong to). */
            chips={
              <>
                {/* FOLLOW · STATS · QR · SHARE (21 Sep 2026, the user's own order) */}
                {/* ⚠ THIS STUDIO'S BOARD, NOT THE PERSON'S (21 Sep 2026). It pointed
                at `/stats?tab=charts&seg=studio`, which is the PERSON's stats
                screen (`findMyStats`, `findMyPlace(…, "dancer")`) opened on the
                studios leaderboard — not this studio's figures, and not scoped
                to this studio at all: `seg` only picks which chart to draw. So
                the chip on a studio's own home answered a question about YOU.
                `/studio/{id}/stats` is the page built for exactly this on
                19 Sep (R29) and nothing had ever opened it from here. The
                organization's chip has pointed at its own board all along, which
                is what made the difference visible. */}
            <StatsChip href={`/studio/${tenant.id}/stats`} />
                <ProfileShare path={`/studio/${tenant.id}`} name={tenant.name} />
                <ProfileLink path={`/studio/${tenant.id}`} name={tenant.name} />
              </>
            }
            /* ⚠ BOTH ROWS ARE THE EDITABLE ONES NOW (styles 21 Sep 2026, links
               20 Sep). `EntityBand`'s own `styles` and `socials` draw read-only
               rails, and a person's Home has had a ＋ beside each since 19 Sep —
               so both are passed as CHILDREN with the band's own left empty, and
               they land exactly where they always did, at the same size, with a
               control on each. */
            styles={[]}
            socials={[]}
          >
            {/* the studio's own row carries every field the door takes, so no
                cast is needed and a missing one would be a compile error */}
            <StudioStylesRow tenant={tenant} canEdit={Boolean(editable)} isStudio={tenant.type === "studio"} fallback={styles} />
            <StudioLinksRow tenant={tenant} canEdit={Boolean(editable)} />
          </EntityBand>
        </IdentityHero>

        {/* ── THE BUTTONS ABOVE THE SCHEDULE (21 Sep 2026) — the same row this
            studio's public page carries, in the same order, from the same
            fields. ⚠ Enquiry is drawn and DISABLED with its reason, because you
            are on this team: `ActionRow` is sized by how many cells it is given,
            so dropping it would re-lay out Call, Mail and Location and the row
            would be a different shape from the page it matches. ── */}
        <ActionRow marginTop={12}>
          <EnquiryButton
            tenantId={tenant.id}
            tenantName={tenant.name}
            tenantType={tenant.type}
            signedIn
            accent={RG[1]}
            enquiryTypes={tenant.enquiryTypes}
            cannotAsk="You are on this team — enquiries come to you here"
          />
          {tenant.phone ? <CallButton phone={tenant.phone} /> : null}
          {tenant.contactEmail ? <MailButton email={tenant.contactEmail} /> : null}
          {/* ⚠ the PIN comes off `editable`, which is the owner's read and the
              only one carrying lat/lng — a trainer gets the name-and-place query
              instead, which still opens Maps. Same `locationSetAt` guard the
              public page uses: a studio sitting on its city's centroid has not
              placed itself, and a pin there would be a lie (11 Sep 2026). */}
          {pinHref ? (
            <LocationButton href={pinHref} />
          ) : place ? (
            <LocationButton query={`${tenant.name} ${place}`} />
          ) : null}
        </ActionRow>

        {/* ── TODAY, AS THE SCHEDULE IT ACTUALLY IS (7500-7520): every class and
            event running in THIS studio's rooms today, one card each, in the
            order the day happens; a studio's doors are its own (7143-7150) ── */}
        <TodayShelf deck={deck} />

        {/* ⚠ NO SUBSCRIPTION STRIP HERE (20 Sep 2026, the user: "remove your
            conversation with dance os and subscription from just the home tab for
            studio and organization profiles as already being handled from
            settings"). It is on `/subscription` now — Settings' own Subscription
            tile — with one strip per studio, so the premise behind the ask is
            true rather than nearly true. ⚠ It was NOT simply deleted: this was
            the only Stop renewing in the app, and deleting it would have made a
            studio's subscription impossible to cancel anywhere (Rule 9). */}

        {/* ── STUDIO TOOLS (7590-7620): the same tile language as Home's grid, and
            every door is THIS studio's ── */}
        <div style={{ position: "relative", zIndex: 1, background: LILAC }}>
          <ToolsPanel kind="studio">
            <ToolGrid tiles={tiles} />
          </ToolsPanel>
        </div>
      </div>
    </div>
  );
}
