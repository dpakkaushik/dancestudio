"use client";

import { useEffect, useState } from "react";
import { searchPeopleAction } from "@/features/people/server-actions/people";
import { DOS_UI } from "@/lib/design/tokens";
import type { Profile } from "@/types/profile";

/** SEARCH DANCEOS, THEN ASK THEM — lifted from the crew desk's add panel
 *  (prototype 16413-16447): the eyebrow, the search field with the glass, the
 *  three states (type a name · nobody by that name · the hits), each hit a row
 *  with initials, the name, a sub line and the word on the right that says what
 *  pressing it does ("Ask ›" — nobody is added by this). The same panel names a
 *  duet partner on the event page, where the word is "Pick ›". */

const GRADS: [string, string][] = [
  ["#E84393", "#F39C12"],
  ["#3B82F6", "#7C3AED"],
  ["#922B21", "#00CEC9"],
  ["#8E44AD", "#E84393"],
  ["#7C3AED", "#EC4899"],
  ["#0D9488", "#3498DB"],
];
const hashOf = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};
export const personGradient = (name: string): [string, string] => GRADS[hashOf(name) % GRADS.length];
export const personInitials = (name: string) => name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "D";

const ROLE_WORD: Record<Profile["role"], string> = { dancer: "Dancer", trainer: "Artist", studio: "Studio" };

const pressKey = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};

export function PeoplePicker({
  title = "SEARCH DANCEOS",
  placeholder = "Search by name…",
  ariaLabel = "Search DanceOS for a dancer",
  actionWord = "Ask ›",
  actionColor = "#F59E0B",
  exclude = [],
  onPick,
  pickLabel,
}: {
  title?: string;
  placeholder?: string;
  ariaLabel?: string;
  actionWord?: string;
  actionColor?: string;
  /** people already on the roster (or already picked) — not offered again */
  exclude?: string[];
  onPick: (p: Profile) => void;
  /** the row's aria-label — "Ask Rhea Kapoor to join the crew" */
  pickLabel: (p: Profile) => string;
}) {
  const [q, setQ] = useState("");
  /* the answer remembers the term it answers, so a stale answer is never shown for a new term */
  const [answer, setAnswer] = useState<{ term: string; people: Profile[]; error: string | null }>({ term: "", people: [], error: null });
  const excludeKey = exclude.join(",");
  const term = q.trim();

  /* the search follows the field, a beat behind the last keystroke; state is
     only written from the timer's callback (an external event), never inline */
  useEffect(() => {
    if (term.length < 2) return;
    let live = true;
    const t = setTimeout(async () => {
      const out = await searchPeopleAction({ term, exclude: excludeKey ? excludeKey.split(",") : [] });
      if (!live) return;
      setAnswer({ term, people: out.people, error: out.error });
    }, 260);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [term, excludeKey]);

  const searching = term.length >= 2 && answer.term !== term;
  const hits = answer.term === term ? answer.people : [];
  const error = answer.term === term ? answer.error : null;
  return (
    <div style={{ fontFamily: DOS_UI }}>
      <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, color: "var(--muted)", marginBottom: 7 }}>{title}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--el)", borderRadius: 11, padding: "9px 11px" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--sub)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value.slice(0, 60))}
          aria-label={ariaLabel}
          placeholder={placeholder}
          autoComplete="off"
          style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: "var(--text)", fontSize: 12.5, fontFamily: DOS_UI }}
        />
      </div>
      {error ? <div style={{ fontSize: 10.5, color: "#F87171", marginTop: 9 }}>{error}</div> : null}
      {term.length < 2 ? (
        <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 9 }}>Type a name to find them.</div>
      ) : searching && hits.length === 0 ? (
        <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 9 }}>Searching…</div>
      ) : hits.length === 0 ? (
        <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 9 }}>Nobody on DanceOS by that name.</div>
      ) : (
        hits.map((p) => {
          const g = personGradient(p.fullName);
          const sub = [ROLE_WORD[p.role], p.city].filter(Boolean).join(" · ");
          return (
            <div
              role="button"
              tabIndex={0}
              key={p.id}
              aria-label={pickLabel(p)}
              onKeyDown={pressKey(() => onPick(p))}
              onClick={() => onPick(p)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", cursor: "pointer", borderBottom: "1px solid var(--el)" }}
            >
              <div style={{ width: 28, height: 28, borderRadius: 14, background: `linear-gradient(135deg,${g[0]},${g[1]})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10.5, fontWeight: 900, flexShrink: 0 }}>
                {personInitials(p.fullName)}
              </div>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>{p.fullName}</span>
                {sub ? <span style={{ display: "block", fontSize: 9.5, color: "var(--muted)", marginTop: 1 }}>{sub}</span> : null}
              </span>
              <span style={{ fontSize: 9.5, fontWeight: 800, color: actionColor, flexShrink: 0 }}>{actionWord}</span>
            </div>
          );
        })
      )}
    </div>
  );
}
