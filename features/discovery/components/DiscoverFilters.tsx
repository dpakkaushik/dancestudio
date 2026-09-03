"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { searchEverythingAction } from "@/features/discovery/server-actions/search";
import { gradientOf } from "@/features/profiles/components/PublicProfile";
import { dosStyleColor } from "@/lib/constants/styles";
import { DOS_DISPLAY } from "@/lib/design/tokens";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import type { SearchHit, SearchKind } from "@/repositories/search";
import { CATS, filtersOnCount, filtersToParams, type DiscoverFilters, type Dist, type Dur, type Fmt, type PriceBand, type SortBy, type When } from "../filters";
import { EvIcon } from "@/features/events/components/event-kit";
import { EV_TINT, type EventCat } from "@/types/event";

/** Step 23's controls, lifted from prototype S_discover: the one search box
 *  ("Search" — "the placeholder listed the same five things a third time",
 *  4539) with its bifurcated dropdown (4545-4575: Studios · Artists · Crews ·
 *  Events, three each, "No matches anywhere on DanceOS."); THE STYLE RAIL — the
 *  app's one style tile in three rows (4596-4620); the Filters button that
 *  shrank to its own width beside the two or three quick chips people actually
 *  reach for (4655-4696); and THE FILTER SHEET (4827-4890) — everything that
 *  narrows a list on one surface, rows only offered when they mean something,
 *  and every chip applies LIVE (4844-4849: a chip sets the state it names, the
 *  list behind the sheet has already changed by the time it closes).
 *  State is the URL: every change replaces the address and the server page
 *  re-filters, so BACK returns to the same list (the prototype's
 *  __DOSDISCOVERSTATE, 4427). */

const micro: React.CSSProperties = { fontSize: 9.5, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase" };
const shelf: React.CSSProperties = { fontSize: 17, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1.2, fontFamily: DOS_DISPLAY };
const toolPaint = (c: string) => `linear-gradient(135deg,${c} 0%, ${c}cc 55%, ${c}80 100%)`;
const pressKey = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};
const KIND_LABEL: Record<SearchKind, string> = { studio: "Studios", artist: "Artists", crew: "Crews", event: "Events", person: "People" };
/* the prototype's own order, with Dancers last (4548-4552). People arrived once
   there was a page to send them to — Step 23 left the section out for exactly
   that reason. */
const KIND_ORDER: SearchKind[] = ["studio", "artist", "crew", "event", "person"];
const KEYFRAMES = "@keyframes dosPop{0%{transform:scale(1)}35%{transform:scale(1.08)}65%{transform:scale(.97)}100%{transform:scale(1)}}@keyframes dosSheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}";

