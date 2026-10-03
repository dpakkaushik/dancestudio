import { stageTint } from "@/features/enquiries/components/enquiry-kit";
import { ENQ_STAGES, ENQ_STAGE_WORD, ENQ_TINT, type Enquiry, type EnquiryStatus, type EnquiryTypeKey } from "@/types/enquiry";
import { DOS_MONO, EnqIcon, moneyShort } from "./inbox-kit";

/** THE BREAKUP (3 Oct 2026, the user: "pipeline breakup name change to Breakup
 *  by stage and total written better").
 *
 *  It was "Pipeline breakup" with the total as a grey "₹1.2L total" squeezed to
 *  the right of its own title, and BY STAGE as a column of dotted rows — a word,
 *  a count and a sum — that read like a ledger nobody asked for. Now:
 *  * **the total leads**, at the size of a figure, with how many enquiries make
 *    it, so the one number the card exists for is the first thing read;
 *  * **by type** keeps its bars, which already worked;
 *  * **by stage** is ONE bar split into the stages in the order an enquiry
 *    travels, each in its own colour (`stageTint`, the colour the card's own
 *    road uses), with a legend under it of chips — stage, count, value — so the
 *    proportion is seen before it is read.
 *  It stands in the Inbox's middle squircle, so it draws no card of its own: a
 *  card inside a card is a box for the sake of a box. */
export function Breakup({
  rows,
  byType,
  sum,
  stageOf,
  first,
}: {
  rows: Enquiry[];
  byType: Array<{ k: EnquiryTypeKey; label: string; rows: Enquiry[] }>;
  sum: (a: Enquiry[]) => number;
  stageOf: (e: Enquiry) => EnquiryStatus;
  /** true when nothing stands above it in the squircle (no figures on Completed) */
  first: boolean;
}) {
  const total = sum(rows);
  const maxType = Math.max(...byType.map((y) => sum(y.rows)), 1);
  const stages = ENQ_STAGES.map((s) => ({ s, rows: rows.filter((e) => stageOf(e) === s) })).filter((x) => x.rows.length);
  const cap = { fontSize: 9, fontWeight: 900, letterSpacing: 0.8, color: "var(--muted)" } as const;

  return (
    <div data-testid="pipeline-breakup" style={{ marginTop: first ? 0 : 14, paddingTop: first ? 0 : 14, borderTop: first ? "none" : "1.5px solid var(--el)" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900, letterSpacing: -0.2, color: "var(--text)" }}>Breakup</h2>
        <div style={{ textAlign: "right" }}>
          <div data-testid="breakup-total" style={{ fontFamily: DOS_MONO, fontSize: 21, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1, color: "var(--text)" }}>
            {moneyShort(total)}
          </div>
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--sub)", marginTop: 4 }}>
            Total · {rows.length} {rows.length === 1 ? "enquiry" : "enquiries"}
          </div>
        </div>
      </div>

      <div style={{ ...cap, margin: "14px 0 8px" }}>BY TYPE</div>
      {byType.map((x) => {
        const v = sum(x.rows);
        return (
          <div key={x.k} style={{ marginBottom: 9 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <EnqIcon k={x.k} size={13} color={ENQ_TINT[x.k]} />
              <span style={{ flex: 1, fontSize: 11.5, fontWeight: 800 }}>{x.label}</span>
              <span style={{ fontFamily: DOS_MONO, fontSize: 10.5, color: "var(--sub)" }}>{x.rows.length}</span>
              <span style={{ fontFamily: DOS_MONO, fontSize: 11, fontWeight: 600, width: 52, textAlign: "right" }}>{moneyShort(v)}</span>
            </div>
            <div style={{ height: 5, borderRadius: 3, background: "var(--el)" }}>
              <div style={{ height: 5, borderRadius: 3, width: `${Math.round((100 * v) / maxType)}%`, background: ENQ_TINT[x.k] }} />
            </div>
          </div>
        );
      })}

      <div style={{ ...cap, margin: "14px 0 8px" }}>BY STAGE</div>
      {/* one bar, split by how many enquiries stand at each stage */}
      <div aria-hidden="true" style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", gap: 2, background: "var(--el)" }}>
        {stages.map((x) => (
          <div key={x.s} style={{ flex: x.rows.length, background: stageTint(x.s) }} />
        ))}
      </div>
      <div data-testid="breakup-stages" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
        {stages.map((x) => (
          <div
            key={x.s}
            aria-label={`${ENQ_STAGE_WORD[x.s]}: ${x.rows.length}, ${moneyShort(sum(x.rows))}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999, background: "var(--solid)", border: "1.5px solid var(--el)", fontSize: 11 }}
          >
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: stageTint(x.s), flexShrink: 0 }} />
            <span style={{ fontWeight: 800, color: "var(--text)" }}>{ENQ_STAGE_WORD[x.s]}</span>
            <span style={{ fontFamily: DOS_MONO, color: "var(--muted)" }}>{x.rows.length}</span>
            <b style={{ fontFamily: DOS_MONO, fontWeight: 600 }}>{moneyShort(sum(x.rows))}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
