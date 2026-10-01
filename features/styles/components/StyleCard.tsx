import Image from "next/image";
import Link from "next/link";
import { DOS_DISPLAY } from "@/lib/design/tokens";
import { dosStyleColor } from "@/lib/constants/styles";
import { styleInfo, stylePhoto, styleSlug } from "@/lib/constants/styleInfo";

/** a dance style on Discover's Styles tab (2 Oct 2026): its photo, its name
 *  across the photo's foot, its family above — a door to the style's own page.
 *  ⚠ A style with no honest free photo draws its OWN COLOUR instead, the colour
 *  the registry gives it everywhere else, rather than a wrong picture. */
export function StyleCard({ style, classes, city }: { style: string; classes: number; city: string }) {
  const photo = stylePhoto(style);
  const color = dosStyleColor(style);
  const { family } = styleInfo(style);
  return (
    <Link
      href={`/styles/${styleSlug(style)}`}
      aria-label={`Open ${style}`}
      data-testid="style-card"
      style={{ position: "relative", display: "block", aspectRatio: "4 / 5", borderRadius: 18, overflow: "hidden", textDecoration: "none", background: `linear-gradient(150deg, ${color}, ${color}99)`, border: "1.5px solid var(--el)" }}
    >
      {/* ⚠ FRAMED ON THE TOP THIRD, NOT THE CENTRE (2 Oct 2026, the user: "should
          fit properly in discover"): a dancer's head and hands are what make a
          pose read, and a centred crop of a portrait photo cut them off */}
      {photo ? <Image src={photo.src} alt="" fill sizes="(max-width: 430px) 45vw, 190px" style={{ objectFit: "cover", objectPosition: "50% 22%" }} /> : null}
      <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,.78) 100%)" }} />
      <span style={{ position: "absolute", left: 11, right: 11, bottom: 10, color: "#fff" }}>
        <span style={{ display: "block", fontSize: 9, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase", opacity: 0.85 }}>{family}</span>
        <span style={{ display: "block", fontFamily: DOS_DISPLAY, fontWeight: 900, fontSize: 17, letterSpacing: -0.4, lineHeight: 1.1, marginTop: 2, overflowWrap: "anywhere" }}>{style}</span>
        {classes > 0 ? <span style={{ display: "block", fontSize: 10.5, fontWeight: 700, opacity: 0.85, marginTop: 3 }}>{classes} {classes === 1 ? "class" : "classes"} in {city}</span> : null}
      </span>
      <span aria-hidden="true" style={{ position: "absolute", top: 9, left: 9, width: 10, height: 10, borderRadius: 5, background: color, boxShadow: "0 0 0 2px rgba(255,255,255,.85)" }} />
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
