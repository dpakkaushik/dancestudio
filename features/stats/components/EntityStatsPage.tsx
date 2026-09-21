import Link from "next/link";
import { CARD, DOS_DISPLAY, DOS_UI, INK, LILAC, LINE, MUTED, SUB } from "@/lib/design/tokens";
import { CREW_POINT_RULES, POINT_RULES, SIDE_TINT, hoursWords, type ChartRow, type ChartSegment, type DanceStats } from "@/types/stats";

/** SOMEBODY ELSE'S RECORD AND RANK (push 2, 19 Sep 2026 — the user: "stats page
 *  on any profile should show all stats for that particular profile and rankings
 *  as well"). Until today the Stats chip on another's page opened the BOARD they
 *  stand on; this page is THEIR row on it: their figures, their place, the
 *  population it is out of — nationally, and in their city — and, for a person,
 *  the three sides of their record. One page for four kinds of profile
 *  (`/person|studio|org|crew/{id}/stats`), because it is one question.
 *
 *  What it stands on: `entity_chart_row` (definer, aggregate-only — a name, a
 *  place and some counts, the shape `dance_chart` has always handed out; a
 *  stranger gets a public artist's, a listed studio's, a live crew's and nobody
 *  else's) and, for a person, `person_dance_stats`. An organization has no
 *  board of its own — its standing is its studios', so its page is a row per
 *  studio. Step 25's rules hold: a place is never printed without its
 *  denominator, and "not on the board yet" is said rather than "#0". */

const SEG_WORD: Record<ChartSegment, { one: string; many: string }> = {
  dancer: { one: "dancer", many: "dancers" },
  artist: { one: "artist", many: "artists" },
  studio: { one: "studio", many: "studios" },
  crew: { one: "crew", many: "crews" },
};

const micro: React.CSSProperties = { fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase" };
const figure: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace', fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: -0.3 };

export interface Standing {
  /** "Everywhere" or "In Pune" */
  scope: string;
  row: ChartRow | null;
}

/** the line under a board row — the board's own words (StatsScreen 693-700) */
const lineOf = (r: ChartRow): string =>
  r.kind === "crew"
    ? `${r.conducted} event${r.conducted === 1 ? "" : "s"} entered · ${r.extra} member${r.extra === 1 ? "" : "s"}`
    : r.kind === "studio"
      ? `${r.conducted} session${r.conducted === 1 ? "" : "s"} held · ${hoursWords(r.hours)} · ${r.extra} on the floor`
      : r.kind === "artist"
        ? `${r.conducted} taught · ${r.assisted} assisted · ${hoursWords(r.hours)}`
        : `${r.attended} danced · ${hoursWords(r.hours)}`;

function StandingCard({ s, segment, accent }: { s: Standing; segment: ChartSegment; accent: string }) {
  const r = s.row;
  return (
    <div style={{ background: CARD, border: `1.5px solid ${LINE}`, borderLeft: `4px solid ${accent}`, borderRadius: 16, padding: "12px 14px", marginBottom: 8 }} data-testid="standing-card">
      <div style={{ ...micro, color: MUTED }}>{s.scope}</div>
      {r ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
          <span aria-label={`Place ${r.place} of ${r.population}`} style={{ display: "flex", alignItems: "baseline", gap: 1, lineHeight: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 900, fontFamily: DOS_DISPLAY, color: accent, opacity: 0.8 }}>#</span>
            <span style={{ fontSize: 30, fontWeight: 900, letterSpacing: -1, fontFamily: DOS_DISPLAY, fontVariantNumeric: "tabular-nums", background: "linear-gradient(120deg,#7C3AED,#EC4899)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{r.place}</span>
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 12.5, fontWeight: 800 }}>
              of {r.population} {r.population === 1 ? SEG_WORD[segment].one : SEG_WORD[segment].many}
            </span>
            <span style={{ display: "block", fontSize: 10.5, color: SUB, marginTop: 2 }}>{lineOf(r)}</span>
          </span>
          <span style={{ textAlign: "right", flexShrink: 0 }}>
            <span style={{ display: "block", ...figure, fontSize: 15 }}>{r.points}</span>
            <span style={{ display: "block", fontSize: 9, fontWeight: 700, color: MUTED }}>pts</span>
          </span>
        </div>
      ) : (
        /* "#0" is not a rank (Step 25) — an empty shelf is said, not drawn */
        <div style={{ fontSize: 12, color: SUB, marginTop: 6, lineHeight: 1.45 }}>Not on this board yet — nothing counted here so far.</div>
      )}
    </div>
  );
}

