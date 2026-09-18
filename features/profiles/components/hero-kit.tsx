import type { CSSProperties, ReactNode } from "react";
import { DosStyleTile } from "@/features/discovery/components/DiscoverFilters";
import { HeroRail, ProfileDisc, type HeroShot } from "@/features/profiles/components/HeroRail";
import { TYPE, mapsHref } from "@/features/profiles/components/profile-kit";
import { VerifiedTick } from "@/features/settings/components/settings-kit";
import { dosStyleColor } from "@/lib/constants/styles";
import { HERO_DISC, HERO_DISC_DROP, INK, LILAC, LINE } from "@/lib/design/tokens";

/** THE IDENTITY HERO — one object, every profile page (14 Sep 2026; re-cut
 *  15 Sep 2026).
 *
 *  The user: "make sure all 4 profile pages share common looking user
 *  interface and common code base, though will have different features as per
 *  their use cases." So this is the prototype's profile hero (S_profiletab
 *  10575-10727) as the ONE component a user's Home, an artist's Home, an
 *  organization's Home, a studio's own home, the Profile tab and the two
 *  public pages all stand on.
 *
 *  ITS TWO PICTURES, SINCE 15 SEP 2026. The user drew a circle on the
 *  bottom-left of the hero and said: "I need a profile picture for the studio,
 *  same way for the artist page … the current image you are showing in artist
 *  should go in the drawn circle." So the hero is laid out the way every
 *  social profile is: the HEADER across the top — the pictures of a place or a
 *  body of work, swiped, up to ten — and the round PROFILE DISC overlapping the
 *  header's bottom-left edge. Then who it is in the order you read a name: the
 *  micro caps, the name with its tick and its QR, the line under it, the
 *  styles, and whatever the page adds.
 *
 *  ⚠ THE HERO SHOWS; EDIT PROFILE EDITS (16 Sep 2026). It carried two picture
 *  controls of its own — the ＋ on the disc's rim and the dashed Add tile with a
 *  ✕ per header picture — and the user circled both: "the update image option
 *  should be inside the edit profile." They are, and only there: one sheet, one
 *  place to look, and the set visible as a grid rather than one square at a
 *  time. The pencil in `corner` is what opens it.
 *
 *  What differs between the pages is passed in, never redrawn: the eyebrow —
 *  WHAT THIS ACCOUNT IS since 18 Sep 2026 (USER · ARTIST · STUDIO ·
 *  ORGANIZATION), where Home used to say GOOD MORNING; what the header swipes
 *  through (one picture for a user, ten for an artist, the photos of its space
 *  for a studio, nothing for an organization); and the meta line. */

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
  avatar,
  avatarAlt,
  shots = [],
  corner,
  testId,
  children,
}: {
  name: string;
  /** the two colours the disc's initials and an empty header are painted in */
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
  /** THE PROFILE PICTURE — the round disc; null draws the initials */
  avatar: string | null;
  avatarAlt?: string;
  /** THE HEADER — what swipes across the top */
  shots?: HeroShot[];
  /** controls pinned to the hero's top-right corner (the Profile tab's Edit and Public view, 10613) */
  corner?: ReactNode;
  testId?: string;
  /** whatever the page adds under the styles — Home's role word, code and rank */
  children?: ReactNode;
}) {
  /* ⚠ THE PICTURE STANDS BESIDE THE NAME (18 Sep 2026, the user: "Profile Pic
     should be besides Name and Location"). The disc keeps the place they drew it
     on 15 Sep — over the header's bottom-left edge — and what moved is the text:
     until today the block began BELOW the disc, so the picture, the name and the
     place read as a stack down the left edge. The identity column is indented
     past the disc now and the three sit on one line. Only that column is
     indented: the styles and whatever the page adds run the full width beneath,
     under the disc, which is why the disc stays absolutely placed rather than
     becoming a flex row's first child. */
  const blockTop = 12;
  /* the disc's width plus a breath — where the name starts */
  const asideLeft = HERO_DISC + 13;
  return (
    <div data-testid={testId} style={{ margin: "0 -16px", position: "relative", overflow: "hidden", background: heroWash(tint) }}>
      {corner ? <div style={{ position: "absolute", right: 12, top: 12, zIndex: 3, display: "flex", gap: 6 }}>{corner}</div> : null}

      <HeroRail name={name} grad={grad} shots={shots} />

      <div style={{ position: "relative", padding: `${blockTop}px 16px 14px` }}>
        {/* the disc, where the user drew it: over the header's bottom-left edge */}
        <div style={{ position: "absolute", left: 16, top: -HERO_DISC_DROP, zIndex: 2 }}>
          <ProfileDisc name={name} grad={grad} photo={avatar} photoAlt={avatarAlt} testId="hero-disc" />
        </div>

        {/* who it is, beside the picture: the word, the name, the place */}
        <div style={{ paddingLeft: asideLeft, minHeight: HERO_DISC - HERO_DISC_DROP - blockTop }}>
          <div style={HERO_EYEBROW}>{eyebrow}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <h1 style={{ ...TYPE.display, margin: 0, color: INK, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</h1>
            {verified ? <VerifiedTick size={18} /> : null}
            {share}
          </div>
          {meta ? <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 7, fontSize: 13, fontWeight: 800, color: INK }}>{meta}</div> : null}
        </div>
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
