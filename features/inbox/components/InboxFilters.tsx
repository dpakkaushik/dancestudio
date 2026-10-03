"use client";

import { useState, type ReactNode } from "react";
import { DOS_DISPLAY } from "@/lib/design/tokens";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { Portal } from "@/components/ui/Portal";
import { pressKey } from "./inbox-kit";

/* Discover's own two type styles (DiscoverFilters 32-33), so the two sheets read alike */
const micro: React.CSSProperties = { fontSize: 9.5, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase" };
const shelf: React.CSSProperties = { fontSize: 17, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1.2, fontFamily: DOS_DISPLAY };

/** FILTERS FOR THE INBOX'S CARDS, THE WAY DISCOVER FILTERS ITS SHELF (3 Oct 2026,
 *  the user: "filters for inbox cards like on discover").
 *
 *  Discover's anatomy, part for part: a search box; then a row of **Filters · N**
 *  beside the quick chips people actually reach for, and a Clear once anything is
 *  on; and behind Filters a sheet of labelled rows — SORT BY, TYPE, and STAGE (or
 *  OUTCOME on a Completed side) — closed by **Show results**.
 *
 *  ⚠ It is STATE, not the URL, unlike Discover's: Discover's filters change what
 *  the server reads, while the Inbox already holds every card it can draw, so a
 *  filter here is a narrowing of rows on screen and a round trip would buy
 *  nothing. ⚠ A row with one option or none is not offered (4827's own rule: a
 *  row is offered only where it means something). */

export type InboxSort = "new" | "old" | "value";

export interface InboxFilter {
  q: string;
  kinds: string[];
  stages: string[];
  sort: InboxSort;
}

export const NO_FILTER: InboxFilter = { q: "", kinds: [], stages: [], sort: "new" };

export const filterCount = (f: InboxFilter): number => (f.q.trim() ? 1 : 0) + f.kinds.length + f.stages.length + (f.sort !== "new" ? 1 : 0);

/** apply one filter to any list of cards, given how to read each card */
export function applyInboxFilter<T>(
  rows: T[],
  f: InboxFilter,
  read: { text: (r: T) => string; kind: (r: T) => string; stage: (r: T) => string; at: (r: T) => string; value?: (r: T) => number },
): T[] {
  const term = f.q.trim().toLowerCase();
  const out = rows
    .filter((r) => !term || read.text(r).toLowerCase().includes(term))
    .filter((r) => f.kinds.length === 0 || f.kinds.includes(read.kind(r)))
    .filter((r) => f.stages.length === 0 || f.stages.includes(read.stage(r)));
  const by = f.sort;
  return [...out].sort((a, b) =>
    by === "value" && read.value ? read.value(b) - read.value(a) : by === "old" ? read.at(a).localeCompare(read.at(b)) : read.at(b).localeCompare(read.at(a)),
  );
}

type Opt = readonly [string, string];

const chip = (on: boolean, dashed = false): React.CSSProperties => ({
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  height: 32,
  padding: "0 13px",
  borderRadius: 16,
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 11.5,
  boxSizing: "border-box",
  whiteSpace: "nowrap",
  background: on ? "var(--text)" : "transparent",
  color: on ? "var(--solid)" : "var(--sub)",
  border: `1.5px ${dashed ? "dashed" : "solid"} ${on ? "var(--text)" : "var(--el)"}`,
});

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ ...micro, color: "var(--muted)", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>{children}</div>
    </div>
  );
}

function FilterSheet({ onClose, children, onReset }: { onClose: () => void; children: ReactNode; onReset: () => void }) {
  useCloseOnBack(onClose);
  /* ⚠ PORTALLED, because the bar stands INSIDE the Inbox's InvertedPanel and
     `.dos-invert` swaps the palette for its whole subtree — so a sheet drawn in
     place opened in the OPPOSITE theme (found by screenshot, light theme). At the
     body it reads the page's own tokens, as Discover's sheet does. */
  return (
    <Portal>
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.62)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 660 }}>
      <div role="dialog" aria-modal="true" aria-label="Inbox filters" onClick={(e) => e.stopPropagation()} style={{ background: "var(--solid)", color: "var(--text)", borderRadius: "24px 24px 0 0", padding: "14px 16px 24px", width: "100%", maxWidth: 430, boxSizing: "border-box", maxHeight: "86vh", overflowY: "auto", animation: "dosSheetUp .28s cubic-bezier(.22,.9,.34,1)" }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 14px" }} />
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 16 }}>
          <span style={{ ...shelf, color: "var(--text)" }}>Filters</span>
          <span role="button" tabIndex={0} aria-label="Reset all" onKeyDown={pressKey(onReset)} onClick={onReset} style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 800, color: "var(--sub)", cursor: "pointer" }}>
            Reset all
          </span>
        </div>
        {children}
        <div role="button" tabIndex={0} aria-label="Show results" onKeyDown={pressKey(onClose)} onClick={onClose} style={{ marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", height: 48, borderRadius: 14, cursor: "pointer", fontWeight: 900, fontSize: 14, background: "var(--text)", color: "var(--solid)" }}>
          Show results
        </div>
      </div>
    </div>
    </Portal>
  );
}