/* the sheet's chip and row (4834-4842) — module-level, so they are not remade on every render */
const chip = (on: boolean): React.CSSProperties => ({ padding: "9px 13px", borderRadius: 11, cursor: "pointer", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", boxSizing: "border-box", WebkitTapHighlightColor: "transparent", background: on ? "var(--text)" : "var(--card)", color: on ? "var(--solid)" : "var(--text)", border: `1px solid ${on ? "var(--text)" : "var(--el)"}` });
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ ...micro, color: "var(--muted)", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

/** DosStyleTile (1754): the style's whole name in white on a tile of its own colour; the ring marks the one you picked */
export function DosStyleTile({ label, color, on, tap, aria, small }: { label: string; color: string; on?: boolean; tap?: () => void; aria?: string; small?: boolean }) {
  return (
    <span
      role={tap ? "button" : undefined}
      tabIndex={tap ? 0 : undefined}
      onKeyDown={tap ? pressKey(tap) : undefined}
      aria-label={aria ?? label}
      aria-pressed={on === undefined ? undefined : Boolean(on)}
      onClick={tap}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxSizing: "border-box", background: toolPaint(color), border: `1px solid ${color}`, borderRadius: 10, padding: small ? "6px 11px" : "7px 13px", cursor: tap ? "pointer" : "default", WebkitTapHighlightColor: "transparent", transition: "box-shadow .15s", boxShadow: on ? `0 0 0 2px var(--bg), 0 0 0 3.5px ${color}` : "0 1px 3px rgba(0,0,0,.22)" }}
    >
      <span style={{ fontSize: small ? 11.5 : 12.5, fontWeight: 800, letterSpacing: -0.2, fontFamily: DOS_DISPLAY, lineHeight: 1.1, whiteSpace: "nowrap", color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,.25)" }}>
        {label}
        {on ? " ✓" : ""}
      </span>
    </span>
  );
}

export function DiscoverFilters({ tab, city, filters, styleOrder, tabs }: { tab: string; city: string; filters: DiscoverFilters; styleOrder: string[]; tabs?: React.ReactNode }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [searchOn, setSearchOn] = useState(false);
  const [answer, setAnswer] = useState<{ term: string; hits: SearchHit[] }>({ term: "", hits: [] });
  const [open, setOpen] = useState(false);
  const [tapped, setTapped] = useState<string | null>(null);
  /* system back closes the filter sheet, exactly as its scrim does — the URL is
     left alone, so the filters themselves are untouched by a back press here */
  useCloseOnBack(() => setOpen(false), open);
  const term = q.trim();

  useEffect(() => {
    if (term.length < 2) return;
    let live = true;
    const t = setTimeout(async () => {
      const out = await searchEverythingAction({ term });
      if (live) setAnswer({ term, hits: out.hits });
    }, 220);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [term]);
  const hits = answer.term === term ? answer.hits : [];
  const searching = term.length >= 2 && answer.term !== term;

  const go = (next: DiscoverFilters) => {
    const p = new URLSearchParams({ city, tab, ...filtersToParams(next) });
    router.replace(`/discover?${p.toString()}`, { scroll: false });
  };
  const toggleStyle = (s: string) => {
    setTapped(s);
    setTimeout(() => setTapped(null), 450);
    go({ ...filters, styles: s === "All" ? [] : filters.styles.includes(s) ? filters.styles.filter((x) => x !== s) : [...filters.styles, s] });
  };
  const reset = () => go({ ...filters, sort: "near", dist: "any", when: "any", dur: "any", prices: [], cats: [], fmt: "all" });

  const isEv = tab === "events";
  const isBiz = tab === "studios" || tab === "artists";
  const onN = filtersOnCount(filters, tab);
  const freeOn = filters.prices.length === 1 && filters.prices[0] === "free";
  const battlesOn = filters.cats.length === 1 && filters.cats[0] === "battle";
  const quick: Array<[string, string, boolean, () => void]> = [
    ["free", "Free", freeOn, () => go({ ...filters, prices: freeOn ? [] : ["free"] })],
    ["eve", "Evening", filters.when === "evening", () => go({ ...filters, when: filters.when === "evening" ? "any" : "evening" })],
    ...(isEv
      ? ([["battle", "Battles", battlesOn, () => go({ ...filters, cats: battlesOn ? [] : ["battle"] })]] as Array<[string, string, boolean, () => void]>)
      : ([["near", "Near me", filters.dist === "5", () => go({ ...filters, dist: filters.dist === "5" ? "any" : "5" })]] as Array<[string, string, boolean, () => void]>)),
  ];

  /* the sheet's chips apply live (4844-4849); "Show results" only closes it (4874) */
  const pick =<T extends string>(opts: Array<[T, string]>, val: T, set: (v: T) => void) =>
    opts.map(([v, l]) => (
      <div role="button" tabIndex={0} onKeyDown={pressKey(() => set(v))} key={v} aria-pressed={val === v} aria-label={l} onClick={() => set(v)} style={chip(val === v)}>
        {l}
      </div>
    ));
  const multi = <T extends string>(opts: Array<[T, string]>, val: T[], set: (v: T[]) => void) =>
    opts.map(([v, l]) => {
      const on = val.includes(v);
      const flip = () => set(on ? val.filter((x) => x !== v) : [...val, v]);
      return (
        <div role="button" tabIndex={0} onKeyDown={pressKey(flip)} key={v} aria-pressed={on} aria-label={l} onClick={flip} style={chip(on)}>
          {l}
        </div>
      );
    });

  return (
    <>
      <style>{KEYFRAMES}</style>
      {/* the global search box: everything, in sections (4535) */}
      <div style={{ position: "relative", margin: "12px 0 4px" }}>
        <input
          value={q}
          aria-label="Search DanceOS"
          onChange={(e) => setQ(e.target.value.slice(0, 60))}
          onFocus={() => setSearchOn(true)}
          onBlur={() => setTimeout(() => setSearchOn(false), 180)}
          placeholder="Search"
          autoComplete="off"
          style={{ width: "100%", boxSizing: "border-box", background: "var(--card)", border: "1px solid var(--el)", borderRadius: 14, padding: "13px 40px 13px 16px", color: "var(--text)", fontSize: 13.5, outline: "none", fontFamily: "inherit" }}
        />
        {q ? (
          <span role="button" tabIndex={0} aria-label="Clear search" onKeyDown={pressKey(() => setQ(""))} onClick={() => setQ("")} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "var(--sub)", cursor: "pointer", fontWeight: 800, fontSize: 13 }}>
            ✕
          </span>
        ) : null}
        {searchOn && term.length >= 2 ? (
          <div role="listbox" aria-label="Search results" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 400, background: "var(--solid)", border: "1px solid var(--el)", borderRadius: 16, maxHeight: 340, overflowY: "auto", boxShadow: "0 14px 40px rgba(0,0,0,.5)" }}>
            {searching && hits.length === 0 ? <div style={{ padding: "18px 14px", fontSize: 12.5, color: "var(--sub)", textAlign: "center" }}>Searching…</div> : null}
            {!searching && hits.length === 0 ? <div style={{ padding: "18px 14px", fontSize: 12.5, color: "var(--sub)", textAlign: "center" }}>No matches anywhere on DanceOS.</div> : null}
            {KIND_ORDER.filter((k) => hits.some((h) => h.kind === k)).map((k) => (
              <div key={k}>
                <div style={{ ...micro, color: "var(--muted)", padding: "10px 14px 4px" }}>{KIND_LABEL[k]}</div>
                {hits
                  .filter((h) => h.kind === k)
                  .map((h) => {
                    const g = gradientOf(h.name);
                    return (
                      <Link key={h.id} href={h.href} role="option" aria-label={`${h.name} — ${h.sub}`} onMouseDown={(e) => e.preventDefault()} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", cursor: "pointer", color: "var(--text)", textDecoration: "none" }}>
                        <span style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, background: `linear-gradient(135deg,${g[0]},${g[1]})`, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 12 }}>{h.name[0]}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
                          <span style={{ display: "block", fontSize: 11, color: "var(--sub)" }}>{h.sub}</span>
                        </span>
                        <span style={{ color: "var(--sub)", fontSize: 12 }}>›</span>
                      </Link>
                    );
                  })}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* the five section tabs — the page hands them in, so they sit under the search box as they do in the prototype (4571) */}
      {tabs}

      {/* THE STYLE RAIL — the app's one style tile, in three rows (4596) */}
      <div style={{ overflowX: "auto", scrollbarWidth: "none", padding: "9px 7px 8px", margin: "0 -7px" }}>
        {[0, 1, 2].map((rw) => (
          <div key={rw} style={{ display: "flex", gap: 7, width: "max-content", marginTop: rw ? 7 : 0 }}>
            {["All", ...styleOrder]
              .filter((_, ri) => ri % 3 === rw)
              .map((s) => {
                const active = s === "All" ? filters.styles.length === 0 : filters.styles.includes(s);
                return (
                  <span key={s} style={{ display: "inline-flex", flexShrink: 0, animation: tapped === s ? "dosPop .45s ease" : "none" }}>
                    <DosStyleTile label={s} color={s === "All" ? "#5AC8FA" : dosStyleColor(s)} on={active} tap={() => toggleStyle(s)} aria={s === "All" ? "All styles" : s} />
                  </span>
                );
              })}
          </div>
        ))}
      </div>

      {/* Filters · N, then the two or three quick chips (4655-4696) */}
      <div style={{ display: "flex", gap: 7, alignItems: "center", padding: "2px 0 10px", overflowX: "auto", scrollbarWidth: "none" }}>
        <div
          role="button"
          tabIndex={0}
          onKeyDown={pressKey(() => setOpen(true))}
          aria-label="All filters"
          onClick={() => setOpen(true)}
          style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 16, cursor: "pointer", fontWeight: 800, fontSize: 11.5, boxSizing: "border-box", background: onN ? "var(--text)" : "var(--card)", color: onN ? "var(--solid)" : "var(--text)", border: `1px solid ${onN ? "var(--text)" : "var(--el)"}` }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M7 12h10M10 17h4" />
          </svg>
          Filters{onN ? ` · ${onN}` : ""}
        </div>
        {quick.map(([k, label, on, fn]) => (
          <div role="button" tabIndex={0} onKeyDown={pressKey(fn)} key={k} aria-label={label} aria-pressed={on} onClick={fn} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", height: 32, padding: "0 13px", borderRadius: 16, cursor: "pointer", fontWeight: 800, fontSize: 11.5, boxSizing: "border-box", background: on ? "var(--text)" : "transparent", color: on ? "var(--solid)" : "var(--sub)", border: `1px solid ${on ? "var(--text)" : "var(--el)"}` }}>
            {label}
          </div>
        ))}
        {onN ? (
          <div role="button" tabIndex={0} onKeyDown={pressKey(reset)} aria-label="Clear filters" onClick={reset} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", height: 32, padding: "0 12px", borderRadius: 16, cursor: "pointer", fontWeight: 800, fontSize: 11.5, background: "transparent", border: "1px dashed var(--el)", color: "var(--muted)" }}>
            Clear
          </div>
        ) : null}
      </div>

      {/* the events tab's own box (S_eventslist 13551): title, style or organiser */}
      {isEv ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--card)", border: "1px solid var(--el)", borderRadius: 12, padding: "9px 11px", marginBottom: 10 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
          <input
            defaultValue={filters.q}
            aria-label="Search events"
            onChange={(e) => {
              const v = e.target.value.slice(0, 60);
              window.clearTimeout((window as unknown as { __dosEvQ?: number }).__dosEvQ);
              (window as unknown as { __dosEvQ?: number }).__dosEvQ = window.setTimeout(() => go({ ...filters, q: v }), 300);
            }}
            placeholder="Search events, styles or organisers…"
            style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: "var(--text)", fontSize: 12.5, fontFamily: "inherit" }}
          />
        </div>
      ) : null}

      {/* THE FILTER SHEET (4827) */}
      {open ? (
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.62)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 660 }}>
          <div role="dialog" aria-modal="true" aria-label="Filters" onClick={(e) => e.stopPropagation()} style={{ background: "var(--solid)", color: "var(--text)", borderRadius: "24px 24px 0 0", padding: "14px 16px 24px", width: "100%", maxWidth: 430, boxSizing: "border-box", maxHeight: "86vh", overflowY: "auto", animation: "dosSheetUp .28s cubic-bezier(.22,.9,.34,1)" }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 14px" }} />
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 16 }}>
              <span style={{ ...shelf, color: "var(--text)" }}>Filters</span>
              <span role="button" tabIndex={0} aria-label="Reset all" onKeyDown={pressKey(reset)} onClick={reset} style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 800, color: "var(--sub)", cursor: "pointer" }}>
                Reset all
              </span>
            </div>
            <Row label="SORT BY">{pick<SortBy>([["near", "Nearest"], ["soon", "Earliest"], ["price", "Cheapest"]], filters.sort, (v) => go({ ...filters, sort: v }))}</Row>
            {isBiz ? <Row label="DISTANCE">{pick<Dist>([["any", "Any"], ["2", "Within 2 km"], ["5", "Within 5 km"], ["10", "Within 10 km"]], filters.dist, (v) => go({ ...filters, dist: v }))}</Row> : null}
            {!isBiz && tab !== "crews" ? <Row label="TIME OF DAY">{pick<When>([["any", "Any"], ["morning", "Morning"], ["afternoon", "Afternoon"], ["evening", "Evening"]], filters.when, (v) => go({ ...filters, when: v }))}</Row> : null}
            {tab === "classes" ? <Row label="DURATION">{pick<Dur>([["any", "Any"], ["60", "Up to 1 h"], ["90", "Up to 1½ h"], ["120", "Up to 2 h"]], filters.dur, (v) => go({ ...filters, dur: v }))}</Row> : null}
            {!isBiz && tab !== "crews" ? <Row label="PRICE">{multi<PriceBand>([["free", "Free"], ["paid", "Paid"]], filters.prices, (v) => go({ ...filters, prices: v }))}</Row> : null}
            {isEv ? (
              <Row label="TYPE OF EVENT">
                {CATS.map((k) => {
                  const on = filters.cats.includes(k);
                  const l = k === "showcase" ? "Showcases" : k === "battle" ? "Battles" : "Tournaments";
                  const flip = () => go({ ...filters, cats: on ? filters.cats.filter((x) => x !== k) : [...filters.cats, k] });
                  return (
                    <div role="button" tabIndex={0} onKeyDown={pressKey(flip)} key={k} aria-pressed={on} aria-label={l} onClick={flip} style={{ ...chip(on), display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <EvIcon cat={k as EventCat} size={12} color={on ? "var(--solid)" : EV_TINT[k as EventCat]} sw={2} />
                      {l}
                    </div>
                  );
                })}
              </Row>
            ) : null}
            {isEv ? <Row label="COMPETING AS">{pick<Fmt>([["all", "Any"], ["solo", "Solo"], ["duo", "Duet"], ["crew", "Crew"]], filters.fmt, (v) => go({ ...filters, fmt: v }))}</Row> : null}
            <div
              role="button"
              tabIndex={0}
              onKeyDown={pressKey(() => setOpen(false))}
              aria-label="Show results"
              onClick={() => setOpen(false)}
              style={{ marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", height: 48, borderRadius: 14, cursor: "pointer", fontWeight: 900, fontSize: 14, background: "var(--text)", color: "var(--solid)" }}
            >
              Show results
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
