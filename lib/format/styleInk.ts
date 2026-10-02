/** A style has one colour and two uses (prototype dosStyleInk, DanceOSApp.jsx:1697-1708).
 *  The registry colours were chosen as TILE grounds against white type, which makes
 *  them mid-dark — and a mid-dark colour set as text on a near-black page is a smudge.
 *  This walks the colour toward the theme's ink until it clears 4.2:1 on the page
 *  background and stops there: far enough to read, near enough that it is still
 *  recognisably the same colour as the tile beside it. Shared by the class tile and
 *  the class page so the two can never print the same style in different inks. */
export const dosStyleInk = (hex: string, dark: boolean): string => {
  const bg = dark ? [10, 10, 10] : [255, 255, 255];
  const tgt = dark ? [255, 255, 255] : [0, 0, 0];
  const s = String(hex || "").replace("#", "");
  if (s.length < 6) return hex;
  let c = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
  if (c.some(isNaN)) return hex;
  const lum = (x: number[]) => {
    const f = (v: number) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(x[0]) + 0.7152 * f(x[1]) + 0.0722 * f(x[2]);
  };
  const cr = (a: number[], b: number[]) => {
    const L1 = lum(a);
    const L2 = lum(b);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  };
  for (let i = 0; i < 26 && cr(c, bg) < 4.2; i++) c = c.map((v, k) => Math.round(v + (tgt[k] - v) * 0.12));
  return "#" + c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
};

/** `#RRGGBB` mixed toward black by `f` (0 = unchanged, 1 = black). Pure, so the
 *  paint below can be computed anywhere — server or client — with no
 *  `color-mix()`, which iOS before 16.2 does not have. */
export const shadeHex = (hex: string, f: number): string => {
  const s = String(hex || "").replace("#", "");
  if (s.length < 6) return hex;
  const c = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
  if (c.some(isNaN)) return hex;
  return "#" + c.map((v) => Math.round(v * (1 - f)).toString(16).padStart(2, "0")).join("");
};

/** ⚠⚠ THE ONE TOOL PAINT (2 Oct 2026, the user: "better color scheme for all
 *  tools and headings inside their pages on home … color should be standard in
 *  different profiles as well"). Every tile and every page it opens wears this,
 *  and nothing else declares its own copy any more — six files did, and one of
 *  them (the Classes register) had drifted to a different teal from its own tile.
 *
 *  It was the prototype's `c → c·80%α → c·50%α`, which fades the far corner to
 *  HALF TRANSPARENT: on the dark page that read as a muddy smear and on the light
 *  page the white title sat on a washed-out pastel. It is solid now — the colour
 *  deepening into a darker shade of itself — so the white type holds the same
 *  contrast in both themes and every tool reads as one family. */
export const dosToolPaint = (c: string): string => `linear-gradient(135deg,${c} 0%, ${shadeHex(c, 0.28)} 100%)`;

/** A person's two-colour badge when they have no photo (prototype personGrad, 2947). */
export const personGrad = (isTeam = false): [string, string] =>
  isTeam ? ["#7C3AED", "#EC4899"] : ["#2E86DE", "#3498DB"];

/** "Vikram Bhatt" → "VB" (prototype initials, 2946). */
export const initialsOf = (name: string): string =>
  String(name || "")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
