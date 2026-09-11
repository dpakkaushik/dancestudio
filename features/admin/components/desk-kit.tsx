import Link from "next/link";
import type { ReactNode } from "react";
import { DOS_DISPLAY, INK, SUB } from "@/lib/design/tokens";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";

/** THE SHAPE EVERY DESK SHARES (11 Sep 2026) — the user's words: "inside of the
 *  tab should not look messy… at top should have dashboard showing numbers,
 *  there should be separate tabs for pending and approved, inside each tab also
 *  a dashboard at top, filters etc, counts."
 *
 *  So a desk is: a HERO that says what this is and the one number that matters;
 *  a STAT STRIP of figures, each a door where there is somewhere to go; TABS as
 *  blocks (not pills), each carrying its own count; a SEARCH for the tab; the
 *  LIST, never more than a page of it; and a PAGER. The list is the only part a
 *  desk draws itself. Everything is URL state — `?tab=&q=&page=` — so any view an
 *  admin is looking at has an address another admin can open.
 *
 *  These are server components with no state: a tab is a link, a search is a
 *  GET form, a page is a link. Nothing here needs JavaScript to be right. */

export const PAGE_SIZE = 25;

/** "?page=3" → 3; anything else → 1. A page is one-based because people count
 *  from one, and the maths below is the only place that has to know otherwise. */
export const pageOf = (raw: string | undefined): number => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
};

/** the slice of a list that page `page` shows */
export const sliceForPage = <T,>(rows: T[], page: number, size = PAGE_SIZE): T[] => rows.slice((page - 1) * size, page * size);

const qs = (params: Record<string, string | number | null | undefined>): string => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== "" && !(k === "page" && v === 1)) {
      p.set(k, String(v));
    }
  }
  const s = p.toString();
  return s ? `?${s}` : "";
};

export function DeskHero({ eyebrow, title, sub, tint, icon, right }: { eyebrow: string; title: string; sub: string; tint: string; icon?: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ borderRadius: 22, padding: "15px 17px 14px", marginBottom: 12, position: "relative", overflow: "hidden", color: "#fff", background: `linear-gradient(135deg, ${tint}cc, ${tint})` }}>
      <div style={{ position: "absolute", right: -28, top: -32, width: 130, height: 130, borderRadius: 65, background: "rgba(255,255,255,.13)" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
        {icon ? (
          <span style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 14, background: "rgba(0,0,0,.28)", border: "1.5px solid rgba(255,255,255,.35)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
            {icon}
          </span>
        ) : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, opacity: 0.85 }}>{eyebrow}</div>
          <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.5, fontFamily: DOS_DISPLAY, lineHeight: 1.18, marginTop: 2 }}>{title}</div>
          <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2 }}>{sub}</div>
        </div>
        {right}
      </div>
    </div>
  );
}

export interface StatFig {
  n: string | number;
  label: string;
  href?: string;
  tone?: string;
}

/** THE NUMBERS AT THE TOP. Three to a row, the figure at the size of a figure,
 *  a door when there is somewhere to go from it. */
