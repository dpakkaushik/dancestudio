import Link from "next/link";
import { ToolGrid, type Tile } from "@/features/home/components/home-kit";
import { HEAD_LINK, PILL_DARK, PILL_LIGHT, TodayShelf } from "@/features/home/components/TodayShelf";
import { PhotoPicker } from "@/features/media/components/PhotoPicker";
import type { HeroShot } from "@/features/profiles/components/HeroRail";
import { HeroDot, HeroPlace, IdentityHero } from "@/features/profiles/components/hero-kit";
import { ProfileShare } from "@/features/profiles/components/ProfileShare";
import { gradientOf } from "@/features/profiles/components/profile-kit";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import type { DeckItem } from "@/types/home";
import type { Tenant } from "@/types/tenant";

/** ONE STUDIO'S OWN HOME (14 Sep 2026) — what a studio row on the hub opens.
 *
 *  The user, pressing a verified studio on the hub and landing on the classes
 *  register: *"I should get something like [the prototype's studio Home], with
 *  a scrollable header."* So this is the prototype's S_homebiz (7354-7660) —
 *  today's schedule as the deck asked the studio's question, then the Studio
 *  Tools grid — under the identity hero every one of the four identity pages
 *  wears, because an organization runs several studios and each one is its own
 *  place, with its own pictures, its own rooms and its own day.
 *
 *  What the hero swipes through here: the studio's own picture first — set
 *  right here, by the ＋ on its corner, by the owner or a trainer (the user:
 *  "I want option to have a profile image for user, studio and artist all") —
 *  then the photos of its space it showed DanceOS for the badge. Nothing here
 *  is a second implementation: the hero is `IdentityHero`, the shelf is
 *  `TodayShelf`, the grid is Home's `ToolGrid`. What the page ADDS is the
 *  composition — one studio, whole — and the register, which used to be where
 *  the row landed, is one of the tools. */
export function StudioHome({
  tenant,
  /** the studio's own picture — `tenants.photo_path`, served from the public bucket */
  photo,
  /** an owner or trainer — the pair that may change the picture */
  canEditPhoto,
  /** the photos of its space, as shown to DanceOS — signed URLs, the owner's to see */
  proof,
  deck,
  roomCount,
  /** what it teaches, off its PUBLISHED classes — a studio with none says nothing (7419-7421) */
  styles,
  tiles,
}: {
  tenant: Tenant;
  photo: string | null;
  canEditPhoto: boolean;
  proof: Array<{ id: string; url: string }>;
  deck: DeckItem[];
  roomCount: number;
  styles: string[];
  tiles: Tile[];
}) {
  const RG = gradientOf(tenant.name);
  const place = [tenant.area, tenant.city].filter(Boolean).join(", ");
  const roomsWords = `${roomCount} room${roomCount === 1 ? "" : "s"}`;
  const shots: HeroShot[] = proof.map((p, i) => ({ key: p.id, src: p.url, alt: `Photo ${i + 2} of ${tenant.name} — its space`, signed: true }));

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
            pictures as a swipe, then who it is in the order you read a business ── */}
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
          photo={photo}
          photoAlt={tenant.name}
          picker={canEditPhoto ? <PhotoPicker owner={{ kind: "tenant", id: tenant.id }} hasPhoto={Boolean(tenant.photoPath)} label="Change the photo" overlay /> : undefined}
          more={shots}
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
