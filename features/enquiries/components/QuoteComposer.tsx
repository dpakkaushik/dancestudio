"use client";

import { useState } from "react";
import { DOS_MONO, money } from "@/features/inbox/components/inbox-kit";
import type { QuoteItem } from "@/types/enquiry";

/** THE QUOTE COMPOSER — one form for a QUOTE and for an ADDITION (3 Oct 2026, the
 *  user: "send quote — should have item add name and quantity which gives price
 *  for the quote or full amount directly").
 *
 *  Two ways in, one switch: LINE ITEMS (a name, a whole quantity, a whole-rupee
 *  price each, up to 30 — the total is their sum, said under them as it is typed)
 *  or ONE TOTAL. A quote adds the advance and the last day it stands; an
 *  addition may be a REDUCTION — a line priced below zero, or a total marked as
 *  one — and the database refuses one that would go below what is already paid.
 *  ⚠ A revision starts FROM the quote it revises: typing a price again is how a
 *  quote drifts by a zero. */

export interface ComposerValue {
  items: Array<{ name: string; qty: number; unitInr: number }> | null;
  lumpInr: number | null;
  advancePct: number;
  validUntil: string | null;
  note: string | null;
}

type Line = { key: number; name: string; qty: string; unit: string };

const field: React.CSSProperties = {
  background: "var(--solid)",
  border: "1.5px solid var(--el)",
  borderRadius: 10,
  padding: "10px 11px",
  fontSize: 13,
  fontWeight: 700,
  color: "var(--text)",
  outline: "none",
  fontFamily: "inherit",
  minWidth: 0,
  boxSizing: "border-box",
};
const label: React.CSSProperties = { fontSize: 9, fontWeight: 900, letterSpacing: 0.7, color: "var(--muted)", marginBottom: 5 };
const btn: React.CSSProperties = { textAlign: "center", padding: 12, borderRadius: 999, fontWeight: 900, fontSize: 13, cursor: "pointer", border: "none", fontFamily: "inherit" };

