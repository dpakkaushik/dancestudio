import type { CSSProperties, ReactNode } from "react";
import { DosStyleTile } from "@/features/discovery/components/DiscoverFilters";
import { dosStyleColor } from "@/lib/constants/styles";
import { handleOf, isPlatform, safeHref } from "@/lib/constants/socials";
import { DOS_DISPLAY, INK, MUTED, PINK } from "@/lib/design/tokens";
import type { SocialLink } from "@/types/profile";
import { PlatformIcon, TYPE } from "./profile-kit";

/** THE BAND UNDER THE NAME — ONE SPEC, EVERY PROFILE (20 Sep 2026).
 *
 *  The user: *"check all profile pages look similar according to their Profile
 *  Type in terms of placement of things for both home and profile tab."* Read
 *  side by side, the five identity screens had drifted into three different
 *  bands under one hero:
 *
 *    * **Home** drew FULL-SIZE style tiles (12.5px on 7×13 padding) at
 *      `padding: 14px 0 0`, and its links at `10px 0 0`.
 *    * **The Profile tab** drew the same two rows as `small` tiles (11.5px on
 *      6×11) at `marginTop: 12` and `8`.
 *    * **A studio's and a crew's home** drew neither figures nor links, and got
 *      their styles from `IdentityHero`'s own row — `small`, `marginTop: 12`.
 *
 *  So Home was the odd one out on the very two rows the user had already asked
 *  to match ("Hometab from Top to Social media links should look same on
 *  profile", 19 Sep), and the two ENTITY homes were missing the rows entirely.
 *  Three copies of one design is how that happens, so the design lives here now
 *  and the screens read it:
 *
 *    the FIGURES (Followers first, always) → the STYLES → the LINKS
 *
 *  ⚠ Sizes and spacing are the PROFILE TAB's, because they are also
 *  `IdentityHero`'s own `styles` row — which a studio and a crew already used.
 *  Moving one screen is a smaller change than moving three. */

/** the figure row: the numbers set like numbers (10683).
 *  ⚠ `alignItems: center` since 20 Sep 2026, because the row now ends in the
 *  three chips and a 44px control against a top-aligned number reads as a
 *  mistake; the numbers still start the row. */
export const FIGURE_ROW: CSSProperties = { display: "flex", alignItems: "center", gap: 22, marginTop: 12, flexWrap: "wrap" };

/** THE THREE CHIPS — QR · STATS · FOLLOW (20 Sep 2026, the user: "Follow button
 *  to be a bell with qr code and stats. should be placed in same row as follower
 *  following numbers on its right side").
 *
 *  ⚠ THEY LEFT THE HERO'S RIGHT EDGE, and that is the point. C13 put the QR and
 *  Stats in a COLUMN beside the name because the QR used to share the name's
 *  line and cut long names (18 Sep). A third chip there would have squeezed the
 *  name column again on a 360px phone — the very bug C13 exists to stop — so the
 *  row that already had horizontal room to spare is where they go.
 *
 *  One declaration for all three, because the last time a shared look was
 *  written out per component the rows drifted into three different bands. */
export const PROFILE_CHIP: CSSProperties = {
  flexShrink: 0,
  width: 44,
  height: 44,
  borderRadius: 22,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--text)",
  color: "var(--solid)",
  textDecoration: "none",
  border: "none",
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "0 4px 14px -6px rgba(0,0,0,.6)",
};

/** the chips sit at the row's right edge — `marginLeft: auto` is what puts them
 *  there without a second flex container fighting the figures for space */
export const CHIP_ROW: CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flexShrink: 0 };
export const figureNum: CSSProperties = { display: "block", fontSize: 22, fontWeight: 900, lineHeight: 1, letterSpacing: -0.6, fontFamily: DOS_DISPLAY, color: INK, fontVariantNumeric: "tabular-nums" };
export const figureLabel: CSSProperties = { display: "block", ...TYPE.micro, color: MUTED, marginTop: 4 };

/** the styles row — the same one `IdentityHero` draws for a studio and a crew */
export const STYLES_ROW: CSSProperties = { display: "flex", gap: 5, overflowX: "auto", scrollbarWidth: "none", marginTop: 12, alignItems: "center" };
/** the links, directly under the styles (10760) — the user's own order */
export const LINKS_ROW: CSSProperties = { display: "flex", gap: 7, alignItems: "center", overflowX: "auto", scrollbarWidth: "none", marginTop: 8, paddingBottom: 2 };

