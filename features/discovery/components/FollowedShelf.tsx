import Image from "next/image";
import Link from "next/link";
import { DOS_DISPLAY, DOS_TINT, INK, MUTED } from "@/lib/design/tokens";
import { initialsOf } from "./discover-kit";
import { TopPanel } from "@/components/ui/TopPanel";
import { StyleArt } from "@/features/styles/components/StyleArt";

/* "crew" since 2 Oct 2026 — a crew has been followable since 19 Sep, and the
   Crews tab drew no shelf because this union said it could not */
/* "style" since 10 Oct 2026 — the Styles tab's shelf is the styles you dance and
   the ones you want to learn, each drawn as its own dancer on its own colour */
export type FollowedKind = "studio" | "artist" | "crew" | "style";

export interface FollowedTile {
  id: string;
  name: string;
  kind: FollowedKind;
  href: string;
  photo: string | null;
  grad: [string, string];
  /** a style tile: the style whose dancer is drawn on the face */
  style?: string;
  /** the word under the name, when the kind alone does not say it ("You dance", "To learn") */
  tag?: string;
}

const shelf: React.CSSProperties = { fontSize: 17, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1.2, fontFamily: DOS_DISPLAY };
/* ⚠ a STUDIO tile borrowed `DOS_TINT.org` — the studio blue an organization wore
   — and that key went with organizations (29 Sep 2026), so the colour is stated
   here instead. It is unchanged on screen. */
const TINT: Record<FollowedKind, string> = { studio: "#3B82F6", artist: DOS_TINT.artist, crew: "#EF4444", style: "#5AC8FA" };

/** "Followed by you" (prototype FollowedRow 4112-4144), heading the Studios and
 *  Artists tabs for a signed-in person: the count beside the heading, then a
 *  swiped rail of 74px squircle tiles — the face (or initials on the gradient),
 *  the name on one line, and the kind in its own tint. NO STAR: "the words are
 *  the label; the shelf is the fact." The Crews tab draws the crews you follow
 *  since 2 Oct 2026 (the user: "followed crews also dont appear in the followed
 *  by you row on discover"). */
export function FollowedShelf({ rows }: { rows: FollowedTile[] }) {
  if (rows.length === 0) return null;
  /* ⚠ ITS OWN SQUIRCLE, BETWEEN THE TWO (3 Oct 2026, the user: "followed by you
     section on discover in seprated squircle card in middle section") — the same
     card the top of the page is, untinted, so Discover reads as three shapes:
     the head, what you follow, and the shelf on the opposite theme */
  return (
    <TopPanel testId="followed-shelf" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ ...shelf, color: INK }}>Followed by you</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: -0.3, color: MUTED }} data-testid="followed-count">
          {rows.length}
        </span>
      </div>
      <div style={{ display: "flex", gap: 9, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 2 }}>
        {rows.map((x) => (
          <Link key={x.id} href={x.href} aria-label={x.style ? `${x.name} — ${x.tag ?? "your style"}` : `${x.name} — followed ${x.kind}`} data-testid={x.style ? "followed-style" : undefined} style={{ flexShrink: 0, width: 74, color: INK, textDecoration: "none" }}>
            <div style={{ width: 74, height: 74, borderRadius: 16, background: `linear-gradient(135deg,${x.grad[0]},${x.grad[1]})`, display: "flex", alignItems: "flex-end", padding: 7, boxSizing: "border-box", position: "relative", overflow: "hidden" }}>
              {x.style ? <StyleArt style={x.style} frame="page" /> : x.photo ? <Image src={x.photo} alt="" fill sizes="74px" style={{ objectFit: "cover" }} /> : <span style={{ color: "#fff", fontSize: 19, fontWeight: 800, fontFamily: DOS_DISPLAY, lineHeight: 1 }}>{initialsOf(x.name)}</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 5, minWidth: 0 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 9.5, fontWeight: 700, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</span>
            </div>
            <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.3, color: x.style ? "var(--sub)" : TINT[x.kind], textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.tag ?? x.kind}</div>
          </Link>
        ))}
      </div>
    </TopPanel>
  );
}
