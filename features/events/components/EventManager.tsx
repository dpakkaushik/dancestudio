"use client";

import Link from "next/link";
import { photoUrl } from "@/lib/media/photo";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { PassSheet } from "@/features/classes/components/PassSheet";
import { DOS_SLEEVE, DosPosterSleeve, dosPosterAuto, useDosFold } from "@/features/classes/components/poster";
import { PhotoPicker } from "@/features/media/components/PhotoPicker";
import { dosKey } from "@/features/classes/components/ShareSheet";
import { addWalkInAction, checkInEventBookingAction } from "@/features/events/server-actions/events";
import { ScanSheet, type ScanOutcome } from "@/features/people/components/ScanSheet";
import { DOS_DISPLAY, DOS_UI, GOLD } from "@/lib/design/tokens";
import {
  EVENT_CRITERIA,
  EV_TINT,
  FORMAT_WORD,
  TYPE_LABEL,
  entryCapacityOf,
  seatCapacityOf,
  seatsSoldOf,
  type DanceEvent,
  type EntryFormat,
  type EventBooking,
} from "@/types/event";
import { EvFormatIcon, eventTimeWords, eventWhen } from "./event-kit";

/** The event manager, lifted from prototype S_eventmanage (13946-14520): the same
 *  poster sleeve the booking page stands the artwork on, the segment bar, and
 *  three segments — DETAILS FIRST ("you come to a manager to check a fact far
 *  more often than to tick somebody in": the tiles, the two bars, the prize
 *  money, the venue, EVENT DETAILS), PARTICIPANTS (ADD A PARTICIPANT / ADD A
 *  PERFORMER, REGISTRATIONS with a count per format, a row per entry with
 *  Check in / In) and SPECTATORS (gate sales while seats remain, TICKETS with
 *  what each tier took, the GATE LIST). Every write is an RPC: check-in and
 *  walk-ins are the organiser's members' alone.
 *
 *  Not drawn, tracked in the backlog: Line-up / Bracket / Rounds / Judges /
 *  Earnings / Refunds / Setup (no rows behind them yet), the QR scanner and
 *  "New user" arms of the add panel (the walk-in is typed), the rules
 *  textarea (no column — ABOUT is printed instead) and the poster upload. */

const DOS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
const BLUE = "#3B82F6";

/* bizCard / bizBtn (2918-2920) */
const bizCard: React.CSSProperties = { background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 16, padding: "13px 14px", marginBottom: 10 };
const bizBtn: React.CSSProperties = { textAlign: "center", padding: "13px", borderRadius: 999, background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 13.5, cursor: "pointer", marginBottom: 10, WebkitTapHighlightColor: "transparent", border: "none", fontFamily: "inherit", width: "100%" };
const micro: React.CSSProperties = { fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: "var(--muted)", fontFamily: DOS_UI };

const initialsOf = (name: string) =>
  String(name || "")
    .split(" ")
    .map((x) => x[0])
    .join("")
    .slice(0, 2);

/* the page's own host, read the sanctioned way */
const subscribeNever = () => () => {};
const readHost = () => window.location.host;
const readServerHost = () => "";

/* DCardBiz (11616): the coloured left edge */
function Card({ children, c, col }: { children: ReactNode; c?: string; col: string }) {
  return <div style={{ ...bizCard, borderLeft: `4px solid ${c ?? col}` }}>{children}</div>;
}

