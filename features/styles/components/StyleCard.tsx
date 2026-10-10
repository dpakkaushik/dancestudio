import Link from "next/link";
import { DOS_DISPLAY } from "@/lib/design/tokens";
import { dosStyleColor } from "@/lib/constants/styles";
import { styleInfo, styleSlug } from "@/lib/constants/styleInfo";
import { StyleArt } from "./StyleArt";
import { FollowerPill } from "@/features/discovery/components/discover-kit";

/** a dance style on Discover's Styles tab (2 Oct 2026): its drawn dancer on the
 *  style's own colour, its name across the foot, its family above — a door to
 *  the style's own page. */
export function StyleCard({ style, classes, city, followers }: { style: string; classes: number; city: string; followers?: number }) {
  const color = dosStyleColor(style);
  const { family } = styleInfo(style);
  return (
    <Link
      href={`/styles/${styleSlug(style)}`}
      aria-label={`Open ${style}`}
      data-testid="style-card"
      style={{ position: "relative", display: "block", aspectRatio: "4 / 5", borderRadius: 18, overflow: "hidden", textDecoration: "none", background: `linear-gradient(150deg, ${color}, ${color}99)`, border: "1.5px solid var(--el)" }}
    >
      <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,.72) 100%)" }} />
      {/* ⚠ THE DANCER IS FITTED, NOT CROPPED (2 Oct 2026): the card frame keeps the
          whole figure above the name, its feet on the floor of that box — every
          style's outline is measured, so a Breaking freeze and a Ghoomar skirt
          both fill it whole */}
      <StyleArt style={style} frame="card" />
      <span style={{ position: "absolute", left: 11, right: 11, bottom: 10, color: "#fff" }}>
        <span style={{ display: "block", fontSize: 9, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase", opacity: 0.85 }}>{family}</span>
        <span style={{ display: "block", fontFamily: DOS_DISPLAY, fontWeight: 900, fontSize: 17, letterSpacing: -0.4, lineHeight: 1.1, marginTop: 2, overflowWrap: "anywhere" }}>{style}</span>
        {classes > 0 ? <span style={{ display: "block", fontSize: 10.5, fontWeight: 700, opacity: 0.85, marginTop: 3 }}>{classes} {classes === 1 ? "class" : "classes"} in {city}</span> : null}
      </span>
      <span aria-hidden="true" style={{ position: "absolute", top: 9, left: 9, width: 10, height: 10, borderRadius: 5, background: color, boxShadow: "0 0 0 2px rgba(255,255,255,.85)" }} />
      {/* the people who carry this style on their profile or want to learn it
          (10 Oct 2026, the user: "follower count on styles tile on discover") —
          the same pill a studio, an artist and a crew card wear */}
      {followers !== undefined ? <FollowerPill n={followers} /> : null}
    </Link>
  );
}

/** the Styles tab's mark: a dancer mid-turn, the skirt flaring */
export function StyleI({ size = 26, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="4.2" r="1.8" />
      <path d="M12 6.5v5.5" />
      <path d="M12 8.2l-4.5-2.2M12 8.2l4.2 3" />
      <path d="M7 20.5l5-8.5 5 8.5z" />
    </svg>
  );
}