export function StatStrip({ figs, cols = 3 }: { figs: StatFig[]; cols?: 2 | 3 | 4 }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 8, marginBottom: 12 }}>
      {figs.map((f) => {
        const body = (
          <>
            <span style={{ display: "block", fontSize: 21, fontWeight: 900, lineHeight: 1, letterSpacing: -0.6, fontFamily: DOS_DISPLAY, color: f.tone ?? INK, fontVariantNumeric: "tabular-nums" }}>{f.n}</span>
            <span style={{ display: "block", fontSize: 10, fontWeight: 700, color: MUTED, marginTop: 4, lineHeight: 1.3 }}>{f.label}</span>
          </>
        );
        const style: React.CSSProperties = { background: CARD, border: `1px solid ${EL}`, borderRadius: 14, padding: "11px 12px", textDecoration: "none", display: "block", minWidth: 0 };
        return f.href ? (
          <Link key={f.label} href={f.href} style={style}>
            {body}
          </Link>
        ) : (
          <div key={f.label} style={style}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

export interface DeskTab {
  key: string;
  label: string;
  count?: number;
  /** the colour the count wears when it is more than nothing */
  tone?: string;
}

/** TABS AS BLOCKS. Equal-width tiles, the label over its count, the open one on
 *  the ink — the same object Discover's section tabs are. Switching tabs resets
 *  the page, keeps the search: a search is about the person, a page is about
 *  where they were in a list that no longer exists. */
export function DeskTabs({ base, current, tabs, keep = {} }: { base: string; current: string; tabs: DeskTab[]; keep?: Record<string, string | null | undefined> }) {
  return (
    <div role="tablist" style={{ display: "flex", gap: 6, marginBottom: 12 }}>
      {tabs.map((t) => {
        const on = t.key === current;
        return (
          <Link
            key={t.key}
            role="tab"
            aria-selected={on}
            href={`${base}${qs({ ...keep, tab: t.key })}`}
            style={{ flex: 1, minWidth: 0, textAlign: "center", padding: "9px 4px 8px", borderRadius: 14, textDecoration: "none", background: on ? "var(--text)" : CARD, color: on ? "var(--solid)" : SUB, border: `1.5px solid ${on ? "var(--text)" : EL}` }}
          >
            <div style={{ fontSize: 11.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</div>
            {t.count !== undefined ? (
              <div style={{ fontSize: 12, fontWeight: 900, marginTop: 2, fontVariantNumeric: "tabular-nums", color: on ? "var(--solid)" : t.count > 0 && t.tone ? t.tone : SUB }}>{t.count}</div>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

/** A GET form: the search is the address, so it survives a reload, a back
 *  button, and being sent to somebody else. The hidden fields carry the tab. */
export function SearchBar({ action, q, placeholder, keep = {} }: { action: string; q: string; placeholder: string; keep?: Record<string, string | null | undefined> }) {
  return (
    <form action={action} method="get" role="search" style={{ display: "flex", gap: 6, marginBottom: 10 }}>
      {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <input
        type="search"
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        aria-label={placeholder}
        style={{ flex: 1, minWidth: 0, height: 38, boxSizing: "border-box", background: CARD, border: `1px solid ${EL}`, borderRadius: 12, padding: "0 12px", fontSize: 12.5, color: INK, fontFamily: "inherit" }}
      />
      <button type="submit" style={{ height: 38, padding: "0 14px", borderRadius: 12, border: "none", background: "var(--text)", color: "var(--solid)", fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
        Find
      </button>
      {q ? (
        <Link href={`${action}${qs({ ...keep })}`} aria-label="Clear the search" style={{ height: 38, padding: "0 12px", borderRadius: 12, border: `1px solid ${EL}`, background: CARD, color: SUB, fontSize: 11.5, fontWeight: 800, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
          ×
        </Link>
      ) : null}
    </form>
  );
}

/** "26–50 of 213" and the two doors. Drawn only when there is more than one page,
 *  because a pager on a list of four is furniture. */
export function Pager({ base, page, total, size = PAGE_SIZE, keep = {} }: { base: string; page: number; total: number; size?: number; keep?: Record<string, string | null | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) {
    return null;
  }
  const from = (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  const link = (p: number, label: string, enabled: boolean) =>
    enabled ? (
      <Link href={`${base}${qs({ ...keep, page: p })}`} style={{ height: 34, padding: "0 13px", borderRadius: 10, border: `1px solid ${EL}`, background: CARD, color: INK, fontSize: 11.5, fontWeight: 800, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
        {label}
      </Link>
    ) : (
      <span aria-disabled="true" style={{ height: 34, padding: "0 13px", borderRadius: 10, border: `1px solid ${EL}`, background: CARD, color: MUTED, fontSize: 11.5, fontWeight: 800, display: "inline-flex", alignItems: "center", opacity: 0.5 }}>
        {label}
      </span>
    );
  return (
    <nav aria-label="Pages" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
      {link(page - 1, "‹ Previous", page > 1)}
      <span style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: 800, color: SUB, fontVariantNumeric: "tabular-nums" }}>
        {from}–{to} of {total.toLocaleString("en-IN")} · page {page} of {pages}
      </span>
      {link(page + 1, "Next ›", page < pages)}
    </nav>
  );
}

/** the line above a list: how many, of what, after the filter */
export function CountLine({ shown, total, what, q }: { shown: number; total: number; what: string; q?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", fontSize: 10.5, color: SUB, marginBottom: 8, padding: "0 2px" }}>
      <span style={{ fontWeight: 800 }}>
        {total.toLocaleString("en-IN")} {what}
        {q ? <> matching &ldquo;{q}&rdquo;</> : null}
      </span>
      {total > shown ? <span style={{ color: MUTED }}>showing {shown}</span> : null}
    </div>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11.5, color: SUB, lineHeight: 1.55, padding: "10px 2px" }}>{children}</div>;
}