export function EntityStatsPage({
  name,
  eyebrow,
  segment,
  accent,
  backHref,
  standings,
  stats = null,
  studios = null,
}: {
  name: string;
  /** the kind's word over the name — Artist · Dancer · Studio · Crew · Organization */
  eyebrow: string;
  segment: ChartSegment;
  accent: string;
  /** the page this record belongs to */
  backHref: string;
  /** the entity's own rows — nationally, then in its city; empty for an organization */
  standings: Standing[];
  /** a person's three sides — the record behind the row */
  stats?: DanceStats | null;
  /** an organization's standing is its studios' */
  studios?: Array<{ id: string; name: string; row: ChartRow | null }> | null;
}) {
  const rules = segment === "crew" ? CREW_POINT_RULES : POINT_RULES;
  const sides: Array<[string, number, number, string]> | null = stats
    ? [
        ["Classes taught", stats.sessionsConducted, stats.hoursConducted, SIDE_TINT.conducted],
        ["Assisted on", stats.sessionsAssisted, stats.hoursAssisted, SIDE_TINT.assisted],
        ["Classes taken", stats.sessionsAttended, stats.hoursAttended, SIDE_TINT.attended],
      ]
    : null;
  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "0 16px 40px", boxSizing: "border-box", position: "relative" }}>
      {/* the wash off the entity's colour, dying into the page — the record's own dress (9862) */}
      <div aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 200, pointerEvents: "none", background: `linear-gradient(180deg, ${accent}55 0%, ${accent}18 50%, transparent 100%)` }} />
      <div style={{ position: "relative", padding: "18px 2px 0" }}>
        <div style={{ ...micro, color: SUB }}>{eyebrow} · Stats</div>
        <h1 style={{ margin: "6px 0 0", fontSize: 26, fontWeight: 900, letterSpacing: -1, lineHeight: 1.05, fontFamily: DOS_DISPLAY, overflowWrap: "anywhere" }}>{name}</h1>
        <Link href={backHref} aria-label={`Back to ${name}`} style={{ display: "inline-block", marginTop: 8, fontSize: 11, fontWeight: 800, color: SUB, textDecoration: "none" }}>
          ‹ Back to the page
        </Link>
      </div>

      {sides ? (
        <div style={{ position: "relative", marginTop: 18 }}>
          <div style={{ ...micro, color: MUTED, marginBottom: 8 }}>The record</div>
          <div style={{ display: "flex", gap: 8 }}>
            {sides.map(([label, n, h, col]) => (
              <div key={label} style={{ flex: 1, background: CARD, border: `1.5px solid ${LINE}`, borderTop: `3px solid ${col}`, borderRadius: 14, padding: "10px 8px", textAlign: "center" }}>
                <div style={{ ...figure, fontSize: 18, fontFamily: DOS_DISPLAY, fontWeight: 900 }}>{n}</div>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", color: SUB, marginTop: 2 }}>{label}</div>
                <div style={{ fontSize: 9.5, color: MUTED, marginTop: 3 }}>{hoursWords(h)}</div>
              </div>
            ))}
          </div>
          {/* a booking nobody marked is not a session danced (Step 25) */}
          <div style={{ fontSize: 10.5, color: MUTED, marginTop: 8, lineHeight: 1.45 }}>Sessions that have ended, and check-ins that were marked — a booking nobody marked is not counted.</div>
        </div>
      ) : null}

      {standings.length ? (
        <div style={{ position: "relative", marginTop: 18 }}>
          <div style={{ ...micro, color: MUTED, marginBottom: 8 }}>Where {name} stands · {SEG_WORD[segment].many}</div>
          {standings.map((s) => (
            <StandingCard key={s.scope} s={s} segment={segment} accent={accent} />
          ))}
        </div>
      ) : null}

      {studios ? (
        <div style={{ position: "relative", marginTop: 18 }}>
          <div style={{ ...micro, color: MUTED, marginBottom: 8 }}>Its studios on the board</div>
          {studios.length === 0 ? <div style={{ fontSize: 12, color: SUB }}>No studio on Discover yet, so nothing is ranked.</div> : null}
          {studios.map((s) => (
            <Link key={s.id} href={`/studio/${s.id}/stats`} aria-label={`${s.name} — its record and rank`} style={{ display: "flex", alignItems: "center", gap: 10, background: CARD, border: `1.5px solid ${LINE}`, borderRadius: 14, padding: "10px 12px", marginBottom: 7, color: INK, textDecoration: "none" }}>
              <span style={{ ...figure, fontSize: 17, fontFamily: DOS_DISPLAY, fontWeight: 900, width: 34, textAlign: "center", flexShrink: 0, color: s.row ? INK : MUTED }}>{s.row ? `#${s.row.place}` : "—"}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                <span style={{ display: "block", fontSize: 10, color: SUB, marginTop: 1 }}>{s.row ? `of ${s.row.population} studios · ${lineOf(s.row)}` : "Not on the studio board yet"}</span>
              </span>
              {s.row ? (
                <span style={{ textAlign: "right", flexShrink: 0 }}>
                  <span style={{ display: "block", ...figure, fontSize: 13 }}>{s.row.points}</span>
                  <span style={{ display: "block", fontSize: 9, fontWeight: 700, color: MUTED }}>pts</span>
                </span>
              ) : null}
              <span aria-hidden="true" style={{ color: MUTED }}>›</span>
            </Link>
          ))}
        </div>
      ) : null}

      <div style={{ position: "relative", marginTop: 18, background: CARD, border: `1.5px solid ${LINE}`, borderRadius: 16, padding: "12px 14px" }}>
        <div style={{ ...micro, color: MUTED, marginBottom: 6 }}>How points work</div>
        {rules.map(([what, pts, col]) => (
          <div key={what} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: col, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{what}</span>
            <b style={figure}>{pts}</b>
          </div>
        ))}
        {/* the line the prototype's card claims and this app cannot make true (Step 25) */}
        <div style={{ fontSize: 10.5, color: MUTED, marginTop: 6, lineHeight: 1.45 }}>Counted live. A battle win is not counted yet — no score is recorded anywhere.</div>
      </div>

      <Link href={`/stats?tab=charts&seg=${segment}`} aria-label={`Open the ${SEG_WORD[segment].many} board`} style={{ position: "relative", display: "block", marginTop: 14, textAlign: "center", padding: "12px", borderRadius: 12, background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 12.5, textDecoration: "none" }}>
        See the whole {SEG_WORD[segment].many} board ›
      </Link>
    </div>
  );
}