/** add n days to a YYYY-MM-DD */
export const addDays = (key: string, n: number): string => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function QuoteComposer({
  mode,
  tint,
  todayKey,
  start,
  busy,
  error,
  submitWord,
  onSubmit,
  onCancel,
}: {
  mode: "quote" | "addition";
  tint: string;
  todayKey: string;
  /** what it opens with — a revision's previous lines, total and advance */
  start?: { items: QuoteItem[]; costInr: number; advancePct: number; note: string | null } | null;
  busy: boolean;
  error: string | null;
  submitWord: string;
  onSubmit: (v: ComposerValue) => void;
  onCancel: () => void;
}) {
  const fromItems = start?.items?.length
    ? start.items.map((i, n) => ({ key: n + 1, name: i.name, qty: String(i.qty), unit: String(i.unitInr) }))
    : null;
  const [byLines, setByLines] = useState<boolean>(start ? Boolean(fromItems) : true);
  const [lines, setLines] = useState<Line[]>(fromItems ?? [{ key: 1, name: "", qty: "1", unit: "" }]);
  const [nextKey, setNextKey] = useState((fromItems?.length ?? 1) + 1);
  const [lump, setLump] = useState(start && !fromItems ? String(Math.abs(start.costInr)) : "");
  const [reduction, setReduction] = useState(Boolean(start && start.costInr < 0 && !fromItems));
  const [adv, setAdv] = useState(String(start?.advancePct ?? 30));
  const [valid, setValid] = useState(addDays(todayKey, 7));
  const [note, setNote] = useState(start?.note ?? "");

  const allowMinus = mode === "addition";
  const num = (s: string) => (/^-?\d+$/.test(s.trim()) ? Number(s.trim()) : NaN);
  const parsed = lines.map((l) => ({ name: l.name.trim(), qty: num(l.qty), unitInr: num(l.unit) }));
  const linesOk = parsed.length > 0 && parsed.every((l) => l.name && Number.isInteger(l.qty) && l.qty >= 1 && l.qty <= 9999 && Number.isInteger(l.unitInr) && l.unitInr !== 0 && (allowMinus || l.unitInr > 0));
  const linesTotal = parsed.reduce((s, l) => s + (Number.isFinite(l.qty * l.unitInr) ? l.qty * l.unitInr : 0), 0);
  const lumpN = Number(lump) || 0;
  const total = byLines ? linesTotal : reduction ? -lumpN : lumpN;
  const advN = Number(adv);
  const advInr = mode === "quote" ? Math.round((total * advN) / 100) : 0;
  const ok =
    (byLines ? linesOk : lumpN > 0) &&
    (mode === "quote" ? total > 0 : total !== 0) &&
    (mode === "addition" || (valid >= todayKey && valid <= addDays(todayKey, 90)));
  const why = !ok
    ? byLines && !linesOk
      ? "Give every line a name, a quantity and a price"
      : !byLines && !lumpN
        ? "Type the amount"
        : mode === "quote" && total <= 0
          ? "A quote must come to more than ₹0"
          : mode === "quote"
            ? "Valid until a day from today to 90 days out"
            : "It comes to ₹0"
    : null;

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <div data-testid={`${mode}-composer`}>
      <div role="group" aria-label="How it is priced" style={{ display: "flex", gap: 6, marginBottom: 11 }}>
        {(
          [
            [true, "Line items"],
            [false, mode === "quote" ? "One total" : "One amount"],
          ] as Array<[boolean, string]>
        ).map(([v, w]) => (
          <button
            key={w}
            type="button"
            aria-pressed={byLines === v}
            onClick={() => setByLines(v)}
            style={{ ...btn, flex: 1, padding: "9px 6px", fontSize: 11.5, background: byLines === v ? "var(--text)" : "var(--el)", color: byLines === v ? "var(--solid)" : "var(--sub)" }}
          >
            {w}
          </button>
        ))}
      </div>

      {byLines ? (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 52px 88px 26px", gap: 6, ...label, marginBottom: 4 }}>
            <span>ITEM</span>
            <span>QTY</span>
            <span>PRICE ₹</span>
            <span />
          </div>
          {lines.map((l, i) => {
            const p = parsed[i];
            const lineTotal = p && Number.isFinite(p.qty * p.unitInr) && p.unitInr ? p.qty * p.unitInr : null;
            return (
              <div key={l.key} style={{ marginBottom: 7 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 52px 88px 26px", gap: 6, alignItems: "center" }}>
                  <input value={l.name} maxLength={80} onChange={(ev) => setLine(l.key, { name: ev.target.value })} placeholder={i === 0 ? "Choreography" : "Item"} aria-label={`Item ${i + 1} name`} style={field} />
                  <input value={l.qty} inputMode="numeric" onChange={(ev) => setLine(l.key, { qty: ev.target.value.replace(/[^\d]/g, "").slice(0, 4) })} aria-label={`Item ${i + 1} quantity`} style={{ ...field, fontFamily: DOS_MONO, padding: "10px 6px", textAlign: "center" }} />
                  <input
                    value={l.unit}
                    inputMode={allowMinus ? "text" : "numeric"}
                    onChange={(ev) => setLine(l.key, { unit: (allowMinus ? ev.target.value.replace(/[^\d-]/g, "").replace(/(?!^)-/g, "") : ev.target.value.replace(/[^\d]/g, "")).slice(0, 9) })}
                    placeholder={allowMinus ? "−500 off" : "5000"}
                    aria-label={`Item ${i + 1} price`}
                    style={{ ...field, fontFamily: DOS_MONO, padding: "10px 8px", textAlign: "right" }}
                  />
                  <button
                    type="button"
                    disabled={lines.length === 1}
                    aria-label={`Remove item ${i + 1}`}
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    style={{ width: 26, height: 26, borderRadius: 13, border: "none", background: "var(--el)", color: "var(--sub)", cursor: lines.length === 1 ? "default" : "pointer", opacity: lines.length === 1 ? 0.35 : 1, fontSize: 14, lineHeight: 1 }}
                  >
                    ×
                  </button>
                </div>
                {lineTotal != null && p.qty > 1 ? (
                  <div style={{ fontSize: 10, color: "var(--muted)", textAlign: "right", marginRight: 32, marginTop: 2 }}>
                    {p.qty} × {money(Math.abs(p.unitInr))} = {lineTotal < 0 ? "−" : ""}
                    {money(Math.abs(lineTotal))}
                  </div>
                ) : null}
              </div>
            );
          })}
          {lines.length < 30 ? (
            <button
              type="button"
              onClick={() => {
                setLines((ls) => [...ls, { key: nextKey, name: "", qty: "1", unit: "" }]);
                setNextKey((k) => k + 1);
              }}
              style={{ ...btn, width: "100%", padding: 9, fontSize: 12, background: "transparent", color: "var(--sub)", border: "1.5px dashed var(--el)", marginBottom: 10 }}
            >
              ＋ Add a line
            </button>
          ) : null}
        </div>
      ) : (
        <div style={{ marginBottom: 10 }}>
          <div style={label}>{mode === "quote" ? "PROJECT TOTAL" : reduction ? "AMOUNT OFF" : "AMOUNT TO ADD"}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 15, fontWeight: 900 }}>{reduction ? "−₹" : "₹"}</span>
            <input value={lump} inputMode="numeric" onChange={(ev) => setLump(ev.target.value.replace(/[^\d]/g, "").slice(0, 9))} placeholder="25000" aria-label={mode === "quote" ? "Project total" : "Amount"} style={{ ...field, flex: 1, fontFamily: DOS_MONO, fontSize: 14 }} />
          </div>
          {mode === "addition" ? (
            <button type="button" aria-pressed={reduction} onClick={() => setReduction((r) => !r)} style={{ ...btn, marginTop: 8, padding: "7px 12px", fontSize: 11, background: reduction ? "var(--text)" : "var(--el)", color: reduction ? "var(--solid)" : "var(--sub)" }}>
              {reduction ? "✓ It is a reduction" : "It is a reduction"}
            </button>
          ) : null}
        </div>
      )}

      {mode === "quote" ? (
        <>
          <div style={label}>ADVANCE BEFORE STARTING</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {["0", "30", "50", "100"].map((pc) => (
              <button
                key={pc}
                type="button"
                aria-pressed={adv === pc}
                aria-label={pc === "0" ? "No advance" : `${pc}% advance`}
                onClick={() => setAdv(pc)}
                style={{ ...btn, flex: 1, padding: "9px 3px", fontSize: 11, borderRadius: 10, background: adv === pc ? "var(--text)" : "var(--el)", color: adv === pc ? "var(--solid)" : "var(--sub)" }}
              >
                {pc === "0" ? "None" : `${pc}%`}
              </button>
            ))}
          </div>
          <div style={label}>VALID UNTIL</div>
          <input type="date" value={valid} min={todayKey} max={addDays(todayKey, 90)} onChange={(ev) => setValid(ev.target.value)} aria-label="Valid until" style={{ ...field, width: "100%", marginBottom: 10 }} />
        </>
      ) : null}

      <div style={label}>NOTE · OPTIONAL</div>
      <textarea value={note} maxLength={300} rows={2} onChange={(ev) => setNote(ev.target.value)} placeholder={mode === "quote" ? "What it covers, travel, timings…" : "What this adds or takes off"} aria-label="Note" style={{ ...field, width: "100%", resize: "vertical", marginBottom: 10, fontWeight: 600 }} />

      <div data-testid={`${mode}-composer-total`} style={{ background: "var(--solid)", borderRadius: 11, padding: "9px 11px", marginBottom: 9, borderLeft: `3px solid ${tint}` }}>
        {(
          [
            [mode === "quote" ? "Total" : total < 0 ? "Comes off the balance" : "Adds", `${total < 0 ? "−" : ""}${money(Math.abs(total))}`],
            ...(mode === "quote"
              ? ([
                  ["Advance", advInr ? `${money(advInr)} (${adv}%)` : "none"],
                  ["On completion", money(total - advInr)],
                ] as Array<[string, string]>)
              : []),
          ] as Array<[string, string]>
        ).map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "3px 0", fontSize: 12 }}>
            <span style={{ color: "var(--sub)" }}>{k}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>
      {error ? (
        <div role="alert" style={{ fontSize: 11.5, color: "#F87171", marginBottom: 8 }}>
          {error}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 7 }}>
        <button type="button" onClick={onCancel} style={{ ...btn, flex: 1, background: "var(--el)", color: "var(--sub)" }}>
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !ok}
          onClick={() =>
            onSubmit({
              items: byLines ? parsed.map((l) => ({ name: l.name, qty: l.qty, unitInr: l.unitInr })) : null,
              lumpInr: byLines ? null : reduction ? -lumpN : lumpN,
              advancePct: mode === "quote" ? advN : 0,
              validUntil: mode === "quote" ? valid : null,
              note: note.trim() || null,
            })
          }
          style={{ ...btn, flex: 1.6, background: "var(--text)", color: "var(--solid)", opacity: ok && !busy ? 1 : 0.5 }}
        >
          {why ?? submitWord}
        </button>
      </div>
    </div>
  );
}