/* AttendeeRow (13888-13902): the person, what they hold, and the one toggle */
function AttendeeRow({ name, meta, inState, onToggle, tint, busy }: { name: string; meta: string; inState: boolean; onToggle: () => void; tint: string; busy: boolean }) {
  return (
    <div style={{ ...bizCard, display: "flex", alignItems: "center", gap: 11, padding: "11px 13px", opacity: busy ? 0.55 : 1 }}>
      <div style={{ width: 34, height: 34, borderRadius: 11, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: inState ? `linear-gradient(135deg,${tint},#7C3AED)` : "var(--el)", color: inState ? "#fff" : "var(--sub)", fontSize: 12, fontWeight: 900 }}>
        {initialsOf(name)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
        <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 1 }}>
          {meta || "registered"}
          {inState ? " · checked in" : ""}
        </div>
      </div>
      {inState ? (
        <span role="button" tabIndex={0} onKeyDown={dosKey} aria-label={`Check out ${name}`} onClick={onToggle} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 800, padding: "6px 11px", borderRadius: 999, background: "rgba(34,197,94,.22)", color: "#22C55E", cursor: "pointer", flexShrink: 0 }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="3.4" strokeLinecap="round" aria-hidden="true">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
          In
        </span>
      ) : (
        <span role="button" tabIndex={0} onKeyDown={dosKey} aria-label={`Check in ${name}`} onClick={onToggle} style={{ fontSize: 10, fontWeight: 800, padding: "6px 11px", borderRadius: 999, background: "var(--el)", color: "var(--text)", cursor: "pointer", flexShrink: 0 }}>
          Check in
        </span>
      )}
    </div>
  );
}

const F: Array<[EntryFormat, string]> = [
  ["solo", "Solo"],
  ["duo", "Duet"],
  ["crew", "Crew"],
];

export interface EventManagerProps {
  tenantId: string;
  event: DanceEvent;
  /** live bookings, both sides — RLS admits the organiser's members */
  bookings: EventBooking[];
  /** owner or trainer — may edit; every member runs the door */
  canRun: boolean;
  todayKey: string;
}

