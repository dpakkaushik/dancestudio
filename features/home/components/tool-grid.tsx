import Link from "next/link";
import type { ReactNode } from "react";
import { CrewI, dosToolPaint } from "@/features/crews/components/crew-kit";
import { EventI } from "@/features/discovery/components/discover-kit";
import { StudioI } from "@/features/shell/components/shell-glyphs";
import { InvertedPanel } from "@/components/ui/InvertedPanel";
import { DOS_DISPLAY } from "@/lib/design/tokens";

/** ONE HEADING OVER EVERY TOOL GRID (18 Sep 2026), and the ARRANGE CONTROL
 *  BESIDE IT (27 Sep 2026). Moved here from `home-kit` with the panel, so the
 *  client component that draws the arranging can render its own head without
 *  importing the kit that renders IT. */
export type ToolsKind = "user" | "artist" | "org" | "studio" | "crew";
export const TOOLS_HEADING: Record<ToolsKind, string> = { user: "User Tools", artist: "Artist Tools", org: "Organization Tools", studio: "Studio Tools", crew: "Crew Tools" };

/** ⚠⚠ THE HEAD CARRIES THE ARRANGE CONTROL NOW (27 Sep 2026, the user:
 *  *"arrange tools options in top left with tools heading"*).
 *
 *  This REVERSES C34 — *"make sure only heading on top nothing else"*, 21 Sep —
 *  and it is the same person saying so, which is what makes it a decision
 *  rather than drift. The two are not the same question either: what C34 took
 *  off the head was the PLAN BADGE, a second door to something Settings already
 *  owned; what goes on it now is the control FOR THE THING THE HEAD NAMES. At
 *  the foot it sat under a grid somebody had to scroll past to find it. */
export function ToolsHead({ kind, right = null }: { kind: ToolsKind; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 10px" }}>
      {/* `currentColor`, not INK (21 Sep 2026) — the panel below inverts the
          theme, so the heading takes its colour from whatever ground it is on
          rather than from the page's own ink, which would vanish into it */}
      <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: -0.3, color: "currentColor", fontFamily: DOS_DISPLAY }}>{TOOLS_HEADING[kind]}</span>
      {right ? <div style={{ marginLeft: "auto" }}>{right}</div> : null}
    </div>
  );
}

/** THE TOOLS PANEL — ONE SQUIRCLE, INVERTED AGAINST THE THEME (21 Sep 2026).
 *  `InvertedPanel` swaps the whole palette for its subtree, so every component
 *  inside reads the tokens and is correct with no change of its own. */
export function ToolsPanel({ kind, head, children }: { kind: ToolsKind; head?: ReactNode; children: ReactNode }) {
  return <InvertedPanel head={<ToolsHead kind={kind} right={head} />}>{children}</InvertedPanel>;
}

/** THE TOOL TILE AND ITS GLYPHS, ON THEIR OWN (22 Sep 2026).
 *
 *  Lifted out of `home-kit` unchanged when the grid became arrangeable. The
 *  reason is a real one rather than tidiness: `ArrangeTools` is a CLIENT
 *  component that draws the same tiles as a list, and `home-kit` renders
 *  `ArrangeTools` — so leaving the tile in the kit made a cycle across the
 *  server/client boundary. Function hoisting would probably have carried it;
 *  "probably" is not a thing to build a Home render on. The leaf has no idea
 *  either of them exists now, and both read it. */

/* ── the tool glyphs (2510-2530) ── */
const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const I = (p: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...S} aria-hidden="true">
    {p}
  </svg>
);

/** ⚠ `satisfies`, NOT `: Record<string, ReactNode>` (27 Sep 2026) — and that one
 *  word is the whole of why two tiles drew an EMPTY chip for a day.
 *
 *  `Tile.k` is `keyof typeof GLYPH`. Annotated as `Record<string, ReactNode>`
 *  that key type is `string`, so `k: "organizations"` and `k: "subscription"`
 *  both compiled, both looked up `undefined`, and both rendered a black square
 *  with nothing in it — on EVERY person's Home (two of them), on a studio's own
 *  home and on an organization's. Typecheck, lint and `next build` were all
 *  green through it, because a missing key in a `Record<string, …>` is not a
 *  type error; only a pair of eyes on the screen could see it.
 *
 *  With `satisfies` the key type is the union of what is actually drawn here, so
 *  a tile that names a glyph nobody wrote FAILS TO COMPILE. This is the repo's
 *  own recurring shape one more time — a field that exists and a screen that
 *  never reads it — met from the other side: a screen that reads a field nobody
 *  wrote. The fix is to let the type say which keys exist. */
