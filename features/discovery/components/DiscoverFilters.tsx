"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { searchEverythingAction } from "@/features/discovery/server-actions/search";
import { gradientOf } from "@/features/profiles/components/profile-kit";
import { photoUrl } from "@/lib/media/photo";
import { dosStyleColor } from "@/lib/constants/styles";
import { dosToolPaint } from "@/lib/format/styleInk";
import { STYLE_FAMILIES, styleInfo, stylesOfFamilies } from "@/lib/constants/styleInfo";
import { DOS_DISPLAY } from "@/lib/design/tokens";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import type { SearchHit, SearchKind } from "@/repositories/search";
import { ALL_CITIES, SORTS_FOR, filtersOnCount, filtersToParams, isPricedTab, type DiscoverFilters, type Dist, type Dur, type SortBy, type When } from "../filters";
import { PriceRange } from "./PriceRange";

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
/* the one tool paint (2 Oct 2026) — never a local copy */
const toolPaint = dosToolPaint;
const pressKey = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};
const KIND_LABEL: Record<SearchKind, string> = { studio: "Studios", artist: "Artists", crew: "Crews", person: "People" };
/* the prototype's own order, with Dancers last (4548-4552). People arrived once
   there was a page to send them to — Step 23 left the section out for exactly
   that reason. ⚠ Events went the other way on 29 Sep 2026: the page they sent
   somebody to stopped existing. */
const KIND_ORDER: SearchKind[] = ["studio", "artist", "crew", "person"];
const KEYFRAMES = "@keyframes dosPop{0%{transform:scale(1)}35%{transform:scale(1.08)}65%{transform:scale(.97)}100%{transform:scale(1)}}@keyframes dosSheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}";

/* the sheet's chip and row (4834-4842) — module-level, so they are not remade on every render */
const chip = (on: boolean): React.CSSProperties => ({ padding: "9px 13px", borderRadius: 11, cursor: "pointer", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", boxSizing: "border-box", WebkitTapHighlightColor: "transparent", background: on ? "var(--text)" : "var(--card)", color: on ? "var(--solid)" : "var(--text)", border: `1.5px solid ${on ? "var(--text)" : "var(--el)"}` });
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
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxSizing: "border-box", background: toolPaint(color), border: `1.5px solid ${color}`, borderRadius: 10, padding: small ? "6px 11px" : "7px 13px", cursor: tap ? "pointer" : "default", WebkitTapHighlightColor: "transparent", transition: "box-shadow .15s", boxShadow: on ? `0 0 0 2px var(--bg), 0 0 0 3.5px ${color}` : "0 1px 3px rgba(0,0,0,.22)" }}
    >
      <span style={{ fontSize: small ? 11.5 : 12.5, fontWeight: 800, letterSpacing: -0.2, fontFamily: DOS_DISPLAY, lineHeight: 1.1, whiteSpace: "nowrap", color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,.25)" }}>
        {label}
        {on ? " ✓" : ""}
      </span>
    </span>
  );
}

