import type { CSSProperties, ReactNode } from "react";
import { DOS_DISPLAY } from "@/lib/design/tokens";

/** The business desks' shared chrome, lifted from the prototype's BizShell and
 *  its neighbours (DanceOSApp.jsx:2916-2984).
 *
 *  THE TOOLS, DECLARED ONCE (2931-2941): every tool is a tile on Home and a
 *  page it opens, and both ends read name and colour from here — "a page
 *  cannot be headed anything other than what the tile you pressed said".
 *
 *  ⚠ ONE COLOUR PER TOOL, AND NO TWO ALIKE ON ANY GRID (18 Sep 2026, the user:
 *  "fix colors for all tiles on home tab for all profiles, colours should not be
 *  repeated"). The grid grew from six tiles to thirteen without the palette
 *  growing with it, and it had collapsed into families: FOUR blues — Studios
 *  #3B82F6, Rooms #3498DB, Memberships #0EA5E9, Calendar #5AC8FA — and THREE
 *  violets — Students #8B5CF6, Stats #A855F7, Assets #7C3AED. On a studio's home
 *  that is three blue-ish tiles and three purple ones out of ten, which is what
 *  the user was looking at.
 *
 *  The set is spread round the wheel now, and where two tools had to share a
 *  band they are separated by LIGHTNESS instead (Events is bright amber,
 *  Memberships a dark bronze). Assets is deliberately the one NEUTRAL: at
 *  thirteen tiles the wheel is full, and a single slate among twelve saturated
 *  tiles is the most unmistakable thing on the grid — which is the whole point.
 *  Checked against every kind's actual list: a user's six, an artist's thirteen,
 *  an organization's five, a studio's ten. Deviation row R20 — four of these are
 *  the prototype's own paints, and the user overruled them. */
