import { figureSvg } from "./figure";
import { STYLE_SPECS } from "./specs";

/** the two frames a style's dancer is drawn in (2 Oct 2026):
 *  "card" — Discover's 4:5 card, the figure kept above the name across its foot;
 *  "page" — the style's own page, a square with the figure filling it. */
export type StyleArtFrame = "card" | "page";

const FRAMES: Record<StyleArtFrame, { w: number; h: number; box: [number, number, number, number] }> = {
  card: { w: 100, h: 125, box: [10, 9, 80, 74] },
  page: { w: 100, h: 100, box: [8, 7, 84, 84] },
};

/** the whole `<svg>` for a style, or null for a style with no spec */
export function styleArtSvg(style: string, frame: StyleArtFrame, idSeed: string): { viewBox: string; inner: string } | null {
  const spec = STYLE_SPECS[style];
  if (!spec) return null;
  const f = FRAMES[frame];
  const id = `${frame}-${idSeed}`.replace(/[^a-z0-9-]/gi, "");
  return { viewBox: `0 0 ${f.w} ${f.h}`, inner: figureSvg(spec, id, f.box) };
}
