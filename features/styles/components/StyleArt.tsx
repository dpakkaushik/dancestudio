import { styleArtSvg, type StyleArtFrame } from "@/lib/styleArt";
import { styleSlug } from "@/lib/constants/styleInfo";

/** a style's DRAWN dancer — its costume, its pose, its props (2 Oct 2026,
 *  replacing the Commons photos at the user's word). The markup is our own,
 *  generated from `lib/styleArt/specs.ts`, never user input, which is why it is
 *  set as HTML. It fills its parent, so the parent decides the shape: a 4:5
 *  card on Discover, a square on the style's own page. */
export function StyleArt({ style, frame, label }: { style: string; frame: StyleArtFrame; label?: string }) {
  const art = styleArtSvg(style, frame, styleSlug(style));
  if (!art) return null;
  return (
    <svg
      viewBox={art.viewBox}
      preserveAspectRatio="xMidYMid meet"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-testid="style-art"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
      dangerouslySetInnerHTML={{ __html: art.inner }}
    />
  );
}
