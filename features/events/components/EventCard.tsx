import Link from "next/link";
import { PosterBlock, dosPosterAuto } from "@/features/classes/components/poster";
import { DOS_DISPLAY, DOS_UI } from "@/lib/design/tokens";
import {
  EV_TINT,
  TYPE_LABEL,
  entriesOf,
  entryCapacityOf,
  entryLabelOf,
  eventPriceLabel,
  seatCapacityOf,
  seatsSoldOf,
  type DanceEvent,
} from "@/types/event";
import { EvFormatIcon, EvIcon, eventTimeWords, eventWhen } from "./event-kit";

const DOS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/** THE EVENT CARD, lifted from the prototype (2800-2925): "a class takes the
 *  colour of its dance style, so an event takes the colour of its KIND and wears
 *  it as a filled cap across the top of the card" — the kind said loudly with
 *  its mark, the format riding beside it with its own, the poster, the date and
 *  the price, the title, the venue, and TWO BARS, TWO AUDIENCES, ONE ROW: how
 *  full the floor is and how full the seats are, both read the same way. One
 *  card for Discover, the desk and the event page itself. */
export function EventCard({ event: e, href, compact = false }: { event: DanceEvent; href?: string; compact?: boolean }) {
  const tint = EV_TINT[e.cat];
  const price = eventPriceLabel(e);
  const isFree = price === "Free";
  const fmt = entryLabelOf(e);
  const size = compact ? 68 : 80;
  const bars: Array<[string, number, number, string]> = [
    ["Participants", entriesOf(e), entryCapacityOf(e), tint],
    ["Spectators", seatsSoldOf(e), seatCapacityOf(e), "#3B82F6"],
  ];
  const body = (
    <>
      {/* the cap: what kind of event this is, said loudly, in its own colour */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 11px", background: `${tint}1f`, borderBottom: `1.5px solid ${tint}55` }}>
        <span style={{ width: 26, height: 26, borderRadius: 9, flexShrink: 0, background: tint, color: "#0B0910", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <EvIcon cat={e.cat} size={17} color="#0B0910" sw={2} />
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: 0.6, color: tint, textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {TYPE_LABEL[e.cat]}
        </span>
        {fmt ? (
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0, padding: "3px 9px 3px 6px", borderRadius: 999, background: "var(--solid)" }}>
            <EvFormatIcon fmt={e.entryTiers.length === 3 ? "all" : e.entryTiers.length === 1 ? e.entryTiers[0].format : "all"} size={14} color="var(--sub)" />
            <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.3, color: "var(--sub)" }}>{fmt}</span>
          </span>
        ) : null}
      </div>
      <div style={{ padding: "8px 11px 10px", display: "flex", gap: 10, alignItems: "stretch" }}>
        <div style={{ position: "relative", flexShrink: 0, lineHeight: 0 }}>
          <span style={{ lineHeight: 0, display: "block", borderRadius: 0, boxShadow: "0 6px 14px -3px rgba(0,0,0,.7)" }}>
            <PosterBlock size={size} design={e.poster ?? dosPosterAuto(e.title)} item={{ title: e.title, style: e.style, styleColor: tint }} />
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 10.5, fontWeight: 700, color: "var(--muted)", fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span style={{ color: "var(--sub)", fontWeight: 800 }}>{eventWhen(e.startDate, e.endDate)}</span>
              {"  "}
              {eventTimeWords(e.startTime)}
            </span>
            <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 800, fontFamily: DOS_MONO, letterSpacing: -0.3, color: isFree ? "#22C55E" : tint }}>{price}</span>
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 800, letterSpacing: -0.4, lineHeight: 1.15, marginTop: 2, fontFamily: DOS_DISPLAY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {e.title}
          </div>
          <div style={{ fontSize: 9.5, color: "var(--sub)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {e.venue}
            {e.city ? ` · ${e.city}` : ""}
          </div>
          {/* how full each side is — the question anybody reading a listing is actually asking */}
          <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 6 }}>
            {bars.map(([l, now, max, c]) => {
              const pct = max ? Math.min(100, Math.round((100 * now) / max)) : 0;
              return (
                <div key={l} style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                    <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: 0.3, color: "var(--muted)", textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l}</span>
                    <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 9.5, fontWeight: 800, fontFamily: DOS_MONO, fontVariantNumeric: "tabular-nums", color: max && pct >= 100 ? "#F87171" : "var(--sub)" }}>
                      {now}/{max || 0}
                    </span>
                  </div>
                  <div style={{ height: 3.5, borderRadius: 2, background: "var(--el)", marginTop: 2.5, overflow: "hidden" }}>
                    <div style={{ height: 3.5, borderRadius: 2, width: `${max ? pct : 0}%`, background: c }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {e.status !== "published" ? (
        <div style={{ padding: "0 12px 11px" }}>
          <span style={{ display: "inline-flex", fontSize: 9, fontWeight: 900, padding: "4px 9px", borderRadius: 999, background: `${tint}1e`, color: tint, fontFamily: DOS_UI }}>
            {e.status === "draft" ? "Draft" : "Completed"}
          </span>
        </div>
      ) : null}
    </>
  );
  const style: React.CSSProperties = {
    display: "block",
    background: "var(--card)",
    border: "1px solid var(--el)",
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 9,
    boxShadow: "0 1px 3px rgba(0,0,0,.25)",
    color: "var(--text)",
    textDecoration: "none",
    fontFamily: DOS_UI,
  };
  return href ? (
    <Link href={href} aria-label={`${e.title} — ${TYPE_LABEL[e.cat]}`} style={{ ...style, cursor: "pointer" }}>
      {body}
    </Link>
  ) : (
    <div aria-label={`${e.title} — ${TYPE_LABEL[e.cat]}`} style={style}>
      {body}
    </div>
  );
}
