"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Portal } from "@/components/ui/Portal";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { INK } from "@/lib/design/tokens";

const CARD = "var(--card)";
const EL = "var(--el)";
const MUTED = "var(--muted)";

/** ⚠⚠ THE ONE IN-APP DROPDOWN (27 Sep 2026, the user: *"fix all list drop downs
 *  should be within the app only not open a seprate screen"*).
 *
 *  A native `<select>` on a phone IS a separate screen: Android and iOS answer
 *  one with a full-screen OS picker drawn in the system's own type, with the
 *  system's own Cancel, over the app — nothing of DanceOS is visible while it is
 *  open. On a laptop it is a small popup and reads fine, which is why eight of
 *  them survived four months. `CitySelect` was the first to move on 27 Sep; this
 *  is that sheet extracted, because the other seven were about to be written out
 *  seven more times — this repo's own recurring bill (`linkChip` declared twice,
 *  the figure row written out three times, three copies of the identity band).
 *
 *  ⚠⚠ AND EXTRACTING IT IS WHAT FOUND THE BUG IN THE FIRST ONE. The city sheet
 *  was `position: fixed` and NOT PORTALLED, and half its callers draw it inside
 *  a `FormPage sheet` — the New-studio sheet, the crew form, the event form —
 *  whose panel carries `animation: dosSheetUp` AND `overflow: hidden`. An
 *  animated panel makes its own containing block for a fixed child and then
 *  CLIPS it, which is the 16 Sep stacking-context lesson met for the fourth
 *  time and the reason `FormConfirm` and `FormToast` are portalled ALWAYS. So
 *  this sheet is portalled always too — and ABOVE EVERY SHEET IN THE APP, which
 *  is a number that had to be read rather than reasoned from the form panel
 *  alone (see the scrim below).
 *
 *  What does NOT change at any call site: the options, the value, the callback,
 *  and the ACCESSIBLE NAME. Every `<select aria-label="Starts">` becomes a
 *  `<button aria-label="Starts">`, so a screen reader and a locator both still
 *  find one control by that name — what changed is what a press opens. */

export type PickRow = {
  value: string;
  label: string;
  /** a quieter second line under the label */
  sub?: string;
  /** drawn at the row's head — the city picker's pin, a style's coin */
  icon?: ReactNode;
};

/** ⚠ A LIST LONG ENOUGH TO SCROLL GETS A SEARCH, because the one thing a native
 *  select gives you that a painted list does not is the platform's type-ahead:
 *  66 dance styles or 77 years in a sheet with no search is WORSE than what it
 *  replaced. The app's own style picker (DosStylePicker, the prototype's 3548)
 *  has searched its list since 30 Aug, so this is that precedent and not a new
 *  idea. Twelve is where a list stops fitting on a phone without scrolling. */
const SEARCH_FROM = 12;

