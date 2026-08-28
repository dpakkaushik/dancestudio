import type { CSSProperties, ReactNode } from "react";
import { CARD, DOS_DISPLAY, DOS_UI, GOLD, GREEN, INK, LINE, MUTED, RED, SUB } from "@/lib/design/tokens";

/** The earnings screen's atoms, lifted from the prototype's S_earn
 *  (DanceOSApp.jsx:17877-18205): the green hero, the money card with its stacked
 *  bar and three tiles, the ledger block whose rows open into WHO, and the
 *  settlement row painted by state. Both sides of the ledger — the studio's and
 *  the teacher's — are the same screen in the prototype, so they are the same
 *  parts here. */

export const DOS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/** prototype dosToolPaint (BusinessHub already lifted this) */
const toolPaint = (c: string) => `linear-gradient(135deg,${c} 0%, ${c}cc 55%, ${c}80 100%)`;

export const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export const bizCard: CSSProperties = {
  background: CARD,
  border: `1px solid ${LINE}`,
  borderRadius: 18,
  padding: "13px 14px",
  marginBottom: 10,
};

/** A payout is painted by three states only — done, in transit, everything
 *  else (prototype 18196: GREEN / GOLD / RED). */
export const toneColour = (tone: "done" | "transit" | "held") =>
  tone === "done" ? GREEN : tone === "transit" ? GOLD : RED;

/** Deterministic per-row colour for the stacked bar. Module-level and pure —
 *  this repo's lint forbids doing drawing maths on a mutated closure during
 *  render (react-hooks/immutability, Step 10's lesson). */
const BAR_COLOURS = ["#3B82F6", "#0D9488", "#F59E0B", "#8E44AD", "#0EA5E9", "#DC2626"];
export const barColour = (index: number) => BAR_COLOURS[index % BAR_COLOURS.length];

export function EarnHero({ title, sub }: { title: string; sub?: string }) {
  return (
    <div
      style={{
        margin: "0 0 12px",
        borderRadius: 22,
        padding: "15px 17px 14px",
        background: toolPaint(GREEN),
        color: "#fff",
        position: "relative",
        overflow: "hidden",
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
      <div
        style={{
          fontSize: 21,
          fontWeight: 800,
          letterSpacing: -0.5,
          position: "relative",
          fontFamily: DOS_DISPLAY,
          lineHeight: 1.18,
        }}
      >
        {title}
      </div>
      {sub ? (
        <div style={{ fontSize: 10.5, marginTop: 3, position: "relative", opacity: 0.92 }}>{sub}</div>
      ) : null}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9.5,
        fontWeight: 900,
        letterSpacing: 0.9,
        color: MUTED,
        fontFamily: DOS_UI,
        margin: "4px 0 8px",
      }}
    >
      {children}
    </div>
  );
}

export interface BarSegment {
  label: string;
  value: number;
  colour: string;
}

/** The bar is built FROM the rows rather than restating them — the prototype
 *  makes a point of this (17994: a hardcoded legend drew one ledger's colours
 *  under another ledger's labels). */
export function StackedBar({ segments }: { segments: BarSegment[] }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total <= 0) return null;
  return (
    <>
      <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", marginTop: 11 }}>
        {segments.map((s) => (
          <div key={s.label} style={{ width: `${(100 * s.value) / total}%`, background: s.colour }} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 7 }}>
        {segments.map((s) => (
          <span
            key={s.label}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, fontWeight: 800, color: SUB }}
          >
            <span style={{ width: 7, height: 7, borderRadius: 2, background: s.colour }} />
            {s.label} {Math.round((100 * s.value) / total)}%
          </span>
        ))}
      </div>
    </>
  );
}

/** The three tiles under the headline figure, "counted, not guessed" (18049) —
 *  every one of them is summed from the rows on the same screen. */
