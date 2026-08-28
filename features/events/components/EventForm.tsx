"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveEventAction } from "@/features/events/server-actions/events";
import type { EventPayload } from "@/repositories/events";
import { DOS_CITIES } from "@/lib/constants/cities";
import { DOS_STYLE_NAMES } from "@/lib/constants/styles";
import { DOS_UI } from "@/lib/design/tokens";
import {
  EVENT_CATS,
  EV_MAX_ENTRIES,
  EV_MAX_TICKETS,
  EV_NAME_CHARS,
  EV_NAME_WORDS,
  FORMAT_WORD,
  eventBlockers,
  takesEntries,
  type DanceEvent,
  type EntryFormat,
  type EventCat,
  type EventEntryHeadline,
} from "@/types/event";
import { EvFormatIcon, EvIcon, eventDays } from "./event-kit";

/** The event form, lifted from prototype S_eventform (15759-16317): TWO STEPS,
 *  LIKE ADD CLASS — "what it IS is one screen: the kind, the name, the styles,
 *  when, where. How it RUNS is the other: the format, the prizes, the tickets,
 *  publish." Every ceiling is the prototype's (8 words, 64 chars, 5,000 seats a
 *  tier, 500 entries a format); the poster is set from the manager, not here
 *  ("a poster is not something you have yet"); the judges page went altogether.
 *  Departures, stated: the native date and time inputs stand in for
 *  DosDatePick / DosTimePick (the class form's own gap), and the venue clash
 *  check waits for room-bound events. */

const DOS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

const dosWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
/* clamp, do not refuse: pasting a sentence keeps what fits (15921) */
const dosClampWords = (v: string, words: number, chars: number) => {
  const s2 = v.slice(0, chars);
  const parts = s2.split(/(\s+)/);
  let out = "";
  let n = 0;
  for (const p of parts) {
    if (/^\s+$/.test(p)) {
      out += p;
      continue;
    }
    if (p === "") continue;
    if (n >= words) break;
    out += p;
    n++;
  }
  return out;
};
const capNum = (v: string, max: number) => {
  const n = v.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
  if (n === "") return "";
  return String(Math.min(max, Math.max(0, parseInt(n, 10) || 0)));
};

type EntryRow = { on: boolean; fee: string; cap: string };
type TierRow = { id?: string; name: string; price: number; cap: number };

const ENTRY_KEYS: EntryFormat[] = ["solo", "duo", "crew"];
const ENTRY_CHIPS: Array<[EntryFormat | "all", string]> = [
  ["solo", "Solo"],
  ["duo", "Duet"],
  ["crew", "Crew"],
  ["all", "All formats"],
];

const inp: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--card)",
  border: "none",
  borderRadius: 12,
  padding: "13px 14px",
  fontSize: 14,
  color: "var(--text)",
  outline: "none",
  fontFamily: "inherit",
};

function Head({ n, children, opt }: { n: string; children: React.ReactNode; opt?: boolean }) {
  return (
    <div style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: 1.1, color: "var(--muted)", margin: "18px 0 9px" }}>
      {n} · {children}
      {opt ? <span style={{ color: "var(--muted)", fontWeight: 700, letterSpacing: 0 }}> · optional</span> : null}
    </div>
  );
}

function Chip({ on, onClick, children, col }: { on: boolean; onClick: () => void; children: React.ReactNode; col: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} style={{ padding: "9px 14px", borderRadius: 999, cursor: "pointer", fontSize: 12.5, fontWeight: 800, background: on ? `${col}22` : "var(--card)", color: on ? col : "var(--sub)", border: `2px solid ${on ? col : "transparent"}`, fontFamily: "inherit" }}>
      {children}
    </button>
  );
}