export function EventManager({ tenantId, event: ev, bookings, canRun, todayKey }: EventManagerProps) {
  const router = useRouter();
  const cat = ev.cat;
  const col = EV_TINT[cat];
  const isShow = cat === "showcase";
  const CRIT = EVENT_CRITERIA[cat] ?? [];
  const tick = ev.ticketsOn && ev.ticketTiers.length > 0;
  const heroGone = useDosFold(DOS_SLEEVE);
  const host = useSyncExternalStore(subscribeNever, readHost, readServerHost);
  const [toast, setToast] = useState<string | null>(null);
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };
  type Seg = "details" | "people" | "aud";
  const SEGS: Array<[Seg, string]> = [["details", "Details"], ["people", "Participants"], ...(tick ? ([["aud", "Spectators"]] as Array<[Seg, string]>) : [])];
  const [seg, setSeg] = useState<Seg>("details");
  const [opPending, setOpPending] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  /* the register's own scanner (28 Sep 2026) — see `scanCheckIn` */
  const [scanOpen, setScanOpen] = useState(false);
  /** ⚠ WHO THIS SHEET HAS ALREADY CHECKED IN — `bookings` is a PROP and only
   *  moves when `router.refresh()` lands, which a door scanning two codes in a
   *  second beats. Found by driving the class register's twin; the same race
   *  lives here, and the same set settles it. */
  const scannedIn = useRef<Set<string>>(new Set());
  /* the add panels' own fields (WalkIn 13904) */
  const [wq, setWq] = useState("");
  const [wFmt, setWFmt] = useState<EntryFormat>(ev.entryTiers[0]?.format ?? "solo");
  const [aq, setAq] = useState("");

  const participants = bookings.filter((b) => b.kind === "participant");
  const audience = bookings.filter((b) => b.kind === "spectator");
  const sold = seatsSoldOf(ev);
  const cap = seatCapacityOf(ev);
  const entryCap = entryCapacityOf(ev);
  const gross = audience.reduce((a, b) => a + b.amountInr, 0);
  const aIn = audience.filter((b) => b.checkedInAt).reduce((a, b) => a + b.qty, 0);
  const aAll = audience.reduce((a, b) => a + b.qty, 0);
  const counts = F.map(([k, l]) => [k, l, participants.filter((p) => p.entryFormat === k).length] as [EntryFormat, string, number]).filter((x) => x[2] > 0);
  const prizePool = ev.prizes.reduce((a, x) => a + (x || 0), 0);
  const isLive = ev.status === "published" && ev.startDate <= todayKey && todayKey <= ev.endDate;
  const posterItem = { title: ev.title, style: ev.style, styleColor: col, posterUrl: photoUrl(ev.posterPath) };
  const posterK = ev.poster && ev.poster !== "none" ? ev.poster : dosPosterAuto(ev.title);
  const pass = { code: `${host || ""}/e/${ev.shareSlug}`, label: "Booking link", note: ev.status === "published" ? "Anyone who scans this can book your event." : "A draft — publish it before handing this out." };

  const toggle = async (b: EventBooking) => {
    if (opPending) return;
    setOpPending(b.id);
    const on = !b.checkedInAt;
    const out = await checkInEventBookingAction({ tenantId, bookingId: b.id, on });
    setOpPending(null);
    fire(out.error ?? (on ? `${b.name} checked in` : `${b.name} checked out`));
    router.refresh();
  };
  const addParticipant = async () => {
    const nm = wq.trim();
    if (!nm) return fire("Who is it?");
    if (opPending) return;
    setOpPending("walk-p");
    const out = await addWalkInAction({ tenantId, eventId: ev.id, kind: "participant", name: nm, format: wFmt });
    setOpPending(null);
    if (out.error) return fire(out.error);
    setWq("");
    fire(isShow ? `${nm} added to the line-up` : `${nm} added as participant`);
    router.refresh();
  };
  const addSpectator = async (tierId: string, tierName: string, price: number) => {
    const nm = aq.trim();
    if (!nm) return fire("Enter a name");
    if (opPending) return;
    setOpPending("walk-a");
    const out = await addWalkInAction({ tenantId, eventId: ev.id, kind: "spectator", name: nm, ticketTierId: tierId });
    setOpPending(null);
    if (out.error) return fire(out.error);
    setAq("");
    fire(price > 0 ? `✅ ${nm} in · ${tierName} — collect ₹${price} at the gate` : `✅ ${nm} in · ${tierName}`);
    router.refresh();
  };

  /** ⚠⚠ CHECK SOMEBODY IN BY SCANNING THEIR CODE (28 Sep 2026, the other half of
   *  the user's own ask). The confirm step landed with the scan sheet and there
   *  was no scanner on a register anywhere, so "after confirmation only should
   *  check them in" had nowhere to happen. This is the door, and it writes
   *  nothing a row's own toggle could not: `check_in_event_booking` still asks
   *  `is_tenant_member`, so the scan finds the row and never gets past the rule.
   *
   *  ⚠ ONE PERSON CAN HOLD TWO THINGS — a ticket AND an entry — so a scan checks
   *  in every booking of theirs that is not already in, and says how many. The
   *  alternative is asking the door to scan the same code twice.
   *
   *  ⚠ A SCAN IS AN ARRIVAL, NEVER A DEPARTURE: somebody already in is told so
   *  and left in. The row's own toggle is how somebody is checked OUT.
   *
   *  ⚠ A WALK-IN IS NEVER MATCHED, and that is right — `add_event_walk_in`
   *  records a name with `user_id` null, so there is no code to scan. The
   *  refusal points at the panel that CAN record them. */
  const scanCheckIn = async (personId: string): Promise<ScanOutcome> => {
    const theirs = bookings.filter((b) => b.userId === personId);
    if (theirs.length === 0) {
      return { ok: false, message: "Not booked for this event — add them as a walk-in on the register instead." };
    }
    const out = theirs.filter((b) => !b.checkedInAt);
    if (out.length === 0 || scannedIn.current.has(personId)) {
      return { ok: true, message: `${theirs[0].name} was already in` };
    }
    for (const b of out) {
      const res = await checkInEventBookingAction({ tenantId, bookingId: b.id, on: true });
      if (res.error) {
        return { ok: false, message: res.error };
      }
    }
    scannedIn.current.add(personId);
    router.refresh();
    const what = out.length > 1 ? ` · ${out.length} bookings` : out[0].kind === "spectator" ? " · ticket" : " · entry";
    return { ok: true, message: `✓ ${out[0].name} checked in${what}` };
  };

  const pill: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, padding: "6px 11px", borderRadius: 999, background: "var(--el)", color: "var(--text)", textDecoration: "none", display: "inline-flex", alignItems: "center", cursor: "pointer", border: "none", fontFamily: "inherit" };

  /** the scan pill, on both registers — one control, two places (28 Sep 2026) */
  const scanPill = (
    <button
      type="button"
      onClick={() => {
        /* cleared on every open — the set is only right for one sitting at the
           door; somebody checked out on their row afterwards must not still read
           as "already in" the next time the sheet is opened */
        scannedIn.current.clear();
        setScanOpen(true);
      }}
      aria-label="Scan a code to check somebody in"
      data-testid="scan-check-in"
      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "11px", marginBottom: 10, borderRadius: 999, border: "1.5px solid var(--el)", background: "var(--card)", color: "var(--text)", fontWeight: 900, fontSize: 12.5, fontFamily: "inherit", cursor: "pointer" }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3.5 8.5v-3a2 2 0 0 1 2-2h3M15.5 3.5h3a2 2 0 0 1 2 2v3M20.5 15.5v3a2 2 0 0 1-2 2h-3M8.5 20.5h-3a2 2 0 0 1-2-2v-3" />
        <path d="M7 12h10" />
      </svg>
      Scan to check in
    </button>
  );

  return (
    <div style={{ background: "var(--bg)", maxWidth: 430, margin: "0 auto", color: "var(--text)", fontFamily: DOS_UI, paddingBottom: 40, minHeight: "100vh" }}>
      {/* BizShell wide (14047): the manager opens with the tool card — the event's colour
          into violet, the title, "{kind} · when · venue" — ABOVE the poster sleeve */}
      <div style={{ margin: "12px 16px 0", borderRadius: 22, padding: "15px 17px 14px", position: "relative", overflow: "hidden", color: "#fff", background: `linear-gradient(135deg,${col},#7C3AED)` }}>
        <div aria-hidden="true" style={{ position: "absolute", right: -28, top: -32, width: 130, height: 130, borderRadius: 65, background: "rgba(255,255,255,.13)" }} />
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, position: "relative" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* the page's own `<h1>` — the chrome no longer prints a drill page's name (28 Sep 2026) */}
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: -0.5, fontFamily: DOS_DISPLAY, lineHeight: 1.18 }}>{ev.title}</h1>
            <div style={{ fontSize: 11, opacity: 0.9, marginTop: 3 }}>
              {TYPE_LABEL[cat]} · {eventWhen(ev.startDate, ev.endDate)} · {ev.venue}
            </div>
          </div>
          {isLive ? <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 900, letterSpacing: 0.5, padding: "4px 10px", borderRadius: 999, background: "#22C55E", color: "#fff" }}>● LIVE</span> : null}
        </div>
      </div>

      {/* THE POSTER, THE WAY A BOOKING PAGE SHOWS IT (13998-14015) */}
      <div style={{ marginTop: 12 }}>
        <DosPosterSleeve item={posterItem} design={posterK} col={col} heroGone={heroGone} label={`Poster for ${ev.title}`} onOpen={() => setLinkOpen(true)} />
      </div>

      <div style={{ position: "relative", zIndex: 1, background: "var(--bg)", padding: "12px 16px 0" }}>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
          {canRun && ev.status !== "completed" ? (
            <Link href={`/business/${tenantId}/events/${ev.id}/edit`} style={pill}>
              Edit
            </Link>
          ) : null}
          <Link href={`/e/${ev.shareSlug}`} style={pill}>
            Open page
          </Link>
          <Link href={`/business/${tenantId}/events`} style={pill}>
            All events ›
          </Link>
        </div>

        <div style={{ display: "flex", gap: 2, background: "var(--el)", borderRadius: 12, padding: 3, marginBottom: 12 }}>
          {SEGS.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={seg === k} onClick={() => setSeg(k)} style={{ flex: 1, textAlign: "center", padding: "8px 2px", borderRadius: 9, cursor: "pointer", fontSize: 10.5, fontWeight: 800, border: "none", fontFamily: "inherit", background: seg === k ? "var(--solid)" : "transparent", color: seg === k ? "var(--text)" : "var(--sub)", boxShadow: seg === k ? "0 1px 4px rgba(0,0,0,.3)" : "none" }}>
              {l}
            </button>
          ))}
        </div>

        {/* ───────── DETAILS (14026-14118) ───────── */}
        {seg === "details" ? (
          <>
            {/* HOW FULL IT IS, NOT WHAT IT TOOK */}
            <Card col={col}>
              <div style={{ display: "flex", gap: 8 }}>
                {(
                  [
                    [`${participants.length}${entryCap ? `/${entryCap}` : ""}`, isShow ? "Performers" : "Entries", col],
                    ...(tick ? [[`${sold}/${cap}`, "Tickets", BLUE]] : []),
                    [ev.status === "published" ? "Published" : ev.status === "draft" ? "Draft" : "Completed", "Status", GOLD],
                  ] as Array<[string, string, string]>
                ).map(([v, l, c]) => (
                  <div key={l} style={{ flex: 1, textAlign: "center", background: "var(--el)", borderRadius: 12, padding: "9px 3px", borderTop: `3px solid ${c}` }}>
                    <div style={{ fontSize: 13, fontWeight: 900 }}>{v}</div>
                    <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", color: "var(--sub)", marginTop: 2 }}>{l}</div>
                  </div>
                ))}
              </div>
              {/* the two bars: who is coming to dance, and who is coming to watch */}
              <div style={{ marginTop: 12, paddingTop: 11, borderTop: "1.5px solid var(--el)" }}>
                {(
                  [
                    [isShow ? "Performers" : "Participants", participants.length, entryCap, col],
                    ...(tick ? [["Spectators", sold, cap, BLUE]] : []),
                  ] as Array<[string, number, number, string]>
                ).map(([l, now, max, c]) => {
                  const pct = max ? Math.min(100, Math.round((100 * now) / max)) : 0;
                  return (
                    <div key={l} style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 5 }}>
                        <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.5, color: "var(--muted)", textTransform: "uppercase" }}>{l}</span>
                        <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 900, fontFamily: DOS_MONO, color: pct >= 100 ? "#F87171" : "var(--text)" }}>
                          {now}
                          {max ? <span style={{ color: "var(--muted)", fontWeight: 700 }}> / {max}</span> : null}
                        </span>
                        {max ? <span style={{ fontSize: 9.5, fontWeight: 800, color: pct >= 100 ? "#F87171" : pct >= 80 ? GOLD : "var(--sub)" }}>{pct >= 100 ? "full" : `${Math.max(0, max - now)} left`}</span> : <span style={{ fontSize: 9.5, fontWeight: 800, color: "var(--sub)" }}>no limit</span>}
                      </div>
                      <div style={{ height: 7, borderRadius: 4, background: "var(--el)", overflow: "hidden" }}>
                        <div style={{ height: 7, borderRadius: 4, width: `${max ? pct : 0}%`, background: c, transition: "width .3s" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* AND WHAT IS ON THE TABLE */}
              {prizePool > 0 ? (
                <div style={{ marginTop: 11, paddingTop: 11, borderTop: "1.5px solid var(--el)" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.5, color: "var(--muted)", textTransform: "uppercase" }}>Prize money</span>
                    <span style={{ marginLeft: "auto", fontSize: 15, fontWeight: 900, fontFamily: DOS_DISPLAY, color: GOLD }}>₹{prizePool.toLocaleString("en-IN")}</span>
                  </div>
                  <div style={{ display: "flex", gap: 7 }}>
                    {ev.prizes.map((amt, pi) =>
                      amt > 0 ? (
                        <div key={pi} style={{ flex: 1, textAlign: "center", background: pi === 0 ? "rgba(245,158,11,.14)" : "var(--el)", border: `1.5px solid ${pi === 0 ? "rgba(245,158,11,.45)" : "transparent"}`, borderRadius: 12, padding: "9px 3px" }}>
                          <div style={{ fontSize: 13, fontWeight: 900, fontFamily: DOS_MONO, color: pi === 0 ? GOLD : "var(--text)" }}>₹{amt.toLocaleString("en-IN")}</div>
                          <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", color: "var(--sub)", marginTop: 2 }}>{["1st", "2nd", "3rd"][pi] ?? `${pi + 1}th`}</div>
                        </div>
                      ) : null
                    )}
                  </div>
                </div>
              ) : null}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 11, paddingTop: 11, borderTop: "1.5px solid var(--el)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true">
                  <path d="M12 21s-6.5-5.7-6.5-10A6.5 6.5 0 0 1 12 4.5 6.5 6.5 0 0 1 18.5 11c0 4.3-6.5 10-6.5 10z" />
                  <circle cx="12" cy="10.8" r="2.3" />
                </svg>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800 }}>{ev.venue}</div>
                  <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 1, lineHeight: 1.45 }}>{ev.address ?? ev.city}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 3 }}>
                    {eventWhen(ev.startDate, ev.endDate)} · {eventTimeWords(ev.startTime)}
                  </div>
                </div>
                <a href={ev.mapsUrl} target="_blank" rel="noopener noreferrer" aria-label="Open the venue in Maps" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 800, color: col, textDecoration: "none", flexShrink: 0 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                    <path d="M7 17 17 7M9 7h8v8" />
                  </svg>
                  Maps
                </a>
              </div>
            </Card>
            {/* THE POSTER, UPLOADED (27 Sep 2026) — the same control the class
                page's poster sheet carries, on the one screen that is this
                event's own. Take it down and the drawn sleeve comes back. */}
            <Card col={col}>
              <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.2, color: "var(--sub)", marginBottom: 8 }}>POSTER</div>
              <PhotoPicker
                owner={{ kind: "poster", id: ev.tenantId, subject: { kind: "event", id: ev.id } }}
                hasPhoto={Boolean(ev.posterPath)}
                label={ev.posterPath ? "Change the picture" : "Upload a picture"}
                cropLabel="Poster"
                compact
              />
            </Card>
            <Card col={col}>
              <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.2, color: "var(--sub)", marginBottom: 8 }}>EVENT DETAILS</div>
              {(
                [
                  ["Type", TYPE_LABEL[cat]],
                  ["Dates", eventWhen(ev.startDate, ev.endDate)],
                  ["Time", eventTimeWords(ev.startTime)],
                  ["Venue", ev.venue],
                  ["Address", ev.address ?? "—"],
                  ["City", ev.city],
                  ["Entry", isShow ? "line-up built by you" : ev.entryTiers.length === 3 ? "All formats" : ev.entryTiers.map((t) => FORMAT_WORD[t.format]).join(" / ") || "—"],
                  ["Styles", ev.style || "—"],
                  ["Organiser", ev.tenantName],
                  /* who is deciding it (14158) — a fact a page about an event owes you, even when the honest answer is nobody yet */
                  ["Judges", isShow ? "None — showcase" : "none confirmed yet"],
                  ["Scoring", CRIT.length ? CRIT.join(" · ") : "—"],
                ] as Array<[string, string]>
              ).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", fontSize: 12.5 }}>
                  <span style={{ color: "var(--sub)" }}>{k}</span>
                  <b style={{ textAlign: "right", minWidth: 0 }}>{v}</b>
                </div>
              ))}
            </Card>
            {/* THE RULES BELONG TO THE EVENT — what the organiser wrote is printed here */}
            {ev.about ? (
              <div style={bizCard}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={micro}>WHAT PEOPLE ARE TOLD</span>
                  <span style={{ marginLeft: "auto", fontSize: 9.5, fontWeight: 800, color: "var(--sub)" }}>participants and spectators can read this</span>
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--sub)", whiteSpace: "pre-wrap" }}>{ev.about}</div>
              </div>
            ) : null}
            <button type="button" onClick={() => setLinkOpen(true)} style={bizBtn}>
              Get booking link
            </button>
          </>
        ) : null}

        {/* ───────── PARTICIPANTS (14199-14290) ───────── */}
        {seg === "people" ? (
          <>
            {/* A PERFORMER IS NOT A WALK-IN: a showcase's added performer is not checked in */}
            <div style={{ ...bizCard, borderLeft: "4px solid #22C55E" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
                <span style={micro}>{isShow ? "ADD A PERFORMER" : "ADD A PARTICIPANT"}</span>
                <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 800, color: "var(--sub)" }}>{isShow ? "to the line-up" : "on the spot"}</span>
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 9 }}>
                {F.map(([k, l]) => {
                  const on = wFmt === k;
                  return (
                    <button key={k} type="button" aria-pressed={on} aria-label={`${l} entry`} onClick={() => setWFmt(k)} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 6px", borderRadius: 999, cursor: "pointer", fontSize: 10.5, fontWeight: 800, border: `1.5px solid ${on ? col : "var(--el)"}`, background: on ? `${col}18` : "var(--card)", color: on ? col : "var(--sub)", fontFamily: "inherit" }}>
                      <EvFormatIcon fmt={k} size={12} />
                      {l}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--el)", borderRadius: 11, padding: "9px 11px" }}>
                <input value={wq} aria-label={isShow ? "Performer name" : "Participant name"} onChange={(e) => setWq(e.target.value.slice(0, 80))} onKeyDown={(e) => e.key === "Enter" && void addParticipant()} placeholder={isShow ? "Who is performing?" : "Name…"} style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: "var(--text)", fontSize: 12.5, fontFamily: "inherit" }} />
                <button type="button" aria-label={isShow ? "Add performer" : "Add participant"} disabled={opPending === "walk-p"} onClick={() => void addParticipant()} style={{ padding: "7px 13px", borderRadius: 999, background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 11.5, cursor: "pointer", border: "none", fontFamily: "inherit", flexShrink: 0 }}>
                  Add
                </button>
              </div>
            </div>
            {participants.length > 0 ? scanPill : null}
            {/* WHICH KIND OF ENTRY: a count per format above the list */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "2px 0 6px" }}>
              <span style={micro}>
                {isShow ? "PERFORMERS" : "REGISTRATIONS"} · {participants.length}
              </span>
              {counts.length > 1 ? (
                <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6, flexShrink: 0 }}>
                  {counts.map(([k, l, n]) => (
                    <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: "var(--el)", color: "var(--sub)" }}>
                      <EvFormatIcon fmt={k} size={11} />
                      {l} {n}
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
            {participants.map((p) => {
              const f = p.entryFormat ?? "solo";
              const FL = FORMAT_WORD[f];
              /* Step 22: a crew entry names its leader; a duet's partner is asked, and the row says where that stands (1815: "awaiting partner" is what the ORGANISER sees) */
              const extra =
                f === "crew"
                  ? p.userId
                    ? "entered by its leader"
                    : ""
                  : f === "duo" && p.partnerName
                    ? `with ${p.partnerName}${p.partnerStatus === "asked" ? " · awaiting partner" : p.partnerStatus === "rejected" ? " · partner declined" : ""}`
                    : "";
              const reg = p.userId ? (p.amountInr > 0 ? `paid ₹${p.amountInr}` : "registered") : isShow ? "added by you" : "walk-in";
              const meta = [`${FL} entry`, extra, reg].filter(Boolean).join(" · ");
              return <AttendeeRow key={p.id} name={p.name} meta={meta} inState={Boolean(p.checkedInAt)} tint={col} busy={opPending === p.id} onToggle={() => void toggle(p)} />;
            })}
            {participants.length === 0 ? <div style={{ ...bizCard, textAlign: "center", fontSize: 11.5, color: "var(--sub)", border: "1.5px dashed var(--el)" }}>{isShow ? "No performers yet — add them above." : "No registrations yet — share the link so competitors can sign up."}</div> : null}
          </>
        ) : null}

        {/* ───────── SPECTATORS (14293-14340) ───────── */}
        {seg === "aud" ? (
          <>
            {cap > 0 && sold >= cap ? (
              <div style={{ ...bizCard, borderLeft: "4px solid #EF4444", display: "flex", alignItems: "center", gap: 10 }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="1.9" strokeLinecap="round" style={{ flexShrink: 0 }} aria-hidden="true">
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="m8.5 8.5 7 7M15.5 8.5l-7 7" />
                </svg>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 900, color: "#F87171" }}>Event full</div>
                  <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 1 }}>All {cap} tickets are sold — gate sales are closed.</div>
                </div>
              </div>
            ) : (
              <div style={{ ...bizCard, borderLeft: "4px solid #22C55E" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
                  <span style={micro}>ADD A SPECTATOR</span>
                  <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 800, color: "var(--sub)" }}>gate sales</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--el)", borderRadius: 11, padding: "9px 11px", marginBottom: 8 }}>
                  <input value={aq} aria-label="Spectator name" onChange={(e) => setAq(e.target.value.slice(0, 80))} placeholder="Name or mobile number…" style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: "var(--text)", fontSize: 12.5, fontFamily: "inherit" }} />
                </div>
                {/* WALK-IN SPECTATORS · sells at the gate (14322-14330): pick the tier they sit in */}
                {ev.ticketTiers.map((t) => {
                  const left = Math.max(0, t.capacity - t.sold);
                  return (
                    <button key={t.id} type="button" aria-label={`Seat them in ${t.name}`} disabled={left === 0 || opPending === "walk-a"} onClick={() => void addSpectator(t.id, t.name, t.priceInr)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", boxSizing: "border-box", padding: "9px 10px", borderRadius: 12, background: "var(--el)", marginBottom: 7, cursor: left === 0 ? "default" : "pointer", opacity: left === 0 ? 0.5 : 1, border: "none", fontFamily: "inherit", color: "var(--text)" }}>
                      <span style={{ flex: 1, textAlign: "left", fontSize: 12.5, fontWeight: 800 }}>
                        {t.name}
                        <span style={{ display: "block", fontSize: 9.5, color: "var(--sub)", fontWeight: 700, marginTop: 1 }}>{left === 0 ? "sold out" : `${left} left`}</span>
                      </span>
                      <b style={{ fontSize: 12.5, color: col }}>{t.priceInr > 0 ? `Sell ₹${t.priceInr}` : "Seat · free"}</b>
                    </button>
                  );
                })}
              </div>
            )}
            <div style={{ ...micro, margin: "2px 0 6px" }}>TICKETS · ₹{gross.toLocaleString("en-IN")} collected</div>
            {ev.ticketTiers.map((t) => (
              <div key={t.id} style={{ ...bizCard, padding: "11px 13px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>{t.name}</div>
                    <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 1 }}>
                      {t.priceInr === 0 ? "Free" : `₹${t.priceInr}`} · {t.sold}/{t.capacity} sold
                    </div>
                  </div>
                  <b style={{ fontSize: 13, color: col }}>₹{audience.filter((b) => b.ticketTierId === t.id).reduce((a, b) => a + b.amountInr, 0).toLocaleString("en-IN")}</b>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: "var(--el)", marginTop: 8 }}>
                  <div style={{ height: 5, borderRadius: 3, width: `${Math.round((100 * t.sold) / Math.max(1, t.capacity))}%`, background: col }} />
                </div>
              </div>
            ))}
            <div style={{ ...micro, margin: "12px 0 6px" }}>
              GATE LIST · {aIn}/{aAll} arrived
            </div>
            {audience.length > 0 ? scanPill : null}
            {audience.map((b) => (
              <AttendeeRow key={b.id} name={b.name} meta={`${b.ticketTierName ?? "Ticket"}${b.qty > 1 ? ` × ${b.qty}` : ""} · ${b.userId ? (b.amountInr > 0 ? `paid ₹${b.amountInr}` : "booked free") : "walk-in · at the gate"}`} inState={Boolean(b.checkedInAt)} tint={BLUE} busy={opPending === b.id} onToggle={() => void toggle(b)} />
            ))}
            {audience.length === 0 ? <div style={{ ...bizCard, textAlign: "center", fontSize: 11.5, color: "var(--sub)", border: "1.5px dashed var(--el)" }}>No ticket bookings yet.</div> : null}
          </>
        ) : null}
      </div>

      {linkOpen ? <PassSheet posterItem={posterItem} posterK={posterK} col={col} title={ev.title} styleName={ev.style} levelWord={TYPE_LABEL[cat]} pass={pass} slug={ev.shareSlug} path="e" ariaLabel="Event pass" fire={fire} onClose={() => setLinkOpen(false)} /> : null}

      {/* the door's scanner — the sheet resolves the code and shows WHO it found,
          and `scanCheckIn` decides what that person holds on this event */}
      {scanOpen ? <ScanSheet heading="Check somebody in" confirmLabel="Check in" onCode={scanCheckIn} onClose={() => setScanOpen(false)} /> : null}

      {toast ? (
        <div role="status" aria-live="polite" style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", background: "var(--solid)", border: "1.5px solid #0EA5E9", boxShadow: "0 6px 24px rgba(0,0,0,.45)", color: "var(--text)", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, maxWidth: 360, textAlign: "center", zIndex: 650 }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}