/** one link chip. ⚠ It was declared THREE times — in `HomeBand`, in
 *  `MyProfilePage` and about to be a third here — which is exactly how the rows
 *  above came to disagree. One declaration; the two person screens import it. */
export const linkChip: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  flexShrink: 0,
  padding: "6px 11px",
  borderRadius: 999,
  cursor: "pointer",
  whiteSpace: "nowrap",
  background: "var(--card)",
  border: "1.5px solid var(--el)",
  fontFamily: "inherit",
  color: INK,
};

/** A FIGURE — the number over its word. The caller decides whether it is a
 *  door: a person's opens the Followers sheet, a studio's and a crew's are
 *  plain, because the list a studio's owner reads already has its own control
 *  on the public page ("Followers — see who") and a second door to one list is
 *  the duplication this file exists to stop. */
export function Figure({ n, label, testId }: { n: number | null; label: string; testId?: string }) {
  /* ⚠ A NULL FIGURE PRINTS NOTHING, NEVER A ZERO (the rule `FollowFigures`
     carried before the public pages moved onto this band, 20 Sep 2026): a count
     a read did not answer is not the same fact as a count of none, and every
     one of these reads is wrapped in a `.catch` so a home still opens. */
  if (n == null) return null;
  return (
    <div>
      <span data-testid={testId} style={figureNum}>
        {n.toLocaleString("en-IN")}
      </span>
      <span style={figureLabel}>{label}</span>
    </div>
  );
}

/** THE READ-ONLY LINKS ROW — a studio's own socials on its home, and the same
 *  chips the Profile tab prints. A crew has no `socials` column at all, so it
 *  passes none and the row is simply not drawn (an empty rail is not a row). */
export function EntityLinks({ socials }: { socials: SocialLink[] }) {
  if (!socials.length) return null;
  return (
    <div style={LINKS_ROW}>
      {socials.map((l) => (
        <a
          key={l.platform}
          href={safeHref(l.url) ?? undefined}
          target="_blank"
          rel="noreferrer"
          aria-label={`${l.platform} — ${isPlatform(l.platform) ? handleOf(l.url) : l.platform}`}
          style={{ ...linkChip, textDecoration: "none" }}
        >
          <span style={{ flexShrink: 0, lineHeight: 0 }}>
            <PlatformIcon label={l.platform} size={15} />
          </span>
          <span style={{ fontSize: 12, fontWeight: 800, color: PINK }}>{isPlatform(l.platform) ? handleOf(l.url) : l.platform}</span>
        </a>
      ))}
    </div>
  );
}

/** the styles as this app's one tile, at the one size every profile uses */
export function EntityStyles({ styles, aria }: { styles: string[]; aria: (s: string) => string }) {
  if (!styles.length) return null;
  return (
    <div style={STYLES_ROW}>
      {styles.map((s) => (
        <DosStyleTile key={s} label={s} color={dosStyleColor(s)} aria={aria(s)} small />
      ))}
    </div>
  );
}

/** THE WHOLE BAND, for a screen that only shows it — a studio's home and a
 *  crew's. It goes inside `IdentityHero` as its children, so it lands on the
 *  hero's wash, which is what made Home and the Profile tab read as one screen
 *  on 19 Sep: same content, same surface.
 *
 *  ⚠ IT DRAWS THE STYLES ITSELF, and the caller must pass `styles={[]}` to the
 *  hero. `IdentityHero` renders its own `styles` prop BEFORE `children`, so a
 *  studio that kept using it would read styles → figures → links while Home and
 *  the Profile tab read figures → styles → links. Same three rows, same sizes,
 *  wrong order — which is the very thing this file exists to stop, and it is
 *  exactly what the first cut of this band did. */
export function EntityBand({
  figures,
  chips = null,
  styles = [],
  styleAria = (s) => s,
  socials = [],
  children = null,
}: {
  figures: ReactNode;
  /** the QR · Stats · Follow chips, right-aligned in the figures row (20 Sep 2026) */
  chips?: ReactNode;
  styles?: string[];
  styleAria?: (s: string) => string;
  socials?: SocialLink[];
  children?: ReactNode;
}) {
  return (
    <>
      <div style={FIGURE_ROW}>
        {figures}
        {chips ? <div style={CHIP_ROW}>{chips}</div> : null}
      </div>
      <EntityStyles styles={styles} aria={styleAria} />
      <EntityLinks socials={socials} />
      {children}
    </>
  );
}