export function EventForm({ tenantId, existing }: { tenantId: string; existing: DanceEvent | null }) {
  const router = useRouter();
  const E = existing;
  const [step, setStep] = useState(0);
  const [cat, setCat] = useState<EventCat | null>(E?.cat ?? null);
  const [title, setTitle] = useState(E?.title ?? "");
  const [style, setStyle] = useState(E?.style ?? "");
  const [sD, setSD] = useState(E?.startDate ?? "");
  const [eD, setED] = useState(E?.endDate ?? "");
  const [startT, setStartT] = useState(E?.startTime ?? "18:00");
  const [venue, setVenue] = useState(E?.venue ?? "");
  const [addr, setAddr] = useState(E?.address ?? "");
  const [city, setCity] = useState(E?.city ?? "");
  const [maps, setMaps] = useState(E?.mapsUrl ?? "");
  const [about, setAbout] = useState(E?.about ?? "");
  const initialEntry: EventEntryHeadline = E?.entryFormat ?? "solo";
  const [entry, setEntry] = useState<EventEntryHeadline>(initialEntry === "none" ? "solo" : initialEntry);
  const [bracket, setBracket] = useState(E?.bracket || 16);
  const [rounds, setRounds] = useState(E?.rounds || 3);
  const [p1, setP1] = useState(E?.prizes[0] ? String(E.prizes[0]) : "");
  const [p2, setP2] = useState(E?.prizes[1] ? String(E.prizes[1]) : "");
  const [p3, setP3] = useState(E?.prizes[2] ? String(E.prizes[2]) : "");
  const [entryTiers, setEntryTiers] = useState<Record<EntryFormat, EntryRow>>(() => {
    const seeded = new Map((E?.entryTiers ?? []).map((t) => [t.format, t]));
    const one = (k: EntryFormat): EntryRow => {
      const t = seeded.get(k);
      if (t) return { on: true, fee: String(t.feeInr), cap: t.capacity ? String(t.capacity) : "" };
      const on = !E ? k === "solo" : false;
      return { on, fee: "", cap: "" };
    };
    return { solo: one("solo"), duo: one("duo"), crew: one("crew") };
  });
  const [tiers, setTiers] = useState<TierRow[]>((E?.ticketTiers ?? []).map((t) => ({ id: t.id, name: t.name, price: t.priceInr, cap: t.capacity })));
  const [ticketsOn, setTicketsOn] = useState(E ? E.ticketsOn : true);
  const [tN, setTN] = useState("");
  const [tP, setTP] = useState("");
  const [tC, setTC] = useState("");
  const [confirm, setConfirm] = useState<"draft" | "publish" | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2300);
  };
  const C = EVENT_CATS.find((c) => c.k === cat) ?? EVENT_CATS[0];
  const col = C.c;
  const STEPS = ["The event", "Format, tickets & publish"];
  const days = sD && eD ? eventDays(sD, eD) : ["—"];
  const venueOK = !!venue.trim() && !!city.trim();
  const openEntryTiers = ENTRY_KEYS.filter((k) => entryTiers[k].on).map((k) => ({ format: k, fee_inr: Number(entryTiers[k].fee) || 0, capacity: Number(entryTiers[k].cap) || 0 }));
  const entryLow = openEntryTiers.length ? Math.min(...openEntryTiers.map((t) => t.fee_inr)) : 0;
  const blockers = cat
    ? eventBlockers({ cat, ticketsOn, ticketTiers: tiers.map((t) => ({ name: t.name, capacity: t.cap })), entryTiers: openEntryTiers })
    : ["Pick an event type"];
  const step1Ready = !!cat && !!title.trim() && !!style && !!sD && !!eD && venueOK && !!maps.trim();
  const canPublish = blockers.length === 0 && step1Ready;
  const isEntered = cat ? takesEntries(cat) : false;

  const payload = (): EventPayload => ({
    cat: cat as EventCat,
    title: title.trim(),
    style: style || "All styles",
    start_date: sD,
    end_date: eD || sD,
    start_time: startT || "18:00",
    venue: venue.trim(),
    address: addr.trim() || null,
    city,
    maps_url: maps.trim(),
    about: about.trim() || null,
    entry_format: isEntered ? (openEntryTiers.length === 3 ? "all" : openEntryTiers.length === 1 ? openEntryTiers[0].format : openEntryTiers.length ? "mixed" : "none") : "none",
    bracket: cat === "battle" ? (bracket as 8 | 16 | 32 | 64) : 0,
    rounds: cat === "tournament" ? rounds : 0,
    prizes: isEntered ? [Number(p1) || 0, Number(p2) || 0, Number(p3) || 0] : [],
    tickets_on: ticketsOn,
    entry_tiers: isEntered ? openEntryTiers : [],
    ticket_tiers: ticketsOn ? tiers.map((t, i) => ({ id: t.id, name: t.name, price_inr: t.price, capacity: t.cap, sort: i })) : [],
  });

  const submit = async (publish: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const out = await saveEventAction({ tenantId, eventId: E?.id ?? null, event: payload(), publish });
    setBusy(false);
    setConfirm(null);
    if (out.error) {
      setError(out.error);
      fire(out.error);
      return;
    }
    fire(publish ? "🎟 Published — it is on Discover" : "Saved as a draft");
    router.push(`/business/${tenantId}/events`);
    router.refresh();
  };

  const setEntryHeadline = (k: EntryFormat | "all") => {
    setEntry(k);
    setEntryTiers((t) => ({
      solo: { ...t.solo, on: k === "all" || k === "solo" },
      duo: { ...t.duo, on: k === "all" || k === "duo" },
      crew: { ...t.crew, on: k === "all" || k === "crew" },
    }));
  };

  return (
    <div style={{ background: "var(--bg)", maxWidth: 430, margin: "0 auto", color: "var(--text)", fontFamily: DOS_UI, paddingBottom: 60, minHeight: "100vh" }}>
      {/* header — mirrors the class form */}
      <div style={{ position: "sticky", top: "var(--dos-top)", zIndex: 20, background: "var(--solid)", padding: "14px 16px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 900 }}>{E ? "Edit event" : "Add event"}</div>
            <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 1 }}>
              Step {step + 1} of {STEPS.length} — {STEPS[step]}
            </div>
          </div>
          {step > 0 ? (
            <button type="button" onClick={() => setStep(0)} style={{ fontSize: 11.5, fontWeight: 800, padding: "7px 12px", borderRadius: 999, background: "var(--card)", border: "1px solid var(--el)", color: "var(--text)", cursor: "pointer", fontFamily: "inherit" }}>
              ‹ Back
            </button>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? col : "var(--el)", transition: "background .2s" }} />
          ))}
        </div>
      </div>

      <div style={{ padding: "4px 16px 0" }}>
        {step === 0 ? (
          <>
            <Head n="1">WHAT KIND OF EVENT</Head>
            {EVENT_CATS.map((c) => (
              <div
                key={c.k}
                role="button"
                tabIndex={0}
                aria-pressed={cat === c.k}
                aria-label={c.label}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    setCat(c.k);
                  }
                }}
                onClick={() => setCat(c.k)}
                style={{ display: "flex", alignItems: "center", gap: 12, background: cat === c.k ? `${c.c}18` : "var(--card)", border: `2px solid ${cat === c.k ? c.c : "transparent"}`, borderRadius: 16, padding: "13px 14px", marginBottom: 9, cursor: E ? "default" : "pointer", opacity: E && cat !== c.k ? 0.45 : 1, pointerEvents: E ? "none" : undefined }}
              >
                <span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, background: `${c.c}1e`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <EvIcon cat={c.k} size={20} color={c.c} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 900, color: cat === c.k ? c.c : "var(--text)" }}>{c.label}</div>
                  <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 1 }}>{c.sub}</div>
                </div>
                {cat === c.k ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.c} strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                ) : null}
              </div>
            ))}
            {E ? <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: -2 }}>The kind is fixed once an event exists.</div> : null}

            <Head n="2">EVENT NAME</Head>
            <input value={title} aria-label="Event name" onChange={(ev) => setTitle(dosClampWords(ev.target.value, EV_NAME_WORDS, EV_NAME_CHARS))} placeholder={cat === "battle" ? "Delhi Breaking League — Top 16" : cat === "showcase" ? "Monsoon Showcase Vol 2" : "Nritya Championship 2026"} style={inp} />
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 5, fontSize: 10, fontWeight: 700 }}>
              <span style={{ color: "var(--muted)" }}>Up to {EV_NAME_WORDS} words</span>
              <span style={{ color: dosWords(title) >= EV_NAME_WORDS ? "#F59E0B" : "var(--muted)", fontFamily: DOS_MONO }}>
                {dosWords(title)}/{EV_NAME_WORDS}
              </span>
            </div>

            {/* ONE STYLE, OR ALL OF THEM (15948) */}
            <Head n="3">DANCE STYLE</Head>
            <select value={style} aria-label="Dance style" onChange={(ev) => setStyle(ev.target.value)} style={{ ...inp, WebkitAppearance: "none", appearance: "none", color: style ? "var(--text)" : "var(--sub)" }}>
              <option value="">Pick the style, or open it to all</option>
              <option value="All styles">All styles</option>
              {DOS_STYLE_NAMES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <Head n="4">WHEN</Head>
            <div style={{ fontSize: 12, color: "var(--sub)", marginBottom: 4 }}>First day</div>
            <input type="date" aria-label="First day" value={sD} onChange={(ev) => { setSD(ev.target.value); if (!eD || ev.target.value > eD) setED(ev.target.value); }} style={inp} />
            <div style={{ height: 10 }} />
            <div style={{ fontSize: 12, color: "var(--sub)", marginBottom: 4 }}>Last day</div>
            <input type="date" aria-label="Last day" value={eD} min={sD || undefined} onChange={(ev) => setED(ev.target.value)} style={inp} />
            <div style={{ fontSize: 10.5, color: "var(--muted)", margin: "6px 0 10px" }}>
              {days.length} day{days.length === 1 ? "" : "s"} · {days.join(" → ")}
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <div style={{ flex: "0 0 150px" }}>
                <div style={{ fontSize: 12, color: "var(--sub)", marginBottom: 4 }}>Doors open</div>
                <input type="time" aria-label="Doors open" value={startT} onChange={(ev) => setStartT(ev.target.value)} style={inp} />
              </div>
              <span style={{ flex: 1, fontSize: 10.5, color: "var(--muted)", lineHeight: 1.4, paddingBottom: 12 }}>Slots and running order are built on the manage page.</span>
            </div>

            {/* A VENUE IS NOT OPTIONAL (15965) */}
            <Head n="5">VENUE</Head>
            <input value={venue} aria-label="Venue name" onChange={(ev) => setVenue(ev.target.value)} placeholder="Venue name · e.g. Talkatora Indoor Stadium" style={inp} />
            <div style={{ height: 9 }} />
            <div style={{ display: "flex", gap: 9 }}>
              <input value={addr} aria-label="Address" onChange={(ev) => setAddr(ev.target.value)} placeholder="Address" style={inp} />
              <select value={city} onChange={(ev) => setCity(ev.target.value)} aria-label="City" style={{ width: 130, flexShrink: 0, boxSizing: "border-box", background: "var(--card)", border: "none", borderRadius: 12, padding: "13px 12px", fontSize: 14, color: city ? "var(--text)" : "var(--sub)", outline: "none", WebkitAppearance: "none", appearance: "none", cursor: "pointer", fontFamily: "inherit" }}>
                <option value="">City</option>
                {DOS_CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            {!venueOK ? <div style={{ fontSize: 10, color: "#F87171", marginTop: 6, fontWeight: 700 }}>{!venue.trim() ? "Every event needs a venue name." : "Which city is it in?"}</div> : null}
            <div style={{ height: 9 }} />
            <input value={maps} aria-label="Google Maps link" onChange={(ev) => setMaps(ev.target.value)} placeholder="Google Maps link · required" style={inp} />
            {!maps.trim() ? <div style={{ fontSize: 10, color: "#F87171", marginTop: 5, fontWeight: 700 }}>Events need a map link so people can find the venue.</div> : null}

            <Head n="6" opt>ABOUT</Head>
            <textarea value={about} aria-label="About" onChange={(ev) => setAbout(ev.target.value.slice(0, 900))} rows={3} placeholder="What should people expect?" style={{ ...inp, resize: "none" }} />

            <button
              type="button"
              disabled={!step1Ready}
              onClick={() => setStep(1)}
              style={{ width: "100%", marginTop: 22, textAlign: "center", padding: 15, borderRadius: 999, background: step1Ready ? "var(--text)" : "var(--el)", color: step1Ready ? "var(--solid)" : "var(--muted)", fontWeight: 900, fontSize: 14.5, cursor: step1Ready ? "pointer" : "default", border: "none", fontFamily: "inherit" }}
            >
              {!cat ? "Pick an event type" : !title.trim() ? "Name your event" : !style ? "Pick a style" : !sD ? "Pick the first day" : !venue.trim() ? "Name the venue" : !city.trim() ? "Pick the city" : !maps.trim() ? "Add the Google Maps link" : "Continue"}
            </button>
          </>
        ) : null}

        {step === 1 && cat ? (
          <>
            {isEntered ? (
              <>
                {/* ONE ANSWER, NOT TWO (16011): choosing here switches the entry rows on and off */}
                <Head n="1">WHO COMPETES / PERFORMS</Head>
                <div style={{ display: "flex", gap: 8 }}>
                  {ENTRY_CHIPS.map(([k, l]) => {
                    const on = entry === k;
                    return (
                      <button key={k} type="button" aria-pressed={on} aria-label={l} onClick={() => setEntryHeadline(k)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "12px 4px", borderRadius: 14, cursor: "pointer", background: on ? `${col}18` : "var(--card)", border: `2px solid ${on ? col : "transparent"}`, color: on ? col : "var(--sub)", fontFamily: "inherit" }}>
                        <EvFormatIcon fmt={k} size={17} />
                        <span style={{ fontSize: 10.5, fontWeight: 800 }}>{l}</span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 7, lineHeight: 1.45 }}>
                  {entry === "all" ? "Every format may enter — each has its own price and places below." : entry === "solo" ? "Only solo dancers may enter. The price and the places are below." : entry === "duo" ? "Only duets may enter. The price and the places are below." : entry === "crew" ? "Only crews may enter, and only the person who leads a crew can put it forward." : "Set below — the rows that are switched on are the ways in."}
                </div>
                {cat === "battle" ? (
                  <>
                    <Head n="2">BRACKET SIZE</Head>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {[8, 16, 32, 64].map((b) => (
                        <Chip key={b} on={bracket === b} onClick={() => setBracket(b)} col={col}>
                          Top {b}
                        </Chip>
                      ))}
                    </div>
                    <div style={{ background: "var(--card)", borderRadius: 14, padding: "12px 14px", marginTop: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.8, color: "var(--muted)", marginBottom: 8 }}>KNOCKOUT PATH</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {(() => {
                          const out: number[] = [];
                          let n = bracket;
                          while (n >= 2) {
                            out.push(n);
                            n = n / 2;
                          }
                          return out;
                        })().map((n, i, arr) => (
                          <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 900, padding: "5px 10px", borderRadius: 999, background: `${col}1e`, color: col }}>{n === 2 ? "Final" : n === 4 ? "Semis" : `Top ${n}`}</span>
                            {i < arr.length - 1 ? <span style={{ color: "var(--muted)", fontSize: 11 }}>›</span> : null}
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}
                {cat === "tournament" ? (
                  <>
                    <Head n="2">HOW MANY ROUNDS</Head>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {[2, 3, 4, 5].map((r) => (
                        <Chip key={r} on={rounds === r} onClick={() => setRounds(r)} col={col}>
                          {r} rounds
                        </Chip>
                      ))}
                    </div>
                    <div style={{ background: "var(--card)", borderRadius: 14, padding: "12px 14px", marginTop: 12, fontSize: 11, color: "var(--sub)", lineHeight: 1.5 }}>Score every entrant each round, then pick who advances from the judging sheet — no fixed cut-off.</div>
                  </>
                ) : null}

                <Head n="1" opt>PRIZE MONEY</Head>
                <div style={{ display: "flex", gap: 8 }}>
                  {(
                    [
                      ["1st", p1, setP1],
                      ["2nd", p2, setP2],
                      ["3rd", p3, setP3],
                    ] as Array<[string, string, (v: string) => void]>
                  ).map(([l, v, set]) => (
                    <div key={l} style={{ flex: 1 }}>
                      <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted)", marginBottom: 4, letterSpacing: 0.5 }}>{l} PLACE</div>
                      <input value={v} aria-label={`${l} place prize`} onChange={(ev) => set(ev.target.value.replace(/[^\d]/g, "").slice(0, 8))} placeholder="₹" inputMode="numeric" style={inp} />
                    </div>
                  ))}
                </div>
                {(Number(p1) || 0) + (Number(p2) || 0) + (Number(p3) || 0) > 0 ? (
                  <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 7 }}>Prize pool ₹{((Number(p1) || 0) + (Number(p2) || 0) + (Number(p3) || 0)).toLocaleString("en-IN")} — shown on the event page.</div>
                ) : null}

                {/* ENTRIES AND TICKETS ARE TWO DIFFERENT THINGS (16070) */}
                <Head n="2">FOR HOW MUCH, AND HOW MANY</Head>
                <div style={{ fontSize: 11, color: "var(--sub)", margin: "-2px 0 9px", lineHeight: 1.5 }}>Set by what people enter as. Which of these are open is decided by who competes, above.</div>
                {ENTRY_KEYS.filter((k) => entry === "all" || entry === k || entryTiers[k].on).map((k) => {
                  const row = entryTiers[k];
                  const on = row.on;
                  const toggle = () => {
                    const next = { ...entryTiers, [k]: { ...row, on: !on } };
                    setEntryTiers(next);
                    const openK = ENTRY_KEYS.filter((x) => next[x].on);
                    setEntry(openK.length === 3 ? "all" : openK.length === 1 ? openK[0] : "mixed");
                  };
                  return (
                    <div key={k} style={{ background: "var(--card)", borderRadius: 14, padding: "11px 12px", marginBottom: 8, border: `1.5px solid ${on ? col : "transparent"}` }}>
                      <div role="button" tabIndex={0} aria-pressed={on} aria-label={`${FORMAT_WORD[k]} entries`} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggle(); } }} onClick={toggle} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                        <span style={{ width: 30, height: 30, borderRadius: 10, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: on ? `${col}22` : "var(--el)", color: on ? col : "var(--sub)" }}>
                          <EvFormatIcon fmt={k} size={17} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: on ? 800 : 700 }}>{FORMAT_WORD[k]}</span>
                        <span style={{ width: 38, height: 22, borderRadius: 11, background: on ? col : "var(--el)", position: "relative", flexShrink: 0, transition: "background .18s" }}>
                          <span style={{ position: "absolute", top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: 9, background: "#fff", transition: "left .18s" }} />
                        </span>
                      </div>
                      {on ? (
                        <div style={{ display: "flex", gap: 9, marginTop: 10 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted)", marginBottom: 4, letterSpacing: 0.5 }}>ENTRY FEE</div>
                            <input value={row.fee} inputMode="numeric" aria-label={`${FORMAT_WORD[k]} entry fee`} placeholder="0" onChange={(ev) => setEntryTiers((t) => ({ ...t, [k]: { ...row, fee: ev.target.value.replace(/[^\d]/g, "").slice(0, 6) } }))} style={inp} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted)", marginBottom: 4, letterSpacing: 0.5 }}>PLACES</div>
                            <input value={row.cap} inputMode="numeric" aria-label={`${FORMAT_WORD[k]} places`} placeholder="32" onChange={(ev) => setEntryTiers((t) => ({ ...t, [k]: { ...row, cap: capNum(ev.target.value, EV_MAX_ENTRIES) } }))} style={inp} />
                          </div>
                        </div>
                      ) : null}
                      {on ? (
                        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
                          {(Number(row.fee) || 0) === 0 ? "Free to enter" : `₹${Number(row.fee).toLocaleString("en-IN")} per entry`}
                          {" · "}
                          {(Number(row.cap) || 0) === 0 ? `up to ${EV_MAX_ENTRIES}` : `${Number(row.cap)} place${Number(row.cap) === 1 ? "" : "s"}`}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {!ENTRY_KEYS.some((k) => entryTiers[k].on) ? <div style={{ fontSize: 10.5, color: "#F87171", fontWeight: 700, marginTop: -2 }}>Pick at least one way in.</div> : null}
              </>
            ) : null}

            <Head n={isEntered ? "3" : "1"}>SPECTATOR TICKETS</Head>
            <div role="button" tabIndex={0} aria-pressed={ticketsOn} aria-label="Selling tickets" onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setTicketsOn((v) => !v); } }} onClick={() => setTicketsOn((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--card)", borderRadius: 16, padding: "13px 14px", cursor: "pointer", marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800 }}>{ticketsOn ? "Selling tickets" : "No tickets"}</div>
                <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 2, lineHeight: 1.45 }}>
                  {ticketsOn ? "Spectators can book seats — you'll manage them separately from participants." : cat === "showcase" ? "Invite-only showcase — no audience booking or gate list." : "Participants register only — no audience."}
                </div>
              </div>
              <span style={{ width: 44, height: 26, borderRadius: 13, background: ticketsOn ? "#22C55E" : "var(--el)", position: "relative", flexShrink: 0, transition: "background .18s" }}>
                <span style={{ position: "absolute", top: 3, left: ticketsOn ? 21 : 3, width: 20, height: 20, borderRadius: 10, background: "#fff", transition: "left .18s" }} />
              </span>
            </div>
            {!ticketsOn ? <div style={{ fontSize: 10.5, color: "var(--muted)", margin: "8px 0 0", lineHeight: 1.5 }}>Ticket tiers and the spectator check-in list are hidden while this is off.</div> : null}
            {ticketsOn ? <Head n={isEntered ? "4" : "2"}>TICKET TIERS</Head> : null}
            {ticketsOn
              ? tiers.map((t, i) => (
                  <div key={`${t.name}-${i}`} style={{ background: "var(--card)", borderRadius: 12, padding: "11px 13px", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800 }}>{t.name}</div>
                        <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 1 }}>
                          {t.price === 0 ? "Free" : `₹${t.price}`} × {t.cap} = {t.price === 0 ? "free entry" : `₹${(t.price * t.cap).toLocaleString("en-IN")}`}
                        </div>
                      </div>
                      <button type="button" aria-label={`Remove ${t.name}`} onClick={() => setTiers((ts) => ts.filter((_, x) => x !== i))} style={{ color: "#F87171", fontSize: 16, cursor: "pointer", flexShrink: 0, background: "transparent", border: "none", fontFamily: "inherit" }}>
                        ×
                      </button>
                    </div>
                    {/* A NUMBER YOU TYPE, NOT ONE YOU TAP TOWARDS (16123) */}
                    <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted)", marginBottom: 4, letterSpacing: 0.5 }}>PRICE ₹</div>
                        <input value={String(t.price)} inputMode="numeric" aria-label={`${t.name} price`} onChange={(ev) => setTiers((ts) => ts.map((x, xi) => (xi === i ? { ...x, price: Number(capNum(ev.target.value, 999999)) || 0 } : x)))} style={inp} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted)", marginBottom: 4, letterSpacing: 0.5 }}>SEATS</div>
                        <input value={String(t.cap)} inputMode="numeric" aria-label={`${t.name} seats`} onChange={(ev) => setTiers((ts) => ts.map((x, xi) => (xi === i ? { ...x, cap: Number(capNum(ev.target.value, EV_MAX_TICKETS)) || 0 } : x)))} style={inp} />
                      </div>
                    </div>
                    {t.cap >= EV_MAX_TICKETS ? <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 5 }}>That is the most a tier can hold ({EV_MAX_TICKETS}).</div> : null}
                  </div>
                ))
              : null}
            {ticketsOn && tiers.length > 0 ? (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, fontWeight: 800, padding: "2px 4px 6px" }}>
                <span style={{ color: "var(--sub)" }}>
                  {tiers.reduce((a, t) => a + t.cap, 0)} seats across {tiers.length} tier{tiers.length === 1 ? "" : "s"}
                </span>
                <span>₹{tiers.reduce((a, t) => a + t.price * t.cap, 0).toLocaleString("en-IN")} max</span>
              </div>
            ) : null}
            {ticketsOn ? (
              <div style={{ background: "var(--card)", borderRadius: 14, padding: "12px 13px", marginTop: 4 }}>
                <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: "var(--muted)", marginBottom: 8 }}>ADD A TIER</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 9 }}>
                  {(
                    [
                      ["General", 299, 120],
                      ["Front row", 599, 60],
                      ["Early bird", 199, 80],
                      ["VIP", 999, 20],
                      ["Free entry", 0, 150],
                    ] as Array<[string, number, number]>
                  )
                    .filter(([n]) => !tiers.some((t) => t.name === n))
                    .map(([n, p, c]) => (
                      <button key={n} type="button" onClick={() => { setTN(n); setTP(String(p)); setTC(String(c)); }} style={{ fontSize: 10.5, fontWeight: 800, padding: "6px 11px", borderRadius: 999, background: "var(--el)", color: "var(--sub)", cursor: "pointer", border: "none", fontFamily: "inherit" }}>
                        {n} · {p === 0 ? "free" : `₹${p}`}
                      </button>
                    ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={tN} aria-label="Tier name" onChange={(ev) => setTN(ev.target.value.slice(0, 40))} placeholder="Tier name" style={inp} />
                  <input value={tP} aria-label="Tier price" onChange={(ev) => setTP(ev.target.value.replace(/[^\d]/g, "").slice(0, 6))} placeholder="₹" style={{ ...inp, width: 74, flexShrink: 0 }} inputMode="numeric" />
                  <input value={tC} aria-label="Tier seats" onChange={(ev) => setTC(capNum(ev.target.value, EV_MAX_TICKETS))} placeholder="Seats" style={{ ...inp, width: 76, flexShrink: 0 }} inputMode="numeric" />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: "var(--muted)", flex: 1 }}>{tN.trim() ? `${tN.trim()} · ${(Number(tP) || 0) === 0 ? "free" : `₹${Number(tP) || 0}`} · ${tC || 0} seats` : "Pick a preset or type your own"}</span>
                  <button
                    type="button"
                    aria-label="Add tier"
                    onClick={() => {
                      const nm = tN.trim();
                      if (!nm) return fire("Give the tier a name");
                      if (!tC || Number(tC) < 1) return fire("How many seats in this tier?");
                      if (tiers.some((t) => t.name.toLowerCase() === nm.toLowerCase())) return fire("That tier already exists");
                      setTiers((ts) => [...ts, { name: nm, price: Number(tP) || 0, cap: Number(tC) }]);
                      setTN("");
                      setTP("");
                      setTC("");
                      fire(`🎟 ${nm} tier added`);
                    }}
                    style={{ padding: "10px 16px", borderRadius: 999, background: tN.trim() && tC ? "var(--text)" : "var(--el)", color: tN.trim() && tC ? "var(--solid)" : "var(--muted)", fontWeight: 900, fontSize: 12.5, cursor: "pointer", flexShrink: 0, border: "none", fontFamily: "inherit" }}
                  >
                    Add tier
                  </button>
                </div>
              </div>
            ) : null}

            {/* AND IT SAYS WHAT IS MISSING (16178) */}
            {blockers.length > 0 ? (
              <div style={{ background: "rgba(248,113,113,.10)", border: "1px solid rgba(248,113,113,.35)", borderRadius: 14, padding: "12px 13px", marginTop: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.6, color: "#F87171", marginBottom: 7 }}>BEFORE THIS CAN GO ON DISCOVER</div>
                {blockers.map((b, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginTop: i ? 6 : 0 }}>
                    <span aria-hidden="true" style={{ flexShrink: 0, color: "#F87171", fontWeight: 900, fontSize: 12 }}>·</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: "var(--sub)", lineHeight: 1.45 }}>{b}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {error ? <div style={{ fontSize: 11.5, color: "#F87171", marginTop: 10 }}>{error}</div> : null}
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button type="button" onClick={() => setConfirm("draft")} style={{ flex: 1, textAlign: "center", padding: 15, borderRadius: 999, background: "var(--card)", border: "1px solid var(--el)", fontWeight: 800, fontSize: 13.5, cursor: "pointer", color: "var(--text)", fontFamily: "inherit" }}>
                Save draft
              </button>
              <button type="button" aria-disabled={!canPublish} onClick={() => (canPublish ? setConfirm("publish") : fire(blockers[0] ?? "Finish the details first"))} style={{ flex: 1.3, textAlign: "center", padding: 15, borderRadius: 999, background: canPublish ? "var(--text)" : "var(--el)", color: canPublish ? "var(--solid)" : "var(--muted)", fontWeight: 900, fontSize: 14.5, cursor: canPublish ? "pointer" : "default", border: "none", fontFamily: "inherit" }}>
                Publish event
              </button>
            </div>
          </>
        ) : null}
      </div>

      {confirm ? (
        <div onClick={() => setConfirm(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.62)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 600 }}>
          <div role="dialog" aria-modal="true" aria-label={confirm === "publish" ? "Publish this event?" : "Save as draft?"} onClick={(ev) => ev.stopPropagation()} style={{ background: "var(--solid)", color: "var(--text)", borderRadius: "24px 24px 0 0", padding: "18px 16px 28px", width: "100%", maxWidth: 430, boxSizing: "border-box", textAlign: "center" }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 12px" }} />
            <b style={{ fontSize: 17 }}>{confirm === "publish" ? "Publish this event?" : "Save as draft?"}</b>
            <div style={{ fontSize: 11.5, color: "var(--sub)", margin: "4px 0 12px" }}>{confirm === "publish" ? "Check the details — this goes live immediately." : "Saved privately. You can publish it any time."}</div>
            <div style={{ background: "var(--card)", borderRadius: 16, padding: "12px 13px", textAlign: "left", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 10, marginBottom: 8, borderBottom: "1px solid var(--el)" }}>
                <span style={{ width: 36, height: 36, borderRadius: 12, flexShrink: 0, background: `${col}1e`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <EvIcon cat={cat as EventCat} size={18} color={col} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 900 }}>{title || "Untitled event"}</div>
                  <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 1 }}>
                    {C.label} · {style || "no style"}
                  </div>
                </div>
              </div>
              {(
                [
                  ["When", `${days.length > 1 ? `${days[0]} → ${days[days.length - 1]}` : days[0]} · ${startT || "18:00"}`],
                  ["Venue", `${venue || "—"}, ${city || "—"}`],
                  ["Map", maps.trim() ? "linked ✓" : "missing"],
                  ["Entry", isEntered ? (entryLow === 0 ? "free to compete" : `₹${entryLow.toLocaleString("en-IN")} per competitor`) : "performers added by you"],
                  ...(cat === "battle" ? [["Format", `Top ${bracket} knockout`]] : cat === "tournament" ? [["Format", `${rounds} rounds · advance set by judges`]] : []),
                  ...(isEntered ? [["Entries", openEntryTiers.map((t) => `${FORMAT_WORD[t.format]} ${t.fee_inr === 0 ? "free" : `₹${t.fee_inr}`}`).join(" · ") || "none picked"]] : []),
                  ["Tickets", ticketsOn && tiers.length ? `${tiers.reduce((a, t) => a + t.cap, 0)} seats · ₹${tiers.reduce((a, t) => a + t.price * t.cap, 0).toLocaleString("en-IN")} max` : "not selling"],
                ] as Array<[string, string]>
              ).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0", fontSize: 11.5 }}>
                  <span style={{ color: "var(--sub)" }}>{k}</span>
                  <b style={{ textAlign: "right", color: v === "missing" ? "#F87171" : "var(--text)" }}>{v}</b>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setConfirm(null)} style={{ flex: 1, textAlign: "center", padding: 13, borderRadius: 999, background: "var(--card)", border: "1px solid var(--el)", fontWeight: 700, fontSize: 13, cursor: "pointer", color: "var(--text)", fontFamily: "inherit" }}>
                Cancel
              </button>
              <button type="button" disabled={busy} onClick={() => void submit(confirm === "publish")} style={{ flex: 1.3, textAlign: "center", padding: 13, borderRadius: 999, background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 13.5, cursor: busy ? "wait" : "pointer", border: "none", fontFamily: "inherit" }}>
                {confirm === "publish" ? "Confirm & publish" : "Confirm & save draft"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div style={{ position: "fixed", bottom: 40, left: "50%", transform: "translateX(-50%)", background: "var(--el)", border: `1.5px solid ${col}`, color: "var(--text)", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, maxWidth: 380, textAlign: "center", zIndex: 650 }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}