export function PickSheet({
  ariaLabel,
  rows,
  value,
  onPick,
  onClose,
  search,
  searchPlaceholder = "Search…",
  navigates = false,
}: {
  ariaLabel: string;
  rows: readonly PickRow[];
  value: string;
  onPick: (value: string) => void;
  onClose: () => void;
  /** force the search on or off; by default it appears past SEARCH_FROM rows */
  search?: boolean;
  searchPlaceholder?: string;
  /** ⚠⚠ DOES PICKING NAVIGATE? Two of these do — Discover's place chip and the
   *  Stats city, which both `router.replace` the address the list is read from.
   *  A sheet's close normally SPENDS its history entry with one `history.back()`
   *  on a microtask, and a back() racing a router call is what cancelled the
   *  navigation on 19 Sep. `useCloseOnBack`'s own rule 2 names this case: such a
   *  closer passes `spend: false`, and the entry it leaves is skipped by rule
   *  3(a). It is NOT the default, because an unspent entry per open is how back
   *  came to "do nothing once per sheet ever opened" before that rewrite — so
   *  the exception is declared by the two callers that need it. */
  navigates?: boolean;
}) {
  const [q, setQ] = useState("");
  useCloseOnBack(onClose, true, { spend: !navigates });

  const searching = search ?? rows.length > SEARCH_FROM;
  const term = q.trim().toLowerCase();
  const hits = term ? rows.filter((r) => r.label.toLowerCase().includes(term)) : rows;

  return (
    <Portal>
      <div
        onClick={onClose}
        /* ⚠⚠ 960 — ABOVE EVERY SHEET IN THE APP, and the number was READ rather
           than guessed. The first cut was 680, chosen against the form panel
           (600), its confirm (660) and its toast (670) — and the suite caught
           what that misses: a `Pick` is opened from inside sheets that sit much
           higher, `EnquirySheet` at **930** among them, so the picker painted
           UNDER the form it belongs to and the field beneath it intercepted
           every press. Nothing typed can see that; the failure read "the Level
           button intercepts pointer events". The app's own ceiling is 950
           (ScanSheet, ShareSheet, ProfileShare), so this sits one rung above it
           — a picker is always the most recent thing the person opened. */
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 960 }}
      >
        <div
          role="listbox"
          aria-label={ariaLabel}
          onClick={(e) => e.stopPropagation()}
          style={{ background: "var(--solid)", borderRadius: "24px 24px 0 0", padding: "16px 16px 26px", width: "100%", maxWidth: 430, boxSizing: "border-box", color: INK, maxHeight: "72vh", overflowY: "auto", animation: "dosSheetUp .28s cubic-bezier(.22,.9,.34,1)" }}
        >
          <div style={{ width: 40, height: 4, borderRadius: 2, background: EL, margin: "0 auto 12px" }} />

          {searching ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", marginBottom: 8, background: CARD, border: `1.5px solid ${EL}`, borderRadius: 12 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--sub)" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m20 20-3.8-3.8" />
              </svg>
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={`Search ${ariaLabel.toLowerCase()}`}
                style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: INK, fontSize: 13, fontFamily: "inherit", textTransform: "none" }}
              />
              {q ? (
                <button type="button" aria-label="Clear the search" onClick={() => setQ("")} style={{ fontSize: 12, color: "var(--sub)", cursor: "pointer", background: "none", border: "none", fontFamily: "inherit" }}>
                  ✕
                </button>
              ) : null}
            </div>
          ) : null}

          {hits.map((r) => {
            const on = r.value === value;
            return (
              <button
                key={r.value}
                type="button"
                role="option"
                aria-selected={on}
                /* ⚠ named EXACTLY by its label, so `getByRole("option", { name })`
                   and a plain `getByText` both land on the row and not on a
                   prefix of it — the substring trap this file records four times */
                aria-label={r.label}
                onClick={() => onPick(r.value)}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "13px 12px", marginBottom: 6, borderRadius: 14, cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: on ? 900 : 700, background: on ? EL : CARD, border: `1.5px solid ${on ? INK : EL}`, color: INK }}
              >
                {r.icon ?? null}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
                  {r.sub ? <span style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: MUTED, marginTop: 2 }}>{r.sub}</span> : null}
                </span>
                {on ? (
                  <span aria-hidden="true" style={{ color: INK, fontSize: 13 }}>
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}

          {hits.length === 0 ? <div style={{ padding: "14px 12px", fontSize: 12.5, color: MUTED, textAlign: "center" }}>Nothing by that name.</div> : null}
        </div>
      </div>
    </Portal>
  );
}

/** The closed control and the sheet behind it — the drop-in for a `<select>`.
 *
 *  ⚠ `style` IS THE CALLER'S, on purpose: these eight controls wear eight
 *  different paints (a form field, a narrow time box, a 999-radius pill on a
 *  roster row), and a picker that imposed one would be a redesign of eight
 *  screens rather than a fix to a dropdown. What this owns is the BEHAVIOUR. */
export function Pick({
  value,
  rows,
  onPick,
  ariaLabel,
  placeholder = "Choose…",
  disabled = false,
  style,
  search,
  searchPlaceholder,
  name,
  navigates = false,
}: {
  value: string;
  rows: readonly PickRow[];
  onPick: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  disabled?: boolean;
  style?: CSSProperties;
  search?: boolean;
  searchPlaceholder?: string;
  /** a hidden input, for a control inside a plain form post */
  name?: string;
  /** picking navigates — see `PickSheet` */
  navigates?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const here = rows.find((r) => r.value === value);
  const shown = here?.label ?? placeholder;

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          textAlign: "left",
          cursor: disabled ? "default" : "pointer",
          fontFamily: "inherit",
          /* a `<select>`'s own text never inherits `text-transform`; a button's
             does, and five of these sit inside a tracked-caps label — the
             16 Sep uppercase-About bug, which `fieldInput` guards the same way */
          textTransform: "none",
          opacity: disabled ? 0.7 : 1,
          ...style,
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: here ? "inherit" : MUTED }}>{shown}</span>
        <span aria-hidden="true" style={{ flexShrink: 0, fontSize: 10, opacity: 0.7 }}>
          ▾
        </span>
      </button>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      {open ? (
        <PickSheet
          ariaLabel={ariaLabel}
          rows={rows}
          value={value}
          search={search}
          searchPlaceholder={searchPlaceholder}
          navigates={navigates}
          onClose={() => setOpen(false)}
          onPick={(v) => {
            setOpen(false);
            onPick(v);
          }}
        />
      ) : null}
    </>
  );
}
