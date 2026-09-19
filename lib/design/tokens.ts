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
export const tintForTenantType = (type: "studio" | "artist_page" | "org"): string =>
  type === "artist_page" ? DOS_TINT.artist : DOS_TINT.org;

/** THE HERO SQUARE (prototype S_profiletab 10588-10589): the sharp 206px cover
 *  every identity page stands its picture in, and the sleeve's thrown shadow.
 *  Said once (14 Sep 2026) — five files used to carry their own copy of the pair. */
export const HERO_SQ = 206;
export const HERO_SQ_SHADOW = "0 0 52px 20px rgba(0,0,0,.30), 0 26px 60px -4px rgba(0,0,0,.55), 0 8px 18px rgba(0,0,0,.4)";

/** THE HEADER AND THE DISC (15 Sep 2026). The user split the hero in two: the
 *  big square is the HEADER — the pictures of a place or a body of work, up to
 *  ten, swiped — and the profile picture is a round DISC overlapping the
 *  header's bottom-left edge, the way every social profile is laid out.
 *
 *  The header keeps the 206 square for now, at the user's choice ("keep same,
 *  but make option if we need to change dimension later — code just needs a
 *  tweak"). So its box is these two numbers and nothing else reads HERO_SQ for
 *  it: make HERO_HEAD_W the screen's width and HERO_HEAD_H shorter and the
 *  header is a banner, with the disc already sitting where a banner's would. */
export const HERO_HEAD_W = HERO_SQ;
export const HERO_HEAD_H = HERO_SQ;
/** the disc's diameter, the ring the page draws round it, and how far it drops
 *  below the header's bottom edge */
/** ⚠ 96 → 112 on 19 Sep 2026, the user: "Align profile pic and make a bit
 *  bigger while adjusting text." The text column beside it was re-balanced in
 *  the same change — the eyebrow and the account number share ONE line now, so
 *  the column is a line shorter and the disc has the room to grow into. */
export const HERO_DISC = 112;
export const HERO_DISC_RING = 3;
export const HERO_DISC_DROP = 40;
/** A PROFILE PICTURE IS A SQUIRCLE (18 Sep 2026, the user: "profile pic should be
 *  squircle") — the corner is this share of the side, at every size it is drawn:
 *  the 96px disc, the hub's 42px face, the crew's, and the cropper's frame, which
 *  is masked to this so what you see while cropping is what lands. */
export const DISC_RADIUS = 0.3;

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