export const GLYPH = {
  calendar: I(
    <>
      <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
      <path d="M3.5 9.5h17M8.5 4.5v-2M15.5 4.5v-2" />
    </>
  ),
  crews: <CrewI size={20} color="currentColor" />,
  studios: <StudioI size={20} color="currentColor" />,
  events: <EventI size={20} color="currentColor" />,
  classesmod: I(
    <>
      <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
      <path d="M3.5 9.5h17M8.5 4.5v-2M15.5 4.5v-2M12 12.5v5M9.5 15h5" />
    </>
  ),
  earn: I(
    <>
      <rect x="3" y="6.5" width="18" height="11" rx="2.5" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  /* a student is one person you are teaching; the team is several people standing together */
  students: I(
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 20c.8-3.7 3.4-5.6 6.5-5.6s5.7 1.9 6.5 5.6" />
    </>
  ),
  team: I(
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c.6-2.9 2.8-4.5 5.5-4.5S13.9 16.1 14.5 19" />
      <circle cx="17" cy="9.5" r="2.4" />
      <path d="M15.5 14.6c2.5.2 4.3 1.6 5 4.4" />
    </>
  ),
  /* a room is a place on the floor — the prototype's Rooms mark is a pin (7373) */
  rooms: I(
    <>
      <path d="M12 21s-6.5-5.7-6.5-10A6.5 6.5 0 0 1 12 4.5 6.5 6.5 0 0 1 18.5 11c0 4.3-6.5 10-6.5 10z" />
      <circle cx="12" cy="10.8" r="2.3" />
    </>
  ),
  /* media is a picture: the frame, the sun, the hill (15 Sep 2026) */
  media: I(
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="3" />
      <circle cx="9" cy="10" r="1.7" />
      <path d="M20.5 15.5l-4.6-4.6a1.5 1.5 0 0 0-2.1 0L6.5 18.2" />
    </>
  ),
  /* the three desks named on 18 Sep 2026 before they exist: a routine is a
     piece of music you move to, a membership is a card, an asset is a box */
  routines: I(
    <>
      <path d="M9 18V6l9-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="15.5" cy="16" r="2.5" />
    </>
  ),
  memberships: I(
    <>
      <rect x="3" y="6" width="18" height="12" rx="2.5" />
      <path d="M3 10.5h18M7 14.5h4" />
    </>
  ),
  assets: I(
    <>
      <path d="M12 3.5 20 7.5v9l-8 4-8-4v-9z" />
      <path d="M4 7.5l8 4 8-4M12 11.5v9" />
    </>
  ),
  /* AN ORGANIZATION IS A THING WITH PARTS UNDER IT (27 Sep 2026) — the org
     chart: one box over two, joined. It has to be legible at 20px BESIDE
     `studios`, which is one building with its windows (StudioI), and beside
     `team`, which is people-shaped; boxes-and-lines is neither, and nothing
     else on any grid uses a connector. */
  organizations: I(
    <>
      <rect x="9" y="3" width="6" height="5" rx="1.5" />
      <rect x="3" y="16" width="6" height="5" rx="1.5" />
      <rect x="15" y="16" width="6" height="5" rx="1.5" />
      <path d="M12 8v4M6 16v-2.5h12V16" />
    </>
  ),
  /* A SUBSCRIPTION IS THE ONE THING ON THE GRID THAT COMES BACK (27 Sep 2026):
     the recurring arrows. ⚠ Deliberately NOT a card — `memberships` is a card
     with a stripe and `earn` a card with a circle, and a third card on the same
     grid is three tiles nobody can tell apart. */
  subscription: I(
    <>
      <path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6" />
      <path d="M18.5 3v3.6h-3.6M5.5 21v-3.6h3.6" />
    </>
  ),
  /* AN ENQUIRY IS SOMEBODY ASKING WHAT IT WOULD COST (27 Sep 2026) — the speech
     bubble with a rupee in it. ⚠ Not a new drawing: this is the glyph that spent
     the morning on the tab bar, MOVED here when the user made Enquiries a tool
     rather than a tab, so the icon is not left behind in `TAB_ICONS` where only
     a type could ever find it again (the `Stats` lesson, same day). It is the
     one glyph on any grid that is about money coming IN — `earn` is the card
     with the coin, which is money already counted. */
  enquiries: I(
    <>
      <path d="M20.5 12.2c0 3.9-3.8 7-8.5 7a9.7 9.7 0 0 1-2.6-.35L4.2 20.3l1.3-3.3A6.6 6.6 0 0 1 3.5 12.2c0-3.9 3.8-7 8.5-7s8.5 3.1 8.5 7z" />
      <path d="M10 9.2h4M10 11.6h4M13 9.2c0 2.3-1.3 2.4-3 2.4l3.2 3" />
    </>
  ),
  /* A PRACTICE IS A TIMED SESSION YOU REPEAT (27 Sep 2026) — the stopwatch: the
     body, the hands, the crown and the button on top. ⚠ Deliberately NOT another
     rectangle: `calendar` is a grid with a bar, `memberships` a card with a
     stripe, `earn` a card with a circle, and a fourth box on a grid that already
     carries Calendar beside it is two tiles nobody can tell apart at 20px. A
     round face with hands is the only one of its shape on any grid. */
  practice: I(
    <>
      <circle cx="12" cy="13.8" r="6.8" />
      <path d="M12 10v4l2.6 1.7M9.5 3.5h5M12 3.5v3.4M18.9 7.6l1.4-1.4" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export interface Tile {
  name: string;
  href: string;
  k: keyof typeof GLYPH;
  c: string;
}

/** THE GLYPH CHIP, ON ITS OWN (22 Sep 2026) — a black square outlined in the
 *  tile's own colour, so on a tile that IS that colour the icon has an edge to
 *  sit against (2556-2566). Extracted because the ARRANGING list draws the same
 *  chip beside the same name, and this repo's own recurring bill is the second
 *  copy: `linkChip` declared twice, the figure row written out three times,
 *  three copies of the identity band. One chip, two callers. */
export function ToolGlyph({ k, c, size = 38 }: { k: keyof typeof GLYPH; c: string; size?: number }) {
  return (
    <span
      style={{
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0A0A0A",
        border: `1.5px solid ${c}`,
        color: c,
        lineHeight: 0,
      }}
    >
      {GLYPH[k]}
    </span>
  );
}

/** THE GRID ITSELF, on its own (14 Sep 2026) so a studio's own home can draw
 *  ITS set of doors with the same tile, the same paint and the same glyph chip. */
export function ToolGrid({ tiles }: { tiles: Tile[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {tiles.map((t) => (
        <Link
          key={t.name}
          href={t.href}
          aria-label={t.name}
          style={{
            background: dosToolPaint(t.c),
            border: `1.5px solid ${t.c}`,
            borderRadius: 16,
            padding: "9px 11px",
            minHeight: 58,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: 10,
            cursor: "pointer",
            boxSizing: "border-box",
            WebkitTapHighlightColor: "transparent",
            boxShadow: `0 3px 12px ${t.c}33`,
            transition: "transform .12s",
            textDecoration: "none",
          }}
        >
          <ToolGlyph k={t.k} c={t.c} />
          {/* the name WRAPS rather than ellipsizing (18 Sep 2026, the user: "make
              sure nothing gets cut") — on a 360px phone a half-width tile has ~90px
              of text room after its chip, and "Memberships" is longer than that */}
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 14.5,
              fontWeight: 900,
              letterSpacing: -0.3,
              lineHeight: 1.1,
              color: "#fff",
              fontFamily: DOS_DISPLAY,
              overflowWrap: "anywhere",
            }}
          >
            {t.name}
          </span>
        </Link>
      ))}
    </div>
  );
}
