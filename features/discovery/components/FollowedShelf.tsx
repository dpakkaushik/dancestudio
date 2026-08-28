import Image from "next/image";
import Link from "next/link";
import { DOS_DISPLAY, DOS_TINT, INK, MUTED } from "@/lib/design/tokens";
import { initialsOf } from "./discover-kit";

export type FollowedKind = "studio" | "artist";

export interface FollowedTile {
  id: string;
  name: string;
  kind: FollowedKind;
  href: string;
  photo: string | null;
  grad: [string, string];
}

const shelf: React.CSSProperties = { fontSize: 17, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1.2, fontFamily: DOS_DISPLAY };
const TINT: Record<FollowedKind, string> = { studio: DOS_TINT.studio, artist: DOS_TINT.trainer };

/** "Followed by you" (prototype FollowedRow 4112-4144), heading the Studios and
 *  Artists tabs for a signed-in person: the count beside the heading, then a
 *  swiped rail of 74px squircle tiles — the face (or initials on the gradient),
 *  the name on one line, and the kind in its own tint. NO STAR: "the words are
 *  the label; the shelf is the fact." Crews have no follow yet, so the Crews
 *  tab draws none. */
export function FollowedShelf({ rows }: { rows: FollowedTile[] }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ ...shelf, color: INK }}>Followed by you</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: -0.3, color: MUTED }} data-testid="followed-count">
          {rows.length}
        </span>
      </div>
      <div style={{ display: "flex", gap: 9, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 2 }}>
        {rows.map((x) => (
          <Link key={x.id} href={x.href} aria-label={`${x.name} — followed ${x.kind}`} style={{ flexShrink: 0, width: 74, color: INK, textDecoration: "none" }}>
            <div style={{ width: 74, height: 74, borderRadius: 16, background: `linear-gradient(135deg,${x.grad[0]},${x.grad[1]})`, display: "flex", alignItems: "flex-end", padding: 7, boxSizing: "border-box", position: "relative", overflow: "hidden" }}>
              {x.photo ? <Image src={x.photo} alt="" fill sizes="74px" style={{ objectFit: "cover" }} /> : <span style={{ color: "#fff", fontSize: 19, fontWeight: 800, fontFamily: DOS_DISPLAY, lineHeight: 1 }}>{initialsOf(x.name)}</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 5, minWidth: 0 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 9.5, fontWeight: 700, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</span>
            </div>
            <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.3, color: TINT[x.kind], textTransform: "uppercase" }}>{x.kind}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