export function DiscoverFilters({ tab, city, filters, styleOrder, tabs, as = null, priceCeil = 500 }: { tab: string; city: string; filters: DiscoverFilters; styleOrder: string[]; tabs?: React.ReactNode; /** ⚠ WHICH PROFILE IS READING THIS SHELF — carried through every href this control builds (27 Sep 2026). Dropping it on a style tap would have quietly restored the Book button a studio is not supposed to have: the gate is only as durable as the least careful link on the page. */ as?: string | null; /** the price bar's right end — the dearest class in this city, worked out by the page (10 Oct 2026) */ priceCeil?: number }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [searchOn, setSearchOn] = useState(false);
  const [answer, setAnswer] = useState<{ term: string; hits: SearchHit[] }>({ term: "", hits: [] });
  const [open, setOpen] = useState(false);
  const [tapped, setTapped] = useState<string | null>(null);
  /* system back closes the filter sheet, exactly as its scrim does — the URL is
     left alone, so the filters themselves are untouched by a back press here.
     `spend: false`: "Show results" closes the sheet AND replaces the URL in one
     tick, and the replace lands on the sheet's own entry — so the filtered list
     becomes that entry, and back from it is the unfiltered list (19 Sep 2026) */
  useCloseOnBack(() => setOpen(false), open, { spend: false });
  const term = q.trim();

  /* ⚠ THE CITY IS A PASSENGER, NOT AN INPUT (30 Sep 2026). It rides along for
     the LOG alone — the search itself is national — so it is read through a ref
     at send time rather than listed as a dependency: as a dependency it would
     claim the results depend on it, and a city change with a term still in the
     box would fire a SECOND identical query on the app's most-visited public
     surface. ⚠ Synced in its own effect, because this repo's lint forbids a ref
     write during render (react-hooks/refs). */
  const cityRef = useRef(city);
  useEffect(() => {
    cityRef.current = city;
  }, [city]);

  useEffect(() => {
    if (term.length < 2) return;
    let live = true;
    const t = setTimeout(async () => {
      /* `search_events.city` is what makes a zero-result row answerable
         ("nobody in Pune can find salsa") rather than merely sad */
      /* ⚠ "all" (Discover's All cities) is not a city, so the log is told none */
      const out = await searchEverythingAction({ term, city: cityRef.current === ALL_CITIES ? "" : cityRef.current });
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
    const p = new URLSearchParams({ city, tab, ...filtersToParams(next), ...(as ? { as } : {}) });
    router.replace(`/discover?${p.toString()}`, { scroll: false });
  };
  const toggleStyle = (s: string) => {
    setTapped(s);
    setTimeout(() => setTapped(null), 450);
    go({ ...filters, styles: s === "All" ? [] : filters.styles.includes(s) ? filters.styles.filter((x) => x !== s) : [...filters.styles, s] });
  };
  /* ⚠ PICKING A FAMILY DROPS ANY PICKED STYLE OUTSIDE IT (2 Oct 2026), so the
     sheet can never hold "Latin" and "Kathak" at once — the style list below
     only offers the family's own styles, and the two agree by construction */
  const toggleFam = (fam: string) => {
    const fams = filters.fams.includes(fam) ? filters.fams.filter((x) => x !== fam) : [...filters.fams, fam];
    const inFams = new Set(stylesOfFamilies(fams));
    go({ ...filters, fams, styles: fams.length ? filters.styles.filter((s) => inFams.has(s)) : filters.styles });
  };
  const reset = () => go({ ...filters, styles: [], fams: [], has: false, sort: "near", dist: "any", when: "any", dur: "any", prices: [], pmin: null, pmax: null });

  const isStyles = tab === "styles";
  const onN = filtersOnCount(filters, tab);
  /* ⚠ FREE IS THE PRICE BAR AT ₹0 now (10 Oct 2026) — the quick chip and the bar
     are one control in two shapes, so they can never disagree. An old link's
     `price=free` still reads as on, and pressing the chip clears it too. */
  const oldFree = filters.prices.length === 1 && filters.prices[0] === "free";
  const freeOn = filters.pmax === 0 || oldFree;
  const flipFree = () => go({ ...filters, prices: [], pmin: null, pmax: freeOn ? null : 0 });
  /* the styles the sheet offers: the picked families' own, or all of them */
  const offered = filters.fams.length ? styleOrder.filter((s) => filters.fams.includes(styleInfo(s).family)) : styleOrder;
  /* ⚠ THE THIRD CHIP WAS "BATTLES" ON THE EVENTS TAB (29 Sep 2026) — the one
     quick filter that was not shared, and the only place `tab` decided which
     chips these were. With events gone every tab gets the same three. ⚠ The
     Styles tab has its own one (2 Oct 2026): just the styles taught here. */
  /* ⚠⚠ QUICK FILTERS THAT DO SOMETHING ON THE TAB THEY ARE ON (2 Oct 2026, the
     user: "better quick filters on discover besides the main filter"). The same
     three chips — Free · Evening · Within 5 km — sat on every tab, and on most
     of them two did nothing: a studio, an artist and a crew have no price or
     clock, and only the Studios shelf is measured, so pressing them changed
     nothing and read as broken (the prototype's own rule, 4456: a filter that
     cannot be evaluated stands aside — which is why it must not be OFFERED).
     Each tab offers the chips its own list answers to, and every tab then
     offers the dance FAMILIES people reach for, one tap each.
     ⚠ "WITHIN 5 KM", NOT "NEAR ME" (21 Sep 2026) is kept: a radius is named as
     a radius, and the place chip above is where the distance is measured FROM. */
  const flipWhen = (w: When) => go({ ...filters, when: filters.when === w ? "any" : w });
  const flipDist = (d: Dist) => go({ ...filters, dist: filters.dist === d ? "any" : d });
  const flipSort = (s: SortBy) => go({ ...filters, sort: filters.sort === s ? "near" : s });
  const quick: Array<[string, string, boolean, () => void]> = isStyles
    ? [
        ["has", city === ALL_CITIES ? "With classes" : `Classes in ${city}`, filters.has, () => go({ ...filters, has: !filters.has })],
        ["popular", "Most classes", filters.sort === "popular", () => flipSort("popular")],
        ["az", "A–Z", filters.sort === "az", () => flipSort("az")],
      ]
    : tab === "classes"
      ? [
          ["free", "Free", freeOn, flipFree],
          ["soon", "Starting soon", filters.sort === "soon", () => flipSort("soon")],
          ["morn", "Morning", filters.when === "morning", () => flipWhen("morning")],
          ["eve", "Evening", filters.when === "evening", () => flipWhen("evening")],
          ["short", "Under 1 hr", filters.dur === "60", () => go({ ...filters, dur: filters.dur === "60" ? "any" : "60" })],
        ]
      : tab === "studios"
        ? [
            ["d2", "Within 2 km", filters.dist === "2", () => flipDist("2")],
            ["near", "Within 5 km", filters.dist === "5", () => flipDist("5")],
            ["popular", "Most followed", filters.sort === "popular", () => flipSort("popular")],
          ]
        : tab === "artists"
          ? [["popular", "Most followed", filters.sort === "popular", () => flipSort("popular")]]
          : tab === "crews"
            ? [
                ["popular", "Most followed", filters.sort === "popular", () => flipSort("popular")],
                ["members", "Most members", filters.sort === "members", () => flipSort("members")],
              ]
            : [];
  /* the families, one tap each — a picked one leaves this row and becomes its
     removable pill below, so it is never shown twice */
  const QUICK_FAMS: Array<[string, string]> = [
    ["Indian classical", "Classical"],
    ["Bollywood", "Bollywood"],
    ["Street", "Hip-hop & street"],
    ["Indian folk", "Folk"],
    ["Latin", "Latin"],
    ["Fitness & open", "Fitness"],
  ];
  const quickFams = QUICK_FAMS.filter(([f]) => STYLE_FAMILIES.includes(f) && !filters.fams.includes(f));

  /* the sheet's chips apply live (4844-4849); "Show results" only closes it (4874) */
  const pick =<T extends string>(opts: Array<[T, string]>, val: T, set: (v: T) => void) =>
    opts.map(([v, l]) => (
      <div role="button" tabIndex={0} onKeyDown={pressKey(() => set(v))} key={v} aria-pressed={val === v} aria-label={l} onClick={() => set(v)} style={chip(val === v)}>
        {l}
      </div>
    ));
  /* `aria` names a chip apart from a same-worded one elsewhere in the sheet —
     "Bollywood" is a FAMILY and a STYLE, and two controls may not answer to one
     name (2 Oct 2026, found by the e2e's strict locator) */
  const multi = <T extends string>(opts: Array<[T, string]>, val: T[], set: (v: T[]) => void, aria?: (l: string) => string) =>
    opts.map(([v, l]) => {
      const on = val.includes(v);
      const flip = () => set(on ? val.filter((x) => x !== v) : [...val, v]);
      return (
        <div role="button" tabIndex={0} onKeyDown={pressKey(flip)} key={v} aria-pressed={on} aria-label={aria ? aria(l) : l} onClick={flip} style={chip(on)}>
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
          style={{ width: "100%", boxSizing: "border-box", background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 14, padding: "13px 40px 13px 16px", color: "var(--text)", fontSize: 13.5, outline: "none", fontFamily: "inherit" }}
        />
        {q ? (
          <span role="button" tabIndex={0} aria-label="Clear search" onKeyDown={pressKey(() => setQ(""))} onClick={() => setQ("")} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "var(--sub)", cursor: "pointer", fontWeight: 800, fontSize: 13 }}>
            ✕
          </span>
        ) : null}
        {searchOn && term.length >= 2 ? (
          <div role="listbox" aria-label="Search results" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 400, background: "var(--solid)", border: "1.5px solid var(--el)", borderRadius: 16, maxHeight: 340, overflowY: "auto", boxShadow: "0 14px 40px rgba(0,0,0,.5)" }}>
            {searching && hits.length === 0 ? <div style={{ padding: "18px 14px", fontSize: 12.5, color: "var(--sub)", textAlign: "center" }}>Searching…</div> : null}
            {!searching && hits.length === 0 ? <div style={{ padding: "18px 14px", fontSize: 12.5, color: "var(--sub)", textAlign: "center" }}>No matches anywhere on DanceOS.</div> : null}
            {KIND_ORDER.filter((k) => hits.some((h) => h.kind === k)).map((k) => (
              <div key={k}>
                <div style={{ ...micro, color: "var(--muted)", padding: "10px 14px 4px" }}>{KIND_LABEL[k]}</div>
                {hits
                  .filter((h) => h.kind === k)
                  .map((h) => {
                    const g = gradientOf(h.name);
                    /* ⚠ THE PICTURE, WHERE THERE IS ONE (20 Sep 2026, the user:
                       "search on discover should also show photo and name
                       similarly"). The row drew one initial on a gradient; the
                       follow list has drawn the real face since 19 Sep, and a
                       search result and a follow row are the same account. The
                       initials are the fallback, not the design — two letters,
                       the way every other people row in the app sets them. */
                    const face = photoUrl(h.photoPath);
                    const initials = h.name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
                    return (
                      <Link key={h.id} href={h.href} role="option" aria-label={`${h.name} — ${h.sub}`} onMouseDown={(e) => e.preventDefault()} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", cursor: "pointer", color: "var(--text)", textDecoration: "none" }}>
                        <span style={{ width: 34, height: 34, borderRadius: 11, flexShrink: 0, overflow: "hidden", background: `linear-gradient(135deg,${g[0]},${g[1]})`, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 12 }}>
                          {face ? <Image src={face} alt="" width={34} height={34} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : initials}
                        </span>
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

      {/* ⚠⚠ THE STYLE RAIL MOVED INTO THE SHEET (2 Oct 2026, the user: "dance
          styles inside filter on discover for studios, artist crews, classes and
          styles. family for dance style in filters as well. also add filters on
          style section on discover"). Three rows of 49 tiles stood between the
          tabs and the shelf on every tab; they are the sheet's DANCE STYLES row
          now, under FAMILY, and what is picked rides the row below as a pill
          you can take off — a filter you cannot see is a list that looks broken.
          ⚠ The Styles tab has filters at last: its shelf can be narrowed by
          family, by style and to the styles taught in this city, and ordered. */}

      {/* Filters · N, the quick chips (4655-4696), then whatever is picked */}
      <div style={{ display: "flex", gap: 7, alignItems: "center", padding: "10px 0 10px", overflowX: "auto", scrollbarWidth: "none" }}>
        <div
          role="button"
          tabIndex={0}
          onKeyDown={pressKey(() => setOpen(true))}
          aria-label="All filters"
          onClick={() => setOpen(true)}
          style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 16, cursor: "pointer", fontWeight: 800, fontSize: 11.5, boxSizing: "border-box", background: onN ? "var(--text)" : "var(--card)", color: onN ? "var(--solid)" : "var(--text)", border: `1.5px solid ${onN ? "var(--text)" : "var(--el)"}` }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M7 12h10M10 17h4" />
          </svg>
          Filters{onN ? ` · ${onN}` : ""}
        </div>
        {quick.map(([k, label, on, fn]) => (
          <div role="button" tabIndex={0} onKeyDown={pressKey(fn)} key={k} aria-label={label} aria-pressed={on} onClick={fn} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", height: 32, padding: "0 13px", borderRadius: 16, cursor: "pointer", fontWeight: 800, fontSize: 11.5, boxSizing: "border-box", background: on ? "var(--text)" : "transparent", color: on ? "var(--solid)" : "var(--sub)", border: `1.5px solid ${on ? "var(--text)" : "var(--el)"}` }}>
            {label}
          </div>
        ))}
        {quickFams.map(([f, label]) => (
          <div role="button" tabIndex={0} onKeyDown={pressKey(() => toggleFam(f))} key={`qf-${f}`} aria-label={`${label} styles`} aria-pressed={false} onClick={() => toggleFam(f)} data-testid="quick-family" style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", height: 32, padding: "0 13px", borderRadius: 16, cursor: "pointer", fontWeight: 800, fontSize: 11.5, boxSizing: "border-box", background: "transparent", color: "var(--sub)", border: "1.5px dashed var(--el)", whiteSpace: "nowrap" }}>
            {label}
          </div>
        ))}
        {filters.fams.map((f) => (
          <div role="button" tabIndex={0} key={`fam-${f}`} onKeyDown={pressKey(() => toggleFam(f))} aria-label={`Remove ${f} family`} onClick={() => toggleFam(f)} data-testid="picked-family" style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, height: 32, padding: "0 11px", borderRadius: 16, cursor: "pointer", fontWeight: 800, fontSize: 11.5, boxSizing: "border-box", background: "var(--text)", color: "var(--solid)", border: "1.5px solid var(--text)", whiteSpace: "nowrap" }}>
            {f} <span aria-hidden="true">✕</span>
          </div>
        ))}
        {filters.styles.map((s) => (
          <div role="button" tabIndex={0} key={`st-${s}`} onKeyDown={pressKey(() => toggleStyle(s))} aria-label={`Remove ${s}`} onClick={() => toggleStyle(s)} data-testid="picked-style" style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, height: 32, padding: "0 11px", borderRadius: 16, cursor: "pointer", fontWeight: 800, fontSize: 11.5, boxSizing: "border-box", background: dosStyleColor(s), color: "#fff", border: `1.5px solid ${dosStyleColor(s)}`, whiteSpace: "nowrap" }}>
            {s} <span aria-hidden="true">✕</span>
          </div>
        ))}
        {onN ? (
          <div role="button" tabIndex={0} onKeyDown={pressKey(reset)} aria-label="Clear filters" onClick={reset} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", height: 32, padding: "0 12px", borderRadius: 16, cursor: "pointer", fontWeight: 800, fontSize: 11.5, background: "transparent", border: "1px dashed var(--el)", color: "var(--muted)" }}>
            Clear
          </div>
        ) : null}
      </div>

      {/* ⚠ THE EVENTS TAB'S OWN SEARCH BOX (S_eventslist 13551) WENT WITH EVENTS
          (29 Sep 2026) — title, style or organiser, debounced into `?q=`. It was
          the only search on this screen other than the one at the top, which
          searches everything. */}

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
            <Row label="FAMILY">
              {multi<string>(STYLE_FAMILIES.map((f) => [f, f]), filters.fams, (v) => {
                const inFams = new Set(stylesOfFamilies(v));
                go({ ...filters, fams: v, styles: v.length ? filters.styles.filter((s) => inFams.has(s)) : filters.styles });
              }, (l) => `${l} family`)}
            </Row>
            <Row label={filters.fams.length ? `DANCE STYLES · ${filters.fams.join(" · ").toUpperCase()}` : "DANCE STYLES"}>
              {["All", ...offered].map((s) => {
                const active = s === "All" ? filters.styles.length === 0 : filters.styles.includes(s);
                return (
                  <span key={s} style={{ display: "inline-flex", flexShrink: 0, animation: tapped === s ? "dosPop .45s ease" : "none" }}>
                    <DosStyleTile small label={s} color={s === "All" ? "#5AC8FA" : dosStyleColor(s)} on={active} tap={() => toggleStyle(s)} aria={s === "All" ? "All styles" : s} />
                  </span>
                );
              })}
            </Row>
            {isStyles ? <Row label="SHOW">{pick<"all" | "has">([["all", "Every style"], ["has", city === ALL_CITIES ? "With classes" : `With classes in ${city}`]], filters.has ? "has" : "all", (v) => go({ ...filters, has: v === "has" }))}</Row> : null}
            {/* ⚠ EVERY TAB SORTS, IN ITS OWN WORDS (10 Oct 2026) — the classes'
                Nearest is gone, because a class carries no distance and the word
                promised an order the list never had */}
            <Row label="SORT BY">{pick<SortBy>(SORTS_FOR[tab] ?? SORTS_FOR.classes, (SORTS_FOR[tab] ?? []).some(([s]) => s === filters.sort) ? filters.sort : "near", (v) => go({ ...filters, sort: v }))}</Row>
            {/* a distance is only measured on the Studios shelf (the radius search) */}
            {tab === "studios" ? <Row label="DISTANCE">{pick<Dist>([["any", "Any"], ["2", "Within 2 km"], ["5", "Within 5 km"], ["10", "Within 10 km"]], filters.dist, (v) => go({ ...filters, dist: v }))}</Row> : null}
            {tab === "classes" ? <Row label="TIME OF DAY">{pick<When>([["any", "Any"], ["morning", "Morning"], ["afternoon", "Afternoon"], ["evening", "Evening"]], filters.when, (v) => go({ ...filters, when: v }))}</Row> : null}
            {tab === "classes" ? <Row label="DURATION">{pick<Dur>([["any", "Any"], ["60", "Up to 1 h"], ["90", "Up to 1½ h"], ["120", "Up to 2 h"]], filters.dur, (v) => go({ ...filters, dur: v }))}</Row> : null}
            {/* THE PRICE BAR (10 Oct 2026, the user: "a price range bar which can
                slide from both ends … according to the relevant section"): a
                class's own price; for a studio or an artist, a class they teach in
                the range. A crew and a style have no price, so no bar. */}
            {isPricedTab(tab) ? (
              <Row label={tab === "classes" ? "PRICE" : "CLASS PRICE"}>
                <PriceRange
                  key={priceCeil}
                  ceil={priceCeil}
                  min={filters.pmin}
                  max={filters.pmax}
                  onCommit={(pmin, pmax) => go({ ...filters, prices: [], pmin, pmax })}
                />
              </Row>
            ) : null}
            {/* ⚠ TYPE OF EVENT and COMPETING AS were the sheet's last two rows
                and went with events (29 Sep 2026). The prototype's own rule
                still holds for the four that are left: a row is offered only
                where it means something (4827). */}
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
