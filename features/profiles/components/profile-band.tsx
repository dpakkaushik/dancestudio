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

/** the figure row: the numbers set like numbers (10683) */
export const FIGURE_ROW: CSSProperties = { display: "flex", alignItems: "flex-start", gap: 22, marginTop: 12, flexWrap: "wrap" };
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
  border: "1px solid var(--el)",
  fontFamily: "inherit",
  color: INK,
};

/** A FIGURE — the number over its word. The caller decides whether it is a
 *  door: a person's opens the Followers sheet, a studio's and a crew's are
 *  plain, because the list a studio's owner reads already has its own control
 *  on the public page ("Followers — see who") and a second door to one list is
 *  the duplication this file exists to stop. */
export function Figure({ n, label, testId }: { n: number; label: string; testId?: string }) {
  return (
    <div>
      <span data-testid={testId} style={figureNum}>
        {n}
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
  styles = [],
  styleAria = (s) => s,
  socials = [],
  children = null,
}: {
  figures: ReactNode;
  styles?: string[];
  styleAria?: (s: string) => string;
  socials?: SocialLink[];
  children?: ReactNode;
}) {
  return (
    <>
      <div style={FIGURE_ROW}>{figures}</div>
      <EntityStyles styles={styles} aria={styleAria} />
      <EntityLinks socials={socials} />
      {children}
    </>
  );
}