/** a quote's or an addition's lines, as a small table with its total */
export function QuoteLines({ items, costInr }: { items: QuoteItem[]; costInr: number }) {
  if (!items.length) return null;
  return (
    <div data-testid="quote-lines" style={{ marginTop: 8, background: "var(--solid)", borderRadius: 11, padding: "6px 10px" }}>
      {items.map((i) => (
        <div key={i.sort} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "5px 0", borderBottom: "1px solid var(--el)", fontSize: 12 }}>
          <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{i.name}</span>
          <span style={{ color: "var(--muted)", fontFamily: DOS_MONO, fontSize: 11, whiteSpace: "nowrap" }}>
            {i.qty} × {i.unitInr < 0 ? "−" : ""}
            {money(Math.abs(i.unitInr))}
          </span>
          <b style={{ minWidth: 64, textAlign: "right", whiteSpace: "nowrap" }}>
            {i.lineInr < 0 ? "−" : ""}
            {money(Math.abs(i.lineInr))}
          </b>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 2px", fontSize: 12.5 }}>
        <span style={{ color: "var(--sub)", fontWeight: 800 }}>Total</span>
        <b>
          {costInr < 0 ? "−" : ""}
          {money(Math.abs(costInr))}
        </b>
      </div>
    </div>
  );
}