export function Tiles({ tiles }: { tiles: Array<[string, string, string]> }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
      {tiles.map(([value, label, colour]) => (
        <div
          key={label}
          style={{
            background: LINE,
            borderRadius: 12,
            padding: "9px 6px",
            textAlign: "center",
            borderTop: `3px solid ${colour}`,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: DOS_MONO }}>{value}</div>
          <div
            style={{
              fontSize: 8.5,
              fontWeight: 800,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: SUB,
              marginTop: 2,
            }}
          >
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The headline card: label, big mono figure, the sentence about how the money
 *  moves, then the bar and the tiles (prototype 17987-18055). */
export function MoneyCard({
  label,
  amount,
  note,
  badge,
  segments,
  tiles,
}: {
  label: string;
  amount: number;
  note: string;
  /** rides the baseline beside the figure — the ▲/▼ vs-last-month pill (17996) */
  badge?: ReactNode;
  segments?: BarSegment[];
  tiles?: Array<[string, string, string]>;
}) {
  return (
    <div
      style={{
        background: CARD,
        border: `1px solid ${LINE}`,
        borderLeft: `4px solid ${GREEN}`,
        borderRadius: 18,
        padding: "14px 15px",
        margin: "0 0 10px",
      }}
    >
      <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: MUTED, fontFamily: DOS_UI }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
        <span style={{ fontSize: 29, fontWeight: 700, letterSpacing: -0.8, fontFamily: DOS_MONO }}>
          {money(amount)}
        </span>
        {badge ?? null}
      </div>
      <div style={{ fontSize: 10.5, color: SUB, marginTop: 3 }}>{note}</div>
      {segments ? <StackedBar segments={segments} /> : null}
      {tiles ? <Tiles tiles={tiles} /> : null}
    </div>
  );
}

export interface LedgerPerson {
  key: string;
  label: string;
  meta: string;
  status: string;
  statusColour?: string;
}

export interface LedgerRow {
  key: string;
  label: string;
  amount: number;
  colour: string;
  people: LedgerPerson[];
}

/** The ledger: one bar per row against the biggest row, and the row you opened
 *  spells out WHO (prototype 18143-18170). */
export function LedgerBlock({
  rows,
  openKey,
  onToggle,
  whoLabel,
}: {
  rows: LedgerRow[];
  openKey: string | null;
  onToggle: (key: string) => void;
  whoLabel: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  const total = Math.max(1, rows.reduce((a, r) => a + r.amount, 0));
  return (
    <div
      style={{
        background: CARD,
        border: `1px solid ${LINE}`,
        borderRadius: 16,
        padding: "12px 14px",
        marginBottom: 10,
      }}
    >
      {rows.map((row, i) => {
        const open = openKey === row.key;
        return (
          <div key={row.key} style={{ marginBottom: i === rows.length - 1 && !open ? 0 : 11 }}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onToggle(row.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle(row.key);
                }
              }}
              style={{ cursor: "pointer" }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  fontWeight: 800,
                  marginBottom: 4,
                }}
              >
                <span>{row.label}</span>
                <span style={{ color: SUB, fontFamily: DOS_MONO, fontSize: 11 }}>
                  {money(row.amount)} · {Math.round((100 * row.amount) / total)}%
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: LINE }}>
                <div
                  style={{
                    height: 6,
                    borderRadius: 3,
                    width: `${Math.round((100 * row.amount) / max)}%`,
                    background: `linear-gradient(90deg,${row.colour},${row.colour}88)`,
                  }}
                />
              </div>
            </div>
            {open ? (
              <div style={{ marginTop: 11, paddingTop: 10, borderTop: `1px solid ${LINE}` }}>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 900,
                    letterSpacing: 0.8,
                    color: MUTED,
                    marginBottom: 6,
                  }}
                >
                  {whoLabel} — {row.label.toUpperCase()}
                </div>
                {row.people.length === 0 ? (
                  <div style={{ fontSize: 11.5, color: SUB, padding: "4px 0" }}>Nothing yet.</div>
                ) : (
                  row.people.map((p) => (
                    <div
                      key={p.key}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        fontSize: 11.5,
                        padding: "4px 0",
                        borderBottom: `1px solid ${LINE}`,
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 800,
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.label}
                      </span>
                      <span style={{ color: SUB, flexShrink: 0 }}>{p.meta}</span>
                      <b style={{ color: p.statusColour ?? GREEN, flexShrink: 0 }}>{p.status}</b>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** A settlement row, painted down its left edge by state (prototype 18196). */
export function SettlementRow({
  title,
  meta,
  amount,
  tone,
  onOpen,
}: {
  title: string;
  meta: string;
  amount: number;
  tone: "done" | "transit" | "held";
  onOpen?: () => void;
}) {
  const colour = toneColour(tone);
  return (
    <div
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
      style={{
        background: CARD,
        border: `1px solid ${LINE}`,
        borderLeft: `3px solid ${colour}`,
        borderRadius: 14,
        padding: "11px 13px",
        marginBottom: 8,
        display: "flex",
        alignItems: "center",
        gap: 10,
        cursor: onOpen ? "pointer" : undefined,
        color: INK,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 10.5, color: SUB, marginTop: 1 }}>{meta}</div>
      </div>
      <b style={{ fontSize: 13, color: colour }}>{money(amount)}</b>
    </div>
  );
}
