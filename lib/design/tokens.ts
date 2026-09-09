/** Design tokens lifted verbatim from prototype/DanceOSApp.jsx lines 41-48 & 2697-2710.
 *
 *  The neutral surfaces are CSS variables (declared per-theme on <html> in globals.css,
 *  prototype DOS_PALETTE) so every screen follows the light/dark toggle. The accents are
 *  literal hex — the prototype keeps them identical in both themes, and several call
 *  sites alpha-suffix them (`${PINK}14`), which only works on a literal. */

export const PINK = "#5AC8FA";
export const GREEN = "#22C55E";
export const GOLD = "#F59E0B";
export const RED = "#EF4444";

export const INK = "var(--text)";
export const LILAC = "var(--bg)";
export const SUB = "var(--sub)";
export const LINE = "var(--el)";
export const CARD = "var(--card)";
export const MUTED = "var(--muted)";
export const SOLID = "var(--solid)";

/** The dark palette as literal values (prototype DOS_PALETTE.dark) — pinned onto the
 *  auth screens' root so they always wear the in-app dark look (prototype line 48),
 *  whatever theme the rest of the app is in. */
export const DARK_THEME_VARS = {
  "--bg": "#0A0A0A",
  "--solid": "#0A0A0A",
  "--card": "rgba(255,255,255,.07)",
  "--el": "rgba(255,255,255,.13)",
  "--text": "#FAFAFA",
  "--sub": "#A3A3A3",
  "--muted": "#707070",
} as const;

export const DOS_DISPLAY =
  'var(--font-sora), Sora, "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const DOS_UI =
  'var(--font-inter-tight), "Inter Tight", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

/** Per-KIND accent — prototype DOS_TINT (line 2704), re-keyed 8 Sep 2026 when
 *  the roles became user | org and "artist" became the plan's word: an
 *  organization wears the studio blue, an artist the artist pink, a user the
 *  dancer cyan. Typed on PersonKind so a stale key is a compile error, not an
 *  undefined colour. */
export const DOS_TINT: Record<"user" | "artist" | "org", string> = {
  org: "#3B82F6",
  artist: "#EC4899",
  user: "#5AC8FA",
};
/** a business wears its owner-kind's colour: a studio is an organization's, an artist page an artist's */
/** A business's colour by what it is. An `org` hosting row (R15) wears the
 *  organization's gold, the same as a studio, because that is whose it is. */
export const tintForTenantType = (type: "studio" | "trainer_business" | "org"): string =>
  type === "trainer_business" ? DOS_TINT.artist : DOS_TINT.org;

export const BTN_STYLE: React.CSSProperties = {
  padding: "15px",
  borderRadius: 999,
  fontWeight: 800,
  fontSize: 15,
  textAlign: "center",
  cursor: "pointer",
  WebkitUserSelect: "none",
  userSelect: "none",
  border: "none",
  width: "100%",
};