export const DOS_TOOLS = {
  studios: { name: "Studios", c: "#3B82F6" },
  /* deepened from #0D9488 so Calendar's cyan beside it reads as another tile
     and not another shade — the two sit together on three of the four grids */
  classes: { name: "Classes", c: "#0F766E" },
  /* ⚠ `events` (bright amber #F59E0B) went with events on 29 Sep 2026 — with it
     the warm band lost the tool that Team and Memberships were pulled apart FROM
     by depth, so those two are darker than they now need to be. Left as they
     are: R20's test is that no two tiles on ONE grid read alike, and darker
     still passes it. */
  earn: { name: "Earnings", c: "#22C55E" },
  /* was #8B5CF6 — a second violet beside Stats, and they sit together on both a
     studio's grid and an artist's */
  students: { name: "Students", c: "#84CC16" },
  /* was #F97316, thirteen degrees off Events' amber and the same lightness —
     the warm band holds five tools, so this one separates by depth */
  team: { name: "Team", c: "#9A3412" },
  /* was #3498DB — a blue eight degrees off Studios' */
  rooms: { name: "Rooms", c: "#6366F1" },
  /* MEDIA (15 Sep 2026): a studio's two pictures — the disc and the header —
     as a desk of their own; a fuchsia nobody else on the grid wears */
  media: { name: "Media", c: "#D946EF" },
  /* STATS (15 Sep 2026, the user: "remove stats from the navigation menu, keep
     it as a tab on the home page along with calendar, classes") — the violet
     the Charts hero opens on, and now the ONLY violet. ⚠ Not a tile since 18 Sep
     2026 ("remove stats from tools and place like a button similar to the qr
     code"): it is the `StatsChip` beside the QR in every hero; the entry stays
     because the word and the colour are still the tool's */
  stats: { name: "Stats", c: "#A855F7" },
  /* THE HOME GRID FOR ALL FOUR KINDS (18 Sep 2026, the user's list): three
     tools the prototype has a screen for and this app does not yet —
     S_choreos 17115, S_memberships 16846, S_assets 16791 */
  routines: { name: "Routines", c: "#EC4899" },
  /* was #0EA5E9 — a third blue. Bronze reads as a card or a tier, and its
     darkness is what separates it from Events' amber */
  memberships: { name: "Memberships", c: "#A16207" },
  /* was #7C3AED — a third violet. The one neutral on the grid, on purpose */
  assets: { name: "Assets", c: "#64748B" },
  /* deepened from #5AC8FA, which was a pale fourth blue; CalendarScreen's own
     paint follows it */
  calendar: { name: "Calendar", c: "#06B6D4" },
  crews: { name: "Crews", c: "#DC2626" },
  /* ⚠ `organizations` (the deep plum #701A75, 26 Sep 2026) went with
     organizations on 29 Sep */
  /* SUBSCRIPTION IS ON HOME FOR EVERY PROFILE (26 Sep 2026, the user: "subscriptions
     also become an option on home tab for all profiles and is removed from
     settings for all") — a deep blue, 15° off Studios' and a full step darker,
     since the two sit on the same grid */
  subscription: { name: "Subscription", c: "#0369A1" },
  /* ENQUIRIES IS A TOOL, NOT A TAB (27 Sep 2026, the user: "enquiries should not
     be on navbar a tab in tools for all"). It wore #EC4899 for the few hours it
     was on the bar and CANNOT keep it: Routines is that exact pink and the two
     would sit on one grid. A deep purple instead, checked against every grid it
     lands on rather than picked — 33° off Rooms' indigo (a studio's grid), 24°
     off Organizations' plum and 58° off Routines' pink (a person's), and 20° off
     Media's fuchsia but a full step darker, which is this list's own way of
     separating a crowded band (Events bright amber, Memberships dark bronze).
     ⚠ It shares a hue family with Stats' violet, and that is not a clash: Stats
     has not been a tile on any grid since 18 Sep — it is the chip beside the QR
     — so the two are never side by side. */
  enquiries: { name: "Enquiries", c: "#7E22CE" },
  /* PRACTICE (27 Sep 2026, the user: "crew should also get an option on home tab
     called Practice") — ⚠⚠ REPAINTED 29 Sep 2026, and the repaint is what makes
     the user's own next ask legal: *"practice should be seprate tab in home tab
     not in crew"*.
     It was #15803D, a deep green at 142°, chosen when this was a CREW-ONLY tile
     and the only grid it had to clear was a crew's. Its own note said the rest
     out loud: "it shares a hue with Earnings' #22C55E and that is NOT a clash by
     R20's own test, WHICH IS PER-GRID — a crew has no Earnings tile." The moment
     it joins a person's grid that reasoning expires, and 142° against 142° is the
     one pair R20 exists to refuse.
     A deep indigo at 245° is the widest band actually free on every grid it now
     lands on. Checked against each kind's REAL list rather than the palette:
     · a person's / an artist's — Studios #3B82F6 (217°, 28° and a step darker),
       Subscription #0369A1 (202°), Enquiries #7E22CE (275°, 30°), Assets #64748B
       (215° but the deliberate NEUTRAL — unsaturated, so it reads as grey),
       Media #D946EF (292°), and nothing green at all beside it now.
     · a crew's — Team #9A3412 (22°), Calendar #06B6D4 (187°, 58°), Enquiries
       #7E22CE (275°, 30°).
     ⚠ Rooms #6366F1 (239°) is six degrees away and is a STUDIO-only tile, so the
     two are never on one grid — the same per-grid reading that licensed the old
     green, recorded here so the next reader does not have to re-derive it. */
  practice: { name: "Practice", c: "#4338CA" },
  /* `managed` ("Manage", violet) left this list on 19 Sep 2026 — the user: "just
     need to remove manage as the tile in tools, nothing else changes". The
     /managed page stays; nothing paints a tile for it any more */
} as const;
export type DosToolKey = keyof typeof DOS_TOOLS;

/** the tile's fill and the page's header are the same paint, mixed the same way (2944) */
export const dosToolPaint = (c: string) => `linear-gradient(135deg,${c} 0%, ${c}cc 55%, ${c}80 100%)`;