export function InboxFilters({
  value,
  onChange,
  noun,
  kinds,
  stages,
  stageLabel = "STAGE",
  sorts,
  quickKinds = true,
}: {
  value: InboxFilter;
  onChange: (f: InboxFilter) => void;
  /** what is being searched — "enquiries", "requests", "invitations" */
  noun: string;
  /** the kinds the cards on this side can be, each with how many there are */
  kinds: ReadonlyArray<readonly [string, string, number]>;
  stages: ReadonlyArray<Opt>;
  stageLabel?: string;
  sorts: ReadonlyArray<readonly [InboxSort, string]>;
  /** the kinds as quick chips beside Filters (Discover's own quick row) */
  quickKinds?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const n = filterCount(value);
  const toggle = (list: string[], k: string) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);
  const liveKinds = kinds.filter(([, , c]) => c > 0);

  return (
    <div data-testid="inbox-filters" style={{ marginBottom: 6 }}>
      <div style={{ position: "relative" }}>
        <input
          value={value.q}
          aria-label={`Search ${noun}`}
          onChange={(e) => onChange({ ...value, q: e.target.value.slice(0, 60) })}
          placeholder={`Search ${noun}`}
          autoComplete="off"
          style={{ width: "100%", boxSizing: "border-box", background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 14, padding: "12px 40px 12px 16px", color: "var(--text)", fontSize: 13.5, outline: "none", fontFamily: "inherit" }}
        />
        {value.q ? (
          <span role="button" tabIndex={0} aria-label="Clear search" onKeyDown={pressKey(() => onChange({ ...value, q: "" }))} onClick={() => onChange({ ...value, q: "" })} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "var(--sub)", cursor: "pointer", fontWeight: 800, fontSize: 13 }}>
            ✕
          </span>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 7, alignItems: "center", padding: "10px 0 6px", overflowX: "auto", scrollbarWidth: "none" }}>
        <div role="button" tabIndex={0} aria-label="All filters" onKeyDown={pressKey(() => setOpen(true))} onClick={() => setOpen(true)} style={{ ...chip(n > 0), color: n > 0 ? "var(--solid)" : "var(--text)", gap: 6, padding: "0 12px" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M7 12h10M10 17h4" />
          </svg>
          Filters{n ? ` · ${n}` : ""}
        </div>
        {quickKinds && liveKinds.length > 1
          ? liveKinds.map(([k, l, c]) => {
              const on = value.kinds.includes(k);
              return (
                <div key={k} role="button" tabIndex={0} aria-pressed={on} aria-label={`${l} ${noun}`} onKeyDown={pressKey(() => onChange({ ...value, kinds: toggle(value.kinds, k) }))} onClick={() => onChange({ ...value, kinds: toggle(value.kinds, k) })} style={chip(on)}>
                  {l}
                  <span style={{ fontSize: 9.5, fontWeight: 700, opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>{c}</span>
                </div>
              );
            })
          : null}
        {value.stages.map((s) => {
          const l = stages.find(([k]) => k === s)?.[1] ?? s;
          return (
            <div key={`st-${s}`} role="button" tabIndex={0} aria-label={`Remove ${l}`} onKeyDown={pressKey(() => onChange({ ...value, stages: toggle(value.stages, s) }))} onClick={() => onChange({ ...value, stages: toggle(value.stages, s) })} style={chip(true)}>
              {l} <span aria-hidden="true">✕</span>
            </div>
          );
        })}
        {n ? (
          <div role="button" tabIndex={0} aria-label="Clear filters" onKeyDown={pressKey(() => onChange(NO_FILTER))} onClick={() => onChange(NO_FILTER)} style={{ ...chip(false, true), color: "var(--muted)" }}>
            Clear
          </div>
        ) : null}
      </div>

      {open ? (
        <FilterSheet onClose={() => setOpen(false)} onReset={() => onChange(NO_FILTER)}>
          {sorts.length > 1 ? (
            <Row label="SORT BY">
              {sorts.map(([k, l]) => (
                <div key={k} role="button" tabIndex={0} aria-pressed={value.sort === k} onKeyDown={pressKey(() => onChange({ ...value, sort: k }))} onClick={() => onChange({ ...value, sort: k })} style={chip(value.sort === k)}>
                  {l}
                </div>
              ))}
            </Row>
          ) : null}
          {kinds.length > 1 ? (
            <Row label="TYPE">
              {kinds.map(([k, l, c]) => (
                <div key={k} role="button" tabIndex={0} aria-pressed={value.kinds.includes(k)} onKeyDown={pressKey(() => onChange({ ...value, kinds: toggle(value.kinds, k) }))} onClick={() => onChange({ ...value, kinds: toggle(value.kinds, k) })} style={chip(value.kinds.includes(k))}>
                  {l}
                  <span style={{ fontSize: 9.5, fontWeight: 700, opacity: 0.75 }}>{c}</span>
                </div>
              ))}
            </Row>
          ) : null}
          {stages.length > 1 ? (
            <Row label={stageLabel}>
              {stages.map(([k, l]) => (
                <div key={k} role="button" tabIndex={0} aria-pressed={value.stages.includes(k)} onKeyDown={pressKey(() => onChange({ ...value, stages: toggle(value.stages, k) }))} onClick={() => onChange({ ...value, stages: toggle(value.stages, k) })} style={chip(value.stages.includes(k))}>
                  {l}
                </div>
              ))}
            </Row>
          ) : null}
        </FilterSheet>
      ) : null}
    </div>
  );
}
