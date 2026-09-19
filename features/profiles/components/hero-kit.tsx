import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { DosStyleTile } from "@/features/discovery/components/DiscoverFilters";
import { HeroRail, ProfileDisc, type HeroShot } from "@/features/profiles/components/HeroRail";
import { TYPE, mapsHref } from "@/features/profiles/components/profile-kit";
import { VerifiedTick } from "@/features/settings/components/settings-kit";
import { dosStyleColor } from "@/lib/constants/styles";
import { INK, LILAC, LINE } from "@/lib/design/tokens";

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
 *  body of work, swiped, up to ten — and the round PROFILE DISC beneath it.
 *  ⚠ SINCE 18 SEP 2026 THE DISC NO LONGER OVERLAPS THE HEADER: it is the first
 *  thing on ONE LINE with the account's word, its number, its name and its
 *  place, because a picture riding above the words it belongs to is not "beside"
 *  them. The styles and whatever the page adds follow underneath, full width.
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
      /* it wraps rather than truncating (18 Sep 2026): a place cut to "Kothrud, P…"
         is not a place, and the line under a name has room for two */
      style={{
        minWidth: 0,
        color: INK,
        textDecoration: "underline",
        textDecorationColor: LINE,
        textUnderlineOffset: 3,
        overflowWrap: "anywhere",
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
  eyebrowSub = null,
  verified,
  share = null,
  stats = null,
  meta = null,
  styles = [],
  styleAria = (s) => s,
  avatar,
  avatarAlt,
  avatarHref,
  avatarLabel = "Public view",
  avatarSlot = null,
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
  /** the line directly UNDER the eyebrow and above the name — the account number
   *  (18 Sep 2026, the user: "account number below user, artist, studio and
   *  organization"). It used to sit under the styles, a whole block away from the
   *  word it belongs to. */
  eyebrowSub?: ReactNode;
  /** the tick is DanceOS's to give — set when a verification actually clears */
  verified: boolean;
  /** the QR — the upper of the two chips stacked at the row's right edge (18 Sep
   *  2026); null when there is no public page to share */
  share?: ReactNode;
  /** the Stats chip under the QR (18 Sep 2026, the user: "remove stats from tools
   *  and place like a button similar to the qr code … QR above the Stats") — a
   *  `StatsChip` pointing at this account's own board; null on a public page */
  stats?: ReactNode;
  /** the line under the name — "24, New Delhi", or "Kothrud, Pune · 1 room" */
  meta?: ReactNode;
  /** the styles, as the app's one style tile */
  styles?: string[];
  styleAria?: (style: string) => string;
  /** THE PROFILE PICTURE — the round disc; null draws the initials */
  avatar: string | null;
  avatarAlt?: string;
  /** where the disc opens when pressed (19 Sep 2026, the user: "clicking on the
   *  profile photo on home tab takes to profile") — Home hands it the account's
   *  public page; a page that passes nothing draws a plain disc */
  avatarHref?: string;
  /** what the disc is CALLED when it is a door. ⚠ A page that also carries the
   *  eye in its corner must pass its own word here, or two controls on one
   *  screen answer to "Public view" and neither a screen reader nor a strict
   *  locator can tell them apart (19 Sep 2026). */
  avatarLabel?: string;
  /** the disc as the PAGE draws it, in place of the plain one and of the link
   *  (19 Sep 2026, the user: "should be able to click and view both pictures
   *  sections when clicking on that photo"). Home hands it the client island
   *  that opens BOTH picture sections; everywhere else leaves it out. Given
   *  together with `avatarHref`, this wins — a disc has one job. */
  avatarSlot?: ReactNode;
  /** THE HEADER — what swipes across the top */
  shots?: HeroShot[];
  /** controls pinned to the hero's top-right corner (the Profile tab's Edit and
   *  Public view, 10613) — stacked, the pencil above the eye (19 Sep 2026) */
  corner?: ReactNode;
  testId?: string;
  /** whatever the page adds under the styles — Home's role word, code and rank */
  children?: ReactNode;
}) {
  /* ⚠ THE PICTURE IS THE FIRST THING ON ONE LINE (18 Sep 2026, the user:
     "Profile Pic should be placed properly on the left side in line with user
     type account number name and location — should not be above it, should be in
     the same line").
     Two earlier cuts are both undone here. Until 15 Sep the disc hung OVER the
     header's bottom-left edge, so it sat above everything it belonged to; the
     first answer that day only indented the text past it, which left the picture
     still riding higher than the words. It is a plain flex row now — the disc,
     then the column that says what this account is, who it is and where — with
     the two centred against each other, so the eye reads one line rather than a
     picture and a stack. The disc is in flow, so nothing overlaps the header any
     more and `HERO_DISC_DROP` has no reader left. The styles and whatever the
     page adds still run the FULL width underneath, which is why they sit outside
     this row rather than inside the column.
     ⚠ TOP-ALIGNED SINCE THE CHIPS MOVED IN (18 Sep 2026, the user: "everything
     between the poster and the dance styles tiles can be placed better so
     everything fits perfectly"). The column is taller than the disc now — five
     lines when a name wraps — and a disc centred against five lines floats at
     the height of nobody's name; top-aligned, the picture and the word USER /
     ARTIST / STUDIO / ORGANIZATION share one baseline, which is how every
     profile screen people already know lays this out. */
  return (
    <div data-testid={testId} style={{ margin: "0 -16px", position: "relative", overflow: "hidden", background: heroWash(tint) }}>
      {/* THE CORNER IS A COLUMN (19 Sep 2026, the user: "give an eye to view
          profile on the home tab below edit on top right") — the pencil, then
          the eye under it, on every page that has both */}
      {corner ? <div style={{ position: "absolute", right: 12, top: 12, zIndex: 3, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>{corner}</div> : null}

      <HeroRail name={name} grad={grad} shots={shots} />

      <div style={{ position: "relative", padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 13 }}>
          {avatarSlot ? (
            avatarSlot
          ) : avatarHref ? (
            <Link href={avatarHref} aria-label={avatarLabel} style={{ display: "block", flexShrink: 0, textDecoration: "none" }}>
              <ProfileDisc name={name} grad={grad} photo={avatar} photoAlt={avatarAlt} testId="hero-disc" />
            </Link>
          ) : (
            <ProfileDisc name={name} grad={grad} photo={avatar} photoAlt={avatarAlt} testId="hero-disc" />
          )}

          {/* what it is, its number, who it is, where — in that order, beside the picture */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={HERO_EYEBROW}>{eyebrow}</div>
            {eyebrowSub ? <div style={{ marginTop: 3 }}>{eyebrowSub}</div> : null}
            {/* ⚠ THE NAME IS NEVER CUT (18 Sep 2026, the user: "in some places full
                name is getting hidden which should not happen"). It used to be one
                line with an ellipsis, and it shared that line with the QR chip — so
                a long name beside a 96px disc had about 200px to live in and lost
                its end. The chips have their own column on the right now (QR above
                Stats), and the name wraps onto a second line rather than truncating. `overflowWrap: anywhere`
                is for the one-word name longer than the column, which is the only
                case a wrap alone cannot handle. */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 6 }}>
              <h1 style={{ ...TYPE.display, margin: 0, color: INK, minWidth: 0, lineHeight: 1.05, overflowWrap: "anywhere" }}>{name}</h1>
              {verified ? <span style={{ flexShrink: 0, marginTop: 6 }}><VerifiedTick size={18} /></span> : null}
            </div>
            {meta ? <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 6, fontSize: 13, fontWeight: 800, color: INK }}>{meta}</div> : null}
          </div>
          {/* THE TWO CHIPS, STACKED ON THE RIGHT — the QR above Stats (18 Sep 2026, the
              user: "place the stats and qr code buttons together on the right side of
              the home tab, QR above the Stats"). Their own column at the row's edge,
              so the name's column never shares a line with them and the two read as
              one control: share this profile, see its record. */}
          {share || stats ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
              {share}
              {stats}
            </div>
          ) : null}
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
