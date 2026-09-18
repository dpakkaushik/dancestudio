"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { lookupPersonAction, recentPeopleAction, searchPeopleAction } from "@/features/people/server-actions/people";
import { DOS_UI } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import { KIND_WORD, kindOf, type Profile } from "@/types/profile";
import { ScanSheet } from "./ScanSheet";

/** SEARCH DANCEOS, THEN ASK THEM — lifted from the crew desk's add panel
 *  (prototype 16413-16447): the eyebrow, the search field with the glass, the
 *  three states (type a name · nobody by that name · the hits), each hit a row
 *  with the face, the name, a sub line and the word on the right that says what
 *  pressing it does ("Ask ›" — nobody is added by this). The same panel names a
 *  duet partner on the event page, where the word is "Pick ›".
 *
 *  THREE WAYS IN, ONE PANEL (19 Sep 2026, the user: "when adding a person from
 *  any page in the app should have option to search name, mobile no., scan with
 *  a drop down with max 5 options with their profile pics, with max 3
 *  suggestions according to history"):
 *  · the field takes a NAME or a MOBILE NUMBER — the search matches either;
 *  · before a term is typed, RECENTLY ASKED — the last three people this
 *    account put on a class or a crew, off the rows those asks left;
 *  · SCAN, beside the eyebrow — the camera reads a profile link's QR (or the
 *    link is pasted), and the person is offered like any other hit.
 *  A hit wears the person's PICTURE where it wore initials; the drop-down is
 *  five rows at most (`PEOPLE_SEARCH_MAX`). Every caller — the class form, the
 *  class team, the crew form, the crew desk, the event page — gets all three
 *  without changing a line, because it is one panel. */

type Hit = Profile & { isArtist: boolean };

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

const pressKey = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};

/** the face on a row: the profile picture, or the initials on the person's gradient */
function Face({ name, photo }: { name: string; photo: string | null }) {
  const g = personGradient(name);
  return (
    <div style={{ width: 34, height: 34, borderRadius: 11, background: `linear-gradient(135deg,${g[0]},${g[1]})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11.5, fontWeight: 900, flexShrink: 0, overflow: "hidden", position: "relative" }}>
      {photo ? <Image src={photo} alt="" width={34} height={34} style={{ objectFit: "cover", width: 34, height: 34 }} /> : personInitials(name)}
    </div>
  );
}

function PersonRow({ p, actionWord, actionColor, label, onPick }: { p: Hit; actionWord: string; actionColor: string; label: string; onPick: () => void }) {
  const sub = [KIND_WORD[kindOf(p.role, p.isArtist)], p.city].filter(Boolean).join(" · ");
  return (
    <div role="button" tabIndex={0} aria-label={label} onKeyDown={pressKey(onPick)} onClick={onPick} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", cursor: "pointer", borderBottom: "1px solid var(--el)" }}>
      <Face name={p.fullName} photo={photoUrl(p.avatarPath)} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>{p.fullName}</span>
        {sub ? <span style={{ display: "block", fontSize: 9.5, color: "var(--muted)", marginTop: 1 }}>{sub}</span> : null}
      </span>
      <span style={{ fontSize: 9.5, fontWeight: 800, color: actionColor, flexShrink: 0 }}>{actionWord}</span>
    </div>
  );
}

export function PeoplePicker({
  title = "SEARCH DANCEOS",
  placeholder = "Name or mobile number…",
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
  const [answer, setAnswer] = useState<{ term: string; people: Hit[]; error: string | null }>({ term: "", people: [], error: null });
  /* RECENTLY ASKED — fetched once per roster, kept apart from the search's answer */
  const [recent, setRecent] = useState<{ key: string; people: Hit[] } | null>(null);
  const [scan, setScan] = useState<{ open: boolean; busy: boolean; error: string | null }>({ open: false, busy: false, error: null });
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

  /* the suggestions, once per roster (the roster changes when somebody is asked) */
  useEffect(() => {
    let live = true;
    recentPeopleAction({ exclude: excludeKey ? excludeKey.split(",") : [] }).then((out) => {
      if (live) setRecent({ key: excludeKey, people: out.people });
    });
    return () => {
      live = false;
    };
  }, [excludeKey]);

  /* a scanned or pasted link names a person; they are looked up and offered exactly as a typed hit is */
  const onScanned = useCallback(
    (personId: string) => {
      const excluded = new Set(excludeKey ? excludeKey.split(",") : []);
      setScan((s) => ({ ...s, busy: true, error: null }));
      lookupPersonAction({ userId: personId }).then((out) => {
        if (!out.person) {
          setScan({ open: true, busy: false, error: out.error ?? "Nobody on DanceOS at that link" });
          return;
        }
        if (excluded.has(out.person.id)) {
          setScan({ open: true, busy: false, error: `${out.person.fullName} is already here.` });
          return;
        }
        setScan({ open: false, busy: false, error: null });
        onPick(out.person);
      });
    },
    [excludeKey, onPick],
  );

  const searching = term.length >= 2 && answer.term !== term;
  const hits = answer.term === term ? answer.people : [];
  const error = answer.term === term ? answer.error : null;
  const suggestions = recent && recent.key === excludeKey ? recent.people : [];
  return (
    <div style={{ fontFamily: DOS_UI }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 7 }}>
        <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, color: "var(--muted)" }}>{title}</div>
        {/* SCAN — the camera reads a profile link's code; the sheet says when it cannot */}
        <button type="button" onClick={() => setScan({ open: true, busy: false, error: null })} aria-label="Scan a profile code" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 999, background: "var(--el)", border: "none", color: "var(--text)", fontSize: 10, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
            <path d="M7 12h10" />
          </svg>
          Scan
        </button>
      </div>
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
        suggestions.length > 0 ? (
          <div>
            <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, color: "var(--muted)", margin: "11px 0 2px" }}>RECENTLY ASKED</div>
            {suggestions.map((p) => (
              <PersonRow key={p.id} p={p} actionWord={actionWord} actionColor={actionColor} label={pickLabel(p)} onPick={() => onPick(p)} />
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 9 }}>Type a name or a mobile number to find them.</div>
        )
      ) : searching && hits.length === 0 ? (
        <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 9 }}>Searching…</div>
      ) : hits.length === 0 ? (
        <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 9 }}>Nobody on DanceOS by that name or number.</div>
      ) : (
        hits.map((p) => <PersonRow key={p.id} p={p} actionWord={actionWord} actionColor={actionColor} label={pickLabel(p)} onPick={() => onPick(p)} />)
      )}
      {scan.open ? <ScanSheet onClose={() => setScan({ open: false, busy: false, error: null })} onCode={onScanned} busy={scan.busy} error={scan.error} /> : null}
    </div>
  );
}
