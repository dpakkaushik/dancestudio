/** Step 25 — Stats. The prototype's three dresses of one screen: YOUR RECORD
 *  (historyOnly 9862), History (classesOnly 9708) and Global Rankings
 *  (chartsOnly 9610). */

/** DOS_SIDES (6666): "a dancer does not attend a class, they TRAIN; a teacher
 *  does not host one, they TEACH" — the same three sides the calendar uses. */
export type Side = "conducted" | "assisted" | "attended";

export const SIDE_VERB: Record<Side, string> = { conducted: "Taught", assisted: "Assisted", attended: "Danced" };
/* the record's three colours (10031-10040): amber for taught, violet for assisted, blue for trained */
export const SIDE_TINT: Record<Side, string> = { conducted: "#F59E0B", assisted: "#8B5CF6", attended: "#3B82F6" };

export interface DanceStats {
  sessionsConducted: number;
  sessionsAssisted: number;
  sessionsAttended: number;
  hoursConducted: number;
  hoursAssisted: number;
  hoursAttended: number;
  points: number;
  styles: number;
  studios: number;
  artists: number;
  firstSession: string | null;
  lastSession: string | null;
}

export const EMPTY_STATS: DanceStats = {
  sessionsConducted: 0,
  sessionsAssisted: 0,
  sessionsAttended: 0,
  hoursConducted: 0,
  hoursAssisted: 0,
  hoursAttended: 0,
  points: 0,
  styles: 0,
  studios: 0,
  artists: 0,
  firstSession: null,
  lastSession: null,
};

export interface HistoryRow {
  sessionId: string;
  side: Side;
  classId: string;
  shareSlug: string | null;
  title: string;
  style: string;
  room: string | null;
  city: string | null;
  businessId: string | null;
  businessName: string | null;
  artistName: string | null;
  startsAt: string;
  endsAt: string;
  minutes: number;
}

export type ChartSegment = "dancer" | "artist" | "studio" | "crew";

/** the board's metric (9612) — Wins is absent because no score is recorded */
export type ChartMetric = "overall" | "conducted" | "assisted" | "attended" | "hours";
export const CHART_METRICS: Array<{ k: ChartMetric; label: string; unit: string }> = [
  { k: "overall", label: "Overall", unit: "pts" },
  { k: "conducted", label: "Sessions conducted", unit: "sessions" },
  { k: "assisted", label: "Sessions assisted", unit: "sessions" },
  { k: "attended", label: "Sessions attended", unit: "sessions" },
  { k: "hours", label: "Hours on the floor", unit: "hours" },
];
export const parseChartMetric = (raw: string | undefined): ChartMetric => (CHART_METRICS.some((m) => m.k === raw) ? (raw as ChartMetric) : "overall");

export const CHART_SEGMENTS: Array<{ k: ChartSegment; label: string }> = [
  { k: "studio", label: "Studios" },
  { k: "artist", label: "Artists" },
  { k: "crew", label: "Crews" },
  { k: "dancer", label: "Dancers" },
];

export interface ChartRow {
  place: number;
  kind: ChartSegment;
  id: string;
  name: string;
  city: string | null;
  style: string | null;
  conducted: number;
  assisted: number;
  attended: number;
  hours: number;
  /** a studio's people on the floor, a crew's roster */
  extra: number;
  points: number;
  /** how many were ranked — a place is never printed without it */
  population: number;
}

/** WHERE ONE ENTITY STANDS ON ONE BOARD — a scope ("Everywhere", "In Pune") and
 *  the row it has there, or null when it is not on that board yet. Step 25's rule
 *  holds: "#0" is not a rank, so a null is said in words rather than drawn. */
export interface Standing {
  scope: string;
  row: ChartRow | null;
}

/** the board's own noun, for "of 12 dancers" */
export const SEG_WORD: Record<ChartSegment, { one: string; many: string }> = {
  dancer: { one: "dancer", many: "dancers" },
  artist: { one: "artist", many: "artists" },
  studio: { one: "studio", many: "studios" },
  crew: { one: "crew", many: "crews" },
};

/** the line under a board row, in the board's own words (StatsScreen 693-700) */
export const chartRowWords = (r: ChartRow): string =>
  r.kind === "crew"
    ? `${r.extra} member${r.extra === 1 ? "" : "s"}`
    : r.kind === "studio"
      ? `${r.conducted} session${r.conducted === 1 ? "" : "s"} held · ${hoursWords(r.hours)} · ${r.extra} on the floor`
      : r.kind === "artist"
        ? `${r.conducted} taught · ${r.assisted} assisted · ${hoursWords(r.hours)}`
        : `${r.attended} danced · ${hoursWords(r.hours)}`;

/** HOW POINTS WORK (9660), minus the one line we cannot make true: a battle win
 *  is +10 in the prototype, and no table holds a score yet (Step 21 left
 *  scoring on the backlog), so it is absent here and said out loud on screen. */
export const POINT_RULES: Array<[string, string, string]> = [
  ["Session conducted", "+2 pts", "#F59E0B"],
  ["Session assisted", "+1.5 pts", "#0D9488"],
  ["Session attended", "+1 pt", "#3B82F6"],
  ["Every hour on the floor", "+0.5 pts", "#0D9488"],
];

/** ⚠ "Event entered · +3 pts" WAS THE FIRST LINE AND WENT WITH EVENTS (29 Sep
 *  2026). What a crew is scored on is its confirmed roster now — which is thin,
 *  and is said rather than padded: inventing a second term to make the card look
 *  fuller would be a classPerson about a formula nobody has decided. The board's own
 *  SQL loses the entry term in the same push that removes the rows. */
export const CREW_POINT_RULES: Array<[string, string, string]> = [["Confirmed member", "+1 pt", "#3B82F6"]];

/** "6 h 30" — hours as the record prints them */
export const hoursWords = (h: number): string => {
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return mins === 0 ? `${whole} h` : `${whole} h ${String(mins).padStart(2, "0")}`;
};