/** bizCard / bizBtn (2918-2920) — the desk's card and its one primary pill */
export const bizCard: CSSProperties = {
  background: "var(--card)",
  border: "1.5px solid var(--el)",
  borderRadius: 16,
  padding: "13px 14px",
  marginBottom: 10,
};

export const bizBtn: CSSProperties = {
  textAlign: "center",
  padding: "13px",
  borderRadius: 999,
  background: "var(--text)",
  color: "var(--solid)",
  fontWeight: 900,
  fontSize: 13.5,
  cursor: "pointer",
  marginBottom: 10,
  WebkitTapHighlightColor: "transparent",
};

/** The sheet every desk raises (2659-2661): a .6 scrim, the 24px shoulders, the
 *  40×4 handle, and the rise. The keyframe is global (app/globals.css). */
export const SHEET_ANIMATION = "dosSheetUp .28s cubic-bezier(.22,.9,.34,1)";

export const sheetWrap: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.6)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  zIndex: 610,
};

export const sheetBody: CSSProperties = {
  background: "var(--solid)",
  color: "var(--text)",
  borderRadius: "24px 24px 0 0",
  padding: "18px 16px 28px",
  width: "100%",
  maxWidth: 430,
  boxSizing: "border-box",
  maxHeight: "88vh",
  overflowY: "auto",
  animation: SHEET_ANIMATION,
};

export const SheetHandle = () => (
  <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 12px" }} />
);

/** The tool's hero (2966-2975): a 22px-radius card in the tool's colour, the
 *  130px white circle bleeding off the top-right, and the tool's name — and
 *  nothing else. "A tool's page says what the tile said and nothing else: the
 *  counts and the sub-headings under these titles were restating the list that
 *  follows them."
 *
 *  SINCE 18 SEP 2026 EVERY TILE'S PAGE WEARS IT (the user: "all heading when
 *  inside the page should have similar design as Crew, Calendar etc."): Your
 *  classes, Your events and the not-built desks had a 17px text line where the
 *  other desks had this card. `as="h1"` makes the title the page's heading on
 *  the pages whose only heading it is. */
export function DeskHero({ tool, margin = "12px 0 0", as = "div" }: { tool: DosToolKey; margin?: string; as?: "div" | "h1" }) {
  const T = DOS_TOOLS[tool];
  const title: CSSProperties = {
    margin: 0,
    fontSize: 21,
    fontWeight: 800,
    letterSpacing: -0.5,
    position: "relative",
    fontFamily: DOS_DISPLAY,
    lineHeight: 1.18,
  };
  return (
    <div
      style={{
        margin,
        borderRadius: 22,
        padding: "15px 17px 14px",
        color: "#fff",
        position: "relative",
        overflow: "hidden",
        background: dosToolPaint(T.c),
      }}
    >
      <div
        style={{
          position: "absolute",
          right: -28,
          top: -32,
          width: 130,
          height: 130,
          borderRadius: 65,
          background: "rgba(255,255,255,.13)",
        }}
      />
      {as === "h1" ? <h1 style={title}>{T.name}</h1> : <div style={title}>{T.name}</div>}
    </div>
  );
}

/** The canonical toast (2977-2982). "The toast used to be var(--el) — 13% white
 *  laid over the page, so whatever row it landed on read straight through the
 *  message sitting on top of it. It is solid now, with the elevated tint as a
 *  border rather than as the whole background." Drill pages have no tab bar
 *  under them, so the toast sits at 26; tabs lift it over the bar at 96. */
export function BizToast({ msg, bottom = 26 }: { msg: string | null; bottom?: number }): ReactNode {
  if (!msg) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom,
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--solid)",
        border: "1.5px solid #0EA5E9",
        boxShadow: "0 6px 24px rgba(0,0,0,.45)",
        color: "var(--text)",
        padding: "11px 18px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
        zIndex: 650,
        maxWidth: 360,
        textAlign: "center",
      }}
    >
      {msg}
    </div>
  );
}
