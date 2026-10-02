import Image from "next/image";
import Link from "next/link";
import { VerifiedTick } from "@/features/settings/components/settings-kit";
import { DOS_DISPLAY, INK } from "@/lib/design/tokens";
import { DosWhere, FollowerPill, initialsOf } from "./discover-kit";

const micro: React.CSSProperties = { fontSize: 9.5, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase" };

/** AN ARTIST IS A FACE AND A NAME — the prototype's CompactCard (4376-4423),
 *  two to a row: THE FACE, AT THE SIZE OF A FACE — a full-column square with
 *  what they are written across its bottom-left in a translucent blurred chip;
 *  THE NAME GETS THE WHOLE COLUMN; where they are as one fact; and the figure at
 *  the foot. The Crews tab wears the same card with CREW in the chip and the
 *  roster size where the follower count would be — and no tick, because a crew is
 *  not a business DanceOS verifies.
 *
 *  ⚠ NO STYLE TILES (27 Sep 2026, the user: "remove dance styles from studio,
 *  artist and crew discover cards"). A `styles` prop is not kept unread either:
 *  a dead prop is a lie to the next reader, and both callers dropped theirs in
 *  the same edit. The styles are on the person's or the crew's own page, and the
 *  style RAIL above the shelf is how you narrow by one. */
export function CompactCard({
  href,
  ariaLabel,
  name,
  label,
  photo,
  grad,
  city,
  km,
  followers,
  verified = false,
}: {
  href: string;
  ariaLabel: string;
  name: string;
  label: "ARTIST" | "CREW";
  photo: string | null;
  grad: [string, string];
  city: string;
  km?: string | null;
  /** drawn as the pill on the picture's top-right corner (2 Oct 2026) — it was
   *  a `foot` slot under a hairline, which only ever held this count */
  followers: number;
  verified?: boolean;
}) {
  return (
    <Link href={href} aria-label={ariaLabel} style={{ minWidth: 0, background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 18, padding: 11, display: "flex", flexDirection: "column", gap: 7, color: INK, textDecoration: "none" }}>
      <div style={{ position: "relative", width: "100%", paddingTop: "100%", borderRadius: 14, overflow: "hidden", background: `linear-gradient(150deg,${grad[0]},${grad[1]})`, boxShadow: "0 6px 16px -8px rgba(0,0,0,.6)" }}>
        {photo ? (
          <Image src={photo} alt="" fill sizes="(max-width: 430px) 45vw, 190px" style={{ objectFit: "cover" }} />
        ) : (
          <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 38, fontWeight: 900, letterSpacing: 1, fontFamily: DOS_DISPLAY, textShadow: "0 3px 14px rgba(0,0,0,.35)" }}>{initialsOf(name)}</span>
        )}
        <span style={{ position: "absolute", left: 8, bottom: 8, ...micro, color: "rgba(255,255,255,.92)", padding: "2px 7px", borderRadius: 999, background: "rgba(0,0,0,.36)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}>{label}</span>
        <FollowerPill n={followers} />
      </div>
      {/* ⚠ THE TEXT UNDER THE PICTURE (2 Oct 2026, the user: "artist and crew
          discover cards text can be adjusted better below the pic"). The name
          was cut at a fixed height with no ellipsis — a long name lost half a
          line with nothing saying so — and the block had no fixed shape, so two
          cards side by side put their place line and their count at different
          heights. Now: the name is CLAMPED to two lines with an ellipsis, the
          tick rides its first line, the place sits right under it, and the count
          is pushed to the card's foot under a hairline — the same place on every
          card, which is what lines a row up. ⚠ Reserving a second line for every
          name was tried and read as a hole under every short name. */}
      <div style={{ minWidth: 0, padding: "2px 2px 0" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 5, minWidth: 0, fontSize: 14.5, lineHeight: 1.2 }}>
          <span
            title={name}
            style={{
              flex: 1,
              minWidth: 0,
              fontWeight: 900,
              letterSpacing: -0.3,
              fontFamily: DOS_DISPLAY,
              color: INK,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              overflowWrap: "anywhere",
            }}
          >
            {name}
            {/* ⚠ THE TICK RIDES THE NAME ITSELF (2 Oct 2026, the user: "verified
                badge on studios and artist should be with the name"). It was a
                sibling of a `flex: 1` name, so it sat at the card's far edge, a
                gap away from the word it vouches for. Inline after the last word,
                it follows the name onto its second line too. */}
            {verified ? <span style={{ display: "inline-block", marginLeft: 4, verticalAlign: -2, lineHeight: 0 }}><VerifiedTick size={13} /></span> : null}
          </span>
        </div>
        <div style={{ marginTop: 4, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          <DosWhere city={city} km={km ?? null} size={11} />
        </div>
      </div>
    </Link>
  );
}
