import Link from "next/link";
import { ToolGrid, ToolsHead, type Tile } from "@/features/home/components/home-kit";
import { PILL_DARK, PILL_LIGHT, TodayShelf } from "@/features/home/components/TodayShelf";
import { BusinessEditButton } from "@/features/profiles/components/BusinessEditSheet";
import type { HeroShot } from "@/features/profiles/components/HeroRail";
import { HeroDot, HeroId, HeroPlace, IdentityHero } from "@/features/profiles/components/hero-kit";
import { memberNoWords } from "@/types/profile";
import { EntityBand, Figure } from "@/features/profiles/components/profile-band";
import { ProfileShare } from "@/features/profiles/components/ProfileShare";
import { StatsChip } from "@/features/profiles/components/StatsChip";
import { EyeIcon, PROFILE_RING, cornerChip } from "@/features/profiles/components/profile-kit";
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
          /* the disc opens the studio's own public page (19 Sep 2026) — the same
             address the QR shares and the eye opens, so there is one way in */
          avatarHref={`/studio/${tenant.id}`}
          /* the eye in the corner is already called Public view — the disc says
             which thing it opens, so the two controls are tellable apart */
          avatarLabel="Open the studio's public page"
          shots={shots}
          /* the corner (10613, 15 Sep 2026): the owner's pencil — the pictures,
             About, Since, the number, the links, the pin — and for everyone on
             the team the eye, the page as a stranger sees it */
          corner={
            <>
              {editable ? <BusinessEditButton tenant={editable} corner photos={header} ownerId={ownerId} canEditPhoto={canEditPhoto} /> : null}
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
                <ProfileShare path={`/studio/${tenant.id}`} name={tenant.name} />
                <StatsChip href="/stats?tab=charts&seg=studio" />
              </>
            }
            styles={styles}
            styleAria={(s) => `${s} — a style this studio teaches`}
            socials={tenant.socials}
          />
        </IdentityHero>

        {/* ── TODAY, AS THE SCHEDULE IT ACTUALLY IS (7500-7520): every class and
            event running in THIS studio's rooms today, one card each, in the
            order the day happens; a studio's doors are its own (7143-7150) ── */}
        <TodayShelf
          deck={deck}
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
        <div style={{ position: "relative", zIndex: 1, background: LILAC, marginBottom: 12 }}>
          <ToolsHead kind="studio" />
          <ToolGrid tiles={tiles} />
        </div>
      </div>
    </div>
  );
}
