import type { CSSProperties, ReactNode } from "react";
import { DosStyleTile } from "@/features/discovery/components/DiscoverFilters";
import { HeroRail, type HeroShot } from "@/features/profiles/components/HeroRail";
import { TYPE, mapsHref } from "@/features/profiles/components/profile-kit";
import { VerifiedTick } from "@/features/settings/components/settings-kit";
import { dosStyleColor } from "@/lib/constants/styles";
import { INK, LILAC, LINE } from "@/lib/design/tokens";

/** THE IDENTITY HERO — one object, four pages (14 Sep 2026).
 *
 *  The user: "make sure all 4 profile pages share common looking user
 *  interface and common code base, though will have different features as per
 *  their use cases." So this is the prototype's profile hero (S_profiletab
 *  10575-10727) as the ONE component a user's Home, an artist's Home, an
 *  organization's Home and a studio's own home all stand on: the entity's
 *  colour bleeding off the top of the screen, the 206px square with its swipe
 *  and its ＋, then who it is in the order you read a name — the micro caps
 *  over it, the name with its tick and its QR, the line under it, the styles.
 *  What differs between the four is passed in, never redrawn: the eyebrow
 *  (GOOD EVENING on your own Home, STUDIO on a studio's), what the rail swipes
 *  through (nothing for a user, a gallery for an artist, the photos of its
 *  space for a studio), the meta line, and whatever the page adds underneath. */

export const heroWash = (tint: string) => `linear-gradient(180deg, ${tint}b8 0%, ${tint}55 46%, ${tint}18 74%, ${LILAC} 100%)`;

export const HERO_EYEBROW: CSSProperties = { fontSize: 9.5, fontWeight: 900, letterSpacing: 2.2, textTransform: "uppercase", color: "rgba(255,255,255,.9)" };

/** the place, underlined in the line's own grey, and it opens Maps (10694-10698) */
export function HeroPlace({ text, query }: { text: string; query?: string }) {
  return (
    <a
      href={mapsHref(query ?? text)}
      target="_blank"
      rel="noreferrer"
      aria-label="Open this address in Maps"
      style={{
        minWidth: 0,
        color: INK,
        textDecoration: "underline",
        textDecorationColor: LINE,
        textUnderlineOffset: 3,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {text}
    </a>
  );
}

export const HeroDot = () => <span style={{ color: LINE }}>·</span>;

export function IdentityHero({
  name,
  grad,
  tint,
  eyebrow,
  verified,
  share = null,
  meta = null,
  styles = [],
  styleAria = (s) => s,
  photo,
  photoAlt,
  picker,
  more,
  addTile,
  testId,
  children,
}: {
  name: string;
  /** the two colours the initials square is painted in */
  grad: [string, string];
  /** the colour that bleeds off the top of the screen — the entity's own */
  tint: string;
  /** the micro caps over the name */
  eyebrow: string;
  /** the tick is DanceOS's to give — set when a verification actually clears */
  verified: boolean;
  /** the QR beside the name, or null when there is no public page to share */
  share?: ReactNode;
  /** the line under the name — "24, New Delhi", or "Kothrud, Pune · 1 room" */
  meta?: ReactNode;
  /** the styles, as the app's one style tile */
  styles?: string[];
  styleAria?: (style: string) => string;
  /** the profile photo — the first square; null draws the initials */
  photo: string | null;
  photoAlt?: string;
  /** the ＋ on the first square, for whoever may change the photo */
  picker?: ReactNode;
  /** what the rail swipes through after the profile photo */
  more?: HeroShot[];
  /** the last square — an "Add" tile */
  addTile?: ReactNode;
  testId?: string;
  /** whatever the page adds under the styles — Home's role word, code and rank */
  children?: ReactNode;
}) {
  return (
    <div data-testid={testId} style={{ margin: "0 -16px", position: "relative", overflow: "hidden", background: heroWash(tint) }}>
      <HeroRail name={name} grad={grad} photo={photo} photoAlt={photoAlt} picker={picker} more={more} addTile={addTile} />

      <div style={{ padding: "10px 16px 14px" }}>
        <div style={HERO_EYEBROW}>{eyebrow}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <h1 style={{ ...TYPE.display, margin: 0, color: INK, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</h1>
          {verified ? <VerifiedTick size={18} /> : null}
          {share}
        </div>
        {meta ? <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 7, fontSize: 13, fontWeight: 800, color: INK }}>{meta}</div> : null}
        {styles.length ? (
          <div style={{ display: "flex", gap: 5, overflowX: "auto", scrollbarWidth: "none", marginTop: 12, alignItems: "center" }}>
            {styles.map((s) => (
              <DosStyleTile key={s} label={s} color={dosStyleColor(s)} aria={styleAria(s)} small />
            ))}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
